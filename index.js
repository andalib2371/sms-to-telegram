/**
 * SMS → Telegram Forwarder (نسخه Node.js برای Render)
 *
 * متغیرهای محیطی مورد نیاز (در پنل Render تنظیم می‌شوند):
 *  - TELEGRAM_BOT_TOKEN   : توکن بات تلگرام
 *  - TELEGRAM_CHAT_ID     : آیدی چت/کانال مقصد
 *  - WEBHOOK_SECRET       : (اختیاری) رمز محافظتی برای جلوگیری از درخواست‌های جعلی
 */

const express = require("express");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());

const PORT = process.env.PORT || 3000;

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

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.post("/", async (req, res) => {
  // بررسی رمز محافظتی (اگر تنظیم شده باشد)
  if (process.env.WEBHOOK_SECRET) {
    const providedSecret =
      req.query.secret || req.headers["x-webhook-secret"];
    if (providedSecret !== process.env.WEBHOOK_SECRET) {
      return res.status(401).send("Unauthorized");
    }
  }

  let sender = "نامشخص";
  let text = "";
  const data = typeof req.body === "object" ? req.body : {};

  sender = extractField(data, ["from", "sender", "number", "source", "originator"]) ||
    req.query.from || req.query.sender || "نامشخص";
  text = extractField(data, ["message", "text", "body", "content", "sms"]) ||
    req.query.message || req.query.text || "";

  if (!text) {
    text = "(متنی یافت نشد — محتوای خام در ادامه)\n" + JSON.stringify(data);
  }

  const telegramMessage =
    `📩 پیامک جدید\n` +
    `فرستنده: ${escapeHtml(sender)}\n` +
    `متن:\n${escapeHtml(text)}`;

  try {
    const tgResponse = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: telegramMessage,
          parse_mode: "HTML",
        }),
      }
    );

    if (!tgResponse.ok) {
      const errText = await tgResponse.text();
      return res.status(502).send("Failed to send to Telegram: " + errText);
    }

    res.status(200).send("OK");
  } catch (err) {
    res.status(500).send("Error: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
