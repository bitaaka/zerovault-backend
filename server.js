const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

// توکن شما
const TELEGRAM_TOKEN = '9179914310:AAEVDDXFJSzkEEeUZDprQSIyDNRJVka47ok';

app.get('/', (req, res) => { res.send("سرور هشداردهنده زیروچین فعال است!"); });

// دریافت پیام‌های کاربران در ربات
app.post('/bot', (req, res) => {
    res.sendStatus(200);
    const update = req.body;
    
    if (update && update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const text = update.message.text.trim();
        
        if (text === '/start') {
            const welcomeMsg = "🤖 سلام!\nبه ربات زیروچین خوش آمدید. آلارم‌های سقوط بازار از طرف سایت مستقیماً به اینجا ارسال می‌شوند.";
            sendTelegramMessage(chatId, welcomeMsg);
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
