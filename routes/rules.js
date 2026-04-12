const express = require('express');
const router = express.Router();
const axios = require('axios');
const { BlockRule } = require('../models');
const { authenticate } = require('../middleware/auth');

const CATEGORIES = {
  'adult': 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn/hosts',
  'gambling': 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/gambling/hosts',
  'social': 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/fakenews-gambling-porn-social/hosts',
  'ads': 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts'
};

router.get('/categories', authenticate, (req, res) => {
  res.json({ categories: Object.keys(CATEGORIES) });
});

router.post('/import/:category', authenticate, async (req, res) => {
  try {
    const url = CATEGORIES[req.params.category];
    if (!url) return res.status(400).json({ error: 'Invalid category' });
    const response = await axios.get(url);
    const lines = response.data.split('\n');
    const batch = [];
    for (const line of lines) {
      if (line.startsWith('0.0.0.0 ')) {
        const domain = line.split(' ')[1]?.trim();
        if (domain && domain !== '0.0.0.0') {
          batch.push({ owner: req.userId, type: 'domain', value: domain, category: req.params.category, action: 'block', isEnabled: true, isGlobal: false });
        }
      }
    }
    await BlockRule.insertMany(batch.slice(0, 5000), { ordered: false }).catch(() => {});
    res.json({ message: `Imported ${batch.length} domains`, category: req.params.category });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const rules = await BlockRule.find({ owner: req.userId }).sort({ createdAt: -1 });
    res.json({ rules });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const rule = await BlockRule.create({ ...req.body, owner: req.userId });
    res.status(201).json({ rule });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await BlockRule.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    res.json({ message: 'Deleted' });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;