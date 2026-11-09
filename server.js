// نیازمندی‌ها: npm install express cors body-parser
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// مسیر فایل دیتابیس ما
const DB_FILE = path.join(__dirname, 'database.json');

// کلید مخفی سرور برای رمزنگاری قطعاتِ کاربران (این کلید نباید لو برود)
// در یک پروژه واقعی این را در فایل .env می‌گذارند، اما اینجا برای سادگی هاردکد کردیم
const SERVER_ENCRYPTION_KEY = crypto.createHash('sha256').update(String("ZeroVault_Super_Secret_Key_2026")).digest('base64').substr(0, 32);

// ----------------------------------------------------
// توابع مدیریت دیتابیس فایلی
// ----------------------------------------------------
function loadDatabase() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data);
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

// نگهداری موقت سشن‌های پیامک (نیاز به ذخیره دائمی ندارد)
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

    // قطعه کاربر را رمزنگاری کرده و ذخیره می‌کنیم
    db[email] = {
        walletAddress: walletAddress,
        encryptedShare: encryptShard(serverShare),
        createdAt: new Date().toISOString()
    };

    saveDatabase(db);

    console.log(`✅ گاوصندوق برای ${email} ساخته شد و در دیتابیس ذخیره گردید.`);
    res.json({ success: true, message: "قطعه دوم با امنیت بالا در سرور زیروچین ذخیره شد." });
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

    // تولید یک کد تایید ۶ رقمی تصادفی
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    active2FASessions[email] = { code: otpCode, expires: Date.now() + 5 * 60000 }; // انقضا: ۵ دقیقه

    // نمایش کد در لاگ سرور
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
    
    if(!userVault) {
        return res.status(404).json({ error: "داده‌های گاوصندوق یافت نشد." });
    }

    // رمزگشایی قطعه
    const decryptedShare = decryptShard(userVault.encryptedShare);

    // پاک کردن سشن
    delete active2FASessions[email];

    console.log(`🔓 هویت ${email} تایید شد. قطعه دوم برای امضای تراکنش ارسال گردید.`);
    res.json({ 
        success: true, 
        serverShare: decryptedShare,
        message: "هویت تایید شد. مرورگر شما در حال ترکیب قطعات است..."
    });
});

// مسیر تست برای اطمینان از روشن بودن سرور
app.get('/', (req, res) => {
    res.send("سرور امنیتی ZeroVault با دیتابیس فایلی روشن است!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 سرور روی پورت ${PORT} فعال شد.`);
});
