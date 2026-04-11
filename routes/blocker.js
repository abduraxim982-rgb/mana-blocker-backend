const express = require('express');
const router = express.Router();
const { BlockRule, BlockLog, Device } = require('../models');
const { authenticate } = require('../middleware/auth');

/**
 * POST /api/blocker/check
 * Called by device/browser extension to check if URL should be blocked
 * This is the CRITICAL endpoint — must be FAST
 */
router.post('/check', authenticate, async (req, res) => {
  try {
    const { url, deviceId } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });

    // Parse domain from URL
    let domain;
    try {
      domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
        .replace(/^www\./, '').toLowerCase();
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    // Find device
    const device = deviceId
      ? await Device.findOne({ deviceId, owner: req.userId })
      : null;

    if (!device?.blockerEnabled) {
      return res.json({ action: 'allow', reason: 'blocker_disabled' });
    }

    // Check schedule — is internet blocked right now?
    const scheduleBlocked = await checkSchedule(req.userId, device._id);
    if (scheduleBlocked) {
      await logBlock(device._id, req.userId, null, url, domain, 'schedule', 'blocked');
      return res.json({ action: 'block', reason: 'schedule', message: 'Internet blocked by schedule' });
    }

    // Find matching rules (exact domain match or wildcard)
    const rules = await BlockRule.find({
      owner: req.userId,
      isEnabled: true,
      $or: [
        { type: 'domain', value: domain },
        { type: 'domain', value: `*.${domain.split('.').slice(-2).join('.')}` },
        { type: 'url', value: { $regex: escapeRegex(url) } },
        { type: 'keyword', value: { $regex: new RegExp(domain, 'i') } }
      ]
    }).limit(1);

    if (rules.length > 0) {
      const rule = rules[0];
      rule.hitCount += 1;
      rule.lastHit = new Date();
      await rule.save();

      await logBlock(device._id, req.userId, rule._id, url, domain, rule.category, rule.action);

      // Emit real-time event
      const io = req.app.get('io');
      if (io) {
        io.to(`device:${deviceId}`).emit('url:blocked', {
          url, domain, category: rule.category, timestamp: new Date()
        });
      }

      return res.json({
        action: rule.action,
        reason: rule.type,
        category: rule.category,
        message: `${domain} is ${rule.action}ed`
      });
    }

    // Check built-in global rules
    const globalRule = await BlockRule.findOne({
      isGlobal: true,
      isEnabled: true,
      type: 'domain',
      value: domain
    });

    if (globalRule) {
      await logBlock(device._id, req.userId, globalRule._id, url, domain, globalRule.category, 'blocked');
      return res.json({ action: 'block', reason: 'global_rule', category: globalRule.category });
    }

    // Log allowed request (optional, for analytics)
    await logBlock(device._id, req.userId, null, url, domain, null, 'allowed');

    res.json({ action: 'allow', domain });
  } catch (err) {
    console.error('Blocker check error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/blocker/status/:deviceId
 * Get current blocker status for a device
 */
router.get('/status/:deviceId', authenticate, async (req, res) => {
  try {
    const device = await Device.findOne({
      deviceId: req.params.deviceId,
      owner: req.userId
    });

    if (!device) return res.status(404).json({ error: 'Device not found' });

    const rulesCount = await BlockRule.countDocuments({
      owner: req.userId,
      isEnabled: true
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayBlocked = await BlockLog.countDocuments({
      device: device._id,
      action: 'blocked',
      timestamp: { $gte: todayStart }
    });

    res.json({
      deviceId: device.deviceId,
      blockerEnabled: device.blockerEnabled,
      vpnEnabled: device.vpnEnabled,
      activeRules: rulesCount,
      todayBlockedCount: todayBlocked,
      lastSeen: device.lastSeen
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/blocker/toggle/:deviceId
 * Enable/disable blocker for a device
 */
router.patch('/toggle/:deviceId', authenticate, async (req, res) => {
  try {
    const { enabled } = req.body;
    const device = await Device.findOneAndUpdate(
      { deviceId: req.params.deviceId, owner: req.userId },
      { blockerEnabled: enabled },
      { new: true }
    );

    if (!device) return res.status(404).json({ error: 'Device not found' });

    // Notify device in real-time
    const io = req.app.get('io');
    if (io) {
      io.to(`device:${req.params.deviceId}`).emit('blocker:toggle', { enabled });
    }

    res.json({ message: `Blocker ${enabled ? 'enabled' : 'disabled'}`, device });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// HELPER FUNCTIONS
// =====================

async function checkSchedule(userId, deviceId) {
  const { Schedule } = require('../models');
  const now = new Date();
  const currentDay = now.getDay();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const schedule = await Schedule.findOne({
    owner: userId,
    $or: [{ device: deviceId }, { device: null }],
    isEnabled: true,
    daysOfWeek: currentDay,
    startTime: { $lte: currentTime },
    endTime: { $gte: currentTime },
    type: 'block_internet'
  });

  return !!schedule;
}

async function logBlock(deviceId, ownerId, ruleId, url, domain, category, action) {
  try {
    await BlockLog.create({
      device: deviceId,
      owner: ownerId,
      rule: ruleId,
      blockedUrl: url,
      domain,
      category,
      action
    });
  } catch (e) {
    // Don't fail on log error
    console.error('Log error:', e.message);
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = router;
