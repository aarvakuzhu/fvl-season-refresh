
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
  const s = await api('/api/standings?season=2');
  const pc = ['gold','','','','',''];
  document.getElementById('standings-list').innerHTML = s.map((d, i) => {
    const cm = (d.monthlyResults||[]).filter(m=>m.champion).map(m=>m.month.split(' ')[0].slice(0,3)+" '"+m.month.split(' ')[1].slice(2)).join(', ');
    return `<div class="srow ${pc[i]||''}">
      <div class="spos ${i===0?'pos-1':''}">${i+1}</div>
      <div><div class="sname">${d.teamName} ${tr(d.championships)}</div><div class="ssub">${cm?'Won: '+cm:''}</div></div>
      <div></div>
      <div class="spts">${d.totalPoints} pts</div>
    </div>`;
  }).join('');
}

// ── Teams ──────────────────────────────────────────────────────────
async function renderTeams() {
  const [teams, standings] = await Promise.all([api('/api/teams?season=2'), api('/api/standings?season=2')]);
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
  const m = await api('/api/core-members?season=2');
  document.getElementById('core-members-grid').innerHTML = m.map(x =>
    `<div class="cmr"><div><div class="cmname">${x.name}</div><div class="cmteam">${x.assignedTeam||''}</div></div><div class="cmrole">${x.role}</div></div>`
  ).join('');
}

// ── Schedule — Option A and B ──────────────────────────────────────
// 6 teams, 2 courts, 25-min games, no breaks, 3.5 hrs
function renderSchedule() {
  const row = ([t,c,txt]) => `<div class="sched-row"><div class="stime">${t}</div><div class="sbar ${c}">${txt}</div><div class="sdur">25m</div></div>`;
  const fin = ([t,c,txt]) => `<div class="sched-row"><div class="stime" style="color:var(--ci-blue);font-weight:700">${t}</div><div class="sbar ${c}">${txt}</div><div class="sdur">25m</div></div>`;
  const end = (t,txt) => `<div class="sched-row"><div class="stime" style="font-weight:700;color:var(--green)">${t}</div><div class="send" style="color:var(--green)">${txt}</div><div></div></div>`;

  // Option A: Full Round Robin (15 games, 8 slots on 2 courts) + 2 finals
  // 6 teams → 15 matchups. 2 courts → 8 slots (last slot 1 game + 1 court idle)
  // Slots: 0:00 0:25 0:50 1:15 1:40 2:05 2:30 2:55 → finals at 3:00 3:25 → done 3:50... too long
  // With 15 games on 2 courts = ceil(15/2) = 8 slots = 200 mins. With 2 finals = 250 mins = 4:10 — too long
  // Realistic: 8 RR games on 2 courts (T1-T6 each play 4-5 games) + 2 finals = 10 slots = 250 mins
  // Better: 6 teams, 2 courts, pick 8 RR matchups covering all teams fairly (each plays ~3 games) in 8 slots = 200 mins + 2 final slots = 250 mins = 4:10 — still over
  // For 3.5 hrs (210 min) with 25-min games on 2 courts: 210/25 = 8.4 → max 8 slots = 16 game-slots
  // 16 game-slots: 8 slots × 2 courts. Need 6 RR rounds (each team plays ~3 games each, 8-9 unique matchups, not full RR) + 2 final slots
  // Actual full RR = 15 games. 15 on 2 courts = ceil(15/2) = 8 slots = 200 min. Plus 2 finals = 250 min. Need to skip some RR games.
  // Practical option A: 3 RR rounds × 3 pairs = 9 games (each team plays 3) = 5 slots (~125 min) + seeding break (0) + 2 finals (50 min) = 175 min. Under 3.5!
  // Or: use all 5 slots for RR (10 games, each team plays 3-4) + 3 finals = 8 slots = 200 min = 3h20. Fits!

  const startH = 9, startM = 0;
  function timeStr(slotIndex) {
    const totalMin = startH * 60 + startM + slotIndex * 25;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : h;
    return `${h12}:${m.toString().padStart(2,'0')}`;
  }

  // Option A: 6 RR slots (12 games, each team plays 4 times) + 2 final slots = 8 slots = 3h20
  const rrA = [
    [0,'rr1','T1 vs T2  |  T3 vs T4'],
    [1,'rr1','T1 vs T3  |  T5 vs T6'],
    [2,'rr1','T2 vs T4  |  T1 vs T6'],
    [3,'rr2','T2 vs T5  |  T3 vs T6'],
    [4,'rr2','T1 vs T4  |  T2 vs T6'],
    [5,'rr2','T3 vs T5  |  T4 vs T6'],
  ];
  const finA = [
    [6,'po','🏆 Final · #1 vs #2  |  3rd Place · #3 vs #4'],
    [7,'po','5th Place · #5 vs #6'],
  ];
  const elA = document.getElementById('schedule-a');
  if (elA) {
    elA.innerHTML =
      `<div class="sblk"><div class="shd">Round Robin — 6 rounds on 2 courts</div>${rrA.map(([i,c,t]) => row([timeStr(i),c,t])).join('')}</div>` +
      `<div class="sblk"><div class="shd">Finals — Rankings by wins/points diff</div>${finA.map(([i,c,t]) => fin([timeStr(i),c,t])).join('')}${end(timeStr(8),'Complete — 3h20')}</div>`;
  }

  // Option B: Pool stage (3+3 games) + cross-pool (3 games) + bracket (3 games) = 9 game slots on 2 courts
  // 6 pool games (3+3) on 2 courts = 3 slots. Cross (3 games) = 2 slots. Bracket (3 games) = 2 slots. Total = 7 slots = 175 min = 2h55
  // Add 1 more cross/bracket round to fill to 3.5hrs
  const poolB = [
    [0,'rr1','Pool X: T1 vs T2  |  Pool Y: T4 vs T5'],
    [1,'rr1','Pool X: T1 vs T3  |  Pool Y: T4 vs T6'],
    [2,'rr1','Pool X: T2 vs T3  |  Pool Y: T5 vs T6'],
  ];
  const crossB = [
    [3,'rr2','Cross · #1X vs #1Y  |  #2X vs #2Y'],
    [4,'rr2','Cross · #3X vs #3Y'],
  ];
  const brackB = [
    [5,'po','SF · W(#1X-#1Y) vs W(#2X-#2Y)  |  3rd · W(#3X-#3Y) vs L(#1-#1)'],
    [6,'po','🏆 Grand Final  |  5th Place'],
    [7,'po','Remaining placement games'],
  ];
  const elB = document.getElementById('schedule-b');
  if (elB) {
    elB.innerHTML =
      `<div class="sblk"><div class="shd">Pool Stage · Pool X (T1,T2,T3) · Pool Y (T4,T5,T6)</div>${poolB.map(([i,c,t]) => row([timeStr(i),c,t])).join('')}</div>` +
      `<div class="sblk"><div class="shd">Cross-Pool by Rank</div>${crossB.map(([i,c,t]) => row([timeStr(i),c,t])).join('')}</div>` +
      `<div class="sblk"><div class="shd">Bracket Finals</div>${brackB.map(([i,c,t]) => fin([timeStr(i),c,t])).join('')}${end(timeStr(8),'Complete — 3h20')}</div>`;
  }
}

// ── Decisions sidebar (overview) ──────────────────────────────────
async function renderDecisionsSidebar() {
  const el = document.getElementById('decisions-sidebar');
  if (!el) return;
  // Active S3 decisions — hardcoded (DB decisions are all archived legacy items)
  el.innerHTML = `
    <div class="do ph" style="margin-bottom:6px"><div class="do-body">
      <span class="ptag pth">OPEN</span>
      <div class="dt">Finalise Draft Option</div>
      <div class="dd">Option 1 (pair picks + snake from pick 3) vs Option 2 (R0 bonus + skip rounds).</div>
    </div></div>
    <div class="do ph" style="margin-bottom:6px"><div class="do-body">
      <span class="ptag pth">OPEN</span>
      <div class="dt">Monthly Event Format</div>
      <div class="dd">Option A (full RR + final) vs Option B (2 pools + bracket).</div>
    </div></div>
    <div class="do pm" style="margin-bottom:6px"><div class="do-body">
      <span class="ptag ptm">OPEN</span>
      <div class="dt">Player Classifications / Tiers</div>
      <div class="dd">Assign role + tier to all 37 pool players before the draft.</div>
    </div></div>
    <div class="do pm" style="margin-bottom:6px"><div class="do-body">
      <span class="ptag ptm">OPEN</span>
      <div class="dt">Season Scoring Format</div>
      <div class="dd">Points per finish, season standings tracking, draft order implications.</div>
    </div></div>
    <div class="do pm"><div class="do-body">
      <span class="ptag ptm">OPEN</span>
      <div class="dt">Mid-Season Transfer &amp; Replacement Rules</div>
      <div class="dd">Transfer window criteria + replacement process for &lt;6 available players.</div>
    </div></div>`;
  const oc = document.getElementById('open-count');
  if (oc) oc.textContent = '5';
}

// ── Decisions (governance tab) ─────────────────────────────────────
async function renderDecisions() {
  const archivedEl = document.getElementById('decisions-archived-list');
  if (!archivedEl) return;
  try {
    const all = await api('/api/decisions');
    archivedEl.innerHTML = all.map(d => {
      const label = d.resolution || d.description || 'Superseded';
      return `<div style="display:grid;grid-template-columns:40px 1fr auto;gap:6px;align-items:baseline;padding:6px 10px;border-bottom:1px solid var(--border2);background:#fff">
        <span style="font-family:'Roboto Mono',monospace;font-size:10px;color:var(--muted)">${d.ref}</span>
        <div><span style="font-size:12px;font-weight:600;color:var(--muted)">${d.topic}</span>${label ? `<span style="font-size:11px;color:var(--muted)"> — ${label}</span>` : ''}</div>
        <span style="font-family:'Roboto Mono',monospace;font-size:9px;background:#f5f5f5;color:var(--muted);padding:1px 5px;border-radius:2px;white-space:nowrap">archived</span>
      </div>`;
    }).join('');
  } catch(e) {
    if (archivedEl) archivedEl.innerHTML = '<div style="padding:10px;font-size:12px;color:var(--muted)">No archived decisions found.</div>';
  }
}

// ── Next Steps ─────────────────────────────────────────────────────
function renderNextSteps() {
  const steps=[
    ['1','All 6','Decide format: Option A (full RR + final) or Option B (2 pools + bracket). Present to captains once decided.','🔴 Open'],
    ['2','All 6','Assign role + tier to all 37 pool players. Share with captains before draft.','Before draft'],
    ['3','All 6','Finalise Season 3 draft order (based on inverse Season 2 final standings).','Before draft'],
    ['4','All 6','Publish snake draft rules, pick order table, and skip rounds to all 6 captains.','Before draft'],
    ['5','Captains','Each captain must pick their Wingman using one of their picks — must happen by end of R5.','Draft day'],
    ['6','Captains','Run draft (Option 1 or 2 — pending decision). Each captain picks Wingman by end of pick 5 (Opt 1) or R5 (Opt 2).','Draft day'],
    ['7','All 6','Review rosters for tier balance. Flag any significant imbalances.','Post-draft'],
    ['8','All 6','Publish all 6 rosters. Open 48-hour player appeals window.','Post-draft'],
    ['9','All 6','Book venue. Confirm 2 courts for 3.5-hour event block.','Before Month 1'],
    ['10','All 6','Publish full Season 3 schedule and confirmed format to all 42 players.','Before Month 1'],
  ];
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
  const monthly={'Before':['6 teams confirmed — full rosters of 7','6 Wingmen assigned (one per team)','Venue and 2 courts booked — Sundays 2 PM – 5:30 PM','Prior month standings updated','Any substitutions approved'],'Day Of':['Wingmen present with their teams','Referee confirmed for finals','Standings / seedings calculated after RR','Finals bracket set and shared'],'After':['Results and standings published within 24 hrs','Tier observations logged by all Wingmen','Conduct issues reported to core group']};
  const season={'Tiers & Pool':['All 42 players tiered by core consensus','Draft order confirmed (inverse standings)'],'Roles':['Season 3 Wingman assignments confirmed'],'Captains':['Nominations submitted privately','All 6 captains confirmed','Wingman–captain pairings announced','Draft format (snake) confirmed and communicated'],'Draft':['Draft order published to all captains','Draft conducted — tier balance reviewed','Players notified of team within 24 hours','48-hr appeals window opened and closed','Season schedule and format published']};
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
