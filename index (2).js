const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ============================================================
// USER MODEL
// ============================================================
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  role: { type: String, enum: ['admin', 'parent', 'child'], default: 'parent' },
  avatar: { type: String, default: null },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  devices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Device' }]
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// ============================================================
// DEVICE MODEL
// ============================================================
const deviceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  deviceId: { type: String, required: true, unique: true }, // UUID from device
  platform: { type: String, enum: ['android', 'ios', 'windows', 'macos', 'linux'], required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // child user
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date },
  blockerEnabled: { type: Boolean, default: true },
  vpnEnabled: { type: Boolean, default: false },
  dnsServer: { type: String, default: '1.1.1.1' },
  ipAddress: { type: String },
  appVersion: { type: String },
  pushToken: { type: String } // for notifications
}, { timestamps: true });

// ============================================================
// BLOCK RULE MODEL
// ============================================================
const blockRuleSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' }, // null = all devices
  type: {
    type: String,
    enum: ['domain', 'url', 'keyword', 'category', 'app'],
    required: true
  },
  value: { type: String, required: true, trim: true, lowercase: true },
  category: {
    type: String,
    enum: ['adult', 'gambling', 'social_media', 'gaming', 'violence', 'drugs', 'custom', 'ads', 'malware'],
    default: 'custom'
  },
  action: { type: String, enum: ['block', 'warn', 'log'], default: 'block' },
  isEnabled: { type: Boolean, default: true },
  isGlobal: { type: Boolean, default: false }, // Anthropic pre-built rules
  hitCount: { type: Number, default: 0 },
  lastHit: { type: Date },
  note: { type: String, trim: true }
}, { timestamps: true });

// Index for fast lookup
blockRuleSchema.index({ owner: 1, isEnabled: 1 });
blockRuleSchema.index({ value: 1 });

// ============================================================
// SCHEDULE MODEL
// ============================================================
const scheduleSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
  name: { type: String, required: true },
  type: { type: String, enum: ['block_internet', 'block_categories', 'screen_time'], default: 'block_categories' },
  categories: [{ type: String }], // blocked during schedule
  daysOfWeek: [{ type: Number, min: 0, max: 6 }], // 0=Sun, 6=Sat
  startTime: { type: String, required: true }, // "HH:mm" format
  endTime: { type: String, required: true },   // "HH:mm" format
  timezone: { type: String, default: 'Asia/Tashkent' },
  isEnabled: { type: Boolean, default: true },
  maxDailyMinutes: { type: Number, default: null } // screen time limit
}, { timestamps: true });

// ============================================================
// BLOCK LOG MODEL (analytics)
// ============================================================
const blockLogSchema = new mongoose.Schema({
  device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rule: { type: mongoose.Schema.Types.ObjectId, ref: 'BlockRule' },
  blockedUrl: { type: String, required: true },
  domain: { type: String },
  category: { type: String },
  action: { type: String, enum: ['blocked', 'warned', 'logged', 'allowed'] },
  timestamp: { type: Date, default: Date.now },
  userAgent: { type: String },
  ipAddress: { type: String }
}, { timestamps: false });

// TTL index - logs auto-delete after 90 days
blockLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });
blockLogSchema.index({ device: 1, timestamp: -1 });
blockLogSchema.index({ owner: 1, timestamp: -1 });

// ============================================================
// CATEGORY LIST MODEL (built-in + custom)
// ============================================================
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String },
  domains: [{ type: String }], // list of domains in this category
  isBuiltIn: { type: Boolean, default: false },
  isEnabled: { type: Boolean, default: true },
  icon: { type: String },
  color: { type: String }
}, { timestamps: true });

module.exports = {
  User: mongoose.model('User', userSchema),
  Device: mongoose.model('Device', deviceSchema),
  BlockRule: mongoose.model('BlockRule', blockRuleSchema),
  Schedule: mongoose.model('Schedule', scheduleSchema),
  BlockLog: mongoose.model('BlockLog', blockLogSchema),
  Category: mongoose.model('Category', categorySchema)
};
