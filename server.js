require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const mongoose  = require('mongoose');
const { Team, Standing, Season, CoreMember, Decision, Comment, Config, DraftSave, RosterPlayer } = require('./models');

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
    const { season = 2, tier } = req.query;
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
    const { season = 2 } = req.query;
    const standings = await Standing.find({ season: Number(season) })
      .sort({ totalPoints: -1, championships: -1 });
    res.json(standings);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/standings/:teamName', async (req, res) => {
  try {
    const s = await Standing.findOneAndUpdate(
      { teamName: req.params.teamName, season: req.body.season || 2 },
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
    const { season = 2 } = req.query;
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

// ── Update April 2026 final standings endpoint ───────────────────────
app.post('/api/update-april-standings', async (req, res) => {
  try {
    const updates = [
      { teamName: 'FVL Falcons',  totalPoints: 24, championships: 2, seasonChampion: true,  aprilPoints: 3,  aprilChampion: false },
      { teamName: 'FVL Spartans', totalPoints: 19, championships: 2, seasonChampion: false, aprilPoints: 1,  aprilChampion: false },
      { teamName: 'FVL Titans',   totalPoints: 19, championships: 0, seasonChampion: false, aprilPoints: 3,  aprilChampion: false },
      { teamName: 'FVL Dragons',  totalPoints: 16, championships: 2, seasonChampion: false, aprilPoints: 6,  aprilChampion: true  },
      { teamName: 'FVL Panthers', totalPoints: 12, championships: 0, seasonChampion: false, aprilPoints: 2,  aprilChampion: false },
    ];
    for (const u of updates) {
      await Standing.findOneAndUpdate(
        { season: 2, teamName: u.teamName },
        {
          $set: {
            totalPoints: u.totalPoints,
            championships: u.championships,
            seasonChampion: u.seasonChampion,
            relegated: false,
          },
          $push: {
            monthlyResults: {
              month: 'April 2026',
              points: u.aprilPoints,
              champion: u.aprilChampion,
            },
          },
        },
        { upsert: false }
      );
    }
    res.json({ success: true, message: 'April 2026 standings updated. Falcons are Season 2 Champions!' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Season migration endpoint (one-time: season 1 → 2) ──────────────
app.post('/api/migrate-season', async (req, res) => {
  try {
    const results = await Promise.all([
      Team.updateMany(       { season: 1 }, { $set: { season: 2 } }),
      Standing.updateMany(   { season: 1 }, { $set: { season: 2 } }),
      CoreMember.updateMany( { season: 1 }, { $set: { season: 2 } }),
      Season.updateMany(     { number: 1 }, { $set: { number: 2, label: 'Season 2' } }),
    ]);
    res.json({
      success: true,
      teams:       results[0].modifiedCount,
      standings:   results[1].modifiedCount,
      coreMembers: results[2].modifiedCount,
      season:      results[3].modifiedCount,
      message: 'All season:1 records updated to season:2'
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Roster API ───────────────────────────────────────────────────────
app.get('/api/roster', async (req, res) => {
  try {
    const season = Number(req.query.season) || 3;
    const players = await RosterPlayer.find({ season }).sort({ name: 1 });
    res.json(players);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/roster', async (req, res) => {
  try {
    const { name, season = 3, displayName, s2team, role, tier, skills, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const doc = await RosterPlayer.findOneAndUpdate(
      { name, season },
      { name, season, displayName, s2team, role, tier, skills: skills || [], notes },
      { upsert: true, new: true }
    );
    res.json(doc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/roster/:id', async (req, res) => {
  try {
    const doc = await RosterPlayer.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk seed roster from Season 2 teams data
app.post('/api/roster/seed', async (req, res) => {
  try {
    const teams = await Team.find({ season: 2 });
    const CORE = new Set(['Amrendra','Ashok','Naren','Rahul','Sachin','Sunil']);
    const CAPTAINS = new Set(['Anil','Pratik','Harsha','Shanthan','Koti','Karthik S']);
    const OUT = new Set(['Kunal']);
    let created = 0, skipped = 0;
    for (const t of teams) {
      for (const p of (t.players || [])) {
        if (OUT.has(p.name)) { skipped++; continue; }
        const role = CAPTAINS.has(p.name) ? 'Captain' : CORE.has(p.name) ? 'Wingman' : 'Player';
        await RosterPlayer.findOneAndUpdate(
          { name: p.name, season: 3 },
          { name: p.name, season: 3, s2team: t.name.replace('FVL ',''), role, tier: p.tier || 'B', skills: p.skills || [] },
          { upsert: true, new: true }
        );
        created++;
      }
    }
    // Add new players not in S2
    for (const p of [{name:'Surendra Kings',s2team:'New'},{name:'Raja Vasu',s2team:'New'}]) {
      await RosterPlayer.findOneAndUpdate(
        { name: p.name, season: 3 },
        { name: p.name, season: 3, s2team: p.s2team, role: 'Player', tier: 'B', skills: [] },
        { upsert: true, new: true }
      );
      created++;
    }
    res.json({ success: true, created, skipped });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Draft Save — persist per user per season ─────────────────────────
app.post('/api/draft-save', async (req, res) => {
  try {
    const { user, season = 3, picks, teams, pickCount, complete } = req.body;
    if (!user) return res.status(400).json({ error: 'user required' });
    const doc = await DraftSave.findOneAndUpdate(
      { user, season },
      { user, season, picks, teams, pickCount, complete },
      { upsert: true, new: true }
    );
    res.json({ success: true, savedAt: doc.updatedAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/draft-save/:user', async (req, res) => {
  try {
    const season = Number(req.query.season) || 3;
    const doc = await DraftSave.findOne({ user: req.params.user, season });
    if (!doc) return res.json(null);
    res.json(doc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/draft-saves', async (req, res) => {
  try {
    const season = Number(req.query.season) || 3;
    const docs = await DraftSave.find({ season }).sort({ updatedAt: -1 });
    res.json(docs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Roster page ──────────────────────────────────────────────────────
app.get('/roster', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'roster.html'));
});

// ── Draft page ───────────────────────────────────────────────────────
app.get('/draft', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'draft.html'));
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
