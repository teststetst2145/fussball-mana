'use strict';

// ============================================================
// STATE
// ============================================================
const DB_KEY = 'fussball_v4';

const APP = {
  view: 'players-list',
  params: {},
  sessFilter: 'training',
  data: null,
};

// ============================================================
// DATA LAYER
// ============================================================
function loadData() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? JSON.parse(raw) : empty();
  } catch (_) { return empty(); }
}
function empty() {
  return { players: [], sessions: [], catalog: [], penalties: [] };
}
function persist() {
  localStorage.setItem(DB_KEY, JSON.stringify(APP.data));
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// Players
const players   = () => APP.data.players;
const player    = id => APP.data.players.find(p => p.id === id);
function upsertPlayer(p) {
  const i = APP.data.players.findIndex(x => x.id === p.id);
  i >= 0 ? (APP.data.players[i] = p) : APP.data.players.push(p);
  persist();
}
function deletePlayer(id) {
  APP.data.players = APP.data.players.filter(p => p.id !== id);
  APP.data.sessions.forEach(s => { s.att = (s.att||[]).filter(a => a.pid !== id); });
  APP.data.penalties = APP.data.penalties.filter(p => p.pid !== id);
  persist();
}

// Sessions
const sessions  = t => t ? APP.data.sessions.filter(s => s.type === t) : APP.data.sessions;
const session   = id => APP.data.sessions.find(s => s.id === id);
function upsertSession(s) {
  const i = APP.data.sessions.findIndex(x => x.id === s.id);
  i >= 0 ? (APP.data.sessions[i] = s) : APP.data.sessions.push(s);
  persist();
}
function deleteSession(id) {
  APP.data.sessions = APP.data.sessions.filter(s => s.id !== id);
  persist();
}

// Penalty catalog
const catalog    = () => APP.data.catalog;
const catEntry   = id => APP.data.catalog.find(e => e.id === id);
function upsertCatEntry(e) {
  const i = APP.data.catalog.findIndex(x => x.id === e.id);
  i >= 0 ? (APP.data.catalog[i] = e) : APP.data.catalog.push(e);
  persist();
}
function deleteCatEntry(id) {
  APP.data.catalog = APP.data.catalog.filter(e => e.id !== id);
  persist();
}

// Player penalties
const playerPens  = pid => APP.data.penalties.filter(p => p.pid === pid);
function addPenalty(pp)  { APP.data.penalties.push(pp); persist(); }
function deletePenalty(id) { APP.data.penalties = APP.data.penalties.filter(p => p.id !== id); persist(); }
function togglePaid(id) {
  const p = APP.data.penalties.find(x => x.id === id);
  if (p) { p.paid = !p.paid; persist(); }
}

// ============================================================
// STATISTICS
// ============================================================
function calcStat(sessList, pid) {
  let present = 0, excused = 0, unexcused = 0, marked = 0;
  sessList.forEach(s => {
    const a = (s.att||[]).find(a => a.pid === pid);
    if (!a || !a.status) return;
    marked++;
    if (a.status === 'p') present++;
    else if (a.status === 'e') excused++;
    else if (a.status === 'u') unexcused++;
  });
  const pct = marked > 0 ? Math.round((present / marked) * 100) : null;
  return { present, excused, unexcused, total: marked, pct };
}
function playerStats(pid) {
  return {
    tr: calcStat(sessions('training'), pid),
    ga: calcStat(sessions('game'), pid),
  };
}
function totalUnexcused(pid) {
  const s = playerStats(pid);
  return s.tr.unexcused + s.ga.unexcused;
}
function suggestions(pid) {
  const ue = totalUnexcused(pid);
  return catalog().filter(e => e.trigger && e.trigger > 0 && ue >= e.trigger);
}
function unpaidTotal(pid) {
  return playerPens(pid).filter(p => !p.paid).reduce((s, p) => s + (p.amount||0), 0);
}
function pctCls(pct) {
  if (pct === null) return '';
  return pct >= 75 ? 'ok' : pct >= 50 ? 'mid' : 'bad';
}
function pctTxt(pct) {
  if (pct === null) return '';
  return pct >= 75 ? 'tok' : pct >= 50 ? 'tmid' : 'tbad';
}

// ============================================================
// NAVIGATION
// ============================================================
function nav(view, params = {}) {
  APP.view = view;
  APP.params = params;
  render();
}
function back() {
  const map = {
    'player-detail':  () => nav('players-list'),
    'player-form':    () => APP.params.ret ? nav('player-detail', { id: APP.params.id }) : nav('players-list'),
    'session-detail': () => nav('sessions-list'),
    'session-form':   () => nav('sessions-list'),
    'penalty-form':   () => nav('penalties-list'),
    'lineup':         () => nav('session-detail', { id: APP.params.id }),
  };
  (map[APP.view] || (() => nav('players-list')))();
}

// ============================================================
// RENDER ENGINE
// ============================================================
function render() {
  const app = document.getElementById('app');
  const sub = !['players-list','sessions-list','penalties-list'].includes(APP.view);
  const viewMap = {
    'players-list':  vPlayersList,
    'player-detail': () => vPlayerDetail(APP.params.id),
    'player-form':   () => vPlayerForm(APP.params.id),
    'sessions-list': vSessionsList,
    'session-detail':() => vSessionDetail(APP.params.id),
    'session-form':  () => vSessionForm(APP.params.id),
    'penalties-list':vPenaltiesList,
    'penalty-form':  () => vPenaltyForm(APP.params.id),
    'lineup':        () => vLineup(APP.params.id),
  };
  const fn = viewMap[APP.view] || (() => '<div class="empty"><p>?</p></div>');
  app.innerHTML = hdr(sub) + `<div class="content">${fn()}</div>` + (sub ? '' : navBar());
  app.querySelector('.content').scrollTop = 0;
  postRender();
}

function hdr(isBack) {
  const titles = {
    'players-list':  '⚽ Mannschaft',
    'sessions-list': '📅 Termine',
    'penalties-list':'💰 Strafen',
    'player-detail': h(player(APP.params.id)?.name) || 'Spieler',
    'player-form':   APP.params.id ? 'Spieler bearbeiten' : 'Neuer Spieler',
    'session-detail':(() => { const s = session(APP.params.id); return s ? h(s.title || fmtDate(s.date)) : 'Termin'; })(),
    'session-form':  APP.params.id ? 'Termin bearbeiten' : 'Neuer Termin',
    'penalty-form':  APP.params.id ? 'Strafe bearbeiten' : 'Neue Strafe',
    'lineup':        (() => { const s = session(APP.params.id); return '📋 ' + (s?.title || fmtDate(s?.date) || 'Aufstellung'); })(),
  };
  const extra = (() => {
    if (APP.view === 'player-detail')
      return `<button class="hdr-act" onclick="nav('player-form',{id:'${APP.params.id}',ret:true})">✏️</button>`;
    if (APP.view === 'session-detail')
      return `<button class="hdr-act" onclick="confirmDel('session','${APP.params.id}')">🗑️</button>`;
    return '';
  })();
  return `<header class="hdr">
    ${isBack ? `<button class="hdr-back" onclick="back()">←</button>` : ''}
    <div class="hdr-title">${titles[APP.view] || ''}</div>
    ${extra}
  </header>`;
}

function navBar() {
  const tabs = [
    { v: 'players-list',  ico: '👥', lbl: 'Spieler' },
    { v: 'sessions-list', ico: '📅', lbl: 'Termine' },
    { v: 'penalties-list',ico: '💰', lbl: 'Strafen' },
  ];
  return `<nav class="nav">${tabs.map(t =>
    `<button class="nav-btn ${APP.view===t.v?'active':''}" onclick="nav('${t.v}')">
      <span class="ico">${t.ico}</span>${t.lbl}
    </button>`).join('')}</nav>`;
}

// ============================================================
// VIEW: PLAYERS LIST
// ============================================================
function vPlayersList() {
  const ps = players();
  const fab = `<button class="fab" onclick="nav('player-form',{})">+</button>`;
  if (!ps.length) return `<div class="empty">
    <div class="ico">👥</div><h3>Noch keine Spieler</h3>
    <p>Füge deine Spieler hinzu um loszulegen.</p></div>${fab}`;

  const cards = ps.map(p => {
    const st = playerStats(p.id);
    const tp = st.tr.pct, gp = st.ga.pct;
    const owed = unpaidTotal(p.id);
    const av = p.photo
      ? `<img src="${p.photo}" alt="${h(p.name)}">`
      : h(p.name[0].toUpperCase());
    return `<div class="player-card" onclick="nav('player-detail',{id:'${p.id}'})">
      ${owed > 0 ? `<div class="badge">€${owed.toFixed(2)}</div>` : ''}
      <div class="avatar av-md">${av}</div>
      <div class="player-card-name">${h(p.name)}</div>
      <div class="stat-mini">
        <div class="stat-mini-row">
          <span class="stat-mini-lbl">🏃</span>
          <div class="bar-track"><div class="bar-fill ${pctCls(tp)}" style="width:${tp??0}%"></div></div>
          <span class="stat-mini-pct">${tp!==null?tp+'%':'–'}</span>
        </div>
        <div class="stat-mini-row">
          <span class="stat-mini-lbl">⚽</span>
          <div class="bar-track"><div class="bar-fill ${pctCls(gp)}" style="width:${gp??0}%"></div></div>
          <span class="stat-mini-pct">${gp!==null?gp+'%':'–'}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  return `<div class="player-grid">${cards}</div><div class="spacer"></div>${fab}`;
}

// ============================================================
// VIEW: PLAYER DETAIL
// ============================================================
function vPlayerDetail(id) {
  const p = player(id);
  if (!p) return '<div class="empty"><p>Spieler nicht gefunden.</p></div>';

  const st = playerStats(id);
  const pens = playerPens(id);
  const owed = pens.filter(x => !x.paid).reduce((s,x) => s+(x.amount||0), 0);
  const sugg = suggestions(id);
  const av = p.photo ? `<img src="${p.photo}" alt="${h(p.name)}">` : h(p.name[0].toUpperCase());

  function sBar(stat, label) {
    const pct = stat.pct, w = pct??0;
    return `
      <div class="stat-row">
        <span class="stat-lbl">${label}</span>
        <div class="bar-track-lg"><div class="bar-fill-lg ${pctCls(pct)}" style="width:${w}%"></div></div>
        <span class="stat-pct ${pctTxt(pct)}">${pct!==null?pct+'%':'–'}</span>
      </div>
      <div class="stat-sub">✅ ${stat.present} · 🟡 ${stat.excused} · ❌ ${stat.unexcused} / ${stat.total} Termine</div>`;
  }

  const suggHtml = sugg.length ? `
    <div class="alert">
      <span class="ico">⚠️</span>
      <div>
        <strong>Strafe fällig!</strong> ${h(p.name)} hat ${totalUnexcused(id)}× unentschuldigt gefehlt.
        <div class="chips">${sugg.map(s =>
          `<div class="chip" onclick="openAssign('${id}','${s.id}')">➕ ${h(s.reason)} (${fmtEuro(s.amount)})</div>`
        ).join('')}</div>
      </div>
    </div>` : '';

  const pensHtml = pens.length ? `
    <div class="section pen-list" style="padding:0;overflow:hidden;">
      <div style="padding:14px 16px 0"><div class="section-title">Strafen</div></div>
      ${pens.map(pen => `
        <div class="pen-item">
          <div class="pen-info">
            <div class="pen-reason">${h(pen.reason)}</div>
            <div class="pen-sub">${pen.date?fmtDate(pen.date):''}${pen.note?' · '+h(pen.note):''}</div>
          </div>
          <span class="pen-amt ${pen.paid?'paid':''}">${fmtEuro(pen.amount)}</span>
          <button class="paid-btn ${pen.paid?'paid':''}" onclick="doPaid('${pen.id}')"
            title="${pen.paid?'Als offen markieren':'Als bezahlt markieren'}">${pen.paid?'✓':''}</button>
          <button class="del-btn" onclick="confirmDel('pen','${pen.id}')">×</button>
        </div>`).join('')}
      ${owed > 0 ? `<div class="pen-total">
        <span class="pen-total-lbl">Offen gesamt</span>
        <span class="pen-total-amt">${fmtEuro(owed)}</span>
      </div>` : ''}
    </div>` : `
    <div class="section"><div class="section-title">Strafen</div>
      <p style="font-size:14px;color:var(--muted);">Keine Strafen zugewiesen.</p>
    </div>`;

  const notesHtml = p.notes ? `
    <div class="section">
      <div class="section-title">Notizen</div>
      <div style="font-size:14px;line-height:1.7;white-space:pre-wrap;">${h(p.notes)}</div>
    </div>` : '';

  return `
    <div class="detail-hdr">
      <div class="avatar av-lg">${av}</div>
      <div class="detail-hdr-info">
        <div class="detail-hdr-name">${h(p.name)}</div>
        <div class="detail-hdr-sub">
          🏃 Training: ${st.tr.pct!==null?st.tr.pct+'%':'keine Daten'}<br>
          ⚽ Spiele: ${st.ga.pct!==null?st.ga.pct+'%':'keine Daten'}
        </div>
      </div>
    </div>
    ${suggHtml}
    <div class="section">
      <div class="section-title">Anwesenheit</div>
      ${sBar(st.tr,'🏃 Training')}
      ${sBar(st.ga,'⚽ Spiele')}
    </div>
    ${notesHtml}
    ${pensHtml}
    <div class="action-bar">
      <button class="btn btn-primary" onclick="openAssign('${id}',null)">➕ Strafe zuweisen</button>
      <button class="btn btn-danger" onclick="confirmDel('player','${id}')">🗑️</button>
    </div>
    <div class="spacer"></div>`;
}

// ============================================================
// VIEW: PLAYER FORM
// ============================================================
function vPlayerForm(id) {
  const p = id ? player(id) : null;
  return `<div class="form-wrap">
    <div class="fg">
      <label class="lbl">Foto</label>
      <div class="photo-area" id="photoArea">
        <img class="photo-preview" id="photoPreview" ${p?.photo?`src="${p.photo}" style="display:block"`:''}  alt="">
        ${!p?.photo ? '<div class="photo-ico">📷</div>' : ''}
        <div class="photo-lbl" id="photoLbl">${p?.photo?'Foto ändern':'Foto auswählen'}</div>
        <input type="file" id="photoInput" accept="image/*">
      </div>
    </div>
    <div class="fg">
      <label class="lbl" for="pName">Name *</label>
      <input class="inp" type="text" id="pName" placeholder="Vorname Nachname"
        value="${h(p?.name||'')}" autocomplete="name">
    </div>
    <div class="fg">
      <label class="lbl" for="pNotes">Notizen</label>
      <textarea class="inp" id="pNotes" placeholder="Position, Trikotnummer, Kontakt…">${h(p?.notes||'')}</textarea>
    </div>
    <input type="hidden" id="pPhoto" value="${p?.photo||''}">
    <div class="action-bar" style="padding:0;">
      <button class="btn btn-primary" onclick="doSavePlayer('${id||''}')">💾 Speichern</button>
      <button class="btn btn-secondary" onclick="back()">Abbrechen</button>
    </div>
  </div>`;
}

// ============================================================
// VIEW: SESSIONS LIST
// ============================================================
function vSessionsList() {
  const type = APP.sessFilter;
  const list = sessions(type).sort((a,b) => b.date.localeCompare(a.date));
  const tabs = `<div class="sess-tabs">
    <button class="sess-tab ${type==='training'?'active':''}" onclick="setSessFilter('training')">🏃 Training</button>
    <button class="sess-tab ${type==='game'?'active':''}" onclick="setSessFilter('game')">⚽ Spiele</button>
  </div>`;
  const fab = `<button class="fab" onclick="nav('session-form',{})">+</button>`;

  if (!list.length) return `${tabs}<div class="empty">
    <div class="ico">${type==='training'?'🏃':'⚽'}</div>
    <h3>Keine ${type==='training'?'Trainings':'Spiele'}</h3>
    <p>Erstelle deinen ersten ${type==='training'?'Trainingstermin':'Spieltermin'}.</p>
  </div>${fab}`;

  const items = list.map(s => {
    const att = (s.att||[]);
    const present = att.filter(a => a.status==='p').length;
    const total   = att.filter(a => a.status).length;
    const stats   = total > 0 ? `${present} / ${total} anwesend` : 'Noch nicht erfasst';
    return `<div class="sess-card" onclick="nav('session-detail',{id:'${s.id}'})">
      <div class="sess-ico ${s.type==='game'?'game':''}">${s.type==='training'?'🏃':'⚽'}</div>
      <div class="sess-info">
        <div class="sess-title">${h(s.title||fmtDate(s.date))}</div>
        <div class="sess-date">${fmtDate(s.date)}</div>
        <div class="sess-stats">${stats}</div>
      </div>
      <span class="sess-arrow">›</span>
    </div>`;
  }).join('');

  return `${tabs}<div class="sess-list">${items}</div><div class="spacer"></div>${fab}`;
}

// ============================================================
// VIEW: SESSION DETAIL (ATTENDANCE)
// ============================================================
function vSessionDetail(id) {
  const s = session(id);
  if (!s) return '<div class="empty"><p>Termin nicht gefunden.</p></div>';
  const ps = players();
  if (!ps.length) return `<div class="empty">
    <div class="ico">👥</div><h3>Keine Spieler</h3>
    <p>Füge zuerst Spieler zur Mannschaft hinzu.</p></div>`;

  if (!s.att) s.att = [];
  ps.forEach(p => { if (!s.att.find(a => a.pid === p.id)) s.att.push({ pid: p.id, status: null }); });

  const info = `<div class="section" style="margin-bottom:4px;">
    <div style="font-size:14px;color:var(--muted);font-weight:600;">
      ${s.type==='training'?'🏃 Training':'⚽ Spiel'} · ${fmtDate(s.date)}
      ${s.title?`· ${h(s.title)}`:''}
    </div>
    ${s.type==='game' ? `<button class="btn btn-secondary" style="margin-top:12px;width:100%;"
      onclick="nav('lineup',{id:'${id}'})">📋 Aufstellung bearbeiten</button>` : ''}
  </div>`;

  const items = ps.map(p => {
    const a = s.att.find(x => x.pid === p.id);
    const st = a?.status || null;
    const av = p.photo ? `<img src="${p.photo}" alt="${h(p.name)}">` : h(p.name[0].toUpperCase());
    return `<div class="att-item">
      <div class="avatar av-sm">${av}</div>
      <div class="att-name">${h(p.name)}</div>
      <div class="att-btns">
        <button class="att-btn ${st==='p'?'p':''}" onclick="setAtt('${id}','${p.id}','p')" title="Anwesend">✓</button>
        <button class="att-btn ${st==='e'?'e':''}" onclick="setAtt('${id}','${p.id}','e')" title="Entschuldigt">✕</button>
        <button class="att-btn ${st==='u'?'u':''}" onclick="setAtt('${id}','${p.id}','u')" title="Unentschuldigt">U</button>
      </div>
    </div>`;
  }).join('');

  return `${info}<div class="att-list">${items}</div><div class="spacer"></div>`;
}

// ============================================================
// VIEW: SESSION FORM
// ============================================================
function vSessionForm(id) {
  const s = id ? session(id) : null;
  const today = new Date().toISOString().slice(0,10);
  const type = s?.type || APP.sessFilter || 'training';
  return `<div class="form-wrap">
    <div class="fg">
      <label class="lbl">Typ</label>
      <div class="radio-group">
        <label class="radio-opt ${type==='training'?'sel':''}" id="rtTraining">
          <input type="radio" name="stype" value="training" ${type==='training'?'checked':''}>🏃 Training
        </label>
        <label class="radio-opt ${type==='game'?'sel':''}" id="rtGame">
          <input type="radio" name="stype" value="game" ${type==='game'?'checked':''}>⚽ Spiel
        </label>
      </div>
    </div>
    <div class="fg">
      <label class="lbl" for="sDate">Datum *</label>
      <input class="inp" type="date" id="sDate" value="${s?.date||today}">
    </div>
    <div class="fg">
      <label class="lbl" for="sTitle">Bezeichnung (optional)</label>
      <input class="inp" type="text" id="sTitle"
        placeholder="z.B. Pokalspiel vs. FC Muster"
        value="${h(s?.title||'')}">
    </div>
    <div class="action-bar" style="padding:0;">
      <button class="btn btn-primary" onclick="doSaveSession('${id||''}')">💾 Speichern</button>
      <button class="btn btn-secondary" onclick="back()">Abbrechen</button>
    </div>
  </div>`;
}

// ============================================================
// VIEW: PENALTIES LIST
// ============================================================
function vPenaltiesList() {
  const cat = catalog();
  const ps  = players();

  const catSection = cat.length ? `
    <div class="cat-list">${cat.map(e => `
      <div class="cat-card">
        <span style="font-size:26px;">💰</span>
        <div class="cat-info">
          <div class="cat-reason">${h(e.reason)}</div>
          ${e.trigger?`<div class="cat-trigger">⚠️ Auslöser: ${e.trigger}× unentschuldigt</div>`:''}
        </div>
        <div class="cat-amt">${fmtEuro(e.amount)}</div>
        <button class="icon-btn" onclick="nav('penalty-form',{id:'${e.id}'})">✏️</button>
        <button class="icon-btn" onclick="confirmDel('cat','${e.id}')">🗑️</button>
      </div>`).join('')}
    </div>` : `<div class="empty" style="padding:36px 32px 16px;">
      <div class="ico">📋</div><h3>Kein Strafenkatalog</h3>
      <p>Erstelle Strafen um sie Spielern zuzuweisen.</p>
    </div>`;

  const withPens = ps.filter(p => playerPens(p.id).length > 0);
  const ovSection = withPens.length ? `
    <div class="divider-title">Strafenübersicht</div>
    ${withPens.map(p => {
      const pens = playerPens(p.id);
      const owed = pens.filter(x=>!x.paid).reduce((s,x)=>s+(x.amount||0),0);
      const av = p.photo
        ? `<img src="${p.photo}" alt="${h(p.name)}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;">`
        : `<div class="avatar av-sm">${h(p.name[0].toUpperCase())}</div>`;
      return `<div class="ov-item">
        <div class="ov-row" onclick="nav('player-detail',{id:'${p.id}'})">
          ${av}
          <span class="ov-name">${h(p.name)}</span>
          <span style="font-size:12px;color:var(--muted);margin-right:6px;">${pens.length}×</span>
          ${owed>0
            ? `<span class="ov-amt">€ ${owed.toFixed(2)} offen</span>`
            : `<span class="ov-ok">✓ Bezahlt</span>`}
        </div>
      </div>`;
    }).join('')}` : '';

  const isUnlocked = players().some(p => p.name.trim().toLowerCase() === 'dasdarfnurichmachen');
  const backupSection = isUnlocked ? `
    <div class="backup-card">
      <div class="backup-title">📦 Datensicherung</div>
      <div class="backup-sub">
        Alle Daten (Spieler, Termine, Strafen) exportieren um sie auf einem neuen Gerät wiederherzustellen.
      </div>
      <div class="backup-btns">
        <button class="btn btn-ghost" onclick="exportData()">⬇️ Exportieren</button>
        <button class="btn btn-ghost" onclick="importData()">⬆️ Importieren</button>
      </div>
    </div>` : '';

  return `
    <div class="divider-title">Strafenkatalog</div>
    ${catSection}
    ${ovSection ? `<div style="margin-top:6px;">${ovSection}</div>` : ''}
    ${isUnlocked ? '<div class="divider-title">Daten</div>' : ''}
    ${backupSection}
    <div class="spacer"></div>
    <button class="fab" onclick="nav('penalty-form',{})">+</button>`;
}

// ============================================================
// VIEW: PENALTY FORM
// ============================================================
function vPenaltyForm(id) {
  const e = id ? catEntry(id) : null;
  return `<div class="form-wrap">
    <div class="fg">
      <label class="lbl" for="catReason">Strafengrund *</label>
      <input class="inp" type="text" id="catReason"
        placeholder="z.B. Unentschuldigtes Fehlen, Zu spät…"
        value="${h(e?.reason||'')}">
    </div>
    <div class="fg">
      <label class="lbl" for="catAmt">Betrag (€) *</label>
      <input class="inp" type="number" id="catAmt"
        placeholder="0,00" step="0.5" min="0"
        value="${e?.amount!==undefined?e.amount:''}">
    </div>
    <div class="fg">
      <label class="lbl" for="catTrigger">Automatischer Auslöser (optional)</label>
      <input class="inp" type="number" id="catTrigger"
        placeholder="z.B. 3" min="1" step="1"
        value="${e?.trigger||''}">
      <div class="hint">Anzahl unentschuldigter Fehlzeiten, ab der diese Strafe automatisch vorgeschlagen wird.</div>
    </div>
    <div class="action-bar" style="padding:0;">
      <button class="btn btn-primary" onclick="doSaveCatEntry('${id||''}')">💾 Speichern</button>
      <button class="btn btn-secondary" onclick="back()">Abbrechen</button>
    </div>
  </div>`;
}

// ============================================================
// MODAL: ASSIGN PENALTY
// ============================================================
function openAssign(pid, suggestedCatId) {
  const cat = catalog();
  const p   = player(pid);
  if (!cat.length) { showAlert('Kein Strafenkatalog', 'Erstelle zuerst Einträge im Strafenkatalog.'); return; }

  const today = new Date().toISOString().slice(0,10);
  const items = cat.map(e => `
    <div class="modal-cat-item" onclick="pickCatItem('${e.id}')">
      <div class="modal-cat-info">
        <div class="modal-cat-reason">${h(e.reason)}</div>
        ${e.trigger?`<div class="modal-cat-sub">⚠️ Auslöser ab ${e.trigger}× unentschuldigt</div>`:''}
      </div>
      <div class="modal-cat-amt">${fmtEuro(e.amount)}</div>
    </div>`).join('');

  const el = document.createElement('div');
  el.className = 'backdrop';
  el.id = 'assignModal';
  el.innerHTML = `
    <div class="sheet">
      <div class="sheet-hdr">
        <div class="sheet-title">Strafe – ${h(p?.name||'')}</div>
        <button class="sheet-close" onclick="closeModal()">×</button>
      </div>
      <div class="sheet-body">
        <div id="mStep1">
          <p style="font-size:13px;color:var(--muted);margin-bottom:10px;">Strafe auswählen:</p>
          ${items}
        </div>
        <div id="mStep2" style="display:none">
          <div style="font-size:15px;font-weight:800;margin-bottom:16px;" id="mSelLabel"></div>
          <div class="fg">
            <label class="lbl" for="mDate">Datum</label>
            <input class="inp" type="date" id="mDate" value="${today}">
          </div>
          <div class="fg">
            <label class="lbl" for="mNote">Notiz (optional)</label>
            <input class="inp" type="text" id="mNote" placeholder="Grund, Details…">
          </div>
          <div class="action-bar" style="padding:0;margin-top:8px;">
            <button class="btn btn-primary" onclick="doAssign('${pid}')">✓ Strafe zuweisen</button>
            <button class="btn btn-secondary" onclick="document.getElementById('mStep1').style.display='';document.getElementById('mStep2').style.display='none';">← Zurück</button>
          </div>
        </div>
        <input type="hidden" id="mCatId" value="">
      </div>
    </div>`;
  el.addEventListener('click', e => { if (e.target === el) closeModal(); });
  document.body.appendChild(el);
  if (suggestedCatId) pickCatItem(suggestedCatId);
}

function pickCatItem(catId) {
  const e = catEntry(catId);
  if (!e) return;
  document.getElementById('mCatId').value = catId;
  document.getElementById('mSelLabel').textContent = `${e.reason} – ${fmtEuro(e.amount)}`;
  document.getElementById('mStep1').style.display = 'none';
  document.getElementById('mStep2').style.display  = '';
}

function doAssign(pid) {
  const catId  = document.getElementById('mCatId').value;
  const date   = document.getElementById('mDate').value;
  const note   = document.getElementById('mNote').value.trim();
  const e = catEntry(catId);
  if (!e) return;
  addPenalty({ id: uid(), pid, catId, reason: e.reason, amount: e.amount,
    date: date||new Date().toISOString().slice(0,10), note, paid: false });
  closeModal();
  nav('player-detail', { id: pid });
}

function closeModal() {
  ['assignModal','dlgWrap'].forEach(id => { const el = document.getElementById(id); if(el) el.remove(); });
}

// ============================================================
// CONFIRM / ALERT DIALOGS
// ============================================================
function showConfirm(title, text, onYes) {
  const el = document.createElement('div');
  el.className = 'dlg-wrap'; el.id = 'dlgWrap';
  el.innerHTML = `<div class="dlg">
    <h3>${h(title)}</h3><p>${h(text)}</p>
    <div class="dlg-btns">
      <button class="btn btn-danger" id="dlgYes">Löschen</button>
      <button class="btn btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div></div>`;
  document.body.appendChild(el);
  document.getElementById('dlgYes').onclick = () => { closeModal(); onYes(); };
}

function showAlert(title, text) {
  const el = document.createElement('div');
  el.className = 'dlg-wrap'; el.id = 'dlgWrap';
  el.innerHTML = `<div class="dlg">
    <h3>${h(title)}</h3><p>${h(text)}</p>
    <div class="dlg-btns"><button class="btn btn-primary" onclick="closeModal()">OK</button></div>
  </div>`;
  document.body.appendChild(el);
}

function confirmDel(type, id) {
  const msgs = {
    player:  ['Spieler löschen',  `${player(id)?.name||'Diesen Spieler'} wirklich löschen? Alle Daten gehen verloren.`],
    session: ['Termin löschen',   'Diesen Termin und alle Anwesenheiten löschen?'],
    cat:     ['Strafe löschen',   `"${catEntry(id)?.reason||''}" aus dem Katalog löschen?`],
    pen:     ['Strafe entfernen', 'Diese Strafe entfernen?'],
  };
  const [title, text] = msgs[type] || ['Löschen?',''];
  const actions = {
    player:  () => { deletePlayer(id); nav('players-list'); },
    session: () => { deleteSession(id); nav('sessions-list'); },
    cat:     () => { deleteCatEntry(id); nav('penalties-list'); },
    pen:     () => { deletePenalty(id); nav('player-detail', { id: APP.params.id }); },
  };
  showConfirm(title, text, actions[type] || (() => {}));
}

// ============================================================
// INLINE ACTIONS
// ============================================================
function setSessFilter(t) { APP.sessFilter = t; nav('sessions-list'); }

function setAtt(sessId, pid, status) {
  const s = session(sessId);
  if (!s) return;
  if (!s.att) s.att = [];
  let a = s.att.find(x => x.pid === pid);
  if (!a) { a = { pid, status: null }; s.att.push(a); }
  a.status = a.status === status ? null : status; // toggle
  upsertSession(s);
  render();
}

function doPaid(id) { togglePaid(id); nav('player-detail', { id: APP.params.id }); }

// ============================================================
// SAVE ACTIONS
// ============================================================
function doSavePlayer(id) {
  const name = document.getElementById('pName').value.trim();
  if (!name) { showAlert('Fehler', 'Bitte gib einen Namen ein.'); return; }
  const notes = document.getElementById('pNotes').value.trim();
  const photo = document.getElementById('pPhoto').value;
  const p = { id: id||uid(), name, notes, photo: photo||null };
  upsertPlayer(p);
  APP.params.ret ? nav('player-detail', { id: p.id }) : nav('players-list');
}

function doSaveSession(id) {
  const date = document.getElementById('sDate').value;
  if (!date) { showAlert('Fehler', 'Bitte wähle ein Datum.'); return; }
  const typeEl = document.querySelector('input[name="stype"]:checked');
  const type   = typeEl ? typeEl.value : 'training';
  const title  = document.getElementById('sTitle').value.trim();
  const s = { id: id||uid(), date, type, title, att: id ? (session(id)?.att||[]) : [] };
  upsertSession(s);
  APP.sessFilter = type;
  nav('session-detail', { id: s.id });
}

function doSaveCatEntry(id) {
  const reason = document.getElementById('catReason').value.trim();
  if (!reason) { showAlert('Fehler', 'Bitte gib einen Strafengrund ein.'); return; }
  const amtVal = document.getElementById('catAmt').value;
  if (!amtVal) { showAlert('Fehler', 'Bitte gib einen Betrag ein.'); return; }
  const amount = parseFloat(amtVal);
  if (isNaN(amount) || amount < 0) { showAlert('Fehler', 'Ungültiger Betrag.'); return; }
  const trigVal = document.getElementById('catTrigger').value;
  const trigger = trigVal ? parseInt(trigVal) : null;
  upsertCatEntry({ id: id||uid(), reason, amount, trigger: trigger&&trigger>0?trigger:null });
  nav('penalties-list');
}

// ============================================================
// PHOTO HANDLING
// ============================================================
function postRender() {
  // Photo upload
  const input = document.getElementById('photoInput');
  if (input) {
    input.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const dataUrl = await compressImg(file);
      document.getElementById('pPhoto').value = dataUrl;
      const prev = document.getElementById('photoPreview');
      prev.src = dataUrl; prev.style.display = 'block';
      const ico = document.querySelector('.photo-ico');
      if (ico) ico.style.display = 'none';
      const lbl = document.getElementById('photoLbl');
      if (lbl) lbl.textContent = 'Foto ändern';
    });
  }
  // Radio button styling
  document.querySelectorAll('input[name="stype"]').forEach(r => {
    r.addEventListener('change', () => {
      document.querySelectorAll('.radio-opt').forEach(opt => {
        opt.classList.toggle('sel', opt.querySelector('input').checked);
      });
    });
  });
  // Lineup drag & drop
  if (APP.view === 'lineup') initLineupDrag(APP.params.id);
}

async function compressImg(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 320;
        const sc  = Math.min(MAX/img.width, MAX/img.height, 1);
        const c   = document.createElement('canvas');
        c.width   = Math.round(img.width * sc);
        c.height  = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.75));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================
// UTILITIES
// ============================================================
function h(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function fmtDate(d) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('de-DE',
    { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' });
}
function fmtEuro(n) {
  if (n===undefined||n===null) return '–';
  return new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n);
}

// ============================================================
// VIEW: LINEUP
// ============================================================
function vLineup(sessId) {
  const s = session(sessId);
  if (!s) return '<div class="empty"><p>Spiel nicht gefunden.</p></div>';
  const ps = players();
  if (!ps.length) return `<div class="empty"><div class="ico">👥</div>
    <h3>Keine Spieler</h3><p>Füge zuerst Spieler hinzu.</p></div>`;

  if (!s.lineup) s.lineup = { field: [], bench: [] };
  const fieldPlayers = s.lineup.field || [];
  const benchPids   = s.lineup.bench || [];
  const poolPids    = ps
    .filter(p => !fieldPlayers.find(f => f.pid === p.id) && !benchPids.includes(p.id))
    .map(p => p.id);

  function token(pid, area, style = '') {
    const p = player(pid);
    if (!p) return '';
    const av = p.photo ? `<img src="${p.photo}" alt="">` : h(p.name[0].toUpperCase());
    return `<div class="lu-token" data-pid="${p.id}" data-area="${area}" style="${style}" title="${h(p.name)}">
      <div class="lu-av">${av}</div>
      <div class="lu-name">${h(p.name.split(' ')[0])}</div>
    </div>`;
  }

  const fieldTokens = fieldPlayers.map(fp =>
    token(fp.pid, 'field', `left:${fp.x}%;top:${fp.y}%;transform:translate(-50%,-50%);position:absolute;`)
  ).join('');

  const benchTokens = benchPids.map(pid => token(pid, 'bench')).join('');
  const poolTokens  = poolPids.map(pid  => token(pid, 'pool')).join('');

  return `
    <div class="lu-wrap">
      <div class="lu-hint">Spieler auf das Feld oder die Ersatzbank ziehen</div>
      <div class="lu-field-container">
        <div class="lu-field" id="luField">
          <div class="lu-line lu-center-line"></div>
          <div class="lu-circle lu-center-circle"></div>
          <div class="lu-dot lu-center-dot"></div>
          <div class="lu-box lu-box-top"></div>
          <div class="lu-box lu-box-bot"></div>
          <div class="lu-goal lu-goal-top"></div>
          <div class="lu-goal lu-goal-bot"></div>
          ${fieldTokens}
        </div>
      </div>
      <div class="lu-zone lu-bench-zone">
        <div class="lu-zone-title">🪑 Ersatzbank</div>
        <div class="lu-zone-body" id="luBench">${benchTokens}</div>
      </div>
      ${poolPids.length ? `
      <div class="lu-zone lu-pool-zone">
        <div class="lu-zone-title">👥 Nicht eingeplant</div>
        <div class="lu-zone-body" id="luPool">${poolTokens}</div>
      </div>` : ''}
    </div>`;
}

// ============================================================
// LINEUP DRAG & DROP
// ============================================================
function initLineupDrag(sessId) {
  const fieldEl = document.getElementById('luField');
  if (!fieldEl) return;

  document.querySelectorAll('.lu-token').forEach(token => {
    token.addEventListener('pointerdown', e => {
      e.preventDefault();
      token.setPointerCapture(e.pointerId);

      const pid = token.dataset.pid;
      const r   = token.getBoundingClientRect();
      const hw  = r.width / 2;
      const hh  = r.height / 2;

      // Create floating ghost
      const ghost = document.createElement('div');
      ghost.className = 'lu-token lu-ghost';
      ghost.innerHTML = token.innerHTML;
      ghost.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;pointer-events:none;z-index:999;`;
      document.body.appendChild(ghost);
      token.classList.add('lu-dragging');

      function onMove(ev) {
        ev.preventDefault();
        ghost.style.left = (ev.clientX - hw) + 'px';
        ghost.style.top  = (ev.clientY - hh) + 'px';
      }

      function onUp(ev) {
        token.removeEventListener('pointermove', onMove);
        token.removeEventListener('pointerup',   onUp);
        token.removeEventListener('pointercancel', onUp);
        token.classList.remove('lu-dragging');

        // Hide ghost to find element underneath
        ghost.style.display = 'none';
        const below = document.elementFromPoint(ev.clientX, ev.clientY);
        ghost.remove();

        const fEl = document.getElementById('luField');
        const bEl = document.getElementById('luBench');
        const pEl = document.getElementById('luPool');

        if (fEl && (fEl === below || fEl.contains(below))) {
          const fr = fEl.getBoundingClientRect();
          const x = Math.max(6, Math.min(94, ((ev.clientX - fr.left) / fr.width)  * 100));
          const y = Math.max(6, Math.min(94, ((ev.clientY - fr.top)  / fr.height) * 100));
          luPlaceField(sessId, pid, x, y);
        } else if (bEl && (bEl === below || bEl.contains(below))) {
          luPlaceBench(sessId, pid);
        } else if (pEl && (pEl === below || pEl.contains(below))) {
          luRemove(sessId, pid);
        }
        // else: dropped outside → no change, just re-render
      }

      token.addEventListener('pointermove', onMove);
      token.addEventListener('pointerup',   onUp);
      token.addEventListener('pointercancel', onUp);
    });
  });
}

function luPlaceField(sessId, pid, x, y) {
  const s = session(sessId);
  if (!s) return;
  if (!s.lineup) s.lineup = { field: [], bench: [] };
  s.lineup.field = s.lineup.field.filter(f => f.pid !== pid);
  s.lineup.bench = s.lineup.bench.filter(b => b !== pid);
  s.lineup.field.push({ pid, x, y });
  upsertSession(s);
  nav('lineup', { id: sessId });
}

function luPlaceBench(sessId, pid) {
  const s = session(sessId);
  if (!s) return;
  if (!s.lineup) s.lineup = { field: [], bench: [] };
  s.lineup.field = s.lineup.field.filter(f => f.pid !== pid);
  s.lineup.bench = s.lineup.bench.filter(b => b !== pid);
  s.lineup.bench.push(pid);
  upsertSession(s);
  nav('lineup', { id: sessId });
}

function luRemove(sessId, pid) {
  const s = session(sessId);
  if (!s) return;
  if (!s.lineup) s.lineup = { field: [], bench: [] };
  s.lineup.field = s.lineup.field.filter(f => f.pid !== pid);
  s.lineup.bench = s.lineup.bench.filter(b => b !== pid);
  upsertSession(s);
  nav('lineup', { id: sessId });
}

// ============================================================
// SERVICE WORKER
// ============================================================
function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js').then(reg => {
    // Wenn ein neuer SW wartet → sofort aktivieren
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });

    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          newSW.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
  }).catch(() => {});

  // Wenn der neue SW übernimmt → Seite automatisch neu laden
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

// ============================================================
// EXPORT / IMPORT
// ============================================================
function exportData() {
  const date    = new Date().toISOString().slice(0, 10);
  const json    = JSON.stringify(APP.data, null, 2);
  const blob    = new Blob([json], { type: 'application/json' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = `fussball-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importData() {
  const input    = document.createElement('input');
  input.type     = 'file';
  input.accept   = '.json,application/json';
  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      // Validate basic structure
      if (!Array.isArray(data.players) || !Array.isArray(data.sessions) ||
          !Array.isArray(data.catalog) || !Array.isArray(data.penalties)) {
        showAlert('Ungültige Datei', 'Diese Datei ist kein gültiges Fußball Manager Backup.');
        return;
      }
      const ps = data.players.length;
      const ss = data.sessions.length;
      showConfirm(
        'Daten importieren',
        `Backup enthält ${ps} Spieler und ${ss} Termine. Alle aktuellen Daten werden überschrieben. Fortfahren?`,
        () => {
          APP.data = data;
          persist();
          nav('players-list');
          setTimeout(() => showAlert('Fertig ✓', 'Daten erfolgreich importiert!'), 200);
        }
      );
    } catch (_) {
      showAlert('Fehler', 'Die Datei konnte nicht gelesen werden.');
    }
  };
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

// ============================================================
// BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  APP.data = loadData();
  render();
  registerSW();
});
