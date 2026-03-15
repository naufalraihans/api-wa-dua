# WhatsApp Core Bot API

Bot dasar WhatsApp yang memungkinkan Anda untuk membaca pesan masuk dan mengirim pesan via HTTP REST API. Sangat cocok jika Anda ingin mendeploy ini di VPS dan menggunakan bahasa pemrograman lain (seperti PHP/Python) untuk men-trigger pesan WhatsApp.

## Fitur Utama

1. **Login Dual Metode:**
   - Scan **QR Code** di terminal (seperti web.whatsapp.com)
   - Pair dengan **Nomor HP / Pairing Code** (jika kesulitan scan).
2. **Listener Pesan Masuk:**
   - Anda dapat melihat log semua pesan dan nomor pengirim di console server.
3. **API Kirim Pesan:**
   - Menyediakan API berbasis HTTP untuk memudahkan sistem luar dalam mengirim pesan.

## Cara Menjalankan Bot di VPS (atau Lokal)

1. Pastikan Anda berada di direktori aplikasi ini:

   ```bash
   cd whatsapp-core-bot
   ```

2. _(Hanya awal saja)_ Install semua dependensi Node.js:

   ```bash
   npm install
   ```

3. Jalankan aplikasi menggunakan perintah ini:

   ```bash
   npm start
   ```

4. Anda akan melihat prompt: **"Do you want to login with Phone Number / Pairing Code? (y/N):"**
   - **Untuk metode QR Code:** Tekan saja tombol `Enter` (default: N). Terminal akan mencetak pola QR. Scan QR tersebut pakai menu "Linked Devices/Perangkat Tautkan" di WhatsApp HP Anda.
   - **Untuk metode Pairing Code:** Ketik `y`, lalu tekan `Enter`. Masukkan **nomor HP** yang tertaut dengan WhatsApp Anda lengkap dengan kode negaranya tanpa simbol `+` (Contoh untuk Indonesia: `628123456789`). Bot ini nantinya akan mencetak 8-digit **Pairing Code** yang bisa Anda masukkan di notifikasi WhatsApp HP Anda.

5. Tunggu tulisan `✅ Authenticated successfully!` dan `🔥 Bot is READY!` muncul di layar console terminal Anda. Jika muncul tulisan itu, tandanya **API sudah siap.**

## Dokumentasi API (Kirim Pesan)

Setelah bot berhasil terautentikasi (Status: `READY`), biarkan terminal tetap berjalan.
Sekarang aplikasi di port `3000` Anda siap menerima _request_ HTTP.

### 1. Mengambil Semua Pesan Masuk (GET)

**Endpoint:**

```
GET http://<IP_VPS_ANDA>:3000/api/messages
```

**Respons Berhasil:**

```json
{
  "success": true,
  "data": [
    {
      "id": "false_6281234xxx@c.us_3Axyz123",
      "senderNumber": "6281234xxx",
      "senderName": "Budi",
      "message": "hello",
      "timestamp": 1690000000
    }
  ]
}
```

### 2. Mengambil Semua Pesan Pribadi (GET)

**Endpoint:**

```
GET http://<IP_VPS_ANDA>:3000/api/messages/private
```

### 3. Mengambil Semua Pesan dari Grup (GET)

**Endpoint:**

```
GET http://<IP_VPS_ANDA>:3000/api/messages/group
```

### 4. Mengambil Pesan dari Nomor Tertentu (GET)

**Endpoint:**

```
GET http://<IP_VPS_ANDA>:3000/api/messages/6281234xxx
```

_(Ganti `6281234xxx` dengan nomor tujuan lengkap beserta kode negara tanpa `+`)_

**Respons Berhasil:**

```json
{
  "success": true,
  "data": [
    {
      "id": "false_6281234xxx@c.us_3Axyz123",
      "senderNumber": "6281234xxx",
      "senderName": "Budi",
      "message": "hello",
      "timestamp": 1690000000,
      "isGroup": false,
      "chatName": "Budi"
    }
  ]
}
```

### 5. Mengirim Chat ke Nomor Tertentu (POST)

Arahkan framework aplikasi Anda, Postman, ataupun frontend Anda untuk menembak endpoint HTTP POST ini.

**Endpoint:**

```
POST http://<IP_VPS_ANDA>:3000/api/send-message
```

**Body Request (JSON):**
Isilah _number_ dan _message_ di dalam body JSON. Pastikan nomor hp lengkap menggunakan kode negara (Contoh: awalan kode Indonesia `62`). Format di bawah ini `6281234xxx`.

```json
{
  "number": "6285123456780",
  "message": "Halo! Pesan ini dikirim secara otomatis melalui REST API bot WhatsApp."
}
```

#### Contoh pakai API Tester di Terminal (cURL):

```bash
   curl -X POST http://<IP_VPS_ANDA>:3000/api/send-message \
   -H "Content-Type: application/json" \
   -d "{\"number\":\"6285123456780\", \"message\":\"Testing API kirim pesan WA\"}"
```

**Respons Berhasil:**

```json
{
  "success": true,
  "message": "Message sent successfully."
}
```

### Tips

Jika Anda ingin menguji apakah bot sedang menyala dan bisa membalas chat secara responsif, cobalah kirim pesan berbunyi `!ping` ke nomor bot Anda dari WhatsApp nomor lain. Bot otomatis akan merespons rincian kontak Anda.
