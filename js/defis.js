/* Tribu — Défis et parties : cadre commun à tous les jeux (à deux ou à plusieurs).
   Données synchronisées :
   - defi    uid defi:<membre>:<id>    { jeu, de, a (jeu à deux) | invites [] (jeu à plusieurs), coul (hasard|w|b), opts, at, statut (attente|accepte|refuse|annule), partie }
   - repdefi uid repdefi:<uid défi>|<membre>   { d, r (oui|non) }   réponse à un défi à plusieurs
   - partie  uid partie:<id>           { jeu, w, b (jeu à deux) | joueurs [] (à plusieurs), defi, opts, at, nulle, quitte [], fin: { type, gagnant | gagnants [], t } }
   - coup    uid coup:<partie>:<n>     { p, n, …données du jeu, txt (notification), pour (qui joue ensuite), at }
   Une seule partie (ou défi en attente) à la fois par personne. Sans coup depuis 7 jours : perdue par celui qui devait jouer.
   Chaque jeu s'enregistre avec TribuJeux.ajouter({ id, nom, ico, aux, multi?, couleur?, nulle?, lancement?, etat, vue, clic, statut? }). */
(function () {
  'use strict';
  const JOUR = 86400000, DELAI = 7 * JOUR;
  const memb = id => MEMBRES[id] || { nom: id || '?', ini: '?' };
  const avatar = id => `<span class="av sm m-${esc(id)}">${esc(memb(id).ini)}</span>`;
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const noms = l => { const n = l.map(m => memb(m).nom); return n.length > 1 ? n.slice(0, -1).join(', ') + ' et ' + n[n.length - 1] : n[0] || ''; };
  const JEUX = {}, ORDRE_JEUX = [];
  let D = { defis: [], reps: [], parties: [], coups: [] };
  let vue = null, dernierVu = {};

  /* ---------- Lecture et état dérivé ---------- */
  async function load() {
    const [defis, reps, parties, coups] = await Promise.all(['defi', 'repdefi', 'partie', 'coup'].map(k => Sync.all(k)));
    D = { defis, reps, parties, coups };
  }
  const coupsDe = pid => D.coups.filter(c => c.data.p === pid).map(c => c.data).sort((a, b) => a.n - b.n);
  const joueursDe = d => d.joueurs || [d.w, d.b];
  function etat(p) {
    const d = p.data, G = JEUX[d.jeu];
    const cs = coupsDe(p.uid);
    const last = cs.reduce((m, c) => Math.max(m, c.at || 0), d.at || 0);
    const r = G ? G.etat(d, cs) : { trait: null, fin: null, ncoups: cs.length };
    let fin = d.fin || r.fin || null;
    const actifs = joueursDe(d).filter(m => (d.quitte || []).indexOf(m) < 0);
    if (!fin && d.joueurs && !(G && G.equipe) && actifs.length <= 1) fin = { type: 'abandon', gagnant: actifs[0] || null };
    if (!fin && r.trait && Date.now() - last > DELAI) {
      fin = d.joueurs ? { type: 'temps', gagnants: actifs.filter(m => m !== r.trait) } : { type: 'temps', gagnant: r.trait === d.w ? d.b : d.w };
      fin.derive = true;
    }
    return Object.assign({}, r, { p, d, G, cs, last, fin, actifs, naturel: !d.fin && !!r.fin });
  }
  const gagnantsDe = f => (f ? f.gagnants || (f.gagnant ? [f.gagnant] : []) : []);
  const joue = (p, m) => joueursDe(p.data).indexOf(m) >= 0 && (p.data.quitte || []).indexOf(m) < 0;
  const reponses = x => { const o = {}; D.reps.filter(r => r.data.d === x.uid).forEach(r => { o[r.auteur] = r.data.r; }); return o; };
  const invites = x => x.data.invites || [x.data.a];
  const enAttente = x => x.data.statut === 'attente' && Date.now() - x.data.at < DELAI && !D.parties.some(p => p.data.defi === x.uid);
  const partieActive = m => D.parties.map(etat).find(e => !e.fin && joue(e.p, m)) || null;
  const defiEnvoye = m => D.defis.find(x => x.data.de === m && enAttente(x)) || null;
  const defisRecus = m => D.defis.filter(x => enAttente(x) && invites(x).indexOf(m) >= 0 && !reponses(x)[m]);
  const accepteEnAttente = m => D.defis.find(x => x.data.invites && enAttente(x) && reponses(x)[m] === 'oui') || null;
  const occupe = m => !!(partieActive(m) || defiEnvoye(m) || accepteEnAttente(m));
  const nomJeu = j => (JEUX[j] ? JEUX[j].nom : 'Jeu');
  const auxJeu = j => (JEUX[j] ? JEUX[j].aux : '');

  /* ---------- Carte de l'accueil ---------- */
  function renderToday() {
    const box = $('todayDefis'); if (!box) return;
    const moi = me(); if (!moi) { box.innerHTML = ''; return; }
    const lignes = [];
    for (const x of defisRecus(moi)) {
      const libre = !occupe(moi), autres = invites(x).filter(m => m !== moi);
      lignes.push(`<div class="df-line">${avatar(x.data.de)}<div class="grow"><b>${esc(memb(x.data.de).nom)} te défie ${esc(auxJeu(x.data.jeu))}</b>
        <div class="muted df-sub">${ago(x.data.at)}${autres.length ? ' · avec ' + esc(noms(autres)) : ''}${libre ? '' : ' · termine ta partie en cours pour accepter'}</div>
        <div class="df-btns"><button class="small acc" data-acc="${esc(x.uid)}" ${libre ? '' : 'disabled'}>Accepter</button><button class="small" data-ref="${esc(x.uid)}">Refuser</button></div></div></div>`);
    }
    const env = defiEnvoye(moi);
    if (env) {
      const rep = reponses(env), inv = invites(env);
      const suivi = env.data.invites ? ' · ' + inv.filter(m => rep[m]).length + '/' + inv.length + ' réponse' + (inv.length > 1 ? 's' : '') : '';
      lignes.push(`<div class="df-line"><span class="df-ico">⏳</span><div class="grow"><b>Défi envoyé à ${esc(noms(inv))}</b><div class="muted df-sub">${esc(nomJeu(env.data.jeu))} · en attente${suivi}</div></div><button class="small" data-ann="${esc(env.uid)}">Annuler</button></div>`);
    }
    const acc = accepteEnAttente(moi);
    if (acc) {
      const rep = reponses(acc), manque = invites(acc).filter(m => !rep[m]);
      lignes.push(`<div class="df-line"><span class="df-ico">⏳</span><div class="grow"><b>${esc(nomJeu(acc.data.jeu))} avec ${esc(memb(acc.data.de).nom)}</b><div class="muted df-sub">Tu as accepté · on attend ${esc(noms(manque))}</div></div></div>`);
    }
    const e = partieActive(moi);
    if (e) {
      const autres = joueursDe(e.d).filter(m => m !== moi), aMoi = e.trait === moi;
      const prep = !e.trait && e.aPreparer && e.aPreparer.indexOf(moi) >= 0;
      const tag = e.libre ? 'En cours' : e.trait ? (aMoi ? 'À toi' : 'À ' + esc(memb(e.trait).nom)) : prep ? 'À toi' : 'En préparation';
      lignes.push(`<button class="df-line df-open" data-open="${esc(e.p.uid)}"><span class="df-ico">${e.G ? e.G.ico : '🎲'}</span><span class="grow"><b>${esc(nomJeu(e.d.jeu))} avec ${esc(noms(autres))}</b><span class="muted df-sub">${e.ncoups} coup${e.ncoups > 1 ? 's' : ''} · dernier ${ago(e.last)}</span></span><span class="df-tag${aMoi || prep || e.libre ? ' on' : ''}">${tag}</span></button>`);
    }
    D.parties.map(etat).filter(x => !x.fin && !joue(x.p, moi)).forEach(x => {
      lignes.push(`<button class="df-line df-open" data-open="${esc(x.p.uid)}"><span class="df-ico">👀</span><span class="grow"><b>${esc(noms(joueursDe(x.d)))}</b><span class="muted df-sub">${esc(nomJeu(x.d.jeu))} · regarder la partie</span></span></button>`);
    });
    const sc = {};
    D.parties.forEach(p => { const x = etat(p); if (!x.fin || x.fin.derive) return; gagnantsDe(x.fin).forEach(g => { const j = p.data.jeu; sc[j] = sc[j] || {}; sc[j][g] = (sc[j][g] || 0) + 1; }); });
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
    let qui = [].concat(quiInit || []).filter(m => !occupe(m));
    if (!qui.length) { const l = autres.find(m => !occupe(m)); if (l) qui = [l]; }
    let coul = 'hasard', opts = {};
    const draw = () => {
      const G = JEUX[jeu], max = G.multi ? G.multi - 1 : 1;
      if (qui.length > max) qui = qui.slice(0, max);
      if (G.lancement && G.lancement.defaut) opts = Object.assign({}, G.lancement.defaut, opts);
      openSheet('Lancer un défi', `
      <div class="df-games">${ORDRE_JEUX.map(j => `<button class="df-game${j === jeu ? ' on' : ''}" data-j="${j}"><b>${JEUX[j].ico}</b>${esc(JEUX[j].nom)}</button>`).join('')}</div>
      <p class="label">${max > 1 ? (G.equipe ? 'Qui devine ? (1 à ' + max + ' personnes)' : 'Avec qui ? (1 à ' + max + ' personnes)') : 'Qui veux-tu défier ?'}</p>
      <div class="df-chips">${autres.map(m => { const o = occupe(m); return `<button class="df-chip${qui.indexOf(m) >= 0 ? ' on' : ''}" data-m="${m}" ${o ? 'disabled' : ''}>${avatar(m)}${esc(memb(m).nom)}${o ? ' · déjà en partie' : ''}</button>`; }).join('')}</div>
      <p class="note">Une seule partie à la fois par personne.${max > 1 ? ' La partie démarre quand tout le monde a répondu.' : ''}</p>
      ${G.equipe ? '' : `<p class="label">${G.couleur ? 'Ta couleur' : 'Qui commence ?'}</p>
      <div class="seg">${[['hasard', 'Au hasard'], ['w', G.couleur ? 'Blancs' : 'Moi'], ['b', G.couleur ? 'Noirs' : (qui[0] && max === 1 ? esc(memb(qui[0]).nom) : 'Les autres')]].map(c => `<button class="${coul === c[0] ? 'sel' : ''}" data-c="${c[0]}">${c[1]}</button>`).join('')}</div>`}
      ${G.lancement ? G.lancement.html(opts) : ''}
      <button class="primary" data-send ${qui.length ? '' : 'disabled'}>Envoyer le défi</button>`, e => {
        const b = e.target.closest('button'); if (!b || b.disabled) return;
        if (G.lancement && G.lancement.lire) opts = Object.assign(opts, G.lancement.lire($('sheetBody')) || {});
        if (b.dataset.j) { jeu = b.dataset.j; opts = {}; draw(); }
        else if (b.dataset.m) { const m = b.dataset.m; qui = max > 1 ? (qui.indexOf(m) >= 0 ? qui.filter(x => x !== m) : qui.concat(m)) : [m]; draw(); }
        else if (b.dataset.c) { coul = b.dataset.c; draw(); }
        else if (b.dataset.opt) { opts[b.dataset.opt] = b.dataset.v; draw(); }
        else if (b.hasAttribute('data-send') && qui.length) {
          const pris = qui.filter(occupe); if (pris.length) { toast(noms(pris) + ' déjà en partie'); return; }
          if (G.lancement && G.lancement.valider) { const err = G.lancement.valider(opts); if (err) { toast(err); return; } }
          const base = { jeu, de: moi, coul, opts, at: Date.now(), statut: 'attente' };
          Sync.put('defi', 'defi:' + moi + ':' + newId(), Object.assign(base, G.multi ? { invites: qui } : { a: qui[0] }));
          closeSheet(); toast('Défi envoyé à ' + noms(qui)); vib(8);
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
    if (x.data.invites) {
      await Sync.put('repdefi', 'repdefi:' + uid + '|' + moi, { d: uid, r: 'oui' });
      vib(10); await load(); renderToday(); demarrer(x);
      return;
    }
    const deCommence = x.data.coul === 'w' ? true : x.data.coul === 'b' ? false : Math.random() < 0.5;
    const pid = 'partie:' + uid.split(':').pop();
    await Sync.put('partie', pid, { jeu: x.data.jeu, w: deCommence ? de : moi, b: deCommence ? moi : de, defi: uid, opts: x.data.opts || {}, at: Date.now(), nulle: null, fin: null });
    await Sync.put('defi', uid, Object.assign({}, x.data, { statut: 'accepte', partie: pid }));
    vib(10); ouvrir(pid);
    if (G.couleur) toast(deCommence ? 'Tu as les noirs : ' + memb(de).nom + ' commence' : 'Tu as les blancs : à toi de commencer');
    else toast(deCommence ? memb(de).nom + ' commence' : 'À toi de commencer');
  }
  // Jeu à plusieurs : quand tout le monde a répondu, la partie démarre (uid fixe : pas de doublon si deux téléphones la créent).
  const demarres = new Set();
  async function demarrer(x) {
    if (!enAttente(x) || demarres.has(x.uid)) return;
    const rep = reponses(x), inv = invites(x);
    if (inv.some(m => !rep[m])) return;
    demarres.add(x.uid);
    const oui = inv.filter(m => rep[m] === 'oui'), G = JEUX[x.data.jeu];
    if (!oui.length) { if (x.data.de === me()) Sync.put('defi', x.uid, Object.assign({}, x.data, { statut: 'refuse' })); return; }
    let joueurs = [x.data.de].concat(oui);
    if (G && !G.equipe) {
      if (x.data.coul === 'hasard') joueurs = joueurs.sort(() => Math.random() - 0.5);
      else if (x.data.coul === 'b') joueurs = oui.concat(x.data.de);
    }
    const pid = 'partie:' + x.uid.split(':').pop();
    await Sync.put('partie', pid, { jeu: x.data.jeu, joueurs, w: joueurs[0], b: joueurs[1], defi: x.uid, opts: x.data.opts || {}, at: Date.now(), quitte: [], fin: null });
    if (x.data.de === me()) await Sync.put('defi', x.uid, Object.assign({}, x.data, { statut: 'accepte', partie: pid }));
    if (joueurs.indexOf(me()) >= 0) { ouvrir(pid); toast('Tout le monde a répondu : la partie commence !'); }
  }
  async function repondre(uid, statut) {
    const x = D.defis.find(d => d.uid === uid); if (!x) return;
    if (x.data.invites && statut === 'refuse') {
      await Sync.put('repdefi', 'repdefi:' + uid + '|' + me(), { d: uid, r: 'non' });
      toast('Défi refusé'); await load(); demarrer(x); return;
    }
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
    const moi = me(), js = joueursDe(e.d);
    const role = e.d.joueurs ? (js.indexOf(moi) >= 0 ? 'j' + js.indexOf(moi) : null) : e.d.w === moi ? 'w' : e.d.b === moi ? 'b' : null;
    const actif = role && (e.d.quitte || []).indexOf(moi) < 0;
    return {
      moi, role: actif ? role : null, idx: js.indexOf(moi), joueurs: js,
      adv: role && !e.d.joueurs ? (role === 'w' ? e.d.b : e.d.w) : null,
      aMoi: !e.fin && !!actif && e.trait === moi,
      qui: r => (r === 'w' ? e.d.w : e.d.b),
      nom: m => (m === moi ? 'Toi' : memb(m).nom),
      memb, esc, avatar, noms, rendre: renderVue,
      cle: 'tribu.' + (window.TRIBU_ENV || 'local') + '.jeu.' + e.p.uid,
      // Enregistre un coup. o : n (ordre), uid, txt (« a joué… » pour la notification), pour (qui joue ensuite).
      async jouer(data, o) {
        o = o || {};
        const n = o.n != null ? o.n : e.cs.length;
        const pour = o.pour !== undefined ? o.pour : this.adv;
        await Sync.put('coup', o.uid || 'coup:' + e.p.uid + ':' + n, Object.assign({ p: e.p.uid, n, pour: pour || null, at: Date.now(), txt: o.txt || 'a joué' }, data));
        vib(8);
        await load();
        const x = etat(D.parties.find(q => q.uid === e.p.uid) || e.p);
        if (x.naturel) terminer(x, x.fin);
        renderVue(); renderToday();
      }
    };
  }
  function statutFin(e, c) {
    const f = e.fin, gs = gagnantsDe(f);
    const comment = Object.assign({ abandon: 'Abandon', nulle: 'Nulle acceptée', temps: 'Plus de coup depuis 7 jours' }, e.G.fins || {})[f.type] || 'Partie terminée';
    if (!gs.length) return comment + ' : partie nulle 🤝';
    if (gs.indexOf(c.moi) >= 0) return comment + ' : ' + (gs.length > 1 ? 'vous avez gagné 🏆' : 'tu as gagné 🏆');
    return comment + ' : ' + esc(noms(gs)) + (gs.length > 1 ? ' gagnent 🏆' : ' gagne 🏆');
  }
  function renderVue() {
    const p = D.parties.find(x => x.uid === vue);
    if (!p) { fermer(); return; }
    const e = etat(p), G = e.G, c = ctx(e), d = e.d;
    if (!G) { view.innerHTML = '<div class="df-top"><button class="link" data-act="back">‹ Accueil</button></div><p class="note">Mets Tribu à jour pour voir cette partie.</p>'; return; }
    const statut = e.fin ? statutFin(e, c) : (G.statut && G.statut(e, c)) || (!c.role ? 'Au tour de ' + esc(memb(e.trait).nom) : c.aMoi ? 'À toi de jouer' : esc(memb(e.trait).nom) + ' réfléchit…');
    const nulleRecue = G.nulle && !e.fin && d.nulle && d.nulle.n === e.cs.length && c.role && d.nulle.par !== c.moi;
    const nulleEnvoyee = G.nulle && !e.fin && d.nulle && d.nulle.n === e.cs.length && d.nulle.par === c.moi;
    let haut = '', bas = '';
    if (d.joueurs) {
      haut = `<div class="df-players">${c.joueurs.map(m => { const q = (d.quitte || []).indexOf(m) >= 0; return `<span class="df-pl m-${esc(m)}${!e.fin && e.trait === m ? ' turn' : ''}${q ? ' quit' : ''}">${avatar(m)}${esc(c.nom(m))}${G.chip ? ' · ' + G.chip(e, m, c) : ''}</span>`; }).join('')}</div>`;
    } else {
      const h = c.role === 'b' ? 'w' : 'b';
      const joueur = r => `<div class="df-player${!e.fin && e.trait === c.qui(r) ? ' turn' : ''}">${avatar(c.qui(r))}<div class="grow"><b>${esc(c.nom(c.qui(r)))}</b>${G.sousJoueur ? `<div class="df-cap">${G.sousJoueur(e, r, c)}</div>` : ''}</div>${G.marque ? G.marque(e, r, c) : ''}</div>`;
      haut = joueur(h); bas = joueur(h === 'w' ? 'b' : 'w');
    }
    const autres = c.joueurs.filter(m => m !== c.moi);
    const revanche = e.fin && c.idx >= 0 && !occupe(c.moi) && autres.every(m => !occupe(m));
    const quitter = d.joueurs && !G.equipe;
    view.innerHTML = `
      <div class="df-top"><button class="link" data-act="back">‹ Accueil</button><span class="muted df-sub">${esc(G.nom)}${c.idx >= 0 ? '' : ' · tu regardes'}</span></div>
      ${haut}
      <div class="df-plateau">${G.vue(e, c)}</div>
      ${bas}
      <div class="df-status${e.fin ? ' fin' : ''}">${statut}</div>
      ${nulleRecue ? `<div class="df-nulle">${esc(memb(d.nulle.par).nom)} propose la nulle <button class="small acc" data-act="nulle-oui">Accepter</button><button class="small" data-act="nulle-non">Refuser</button></div>` : ''}
      ${G.pied ? G.pied(e, c) : ''}
      ${e.fin || !c.role ? (revanche ? '<button class="primary" data-act="revanche">Revanche</button>' : '') : `<div class="df-btns">${G.nulle ? `<button class="small" data-act="nulle" ${nulleEnvoyee ? 'disabled' : ''}>${nulleEnvoyee ? 'Nulle proposée' : 'Proposer la nulle'}</button>` : ''}<button class="small" data-act="abandon">${quitter ? 'Quitter la partie' : 'Abandonner'}</button></div>`}
      <p class="note">Tu peux quitter l'écran quand tu veux : la partie t'attend ici, et une notification te prévient quand c'est ton tour.</p>`;
    if (e.fin && e.fin.derive && gagnantsDe(e.fin).indexOf(c.moi) >= 0) terminer(e, e.fin);
  }
  view.addEventListener('click', ev => {
    const p = D.parties.find(x => x.uid === vue);
    const b = ev.target.closest('[data-act]');
    if (b && !b.disabled) {
      const a = b.dataset.act;
      if (a === 'back') return fermer();
      if (!p) return;
      const e = etat(p), c = ctx(e), multi = !!p.data.joueurs, equipe = !!(e.G && e.G.equipe);
      if (a === 'abandon') {
        const texte = !multi ? esc(memb(c.adv).nom) + ' gagnera la partie.' : equipe ? (c.idx === 0 ? 'Les devineurs gagneront la partie.' : 'L\'équipe continue sans toi.') : 'Les autres continuent sans toi.';
        openSheet(multi && !equipe ? 'Quitter la partie ?' : 'Abandonner la partie ?', `<p class="note">${texte}</p><button class="primary" data-x="oui">${multi && !equipe ? 'Quitter' : 'Abandonner'}</button><button class="ghost" data-x="non">Continuer à jouer</button>`, ev2 => {
          const x = ev2.target.closest('[data-x]'); if (!x) return;
          closeSheet();
          if (x.dataset.x !== 'oui') return;
          if (!multi) terminer(etat(p), { type: 'abandon', gagnant: c.adv });
          else if (equipe && c.idx === 0) terminer(etat(p), { type: 'abandon', gagnants: c.joueurs.slice(1) });
          else Sync.put('partie', p.uid, Object.assign({}, p.data, { quitte: (p.data.quitte || []).concat(c.moi) })).then(async () => { await load(); const q = D.parties.find(z => z.uid === p.uid); const x2 = q && etat(q); if (x2 && x2.fin && !x2.d.fin) terminer(x2, x2.fin); fermer(); });
        });
      } else if (a === 'nulle') {
        Sync.put('partie', p.uid, Object.assign({}, p.data, { nulle: { par: c.moi, n: e.cs.length } }));
        toast('Nulle proposée à ' + memb(c.adv).nom);
      } else if (a === 'nulle-oui') terminer(e, { type: 'nulle', gagnant: null });
      else if (a === 'nulle-non') Sync.put('partie', p.uid, Object.assign({}, p.data, { nulle: null }));
      else if (a === 'revanche') { fermer(); lancer(p.data.jeu, c.joueurs.filter(m => m !== c.moi)); }
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
    const f = { type: fin.type, t: Date.now() };
    if (fin.par) f.par = fin.par;
    if (fin.gagnants) f.gagnants = fin.gagnants; else f.gagnant = fin.gagnant || null;
    await Sync.put('partie', p.uid, Object.assign({}, p.data, { nulle: null, fin: f }));
    const G = JEUX[p.data.jeu], gs = gagnantsDe(f), js = joueursDe(p.data), aux = auxJeu(p.data.jeu);
    let t = G && G.messageFin ? G.messageFin(p.data, f, noms) : null;
    if (!t) {
      if (!gs.length) t = '🤝 Partie nulle entre ' + noms(js) + ' ' + aux;
      else {
        const perdants = js.filter(m => gs.indexOf(m) < 0);
        t = '🏆 ' + noms(gs) + (gs.length > 1 ? ' ont battu ' : ' a battu ') + noms(perdants) + ' ' + aux + (f.type === 'abandon' ? ' (abandon)' : f.type === 'temps' ? ' (temps écoulé)' : '');
      }
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
    // Défi à plusieurs dont tout le monde a répondu : le défieur (ou un participant) lance la partie.
    D.defis.filter(x => x.data.invites && enAttente(x) && (x.data.de === me() || reponses(x)[me()] === 'oui')).forEach(x => { const rep = reponses(x); if (invites(x).every(m => rep[m])) demarrer(x); });
    renderToday();
    if (vue) {
      const n = coupsDe(vue).length;
      if (dernierVu[vue] != null && n > dernierVu[vue]) vib([10, 40, 10]);
      dernierVu[vue] = n;
      renderVue();
    }
  }
  Sync.on(kinds => { if (kinds.some(k => ['defi', 'repdefi', 'partie', 'coup', 'auth', 'famille'].indexOf(k) >= 0)) refresh(); });
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
