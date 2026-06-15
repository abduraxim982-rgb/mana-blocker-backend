const express = require('express');
const router = express.Router();
const { User } = require('../models');
const { sendTelegram } = require('../utils/telegram');

// PUBLIC webhook — Telegram calls this. No authenticate middleware.
router.post('/webhook', async (req, res) => {
  // Acknowledge immediately so Telegram doesn't retry.
  res.sendStatus(200);
  try {
    const message = req.body && req.body.message;
    if (!message || !message.text) return;
    const text = message.text;
    const chat = message.chat;
    if (!text.startsWith('/start')) return;

    const code = text.split(' ')[1];
    if (!code) {
      await sendTelegram(chat.id, "Salom! Sizni accountability sherigi sifatida ulash uchun do'stingiz yuborgan havolani bosing.");
      return;
    }

    const user = await User.findOne({ linkCode: code, linkCodeExpires: { $gt: new Date() } });
    if (!user) {
      await sendTelegram(chat.id, "Havola eskirgan yoki noto'g'ri. Yangi havola so'rang.");
      return;
    }

    user.partnerChatId = String(chat.id);
    user.partnerName = (message.from && message.from.first_name) || 'Sherik';
    user.linkCode = null;
    user.linkCodeExpires = null;
    await user.save();

    const displayName = user.name || user.email || 'Foydalanuvchi';
    await sendTelegram(chat.id, `✅ Siz <b>${displayName}</b>ning accountability sherigisiz. U bloklangan ilovani olib tashlasa yoki himoyani o'chirsa — sizga shu yerda xabar keladi.`);
  } catch (err) {
    console.error('telegram webhook error:', err.message);
  }
});

module.exports = router;
