# WhatsApp Gateway API

WhatsApp Gateway API menggunakan **Baileys** (WebSocket-based) — koneksi cepat, ringan, tanpa Chrome/Puppeteer.

## Quick Start

```bash
# Install dependencies
npm install

# Jalankan
npm start

# Buka browser
# http://localhost:3000
```

Login via **Pairing Code** di web dashboard, atau via API:

```bash
curl -X POST http://localhost:3000/session/start \
  -H "Content-Type: application/json" \
  -d '{"phone": "081234567890"}'
```

Buka WhatsApp > Settings > Linked Devices > Link a Device > **Link with phone number** > masukkan kode.

## API Endpoints

### Session

| Method | Endpoint          | Deskripsi              |
| ------ | ----------------- | ---------------------- |
| POST   | `/session/start`  | Login (pairing code)   |
| GET    | `/session/status` | Cek status koneksi     |
| POST   | `/session/logout` | Logout & hapus session |

### Messages

| Method | Endpoint                | Deskripsi                 |
| ------ | ----------------------- | ------------------------- |
| GET    | `/api/messages`         | Semua pesan masuk         |
| GET    | `/api/messages/private` | Pesan pribadi saja        |
| GET    | `/api/messages/group`   | Pesan grup saja           |
| GET    | `/api/messages/:number` | Pesan dari nomor tertentu |
| POST   | `/api/send-message`     | Kirim pesan               |

### Contoh Kirim Pesan

```bash
curl -X POST http://localhost:3000/api/send-message \
  -H "Content-Type: application/json" \
  -d '{"number": "628123456789", "message": "Hello dari API!"}'
```

### Contoh Baca Pesan

```bash
curl http://localhost:3000/api/messages/628123456789
```

## Deploy ke VPS

```bash
git clone https://github.com/naufalraihans/api-wa-dua.git
cd api-wa-dua
npm install
npm start
```

Tidak perlu install Chrome atau library tambahan!

## Catatan

- Koneksi via WebSocket, bukan Puppeteer — jauh lebih cepat & ringan
- Session tersimpan di `storage/sessions/` (auto-reconnect saat restart)
- Pesan disimpan di memori server (hilang saat restart)
