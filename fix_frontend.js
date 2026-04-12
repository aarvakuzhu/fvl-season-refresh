const fs = require('fs');
let s = fs.readFileSync('public/index.html', 'utf8');

// 1. Remove rv class from dynamically-rendered containers
//    (content is injected by JS - the container itself shouldn't animate)
s = s.replace('id="standings-list" class="rv"', 'id="standings-list"');
s = s.replace('id="teams-grid" class="tgrid rv"', 'id="teams-grid" class="tgrid"');
s = s.replace('id="core-members-grid" class="g3"', 'id="core-members-grid" class="g3"'); // already no rv
s = s.replace('id="decisions-open" class="g3 rv"', 'id="decisions-open" class="g3"');
s = s.replace('id="nextsteps-list"', 'id="nextsteps-list"');

// 2. Fix renderTeams - pull pts and championship data from standings API
//    Replace hardcoded pts/champs maps with a fetch from standings
const oldRenderTeams = `async function renderTeams() {
  const teams = await api('/api/teams?season=1');
  // Sort by standings order
  const order = ['FVL Falcons','FVL Spartans','FVL Titans','FVL Dragons','FVL Panthers'];
  teams.sort((a,b) => order.indexOf(a.name) - order.indexOf(b.name));
  const grid = $('teams-grid');
  grid.innerHTML = teams.map(t => {
    const players = [...t.players].sort((a,b) => {
      const ord = {Wingman:0, Captain:1, Player:2};
      if (ord[a.role] !== ord[b.role]) return ord[a.role] - ord[b.role];
      return a.name.localeCompare(b.name);
    });
    const playerRows = players.map(p => {
      const nameColor = p.role==='Captain' ? '#90caf9' : p.role==='Wingman' ? '#81c784' : 'var(--tx)';
      const bold = p.role !== 'Player';
      const tag = p.role === 'Captain' ? '<span class="rtag rcap">Cap</span>' :
                  p.role === 'Wingman' ? '<span class="rtag rwing">Wing</span>' : '';
      return \`<div class="plyr" style="background:\${bold ? 'rgba(255,255,255,.05)' : ''}">
        <span style="color:\${nameColor};font-weight:\${bold?'600':'400'}">\${p.name}</span>\${tag}
      </div>\`;
    }).join('');
    const pts = { 'FVL Falcons':'21 pts','FVL Spartans':'18 pts','FVL Titans':'16 pts','FVL Dragons':'10 pts','FVL Panthers':'10 pts' }[t.name] || '';
    const champs = { 'FVL Falcons':'🏆🏆','FVL Spartans':'🏆🏆','FVL Dragons':'🏆' }[t.name] || '';
    return \`
    <div class="teamcard">
      <div class="teamhd" style="background:\${t.gradient || '#1a3566'}">
        <span>⚡ \${t.name} \${champs}</span><span class="tpts">\${pts}</span>
      </div>
      \${playerRows}
      \${t.exception ? \`<div style="padding:4px 12px;font-size:10px;color:var(--gr);font-style:italic">* \${t.exception}</div>\` : ''}
    </div>\`;
  }).join('');
  obs.observe(grid);
}`;

const newRenderTeams = `async function renderTeams() {
  const [teams, standings] = await Promise.all([
    api('/api/teams?season=1'),
    api('/api/standings?season=1'),
  ]);
  // Build standings lookup by team name
  const standingMap = {};
  standings.forEach(s => { standingMap[s.teamName] = s; });
  // Sort by standings points desc
  teams.sort((a, b) => {
    const pa = standingMap[a.name]?.totalPoints || 0;
    const pb = standingMap[b.name]?.totalPoints || 0;
    if (pb !== pa) return pb - pa;
    const ca = standingMap[a.name]?.championships || 0;
    const cb = standingMap[b.name]?.championships || 0;
    return cb - ca;
  });
  const grid = $('teams-grid');
  grid.innerHTML = teams.map(t => {
    const st = standingMap[t.name] || {};
    const pts = st.totalPoints != null ? st.totalPoints + ' pts' : '';
    const champs = trophies(st.championships || 0);
    const players = [...t.players].sort((a, b) => {
      const ord = { Wingman: 0, Captain: 1, Player: 2 };
      if (ord[a.role] !== ord[b.role]) return ord[a.role] - ord[b.role];
      return a.name.localeCompare(b.name);
    });
    const playerRows = players.map(p => {
      const nameColor = p.role === 'Captain' ? '#90caf9' : p.role === 'Wingman' ? '#81c784' : 'var(--tx)';
      const bold = p.role !== 'Player';
      const tag = p.role === 'Captain' ? '<span class="rtag rcap">Cap</span>'
                : p.role === 'Wingman' ? '<span class="rtag rwing">Wing</span>' : '';
      return \`<div class="plyr" style="background:\${bold ? 'rgba(255,255,255,.05)' : ''}">
        <span style="color:\${nameColor};font-weight:\${bold ? '600' : '400'}">\${p.name}</span>\${tag}
      </div>\`;
    }).join('');
    return \`
    <div class="teamcard">
      <div class="teamhd" style="background:\${t.gradient || '#1a3566'}">
        <span>⚡ \${t.name} \${champs}</span><span class="tpts">\${pts}</span>
      </div>
      \${playerRows}
      \${t.exception ? \`<div style="padding:4px 12px;font-size:10px;color:var(--gr);font-style:italic">* \${t.exception}</div>\` : ''}
    </div>\`;
  }).join('');
}`;

if (!s.includes(oldRenderTeams.slice(0,60))) {
  console.error('renderTeams not found');
} else {
  s = s.replace(oldRenderTeams, newRenderTeams);
  console.log('renderTeams fixed');
}

// 3. Fix renderStandings - champion months were being formatted oddly
//    The month names from DB are "November 2025" etc - simplify display
const oldChamp = `    const champ = s.monthlyResults?.filter(m => m.champion).map(m => m.month.replace(' 20','\\\'').replace('2025','25').replace('2026','26')).join(', ');`;
const newChamp = `    const champMonths = s.monthlyResults?.filter(m => m.champion) || [];
    const champ = champMonths.map(m => m.month.split(' ')[0].slice(0,3) + ' ' + m.month.split(' ')[1]).join(', ');`;

s = s.replace(oldChamp, newChamp);
console.log('standings champion format fixed');

// 4. Fix renderStandings - relegated condition was fragile
const oldRelegate = `      const relegated = s.relegated || i === standings.length - 1;
      const cls = posClasses[i] || (relegated ? 'dn' : '');`;
const newRelegate = `      const relegated = s.relegated;
      const cls = relegated ? 'dn' : (posClasses[i] || '');`;
s = s.replace(oldRelegate, newRelegate);
console.log('standings relegated fixed');

// 5. Fix renderCoreMembers - obs.observe was called on already-observed element
const oldCMObs = `  grid.innerHTML = members.map(m => \`
    <div class="card" style="padding:12px 14px">
      <div style="font-size:15px;font-weight:700;color:var(--go);margin-bottom:1px">\${m.name}</div>
      <div style="font-size:13px;color:var(--wh);font-weight:500">\${m.role}</div>
      <div style="font-size:12px;color:var(--gr);margin-top:1px">\${m.assignedTeam || ''}</div>
    </div>\`).join('');
  obs.observe(grid);`;
const newCMObs = `  grid.innerHTML = members.map(m => \`
    <div class="card" style="padding:12px 14px">
      <div style="font-size:15px;font-weight:700;color:var(--go);margin-bottom:1px">\${m.name}</div>
      <div style="font-size:13px;color:var(--wh);font-weight:500">\${m.role}</div>
      <div style="font-size:12px;color:var(--gr);margin-top:1px">\${m.assignedTeam || ''}</div>
    </div>\`).join('');`;
s = s.replace(oldCMObs, newCMObs);
console.log('core-members obs.observe removed');

// 6. Fix decisions-open obs.observe - same issue
s = s.replace(`  obs.observe($('decisions-open'));`, '');
console.log('decisions-open obs.observe removed');

// 7. Init - renderTeams now fetches standings internally, so remove duplicate call
// renderTeams already calls standings, so we can keep renderStandings separate but
// ensure they don't race. Keep both but they're independent.

// 8. Remove stale obs.observe(grid) at end of renderTeams (already removed by rewrite above)

fs.writeFileSync('public/index.html', s);
console.log('\n✅ All fixes applied');
