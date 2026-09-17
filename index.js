/**
 * SMS → Telegram Forwarder + پاسخ به /start (نسخه Node.js برای Render)
 *
 * متغیرهای محیطی مورد نیاز (در پنل Render تنظیم می‌شوند):
 *  - TELEGRAM_BOT_TOKEN   : توکن بات تلگرام
 *  - TELEGRAM_CHAT_ID     : آیدی چت/کانال مقصد (برای فوروارد پیامک‌ها)
 *  - WEBHOOK_SECRET       : (اختیاری) رمز محافظتی برای جلوگیری از درخواست‌های جعلی به مسیر اصلی
 *  - PUBLIC_URL           : (اختیاری) آدرس عمومی سرویس؛ اگر ندهید، از RENDER_EXTERNAL_URL استفاده می‌شود
 */

const express = require("express");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
const WELCOME_MESSAGE =
  "سلام! 👋\nاین بات به شما پیامک‌های دریافتی رو فوروارد می‌کنه.\nهمین که یه پیامک جدید برسه، اینجا می‌بینیدش.";

function extractField(data, possibleKeys) {
  for (const key of possibleKeys) {
    if (data && data[key] !== undefined && data[key] !== null && data[key] !== "") {
      return String(data[key]);
    }
  }
  return "";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendTelegramMessage(chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  return res;
}

// مسیر تست سلامت
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// مسیر دریافت وبهوک پیامک (سرویس SMS یا اپ فورواردر گوشی به این آدرس POST می‌زند)
app.post("/", async (req, res) => {
  if (process.env.WEBHOOK_SECRET) {
    const providedSecret = req.query.secret || req.headers["x-webhook-secret"];
    if (providedSecret !== process.env.WEBHOOK_SECRET) {
      return res.status(401).send("Unauthorized");
    }
  }

  const data = typeof req.body === "object" ? req.body : {};

  let sender =
    extractField(data, ["from", "sender", "number", "source", "originator"]) ||
    req.query.from ||
    req.query.sender ||
    "نامشخص";
  let text =
    extractField(data, ["message", "text", "body", "content", "sms"]) ||
    req.query.message ||
    req.query.text ||
    "";

  if (!text) {
    text = "(متنی یافت نشد — محتوای خام در ادامه)\n" + JSON.stringify(data);
  }

  const telegramMessage =
    `📩 پیامک جدید\n` + `فرستنده: ${escapeHtml(sender)}\n` + `متن:\n${escapeHtml(text)}`;

  try {
    const tgResponse = await sendTelegramMessage(process.env.TELEGRAM_CHAT_ID, telegramMessage);
    if (!tgResponse.ok) {
      const errText = await tgResponse.text();
      return res.status(502).send("Failed to send to Telegram: " + errText);
    }
    res.status(200).send("OK");
  } catch (err) {
    res.status(500).send("Error: " + err.message);
  }
});

// مسیر دریافت وبهوک خود تلگرام (پیام‌هایی که کاربران به بات می‌فرستند)
app.post("/telegram-webhook", async (req, res) => {
  try {
    const update = req.body;
    const message = update && update.message;
    const chatId = message && message.chat && message.chat.id;
    const incomingText = (message && message.text) || "";

    if (chatId && incomingText.startsWith("/start")) {
      await sendTelegramMessage(chatId, WELCOME_MESSAGE);
    }

    res.status(200).send("OK");
  } catch (err) {
    res.status(200).send("OK"); // به تلگرام همیشه 200 برگردانده شود
  }
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // تنظیم خودکار وبهوک تلگرام موقع بالا آمدن سرویس
  if (BOT_TOKEN && PUBLIC_URL) {
    try {
      const webhookUrl = `${PUBLIC_URL.replace(/\/$/, "")}/telegram-webhook`;
      const res = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
      );
      const result = await res.json();
      console.log("Telegram setWebhook result:", JSON.stringify(result));
    } catch (err) {
      console.log("Failed to set Telegram webhook:", err.message);
    }
  } else {
    console.log("Skipping auto webhook setup (missing BOT_TOKEN or PUBLIC_URL).");
  }
});
