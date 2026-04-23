module.exports = (() => {
const teams = [
  {
    name: 'FVL Falcons', slug: 'falcons', tier: 'Mini', season: 2,
    color: '#2b5ba8', gradient: 'linear-gradient(135deg,#1a3566,#2b5ba8)',
    players: [
      { name: 'Ashok',       role: 'Wingman', tier: 'A' },
      { name: 'Karthik S',   role: 'Captain', tier: 'A' },
      { name: 'Harsha',      role: 'Player',  tier: 'B' },
      { name: 'Naveen',      role: 'Player',  tier: 'B' },
      { name: 'Raja S',      role: 'Player',  tier: 'B' },
      { name: 'Rajeshbabu',  role: 'Player',  tier: 'B' },
      { name: 'Ritesh',      role: 'Player',  tier: 'B' },
      { name: 'Rizwan',      role: 'Player',  tier: 'B' },
    ],
  },
  {
    name: 'FVL Spartans', slug: 'spartans', tier: 'Mini', season: 2,
    color: '#4527a0', gradient: 'linear-gradient(135deg,#311b92,#4527a0)',
    players: [
      { name: 'Amrendra',    role: 'Wingman', tier: 'A' },
      { name: 'Koti',        role: 'Captain', tier: 'A' },
      { name: 'Jugal',       role: 'Player',  tier: 'B' },
      { name: 'Kiran',       role: 'Player',  tier: 'B' },
      { name: 'Rakesh',      role: 'Player',  tier: 'B' },
      { name: 'Rajan',       role: 'Player',  tier: 'B' },
      { name: 'Santosh',     role: 'Player',  tier: 'B' },
      { name: 'Uday K',      role: 'Player',  tier: 'B' },
    ],
  },
  {
    name: 'FVL Titans', slug: 'titans', tier: 'Mini', season: 2,
    color: '#1a3566', gradient: 'linear-gradient(135deg,#0f1e3d,#1a3566)',
    players: [
      { name: 'Rahul',       role: 'Wingman', tier: 'A' },
      { name: 'Pratik',      role: 'Captain', tier: 'A' },
      { name: 'Ishant',      role: 'Player',  tier: 'B' },
      { name: 'Kunal',       role: 'Player',  tier: 'B' },
      { name: 'Ronak',       role: 'Player',  tier: 'B' },
      { name: 'Sunil',       role: 'Player',  tier: 'B' },
      { name: 'Venkat',      role: 'Player',  tier: 'B' },
      { name: 'Vikas',       role: 'Player',  tier: 'B' },
    ],
  },
  {
    name: 'FVL Dragons', slug: 'dragons', tier: 'Mini', season: 2,
    color: '#c62828', gradient: 'linear-gradient(135deg,#7f0000,#c62828)',
    exception: '9-player approved exception',
    players: [
      { name: 'Naren',       role: 'Wingman', tier: 'A' },
      { name: 'Shanthan',    role: 'Captain', tier: 'A' },
      { name: 'Ahmed',       role: 'Player',  tier: 'B' },
      { name: 'Anil',        role: 'Player',  tier: 'B' },
      { name: 'Keshav',      role: 'Player',  tier: 'B' },
      { name: 'Pavan',       role: 'Player',  tier: 'B' },
      { name: 'Saravanan',   role: 'Player',  tier: 'B' },
      { name: 'Suri',        role: 'Player',  tier: 'B' },
      { name: 'Uday Dragon', role: 'Player',  tier: 'B' },
    ],
  },
  {
    name: 'FVL Panthers', slug: 'panthers', tier: 'Mini', season: 2,
    color: '#2e7d32', gradient: 'linear-gradient(135deg,#1b5e20,#2e7d32)',
    players: [
      { name: 'Sachin',      role: 'Wingman', tier: 'A' },
      { name: 'Krishna',     role: 'Captain', tier: 'A' },
      { name: 'Chandu',      role: 'Player',  tier: 'B' },
      { name: 'Chandra',     role: 'Player',  tier: 'B' },
      { name: 'Divyanshu',   role: 'Player',  tier: 'B' },
      { name: 'Gopal',       role: 'Player',  tier: 'B' },
      { name: 'Krupa',       role: 'Player',  tier: 'B' },
      { name: 'Mukesh',      role: 'Player',  tier: 'B' },
    ],
  },
];

const standings = [
  {
    season: 2, teamName: 'FVL Falcons',
    totalPoints: 21, championships: 2, relegated: false,
    monthlyResults: [
      { month: 'November 2025', wins: 3, points: 3, champion: true  },
      { month: 'December 2025', wins: 3, points: 3, champion: false },
      { month: 'January 2026',  wins: 3, points: 3, champion: false },
      { month: 'February 2026', wins: 3, points: 3, champion: true  },
      { month: 'March 2026',    wins: 3, points: 3, champion: false },
      { month: 'April 2026',    wins: 0, points: 6, champion: false }, // TBD
    ],
  },
  {
    season: 2, teamName: 'FVL Spartans',
    totalPoints: 18, championships: 2, relegated: false,
    monthlyResults: [
      { month: 'November 2025', wins: 2, points: 2, champion: false },
      { month: 'December 2025', wins: 3, points: 3, champion: true  },
      { month: 'January 2026',  wins: 2, points: 2, champion: true  },
      { month: 'February 2026', wins: 3, points: 3, champion: false },
      { month: 'March 2026',    wins: 1, points: 1, champion: false },
    ],
  },
  {
    season: 2, teamName: 'FVL Titans',
    totalPoints: 16, championships: 0, relegated: false,
    monthlyResults: [
      { month: 'November 2025', wins: 3, points: 3 },
      { month: 'December 2025', wins: 1, points: 1 },
      { month: 'January 2026',  wins: 2, points: 2 },
      { month: 'February 2026', wins: 3, points: 3 },
      { month: 'March 2026',    wins: 2, points: 2 },
    ],
  },
  {
    season: 2, teamName: 'FVL Dragons',
    totalPoints: 10, championships: 1, relegated: false,
    monthlyResults: [
      { month: 'November 2025', wins: 1, points: 1 },
      { month: 'December 2025', wins: 2, points: 2 },
      { month: 'January 2026',  wins: 0, points: 0 },
      { month: 'February 2026', wins: 0, points: 0 },
      { month: 'March 2026',    wins: 3, points: 3, champion: true },
    ],
  },
  {
    season: 2, teamName: 'FVL Panthers',
    totalPoints: 10, championships: 0, relegated: true,
    monthlyResults: [
      { month: 'November 2025', wins: 1, points: 1 },
      { month: 'December 2025', wins: 2, points: 2 },
      { month: 'January 2026',  wins: 3, points: 3 },
      { month: 'February 2026', wins: 1, points: 1 },
      { month: 'March 2026',    wins: 1, points: 1 },
    ],
  },
];

const coreMembers = [
  { name: 'Ashok',     role: 'Mini Wingman',         assignedTeam: 'FVL Falcons',  season: 2 },
  { name: 'Amrendra',  role: 'Mini Wingman',         assignedTeam: 'FVL Spartans', season: 2 },
  { name: 'Rahul',     role: 'Mini Wingman',         assignedTeam: 'FVL Titans',   season: 2 },
  { name: 'Naren',     role: 'Mini Wingman',         assignedTeam: 'FVL Dragons',  season: 2 },
  { name: 'Sachin',    role: 'Mini Wingman',         assignedTeam: 'FVL Panthers', season: 2 },
  { name: 'Sunil',     role: 'Floating',             assignedTeam: 'League-wide',  season: 2 },
];

const decisions = [
  // Closed
  ...[ 
    ['D1','League format','3 tiers: Nano (3 teams), Mini (4 teams), Major (Flagship). 7 teams × 8 players monthly.'],
    ['D2','Core member roles','4 Mini Wingmen + 1 Nano Coordinator + 1 Floating. Fixed — no rotation. Not applicable to Major.'],
    ['D3','Core = Wingmen only','Core members never captain teams.'],
    ['D4','Promotion/relegation','Team-as-unit monthly swap: Nano champion → Mini, Mini bottom → Nano.'],
    ['D5','Monthly event order','Mini first (9AM–12PM), Nano second (12PM–3PM). Back to back, no gap.'],
    ['D6','Mini schedule','2× Round Robin (paired, 2 courts) + 5-min break + 2 simultaneous playoffs = 3 hours.'],
    ['D7','Mini playoffs','#1 vs #2 Court 1, #3 vs #4 Court 2. Simultaneous. All outcomes decided in playoffs.'],
    ['D8','Nano schedule','2× Round Robin (bye system, 1 court) + 5-min break + championship final = 3 hours.'],
    ['D9','Player pool','Unified pool at transition. Players declare Mini or Nano-only preference.'],
    ['D10','Captain order','Core members select all 7 captains first. Player preferences follow. Draft after.'],
    ['D11','Captain rule','Auto-fill spot #1. Auction: captain value deducted from team budget before bidding.'],
    ['D12','Draft sequence','Mini draft first (4 captains × 7 picks). Nano from remaining pool.'],
    ['D13','RTM recommendation','Right-to-Match. 1 RTM per captain per draft. No keeper tracking needed.'],
    ['D14','Major independence','Flagship community event. No Nano/Mini eligibility. Parallel track.'],
    ['D15','Game rules','Standard volleyball + FVL overreach/attack clarification.'],
    ['D16','Nano stability','Teams fixed for full season. No mid-season reshuffling.'],
    ['D17','Tiebreaker','Wins → Points differential → Coin toss/randomisation. No tiebreaker games.'],
    ['D18','Draft format','Auction primary. Snake draft available as alternative (Appendix A).'],
    ['D19','Season 1 teams','Falcons 21pts 🏆🏆, Spartans 18pts 🏆🏆, Titans 16pts, Dragons 10pts 🏆, Panthers 10pts.'],
  ].map(([ref,topic,resolution]) => ({ ref, topic, resolution, status:'closed', priority:'High', closedDate: new Date() })),
  // Open
  { ref:'O1', topic:'RTM Parameters',         priority:'High',   status:'open', description:'Confirm 1 RTM per captain, 60-second window, same tier only.' },
  { ref:'O2', topic:'Auction Starting Budget', priority:'Medium', status:'open', description:'Starting budget per team (e.g. 100 units) + captain valuation method.' },
  { ref:'O3', topic:'Wingman Assignments S2',  priority:'Medium', status:'open', description:'Which core member covers which Mini team for Season 2?' },
  { ref:'O4', topic:'Relegated Team Gap',      priority:'Medium', status:'open', description:'If relegated players won\'t play Nano — how is the gap filled?' },
  { ref:'O5', topic:'Nano Captain Criteria',   priority:'Medium', status:'open', description:'Formal criteria beyond Tier B + willingness, or Coordinator\'s discretion?' },
  { ref:'O6', topic:'Player Cap',              priority:'Low',    status:'open', description:'What if registrations exceed 56 players?' },
  { ref:'O7', topic:'Nano Captain Recognition',priority:'Low',    status:'open', description:'Formal recognition for Nano captains who earn promotion?' },
];

const season = {
  number: 2, label: 'Season 2', status: 'active',
  startDate: new Date('2025-11-01'), endDate: new Date('2026-04-30'),
  miniTeams: 5, nanoTeams: 0, recommendedPlayersPerTeam: 7, draftFormat: 'auction',
  notes: 'FVL Season 2 — 5 teams. Historical data.',
};

  const config = [
    { key: 'admin_password', value: 'fvladmin' },
  ];
  return { teams, standings, coreMembers, decisions, season, config };
})();
