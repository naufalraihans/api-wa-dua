const wa = require('../whatsapp/client');

// POST /session/start — Login via pairing code
const startSession = async (req, res) => {
  try {
    if (wa.getConnectionStatus()) {
      return res.json({ status: 'connected', message: 'WhatsApp sudah terkoneksi' });
    }

    const phone = req.body.phone || req.query.phone;
    if (!phone) {
      return res.status(400).json({ 
        error: 'Nomor telepon dibutuhkan',
        example: 'POST /session/start dengan body: { "phone": "081234567890" }'
      });
    }

    await wa.connectToWhatsApp(phone);

    // Tunggu pairing code di-generate
    await new Promise(r => setTimeout(r, 3500));

    const code = wa.getPairingCode();
    if (code) {
      return res.json({ 
        pairingCode: code,
        message: 'Masukkan kode ini di WhatsApp HP kamu: Settings > Linked Devices > Link a Device > Link with phone number'
      });
    }

    if (wa.getConnectionStatus()) {
      return res.json({ status: 'connected', message: 'WhatsApp sudah terkoneksi' });
    }

    return res.json({ message: 'Sedang memproses. Coba hit endpoint ini lagi.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal start session: ' + err.message });
  }
};

// GET /session/status
const getStatus = (req, res) => {
  res.json({ connected: wa.getConnectionStatus() });
};

// POST /session/logout
const logoutSession = async (req, res) => {
  try {
    await wa.logout();
    res.json({ status: 'logged_out', message: 'Session dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/messages — Semua pesan
const getAllMessages = (req, res) => {
  res.status(200).json({
    success: true,
    data: wa.getMessages()
  });
};

// GET /api/messages/private — Pesan pribadi saja
const getPrivateMessages = (req, res) => {
  res.status(200).json({
    success: true,
    data: wa.getPrivateMessages()
  });
};

// GET /api/messages/group — Pesan grup saja
const getGroupMessages = (req, res) => {
  res.status(200).json({
    success: true,
    data: wa.getGroupMessages()
  });
};

// GET /api/messages/:number — Pesan dari nomor tertentu
const getMessagesByNumber = (req, res) => {
  let searchNumber = req.params.number;
  res.status(200).json({
    success: true,
    data: wa.getMessagesByNumber(searchNumber)
  });
};

// POST /api/send-message — Kirim pesan
const sendMessage = async (req, res) => {
  const { number, message } = req.body;

  if (!number || !message) {
    return res.status(400).json({ 
      error: 'Number and message are required in the request body.' 
    });
  }

  try {
    await wa.sendMessage(number, message);
    console.log(`\n📤 Sent API message to ${number}: ${message}`);
    res.status(200).json({ 
      success: true, 
      message: 'Message sent successfully.' 
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message || 'Failed to send message.' });
  }
};

// GET /api/contacts — Daftar kontak yang sudah tersinkronisasi
const getContacts = (req, res) => {
  res.status(200).json({
    success: true,
    data: wa.getContacts()
  });
};

module.exports = { 
  startSession, 
  getStatus, 
  logoutSession, 
  getAllMessages, 
  getPrivateMessages, 
  getGroupMessages, 
  getMessagesByNumber, 
  sendMessage,
  getContacts,
};
