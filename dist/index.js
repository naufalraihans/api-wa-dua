"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const whatsapp_web_js_1 = require("whatsapp-web.js");
const qrcode_terminal_1 = __importDefault(require("qrcode-terminal"));
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const readline_1 = __importDefault(require("readline"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
app.use(express_1.default.json());
// Set up readline interface for command line input (Pairing Code)
const rl = readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout,
});
const question = (query) => {
    return new Promise((resolve) => {
        rl.question(query, resolve);
    });
};
// Initialize WhatsApp Client
const client = new whatsapp_web_js_1.Client({
    authStrategy: new whatsapp_web_js_1.LocalAuth(),
    puppeteer: {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        headless: true,
    },
});
let usePairingCode = false;
let phoneNumberInput = "";
let pairingCodeRequested = false;
// Authenticate with QR Code
client.on("qr", (qr) => __awaiter(void 0, void 0, void 0, function* () {
    if (usePairingCode && !pairingCodeRequested) {
        pairingCodeRequested = true;
        try {
            const code = yield client.requestPairingCode(phoneNumberInput);
            console.log(`\n📱 PAIRING CODE: ${code}`);
            console.log("Enter this code on your WhatsApp app to link devices.");
        }
        catch (err) {
            console.error("Error requesting pairing code:", err);
        }
    }
    else if (!usePairingCode) {
        console.log("\nScan this QR code in WhatsApp to log in:");
        qrcode_terminal_1.default.generate(qr, { small: true });
        console.log("\n--- OR ---");
        console.log("If QR code is not showing or you want to use Phone Number:");
        console.log("Press Ctrl+C, then restart and follow instructions to use Pairing Code if implemented.");
    }
}));
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
const messagesStorage = [];
// 1. Membaca chat masuk dan melihat nomor pengirim
client.on("message", (message) => __awaiter(void 0, void 0, void 0, function* () {
    // Ignore messages from the bot itself or status broadcasts
    if (message.fromMe || message.from === "status@broadcast")
        return;
    const contact = yield message.getContact();
    const chat = yield message.getChat();
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
        yield message.reply(replyText);
        console.log(`Replied to ${senderNumber} with: ${replyText}`);
    }
}));
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
    const filteredMessages = messagesStorage.filter((msg) => msg.senderNumber === searchNumber || msg.senderNumber === searchNumber + "@c.us");
    res.status(200).json({
        success: true,
        data: filteredMessages
    });
});
// 4. Mengirim chat ke nomor tertentu via API
app.post("/api/send-message", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const isRegistered = yield client.isRegisteredUser(formattedNumber);
        if (!isRegistered) {
            return res
                .status(404)
                .json({ error: "The provided number is not registered on WhatsApp." });
        }
        yield client.sendMessage(formattedNumber, message);
        console.log(`\n📤 Sent API message to ${formattedNumber}: ${message}`);
        res
            .status(200)
            .json({ success: true, message: "Message sent successfully." });
    }
    catch (error) {
        console.error("Error sending message:", error);
        res.status(500).json({ error: "Failed to send message." });
    }
}));
const startBot = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Starting WhatsApp Bot...");
    const answer = yield question("Do you want to login with Phone Number / Pairing Code? (y/N): ");
    usePairingCode = answer.toLowerCase() === "y";
    if (usePairingCode) {
        phoneNumberInput = yield question("Enter your phone number with country code (e.g. 62812...): ");
        client.initialize();
    }
    else {
        console.log("Using QR Code authentication...");
        client.initialize();
    }
});
app.listen(port, () => {
    console.log(`🌐 Server API running at http://localhost:${port}`);
    startBot();
});
