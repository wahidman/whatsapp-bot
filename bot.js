const { makeWASocket, initAuthCreds } = require("@whiskeysockets/baileys");
require('dotenv').config();
const { kv } = require("@vercel/kv");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const qrcode = require("qrcode");

const app = express();
app.use(cors());
app.use(bodyParser.json());

async function getAuthState() {
    try {
        const state = await kv.get("authState");
        if (!state) {
            console.log("🔄 Auth state kosong, membuat kredensial baru...");
            const creds = initAuthCreds();
            return { creds, keys: {} };
        }
        const parsedState = JSON.parse(state);
        console.log("✅ Auth state berhasil diambil dari Vercel KV.");
        return parsedState;
    } catch (error) {
        console.error("❌ Gagal mengambil auth state:", error);
        const creds = initAuthCreds();
        return { creds, keys: {} };
    }
}

async function saveAuthState(state) {
    try {
        await kv.set("authState", JSON.stringify(state));
        console.log("✅ Auth state disimpan ke Vercel KV");
    } catch (error) {
        console.error("❌ Gagal menyimpan auth state:", error);
    }
}

async function startBot() {
    const state = await getAuthState();
    const saveCreds = async () => {
        await saveAuthState(state);
    };

    console.log("🔄 State:", state);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, qr } = update;
        console.log("Connection update:", update);

        if (qr) {
            console.log("🔄 QR Code dihasilkan...");
            const currentQR = await qrcode.toDataURL(qr);
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
}

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

app.get("/start-bot", async (req, res) => {
    try {
        await startBot();
        res.json({ success: true, message: "Bot started!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to start bot." });
    }
});

const server = app.listen(0, () => {
    const port = server.address().port;
    console.log(`🚀 Server berjalan di port ${port}`);
});
