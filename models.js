const mongoose = require('mongoose');

// ── Team & Players ────────────────────────────────────────────────────
const PlayerSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  role:       { type: String, enum: ['Captain', 'Wingman', 'Player'], default: 'Player' },
  tier:       { type: String, enum: ['S', 'A', 'B', 'C'], default: 'B' },
  active:     { type: Boolean, default: true },
});

const TeamSchema = new mongoose.Schema({
  name:       { type: String, required: true },       // e.g. "FVL Falcons"
  slug:       { type: String, required: true },       // e.g. "falcons"
  tier:       { type: String, enum: ['Mini', 'Nano'], default: 'Mini' },
  season:     { type: Number, required: true },       // 1, 2, 3 ...
  color:      { type: String, default: '#2b5ba8' },   // accent colour
  gradient:   { type: String },                       // CSS gradient string
  players:    [PlayerSchema],
  active:     { type: Boolean, default: true },
  exception:  { type: String },                       // e.g. "9-player approved exception"
}, { timestamps: true });

// ── Season Standings ──────────────────────────────────────────────────
const MonthlyResultSchema = new mongoose.Schema({
  month:      { type: String, required: true },       // e.g. "November 2025"
  position:   { type: Number },                       // final position
  wins:       { type: Number, default: 0 },
  points:     { type: Number, default: 0 },           // league points (wins-based)
  champion:   { type: Boolean, default: false },
  runnerUp:   { type: Boolean, default: false },
  relegated:  { type: Boolean, default: false },
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
}, { timestamps: true });

// ── Season Config ─────────────────────────────────────────────────────
const SeasonSchema = new mongoose.Schema({
  number:     { type: Number, required: true, unique: true },
  label:      { type: String },                       // e.g. "Season 1"
  status:     { type: String, enum: ['active', 'completed', 'upcoming'], default: 'active' },
  startDate:  { type: Date },
  endDate:    { type: Date },
  miniTeams:  { type: Number, default: 4 },
  nanoTeams:  { type: Number, default: 3 },
  draftFormat:{ type: String, enum: ['auction', 'snake'], default: 'auction' },
  notes:      { type: String },
}, { timestamps: true });

// ── Core Members ──────────────────────────────────────────────────────
const CoreMemberSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  role:       { type: String, enum: ['Mini Wingman', 'Nano Coordinator', 'Floating', 'League Manager'] },
  assignedTeam: { type: String },                     // team name they wingman
  season:     { type: Number },
  active:     { type: Boolean, default: true },
}, { timestamps: true });

// ── Open Decisions ────────────────────────────────────────────────────
const DecisionSchema = new mongoose.Schema({
  ref:        { type: String, required: true },       // e.g. "O4"
  topic:      { type: String, required: true },
  description:{ type: String },
  priority:   { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
  status:     { type: String, enum: ['open', 'closed'], default: 'open' },
  resolution: { type: String },                       // what was decided
  closedDate: { type: Date },
}, { timestamps: true });

// ── Comments (future use — ready to activate) ─────────────────────────
const CommentSchema = new mongoose.Schema({
  section:    { type: String, required: true },       // e.g. "standings", "draft"
  author:     { type: String, required: true },
  text:       { type: String, required: true },
  resolved:   { type: Boolean, default: false },
}, { timestamps: true });

module.exports = {
  Team:       mongoose.model('Team',       TeamSchema),
  Standing:   mongoose.model('Standing',   StandingSchema),
  Season:     mongoose.model('Season',     SeasonSchema),
  CoreMember: mongoose.model('CoreMember', CoreMemberSchema),
  Decision:   mongoose.model('Decision',   DecisionSchema),
  Comment:    mongoose.model('Comment',    CommentSchema),
};

// ── App Config (key-value settings, e.g. admin password) ─────────────
const ConfigSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: String, required: true },
}, { timestamps: true });

module.exports.Config = mongoose.model('Config', ConfigSchema);
