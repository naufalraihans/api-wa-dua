const express = require('express');
const router = express.Router();
const c = require('./controllers');

// Session management (baru — untuk pairing code login)
router.post('/session/start',  c.startSession);
router.get('/session/status',  c.getStatus);
router.post('/session/logout', c.logoutSession);

// Mengambil pesan — sama seperti sebelumnya
router.get('/api/messages',          c.getAllMessages);
router.get('/api/messages/private',  c.getPrivateMessages);
router.get('/api/messages/group',    c.getGroupMessages);
router.get('/api/messages/:number',  c.getMessagesByNumber);

// Kirim pesan — sama seperti sebelumnya
router.post('/api/send-message', c.sendMessage);

module.exports = router;
