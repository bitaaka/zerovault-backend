// نیازمندی‌ها: npm install express cors body-parser
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// در نسخه واقعی، این داده‌ها در دیتابیس (مثل MongoDB) ذخیره می‌شوند.
// فعلاً برای اجرای سریع، در حافظه سرور نگه می‌داریم.
const vaultDatabase = {};
const active2FASessions = {};

// کلید مخفی سرور برای رمزنگاری قطعاتِ کاربران (این کلید نباید لو برود)
const SERVER_ENCRYPTION_KEY = crypto.randomBytes(32); 

// تابع کمکی برای رمزنگاری قطعه دوم قبل از ذخیره در دیتابیس
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

// ----------------------------------------------------
// مسیر ۱: دریافت قطعه دوم از سمت کاربر و ثبت‌نام در گاوصندوق
// ----------------------------------------------------
app.post('/api/vault/register', (req, res) => {
    const { email, serverShare, walletAddress } = req.body;

    if (!email || !serverShare) {
        return res.status(400).json({ error: "اطلاعات ناقص است." });
    }

    // قطعه کاربر را رمزنگاری کرده و ذخیره می‌کنیم
    vaultDatabase[email] = {
        walletAddress: walletAddress,
        encryptedShare: encryptShard(serverShare)
    };

    console.log(`✅ گاوصندوق برای ${email} ساخته شد و قطعه دوم در گاوصندوق سرور قفل شد.`);
    res.json({ success: true, message: "قطعه دوم با امنیت بالا در سرور زیروچین ذخیره شد." });
});

// ----------------------------------------------------
// مسیر ۲: درخواست خروج پول (تریگر کردن سیستم 2FA)
// ----------------------------------------------------
app.post('/api/vault/request-withdraw', (req, res) => {
    const { email } = req.body;

    if (!vaultDatabase[email]) {
        return res.status(404).json({ error: "گاوصندوقی با این ایمیل یافت نشد." });
    }

    // تولید یک کد تایید ۶ رقمی تصادفی
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    active2FASessions[email] = { code: otpCode, expires: Date.now() + 5 * 60000 }; // انقضا: ۵ دقیقه

    // اینجا باید کد به API پیامک (مثل کاوه‌نگار) یا ایمیل وصل شود
    console.log(`📩 [شبیه‌ساز پیامک]: کد تایید شما برای برداشت وجه: ${otpCode}`);

    res.json({ success: true, message: "کد تایید به گوشی شما ارسال شد." });
});

// ----------------------------------------------------
// مسیر ۳: تایید کد 2FA و پس دادن قطعه دوم به مرورگر برای امضای تراکنش
// ----------------------------------------------------
app.post('/api/vault/verify-withdraw', (req, res) => {
    const { email, code } = req.body;

    const session = active2FASessions[email];
    if (!session || session.code !== code || Date.now() > session.expires) {
        return res.status(401).json({ error: "کد تایید اشتباه است یا منقضی شده." });
    }

    // کد درست بود! قطعه دوم را رمزگشایی کرده و فقط برای همین یک تراکنش به کاربر می‌دهیم
    const userVault = vaultDatabase[email];
    const decryptedShare = decryptShard(userVault.encryptedShare);

    // سشن تایید را پاک می‌کنیم تا دوباره نتواند استفاده کند
    delete active2FASessions[email];

    console.log(`🔓 هویت ${email} تایید شد. قطعه دوم برای امضای تراکنش ارسال گردید.`);
    res.json({ 
        success: true, 
        serverShare: decryptedShare,
        message: "هویت تایید شد. مرورگر شما در حال ترکیب قطعات و امضای تراکنش است..."
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 سرور امنیتی ZeroVault روی پورت ${PORT} فعال شد.`);
});