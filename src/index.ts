import { Client, LocalAuth, Message } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import express from "express";
import dotenv from "dotenv";
import readline from "readline";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

// Set up readline interface for command line input (Pairing Code)
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

// Initialize WhatsApp Client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  },
});

let usePairingCode = false;
let phoneNumberInput = "";
let pairingCodeRequested = false;

// Authenticate with QR Code
client.on("qr", async (qr) => {
  if (usePairingCode && !pairingCodeRequested) {
    pairingCodeRequested = true;
    try {
      const code = await client.requestPairingCode(phoneNumberInput);
      console.log(`\n📱 PAIRING CODE: ${code}`);
      console.log("Enter this code on your WhatsApp app to link devices.");
    } catch (err) {
      console.error("Error requesting pairing code:", err);
    }
  } else if (!usePairingCode) {
    console.log("\nScan this QR code in WhatsApp to log in:");
    qrcode.generate(qr, { small: true });

    console.log("\n--- OR ---");
    console.log("If QR code is not showing or you want to use Phone Number:");
    console.log(
      "Press Ctrl+C, then restart and follow instructions to use Pairing Code if implemented.",
    );
  }
});

client.on("ready", () => {
  console.log("🔥 Bot is READY!");
  console.log("Listening for messages...");
});

client.on("authenticated", () => {
  console.log("✅ Authenticated successfully!");
});

client.on("auth_failure", (msg) => {
  console.error("❌ Authentication failure", msg);
});

// Storage untuk menyimpan pesan di memori server (sementara)
const messagesStorage: any[] = [];

// 1. Membaca chat masuk dan melihat nomor pengirim
client.on("message", async (message: Message) => {
  // Ignore messages from the bot itself or status broadcasts
  if (message.fromMe || message.from === "status@broadcast") return;

  const contact = await message.getContact();
  const chat = await message.getChat();
  const senderNumber = contact.number;
  const senderName = contact.pushname || contact.name || "Unknown";
  
  const incomingMsg = {
    id: message.id._serialized,
    senderNumber: senderNumber,
    senderName: senderName,
    message: message.body,
    timestamp: message.timestamp,
    isGroup: chat.isGroup,
    chatName: chat.name
  };

  messagesStorage.push(incomingMsg);

  console.log(`\n📩 New Message Received!`);
  console.log(`From: ${senderName} (${senderNumber}) in ${chat.isGroup ? 'Group: ' + chat.name : 'Private Chat'}`);
  console.log(`Message: ${message.body}`);

  // Command to test bot responsiveness
  if (message.body === "!ping") {
    const replyText = `Pong! Hello ${senderName}, your number is ${senderNumber}.`;
    await message.reply(replyText);
    console.log(`Replied to ${senderNumber} with: ${replyText}`);
  }
});

// Express API endpoints
app.get("/", (req, res) => {
  res.send("WhatsApp Bot API is running.");
});

// 2. Mengambil pesan masuk (semua pesan)
app.get("/api/messages", (req, res) => {
  res.status(200).json({
    success: true,
    data: messagesStorage
  });
});

// 3. Mengambil semua chat pribadi
app.get("/api/messages/private", (req, res) => {
  const privateMessages = messagesStorage.filter((msg) => !msg.isGroup);
  res.status(200).json({
    success: true,
    data: privateMessages
  });
});

// 4. Mengambil semua chat grup
app.get("/api/messages/group", (req, res) => {
  const groupMessages = messagesStorage.filter((msg) => msg.isGroup);
  res.status(200).json({
    success: true,
    data: groupMessages
  });
});

// 5. Mengambil pesan masuk berdasarkan nomor tertentu
app.get("/api/messages/:number", (req, res) => {
  // :number harus lengkap dengan kode negara. misal 62812...
  let searchNumber = req.params.number;
  searchNumber = searchNumber.replace("+", "");

  const filteredMessages = messagesStorage.filter(
    (msg) => msg.senderNumber === searchNumber || msg.senderNumber === searchNumber + "@c.us"
  );

  res.status(200).json({
    success: true,
    data: filteredMessages
  });
});

// 4. Mengirim chat ke nomor tertentu via API
app.post("/api/send-message", async (req, res) => {
  const { number, message } = req.body;

  if (!number || !message) {
    return res
      .status(400)
      .json({ error: "Number and message are required in the request body." });
  }

  try {
    // Format the number properly (country code + number + @c.us)
    // Example: 628123456789 -> 628123456789@c.us
    let formattedNumber = number;
    if (!formattedNumber.endsWith("@c.us")) {
      formattedNumber = `${formattedNumber}@c.us`;
    }

    // Remove '+' if the user includes it
    formattedNumber = formattedNumber.replace("+", "");

    const isRegistered = await client.isRegisteredUser(formattedNumber);

    if (!isRegistered) {
      return res
        .status(404)
        .json({ error: "The provided number is not registered on WhatsApp." });
    }

    await client.sendMessage(formattedNumber, message);
    console.log(`\n📤 Sent API message to ${formattedNumber}: ${message}`);

    res
      .status(200)
      .json({ success: true, message: "Message sent successfully." });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Failed to send message." });
  }
});

const startBot = async () => {
  console.log("Starting WhatsApp Bot...");

  const answer = await question(
    "Do you want to login with Phone Number / Pairing Code? (y/N): ",
  );
  usePairingCode = answer.toLowerCase() === "y";

  if (usePairingCode) {
    phoneNumberInput = await question(
      "Enter your phone number with country code (e.g. 62812...): ",
    );

    client.initialize();
  } else {
    console.log("Using QR Code authentication...");
    client.initialize();
  }
};

app.listen(port, () => {
  console.log(`🌐 Server API running at http://localhost:${port}`);
  startBot();
});
