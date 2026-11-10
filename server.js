const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https'); // اضافه شده برای رفع خطای رندر

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');
const SERVER_ENCRYPTION_KEY = crypto.createHash('sha256').update(String("ZeroVault_Super_Secret_Key_2026")).digest('base64').substr(0, 32);

// توکن شما مستقیماً اینجا قرار داده شد:
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
    console.log(`[SMS Simulator]: کد تایید -> ${otpCode}`);
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
// موتور ربات با سیستم ضد-قطعی (HTTPS Native)
// ==========================================
function telegramAPI(method, data) {
    return new Promise((resolve) => {
        const dataStr = JSON.stringify(data);
        const options = {
            hostname: 'api.telegram.org', port: 443,
            path: `/bot${TELEGRAM_TOKEN}/${method}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': dataStr.length }
        };
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch(e) { resolve({}); }
            });
        });
        req.on('error', (e) => { console.error("Net Error:", e.message); resolve({}); });
        req.write(dataStr);
        req.end();
    });
}

let lastUpdateId = 0;
async function pollTelegram() {
    const data = await telegramAPI('getUpdates', { offset: lastUpdateId + 1, timeout: 30 });
    if (data && data.ok && data.result) {
        for (const update of data.result) {
            lastUpdateId = update.update_id;
            if (!update.message || !update.message.text) continue;
            
            const chatId = update.message.chat.id;
            const text = update.message.text.trim();
            
            if (text === '/start') {
                await telegramAPI('sendMessage', { chat_id: chatId, text: "🤖 سلام مدیر عزیز!\nمن بیدار شدم و بدون قطعی کار می‌کنم. دستور /vip email@zerochain.ir را بفرستید." });
            } 
            else if (text.startsWith('/vip ')) {
                const targetEmail = text.split(' ')[1];
                const db = loadDatabase();
                
                if (db[targetEmail]) {
                    db[targetEmail].is_vip = true;
                    saveDatabase(db);
                    await telegramAPI('sendMessage', { chat_id: chatId, text: `✅ عملیات موفق!\nکاربر ${targetEmail} VIP شد.` });
                } else {
                    await telegramAPI('sendMessage', { chat_id: chatId, text: `❌ خطا: ایمیل ${targetEmail} در دیتابیس یافت نشد.\nدلیل: کاربر باید اول حداقل یک بار دکمه «ساخت خزانه» را در سایت زده باشد تا اسمش در دیتابیس ثبت شود.` });
                }
            }
        }
    }
    setTimeout(pollTelegram, 2000);
}
pollTelegram();

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => { console.log(`🚀 سرور روی پورت ${PORT} فعال شد.`); });
