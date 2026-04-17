
// ── Tab switching with dynamic panel loading ──────────────────────
const TABS = ['overview','feedback','teams','format','governance','actions'];
const _loaded = {};

async function switchTab(name) {
  // Update tab + bottom nav active states
  TABS.forEach(t => {
    document.querySelectorAll(`[data-tab="${t}"]`).forEach(el => el.classList.toggle('active', t === name));
    const bnav = document.getElementById('bnav-' + t);
    if (bnav) bnav.classList.toggle('active', t === name);
  });

  // Show/hide panel containers
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

  // Load panel HTML if not already loaded
  const container = document.getElementById('panel-' + name);
  if (!_loaded[name]) {
    container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--muted)">Loading…</div>';
    try {
      const html = await fetch(`/panels/${name}.html`).then(r => r.text());
      container.innerHTML = html;
      _loaded[name] = true;
    } catch(e) {
      container.innerHTML = '<div style="padding:24px;color:var(--red)">Failed to load panel.</div>';
    }
    // Run renderers for this tab
    runRenderersFor(name);
  }

  container.classList.add('active');
  window.scrollTo(0, 0);
}

function runRenderersFor(name) {
  if (name === 'overview')    { renderStandings(); renderDecisionsSidebar(); }
  if (name === 'teams')       { renderTeams(); renderCoreMembers(); }
  if (name === 'format')      { renderSchedule(); }
  if (name === 'governance')  { renderDecisions(); }
  if (name === 'actions')     { renderNextSteps(); renderChecklists(); }
  // feedback is all static HTML — no renderers needed
}

// ── API ────────────────────────────────────────────────────────────
const tr = n => n >= 2 ? '🏆🏆' : n === 1 ? '🏆' : '';
async function api(url) { const r = await fetch(url); if (!r.ok) throw new Error(r.statusText); return r.json(); }

// ── Standings ──────────────────────────────────────────────────────
async function renderStandings() {
  const s = await api('/api/standings?season=1');
  const pc = ['gold','','','','rel'];
  document.getElementById('standings-list').innerHTML = s.map((d, i) => {
    const cm = (d.monthlyResults||[]).filter(m=>m.champion).map(m=>m.month.split(' ')[0].slice(0,3)+" '"+m.month.split(' ')[1].slice(2)).join(', ');
    const cls = d.relegated ? 'rel' : (pc[i] || '');
    return `<div class="srow ${cls}">
      <div class="spos">${i+1}</div>
      <div><div class="sname">${d.teamName} ${tr(d.championships)}</div><div class="ssub">${cm?'Won: '+cm:d.relegated?'↓ Relegation candidate':''}</div></div>
      ${d.relegated ? '<span class="rtag">↓ Nano</span>' : '<div></div>'}
      <div class="spts">${d.totalPoints} pts</div>
    </div>`;
  }).join('');
}

// ── Teams ──────────────────────────────────────────────────────────
async function renderTeams() {
  const [teams, standings] = await Promise.all([api('/api/teams?season=1'), api('/api/standings?season=1')]);
  const sm = {}; standings.forEach(s => sm[s.teamName] = s);
  teams.sort((a,b) => (sm[b.name]?.totalPoints||0)-(sm[a.name]?.totalPoints||0) || (sm[b.name]?.championships||0)-(sm[a.name]?.championships||0));
  document.getElementById('teams-grid').innerHTML = teams.map(t => {
    const st = sm[t.name] || {};
    const players = [...t.players].sort((a,b) => { const o={Wingman:0,Captain:1,Player:2}; return o[a.role]-o[b.role]||a.name.localeCompare(b.name); });
    const rows = players.map(p => {
      const cls = p.role==='Captain'?'pcap':p.role==='Wingman'?'pwing':'';
      const bdg = p.role==='Captain'?'<span class="pbdg" style="background:#e3f2fd;color:#1565c0">Cap</span>':p.role==='Wingman'?'<span class="pbdg" style="background:#e8f5e9;color:#1b7a1b">Wing</span>':'';
      return `<div class="prow"><span class="${cls}">${p.name}</span>${bdg}</div>`;
    }).join('');
    return `<div class="tmc"><div class="tmhd" style="background:${t.gradient||'#1a3566'}"><span>⚡ ${t.name.replace('FVL ','')} ${tr(st.championships||0)}</span><span class="tmpts">${st.totalPoints!=null?st.totalPoints+'pts':''}</span></div>${rows}${t.exception?`<div style="padding:3px 9px;font-size:10px;color:var(--muted);font-style:italic">* ${t.exception}</div>`:''}</div>`;
  }).join('');
}

// ── Core Members ───────────────────────────────────────────────────
async function renderCoreMembers() {
  const m = await api('/api/core-members?season=1');
  document.getElementById('core-members-grid').innerHTML = m.map(x =>
    `<div class="cmr"><div><div class="cmname">${x.name}</div><div class="cmteam">${x.assignedTeam||''}</div></div><div class="cmrole">${x.role}</div></div>`
  ).join('');
}

// ── Schedule ───────────────────────────────────────────────────────
function renderSchedule() {
  const row = ([t,c,txt,d]) => `<div class="sched-row"><div class="stime">${t}</div><div class="sbar ${c}">${txt}</div><div class="sdur">${d}</div></div>`;
  const end = (t,txt) => `<div class="sched-row"><div class="stime" style="color:var(--ci-blue);font-weight:700">${t}</div><div class="send">${txt}</div><div></div></div>`;
  const mini=[['9:00','rr1','RR1 S1 · M1 vs M2 & M3 vs M4','25m'],['9:25','rr1','RR1 S2 · M1 vs M3 & M2 vs M4','25m'],['9:50','rr1','RR1 S3 · M1 vs M4 & M2 vs M3','25m'],['10:15','rr2','RR2 S4 · M1 vs M2 & M3 vs M4','25m'],['10:40','rr2','RR2 S5 · M1 vs M3 & M2 vs M4','25m'],['11:05','rr2','RR2 S6 · M1 vs M4 & M2 vs M3','25m'],['11:30','brk','☕ Break · Seedings announced','5m'],['11:35','po','🏆 Playoffs · #1 vs #2 (Champ) & #3 vs #4 (Relegation)','25m']];
  const nano=[['12:00','nr1','RR1 S1 · N1 vs N2 (N3 bye)','25m'],['12:25','nr1','RR1 S2 · N1 vs N3 (N2 bye)','25m'],['12:50','nr1','RR1 S3 · N2 vs N3 (N1 bye)','25m'],['1:15','nr2','RR2 S4 · N1 vs N2 (N3 bye)','25m'],['1:40','nr2','RR2 S5 · N1 vs N3 (N2 bye)','25m'],['2:05','nr2','RR2 S6 · N2 vs N3 (N1 bye)','25m'],['2:30','brk','☕ Break · Standings announced','5m'],['2:35','nf','🌱 Nano Final · N1 vs N2 — Winner promoted to Mini','25m']];
  document.getElementById('schedule-tl').innerHTML=
    `<div class="sblk"><div class="shd">⚡ Mini — Courts 1 & 2 · 9 AM–12 PM</div>${mini.map(row).join('')}${end('12:00','Mini ends → Nano begins')}</div>`+
    `<div class="sblk"><div class="shd">🌱 Nano — Court 1 · 12 PM–3 PM</div>${nano.map(row).join('')}${end('3:00','Full event day complete')}</div>`;
}

// ── Decisions sidebar (overview) ──────────────────────────────────
async function renderDecisionsSidebar() {
  const el = document.getElementById('decisions-sidebar');
  if (!el) return;
  try {
    const all = await api('/api/decisions');
    const open = all.filter(d => d.status === 'open');
    const oc = document.getElementById('open-count'); if(oc) oc.textContent = open.length;
    const pc = p => p==='High'?'ph':p==='Medium'?'pm':'pl';
    const tc = p => p==='High'?'pth':p==='Medium'?'ptm':'ptl';
    el.innerHTML = open.map(d =>
      `<div class="do ${pc(d.priority)}" style="margin-bottom:6px"><div class="do-body"><span class="ptag ${tc(d.priority)}">${d.priority}</span><div class="dt">${d.topic}</div><div class="dd">${d.description||''}</div></div></div>`
    ).join('');
  } catch(e) { console.error('decisions sidebar:', e); }
}

// ── Decisions ──────────────────────────────────────────────────────
async function renderDecisions() {
  const all = await api('/api/decisions');
  const closed = all.filter(d => d.status === 'closed');
  const open   = all.filter(d => d.status === 'open');

  const oc = document.getElementById('open-count'); if(oc) oc.textContent = open.length;

  document.getElementById('decisions-closed-list').innerHTML = closed.map(d =>
    `<div class="dcr"><span class="dref">${d.ref}</span><div><span style="font-size:12px;font-weight:700;color:var(--text)">${d.topic} — </span><span style="font-size:12px;color:var(--muted)">${d.resolution||''}</span></div></div>`
  ).join('');

  const pc = p => p==='High'?'ph':p==='Medium'?'pm':'pl';
  const tc = p => p==='High'?'pth':p==='Medium'?'ptm':'ptl';
  const openHtml = open.map(d =>
    `<div class="do ${pc(d.priority)}"><div class="do-body"><span class="ptag ${tc(d.priority)}">${d.priority}</span><div class="dt">${d.topic}</div><div class="dd">${d.description||''}</div></div></div>`
  ).join('');
  ['decisions-open-list','decisions-sidebar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = openHtml;
  });
}

// ── Next Steps ─────────────────────────────────────────────────────
function renderNextSteps() {
  const steps=[['1','All 6','Review document as a core group. Align on anything unclear.','Before S2'],['2','All 6','Vote and close all High priority open decisions.','Before S2'],['3','All 6','Confirm Season 2 roles: 4 Mini Wingmen, Nano Coordinator, Floating.','Before S2'],['4','All 6','Agree auction format — budget and captain valuation method.','Before S2'],['5','All 6','Agree RTM: 1 or 3 per captain · 60-sec window · same tier.','Before S2'],['6','Nano Coord.','Set up Nano registration. Recruit 3 teams. Identify Nano captain candidates.','2 wks before'],['7','All 6','Run Mini captain nominations. Confirm 4 captains.','2 wks before'],['8','All 6','Open 48-hr player preference window (Mini or Nano-only).','1 wk before draft'],['9','All 6','Publish draft pools, order, and format to all players.','Draft day −48 hrs'],['10','Captains','Conduct Mini auction draft. Enforce tier balance.','Draft day'],['11','Captains','Conduct Nano draft from remaining pool.','Draft day'],['12','All 6','Publish rosters. Open 48-hr appeals window.','Post-draft'],['13','All 6','Book venue. Confirm 2 courts for 6-hour block.','Before Month 1']];
  document.getElementById('nextsteps-list').innerHTML = steps.map(([n,o,t,w]) =>
    `<div class="nsitem">
      <div class="nsn">${n}</div>
      <div>
        <div class="nst">${t}</div>
        <div class="nsmeta"><span class="nso">${o}</span><span class="nsw">${w}</span></div>
      </div>
    </div>`
  ).join('');
}

// ── Checklists ─────────────────────────────────────────────────────
function renderChecklists() {
  const monthly={'Before':['4 Mini teams confirmed — full rosters of 7','3 Nano teams confirmed — full rosters of 7','4 Mini Wingmen assigned','1 Nano Coordinator confirmed','Venue and 2 courts booked','Prior month P/R swap applied','Substitutions approved'],'Day Of':['Nano Coordinator on-site','Mini Wingmen present with teams','Nano champion recorded','Mini bottom team confirmed','P/R swap confirmed with both captains'],'After':['Team lists published within 24 hrs','Tier observations logged','Nano pipeline updated','Conduct issues reported']};
  const season={'Tiers & Pool':['All players re-tiered by core','Major player pool assembled'],'Roles':['Season 2 assignments confirmed',"No one repeating last season's role"],'Captains':['Nominations submitted privately','All 7 captains confirmed','Wingman–captain pairings announced','Draft format confirmed','RTM rules confirmed'],'Draft':['48-hr preference window done','Pools published','Draft order published 48 hrs ahead','Draft completed — tiers verified','Players notified within 24 hrs','Appeals window opened and closed','Season schedule published']};
  const render = data => Object.entries(data).map(([sec,items]) =>
    `<div class="csh">${sec}</div>${items.map(t=>`<div class="citem"><div class="cbox"></div><span>${t}</span></div>`).join('')}`
  ).join('');
  document.getElementById('checklist-monthly').innerHTML = render(monthly);
  document.getElementById('checklist-season').innerHTML  = render(season);
}

// ── Init — load overview panel first ──────────────────────────────
// Mark overview as pre-loaded (it's in the HTML shell)
_loaded['overview'] = true;
// Run overview renderers immediately
renderStandings();
renderDecisionsSidebar();
