require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const mongoose  = require('mongoose');
const { Team, Standing, Season, CoreMember, Decision, Comment, Config, Player, PlayerSeason, DraftSave, S3Team, MonthlyEvent, S3Standing } = require('./models');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── MongoDB ───────────────────────────────────────────────────────────
let dbConnected = false;
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
      dbConnected = true;
      console.log('MongoDB connected');
      // Drop old unique index (user+season) if it exists — replaced by (user+season+opt)
      try {
        await mongoose.connection.collection('draftsaves').dropIndex('user_1_season_1');
        console.log('Dropped old DraftSave index user_1_season_1');
      } catch(e) { /* index may not exist — that's fine */ }
    })
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

// /api/seed — retired

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


// /api/seed-naren-draft — retired

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

// /api/seed-ashok-draft — retired

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
    // Delete ANY existing save for toUser+season+opt (handles old index remnants)
    await DraftSave.deleteMany({ user: toUser, season });
    const clone = await DraftSave.create({
      user: toUser, season, opt: Number(opt),
      picks: src.picks, teams: src.teams,
      pickCount: src.pickCount, complete: src.complete,
    });
    res.json({ success: true, message: `Cloned ${fromUser} opt${opt} → ${toUser}`, pickCount: clone.pickCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════
// SEASON 3 — TEAMS, SCHEDULE, RESULTS, STANDINGS
// ═══════════════════════════════════════════════════════════════════════

const S3_PASSWORD = process.env.S3_ADMIN_PASS || 'fvl2026'; // default: fvl2026

// Season 3 team data
const S3_TEAMS = [
  { name:'Dragons',   captain:'Anil',     color:'#c62828', slug:'dragons',
    players:['Ishant','Jugal','Krupa','Naren','Saravanan','Venkat'] },
  { name:'Predators', captain:'Harsha',   color:'#1b5e20', slug:'predators',
    players:['Gopal','Mukhesh','Pawan','Rakesh','Sachin','Uday B'] },
  { name:'Falcons',   captain:'Karthik',  color:'#1a3566', slug:'falcons',
    players:['Ashok','Divyanshu','Kiran','Naveen','Raja S','Vikas'] },
  { name:'Spartans',  captain:'Koti',     color:'#311b92', slug:'spartans',
    players:['Keshav','Krishna','Rahul','Rajan','Santosh','Suri'] },
  { name:'Titans',    captain:'Pratik',   color:'#e65100', slug:'titans',
    players:['Chandu','Raja Vasu','Rajesh','Ritesh','Sunil','Surendra K'] },
  { name:'Raptors',   captain:'Shanthan', color:'#004d40', slug:'raptors',
    players:['Ahmed','Amrendra','Chandra','Rizwan','Ronak','Uday K'] },
];

// Month schedule: May–Oct 2026 (Sundays)
const S3_MONTHS = [
  { month:1, label:'May 2026',      date:'Sun 3 May 2026' },
  { month:2, label:'June 2026',     date:'Sun 7 Jun 2026' },
  { month:3, label:'July 2026',     date:'Sun 5 Jul 2026' },
  { month:4, label:'August 2026',   date:'Sun 2 Aug 2026' },
  { month:5, label:'September 2026',date:'Sun 6 Sep 2026' },
  { month:6, label:'October 2026',  date:'Sun 4 Oct 2026' },
];

// Fixed RR matchup pairs (positions T1-T6, not real teams)
// Each slot: [[posA, posB, court], [posA, posB, court]]
const RR_SLOTS = [
  [[1,2,1],[3,5,2]],
  [[1,3,1],[4,6,2]],
  [[2,4,1],[1,5,2]],
  [[2,6,1],[3,4,2]],
  [[1,6,1],[4,5,2]],
  [[2,3,1],[5,6,2]],
];

// Shift-right rotation: month 0 = base order, each month shifts all teams right by 1
function getPositions(monthIdx) {
  // Base: Dragons=0, Predators=1, ..., Raptors=5
  const base = S3_TEAMS.map(t => t.name);
  const n = base.length;
  // Shift right by monthIdx: team[i] goes to position (i + monthIdx) % n
  const positions = new Array(n);
  base.forEach((team, i) => { positions[(i + monthIdx) % n] = team; });
  return positions; // positions[0] = T1, positions[1] = T2, etc.
}

function buildGames(positions) {
  const games = [];
  let slot = 0;
  RR_SLOTS.forEach(([g1, g2]) => {
    games.push({ slot, type:'rr', teamA:positions[g1[0]-1], teamB:positions[g1[1]-1], court:g1[2], scoreA:null, scoreB:null, played:false });
    games.push({ slot, type:'rr', teamA:positions[g2[0]-1], teamB:positions[g2[1]-1], court:g2[2], scoreA:null, scoreB:null, played:false });
    slot++;
  });
  // Finals slots (teams determined after RR — placeholders)
  games.push({ slot:6, type:'fifth',  teamA:'#5', teamB:'#6', court:1, scoreA:null, scoreB:null, played:false });
  games.push({ slot:6, type:'third',  teamA:'#3', teamB:'#4', court:2, scoreA:null, scoreB:null, played:false });
  games.push({ slot:7, type:'final',  teamA:'#1', teamB:'#2', court:1, scoreA:null, scoreB:null, played:false });
  return games;
}

// ── GET /api/s3/teams ─────────────────────────────────────────────────
app.get('/api/s3/teams', async (req, res) => {
  try {
    let teams = await S3Team.find().sort({ name: 1 });
    if (!teams.length) teams = S3_TEAMS; // fallback to hardcoded
    res.json(teams);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/s3/seed ─────────────────────────────────────────────────
app.post('/api/s3/seed', async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== S3_PASSWORD) return res.status(401).json({ error: 'Wrong password' });

    // Seed teams
    for (const t of S3_TEAMS) {
      await S3Team.findOneAndUpdate({ name: t.name }, t, { upsert: true, new: true });
    }

    // Seed all 6 monthly events
    const events = [];
    for (const m of S3_MONTHS) {
      const positions = getPositions(m.month - 1);
      const games = buildGames(positions);
      const ev = await MonthlyEvent.findOneAndUpdate(
        { season: 3, month: m.month },
        { ...m, season: 3, rotation: m.month - 1, positions, games, locked: false, champion: null },
        { upsert: true, new: true }
      );
      events.push(ev);
    }

    // Seed empty standings
    for (const t of S3_TEAMS) {
      await S3Standing.findOneAndUpdate(
        { season: 3, team: t.name },
        { season: 3, team: t.name, months: [], totalPoints: 0, totalWins: 0, championships: 0 },
        { upsert: true, new: true }
      );
    }

    res.json({ success: true, teams: S3_TEAMS.length, events: events.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/s3/schedule ──────────────────────────────────────────────
app.get('/api/s3/schedule', async (req, res) => {
  try {
    const events = await MonthlyEvent.find({ season: 3 }).sort({ month: 1 });
    res.json(events);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/s3/event/:month ──────────────────────────────────────────
app.get('/api/s3/event/:month', async (req, res) => {
  try {
    const ev = await MonthlyEvent.findOne({ season: 3, month: Number(req.params.month) });
    if (!ev) return res.status(404).json({ error: 'Event not found' });
    res.json(ev);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/s3/result ───────────────────────────────────────────────
// Save game result: { password, month, gameIndex, scoreA, scoreB }
app.post('/api/s3/result', async (req, res) => {
  try {
    const { password, month, gameIndex, scoreA, scoreB } = req.body;
    if (password !== S3_PASSWORD) return res.status(401).json({ error: 'Wrong password' });

    const ev = await MonthlyEvent.findOne({ season: 3, month: Number(month) });
    if (!ev) return res.status(404).json({ error: 'Event not found' });
    if (ev.locked) return res.status(400).json({ error: 'Event is locked' });

    ev.games[gameIndex].scoreA = scoreA;
    ev.games[gameIndex].scoreB = scoreB;
    ev.games[gameIndex].played = true;
    ev.markModified('games');

    // After all RR games played, compute standings and update final teams
    const rrGames = ev.games.filter(g => g.type === 'rr' && g.played);
    if (rrGames.length === 12) {
      const ranked = computeRRStandings(ev.games.filter(g=>g.type==='rr'), ev.positions);
      // Update final game teams
      const finalGame  = ev.games.find(g=>g.type==='final');
      const thirdGame  = ev.games.find(g=>g.type==='third');
      const fifthGame  = ev.games.find(g=>g.type==='fifth');
      if (finalGame) { finalGame.teamA = ranked[0]; finalGame.teamB = ranked[1]; }
      if (thirdGame) { thirdGame.teamA = ranked[2]; thirdGame.teamB = ranked[3]; }
      if (fifthGame) { fifthGame.teamA = ranked[4]; fifthGame.teamB = ranked[5]; }
      ev.markModified('games');
    }

    await ev.save();
    res.json({ success: true, game: ev.games[gameIndex] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/s3/lock/:month ──────────────────────────────────────────
// Lock month, record champion, update season standings
app.post('/api/s3/lock/:month', async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== S3_PASSWORD) return res.status(401).json({ error: 'Wrong password' });

    const ev = await MonthlyEvent.findOne({ season: 3, month: Number(req.params.month) });
    if (!ev) return res.status(404).json({ error: 'Event not found' });

    // Determine final standings from all played games
    const rrGames = ev.games.filter(g=>g.type==='rr'&&g.played);
    const ranked = computeRRStandings(rrGames, ev.positions);
    const finalGame = ev.games.find(g=>g.type==='final'&&g.played);
    const champion = finalGame
      ? (finalGame.scoreA > finalGame.scoreB ? finalGame.teamA : finalGame.teamB)
      : ranked[0];

    ev.champion = champion;
    ev.locked = true;
    await ev.save();

    // Compute full month standings: position per team
    const monthStandings = computeFullStandings(ev);
    for (const [team, data] of Object.entries(monthStandings)) {
      const st = await S3Standing.findOne({ season:3, team });
      if (!st) continue;
      // Remove existing entry for this month if re-locking
      st.months = st.months.filter(m => m.month !== ev.month);
      st.months.push({ month: ev.month, label: ev.label, ...data, champion: team === champion });
      st.totalPoints  = st.months.reduce((a,m)=>a+(m.points||0),0);
      st.totalWins    = st.months.reduce((a,m)=>a+(m.wins||0),0);
      st.championships = st.months.filter(m=>m.champion).length;
      await st.save();
    }

    res.json({ success: true, champion, ranked });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/s3/standings ─────────────────────────────────────────────
app.get('/api/s3/standings', async (req, res) => {
  try {
    const standings = await S3Standing.find({ season:3 }).sort({ championships:-1, totalPoints:-1 });
    res.json(standings);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Helpers ───────────────────────────────────────────────────────────
function computeRRStandings(rrGames, positions) {
  const stats = {};
  positions.forEach(t => { stats[t] = { wins:0, losses:0, points:0, scoreDiff:0 }; });
  rrGames.filter(g=>g.played).forEach(g => {
    const a = g.teamA, b = g.teamB;
    const sa = g.scoreA, sb = g.scoreB;
    if (!stats[a] || !stats[b]) return;
    stats[a].scoreDiff += (sa - sb);
    stats[b].scoreDiff += (sb - sa);
    if (sa > sb) {
      stats[a].wins++; stats[a].points += 2;
      stats[b].losses++;
    } else {
      stats[b].wins++; stats[b].points += 2;
      stats[a].losses++;
    }
  });
  return Object.entries(stats)
    .sort(([,a],[,b]) => b.points-a.points || b.scoreDiff-a.scoreDiff)
    .map(([t]) => t);
}

function computeFullStandings(ev) {
  const result = {};
  const rrGames = ev.games.filter(g=>g.type==='rr'&&g.played);
  const ranked = computeRRStandings(rrGames, ev.positions);
  ranked.forEach((team, i) => {
    const g = rrGames.filter(g=>g.teamA===team||g.teamB===team);
    const wins   = g.filter(g=>(g.teamA===team&&g.scoreA>g.scoreB)||(g.teamB===team&&g.scoreB>g.scoreA)).length;
    const losses = g.length - wins;
    const scoreDiff = g.reduce((a,g)=>a+(g.teamA===team?g.scoreA-g.scoreB:g.scoreB-g.scoreA),0);
    result[team] = { position: i+1, wins, losses, points: wins*2, scoreDiff };
  });
  return result;
}

// ── Sitemap ──────────────────────────────────────────────────────────────
app.get('/sitemap', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sitemap.html'));
});

// ── Season 2 history page ────────────────────────────────────────────────
app.get('/season2', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'season2.html'));
});

// ── Season 3 page ─────────────────────────────────────────────────────
app.get('/season3', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'season3.html'));
});
