const { makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
//const qrcode = require("qrcode-terminal");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const qrcode = require('qrcode'); // Import qrcode untuk menghasilkan QR code dalam bentuk URL

const app = express();
app.use(cors());
app.use(bodyParser.json());

let sock;
let currentQR = ""; 





async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth");
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Tidak perlu mencetak di terminal
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, qr } = update;

        if (qr) {
            currentQR = await qrcode.toDataURL(qr); // Simpan QR dalam bentuk data URL
        }

        if (connection === "open") console.log("✅ Bot WhatsApp terhubung!");
        if (connection === "close") {
            console.log("⚠️ Koneksi terputus! Restarting...");
            startBot();
        }
    });
}

// API untuk mendapatkan QR code terbaru
app.get("/qr", (req, res) => {
    if (!currentQR) {
        return res.status(404).json({ message: "QR belum tersedia. Silakan tunggu." });
    }
    res.send(`<img src="${currentQR}" alt="QR Code"/>`);
});


// **API untuk Kirim Pesan ke Admin**
app.post("/send-admin", async (req, res) => {
    if (!sock) return res.status(500).json({ error: "Bot belum siap!" });

    const { name, whatsapp, location, date, time, package, dpAmount, status } = req.body;
    const ADMIN_PHONE = "6282251892599@s.whatsapp.net"; // Ganti dengan nomor admin (format internasional)

    const message = `📢 PESANAN BARU 📢\n\nNama: ${name}\nWhatsApp: ${whatsapp}\nLokasi: ${location}\nTanggal: ${date}\nWaktu: ${time}\nPaket: ${package}\nDP: Rp ${dpAmount.toLocaleString()}\nStatus: ${status}`;

    try {
        await sock.sendMessage(ADMIN_PHONE, { text: message });
        console.log("✅ Pesan berhasil dikirim ke admin!");
        res.json({ success: true, message: "Pesan terkirim ke admin!" });
    } catch (error) {
        console.error("❌ Gagal mengirim pesan:", error);
        res.status(500).json({ error: "Gagal mengirim pesan." });
    }
});

app.listen(5002, () => {
    console.log("🚀 Server berjalan di port 5002");
    startBot(); // Jalankan bot saat server mulai
});