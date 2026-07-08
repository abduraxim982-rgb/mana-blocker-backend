 require('dotenv').config();

// Fail-fast: refuse to start without a JWT secret. No insecure fallback.
// Never log the secret's value — only report that it is missing.
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}

var express = require('express');
var mongoose = require('mongoose');
var cors = require('cors');
var helmet = require('helmet');
var morgan = require('morgan');
var app = express();
// Behind Render's proxy: trust the first hop so req.ip is the real client IP.
// Required for the auth rate-limiter to bucket per real IP, not per proxy IP.
app.set('trust proxy', 1);

// Global guard: an unprotected promise rejection (e.g. a Telegram send that
// rejects with no .catch now that sendTelegram rethrows) must NEVER crash the
// process. Log it and keep serving. This is a safety net — call sites should
// still attach their own try/catch or .catch().
process.on('unhandledRejection', function(reason) {
  console.error('UNHANDLED REJECTION (jarayon tirik qoldi):', (reason && reason.message) || reason);
});

app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(morgan('combined'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/blocker', require('./routes/blocker'));
app.use('/api/rules', require('./routes/rules'));
app.use('/api/schedule', require('./routes/schedule'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/accountability', require('./routes/accountability'));
app.use('/api/telegram', require('./routes/telegram'));
app.get('/health', function(req, res) {
  // version = deploy qilingan commit SHA. Render runtime'da RENDER_GIT_COMMIT'ni
  // avtomatik beradi (qo'lda yangilash shart emas); lokalда 'local'.
  res.status(200).json({
    status: 'ok',
    version: (process.env.RENDER_GIT_COMMIT || 'local').slice(0, 7)
  });
});
app.use(function(req, res) {
  res.status(404).json({ error: 'Not found' });
});
var PORT = process.env.PORT || 3000;
var MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/mana_blocker';
app.listen(PORT, '0.0.0.0', function() {
  console.log('Server running on port ' + PORT);
});

mongoose.connect(MONGO).then(function() {
  console.log('MongoDB connected');
}).catch(function(e) {
  console.error('MongoDB error:', e.message);
});

// Heartbeat watchdog: every 5 min, alert the partner ONCE when a user with a
// linked partner has gone silent for 30+ min (uninstall / force-stop / kill /
// safe-mode). The 30-min grace prevents false alarms from a dead battery, no
// internet, or a phone that's simply off. Users who never pinged (lastHeartbeat
// null) are ignored, so existing users aren't spammed.
var HEARTBEAT_STALE_MS = 30 * 60 * 1000;
setInterval(function() {
  (async function() {
    try {
      var models = require('./models');
      var telegram = require('./utils/telegram');
      var cutoff = new Date(Date.now() - HEARTBEAT_STALE_MS);
      var stale = await models.User.find({
        partnerChatId: { $ne: null },
        lastHeartbeat: { $ne: null, $lt: cutoff },
        heartbeatAlertSent: { $ne: true }
      });
      for (var i = 0; i < stale.length; i++) {
        var u = stale[i];
        var displayName = u.name || u.email || 'Foydalanuvchi';
        try {
          await telegram.sendTelegram(u.partnerChatId,
            '⚠️ <b>Mana</b> ' + displayName + ' qurilmasida 30 daqiqadan beri ' +
            'javob bermayapti — o\'chirilgan yoki to\'xtatilgan bo\'lishi mumkin.');
          u.heartbeatAlertSent = true;
          await u.save();
        } catch (e) {
          console.error('heartbeat alert send failed:', e.message);
        }
      }
    } catch (e) {
      console.error('heartbeat watchdog error:', e.message);
    }
  })();
}, 5 * 60 * 1000);

