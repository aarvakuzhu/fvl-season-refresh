require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── MongoDB connection (activates when MONGODB_URI is set) ──────────
let dbConnected = false;
if (process.env.MONGODB_URI) {
  const mongoose = require('mongoose');
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => { dbConnected = true; console.log('MongoDB connected'); })
    .catch(err => console.error('MongoDB error:', err));
}

// ── Placeholder Comment model (ready to use when DB is connected) ───
// const mongoose = require('mongoose');
// const Comment = mongoose.model('Comment', new mongoose.Schema({
//   section: String,
//   author:  String,
//   text:    String,
//   date:    { type: Date, default: Date.now }
// }));

// ── API routes ──────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: dbConnected ? 'connected' : 'not connected' });
});

// Future: comments API
// app.get('/api/comments', async (req, res) => { ... });
// app.post('/api/comments', async (req, res) => { ... });

// ── Serve frontend ───────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`FVL server running on port ${PORT}`);
});
