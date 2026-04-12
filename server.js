 require('dotenv').config();
var express = require('express');
var mongoose = require('mongoose');
var cors = require('cors');
var helmet = require('helmet');
var morgan = require('morgan');
var app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/blocker', require('./routes/blocker'));
app.use('/api/rules', require('./routes/rules'));
app.use('/api/schedule', require('./routes/schedule'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/devices', require('./routes/devices'));
app.get('/health', function(req, res) {
  res.status(200).json({ status: 'OK' });
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
