/* Tribu — Défis et parties (échecs pour commencer).
   Données synchronisées :
   - defi    uid defi:<membre>:<id>    { jeu, de, a, coul (hasard|w|b), at, statut (attente|accepte|refuse|annule), partie }
   - partie  uid partie:<id>           { jeu, w, b, defi, at, nulle: { par, n } | null, fin: { type (mat|pat|abandon|nulle|temps), gagnant, t } | null }
   - coup    uid coup:<partie>:<n>     { p, n, f, t, q, san, pour, at }
   Une seule partie (ou défi en attente) à la fois par personne. Partie sans coup depuis 7 jours :
   perdue par celui qui devait jouer. Rappel après 24 h envoyé par le planificateur. */
(function () {
  'use strict';
  const E = window.Echecs;
  const JOUR = 86400000, DELAI = 7 * JOUR;
  const memb = id => MEMBRES[id] || { nom: id || '?', ini: '?' };
  const avatar = id => `<span class="av sm m-${esc(id)}">${esc(memb(id).ini)}</span>`;
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let D = { defis: [], parties: [], coups: [] };
  let vue = null, sel = -1, dernierVu = {};

  /* ---------- Lecture et état dérivé ---------- */
  async function load() {
    const [defis, parties, coups] = await Promise.all(['defi', 'partie', 'coup'].map(k => Sync.all(k)));
    D = { defis, parties, coups };
  }
  function coupsDe(pid) {
    return D.coups.filter(c => c.data.p === pid).map(c => c.data).sort((a, b) => a.n - b.n);
  }
  // État complet d'une partie : position, joueurs, fin (y compris fin par délai dépassé).
  function etat(p) {
    const d = p.data, cs = coupsDe(p.uid);
    const s = E.rejouer(cs);
    const last = cs.length ? cs[cs.length - 1].at : d.at;
    const trait = s.turn === 'w' ? d.w : d.b;
    let fin = d.fin || null;
    if (!fin && s.over) fin = s.over.type === 'mat' ? { type: 'mat', gagnant: s.over.winner === 'w' ? d.w : d.b } : { type: 'pat', gagnant: null };
    if (!fin && Date.now() - last > DELAI) fin = { type: 'temps', gagnant: trait === d.w ? d.b : d.w, derive: true };
    return { p, d, s, cs, last, trait, fin };
  }
  const joue = (p, m) => p.data.w === m || p.data.b === m;
  const partieActive = m => D.parties.map(etat).find(e => !e.fin && joue(e.p, m)) || null;
  const defiEnvoye = m => D.defis.find(x => x.data.de === m && x.data.statut === 'attente' && Date.now() - x.data.at < DELAI) || null;
  const defisRecus = m => D.defis.filter(x => x.data.a === m && x.data.statut === 'attente' && Date.now() - x.data.at < DELAI);
  const occupe = m => !!(partieActive(m) || defiEnvoye(m));
  function scores() {
    const sc = {}; ORDRE.forEach(m => { sc[m] = 0; });
    D.parties.forEach(p => { const e = etat(p); if (e.fin && e.fin.gagnant && sc[e.fin.gagnant] != null) sc[e.fin.gagnant]++; });
    return sc;
  }

  /* ---------- Carte de l'accueil ---------- */
  function renderToday() {
    const box = $('todayDefis'); if (!box) return;
    const moi = me(); if (!moi) { box.innerHTML = ''; return; }
    const lignes = [];
    for (const x of defisRecus(moi)) {
      const libre = !occupe(moi);
      lignes.push(`<div class="df-line">${avatar(x.data.de)}<div class="grow"><b>${esc(memb(x.data.de).nom)} te défie aux échecs</b>
        <div class="muted">${ago(x.data.at)}${libre ? '' : ' · termine ta partie en cours pour accepter'}</div>
        <div class="df-btns"><button class="small acc" data-acc="${esc(x.uid)}" ${libre ? '' : 'disabled'}>Accepter</button><button class="small" data-ref="${esc(x.uid)}">Refuser</button></div></div></div>`);
    }
    const env = defiEnvoye(moi);
    if (env) lignes.push(`<div class="df-line"><span class="df-ico">⏳</span><div class="grow"><b>Défi envoyé à ${esc(memb(env.data.a).nom)}</b><div class="muted">Échecs · en attente de sa réponse</div></div><button class="small" data-ann="${esc(env.uid)}">Annuler</button></div>`);
    const e = partieActive(moi);
    if (e) {
      const adv = e.d.w === moi ? e.d.b : e.d.w, aMoi = e.trait === moi;
      lignes.push(`<button class="df-line df-open" data-open="${esc(e.p.uid)}"><span class="df-ico">♞</span><span class="grow"><b>Échecs avec ${esc(memb(adv).nom)}</b><span class="muted df-sub">${e.cs.length} coup${e.cs.length > 1 ? 's' : ''} · dernier ${ago(e.last)}</span></span><span class="df-tag${aMoi ? ' on' : ''}">${aMoi ? 'À toi' : 'À ' + esc(memb(adv).nom)}</span></button>`);
    }
    // Les parties des autres, à regarder
    D.parties.map(etat).filter(x => !x.fin && !joue(x.p, moi)).forEach(x => {
      lignes.push(`<button class="df-line df-open" data-open="${esc(x.p.uid)}"><span class="df-ico">👀</span><span class="grow"><b>${esc(memb(x.d.w).nom)} contre ${esc(memb(x.d.b).nom)}</b><span class="muted df-sub">Échecs · ${x.cs.length} coups · regarder la partie</span></span></button>`);
    });
    const sc = scores(), classement = ORDRE.slice().sort((a, b) => sc[b] - sc[a]);
    const total = classement.reduce((n, m) => n + sc[m], 0);
    box.innerHTML = `<div class="card df-card"><div class="df-kick">Défis et parties</div>
      ${lignes.join('') || '<p class="muted">Aucune partie en cours. Lance un défi à quelqu\'un de la tribu !</p>'}
      ${occupe(moi) ? '' : '<button class="primary df-launch" data-launch>Lancer un défi</button>'}
      ${total ? `<div class="df-score">Échecs : ${classement.filter(m => sc[m]).map((m, i) => (i === 0 ? '🏆 ' : '') + esc(memb(m).nom) + ' ' + sc[m]).join(' · ')} victoire${total > 1 ? 's' : ''}</div>` : ''}
    </div>`;
  }

  /* ---------- Lancer, accepter, refuser ---------- */
  function lancer() {
    const moi = me();
    if (occupe(moi)) { toast('Tu as déjà une partie ou un défi en cours'); return; }
    const autres = ORDRE.filter(m => m !== moi);
    let qui = autres.find(m => !occupe(m)) || null, coul = 'hasard';
    const draw = () => openSheet('Lancer un défi', `
      <div class="df-games"><button class="df-game on"><b>♞</b>Échecs</button><button class="df-game" disabled><b>🔴</b>Puissance 4<i>bientôt</i></button><button class="df-game" disabled><b>✖️</b>Morpion<i>bientôt</i></button></div>
      <p class="label">Qui veux-tu défier ?</p>
      <div class="df-chips">${autres.map(m => { const o = occupe(m); return `<button class="df-chip${qui === m ? ' on' : ''}" data-m="${m}" ${o ? 'disabled' : ''}>${avatar(m)}${esc(memb(m).nom)}${o ? ' · déjà en partie' : ''}</button>`; }).join('')}</div>
      <p class="note">Une seule partie à la fois par personne.</p>
      <p class="label">Ta couleur</p>
      <div class="seg">${[['hasard', 'Au hasard'], ['w', 'Blancs'], ['b', 'Noirs']].map(c => `<button class="${coul === c[0] ? 'sel' : ''}" data-c="${c[0]}">${c[1]}</button>`).join('')}</div>
      <button class="primary" data-send ${qui ? '' : 'disabled'}>Envoyer le défi</button>`, e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.m) { qui = b.dataset.m; draw(); }
      else if (b.dataset.c) { coul = b.dataset.c; draw(); }
      else if (b.hasAttribute('data-send') && qui) {
        if (occupe(qui)) { toast(memb(qui).nom + ' est déjà en partie'); return; }
        Sync.put('defi', 'defi:' + moi + ':' + newId(), { jeu: 'echecs', de: moi, a: qui, coul, at: Date.now(), statut: 'attente' });
        closeSheet(); toast('Défi envoyé à ' + memb(qui).nom); vib(8);
      }
    });
    draw();
  }
  async function accepter(uid) {
    const x = D.defis.find(d => d.uid === uid); if (!x) return;
    const moi = me(), de = x.data.de;
    if (occupe(moi)) { toast('Termine ta partie en cours pour accepter'); return; }
    if (partieActive(de)) { toast(memb(de).nom + ' est déjà en partie'); return; }
    const blancDe = x.data.coul === 'w' ? true : x.data.coul === 'b' ? false : Math.random() < 0.5;
    const pid = 'partie:' + newId();
    await Sync.put('partie', pid, { jeu: 'echecs', w: blancDe ? de : moi, b: blancDe ? moi : de, defi: uid, at: Date.now(), nulle: null, fin: null });
    await Sync.put('defi', uid, Object.assign({}, x.data, { statut: 'accepte', partie: pid }));
    vib(10); ouvrir(pid);
    toast(blancDe ? 'Tu as les noirs : ' + memb(de).nom + ' commence' : 'Tu as les blancs : à toi de commencer');
  }
  function repondre(uid, statut) {
    const x = D.defis.find(d => d.uid === uid); if (!x) return;
    Sync.put('defi', uid, Object.assign({}, x.data, { statut }));
    toast(statut === 'refuse' ? 'Défi refusé' : 'Défi annulé');
  }

  /* ---------- Vue de la partie ---------- */
  const view = $('partieView');
  function ouvrir(pid) {
    vue = pid; sel = -1;
    document.body.classList.add('in-partie');
    view.hidden = false; $('main').scrollTop = 0;
    renderVue();
  }
  function fermer() {
    vue = null; sel = -1;
    document.body.classList.remove('in-partie');
    view.hidden = true; view.innerHTML = '';
    renderToday();
  }
  function capStr(arr) {
    const ordre = 'QRBNP';
    return arr.slice().sort((a, b) => ordre.indexOf(a[1]) - ordre.indexOf(b[1])).map(p => E.svg(p[1], p[0])).join('');
  }
  function renderVue() {
    const p = D.parties.find(x => x.uid === vue);
    if (!p) { fermer(); return; }
    const e = etat(p), s = e.s, d = e.d, moi = me();
    const maCoul = d.w === moi ? 'w' : d.b === moi ? 'b' : null;     // null : spectateur
    const flip = maCoul === 'b';
    const haut = flip ? 'w' : 'b', bas = flip ? 'b' : 'w';
    const qui = c => (c === 'w' ? d.w : d.b);
    const aMoi = !e.fin && maCoul && s.turn === maCoul;
    const moves = aMoi && sel >= 0 ? E.legal(s).filter(m => m.from === sel) : [];
    const chk = !e.fin && E.enEchec(s) ? E.kingSq(s.b, s.turn) : (e.fin && e.fin.type === 'mat' ? E.kingSq(s.b, s.turn) : -1);
    let cells = '';
    for (let k = 0; k < 64; k++) {
      const i = flip ? 63 - k : k, r = i >> 3, c = i & 7, pc = s.b[i];
      const cls = ['sq', (r + c) % 2 ? 'd' : 'l'];
      if (s.last && (s.last.from === i || s.last.to === i)) cls.push('last');
      if (i === sel) cls.push('sel');
      if (i === chk) cls.push('chk');
      const mv = moves.find(m => m.to === i);
      cells += `<div class="${cls.join(' ')}" data-sq="${i}">${pc ? E.svg(pc[1], pc[0]) : ''}${mv ? (pc || mv.epc ? '<span class="ring"></span>' : '<span class="dot"></span>') : ''}${(k & 7) === 0 ? `<span class="coord r">${8 - r}</span>` : ''}${(k >> 3) === 7 ? `<span class="coord f">${'abcdefgh'[c]}</span>` : ''}</div>`;
    }
    let statut;
    if (e.fin) {
      const f = e.fin, g = f.gagnant;
      const comment = { mat: 'Échec et mat', pat: 'Pat', abandon: 'Abandon', nulle: 'Nulle acceptée', temps: 'Plus de coup depuis 7 jours' }[f.type] || '';
      statut = !g ? comment + ' : partie nulle 🤝' : comment + ' : ' + (g === moi ? 'tu as gagné 🏆' : esc(memb(g).nom) + ' gagne 🏆');
    } else if (!maCoul) statut = 'Au tour de ' + esc(memb(e.trait).nom);
    else statut = aMoi ? (E.enEchec(s) ? 'Échec ! Protège ton roi' : 'À toi de jouer') : esc(memb(e.trait).nom) + ' réfléchit…';
    const nulleRecue = !e.fin && d.nulle && d.nulle.n === e.cs.length && maCoul && d.nulle.par !== moi;
    const nulleEnvoyee = !e.fin && d.nulle && d.nulle.n === e.cs.length && d.nulle.par === moi;
    const joueur = c => `<div class="df-player${!e.fin && s.turn === c ? ' turn' : ''}">${avatar(qui(c))}<div class="grow"><b>${qui(c) === moi ? 'Toi' : esc(memb(qui(c)).nom)}</b><div class="df-cap">${capStr(s.caps[c])}</div></div><span class="df-dot ${c}"></span></div>`;
    view.innerHTML = `
      <div class="df-top"><button class="link" data-act="back">‹ Accueil</button><span class="muted df-sub">${maCoul ? 'Échecs' : 'Échecs · tu regardes'}</span></div>
      ${joueur(haut)}
      <div class="df-frame"><div class="df-board" id="dfBoard">${cells}</div></div>
      ${joueur(bas)}
      <div class="df-status${e.fin ? ' fin' : ''}">${statut}</div>
      ${nulleRecue ? `<div class="df-nulle">${esc(memb(d.nulle.par).nom)} propose la nulle <button class="small acc" data-act="nulle-oui">Accepter</button><button class="small" data-act="nulle-non">Refuser</button></div>` : ''}
      <div class="df-moves">${s.hist.map((m, i) => (i % 2 ? '' : (i / 2 + 1) + '. ') + esc(m)).join('  ')}</div>
      ${e.fin || !maCoul ? '' : `<div class="df-btns"><button class="small" data-act="nulle" ${nulleEnvoyee ? 'disabled' : ''}>${nulleEnvoyee ? 'Nulle proposée' : 'Proposer la nulle'}</button><button class="small" data-act="abandon">Abandonner</button></div>`}
      <p class="note">Tu peux quitter la partie quand tu veux : elle t'attend ici, et une notification te prévient quand c'est ton tour.</p>`;
    // Fin par délai dépassé : le gagnant l'enregistre (une seule fois).
    if (e.fin && e.fin.derive && e.fin.gagnant === moi) terminer(e, e.fin);
  }
  view.addEventListener('click', ev => {
    const sq = ev.target.closest('[data-sq]');
    if (sq) { tap(+sq.dataset.sq); return; }
    const b = ev.target.closest('[data-act]'); if (!b || b.disabled) return;
    const p = D.parties.find(x => x.uid === vue); if (!p && b.dataset.act !== 'back') return;
    const a = b.dataset.act;
    if (a === 'back') fermer();
    else if (a === 'abandon') {
      openSheet('Abandonner la partie ?', `<p class="note">${esc(memb(adversaire(p)).nom)} gagnera la partie.</p><button class="primary" data-x="oui">Abandonner</button><button class="ghost" data-x="non">Continuer à jouer</button>`, e => {
        const x = e.target.closest('[data-x]'); if (!x) return;
        closeSheet();
        if (x.dataset.x === 'oui') terminer(etat(p), { type: 'abandon', gagnant: adversaire(p) });
      });
    } else if (a === 'nulle') {
      Sync.put('partie', p.uid, Object.assign({}, p.data, { nulle: { par: me(), n: coupsDe(p.uid).length } }));
      toast('Nulle proposée à ' + memb(adversaire(p)).nom);
    } else if (a === 'nulle-oui') terminer(etat(p), { type: 'nulle', gagnant: null });
    else if (a === 'nulle-non') Sync.put('partie', p.uid, Object.assign({}, p.data, { nulle: null }));
  });
  const adversaire = p => (p.data.w === me() ? p.data.b : p.data.w);
  function tap(i) {
    const p = D.parties.find(x => x.uid === vue); if (!p) return;
    const e = etat(p), s = e.s, moi = me();
    const maCoul = p.data.w === moi ? 'w' : p.data.b === moi ? 'b' : null;
    if (e.fin || !maCoul) return;
    if (s.turn !== maCoul) { toast('Ce n\'est pas ton tour'); return; }
    if (sel >= 0) {
      const cand = E.legal(s).filter(m => m.from === sel && m.to === i);
      if (cand.length) {
        if (cand[0].promo) {
          openSheet('Promotion du pion', `<div class="df-promo">${['Q', 'R', 'B', 'N'].map(q => `<button data-q="${q}">${E.svg(q, s.turn)}</button>`).join('')}</div>`, ev => {
            const b = ev.target.closest('[data-q]'); if (!b) return;
            closeSheet(); jouer(e, cand.find(m => m.promo === b.dataset.q));
          });
          return;
        }
        jouer(e, cand[0]); return;
      }
    }
    const pc = s.b[i];
    sel = pc && pc[0] === maCoul && i !== sel ? i : -1;
    renderVue();
  }
  async function jouer(e, m) {
    const n = e.cs.length, apres = E.play(e.s, m), adv = adversaire(e.p);
    sel = -1; vib(8);
    await Sync.put('coup', 'coup:' + e.p.uid + ':' + n, { p: e.p.uid, n, f: m.from, t: m.to, q: m.promo || '', san: apres.hist[apres.hist.length - 1], pour: adv, at: Date.now() });
    if (apres.over) {
      const g = apres.over.type === 'mat' ? me() : null;
      terminer(Object.assign({}, e, { s: apres }), { type: apres.over.type, gagnant: g });
    }
  }
  const finis = new Set();
  async function terminer(e, fin) {
    const p = D.parties.find(x => x.uid === e.p.uid) || e.p;
    if (p.data.fin || finis.has(p.uid)) return;
    finis.add(p.uid);
    const f = { type: fin.type, gagnant: fin.gagnant || null, t: Date.now() };
    await Sync.put('partie', p.uid, Object.assign({}, p.data, { nulle: null, fin: f }));
    const w = memb(p.data.w).nom, b = memb(p.data.b).nom;
    let t;
    if (!f.gagnant) t = '🤝 Partie nulle entre ' + w + ' et ' + b + ' aux échecs';
    else {
      const perdant = f.gagnant === p.data.w ? p.data.b : p.data.w;
      t = '🏆 ' + memb(f.gagnant).nom + ' a battu ' + memb(perdant).nom + ' aux échecs' + (f.type === 'abandon' ? ' (abandon)' : f.type === 'temps' ? ' (temps écoulé)' : '');
    }
    await Sync.put('msg', 'msg:' + me() + ':' + newId(), { t, at: Date.now(), sys: 'jeu' });
  }

  /* ---------- Branchements ---------- */
  $('todayDefis').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b || b.disabled) return;
    if (b.hasAttribute('data-launch')) lancer();
    else if (b.dataset.acc) accepter(b.dataset.acc);
    else if (b.dataset.ref) repondre(b.dataset.ref, 'refuse');
    else if (b.dataset.ann) repondre(b.dataset.ann, 'annule');
    else if (b.dataset.open) ouvrir(b.dataset.open);
  });
  document.addEventListener('tribu:tab', () => { if (vue) fermer(); });
  async function refresh() {
    if (!me()) return;
    await load();
    renderToday();
    if (vue) {
      const p = D.parties.find(x => x.uid === vue);
      const n = p ? coupsDe(p.uid).length : 0;
      if (p && dernierVu[vue] != null && n > dernierVu[vue]) vib([10, 40, 10]);
      if (p) dernierVu[vue] = n;
      renderVue();
    }
  }
  Sync.on(kinds => { if (kinds.some(k => ['defi', 'partie', 'coup', 'auth', 'famille'].indexOf(k) >= 0)) refresh(); });
  setInterval(() => { if (document.visibilityState === 'visible' && S.tab === 'today' && !vue) renderToday(); }, 60000);
  window.TribuDefis = { lancer, ouvrir };
  refresh();
})();
