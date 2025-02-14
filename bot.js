const { makeWASocket, initAuthCreds } = require("@whiskeysockets/baileys");
const { kv } = require("@vercel/kv"); // Gunakan Vercel KV
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const qrcode = require("qrcode"); // Import qrcode untuk menghasilkan QR code dalam bentuk URL

const app = express();
app.use(cors());
app.use(bodyParser.json());

let sock;
let currentQR = "";

// Fungsi untuk menyimpan kredensial ke Vercel KV
async function saveAuthState(state) {
    await kv.set("authState", JSON.stringify(state));
    console.log("✅ Auth state disimpan ke Vercel KV");
}

// Fungsi untuk mengambil kredensial dari Vercel KV
async function getAuthState() {
    const state = await kv.get("authState");
    if (!state) return initAuthCreds(); // Jika kosong, buat kredensial baru
    console.log("✅ Auth state berhasil diambil dari Vercel KV");
    return JSON.parse(state);
}

// Fungsi untuk inisialisasi state autentikasi dengan Baileys
async function useCloudAuthState() {
    const state = await getAuthState();

    const saveCreds = async () => {
        await saveAuthState(state);
    };

    return { state, saveCreds };
}

// Fungsi untuk memulai bot
async function startBot() {
    const { state, saveCreds } = await useCloudAuthState();
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Tidak perlu mencetak di terminal
    });

    sock.ev.on("creds.update", saveCreds); // Simpan perubahan ke Vercel KV

    sock.ev.on("connection.update", async (update) => {
        const { connection, qr } = update;

        if (qr) {
            currentQR = await qrcode.toDataURL(qr); // Simpan QR dalam bentuk data URL
        }

        if (connection === "open") {
            console.log("✅ Bot WhatsApp terhubung!");
        }
        if (connection === "close") {
            console.log("⚠️ Koneksi terputus! Restarting...");
            startBot(); // Restart bot jika koneksi terputus
        }
    });
}

// Endpoint API untuk menampilkan QR Code
app.get("/qr", (req, res) => {
    if (!currentQR) {
        return res.status(404).json({ message: "QR belum tersedia. Silakan tunggu." });
    }
    res.send(`<img src="${currentQR}" alt="QR Code"/>`);
});

// Endpoint untuk mengirim pesan ke admin
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

// Mulai server dan bot
app.listen(5002, () => {
    console.log("🚀 Server berjalan di port 5002");
    startBot();
});
