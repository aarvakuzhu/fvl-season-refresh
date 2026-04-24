require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const mongoose  = require('mongoose');
const { Team, Standing, Season, CoreMember, Decision, Comment, Config, Player, PlayerSeason, DraftSave } = require('./models');

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

// ── Player Registry API ──────────────────────────────────────────────

// ── helpers ──────────────────────────────────────────────────────────
// Build enriched player list from Team collection + Player enrichment.
// Team data is the source of truth for who played which season.
// Player collection stores skills/tier/displayName/notes enrichment.
async function buildPlayerList(seasonFilter) {
  const CORE     = new Set(['Amrendra','Ashok','Naren','Rahul','Sachin','Sunil']);
  const CAPTAINS = new Set(['Anil','Pratik','Harsha','Shanthan','Koti','Karthik S']);
  const OUT      = new Set(['Kunal']);
  const NEW_S3   = ['Surendra Kings','Raja Vasu'];

  // Load all teams (optionally filtered by season)
  const teamQuery = seasonFilter ? { season: seasonFilter } : {};
  const teams = await Team.find(teamQuery).sort({ season: 1 });

  // Collect unique player names and their season appearances
  const playerMap = {}; // name → { name, seasons:[] }
  for (const t of teams) {
    for (const p of (t.players || [])) {
      if (OUT.has(p.name)) continue;
      if (!playerMap[p.name]) playerMap[p.name] = { name: p.name, seasons: [] };
      playerMap[p.name].seasons.push({
        season: t.season,
        team: t.name.replace('FVL ',''),
        role: CAPTAINS.has(p.name) ? 'Captain' : CORE.has(p.name) ? 'Wingman' : 'Player',
      });
    }
  }
  // Add new S3 players not in any team yet
  for (const name of NEW_S3) {
    if (!playerMap[name]) playerMap[name] = { name, seasons: [{ season: 3, team: 'New', role: 'Player' }] };
  }

  // Load enrichment from Player collection (keyed by name)
  const enrichments = await Player.find({ name: { $in: Object.keys(playerMap) } });
  const enrichMap = {};
  enrichments.forEach(e => enrichMap[e.name] = e);

  // Merge
  return Object.values(playerMap).map(p => {
    const e = enrichMap[p.name] || {};
    return {
      _id:         e._id ? e._id.toString() : null,
      name:        p.name,
      displayName: e.displayName || null,
      label:       e.displayName || p.name,
      skills:      e.skills || [],
      tier:        e.tier || 'B',
      notes:       e.notes || null,
      active:      e.active !== false,
      seasons:     (p.seasons || []).sort((a,b) => a.season - b.season),
    };
  }).sort((a,b) => a.label.localeCompare(b.label));
}

// GET /api/players — all players merged from Team + Player enrichment
app.get('/api/players', async (req, res) => {
  try {
    const season = req.query.season ? Number(req.query.season) : null;
    res.json(await buildPlayerList(season));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/players/:id — update Player enrichment by _id
app.patch('/api/players/:id', async (req, res) => {
  try {
    const { name, displayName, skills, tier, notes, active } = req.body;
    const update = {};
    if (name        !== undefined) update.name = name;
    if (displayName !== undefined) update.displayName = displayName || null;
    if (skills      !== undefined) update.skills = skills;
    if (tier        !== undefined) update.tier = tier;
    if (notes       !== undefined) update.notes = notes || null;
    if (active      !== undefined) update.active = active;
    const doc = await Player.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/players/enrich — upsert a Player enrichment record by name (creates if not exists)
app.post('/api/players/enrich', async (req, res) => {
  try {
    const { name, displayName, skills, tier, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const doc = await Player.findOneAndUpdate(
      { name },
      { $set: { displayName: displayName||null, skills: skills||[], tier: tier||'B', notes: notes||null } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(doc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/roster — same data, for draft page compatibility (season-filtered)
app.get('/api/roster', async (req, res) => {
  try {
    const season = Number(req.query.season) || 3;
    const list = await buildPlayerList(season);
    // Return in shape the draft page expects
    res.json(list.map(p => ({
      _id:         p._id,
      name:        p.name,
      displayName: p.displayName,
      label:       p.label,
      skills:      p.skills,
      tier:        p.tier,
      s2team:      (p.seasons.find(s=>s.season===2)||p.seasons[0]||{}).team || '',
      role:        (p.seasons.find(s=>s.season===season)||p.seasons[p.seasons.length-1]||{}).role || 'Player',
      notes:       p.notes,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Draft Save — persist per user per season ─────────────────────────
app.post('/api/draft-save', async (req, res) => {
  try {
    const { user, season = 3, opt = 1, picks, teams, pickCount, complete } = req.body;
    if (!user) return res.status(400).json({ error: 'user required' });
    // Try with opt field first; fall back to legacy (user+season only) on duplicate key
    let doc;
    try {
      doc = await DraftSave.findOneAndUpdate(
        { user, season, opt: Number(opt) },
        { user, season, opt: Number(opt), picks, teams, pickCount, complete },
        { upsert: true, new: true }
      );
    } catch(e) {
      // Old index (user+season) conflict — update without opt filter
      doc = await DraftSave.findOneAndUpdate(
        { user, season },
        { user, season, opt: Number(opt), picks, teams, pickCount, complete },
        { upsert: true, new: true }
      );
    }
    res.json({ success: true, savedAt: doc.updatedAt, opt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/draft-save/:user', async (req, res) => {
  try {
    const season = Number(req.query.season) || 3;
    const opt    = req.query.opt ? Number(req.query.opt) : null;
    const query  = { user: req.params.user, season };
    if (opt) query.opt = opt;
    // If no opt specified, return most recent save for this user
    const doc = opt
      ? await DraftSave.findOne(query)
      : await DraftSave.findOne({ user: req.params.user, season }).sort({ updatedAt: -1 });
    if (!doc) return res.json(null);
    res.json(doc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/draft-saves', async (req, res) => {
  try {
    const season = Number(req.query.season) || 3;
    const docs = await DraftSave.find({ season }).sort({ opt: 1, user: 1 });
    res.json(docs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Compare two saves: GET /api/draft-compare?user1=Ashok&opt1=2&user2=Sachin&opt2=1
app.get('/api/draft-compare', async (req, res) => {
  try {
    const season = Number(req.query.season) || 3;
    const { user1, opt1=2, user2, opt2=1 } = req.query;
    // Find save — match on opt if field exists, else fall back to most recent for that user
    const findSave = async (user, opt) => {
      let doc = await DraftSave.findOne({ user, season, opt: Number(opt) });
      if (!doc) doc = await DraftSave.findOne({ user, season }).sort({ updatedAt: -1 });
      return doc;
    };
    const [d1, d2] = await Promise.all([findSave(user1, opt1), findSave(user2, opt2)]);
    if (!d1) return res.status(404).json({ error: `No draft found for ${user1}` });
    if (!d2) return res.status(404).json({ error: `No draft found for ${user2}` });

    // Build per-captain team maps
    const teamMap = (teams) => {
      const m = {};
      (teams||[]).forEach(t => { m[t.captain] = new Set(t.players||[]); });
      return m;
    };
    const m1 = teamMap(d1.teams), m2 = teamMap(d2.teams);
    const captains = [...new Set([...Object.keys(m1), ...Object.keys(m2)])];

    const comparison = captains.map(cap => {
      const s1 = m1[cap] || new Set(), s2 = m2[cap] || new Set();
      const allPlayers = [...new Set([...s1, ...s2])].sort();
      return {
        captain: cap,
        players: allPlayers.map(p => ({
          name: p,
          inOpt1: s1.has(p),
          inOpt2: s2.has(p),
          same: s1.has(p) && s2.has(p),
        })),
        onlyInA:    allPlayers.filter(p=>s1.has(p)&&!s2.has(p)).length,
        onlyInB:    allPlayers.filter(p=>s2.has(p)&&!s1.has(p)).length,
        sameCount:  allPlayers.filter(p=>s1.has(p)&&s2.has(p)).length,
        // diffCount = players who changed on this team = those only in A (they were replaced)
        // A player leaving one team always arrives at another — count once per swap not twice
        diffCount:  allPlayers.filter(p=>s1.has(p)&&!s2.has(p)).length,
      };
    });

    // totalSame = players who are on the same team in both drafts
    // totalDiff = number of swaps = players who moved teams (count once: only-in-A across all teams)
    // Each swap moves one player out of one team and into another — so onlyInA sum = number of swaps
    const totalSame = comparison.reduce((a,c)=>a+c.sameCount, 0);
    const playersMovd = comparison.reduce((a,c)=>a+c.onlyInA, 0); // each trade moves 2
    const totalSwaps = Math.round(playersMovd / 2); // actual trades
    const totalPlayers = 36; // fixed pool
    // Similarity: players correctly placed / total players
    const similarityPct = Math.round(totalSame / totalPlayers * 100);

    res.json({
      meta: {
        a: { user: user1, opt: Number(opt1), pickCount: d1.pickCount },
        b: { user: user2, opt: Number(opt2), pickCount: d2.pickCount },
        totalSame, totalDiff: playersMovd, totalSwaps, playersMovd,
        similarityPct,
      },
      teams: comparison,
      picksA: d1.picks,
      picksB: d2.picks,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Seed Ashok Option 2 draft (one-time) ────────────────────────────
app.post('/api/seed-ashok-draft', async (req, res) => {
  try {
    const nameMap = {
      'Venkat EZ Pass':'Venkat','Raja EZ Pass':'Raja Vasu','Sarva':'Saravanan',
      'Chandu':'Chandu','Pawan':'Pavan','Amar':'Amrendra','Ahmed':'Ahmed',
      'Mukesh':'Mukesh','Krishna':'Krishna','Kiran':'Kiran','Keshav':'Keshav',
      'Rahul':'Rahul','Rajesh':'Rajeshbabu','Krupa':'Krupa','Naren':'Naren',
      'Rajan':'Rajan','Chandra':'Chandra','Jugal':'Jugal','Ashok':'Ashok',
      'Rizwan':'Rizwan','Sachin':'Sachin','Vikas':'Vikas','Gopal':'Gopal',
      'Surendra Konga':'Surendra Kings','Suri':'Suri','Sunil Ji':'Sunil',
      'Uday B':'Uday K','Uday D':'Uday Dragon','Santosh':'Santosh',
      'Naveen':'Naveen','Divyanshu':'Divyanshu','Raja':'Raja S','Ronak':'Ronak',
      'Rakesh':'Rakesh','Gupta Ji':'Ritesh','Ishant':'Ishant',
    };
    const rawPicks = [
      [1,'Anil','Venkat EZ Pass'],[2,'Pratik','Raja EZ Pass'],[3,'Harsha','Sarva'],
      [4,'Anil','Chandu'],[5,'Pratik','Pawan'],[6,'Harsha','Amar'],
      [7,'Shanthan','Ahmed'],[8,'Koti','Mukesh'],[9,'Karthik S','Krishna'],
      [10,'Karthik S','Kiran'],[11,'Koti','Keshav'],[12,'Shanthan','Rahul'],
      [13,'Pratik','Rajesh'],[14,'Anil','Krupa'],[15,'Anil','Naren'],
      [16,'Harsha','Rajan'],[17,'Shanthan','Chandra'],[18,'Koti','Jugal'],
      [19,'Karthik S','Ashok'],[20,'Karthik S','Rizwan'],[21,'Koti','Sachin'],
      [22,'Shanthan','Vikas'],[23,'Harsha','Gopal'],[24,'Pratik','Surendra Konga'],
      [25,'Anil','Suri'],[26,'Pratik','Sunil Ji'],[27,'Harsha','Uday B'],
      [28,'Shanthan','Uday D'],[29,'Koti','Santosh'],[30,'Karthik S','Naveen'],
      [31,'Karthik S','Divyanshu'],[32,'Koti','Raja'],[33,'Shanthan','Ronak'],
      [34,'Harsha','Rakesh'],[35,'Pratik','Gupta Ji'],[36,'Anil','Ishant'],
    ];
    // Build Option 2 sequence for round labels
    const caps = [{name:'Anil',po:1,er:4},{name:'Pratik',po:2,er:3},{name:'Harsha',po:3,er:2},
                  {name:'Shanthan',po:4,er:1},{name:'Koti',po:5,er:1},{name:'Karthik S',po:6,er:1}];
    const seq=[]; let n=1;
    caps.filter(c=>c.er>1).sort((a,b)=>a.po-b.po).forEach(c=>seq.push({rk:0,captain:c.name,pickNum:n++}));
    for(let r=1;r<=6;r++){
      const active=caps.filter(c=>!(c.er===r&&c.er>1)).sort((a,b)=>a.po-b.po);
      const ordered=r%2===1?[...active]:[...active].reverse();
      ordered.forEach(c=>seq.push({rk:r,captain:c.name,pickNum:n++}));
    }
    const picks = rawPicks.map(([pickNum,captain,display])=>({
      round: seq.find(s=>s.pickNum===pickNum)?.rk,
      pickNum, captain,
      player: nameMap[display]||display,
      label: display, s2team:'—', ts: new Date(),
    }));
    const teamsMap = {};
    caps.forEach(c=>teamsMap[c.name]={captain:c.name,col:'#333',players:[]});
    picks.forEach(p=>teamsMap[p.captain].players.push(p.player));
    // Drop any existing save for Ashok S3 to avoid index conflicts
    await DraftSave.deleteMany({ user:'Ashok', season:3 });
    const doc = await DraftSave.create({
      user:'Ashok', season:3, opt:2, picks,
      teams:Object.values(teamsMap), pickCount:36, complete:true
    });
    res.json({ success:true, message:'Ashok Option 2 draft saved', pickCount:doc.pickCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Compare page ─────────────────────────────────────────────────────
app.get('/compare', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'compare.html'));
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

// ── Clone draft save ─────────────────────────────────────────────────
app.post('/api/draft-clone', async (req, res) => {
  try {
    const { fromUser, toUser, season = 3, opt = 2 } = req.body;
    const src = await DraftSave.findOne({ user: fromUser, season, opt })
      || await DraftSave.findOne({ user: fromUser, season }).sort({ updatedAt: -1 });
    if (!src) return res.status(404).json({ error: `No draft found for ${fromUser}` });
    await DraftSave.deleteMany({ user: toUser, season, opt });
    const clone = await DraftSave.create({
      user: toUser, season, opt,
      picks: src.picks, teams: src.teams,
      pickCount: src.pickCount, complete: src.complete,
    });
    res.json({ success: true, message: `Cloned ${fromUser} opt${opt} → ${toUser}`, pickCount: clone.pickCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
