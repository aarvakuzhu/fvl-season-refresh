require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const mongoose  = require('mongoose');
const { Team, Standing, Season, CoreMember, Decision, Comment, Config } = require('./models');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── MongoDB ───────────────────────────────────────────────────────────
let dbConnected = false;
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => { dbConnected = true; console.log('MongoDB connected'); })
    .catch(err => console.error('MongoDB error:', err.message));
} else {
  console.warn('MONGODB_URI not set');
}

// ── Health ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: dbConnected ? 'connected' : 'not connected' });
});

// ── Teams ─────────────────────────────────────────────────────────────
app.get('/api/teams', async (req, res) => {
  try {
    const { season = 1, tier } = req.query;
    const filter = { season: Number(season) };
    if (tier) filter.tier = tier;
    const teams = await Team.find(filter).sort({ name: 1 });
    res.json(teams);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/teams/:slug', async (req, res) => {
  try {
    const team = await Team.findOne({ slug: req.params.slug });
    if (!team) return res.status(404).json({ error: 'Not found' });
    res.json(team);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/teams/:slug', async (req, res) => {
  try {
    const team = await Team.findOneAndUpdate(
      { slug: req.params.slug },
      { $set: req.body },
      { new: true }
    );
    res.json(team);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Standings ─────────────────────────────────────────────────────────
app.get('/api/standings', async (req, res) => {
  try {
    const { season = 1 } = req.query;
    const standings = await Standing.find({ season: Number(season) })
      .sort({ totalPoints: -1, championships: -1 });
    res.json(standings);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/standings/:teamName', async (req, res) => {
  try {
    const s = await Standing.findOneAndUpdate(
      { teamName: req.params.teamName, season: req.body.season || 1 },
      { $set: req.body },
      { new: true, upsert: true }
    );
    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Season ────────────────────────────────────────────────────────────
app.get('/api/season/:number', async (req, res) => {
  try {
    const s = await Season.findOne({ number: Number(req.params.number) });
    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Core Members ──────────────────────────────────────────────────────
app.get('/api/core-members', async (req, res) => {
  try {
    const { season = 1 } = req.query;
    const members = await CoreMember.find({ season: Number(season) }).sort({ name: 1 });
    res.json(members);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Decisions ─────────────────────────────────────────────────────────
app.get('/api/decisions', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const decisions = await Decision.find(filter).sort({ status: 1, ref: 1 });
    res.json(decisions);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/decisions/:ref', async (req, res) => {
  try {
    const d = await Decision.findOneAndUpdate(
      { ref: req.params.ref },
      { $set: req.body },
      { new: true }
    );
    res.json(d);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Comments ──────────────────────────────────────────────────────────
app.get('/api/comments', async (req, res) => {
  try {
    const { section } = req.query;
    const filter = section ? { section } : {};
    const comments = await Comment.find(filter).sort({ createdAt: -1 });
    res.json(comments);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/comments', async (req, res) => {
  try {
    const { section, author, text } = req.body;
    if (!section || !author || !text)
      return res.status(400).json({ error: 'section, author, text required' });
    const c = await Comment.create({ section, author, text });
    res.status(201).json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin verify password ─────────────────────────────────────────────
app.post('/api/admin/verify', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ ok: false });
  try {
    const cfg = await Config.findOne({ key: 'admin_password' });
    if (!cfg) return res.status(503).json({ ok: false, error: 'Not configured' });
    res.json({ ok: cfg.value === password });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Seed ──────────────────────────────────────────────────────────────
app.post('/api/seed', async (req, res) => {
  if (!dbConnected) return res.status(503).json({ error: 'Database not connected' });

  const log = [];
  const say = msg => { log.push(msg); console.log(msg); };

  try {
    const seedData = require('./seed-data');

    say('Clearing existing data...');
    await Promise.all([
      Team.deleteMany({}),
      Standing.deleteMany({}),
      Season.deleteMany({}),
      CoreMember.deleteMany({}),
      Decision.deleteMany({}),
      Config.deleteMany({}),
    ]);

    say('Inserting teams...');
    const insertedTeams = await Team.insertMany(seedData.teams);
    say(`✓ ${insertedTeams.length} teams inserted`);

    say('Inserting standings...');
    const teamMap = {};
    insertedTeams.forEach(t => { teamMap[t.name] = t._id; });
    const standingsWithIds = seedData.standings.map(s => ({ ...s, teamId: teamMap[s.teamName] }));
    await Standing.insertMany(standingsWithIds);
    say(`✓ ${standingsWithIds.length} standings inserted`);

    say('Inserting season config...');
    await Season.create(seedData.season);
    say('✓ Season config inserted');

    say('Inserting core members...');
    await CoreMember.insertMany(seedData.coreMembers);
    say(`✓ ${seedData.coreMembers.length} core members inserted`);

    say('Inserting decisions...');
    await Decision.insertMany(seedData.decisions);
    say(`✓ ${seedData.decisions.length} decisions inserted`);

    say('Inserting config...');
    await Config.insertMany(seedData.config);
    say(`✓ ${seedData.config.length} config entries inserted`);

    say('✅ Seed complete');
    res.json({ success: true, log });
  } catch (e) {
    say('❌ Error: ' + e.message);
    res.status(500).json({ success: false, error: e.message, log });
  }
});

// ── Admin page ───────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ── Frontend (catch-all) ─────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`FVL running on port ${PORT}`));
