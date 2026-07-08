const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { User, UnblockRequest } = require('../models');
const { authenticate } = require('../middleware/auth');
const { sendTelegram } = require('../utils/telegram');

// Generate a one-time link code (valid 30 min) and a deep link to the bot.
router.post('/link-code', authenticate, async (req, res) => {
  try {
    const code = crypto.randomBytes(4).toString('hex');
    const expires = new Date(Date.now() + 30 * 60 * 1000);
    await User.findByIdAndUpdate(req.userId, { linkCode: code, linkCodeExpires: expires });
    const link = `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${code}`;
    res.json({ code, link });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Whether an accountability partner is currently linked.
router.get('/status', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ linked: !!user.partnerChatId, partnerName: user.partnerName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove the linked partner.
router.post('/unlink', authenticate, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, { partnerChatId: null, partnerName: null });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Notify the partner of an accountability event.
router.post('/event', authenticate, async (req, res) => {
  const tStart = Date.now();
  try {
    const message = req.body.message;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partnerChatId) return res.json({ sent: false, reason: 'no_partner' });
    const displayName = user.name || user.email || 'Foydalanuvchi';

    // Bir xil muammo (unblock-request kabi): DARHOL javob qaytar, Telegram'ni
    // fon rejimida yubor. {sent:true} = "qabul qilindi, fonda yuborilmoqda".
    res.json({ sent: true });
    console.log(`[event] Total (javob qaytdi): ${Date.now() - tStart} ms`);

    const tTelegram = Date.now();
    sendTelegram(user.partnerChatId, `🔓 <b>${displayName}</b> ${message}`)
      .then(() => console.log(`[event] Telegram send: ${Date.now() - tTelegram} ms`))
      .catch((tgErr) => console.error(
        `[event] Telegram send FAILED (${Date.now() - tTelegram} ms):`, tgErr.message));
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// Request partner approval before unblocking one or more apps.
router.post('/unblock-request', authenticate, async (req, res) => {
  const tStart = Date.now(); // VAZIFA 1: route boshi
  let reqDoc;
  try {
    const apps = Array.isArray(req.body && req.body.apps) ? req.body.apps : [];
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    // No partner linked → caller may unblock without approval.
    if (!user.partnerChatId) return res.json({ needsApproval: false });

    reqDoc = await UnblockRequest.create({
      owner: req.userId,
      apps,
      status: 'pending'
    });

    const displayName = user.name || user.email || 'Foydalanuvchi';
    const labels = apps.map(a => a.label || a.package).filter(Boolean);
    const text = `🔓 <b>${displayName}</b> quyidagini ochmoqchi: <b>${labels.join(', ')}</b>. Ruxsat berasizmi?`;
    const replyMarkup = {
      inline_keyboard: [[
        { text: '✅ Ruxsat', callback_data: `approve:${reqDoc._id}` },
        { text: '❌ Rad et', callback_data: `deny:${reqDoc._id}` }
      ]]
    };

    // VAZIFA 2: ilovaga DARHOL javob qaytar — Telegram round-trip'ini KUTMA.
    res.json({ needsApproval: true, requestId: reqDoc._id });
    console.log(`[unblock-request] Total (javob qaytdi): ${Date.now() - tStart} ms`);

    // Telegram'ni fon rejimida yubor (fire-and-forget). Xatoni faqat log qil —
    // ilova allaqachon javob oldi, so'rov hujjati DB'da 'pending' bo'lib qoladi.
    const tTelegram = Date.now();
    sendTelegram(user.partnerChatId, text, replyMarkup)
      .then(() => console.log(`[unblock-request] Telegram send: ${Date.now() - tTelegram} ms`))
      .catch((tgErr) => console.error(
        `[unblock-request] Telegram send FAILED (${Date.now() - tTelegram} ms):`, tgErr.message));
  } catch (err) {
    if (reqDoc) {
      try {
        await UnblockRequest.deleteOne({ _id: reqDoc._id });
      } catch (dbErr) {
        console.error('Failed to cleanup failed unblock request:', dbErr.message);
      }
    }
    // Javob allaqachon yuborilgan bo'lishi mumkin (Telegram fon xatosi emas,
    // undan oldingi xatolar) — ikki marta yubormaslik uchun tekshir.
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// Poll a single request's status (owner-scoped).
router.get('/unblock-request/approved-pending', authenticate, async (req, res) => {
  try {
    const request = await UnblockRequest.findOne({
      owner: req.userId,
      status: 'approved',
      applied: false
    }).sort({ createdAt: -1 });
    res.json({ request: request || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/unblock-request/:id', authenticate, async (req, res) => {
  try {
    const request = await UnblockRequest.findOne({ _id: req.params.id, owner: req.userId });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    res.json({ status: request.status, apps: request.apps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark an approved request as applied so it isn't re-applied.
router.post('/unblock-request/:id/applied', authenticate, async (req, res) => {
  try {
    const request = await UnblockRequest.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      { applied: true }
    );
    if (!request) return res.status(404).json({ error: 'Request not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
