/* Tribu — Défis et parties : cadre commun à tous les jeux à deux (échecs, Puissance 4, morpion, bataille navale…).
   Données synchronisées :
   - defi    uid defi:<membre>:<id>    { jeu, de, a, coul (hasard|w|b : qui commence / couleur du défieur), at, statut (attente|accepte|refuse|annule), partie }
   - partie  uid partie:<id>           { jeu, w (1er joueur), b (2e joueur), defi, at, nulle: { par, n } | null, fin: { type, gagnant, t } | null }
   - coup    uid coup:<partie>:<n>     { p, n, …données du jeu, txt (pour la notification), pour (qui joue ensuite), at }
   Une seule partie (ou défi en attente) à la fois par personne. Sans coup depuis 7 jours : perdue par celui qui devait jouer.
   Chaque jeu s'enregistre avec TribuJeux.ajouter({ id, nom, ico, aux, couleur?, nulle?, etat, vue, clic, statut? }). */
(function () {
  'use strict';
  const JOUR = 86400000, DELAI = 7 * JOUR;
  const memb = id => MEMBRES[id] || { nom: id || '?', ini: '?' };
  const avatar = id => `<span class="av sm m-${esc(id)}">${esc(memb(id).ini)}</span>`;
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const JEUX = {}, ORDRE_JEUX = [];
  let D = { defis: [], parties: [], coups: [] };
  let vue = null, dernierVu = {};

  /* ---------- Lecture et état dérivé ---------- */
  async function load() {
    const [defis, parties, coups] = await Promise.all(['defi', 'partie', 'coup'].map(k => Sync.all(k)));
    D = { defis, parties, coups };
  }
  const coupsDe = pid => D.coups.filter(c => c.data.p === pid).map(c => c.data).sort((a, b) => a.n - b.n);
  function etat(p) {
    const d = p.data, G = JEUX[d.jeu];
    const cs = coupsDe(p.uid);
    const last = cs.reduce((m, c) => Math.max(m, c.at || 0), d.at || 0);
    const r = G ? G.etat(d, cs) : { trait: null, fin: null, ncoups: cs.length };
    let fin = d.fin || r.fin || null;
    if (!fin && r.trait && Date.now() - last > DELAI) fin = { type: 'temps', gagnant: r.trait === d.w ? d.b : d.w, derive: true };
    return Object.assign({}, r, { p, d, G, cs, last, fin, naturel: !d.fin && r.fin });
  }
  const joue = (p, m) => p.data.w === m || p.data.b === m;
  const partieActive = m => D.parties.map(etat).find(e => !e.fin && joue(e.p, m)) || null;
  const defiEnvoye = m => D.defis.find(x => x.data.de === m && x.data.statut === 'attente' && Date.now() - x.data.at < DELAI) || null;
  const defisRecus = m => D.defis.filter(x => x.data.a === m && x.data.statut === 'attente' && Date.now() - x.data.at < DELAI);
  const occupe = m => !!(partieActive(m) || defiEnvoye(m));
  const nomJeu = j => (JEUX[j] ? JEUX[j].nom : 'Jeu');
  const auxJeu = j => (JEUX[j] ? JEUX[j].aux : '');

  /* ---------- Carte de l'accueil ---------- */
  function renderToday() {
    const box = $('todayDefis'); if (!box) return;
    const moi = me(); if (!moi) { box.innerHTML = ''; return; }
    const lignes = [];
    for (const x of defisRecus(moi)) {
      const libre = !occupe(moi);
      lignes.push(`<div class="df-line">${avatar(x.data.de)}<div class="grow"><b>${esc(memb(x.data.de).nom)} te défie ${esc(auxJeu(x.data.jeu))}</b>
        <div class="muted df-sub">${ago(x.data.at)}${libre ? '' : ' · termine ta partie en cours pour accepter'}</div>
        <div class="df-btns"><button class="small acc" data-acc="${esc(x.uid)}" ${libre ? '' : 'disabled'}>Accepter</button><button class="small" data-ref="${esc(x.uid)}">Refuser</button></div></div></div>`);
    }
    const env = defiEnvoye(moi);
    if (env) lignes.push(`<div class="df-line"><span class="df-ico">⏳</span><div class="grow"><b>Défi envoyé à ${esc(memb(env.data.a).nom)}</b><div class="muted df-sub">${esc(nomJeu(env.data.jeu))} · en attente de sa réponse</div></div><button class="small" data-ann="${esc(env.uid)}">Annuler</button></div>`);
    const e = partieActive(moi);
    if (e) {
      const adv = e.d.w === moi ? e.d.b : e.d.w, aMoi = e.trait === moi;
      const prep = !e.trait && e.aPreparer && e.aPreparer.indexOf(moi) >= 0;
      const tag = e.trait ? (aMoi ? 'À toi' : 'À ' + esc(memb(adv).nom)) : prep ? 'À toi' : 'En préparation';
      lignes.push(`<button class="df-line df-open" data-open="${esc(e.p.uid)}"><span class="df-ico">${e.G ? e.G.ico : '🎲'}</span><span class="grow"><b>${esc(nomJeu(e.d.jeu))} avec ${esc(memb(adv).nom)}</b><span class="muted df-sub">${e.ncoups} coup${e.ncoups > 1 ? 's' : ''} · dernier ${ago(e.last)}</span></span><span class="df-tag${aMoi || prep ? ' on' : ''}">${tag}</span></button>`);
    }
    D.parties.map(etat).filter(x => !x.fin && !joue(x.p, moi)).forEach(x => {
      lignes.push(`<button class="df-line df-open" data-open="${esc(x.p.uid)}"><span class="df-ico">👀</span><span class="grow"><b>${esc(memb(x.d.w).nom)} contre ${esc(memb(x.d.b).nom)}</b><span class="muted df-sub">${esc(nomJeu(x.d.jeu))} · regarder la partie</span></span></button>`);
    });
    // Scores : une ligne par jeu, 🏆 au premier
    const sc = {};
    D.parties.forEach(p => { const x = etat(p); if (x.fin && x.fin.gagnant) { const j = p.data.jeu; sc[j] = sc[j] || {}; sc[j][x.fin.gagnant] = (sc[j][x.fin.gagnant] || 0) + 1; } });
    const scores = ORDRE_JEUX.filter(j => sc[j]).map(j => {
      const cl = Object.keys(sc[j]).sort((a, b) => sc[j][b] - sc[j][a]);
      return `<div class="df-score">${esc(JEUX[j].nom)} : ${cl.map((m, i) => (i === 0 ? '🏆 ' : '') + esc(memb(m).nom) + ' ' + sc[j][m]).join(' · ')}</div>`;
    }).join('');
    box.innerHTML = `<div class="card df-card"><div class="df-kick">Défis et parties</div>
      ${lignes.join('') || '<p class="muted df-sub">Aucune partie en cours. Lance un défi à quelqu\'un de la tribu !</p>'}
      ${occupe(moi) ? '' : '<button class="primary df-launch" data-launch>Lancer un défi</button>'}
      ${scores}</div>`;
  }

  /* ---------- Lancer, accepter, refuser ---------- */
  function lancer(jeuInit, quiInit) {
    const moi = me();
    if (occupe(moi)) { toast('Tu as déjà une partie ou un défi en cours'); return; }
    const autres = ORDRE.filter(m => m !== moi);
    let jeu = JEUX[jeuInit] ? jeuInit : ORDRE_JEUX[0];
    let qui = quiInit && !occupe(quiInit) ? quiInit : autres.find(m => !occupe(m)) || null, coul = 'hasard';
    const draw = () => {
      const G = JEUX[jeu];
      openSheet('Lancer un défi', `
      <div class="df-games">${ORDRE_JEUX.map(j => `<button class="df-game${j === jeu ? ' on' : ''}" data-j="${j}"><b>${JEUX[j].ico}</b>${esc(JEUX[j].nom)}</button>`).join('')}</div>
      <p class="label">Qui veux-tu défier ?</p>
      <div class="df-chips">${autres.map(m => { const o = occupe(m); return `<button class="df-chip${qui === m ? ' on' : ''}" data-m="${m}" ${o ? 'disabled' : ''}>${avatar(m)}${esc(memb(m).nom)}${o ? ' · déjà en partie' : ''}</button>`; }).join('')}</div>
      <p class="note">Une seule partie à la fois par personne.</p>
      <p class="label">${G.couleur ? 'Ta couleur' : 'Qui commence ?'}</p>
      <div class="seg">${[['hasard', 'Au hasard'], ['w', G.couleur ? 'Blancs' : 'Moi'], ['b', G.couleur ? 'Noirs' : (qui ? esc(memb(qui).nom) : 'L\'autre')]].map(c => `<button class="${coul === c[0] ? 'sel' : ''}" data-c="${c[0]}">${c[1]}</button>`).join('')}</div>
      <button class="primary" data-send ${qui ? '' : 'disabled'}>Envoyer le défi</button>`, e => {
        const b = e.target.closest('button'); if (!b || b.disabled) return;
        if (b.dataset.j) { jeu = b.dataset.j; draw(); }
        else if (b.dataset.m) { qui = b.dataset.m; draw(); }
        else if (b.dataset.c) { coul = b.dataset.c; draw(); }
        else if (b.hasAttribute('data-send') && qui) {
          if (occupe(qui)) { toast(memb(qui).nom + ' est déjà en partie'); return; }
          Sync.put('defi', 'defi:' + moi + ':' + newId(), { jeu, de: moi, a: qui, coul, at: Date.now(), statut: 'attente' });
          closeSheet(); toast('Défi envoyé à ' + memb(qui).nom); vib(8);
        }
      });
    };
    draw();
  }
  async function accepter(uid) {
    const x = D.defis.find(d => d.uid === uid); if (!x) return;
    const moi = me(), de = x.data.de, G = JEUX[x.data.jeu];
    if (!G) { toast('Mets Tribu à jour pour jouer à ce jeu'); return; }
    if (occupe(moi)) { toast('Termine ta partie en cours pour accepter'); return; }
    if (partieActive(de)) { toast(memb(de).nom + ' est déjà en partie'); return; }
    const deCommence = x.data.coul === 'w' ? true : x.data.coul === 'b' ? false : Math.random() < 0.5;
    const pid = 'partie:' + newId();
    await Sync.put('partie', pid, { jeu: x.data.jeu, w: deCommence ? de : moi, b: deCommence ? moi : de, defi: uid, at: Date.now(), nulle: null, fin: null });
    await Sync.put('defi', uid, Object.assign({}, x.data, { statut: 'accepte', partie: pid }));
    vib(10); ouvrir(pid);
    if (G.couleur) toast(deCommence ? 'Tu as les noirs : ' + memb(de).nom + ' commence' : 'Tu as les blancs : à toi de commencer');
    else toast(deCommence ? memb(de).nom + ' commence' : 'À toi de commencer');
  }
  function repondre(uid, statut) {
    const x = D.defis.find(d => d.uid === uid); if (!x) return;
    Sync.put('defi', uid, Object.assign({}, x.data, { statut }));
    toast(statut === 'refuse' ? 'Défi refusé' : 'Défi annulé');
  }

  /* ---------- Vue de la partie ---------- */
  const view = $('partieView');
  function ouvrir(pid) {
    vue = pid;
    const p = D.parties.find(x => x.uid === pid);
    if (p && JEUX[p.data.jeu] && JEUX[p.data.jeu].ouvrir) JEUX[p.data.jeu].ouvrir();
    document.body.classList.add('in-partie');
    view.hidden = false; $('main').scrollTop = 0;
    renderVue();
  }
  function fermer() {
    vue = null;
    document.body.classList.remove('in-partie');
    view.hidden = true; view.innerHTML = '';
    renderToday();
  }
  function ctx(e) {
    const moi = me();
    const role = e.d.w === moi ? 'w' : e.d.b === moi ? 'b' : null;
    return {
      moi, role, adv: role ? (role === 'w' ? e.d.b : e.d.w) : null,
      aMoi: !e.fin && !!role && e.trait === moi,
      qui: r => (r === 'w' ? e.d.w : e.d.b),
      nom: m => (m === moi ? 'Toi' : memb(m).nom),
      memb, esc, avatar, rendre: renderVue,
      // Enregistre un coup. opts : n (ordre), uid, txt (« a joué… » pour la notification), pour (qui joue ensuite).
      async jouer(data, opts) {
        opts = opts || {};
        const n = opts.n != null ? opts.n : e.cs.length;
        const pour = opts.pour !== undefined ? opts.pour : this.adv;
        await Sync.put('coup', opts.uid || 'coup:' + e.p.uid + ':' + n, Object.assign({ p: e.p.uid, n, pour, at: Date.now(), txt: opts.txt || 'a joué' }, data));
        vib(8);
        await load();
        const x = etat(D.parties.find(q => q.uid === e.p.uid) || e.p);
        if (x.naturel) terminer(x, x.fin);
        renderVue(); renderToday();
      }
    };
  }
  function renderVue() {
    const p = D.parties.find(x => x.uid === vue);
    if (!p) { fermer(); return; }
    const e = etat(p), G = e.G, c = ctx(e), d = e.d;
    if (!G) { view.innerHTML = '<div class="df-top"><button class="link" data-act="back">‹ Accueil</button></div><p class="note">Mets Tribu à jour pour voir cette partie.</p>'; return; }
    const haut = c.role === 'b' ? 'w' : 'b', bas = haut === 'w' ? 'b' : 'w';
    let statut;
    if (e.fin) {
      const f = e.fin, g = f.gagnant;
      const comment = Object.assign({ abandon: 'Abandon', nulle: 'Nulle acceptée', temps: 'Plus de coup depuis 7 jours' }, G.fins || {})[f.type] || 'Partie terminée';
      statut = !g ? comment + ' : partie nulle 🤝' : comment + ' : ' + (g === c.moi ? 'tu as gagné 🏆' : esc(memb(g).nom) + ' gagne 🏆');
    } else statut = (G.statut && G.statut(e, c)) || (!c.role ? 'Au tour de ' + esc(memb(e.trait).nom) : c.aMoi ? 'À toi de jouer' : esc(memb(e.trait).nom) + ' réfléchit…');
    const nulleRecue = G.nulle && !e.fin && d.nulle && d.nulle.n === e.cs.length && c.role && d.nulle.par !== c.moi;
    const nulleEnvoyee = G.nulle && !e.fin && d.nulle && d.nulle.n === e.cs.length && d.nulle.par === c.moi;
    const joueur = r => `<div class="df-player${!e.fin && e.trait === c.qui(r) ? ' turn' : ''}">${avatar(c.qui(r))}<div class="grow"><b>${esc(c.nom(c.qui(r)))}</b>${G.sousJoueur ? `<div class="df-cap">${G.sousJoueur(e, r, c)}</div>` : ''}</div>${G.marque ? G.marque(e, r, c) : ''}</div>`;
    const revanche = e.fin && c.role && !occupe(c.moi) && !occupe(c.adv);
    view.innerHTML = `
      <div class="df-top"><button class="link" data-act="back">‹ Accueil</button><span class="muted df-sub">${esc(G.nom)}${c.role ? '' : ' · tu regardes'}</span></div>
      ${joueur(haut)}
      <div class="df-plateau">${G.vue(e, c)}</div>
      ${joueur(bas)}
      <div class="df-status${e.fin ? ' fin' : ''}">${statut}</div>
      ${nulleRecue ? `<div class="df-nulle">${esc(memb(d.nulle.par).nom)} propose la nulle <button class="small acc" data-act="nulle-oui">Accepter</button><button class="small" data-act="nulle-non">Refuser</button></div>` : ''}
      ${G.pied ? G.pied(e, c) : ''}
      ${e.fin || !c.role ? (revanche ? '<button class="primary" data-act="revanche">Revanche</button>' : '') : `<div class="df-btns">${G.nulle ? `<button class="small" data-act="nulle" ${nulleEnvoyee ? 'disabled' : ''}>${nulleEnvoyee ? 'Nulle proposée' : 'Proposer la nulle'}</button>` : ''}<button class="small" data-act="abandon">Abandonner</button></div>`}
      <p class="note">Tu peux quitter la partie quand tu veux : elle t'attend ici, et une notification te prévient quand c'est ton tour.</p>`;
    if (e.fin && e.fin.derive && e.fin.gagnant === c.moi) terminer(e, e.fin);
  }
  view.addEventListener('click', ev => {
    const p = D.parties.find(x => x.uid === vue);
    const b = ev.target.closest('[data-act]');
    if (b && !b.disabled) {
      const a = b.dataset.act;
      if (a === 'back') return fermer();
      if (!p) return;
      const e = etat(p), c = ctx(e);
      if (a === 'abandon') {
        openSheet('Abandonner la partie ?', `<p class="note">${esc(memb(c.adv).nom)} gagnera la partie.</p><button class="primary" data-x="oui">Abandonner</button><button class="ghost" data-x="non">Continuer à jouer</button>`, ev2 => {
          const x = ev2.target.closest('[data-x]'); if (!x) return;
          closeSheet();
          if (x.dataset.x === 'oui') terminer(etat(p), { type: 'abandon', gagnant: c.adv });
        });
      } else if (a === 'nulle') {
        Sync.put('partie', p.uid, Object.assign({}, p.data, { nulle: { par: c.moi, n: e.cs.length } }));
        toast('Nulle proposée à ' + memb(c.adv).nom);
      } else if (a === 'nulle-oui') terminer(e, { type: 'nulle', gagnant: null });
      else if (a === 'nulle-non') Sync.put('partie', p.uid, Object.assign({}, p.data, { nulle: null }));
      else if (a === 'revanche') { fermer(); lancer(p.data.jeu, c.adv); }
      else if (e.G && e.G.clic && !e.fin && c.role) e.G.clic(ev, e, c);
      return;
    }
    if (!p) return;
    const e = etat(p), c = ctx(e);
    if (e.G && e.G.clic && !e.fin && c.role) e.G.clic(ev, e, c);
  });
  const finis = new Set();
  async function terminer(e, fin) {
    const p = D.parties.find(x => x.uid === e.p.uid) || e.p;
    if (p.data.fin || finis.has(p.uid)) return;
    finis.add(p.uid);
    const f = { type: fin.type, gagnant: fin.gagnant || null, t: Date.now() };
    await Sync.put('partie', p.uid, Object.assign({}, p.data, { nulle: null, fin: f }));
    const w = memb(p.data.w).nom, b = memb(p.data.b).nom, aux = auxJeu(p.data.jeu);
    let t;
    if (!f.gagnant) t = '🤝 Partie nulle entre ' + w + ' et ' + b + ' ' + aux;
    else {
      const perdant = f.gagnant === p.data.w ? p.data.b : p.data.w;
      t = '🏆 ' + memb(f.gagnant).nom + ' a battu ' + memb(perdant).nom + ' ' + aux + (f.type === 'abandon' ? ' (abandon)' : f.type === 'temps' ? ' (temps écoulé)' : '');
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
      const n = coupsDe(vue).length;
      if (dernierVu[vue] != null && n > dernierVu[vue]) vib([10, 40, 10]);
      dernierVu[vue] = n;
      renderVue();
    }
  }
  Sync.on(kinds => { if (kinds.some(k => ['defi', 'partie', 'coup', 'auth', 'famille'].indexOf(k) >= 0)) refresh(); });
  setInterval(() => { if (document.visibilityState === 'visible' && S.tab === 'today' && !vue) renderToday(); }, 60000);

  window.TribuJeux = { ajouter(G) { JEUX[G.id] = G; if (ORDRE_JEUX.indexOf(G.id) < 0) ORDRE_JEUX.push(G.id); } };
  window.TribuDefis = { lancer, ouvrir };

  /* ================== Échecs ================== */
  const E = window.Echecs;
  let sel = -1;
  const capStr = arr => arr.slice().sort((a, b) => 'QRBNP'.indexOf(a[1]) - 'QRBNP'.indexOf(b[1])).map(p => E.svg(p[1], p[0])).join('');
  TribuJeux.ajouter({
    id: 'echecs', nom: 'Échecs', ico: '♞', aux: 'aux échecs', couleur: true, nulle: true,
    fins: { mat: 'Échec et mat', pat: 'Pat' },
    ouvrir() { sel = -1; },
    etat(d, cs) {
      const s = E.rejouer(cs);
      let fin = null;
      if (s.over) fin = s.over.type === 'mat' ? { type: 'mat', gagnant: s.over.winner === 'w' ? d.w : d.b } : { type: 'pat', gagnant: null };
      return { s, trait: s.turn === 'w' ? d.w : d.b, fin, ncoups: cs.length };
    },
    statut(e, c) { if (c.aMoi && E.enEchec(e.s)) return 'Échec ! Protège ton roi'; },
    sousJoueur(e, r) { return capStr(e.s.caps[r]); },
    marque(e, r) { return `<span class="df-dot ${r}"></span>`; },
    pied(e) { return `<div class="df-moves">${e.s.hist.map((m, i) => (i % 2 ? '' : (i / 2 + 1) + '. ') + esc(m)).join('  ')}</div>`; },
    vue(e, c) {
      const s = e.s, flip = c.role === 'b';
      const moves = c.aMoi && sel >= 0 ? E.legal(s).filter(m => m.from === sel) : [];
      const chk = (!e.fin && E.enEchec(s)) || (e.fin && e.fin.type === 'mat') ? E.kingSq(s.b, s.turn) : -1;
      let cells = '';
      for (let k = 0; k < 64; k++) {
        const i = flip ? 63 - k : k, r = i >> 3, col = i & 7, pc = s.b[i];
        const cls = ['sq', (r + col) % 2 ? 'd' : 'l'];
        if (s.last && (s.last.from === i || s.last.to === i)) cls.push('last');
        if (i === sel) cls.push('sel');
        if (i === chk) cls.push('chk');
        const mv = moves.find(m => m.to === i);
        cells += `<div class="${cls.join(' ')}" data-sq="${i}">${pc ? E.svg(pc[1], pc[0]) : ''}${mv ? (pc || mv.epc ? '<span class="ring"></span>' : '<span class="dot"></span>') : ''}${(k & 7) === 0 ? `<span class="coord r">${8 - r}</span>` : ''}${(k >> 3) === 7 ? `<span class="coord f">${'abcdefgh'[col]}</span>` : ''}</div>`;
      }
      return `<div class="df-frame"><div class="df-board" id="dfBoard">${cells}</div></div>`;
    },
    clic(ev, e, c) {
      const sq = ev.target.closest('[data-sq]'); if (!sq) return;
      const i = +sq.dataset.sq, s = e.s;
      if (!c.aMoi) { toast('Ce n\'est pas ton tour'); return; }
      if (sel >= 0) {
        const cand = E.legal(s).filter(m => m.from === sel && m.to === i);
        if (cand.length) {
          const go = m => { const apres = E.play(s, m); const san = apres.hist[apres.hist.length - 1]; sel = -1; c.jouer({ f: m.from, t: m.to, q: m.promo || '', san }, { txt: 'a joué ' + san }); };
          if (cand[0].promo) {
            openSheet('Promotion du pion', `<div class="df-promo">${['Q', 'R', 'B', 'N'].map(q => `<button data-q="${q}">${E.svg(q, s.turn)}</button>`).join('')}</div>`, ev2 => {
              const b = ev2.target.closest('[data-q]'); if (!b) return;
              closeSheet(); go(cand.find(m => m.promo === b.dataset.q));
            });
            return;
          }
          go(cand[0]); return;
        }
      }
      const pc = s.b[i];
      sel = pc && pc[0] === c.role && i !== sel ? i : -1;
      c.rendre();
    }
  });

  refresh();
})();
