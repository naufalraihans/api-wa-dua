const fs = require('fs');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const logger = require('../utils/logger');
const config = require('../config');

// ================= STATE =================
let sock = null;
let currentPairingCode = null;
let isConnected = false;
let isReconnecting = false;
let pairingRequested = false;

// Simpan pesan masuk di memory (grouped by sender number)
const messagesStorage = [];
const MAX_MESSAGES = 500;

// Map LID ke nomor telepon (diisi dari contacts saat sync)
const lidToPhone = {};
// Map LID/Phone ke Nama (pushName)
const idToName = {};

// ================= HELPERS =================

function ensureSessionDir() {
  if (!fs.existsSync(config.sessionDir)) {
    fs.mkdirSync(config.sessionDir, { recursive: true });
  }
}

function formatNumber(number) {
  let clean = number.replace(/\D/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.substring(1);
  }
  return clean;
}

/**
 * Extract text content dari berbagai tipe pesan WA
 */
function extractText(msg) {
  if (!msg.message) return null;
  const m = msg.message;

  // Kadang pesan dibungkus dalam protocolMessage/ephemeralMessage
  const inner = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m;

  return (
    inner.conversation ||
    inner.extendedTextMessage?.text ||
    inner.imageMessage?.caption ||
    inner.videoMessage?.caption ||
    inner.documentMessage?.caption ||
    inner.buttonsResponseMessage?.selectedDisplayText ||
    inner.listResponseMessage?.title ||
    inner.templateButtonReplyMessage?.selectedDisplayText ||
    null
  );
}

/**
 * Simpan satu pesan ke storage (format mengikuti struktur API yang sudah ada)
 */
function storeMessage(msg) {
  try {
    const remoteJid = msg.key.remoteJid;
    if (!remoteJid || remoteJid === 'status@broadcast') return;

    let senderNumber;
    let pushName = msg.pushName || 'Unknown';
    const isGroup = remoteJid.endsWith('@g.us');

    if (remoteJid.endsWith('@s.whatsapp.net')) {
      senderNumber = remoteJid.replace('@s.whatsapp.net', '');
    } else if (remoteJid.endsWith('@lid')) {
      const lid = remoteJid.replace('@lid', '');
      senderNumber = lidToPhone[lid] || lid;
    } else if (isGroup) {
      // Untuk grup, ambil nomor dari participant
      const participant = msg.key.participant || msg.participant;
      if (participant) {
        if (participant.endsWith('@s.whatsapp.net')) {
          senderNumber = participant.replace('@s.whatsapp.net', '');
        } else if (participant.endsWith('@lid')) {
          const lid = participant.replace('@lid', '');
          senderNumber = lidToPhone[lid] || lid;
        }
      }
      if (!senderNumber) senderNumber = 'unknown';
    } else {
      return;
    }

    // Simpan mapping nama
    if (pushName !== 'Unknown') {
      idToName[senderNumber] = pushName;
    } else if (idToName[senderNumber]) {
      pushName = idToName[senderNumber];
    }

    const text = extractText(msg);
    if (!text) return;

    const timestamp = typeof msg.messageTimestamp === 'object'
      ? msg.messageTimestamp.low
      : Number(msg.messageTimestamp);

    const entry = {
      id: msg.key.id,
      senderNumber: senderNumber,
      senderName: pushName,
      message: text,
      timestamp: timestamp,
      isGroup: isGroup,
      chatName: isGroup ? (remoteJid.replace('@g.us', '')) : pushName,
      fromMe: msg.key.fromMe || false,
    };

    // Skip duplikat
    if (messagesStorage.some(m => m.id === entry.id)) return;

    messagesStorage.push(entry);

    // Sort & limit
    messagesStorage.sort((a, b) => a.timestamp - b.timestamp);
    if (messagesStorage.length > MAX_MESSAGES) {
      messagesStorage.splice(0, messagesStorage.length - MAX_MESSAGES);
    }

    // Log pesan baru (hanya untuk real-time, bukan history sync)
    if (Date.now() / 1000 - timestamp < 60) {
      const dir = entry.fromMe ? 'SENT' : 'RECV';
      logger.info(`[${dir}] ${pushName} (${senderNumber})${isGroup ? ' [Group]' : ''}: ${text.substring(0, 80)}`);
    }
  } catch (err) {
    // Silent fail
  }
}

// ================= CORE =================

async function connectToWhatsApp(phoneNumber) {
  ensureSessionDir();

  try {
    const { version } = await fetchLatestBaileysVersion();
    logger.info('Connecting with WA v' + version.join('.'));

    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);

    sock = makeWASocket({
      version,
      logger: logger.child({ module: 'baileys' }),
      printQRInTerminal: false,
      auth: state,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      // PENTING: matikan event buffering supaya pesan masuk langsung diproses
      fireInitQueries: false,
    });

    sock.ev.on('creds.update', saveCreds);

    // Langsung process events tanpa buffering
    sock.ev.process(async (events) => {

      // ---- CONNECTION UPDATE ----
      if (events['connection.update']) {
        const { connection, lastDisconnect } = events['connection.update'];

        if (connection === 'close') {
          currentPairingCode = null;
          isConnected = false;
          pairingRequested = false;

          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          logger.info('Connection closed (code: ' + statusCode + '). ' + (shouldReconnect ? 'Reconnecting...' : 'Logged out.'));

          if (shouldReconnect && !isReconnecting) {
            isReconnecting = true;
            setTimeout(() => {
              isReconnecting = false;
              connectToWhatsApp();
            }, 3000);
          } else if (!shouldReconnect) {
            if (fs.existsSync(config.sessionDir)) {
              fs.rmSync(config.sessionDir, { recursive: true, force: true });
            }
          }
        } else if (connection === 'open') {
          currentPairingCode = null;
          isConnected = true;
          isReconnecting = false;
          pairingRequested = false;
          logger.info('🔥 WhatsApp connected!');
        }
      }

      // ---- CREDS UPDATE ----
      if (events['creds.update']) {
        await saveCreds();
      }

      // ---- CONTACTS SYNC (buat mapping LID → nomor telepon) ----
      if (events['contacts.upsert']) {
        const contacts = events['contacts.upsert'];
        for (const contact of contacts) {
          if (contact.lid) {
            const lid = contact.lid.replace('@lid', '');
            const phone = contact.id?.replace('@s.whatsapp.net', '');
            if (phone && !phone.includes('@')) {
              lidToPhone[lid] = phone;
            }
          }
        }
        logger.info('Contacts synced. LID mappings: ' + Object.keys(lidToPhone).length);
      }

      // ---- CONTACTS UPDATE ----
      if (events['contacts.update']) {
        const contacts = events['contacts.update'];
        for (const contact of contacts) {
          if (contact.lid) {
            const lid = contact.lid.replace('@lid', '');
            const phone = contact.id?.replace('@s.whatsapp.net', '');
            if (phone && !phone.includes('@')) {
              lidToPhone[lid] = phone;
            }
          }
        }
      }

      // ---- HISTORY SYNC ----
      if (events['messaging-history.set']) {
        const { messages: historyMessages } = events['messaging-history.set'];
        logger.info('History sync: ' + historyMessages.length + ' messages');
        for (const msg of historyMessages) {
          storeMessage(msg);
        }
        const total = messagesStorage.length;
        logger.info('Total in inbox: ' + total);
      }

      // ---- REAL-TIME MESSAGES ----
      if (events['messages.upsert']) {
        const { messages, type } = events['messages.upsert'];
        for (const msg of messages) {
          storeMessage(msg);

          if (type === 'notify') {
            // Auto-resolve LID dari payload
            const remoteJid = msg.key.remoteJid;
            if (remoteJid?.endsWith('@lid')) {
              const lid = remoteJid.replace('@lid', '');
              let leakedPhone = null;

              if (msg.participant && msg.participant.includes('@s.whatsapp.net')) {
                leakedPhone = msg.participant.replace('@s.whatsapp.net', '');
              } else if (msg.key?.participant && msg.key.participant.includes('@s.whatsapp.net')) {
                leakedPhone = msg.key.participant.replace('@s.whatsapp.net', '');
              }

              if (leakedPhone && !lidToPhone[lid]) {
                lidToPhone[lid] = leakedPhone;
                logger.info('Auto-resolved from payload: ' + lid + ' -> ' + leakedPhone);
              }
            }
          }
        }
      }
    });

    // ---- REQUEST PAIRING CODE ----
    if (phoneNumber && !sock.authState.creds.registered) {
      const cleanPhone = formatNumber(phoneNumber);
      await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        const code = await sock.requestPairingCode(cleanPhone);
        currentPairingCode = code;
        pairingRequested = true;
        logger.info('Pairing code for ' + cleanPhone + ': ' + code);
      } catch (err) {
        logger.error('Failed to request pairing code: ' + err.message);
      }
    }

    return sock;
  } catch (err) {
    logger.error('Connection failed', err);
  }
}

// ================= PUBLIC API =================

function getPairingCode() { return currentPairingCode; }
function getConnectionStatus() { return isConnected; }

function getMessages() {
  return messagesStorage;
}

function getPrivateMessages() {
  return messagesStorage.filter(msg => !msg.isGroup);
}

function getGroupMessages() {
  return messagesStorage.filter(msg => msg.isGroup);
}

function getMessagesByNumber(number) {
  let searchNumber = number.replace('+', '');
  searchNumber = formatNumber(searchNumber);
  return messagesStorage.filter(
    msg => msg.senderNumber === searchNumber || msg.senderNumber === number
  );
}

async function sendMessage(target, message) {
  if (!isConnected || !sock) throw new Error('WhatsApp belum terkoneksi.');

  const cleanTarget = target.toLowerCase();
  let jid = null;
  let resolvedCleanPhone = null;

  // 1. Cek apakah target adalah LID murni
  if (lidToPhone[target]) {
    jid = target + '@lid';
  }
  // 2. Cek apakah target adalah Nama (cari di idToName)
  else {
    for (const [id, name] of Object.entries(idToName)) {
      if (name.toLowerCase().includes(cleanTarget)) {
        if (id.length >= 14 && !id.startsWith('62')) {
          jid = id + '@lid';
        } else {
          jid = id + '@s.whatsapp.net';
          resolvedCleanPhone = id;
        }
        break;
      }
    }
  }

  // 3. Kalau belum nemu, asumsi itu nomor telepon
  if (!jid) {
    resolvedCleanPhone = formatNumber(target);
    if (!resolvedCleanPhone) {
      throw new Error(`Gagal mengirim: target '${target}' tidak ditemukan dan bukan format nomor valid.`);
    }
    jid = resolvedCleanPhone + '@s.whatsapp.net';
  }

  logger.info(`[SENDING] target: '${target}' -> resolved jid: '${jid}'`);
  const result = await sock.sendMessage(jid, { text: message });

  // Tangkap LID mapping dari response
  if (result?.key?.remoteJid?.endsWith('@lid') && resolvedCleanPhone) {
    const lid = result.key.remoteJid.replace('@lid', '');
    lidToPhone[lid] = resolvedCleanPhone;
    logger.info('LID mapped: ' + lid + ' -> ' + resolvedCleanPhone);
  }

  return result;
}

async function logout() {
  if (sock) {
    await sock.logout();
    isConnected = false;
    currentPairingCode = null;
    pairingRequested = false;
  }
  if (fs.existsSync(config.sessionDir)) {
    fs.rmSync(config.sessionDir, { recursive: true, force: true });
  }
}

module.exports = {
  connectToWhatsApp,
  getPairingCode,
  getConnectionStatus,
  sendMessage,
  getMessages,
  getPrivateMessages,
  getGroupMessages,
  getMessagesByNumber,
  logout,
};
