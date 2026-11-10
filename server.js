const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');
const SERVER_ENCRYPTION_KEY = crypto.createHash('sha256').update(String("ZeroVault_Super_Secret_Key_2026")).digest('base64').substr(0, 32);

// توکن شما:
const TELEGRAM_TOKEN = '9179914310:AAEVDDXFJSzkEEeUZDprQSIyDNRJVka47ok';

function loadDatabase() {
    if (fs.existsSync(DB_FILE)) {
        try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { return {}; }
    }
    return {};
}

function saveDatabase(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function encryptShard(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', SERVER_ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decryptShard(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', SERVER_ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

const active2FASessions = {};

app.post('/api/vault/register', (req, res) => {
    const { email, serverShare, walletAddress } = req.body;
    if (!email || !serverShare) return res.status(400).json({ error: "اطلاعات ناقص است." });
    const db = loadDatabase();
    const isVip = db[email] ? db[email].is_vip : false;
    db[email] = { walletAddress, encryptedShare: encryptShard(serverShare), createdAt: new Date().toISOString(), is_vip: isVip };
    saveDatabase(db);
    res.json({ success: true, is_vip: isVip, message: "قطعه دوم ذخیره شد." });
});

app.post('/api/vault/request-withdraw', (req, res) => {
    const { email } = req.body;
    const db = loadDatabase();
    if (!db[email]) return res.status(404).json({ error: "یافت نشد." });
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    active2FASessions[email] = { code: otpCode, expires: Date.now() + 5 * 60000 };
    res.json({ success: true, message: "کد تایید ارسال شد." });
});

app.post('/api/vault/verify-withdraw', (req, res) => {
    const { email, code } = req.body;
    const session = active2FASessions[email];
    if (!session || session.code !== code || Date.now() > session.expires) return res.status(401).json({ error: "کد اشتباه است." });
    const db = loadDatabase();
    res.json({ success: true, serverShare: decryptShard(db[email].encryptedShare), message: "تایید شد." });
});

app.get('/', (req, res) => { res.send("سرور امنیتی ZeroVault روشن است!"); });

// ==========================================
// اتصال مستقیم تلگرام به سرور (Webhook)
// ==========================================
app.post('/bot', (req, res) => {
    res.sendStatus(200); // تایید فوری دریافت پیام برای تلگرام
    
    const update = req.body;
    if (update && update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const text = update.message.text.trim();
        
        if (text === '/start') {
            sendTelegramMessage(chatId, "🤖 سلام مدیر عزیز!\nمن با سیستم پرسرعت وب‌هوک متصل شدم و همیشه بیدارم! دستور /vip email را بفرستید.");
        } 
        else if (text.startsWith('/vip ')) {
            const targetEmail = text.split(' ')[1];
            const db = loadDatabase();
            
            if (db[targetEmail]) {
                db[targetEmail].is_vip = true;
                saveDatabase(db);
                sendTelegramMessage(chatId, `✅ عملیات موفق!\nکاربر ${targetEmail} به حالت VIP ارتقا یافت.`);
            } else {
                sendTelegramMessage(chatId, `❌ خطا: ایمیل ${targetEmail} در دیتابیس سرور یافت نشد.`);
            }
        }
    }
});

function sendTelegramMessage(chatId, text) {
    const dataStr = JSON.stringify({ chat_id: chatId, text: text });
    const options = {
        hostname: 'api.telegram.org', port: 443,
        path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(dataStr) }
    };
    const req = https.request(options);
    req.on('error', (e) => console.error(e));
    req.write(dataStr);
    req.end();
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => { console.log(`🚀 سرور روی پورت ${PORT} فعال شد.`); });
