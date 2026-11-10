// نیازمندی‌ها: npm install express cors body-parser
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');
// در یک پروژه واقعی این کلید امنیتی باید بسیار پیچیده باشد
const TELEGRAM_TOKEN = '9179914310:AAEVDDXFJSzkEEeUZDprQSIyDNRJVka47ok';
// ----------------------------------------------------
// توابع مدیریت دیتابیس فایلی
// ----------------------------------------------------
function loadDatabase() {
    if (fs.existsSync(DB_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } catch (error) {
            console.error("خطا در خواندن دیتابیس:", error);
            return {};
        }
    }
    return {};
}

function saveDatabase(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error("خطا در ذخیره دیتابیس:", error);
    }
}

// ----------------------------------------------------
// توابع رمزنگاری
// ----------------------------------------------------
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

// ----------------------------------------------------
// مسیر ۱: دریافت قطعه دوم از سمت کاربر و ثبت‌نام در گاوصندوق
// ----------------------------------------------------
app.post('/api/vault/register', (req, res) => {
    const { email, serverShare, walletAddress } = req.body;

    if (!email || !serverShare) {
        return res.status(400).json({ error: "اطلاعات ناقص است." });
    }

    const db = loadDatabase();
    
    // بررسی می‌کنیم آیا کاربر از قبل وجود دارد؟
    const isExistingUser = db[email] !== undefined;
    const isVip = isExistingUser ? db[email].is_vip : false; // کاربر جدید پیش‌فرض عادی است

    // قطعه کاربر را رمزنگاری کرده و ذخیره می‌کنیم
    db[email] = {
        walletAddress: walletAddress,
        encryptedShare: encryptShard(serverShare),
        createdAt: isExistingUser ? db[email].createdAt : new Date().toISOString(),
        is_vip: isVip // وضعیت VIP بودن را نگه می‌داریم
    };

    saveDatabase(db);

    console.log(`✅ گاوصندوق برای ${email} ذخیره شد. VIP: ${isVip}`);
    res.json({ 
        success: true, 
        is_vip: isVip,
        message: "قطعه دوم با امنیت بالا در سرور زیروچین ذخیره شد." 
    });
});

// ----------------------------------------------------
// مسیر ۲: درخواست خروج پول (تریگر کردن سیستم 2FA)
// ----------------------------------------------------
app.post('/api/vault/request-withdraw', (req, res) => {
    const { email } = req.body;
    const db = loadDatabase();

    if (!db[email]) {
        return res.status(404).json({ error: "گاوصندوقی با این ایمیل یافت نشد." });
    }

    // *** سد امنیتی VIP ***
    // اگر بخواهید برداشت وجه فقط برای کاربران VIP باشد، این کد را فعال کنید:
    // if (!db[email].is_vip) {
    //     return res.status(403).json({ error: "برداشت وجه فقط برای کاربران VIP فعال است." });
    // }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    active2FASessions[email] = { code: otpCode, expires: Date.now() + 5 * 60000 }; 

    console.log(`📩 [شبیه‌ساز پیامک]: کد تایید شما برای برداشت وجه: ${otpCode}`);
    res.json({ success: true, message: "کد تایید به گوشی شما ارسال شد." });
});

// ----------------------------------------------------
// مسیر ۳: تایید کد 2FA و پس دادن قطعه دوم به مرورگر
// ----------------------------------------------------
app.post('/api/vault/verify-withdraw', (req, res) => {
    const { email, code } = req.body;
    const session = active2FASessions[email];
    
    if (!session || session.code !== code || Date.now() > session.expires) {
        return res.status(401).json({ error: "کد تایید اشتباه است یا منقضی شده." });
    }

    const db = loadDatabase();
    const userVault = db[email];
    
    if(!userVault) return res.status(404).json({ error: "داده‌های گاوصندوق یافت نشد." });

    const decryptedShare = decryptShard(userVault.encryptedShare);
    delete active2FASessions[email];

    console.log(`🔓 هویت ${email} تایید شد. قطعه ارسال گردید.`);
    res.json({ 
        success: true, 
        serverShare: decryptedShare,
        message: "هویت تایید شد. مرورگر شما در حال ترکیب قطعات است..."
    });
});

app.get('/', (req, res) => { res.send("سرور امنیتی ZeroVault روشن است!"); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`🚀 سرور روی پورت ${PORT} فعال شد.`); });
