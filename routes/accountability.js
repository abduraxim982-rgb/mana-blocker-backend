const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { User } = require('../models');
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
  try {
    const message = req.body.message;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partnerChatId) return res.json({ sent: false, reason: 'no_partner' });
    const displayName = user.name || user.email || 'Foydalanuvchi';
    await sendTelegram(user.partnerChatId, `🔓 <b>${displayName}</b> ${message}`);
    res.json({ sent: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
