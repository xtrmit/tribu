/* Tribu — Agenda : rendez-vous de la semaine, rappels récurrents, agenda et rappels du jour sur Aujourd'hui.
   Données synchronisées :
   - event  uid event:<membre>:<id>    { titre, date AAAA-MM-JJ, heure HH:MM, pour[], prev none|1h|veille, fait, cree, at }
   - rappel uid rappel:<membre>:<id>   { titre, heures[], rep once|jour|semaine|weekend|lun…dim, date (pour « une fois »), pour[], prive, cree, at }
   - coche  uid coche:<uid rappel>|<date>|<heure>|<membre>   { r, d, h, m, prive, pour, cree }  (supprimée = décochée)
   Les notifications (1 h avant, la veille à 19 h, heure du rappel, relance 30 min après) sont envoyées par n8n (tribu · planificateur). */
(function () {
  'use strict';
  const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  const JOUR_L = { lun: 'lundi', mar: 'mardi', mer: 'mercredi', jeu: 'jeudi', ven: 'vendredi', sam: 'samedi', dim: 'dimanche' };
  const REP = { once: 'Une fois', jour: 'Chaque jour', semaine: 'En semaine', weekend: 'Le week-end' };
  const PREV = { none: '', '1h': 'Notification 1 h avant', veille: 'Notification la veille à 19 h' };
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const monday = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return addDays(x, -((x.getDay() + 6) % 7)); };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const longDay = d => cap(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));
  const newId = () => me() + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const nom = id => (MEMBRES[id] || { nom: id }).nom;
  const names = ids => (ids || []).length >= 4 ? 'Toute la tribu' : (ids || []).map(nom).join(', ');
  const today = () => ymd(new Date());

  let sel = today(), week = monday(new Date());
  let ev = [], rp = [], co = [];

  const visible = r => !r.data.prive || (r.data.pour || []).indexOf(me()) >= 0 || r.data.cree === me();
  function occurs(d, dateStr) {
    const wd = JOURS[parse(dateStr).getDay()];
    switch (d.rep) {
      case 'once': return d.date === dateStr;
      case 'jour': return true;
      case 'semaine': return wd !== 'sam' && wd !== 'dim';
      case 'weekend': return wd === 'sam' || wd === 'dim';
      default: return d.rep === wd;
    }
  }
  function ruleText(d) {
    const quand = d.rep === 'once' ? 'Le ' + parse(d.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
      : (REP[d.rep] || ('Le ' + JOUR_L[d.rep]));
    return quand + ' · ' + (d.heures || []).join(' et ');
  }
  const avs = ids => `<span class="avs">${(ids || []).map(id => `<span class="av xs m-${esc(id)}">${(MEMBRES[id] || { ini: '?' }).ini}</span>`).join('')}</span>`;
  const icon = {
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>'
  };

  async function load() {
    const [e, r, c] = await Promise.all(['event', 'rappel', 'coche'].map(k => Sync.all(k)));
    ev = e; rp = r.filter(visible); co = c;
  }
  const byTime = (a, b) => String(a.data.heure).localeCompare(String(b.data.heure));

  /* ---------- Rendu d'un rendez-vous ---------- */
  function evHtml(e, actions) {
    const d = e.data, done = !!d.fait;
    const main = `<button class="ev-main" data-evtoggle="${esc(e.uid)}">
      <span class="ev-time">${esc(d.heure)}</span>
      <span class="ev-txt"><b>${esc(d.titre)}</b><span>${esc(names(d.pour))}${done ? ' · fait' : ''}</span>
      ${!done && PREV[d.prev] ? `<span class="ev-prev">${icon.bell}${PREV[d.prev]}</span>` : ''}</span>
      ${avs(d.pour)}</button>`;
    return `<div class="ev${done ? ' done' : ''}">${main}${actions ? `
      <button class="ev-act" data-evedit="${esc(e.uid)}" aria-label="Modifier ce rendez-vous">${icon.edit}</button>
      <button class="ev-act" data-evdel="${esc(e.uid)}" aria-label="Supprimer ce rendez-vous">${icon.trash}</button>` : ''}</div>`;
  }

  /* ---------- Onglet Agenda ---------- */
  function renderAgenda() {
    const t = today();
    const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
    const lab = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const first = days[0], last = days[6];
    $('agWeek').textContent = first.getMonth() === last.getMonth()
      ? first.getDate() + ' – ' + last.getDate() + ' ' + last.toLocaleDateString('fr-FR', { month: 'long' })
      : first.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' – ' + last.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    $('agDays').innerHTML = days.map((d, i) => {
      const k = ymd(d), has = ev.some(e => e.data.date === k);
      return `<button class="dayb${k === sel ? ' sel' : ''}${k === t ? ' today' : ''}" data-day="${k}"><span>${lab[i]}</span><b>${d.getDate()}</b><i${has ? ' class="on"' : ''}></i></button>`;
    }).join('');
    $('agTitle').textContent = longDay(parse(sel)) + (sel === t ? ' · aujourd\'hui' : '');
    const list = ev.filter(e => e.data.date === sel).sort(byTime);
    $('agList').innerHTML = list.length ? list.map(e => evHtml(e, true)).join('') : '<div class="empty-day">Rien de prévu. Profitez-en !</div>';
    const rs = rp.slice().sort((a, b) => String((a.data.heures || [])[0]).localeCompare(String((b.data.heures || [])[0])));
    $('agRappels').innerHTML = rs.length ? rs.map(r => `
      <div class="rp card">
        <span class="rp-ic m-${esc((r.data.pour || [])[0])}">${icon.bell}</span>
        <span class="rp-txt"><b>${esc(r.data.titre)}</b><span>${esc(ruleText(r.data))} · ${esc(names(r.data.pour))}</span></span>
        ${r.data.prive ? `<span class="rp-lock" title="Privé">${icon.lock}</span>` : ''}
        <button class="ev-act" data-rpedit="${esc(r.uid)}" aria-label="Modifier ce rappel">${icon.edit}</button>
        <button class="ev-act" data-rpdel="${esc(r.uid)}" aria-label="Supprimer ce rappel">${icon.trash}</button>
      </div>`).join('') : '<p class="note">Aucun rappel pour l\'instant. Exemple : « Se brosser les dents », chaque jour à 8 h et 21 h.</p>';
  }

  /* ---------- Aujourd'hui : agenda et rappels du jour ---------- */
  function occurrences(dateStr) {
    const out = [];
    rp.filter(r => occurs(r.data, dateStr)).forEach(r => (r.data.heures || []).forEach(h => (r.data.pour || []).forEach(m => {
      const uid = 'coche:' + r.uid + '|' + dateStr + '|' + h + '|' + m;
      out.push({ r, h, m, uid, done: co.some(c => c.uid === uid) });
    })));
    return out.sort((a, b) => a.h.localeCompare(b.h) || ORDRE.indexOf(a.m) - ORDRE.indexOf(b.m));
  }
  function renderToday() {
    const t = today();
    const list = ev.filter(e => e.data.date === t).sort(byTime);
    $('todayAgenda').innerHTML = list.length ? `<h2 class="h3">Aujourd'hui dans l'agenda</h2>
      <p class="note sub">Touche un rendez-vous quand il est fait.</p>${list.map(e => evHtml(e, false)).join('')}` : '';
    const occ = occurrences(t);
    $('todayRappels').innerHTML = occ.length ? `<h2 class="h3">Rappels du jour</h2>
      <p class="note sub">Coche quand c'est fait. Le cadenas = visible seulement par les personnes concernées.</p>
      ${occ.map(o => `<button class="occ card${o.done ? ' done' : ''}" data-coche="${esc(o.uid)}">
        <span class="box">${o.done ? icon.check : ''}</span>
        <span class="rp-txt"><b>${esc(o.r.data.titre)}</b><span>${esc(o.h)} · ${esc(nom(o.m))}</span></span>
        ${o.r.data.prive ? `<span class="rp-lock">${icon.lock}</span>` : ''}
        <span class="av sm m-${esc(o.m)}">${(MEMBRES[o.m] || { ini: '?' }).ini}</span></button>`).join('')}` : '';
  }

  async function refresh() {
    if (!me()) return;
    await load();
    renderAgenda(); renderToday();
  }

  /* ---------- Actions ---------- */
  function toggleEvent(uid) {
    const e = ev.find(x => x.uid === uid); if (!e) return;
    Sync.put('event', uid, Object.assign({}, e.data, { fait: !e.data.fait }));
    vib(8);
  }
  function delEvent(uid) {
    const e = ev.find(x => x.uid === uid); if (!e) return;
    const keep = Object.assign({}, e.data);
    Sync.remove('event', uid);
    toast('Rendez-vous supprimé', () => Sync.put('event', uid, keep));
  }
  function delRappel(uid) {
    const r = rp.find(x => x.uid === uid); if (!r) return;
    const keep = Object.assign({}, r.data);
    Sync.remove('rappel', uid);
    toast('Rappel supprimé', () => Sync.put('rappel', uid, keep));
  }
  function toggleCoche(uid) {
    const o = occurrences(uid.split('|')[1]).find(x => x.uid === uid); if (!o) return;
    if (o.done) Sync.remove('coche', uid);
    else Sync.put('coche', uid, { r: o.r.uid, d: uid.split('|')[1], h: o.h, m: o.m, prive: !!o.r.data.prive, pour: o.r.data.pour, cree: o.r.data.cree });
    vib(8);
  }

  /* ---------- Feuille Ajouter / Modifier ---------- */
  function editSheet(kind, existing) {
    const d = existing ? existing.data : {};
    const f = {
      kind,
      titre: d.titre || '',
      date: d.date || sel,
      h: ((d.heure || (d.heures || [])[0] || '18:00').split(':'))[0],
      m: ((d.heure || (d.heures || [])[0] || '18:00').split(':'))[1],
      heures: kind === 'rappel' && d.heures && d.heures.length > 1 ? d.heures.slice() : [],
      pour: (d.pour && d.pour.length ? d.pour.slice() : [me()]),
      prev: d.prev || '1h',
      rep: !d.rep ? 'jour' : (['once', 'jour', 'semaine', 'weekend'].indexOf(d.rep) >= 0 ? d.rep : 'precis'),
      prive: !!d.prive
    };
    if (kind === 'rappel' && d.rep && JOURS.indexOf(d.rep) >= 0) {
      // jour précis : on cale la date sur le prochain jour correspondant, pour l'affichage du libellé
      let x = new Date(); while (JOURS[x.getDay()] !== d.rep) x = addDays(x, 1); f.date = ymd(x);
    }
    const hours = Array.from({ length: 24 }, (_, i) => pad(i));
    const mins = Array.from({ length: 12 }, (_, i) => pad(i * 5));
    const chip = (attr, v, label, on) => `<button class="chip${on ? ' on' : ''}" data-${attr}="${esc(v)}">${label}</button>`;
    function read() {
      const g = id => $(id);
      if (g('fTitre')) f.titre = g('fTitre').value;
      if (g('fDate')) f.date = g('fDate').value || f.date;
      if (g('fH')) f.h = g('fH').value;
      if (g('fM')) f.m = g('fM').value;
    }
    function draw() {
      const ev_ = f.kind === 'event';
      const wd = JOUR_L[JOURS[parse(f.date).getDay()]];
      $('sheetTitle').textContent = existing ? (ev_ ? 'Modifier le rendez-vous' : 'Modifier le rappel') : 'Ajouter';
      $('sheetBody').innerHTML = `
        ${existing ? '' : `<div class="seg two">${chip('kind', 'event', 'Rendez-vous', ev_)}${chip('kind', 'rappel', 'Rappel récurrent', !ev_)}</div>`}
        <label class="label" for="fTitre">Quoi ?</label>
        <input class="input" id="fTitre" maxlength="120" value="${esc(f.titre)}" placeholder="${ev_ ? 'Ex. : Rendez-vous chez le dentiste' : 'Ex. : Se brosser les dents'}">
        ${ev_ || f.rep === 'once' || f.rep === 'precis' ? `<label class="label" for="fDate">${ev_ ? 'Quel jour ?' : 'À partir de quel jour ?'}</label>
          <input class="input" type="date" id="fDate" value="${esc(f.date)}">` : ''}
        <span class="label">À quelle heure ?</span>
        <div class="row wrap">
          <label class="sel"><span class="sr">Heure</span><select id="fH">${hours.map(h => `<option value="${h}"${h === f.h ? ' selected' : ''}>${h} h</option>`).join('')}</select></label>
          <label class="sel"><span class="sr">Minutes</span><select id="fM">${mins.map(m => `<option value="${m}"${m === f.m ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
          ${!ev_ ? '<button class="chip dash" data-act="addtime">+ Ajouter cette heure</button>' : ''}
        </div>
        ${!ev_ && f.heures.length ? `<div class="row wrap">${f.heures.map(t => `<button class="chip on" data-rmtime="${t}" aria-label="Retirer ${t}">${t} ×</button>`).join('')}</div>` : ''}
        <span class="label">Pour qui ?</span>
        <div class="row wrap">${ORDRE.map(id => `<button class="chip m-${id}${f.pour.indexOf(id) >= 0 ? ' mon' : ''}" data-pour="${id}">${MEMBRES[id].nom}</button>`).join('')}</div>
        ${ev_ ? `<span class="label">Me prévenir</span>
          <div class="row wrap">${chip('prev', 'none', 'Non', f.prev === 'none')}${chip('prev', '1h', '1 h avant', f.prev === '1h')}${chip('prev', 'veille', 'La veille à 19 h', f.prev === 'veille')}</div>` : `
          <span class="label">Quand ?</span>
          <div class="row wrap">${chip('rep', 'once', 'Une fois', f.rep === 'once')}${chip('rep', 'jour', 'Chaque jour', f.rep === 'jour')}${chip('rep', 'semaine', 'En semaine', f.rep === 'semaine')}${chip('rep', 'weekend', 'Le week-end', f.rep === 'weekend')}${chip('rep', 'precis', 'Le ' + wd, f.rep === 'precis')}</div>
          <button class="toggle card" data-act="prive" aria-pressed="${f.prive}"><span><b>Privé</b><br><span class="note">Visible seulement par les personnes concernées</span></span><span class="sw${f.prive ? ' on' : ''}"><i></i></span></button>
          <p class="note">Notification à chaque heure, puis une relance 30 min après si ce n'est pas coché.</p>`}
        <button class="primary" data-act="save">Enregistrer</button>
        <p class="join-err" id="fErr"></p>`;
    }
    openSheet('', '');
    draw();
    $('sheetBody').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      read();
      if (b.dataset.kind) { f.kind = b.dataset.kind; draw(); return; }
      if (b.dataset.pour) { const id = b.dataset.pour; f.pour = f.pour.indexOf(id) >= 0 ? f.pour.filter(x => x !== id) : f.pour.concat([id]); draw(); return; }
      if (b.dataset.prev) { f.prev = b.dataset.prev; draw(); return; }
      if (b.dataset.rep) { f.rep = b.dataset.rep; draw(); return; }
      if (b.dataset.rmtime) { f.heures = f.heures.filter(t => t !== b.dataset.rmtime); draw(); return; }
      if (b.dataset.act === 'addtime') { const t = f.h + ':' + f.m; if (f.heures.indexOf(t) < 0) f.heures = f.heures.concat([t]).sort(); draw(); return; }
      if (b.dataset.act === 'prive') { f.prive = !f.prive; draw(); return; }
      if (b.dataset.act === 'save') save();
    };
    function save() {
      const titre = f.titre.trim();
      if (!titre) { $('fErr').textContent = 'Écris de quoi il s\'agit.'; return; }
      if (!f.pour.length) { $('fErr').textContent = 'Choisis au moins une personne.'; return; }
      const t = f.h + ':' + f.m;
      if (f.kind === 'event') {
        const uid = existing ? existing.uid : 'event:' + newId();
        Sync.put('event', uid, { titre, date: f.date, heure: t, pour: ORDRE.filter(id => f.pour.indexOf(id) >= 0), prev: f.prev,
          fait: existing ? !!d.fait : false, cree: d.cree || me(), at: d.at || Date.now() });
        sel = f.date; week = monday(parse(f.date));
        toast(f.prev !== 'none' ? 'Rendez-vous enregistré · ' + PREV[f.prev].toLowerCase() : 'Rendez-vous enregistré');
      } else {
        const heures = f.heures.length ? f.heures.slice() : [t];
        const rep = f.rep === 'precis' ? JOURS[parse(f.date).getDay()] : f.rep;
        const uid = existing ? existing.uid : 'rappel:' + newId();
        Sync.put('rappel', uid, { titre, heures, rep, date: f.rep === 'once' ? f.date : '', pour: ORDRE.filter(id => f.pour.indexOf(id) >= 0),
          prive: f.prive, cree: d.cree || me(), at: d.at || Date.now() });
        toast('Rappel enregistré · notification à ' + heures.join(' et '));
      }
      closeSheet();
    }
  }

  /* ---------- Clics ---------- */
  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.day) { sel = b.dataset.day; renderAgenda(); return; }
    if (b.dataset.evtoggle) return toggleEvent(b.dataset.evtoggle);
    if (b.dataset.evdel) return delEvent(b.dataset.evdel);
    if (b.dataset.evedit) { const x = ev.find(v => v.uid === b.dataset.evedit); if (x) editSheet('event', x); return; }
    if (b.dataset.rpdel) return delRappel(b.dataset.rpdel);
    if (b.dataset.rpedit) { const x = rp.find(v => v.uid === b.dataset.rpedit); if (x) editSheet('rappel', x); return; }
    if (b.dataset.coche) return toggleCoche(b.dataset.coche);
    if (b.dataset.week) {
      if (b.dataset.week === '0') { week = monday(new Date()); sel = today(); }
      else { week = addDays(week, 7 * +b.dataset.week); sel = ymd(week); }
      renderAgenda(); return;
    }
  }
  $('agenda').addEventListener('click', onClick);
  $('todayAgenda').addEventListener('click', onClick);
  $('todayRappels').addEventListener('click', onClick);
  $('agAdd').addEventListener('click', () => editSheet('event', null));

  document.addEventListener('tribu:tab', e => { $('agAdd').hidden = e.detail !== 'agenda'; if (e.detail === 'agenda') renderAgenda(); });
  Sync.on(kinds => { if (kinds.some(k => ['event', 'rappel', 'coche', 'auth'].indexOf(k) >= 0)) refresh(); });
  // Changement de jour pendant que l'app reste ouverte
  let lastDay = today();
  setInterval(() => { if (today() !== lastDay) { lastDay = today(); refresh(); } }, 60000);
  $('agAdd').hidden = S.tab !== 'agenda';
  refresh();
})();
