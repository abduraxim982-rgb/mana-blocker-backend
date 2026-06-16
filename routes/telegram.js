const express = require('express');
const router = express.Router();
const { User, UnblockRequest } = require('../models');
const { sendTelegram, answerCallbackQuery, editMessageText } = require('../utils/telegram');

// PUBLIC webhook — Telegram calls this. No authenticate middleware.
router.post('/webhook', async (req, res) => {
  // Acknowledge immediately so Telegram doesn't retry.
  res.sendStatus(200);
  try {
    // Inline-button taps (approve/deny unblock requests) arrive as callback_query.
    const cq = req.body && req.body.callback_query;
    if (cq) {
      const [action, reqId] = String(cq.data || '').split(':');
      const request = reqId ? await UnblockRequest.findById(reqId) : null;
      if (!request) {
        await answerCallbackQuery(cq.id, "Bu so'rov allaqachon hal qilingan.");
        return;
      }
      // Only the linked partner of the request's owner may decide.
      const owner = await User.findById(request.owner);
      if (!owner || owner.partnerChatId !== String(cq.from.id)) {
        await answerCallbackQuery(cq.id, "Ruxsat yo'q");
        return;
      }
      if (request.status === 'pending') {
        const approved = action === 'approve';
        request.status = approved ? 'approved' : 'denied';
        request.decidedAt = new Date();
        await request.save();
        await answerCallbackQuery(cq.id, approved ? 'Ruxsat berildi ✅' : 'Rad etildi ❌');
        const original = (cq.message && cq.message.text) || '';
        const decision = approved ? '✅ Ruxsat berildi' : '❌ Rad etildi';
        await editMessageText(cq.message.chat.id, cq.message.message_id,
          original + '\n\n<b>Qaror: ' + decision + '</b>');
      } else {
        await answerCallbackQuery(cq.id, "Bu so'rov allaqachon hal qilingan.");
      }
      return;
    }

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
