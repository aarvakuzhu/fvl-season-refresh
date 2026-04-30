const mongoose = require('mongoose');

// ── Team & Players (embedded — legacy Season 2 data) ─────────────────
const PlayerSchema = new mongoose.Schema({
  name:    { type: String, required: true },
  role:    { type: String, enum: ['Captain','Wingman','Player'], default: 'Player' },
  tier:    { type: String, enum: ['S','A','B','C'], default: 'B' },
  skills:  [{ type: String }],
  active:  { type: Boolean, default: true },
});

const TeamSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  slug:      { type: String, required: true },
  tier:      { type: String, enum: ['Mini','Nano'], default: 'Mini' },
  season:    { type: Number, required: true },
  color:     { type: String, default: '#2b5ba8' },
  gradient:  { type: String },
  players:   [PlayerSchema],
  active:    { type: Boolean, default: true },
  exception: { type: String },
}, { timestamps: true });

// ── Season Standings ──────────────────────────────────────────────────
const MonthlyResultSchema = new mongoose.Schema({
  month:    { type: String, required: true },
  position: { type: Number },
  wins:     { type: Number, default: 0 },
  points:   { type: Number, default: 0 },
  champion: { type: Boolean, default: false },
  runnerUp: { type: Boolean, default: false },
  relegated:{ type: Boolean, default: false },
});

const StandingSchema = new mongoose.Schema({
  season:         { type: Number, required: true },
  teamId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  teamName:       { type: String, required: true },
  totalPoints:    { type: Number, default: 0 },
  monthlyResults: [MonthlyResultSchema],
  championships:  { type: Number, default: 0 },
  finalPosition:  { type: Number },
  relegated:      { type: Boolean, default: false },
  seasonChampion: { type: Boolean, default: false },
}, { timestamps: true });

// ── Season Config ─────────────────────────────────────────────────────
const SeasonSchema = new mongoose.Schema({
  number:      { type: Number, required: true, unique: true },
  label:       { type: String },
  status:      { type: String, enum: ['active','completed','upcoming'], default: 'active' },
  startDate:   { type: Date },
  endDate:     { type: Date },
  miniTeams:   { type: Number, default: 4 },
  nanoTeams:   { type: Number, default: 0 },
  draftFormat: { type: String, enum: ['auction','snake'], default: 'snake' },
  notes:       { type: String },
}, { timestamps: true });

// ── Core Members ──────────────────────────────────────────────────────
const CoreMemberSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  role:         { type: String, enum: ['Mini Wingman','Nano Coordinator','Floating','League Manager'] },
  assignedTeam: { type: String },
  season:       { type: Number },
  active:       { type: Boolean, default: true },
}, { timestamps: true });

// ── Decisions ─────────────────────────────────────────────────────────
const DecisionSchema = new mongoose.Schema({
  ref:        { type: String, required: true },
  topic:      { type: String, required: true },
  description:{ type: String },
  priority:   { type: String, enum: ['High','Medium','Low'], default: 'Medium' },
  status:     { type: String, enum: ['open','closed'], default: 'open' },
  resolution: { type: String },
  closedDate: { type: Date },
}, { timestamps: true });

// ── Comments ──────────────────────────────────────────────────────────
const CommentSchema = new mongoose.Schema({
  section:  { type: String, required: true },
  author:   { type: String, required: true },
  text:     { type: String, required: true },
  resolved: { type: Boolean, default: false },
}, { timestamps: true });

// ── App Config ────────────────────────────────────────────────────────
const ConfigSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: String, required: true },
}, { timestamps: true });

// ═══════════════════════════════════════════════════════════════════════
// PLAYER REGISTRY — one record per real person, shared across seasons
// Skills, tier, display name describe the person — not season-specific
// ═══════════════════════════════════════════════════════════════════════
const PlayerModelSchema = new mongoose.Schema({
  name:        { type: String, required: true },       // canonical name (not unique — use _id as key)
  displayName: { type: String },                       // nickname e.g. "Amar" for Amrendra
  skills:      [{ type: String }],                     // ['Spiker','Setter','Defense','Allrounder','Developing']
  tier:        { type: String, enum: ['S','A','B','C'], default: 'B' },
  notes:       { type: String },
  active:      { type: Boolean, default: true },
}, { timestamps: true });

// No unique index on name — _id is the canonical identifier
// Two players can share a first name; disambiguate by displayName or notes

// ── PlayerSeason — per-season participation record ─────────────────────
// Role and team change season to season — tracked here.
// One player can appear in Season 2 (Falcons, Wingman) AND Season 3 (new team, Player)
// but is still a single Player record.
const PlayerSeasonSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  name:     { type: String, required: true },  // denormalised for queries
  season:   { type: Number, required: true },
  team:     { type: String },                  // e.g. "Falcons"
  role:     { type: String, enum: ['Captain','Wingman','Player'], default: 'Player' },
  active:   { type: Boolean, default: true },
}, { timestamps: true });

PlayerSeasonSchema.index({ playerId: 1, season: 1 }, { unique: true });
PlayerSeasonSchema.index({ name: 1, season: 1 });

// ── Draft Saves ───────────────────────────────────────────────────────
const DraftSaveSchema = new mongoose.Schema({
  user:      { type: String, required: true },
  season:    { type: Number, required: true, default: 3 },
  opt:       { type: Number, default: 1 },   // 1 = Option 1, 2 = Option 2
  picks:     { type: Array, default: [] },
  teams:     { type: Array, default: [] },
  pickCount: { type: Number, default: 0 },
  complete:  { type: Boolean, default: false },
}, { timestamps: true });

// One save per user per season per option
DraftSaveSchema.index({ user: 1, season: 1, opt: 1 }, { unique: true });

// ── Exports ───────────────────────────────────────────────────────────
// ── Season 3 Teams (locked roster) ───────────────────────────────────
const S3TeamSchema = new mongoose.Schema({
  name:     { type: String, required: true, unique: true },
  captain:  { type: String, required: true },
  players:  [{ type: String }],
  color:    { type: String, default: '#1a5fb4' },
  slug:     { type: String },
}, { timestamps: true });

// ── Monthly Event ─────────────────────────────────────────────────────
const GameSchema = new mongoose.Schema({
  slot:     { type: Number, required: true },  // 0-7
  type:     { type: String, enum: ['rr','final','third','fifth'], default: 'rr' },
  teamA:    { type: String },
  teamB:    { type: String },
  scoreA:   { type: Number, default: null },
  scoreB:   { type: Number, default: null },
  played:   { type: Boolean, default: false },
  court:    { type: Number, enum: [1,2], default: 1 },
});

const MonthlyEventSchema = new mongoose.Schema({
  season:   { type: Number, default: 3 },
  month:    { type: Number, required: true },   // 1-6
  label:    { type: String, required: true },   // "May 2026"
  date:     { type: String },                   // "Sun 3 May 2026"
  rotation: { type: Number, required: true },   // 0-5 (which shift)
  // positions[i] = team name at position T(i+1) this month
  positions: [{ type: String }],
  games:    [GameSchema],
  locked:   { type: Boolean, default: false },  // results locked
  champion: { type: String, default: null },
}, { timestamps: true });

// ── Season 3 Standings ────────────────────────────────────────────────
const S3StandingSchema = new mongoose.Schema({
  season:      { type: Number, default: 3 },
  team:        { type: String, required: true },
  // Monthly results: array of { month, position (1-6), points, wins, scoreDiff, champion }
  months:      [{
    month:     Number,
    label:     String,
    position:  Number,
    wins:      Number,
    losses:    Number,
    points:    Number,
    scoreDiff: Number,
    champion:  Boolean,
  }],
  totalPoints:    { type: Number, default: 0 },
  totalWins:      { type: Number, default: 0 },
  championships:  { type: Number, default: 0 },
}, { timestamps: true });

module.exports = {
  Team:         mongoose.model('Team',         TeamSchema),
  Standing:     mongoose.model('Standing',     StandingSchema),
  Season:       mongoose.model('Season',       SeasonSchema),
  CoreMember:   mongoose.model('CoreMember',   CoreMemberSchema),
  Decision:     mongoose.model('Decision',     DecisionSchema),
  Comment:      mongoose.model('Comment',      CommentSchema),
  Config:       mongoose.model('Config',       ConfigSchema),
  Player:       mongoose.model('Player',       PlayerModelSchema),
  PlayerSeason: mongoose.model('PlayerSeason', PlayerSeasonSchema),
  DraftSave:    mongoose.model('DraftSave',    DraftSaveSchema),
  S3Team:       mongoose.model('S3Team',       S3TeamSchema),
  MonthlyEvent: mongoose.model('MonthlyEvent', MonthlyEventSchema),
  S3Standing:   mongoose.model('S3Standing',   S3StandingSchema),
};
