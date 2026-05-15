require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const mongoose  = require('mongoose');
const { Team, Standing, Season, CoreMember, Decision, Comment, Config, Player, PlayerSeason, DraftSave, S3Team, MonthlyEvent, S3Standing, PlayerProfile } = require('./models');

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
  // Single source of truth: PlayerProfile collection
  const profiles = await PlayerProfile.find().sort({ shortName: 1 });
  return profiles
    .filter(p => !seasonFilter || (p.seasons||[]).some(s=>s.season===Number(seasonFilter)))
    .map(p => {
      const inactive = !(p.seasons||[]).some(s=>s.season===3);
      return {
        _id:         p._id.toString(),
        name:        p.shortName,
        displayName: null,
        label:       p.shortName,
        photo:       p.photo || null,
        skills:      p.skills || [],
        tier:        'B',
        notes:       null,
        inactive,
        seasons:     (p.seasons||[]).sort((a,b)=>a.season-b.season),
      };
    });
}

// GET /api/players — all players merged from Team + Player enrichment
app.get('/api/players', async (req, res) => {
  try {
    const season = req.query.season ? Number(req.query.season) : null;
    res.json(await buildPlayerList(season));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/players/:id — update PlayerProfile skills (single source of truth)
app.patch('/api/players/:id', async (req, res) => {
  try {
    const { skills, notes } = req.body;
    const update = {};
    if (skills !== undefined) update.skills = skills;
    const doc = await PlayerProfile.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ _id: doc._id.toString(), name: doc.shortName, label: doc.shortName, photo: doc.photo, skills: doc.skills, seasons: doc.seasons, inactive: !(doc.seasons||[]).some(s=>s.season===3) });
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

// ═══════════════════════════════════════════════════════════════════════
// PLAYER PROFILES — unified registry across seasons
// ═══════════════════════════════════════════════════════════════════════

const PLAYER_REGISTRY = [
  {name:"Anil",photo:'https://lh3.googleusercontent.com/d/1LXwgRP3DQmxbWw1DX1sHRC07Vhv1vSRF=w400',skills:["Spiker", "Defense"],seasons:[{season:2,team:"Dragons",role:"Player",championMonths:["March 2026", "April 2026"],seasonChampion:false},{season:3,team:"Dragons",role:"Captain",championMonths:[],seasonChampion:false}]},
  {name:"Shanthan",photo:'https://lh3.googleusercontent.com/d/1DjV6Kzs7QOdaCIElzf-yZazWfO0sbLKe=w400',skills:["Setter", "Defense"],seasons:[{season:2,team:"Dragons",role:"Captain",championMonths:["March 2026", "April 2026"],seasonChampion:false},{season:3,team:"Raptors",role:"Captain",championMonths:[],seasonChampion:false}]},
  {name:"Naren",photo:'https://lh3.googleusercontent.com/d/1uqSxsnYiRC__K14trVDG_guZA1k_qUYA=w400',skills:["Spiker", "Defense"],seasons:[{season:2,team:"Dragons",role:"Wingman",championMonths:["March 2026", "April 2026"],seasonChampion:false},{season:3,team:"Dragons",role:"Wingman",championMonths:[],seasonChampion:false}]},
  {name:"Ahmed",photo:'https://lh3.googleusercontent.com/d/10Ssg4vyAAAJowHroxkO32r0ljX7kf5-L=w400',skills:["Setter", "Spiker"],seasons:[{season:2,team:"Dragons",role:"Player",championMonths:["March 2026", "April 2026"],seasonChampion:false},{season:3,team:"Raptors",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Keshav",photo:'https://lh3.googleusercontent.com/d/1Z3Bjg2tBY9AGHj-mbi0YRwjrk2WauObU=w400',skills:["Setter", "Defense"],seasons:[{season:2,team:"Dragons",role:"Player",championMonths:["March 2026", "April 2026"],seasonChampion:false},{season:3,team:"Spartans",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Pawan",photo:'https://lh3.googleusercontent.com/d/19SlcPbRo_DkrUIFoIgnJqGHyNzbl6Mr8=w400',skills:["Setter", "Spiker"],seasons:[{season:2,team:"Dragons",role:"Player",championMonths:["March 2026", "April 2026"],seasonChampion:false},{season:3,team:"Predators",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Saravanan",photo:'https://lh3.googleusercontent.com/d/1bv7OOQ8zajkhY8ZcxY3fOtT6DqXW_r0n=w400',skills:["Setter", "Spiker", "Defense"],seasons:[{season:2,team:"Dragons",role:"Player",championMonths:["March 2026", "April 2026"],seasonChampion:false},{season:3,team:"Dragons",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Suri",photo:'https://lh3.googleusercontent.com/d/1zmKmrnF_FS2ZIg8joi-YK6s0dnL0Mdph=w400',skills:["Setter", "Defense"],seasons:[{season:2,team:"Dragons",role:"Player",championMonths:["March 2026", "April 2026"],seasonChampion:false},{season:3,team:"Spartans",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Uday K",photo:'https://lh3.googleusercontent.com/d/1WL-1MnBWTmAb_uzfYcCGpwxHD9LxdYzv=w400',skills:["Defense"],seasons:[{season:2,team:"Dragons",role:"Player",championMonths:["March 2026", "April 2026"],seasonChampion:false},{season:3,team:"Raptors",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Karthik",photo:'https://lh3.googleusercontent.com/d/1ZLKY_80v1la-szX88WBUsCICxrluLnG_=w400',skills:["Spiker", "Defense"],seasons:[{season:2,team:"Falcons",role:"Captain",championMonths:["November 2025", "February 2026"],seasonChampion:true},{season:3,team:"Falcons",role:"Captain",championMonths:[],seasonChampion:false}]},
  {name:"Ashok",photo:'https://lh3.googleusercontent.com/d/1thRn6lVicqxfWiGIp5tcYAPZrn7DtSJd=w400',skills:["Setter", "Spiker", "Defense"],seasons:[{season:2,team:"Falcons",role:"Wingman",championMonths:["November 2025", "February 2026"],seasonChampion:true},{season:3,team:"Falcons",role:"Wingman",championMonths:[],seasonChampion:false}]},
  {name:"Harsha",photo:'https://lh3.googleusercontent.com/d/1ok9HvGIZaFQBzZUoHLPZqt63Lf-orrs2=w400',skills:["Setter", "Spiker"],seasons:[{season:2,team:"Falcons",role:"Player",championMonths:["November 2025", "February 2026"],seasonChampion:true},{season:3,team:"Predators",role:"Captain",championMonths:[],seasonChampion:false}]},
  {name:"Naveen",photo:'https://lh3.googleusercontent.com/d/1QrNWkDz4RfImHnB_A6puWcnvyJxEQqct=w400',skills:["Setter", "Defense"],seasons:[{season:2,team:"Falcons",role:"Player",championMonths:["November 2025", "February 2026"],seasonChampion:true},{season:3,team:"Falcons",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Raja S",photo:'https://lh3.googleusercontent.com/d/118N4-eWR-Gb4y1DayA1sHuII2Pp42x_K=w400',skills:["Setter", "Spiker", "Defense"],seasons:[{season:2,team:"Falcons",role:"Player",championMonths:["November 2025", "February 2026"],seasonChampion:true},{season:3,team:"Falcons",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Rajesh",photo:'https://lh3.googleusercontent.com/d/1UA0q7sI441cChlhCphizJrBGtlH9nmG9=w400',skills:["Spiker"],seasons:[{season:2,team:"Falcons",role:"Player",championMonths:["November 2025", "February 2026"],seasonChampion:true},{season:3,team:"Titans",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Ritesh",photo:'https://lh3.googleusercontent.com/d/19-IotE0V-ru58IIqqis7BqCpW312Rxvy=w400',skills:["Defense"],seasons:[{season:2,team:"Falcons",role:"Player",championMonths:["November 2025", "February 2026"],seasonChampion:true},{season:3,team:"Titans",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Rizwan",photo:'https://lh3.googleusercontent.com/d/1wdGn6Bk7qSwIuJIq9RGnYsaI5ViJooR5=w400',skills:["Setter", "Defense"],seasons:[{season:2,team:"Falcons",role:"Player",championMonths:["November 2025", "February 2026"],seasonChampion:true},{season:3,team:"Raptors",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Krishna",photo:'https://lh3.googleusercontent.com/d/1aPmdpvPDtbTXst9NC_0eWwoKjE7NjcRy=w400',skills:["Setter", "Spiker", "Defense"],seasons:[{season:2,team:"Panthers",role:"Captain",championMonths:[],seasonChampion:false},{season:3,team:"Spartans",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Sachin",photo:'https://lh3.googleusercontent.com/d/1XTMIap-OJRPTZaTIp7UwPP6prsAg7pMD=w400',skills:["Setter", "Spiker", "Defense"],seasons:[{season:2,team:"Panthers",role:"Wingman",championMonths:[],seasonChampion:false},{season:3,team:"Predators",role:"Wingman",championMonths:[],seasonChampion:false}]},
  {name:"Chandu",photo:'https://lh3.googleusercontent.com/d/1GnS7MfBPsXBdgE7uIjK9HiwvVyaeVzsV=w400',skills:["Defense"],seasons:[{season:2,team:"Panthers",role:"Player",championMonths:[],seasonChampion:false},{season:3,team:"Titans",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Chandra",photo:null,skills:[],seasons:[{season:2,team:"Panthers",role:"Player",championMonths:[],seasonChampion:false},{season:3,team:"Raptors",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Divyanshu",photo:'https://lh3.googleusercontent.com/d/1sgMR2FMWf5IvO1rXjkvAtS1cxAugPch7=w400',skills:["Defense"],seasons:[{season:2,team:"Panthers",role:"Player",championMonths:[],seasonChampion:false},{season:3,team:"Falcons",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Gopal",photo:'https://lh3.googleusercontent.com/d/1aPksBf35huLJUT5hW9RO9yI9mqXDeTo9=w400',skills:["Setter"],seasons:[{season:2,team:"Panthers",role:"Player",championMonths:[],seasonChampion:false},{season:3,team:"Predators",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Krupa",photo:'https://lh3.googleusercontent.com/d/1_L4e8OEFbTT8U2bSJNAypDRi3KdHCzpH=w400',skills:["Setter"],seasons:[{season:2,team:"Panthers",role:"Player",championMonths:[],seasonChampion:false},{season:3,team:"Dragons",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Mukhesh",photo:'https://lh3.googleusercontent.com/d/1yvlzIxCulNYnF72K6-BdI7fOoIFqWRmM=w400',skills:["Spiker", "Defense"],seasons:[{season:2,team:"Panthers",role:"Player",championMonths:[],seasonChampion:false},{season:3,team:"Predators",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Koti",photo:'https://lh3.googleusercontent.com/d/1mqArlyDfPZ3ZrvGXTJvmkftqkboVAFbP=w400',skills:["Spiker"],seasons:[{season:2,team:"Spartans",role:"Captain",championMonths:["December 2025", "January 2026"],seasonChampion:false},{season:3,team:"Spartans",role:"Captain",championMonths:[],seasonChampion:false}]},
  {name:"Amrendra",photo:'https://lh3.googleusercontent.com/d/1TnjwV0Q8QlxJNxQaiOR9z1FY2IgNB1bQ=w400',skills:["Spiker"],seasons:[{season:2,team:"Spartans",role:"Wingman",championMonths:["December 2025", "January 2026"],seasonChampion:false},{season:3,team:"Raptors",role:"Wingman",championMonths:[],seasonChampion:false}]},
  {name:"Jugal",photo:null,skills:[],seasons:[{season:2,team:"Spartans",role:"Player",championMonths:["December 2025", "January 2026"],seasonChampion:false},{season:3,team:"Dragons",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Kiran",photo:'https://lh3.googleusercontent.com/d/1Ylv0as5NWKY31RxkMEww0VboTpO2zUYy=w400',skills:["Setter", "Defense"],seasons:[{season:2,team:"Spartans",role:"Player",championMonths:["December 2025", "January 2026"],seasonChampion:false},{season:3,team:"Falcons",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Rakesh",photo:'https://lh3.googleusercontent.com/d/1T7efu_V3Ao0CxvXf54MeXh9HGaQmuLaJ=w400',skills:["Defense"],seasons:[{season:2,team:"Spartans",role:"Player",championMonths:["December 2025", "January 2026"],seasonChampion:false},{season:3,team:"Predators",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Rajan",photo:'https://lh3.googleusercontent.com/d/1jg6XbVr2--trvNKwVEHsIBklwPkoJxI1=w400',skills:["Setter"],seasons:[{season:2,team:"Spartans",role:"Player",championMonths:["December 2025", "January 2026"],seasonChampion:false},{season:3,team:"Spartans",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Santosh",photo:'https://lh3.googleusercontent.com/d/1IOQOx0I5u7BkHXvSaCq18D_veTY2WvK4=w400',skills:["Defense"],seasons:[{season:2,team:"Spartans",role:"Player",championMonths:["December 2025", "January 2026"],seasonChampion:false},{season:3,team:"Spartans",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Uday B",photo:'https://lh3.googleusercontent.com/d/1DoVcp-Q1g1LNbNJEqY96uVnzggLhRYbq=w400',skills:["Setter"],seasons:[{season:2,team:"Spartans",role:"Player",championMonths:["December 2025", "January 2026"],seasonChampion:false},{season:3,team:"Predators",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Pratik",photo:'https://lh3.googleusercontent.com/d/1ctl4St-YHark0lyu6FHDY2X1729Ksu3Y=w400',skills:["Setter", "Spiker", "Defense"],seasons:[{season:2,team:"Titans",role:"Captain",championMonths:[],seasonChampion:false},{season:3,team:"Titans",role:"Captain",championMonths:[],seasonChampion:false}]},
  {name:"Rahul",photo:'https://lh3.googleusercontent.com/d/1Td2x_QuFJ1cPpQ-se_4Ld0Csf3Vhuyd2=w400',skills:["Setter", "Spiker", "Defense"],seasons:[{season:2,team:"Titans",role:"Wingman",championMonths:[],seasonChampion:false},{season:3,team:"Spartans",role:"Wingman",championMonths:[],seasonChampion:false}]},
  {name:"Ishant",photo:'https://lh3.googleusercontent.com/d/1sDEmid2ZVfTufncdVuiF5Vem3odx-54M=w400',skills:["Setter", "Defense"],seasons:[{season:2,team:"Titans",role:"Player",championMonths:[],seasonChampion:false},{season:3,team:"Dragons",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Kunal",photo:'https://lh3.googleusercontent.com/d/1VsDhL2S7mDTw_F6DBc68ENyjDgtLQutM=w400',skills:["Setter", "Spiker", "Defense"],seasons:[{season:2,team:"Titans",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Ronak",photo:'https://lh3.googleusercontent.com/d/1H4soPf2ztA_uVzYgq9YLIG9EXMHjmW6k=w400',skills:["Setter", "Defense"],seasons:[{season:2,team:"Titans",role:"Player",championMonths:[],seasonChampion:false},{season:3,team:"Raptors",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Sunil",photo:'https://lh3.googleusercontent.com/d/1Q3fmG04rvczPhhG-_ore8l96gzcx3jji=w400',skills:["Defense"],seasons:[{season:2,team:"Titans",role:"Player",championMonths:[],seasonChampion:false},{season:3,team:"Titans",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Venkat",photo:'https://lh3.googleusercontent.com/d/1ps-h13q6IkvqRIY5WQKh5xyts4XClMYV=w400',skills:["Spiker"],seasons:[{season:2,team:"Titans",role:"Player",championMonths:[],seasonChampion:false},{season:3,team:"Dragons",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Vikas",photo:'https://lh3.googleusercontent.com/d/1p0HpAAfsCQDj6RJhxJB6HuIMFgPYmdix=w400',skills:["Spiker"],seasons:[{season:2,team:"Titans",role:"Player",championMonths:[],seasonChampion:false},{season:3,team:"Falcons",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Raja Vasu",photo:null,skills:[],seasons:[{season:3,team:"Titans",role:"Player",championMonths:[],seasonChampion:false}]},
  {name:"Surendra K",photo:'https://lh3.googleusercontent.com/d/1LeTFALHEyQ_yR5f1dgrbu-9zd48rEZ-l=w400',skills:["Setter"],seasons:[{season:3,team:"Titans",role:"Player",championMonths:[],seasonChampion:false}]},
];

// ── POST /api/players/seed-profiles ──────────────────────────────────
app.post('/api/players/seed-profiles', async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== S3_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
    let created = 0, updated = 0;
    for (const p of PLAYER_REGISTRY) {
      const doc = await PlayerProfile.findOneAndUpdate(
        { shortName: p.name },
        { shortName: p.name, photo: p.photo, skills: p.skills, seasons: p.seasons },
        { upsert: true, new: true }
      );
      if (doc.createdAt === doc.updatedAt) created++; else updated++;
    }
    res.json({ success: true, created, updated, total: PLAYER_REGISTRY.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/players/profile/:name ───────────────────────────────────
app.get('/api/players/profile/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const profile = await PlayerProfile.findOne({ shortName: name });
    if (!profile) return res.status(404).json({ error: 'Player not found' });
    
    // Augment S3 champion months live from standings
    const s3standing = await S3Standing.findOne({ season: 3, team: profile.seasons.find(s=>s.season===3)?.team });
    const s3season = profile.seasons.find(s=>s.season===3);
    if (s3season && s3standing) {
      s3season.championMonths = (s3standing.months||[]).filter(m=>m.champion).map(m=>m.label);
    }
    
    res.json(profile);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/players/profiles ─────────────────────────────────────────
app.get('/api/players/profiles', async (req, res) => {
  try {
    const profiles = await PlayerProfile.find().sort({ shortName: 1 });
    res.json(profiles);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/admin/seed-status ───────────────────────────────────────────
app.get('/api/admin/seed-status', async (req, res) => {
  try {
    const [events, profiles] = await Promise.all([
      MonthlyEvent.findOne({ season: 3 }).sort({ updatedAt: -1 }),
      require('./models').PlayerProfile.findOne().sort({ updatedAt: -1 }),
    ]);
    const dates = await MonthlyEvent.find({ season: 3 }).sort({ month: 1 }).select('month label date updatedAt');
    res.json({
      schedule: {
        lastSeeded: events?.updatedAt || null,
        dates: dates.map(d => ({ month: d.month, label: d.label, date: d.date, updatedAt: d.updatedAt })),
      },
      playerProfiles: {
        lastSeeded: profiles?.updatedAt || null,
      },
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/s3/update-dates ─────────────────────────────────────────────
// Updates only tournament dates — does NOT touch teams, results, or standings
app.post('/api/s3/update-dates', async (req, res) => {
  try {
    const { password, dates } = req.body; // dates: [{month, date}]
    if (password !== S3_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
    const updated = [];
    for (const { month, date } of (dates || [])) {
      const ev = await MonthlyEvent.findOneAndUpdate(
        { season: 3, month: Number(month) },
        { date },
        { new: true }
      );
      if (ev) updated.push({ month, date, label: ev.label });
    }
    res.json({ success: true, updated });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

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



// /api/draft-clone — retired

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
  { month:1, label:'May 2026',      date:'Sun 17 May 2026' },
  { month:2, label:'June 2026',     date:'Sun 21 Jun 2026' },
  { month:3, label:'July 2026',     date:'Sun 19 Jul 2026' },
  { month:4, label:'August 2026',   date:'Sun 2 Aug 2026' },
  { month:5, label:'September 2026',date:'Sun 6 Sep 2026' },
  { month:6, label:'October 2026',  date:'Sun 4 Oct 2026' },
];

// Per-month RR schedules — hardcoded by team name.
// Bye pairs per month (teams that don't play each other):
//   May: Dragons-Spartans | Predators-Titans | Falcons-Raptors
//   Jun: Dragons-Predators | Falcons-Spartans | Titans-Raptors
//   Jul: Dragons-Raptors   | Predators-Falcons | Spartans-Titans
//   Aug: Dragons-Predators | Falcons-Titans    | Spartans-Raptors
//   Sep: Dragons-Falcons   | Predators-Spartans | Titans-Raptors
//   Oct: Dragons-Titans    | Predators-Raptors  | Falcons-Spartans
// Season pairs (miss each other twice): Dragons↔Predators, Falcons↔Spartans, Titans↔Raptors
// Court balance: all teams exactly 12 C1 / 12 C2 across season
// Start time: all teams 4× 2:00 PM and 2× 2:25 PM
// Max back-to-back: May=3 (unavoidable), all other months=2
// No team ever sits out 2 consecutive slots
const MONTH_SCHEDULES = [
  // May (month 1) — bye: Dragons-Spartans, Predators-Titans, Falcons-Raptors
  // Opens: Falcons vs Titans (C1) | Dragons vs Predators (C2)
  [
    { slot:0, c1:['Falcons','Titans'],    c2:['Dragons','Predators'] },
    { slot:1, c1:['Spartans','Raptors'],  c2:['Dragons','Falcons']   },
    { slot:2, c1:['Predators','Spartans'],c2:['Dragons','Titans']    },
    { slot:3, c1:['Predators','Falcons'], c2:['Titans','Raptors']    },
    { slot:4, c1:['Spartans','Titans'],   c2:['Dragons','Raptors']   },
    { slot:5, c1:['Predators','Raptors'], c2:['Falcons','Spartans']  },
  ],
  // Jun (month 2) — bye: Dragons-Predators, Falcons-Spartans, Titans-Raptors
  // Opens: Predators vs Spartans (C1) | Dragons vs Falcons (C2)
  [
    { slot:0, c1:['Predators','Spartans'],c2:['Dragons','Falcons']   },
    { slot:1, c1:['Dragons','Titans'],    c2:['Predators','Raptors'] },
    { slot:2, c1:['Falcons','Titans'],    c2:['Spartans','Raptors']  },
    { slot:3, c1:['Dragons','Spartans'],  c2:['Predators','Falcons'] },
    { slot:4, c1:['Predators','Titans'],  c2:['Dragons','Raptors']   },
    { slot:5, c1:['Falcons','Raptors'],   c2:['Spartans','Titans']   },
  ],
  // Jul (month 3) — bye: Dragons-Raptors, Predators-Falcons, Spartans-Titans
  // Opens: Titans vs Raptors (C1) | Dragons vs Spartans (C2)
  [
    { slot:0, c1:['Titans','Raptors'],    c2:['Dragons','Spartans']  },
    { slot:1, c1:['Falcons','Spartans'],  c2:['Dragons','Predators'] },
    { slot:2, c1:['Predators','Titans'],  c2:['Falcons','Raptors']   },
    { slot:3, c1:['Spartans','Raptors'],  c2:['Dragons','Titans']    },
    { slot:4, c1:['Dragons','Falcons'],   c2:['Predators','Spartans']},
    { slot:5, c1:['Falcons','Titans'],    c2:['Predators','Raptors'] },
  ],
  // Aug (month 4) — bye: Dragons-Predators, Falcons-Titans, Spartans-Raptors
  // Opens: Dragons vs Titans (C1) | Predators vs Raptors (C2)
  [
    { slot:0, c1:['Dragons','Titans'],    c2:['Predators','Raptors'] },
    { slot:1, c1:['Predators','Spartans'],c2:['Dragons','Falcons']   },
    { slot:2, c1:['Titans','Raptors'],    c2:['Falcons','Spartans']  },
    { slot:3, c1:['Dragons','Raptors'],   c2:['Predators','Titans']  },
    { slot:4, c1:['Dragons','Spartans'],  c2:['Predators','Falcons'] },
    { slot:5, c1:['Falcons','Raptors'],   c2:['Spartans','Titans']   },
  ],
  // Sep (month 5) — bye: Dragons-Falcons, Predators-Spartans, Titans-Raptors
  // Opens: Spartans vs Titans (C1) | Falcons vs Raptors (C2)
  [
    { slot:0, c1:['Spartans','Titans'],   c2:['Falcons','Raptors']   },
    { slot:1, c1:['Falcons','Spartans'],  c2:['Dragons','Predators'] },
    { slot:2, c1:['Predators','Raptors'], c2:['Dragons','Titans']    },
    { slot:3, c1:['Falcons','Titans'],    c2:['Spartans','Raptors']  },
    { slot:4, c1:['Dragons','Spartans'],  c2:['Predators','Falcons'] },
    { slot:5, c1:['Dragons','Raptors'],   c2:['Predators','Titans']  },
  ],
  // Oct (month 6) — bye: Dragons-Titans, Predators-Raptors, Falcons-Spartans
  // Opens: Predators vs Falcons (C1) | Spartans vs Raptors (C2)
  [
    { slot:0, c1:['Predators','Falcons'], c2:['Spartans','Raptors']  },
    { slot:1, c1:['Falcons','Titans'],    c2:['Dragons','Predators'] },
    { slot:2, c1:['Dragons','Spartans'],  c2:['Titans','Raptors']    },
    { slot:3, c1:['Predators','Spartans'],c2:['Falcons','Raptors']   },
    { slot:4, c1:['Predators','Titans'],  c2:['Dragons','Falcons']   },
    { slot:5, c1:['Dragons','Raptors'],   c2:['Spartans','Titans']   },
  ],
];

function buildGames(monthIdx) {
  const sched = MONTH_SCHEDULES[monthIdx];
  const games = [];
  sched.forEach(({ slot, c1, c2 }) => {
    games.push({ slot, type:'rr', teamA:c1[0], teamB:c1[1], court:1, scoreA:null, scoreB:null, played:false });
    games.push({ slot, type:'rr', teamA:c2[0], teamB:c2[1], court:2, scoreA:null, scoreB:null, played:false });
  });
  // Finals slots
  games.push({ slot:6, type:'semi1', teamA:'#1', teamB:'#4', court:1, scoreA:null, scoreB:null, played:false });
  games.push({ slot:6, type:'semi2', teamA:'#2', teamB:'#3', court:2, scoreA:null, scoreB:null, played:false });
  games.push({ slot:7, type:'final',  teamA:'#W1', teamB:'#W2', court:1, scoreA:null, scoreB:null, played:false });
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
      const monthIdx = m.month - 1;
      const games = buildGames(monthIdx);
      const positions = ['Dragons','Predators','Falcons','Spartans','Titans','Raptors']; // kept for RR standings compat
      const ev = await MonthlyEvent.findOneAndUpdate(
        { season: 3, month: m.month },
        { ...m, season: 3, rotation: monthIdx, positions, games, locked: false, champion: null },
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
    const { password, month, gameIndex, scoreA, scoreB, clear } = req.body;
    if (password !== S3_PASSWORD) return res.status(401).json({ error: 'Wrong password' });

    const ev = await MonthlyEvent.findOne({ season: 3, month: Number(month) });
    if (!ev) return res.status(404).json({ error: 'Event not found' });
    if (ev.locked) return res.status(400).json({ error: 'Event is locked' });

    if (clear) {
      ev.games[gameIndex].scoreA = null;
      ev.games[gameIndex].scoreB = null;
      ev.games[gameIndex].played = false;
      ev.markModified('games');
      // Recalculate playoffs with updated standings
      const rrAfterClear = ev.games.filter(g => g.type === 'rr' && g.played);
      const ranked = computeRRStandings(ev.games.filter(g=>g.type==='rr'), ev.positions);
      const fg = ev.games.find(g=>g.type==='final');
      const tg = ev.games.find(g=>g.type==='third');
      const fig = ev.games.find(g=>g.type==='fifth');
      const s1g = ev.games.find(g=>g.type==='semi1');
      const s2g = ev.games.find(g=>g.type==='semi2');
      if (s1g) { s1g.teamA = rrAfterClear.length ? ranked[0] : '#1'; s1g.teamB = rrAfterClear.length ? ranked[3] : '#4'; }
      if (s2g) { s2g.teamA = rrAfterClear.length ? ranked[1] : '#2'; s2g.teamB = rrAfterClear.length ? ranked[2] : '#3'; }
      if (fg)  { fg.teamA = '#W1'; fg.teamB = '#W2'; }
      ev.markModified('games');
      await ev.save();
      return res.json({ success: true, game: ev.games[gameIndex] });
    }

    ev.games[gameIndex].scoreA = scoreA;
    ev.games[gameIndex].scoreB = scoreB;
    ev.games[gameIndex].played = true;
    ev.markModified('games');

    // Recalculate playoff seedings after every result save (not just at 12)
    const rrGames = ev.games.filter(g => g.type === 'rr' && g.played);
    if (rrGames.length >= 1) {
      const ranked = computeRRStandings(ev.games.filter(g=>g.type==='rr'), ev.positions);
      const finalGame  = ev.games.find(g=>g.type==='final');
      const thirdGame  = ev.games.find(g=>g.type==='third');
      const fifthGame  = ev.games.find(g=>g.type==='fifth');
      // New bracket: semi1=#1v#4, semi2=#2v#3, final=W1 vs W2. No 3rd/4th or 5th/6th games.
      const semi1Game = ev.games.find(g=>g.type==='semi1');
      const semi2Game = ev.games.find(g=>g.type==='semi2');
      if (semi1Game) { semi1Game.teamA = ranked[0]; semi1Game.teamB = ranked[3]; } // #1 vs #4
      if (semi2Game) { semi2Game.teamA = ranked[1]; semi2Game.teamB = ranked[2]; } // #2 vs #3
      // Final: winners of both semis (TBD until semis played)
      if (finalGame) {
        const s1w = semi1Game?.played ? (semi1Game.scoreA>semi1Game.scoreB?semi1Game.teamA:semi1Game.teamB) : '#W1';
        const s2w = semi2Game?.played ? (semi2Game.scoreA>semi2Game.scoreB?semi2Game.teamA:semi2Game.teamB) : '#W2';
        finalGame.teamA = s1w;
        finalGame.teamB = s2w;
      }
      ev.markModified('games');
    }

    // After semi played → update final with winners
    const savedGame = ev.games[gameIndex];
    if ((savedGame.type === 'semi1' || savedGame.type === 'semi2') && savedGame.played) {
      const finalGame = ev.games.find(g=>g.type==='final');
      const s1 = ev.games.find(g=>g.type==='semi1');
      const s2 = ev.games.find(g=>g.type==='semi2');
      if (finalGame) {
        finalGame.teamA = s1?.played ? (s1.scoreA>s1.scoreB?s1.teamA:s1.teamB) : '#W1';
        finalGame.teamB = s2?.played ? (s2.scoreA>s2.scoreB?s2.teamA:s2.teamB) : '#W2';
        ev.markModified('games');
      }
    }
    // If semi cleared → reset final placeholder
    if (clear && (ev.games[gameIndex].type === 'semi1' || ev.games[gameIndex].type === 'semi2')) {
      const finalGame = ev.games.find(g=>g.type==='final');
      const isS1 = ev.games[gameIndex].type === 'semi1';
      if (finalGame) {
        if (isS1) finalGame.teamA = '#W1'; else finalGame.teamB = '#W2';
        ev.markModified('games');
      }
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
      st.totalPoints   = st.months.reduce((a,m)=>a+(m.points||0),0);
      st.totalWins     = st.months.reduce((a,m)=>a+(m.points||0),0); // points = wins, same thing
      st.championships = st.months.filter(m=>m.champion||m.position===1).length;
      await st.save();
    }

    res.json({ success: true, champion, ranked });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/s3/standings ─────────────────────────────────────────────
app.get('/api/s3/standings', async (req, res) => {
  try {
    // Sort: 6-step tiebreaker chain
    let standings = await S3Standing.find({ season:3 });
    standings = standings.sort((a,b) => {
      // 1. Total season points (= total wins)
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      // 2. Most monthly championships
      if ((b.championships||0) !== (a.championships||0)) return (b.championships||0) - (a.championships||0);
      // 3. Most monthly runner-up finishes
      const bRU = (b.months||[]).filter(m=>m.position===2).length;
      const aRU = (a.months||[]).filter(m=>m.position===2).length;
      if (bRU !== aRU) return bRU - aRU;
      // 4. Best cumulative score differential (all completed games)
      const bDiff = (b.months||[]).reduce((s,m)=>s+(m.scoreDiff||0),0);
      const aDiff = (a.months||[]).reduce((s,m)=>s+(m.scoreDiff||0),0);
      if (bDiff !== aDiff) return bDiff - aDiff;
      // 5. Best average points scored per game (1 decimal, all completed games)
      const bGames = (b.months||[]).reduce((s,m)=>s+(m.gamesPlayed||0),0);
      const aGames = (a.months||[]).reduce((s,m)=>s+(m.gamesPlayed||0),0);
      const bAvg = bGames ? (b.months||[]).reduce((s,m)=>s+(m.ptsFor||0),0) / bGames : 0;
      const aAvg = aGames ? (a.months||[]).reduce((s,m)=>s+(m.ptsFor||0),0) / aGames : 0;
      if (Math.round(bAvg*10) !== Math.round(aAvg*10)) return Math.round(bAvg*10) - Math.round(aAvg*10);
      // 6. Coin toss — Tournament Director
      return 0;
    });
    res.json(standings);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Helpers ───────────────────────────────────────────────────────────
function computeRRStandings(rrGames, positions) {
  const stats = {};
  positions.forEach(t => { stats[t] = { wins:0, losses:0, points:0, scoreDiff:0, ptsFor:0, gamesPlayed:0 }; });
  rrGames.filter(g=>g.played).forEach(g => {
    const a = g.teamA, b = g.teamB;
    const sa = g.scoreA, sb = g.scoreB;
    if (!stats[a] || !stats[b]) return;
    stats[a].scoreDiff += (sa - sb);  stats[b].scoreDiff += (sb - sa);
    stats[a].ptsFor    += sa;         stats[b].ptsFor    += sb;
    stats[a].gamesPlayed++;           stats[b].gamesPlayed++;
    if (sa > sb) {
      stats[a].wins++; stats[a].points++;
      stats[b].losses++;
    } else {
      stats[b].wins++; stats[b].points++;
      stats[a].losses++;
    }
  });
  return Object.entries(stats)
    .sort(([,a],[,b]) => {
      // 1. RR wins
      if (b.points !== a.points) return b.points - a.points;
      // 2. Score differential
      if (b.scoreDiff !== a.scoreDiff) return b.scoreDiff - a.scoreDiff;
      // 3. Average points scored per game (rounded to 1 decimal)
      const aAvg = a.gamesPlayed ? a.ptsFor / a.gamesPlayed : 0;
      const bAvg = b.gamesPlayed ? b.ptsFor / b.gamesPlayed : 0;
      if (Math.round(bAvg*10) !== Math.round(aAvg*10)) return Math.round(bAvg*10) - Math.round(aAvg*10);
      // 4. Coin toss — Tournament Director
      return 0;
    })
    .map(([t]) => t);
}

function computeFullStandings(ev) {
  const result = {};
  const rrGames    = ev.games.filter(g=>g.type==='rr'&&g.played);
  const semi1Game  = ev.games.find(g=>g.type==='semi1'&&g.played);
  const semi2Game  = ev.games.find(g=>g.type==='semi2'&&g.played);
  const finalGame  = ev.games.find(g=>g.type==='final'&&g.played);

  // 1pt per win across all games (RR + semis + final). No bonus.
  const ranked = computeRRStandings(rrGames, ev.positions);

  ranked.forEach((team, i) => {
    const myRR = rrGames.filter(g=>g.teamA===team||g.teamB===team);
    const rrWins = myRR.filter(g=>(g.teamA===team&&g.scoreA>g.scoreB)||(g.teamB===team&&g.scoreB>g.scoreA)).length;
    const scoreDiff = myRR.reduce((a,g)=>a+(g.teamA===team?g.scoreA-g.scoreB:g.scoreB-g.scoreA),0);

    // Count playoff wins
    let poWins = 0;
    for (const pg of [semi1Game, semi2Game, finalGame]) {
      if (!pg) continue;
      if (pg.teamA===team && pg.scoreA>pg.scoreB) poWins++;
      if (pg.teamB===team && pg.scoreB>pg.scoreA) poWins++;
    }

    // Determine final position
    let position = i+1; // fallback to RR rank
    if (finalGame) {
      const champ   = finalGame.scoreA>finalGame.scoreB?finalGame.teamA:finalGame.teamB;
      const runnerup= finalGame.scoreA>finalGame.scoreB?finalGame.teamB:finalGame.teamA;
      if (team===champ) position=1;
      else if (team===runnerup) position=2;
      else if ([semi1Game,semi2Game].some(sg=>sg&&(sg.teamA===team||sg.teamB===team))) position=3; // semi loser
      else position = i+1; // 5th/6th by RR
    }

    // Points for/against across ALL completed games (RR + playoff)
    const allGames = ev.games.filter(g=>g.played && (g.teamA===team||g.teamB===team));
    const ptsFor     = allGames.reduce((a,g)=>a+(g.teamA===team?g.scoreA:g.scoreB),0);
    const ptsAgainst = allGames.reduce((a,g)=>a+(g.teamA===team?g.scoreB:g.scoreA),0);
    const allDiff    = ptsFor - ptsAgainst;
    const gamesPlayed = allGames.length;

    result[team] = {
      position,
      rrWins,
      playoffWins: poWins,
      points: rrWins + poWins,
      scoreDiff: allDiff,
      ptsFor,
      ptsAgainst,
      gamesPlayed,
      champion: position===1,
      runnerup: position===2,
    };
  });
  return result;
}



app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`FVL running on port ${PORT}`));
