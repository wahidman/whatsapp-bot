const { makeWASocket, initAuthCreds } = require("@whiskeysockets/baileys");
const { kv } = require("@vercel/kv");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const qrcode = require("qrcode");

const app = express();
app.use(cors());
app.use(bodyParser.json());

let sock;
let currentQR = "";

// Fungsi untuk menyimpan kredensial ke Vercel KV
async function saveAuthState(state) {
    try {
        if (!state.creds || !state.creds.me) {
            throw new Error("Auth state tidak valid");
        }
        await kv.set("authState", JSON.stringify(state));
        console.log("✅ Auth state disimpan ke Vercel KV");
    } catch (error) {
        console.error("❌ Gagal menyimpan auth state:", error);
    }
}

// Fungsi untuk mengambil kredensial dari Vercel KV
async function getAuthState() {
    try {
        const state = await kv.get("authState");
        if (!state) {
            console.log("🔄 Auth state kosong, membuat kredensial baru...");
            return initAuthCreds();
        }
        const parsedState = JSON.parse(state);
        if (!parsedState.creds || !parsedState.creds.me) {
            console.log("🔄 Auth state tidak valid, membuat kredensial baru...");
            return initAuthCreds();
        }
        console.log("✅ Auth state berhasil diambil dari Vercel KV");
        return parsedState;
    } catch (error) {
        console.error("❌ Gagal mengambil auth state:", error);
        return initAuthCreds();
    }
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
    try {
        console.log("🔄 Memulai bot...");
        const { state, saveCreds } = await useCloudAuthState();
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
        });

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async (update) => {
            const { connection, qr } = update;

            if (qr) {
                console.log("🔄 QR Code dihasilkan...");
                currentQR = await qrcode.toDataURL(qr);
                await kv.set("currentQR", currentQR);
                console.log("✅ QR Code disimpan di Vercel KV");
            }

            if (connection === "open") {
                console.log("✅ Bot WhatsApp terhubung!");
            }
            if (connection === "close") {
                console.log("⚠️ Koneksi terputus! Restarting...");
                startBot();
            }
        });
    } catch (error) {
        console.error("❌ Gagal memulai bot:", error);
        throw error;
    }
}

// Endpoint API untuk menampilkan QR Code
app.get("/qr", async (req, res) => {
    try {
        const qr = await kv.get("currentQR");
        if (!qr) {
            return res.status(404).json({ message: "QR belum tersedia. Silakan tunggu." });
        }
        res.send(`<img src="${qr}" alt="QR Code"/>`);
    } catch (error) {
        res.status(500).json({ error: "Gagal mengambil QR Code." });
    }
});

// Endpoint untuk memulai bot
app.get("/start-bot", async (req, res) => {
    try {
        await startBot();
        res.json({ success: true, message: "Bot started!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to start bot." });
    }
});

app.get("/reset-auth", async (req, res) => {
    try {
        await kv.del("authState");
        console.log("✅ Auth state berhasil dihapus.");
        res.json({ success: true, message: "Auth state berhasil dihapus." });
    } catch (error) {
        console.error("❌ Gagal menghapus auth state:", error);
        res.status(500).json({ error: "Gagal menghapus auth state." });
    }
});

// Mulai server
const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di port ${PORT}`);
});
