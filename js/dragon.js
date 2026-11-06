/* Tribu — le dragon de la tribu (œuf, éclosion, bébé).
   Données synchronisées :
   - dragon  uid dragon:courant          { o (n° d'œuf), vacs: [{ d, f }] }   écrit par l'administrateur seulement
   - soin    uid soin:<membre>:<id>      { o, a, t }   a = rechauffer | manger | sortir | laver | soigner | calin | jouer | deposer
   - le nom vient d'un sondage du chat marqué { dragon: o }.
   Tout l'état (éclosion, besoins, humeur, départ, retour) est recalculé à l'identique sur chaque téléphone
   à partir des soins et de l'heure locale. Clips vidéo : dossier dragon/, gardés hors ligne après la première lecture. */
(function () {
  'use strict';
  const H = 3600e3, DIR = 'dragon/';
  const CACHE = 'tribu-dragon|' + location.pathname.replace(/[^/]*$/, '');
  const nom = id => (MEMBRES[id] || { nom: id || '?' }).nom;
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- temps ---------- */
  const debutJour = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const lendemain = t => { const d = new Date(debutJour(t)); d.setDate(d.getDate() + 1); return d.getTime(); };
  const veille = t => { const d = new Date(debutJour(t)); d.setDate(d.getDate() - 1); return d.getTime(); };
  const hdec = t => { const d = new Date(t); return d.getHours() + d.getMinutes() / 60; };
  const estNuit = t => { const h = hdec(t); return h >= 22 || h < 7; };
  const hm = t => { const d = new Date(t); return d.getHours() + ' h ' + String(d.getMinutes()).padStart(2, '0'); };
  function heuresJour(a, b) { // heures de jour (7 h – 22 h) entre a et b
    let s = 0, t = a;
    while (t < b) { const d0 = debutJour(t), lo = Math.max(t, d0 + 7 * H), hi = Math.min(b, d0 + 22 * H); if (hi > lo) s += hi - lo; t = lendemain(t); }
    return s / H;
  }

  /* ---------- règles ---------- */
  const RG = { manger: { max: 2, ecart: 4 }, sortir: { max: 4, ecart: 2 }, soigner: { max: 2, ecart: 4 }, laver: { ecart: 6 }, calin: { perso: 1 }, jouer: { perso: 1 } };
  const ACTIONS = [['manger', 'Nourrir'], ['sortir', 'Sortir'], ['laver', 'Laver'], ['soigner', 'Soigner'], ['calin', 'Câlin'], ['jouer', 'Jouer']];
  const HUMEUR = { content: ['😊', 'Content'], affame: ['😤', 'Affamé'], besoin: ['😬', 'Besoin de sortir'], sale: ['🫣', 'Sale'], malade: ['🤒', 'Malade'], endormi: ['😴', 'Endormi'] };

  let D = { o: '1', vacs: [] }, soins = [], sondage = null, votes = [];

  async function load() {
    const [dr, so, sd, vo] = await Promise.all([Sync.all('dragon'), Sync.all('soin'), Sync.all('sondage'), Sync.all('vote')]);
    const c = dr.find(x => x.uid === 'dragon:courant');
    D = c && c.data && c.data.o ? Object.assign({ vacs: [] }, c.data) : { o: '1', vacs: [] };
    soins = so.filter(x => x.data && x.data.o === D.o && x.data.a).map(x => ({ m: x.uid.split(':')[1], a: x.data.a, t: +x.data.t || x.maj })).sort((a, b) => a.t - b.t);
    sondage = sd.filter(x => x.data && x.data.dragon === D.o).sort((a, b) => (a.data.at || 0) - (b.data.at || 0))[0] || null;
    votes = sondage ? vo.filter(v => v.data && v.data.s === sondage.uid) : [];
  }

  const enVac = t => (D.vacs || []).some(v => t >= v.d && (!v.f || t < v.f));
  function compte(a, de, a2) { return soins.filter(s => s.a === a && s.t >= de && s.t < a2).length; }
  function score(j) { // part des besoins remplis sur la journée commençant à j
    const f = lendemain(j);
    return (Math.min(2, compte('manger', j, f)) / 2 + Math.min(4, compte('sortir', j, f)) / 4 + Math.min(2, compte('soigner', j, f)) / 2) / 3;
  }

  function etat(now) {
    const E = { now, stade: 'oeuf', chauffeurs: {}, nom: '' };
    const vus = new Set();
    for (const s of soins) if (s.a === 'rechauffer') { vus.add(s.m); if (s.t >= debutJour(now)) E.chauffeurs[s.m] = true; if (!E.ne && ORDRE.length && ORDRE.every(m => vus.has(m))) E.ne = s.t; }
    E.dejaChauffe = [...vus];
    if (!E.ne) return E;
    E.stade = 'bebe';
    // nom : option en tête du sondage
    if (sondage) {
      const n = sondage.data.opts.map((_, i) => votes.filter(v => v.data.o === i).length);
      const best = Math.max(...n);
      E.nom = best > 0 ? sondage.data.opts[n.indexOf(best)] : '';
      E.sondage = { votes: votes.length };
    }
    // jours passés : départ et retour
    let parti = false, mauvais = 0, depots = 0;
    const j0 = debutJour(now);
    for (let j = lendemain(E.ne); j < j0; j = lendemain(j)) {
      if (enVac(j + 12 * H)) continue;
      if (!parti) { mauvais = score(j) < 0.5 ? mauvais + 1 : 0; if (mauvais >= 2) { parti = true; depots = 0; mauvais = 0; } }
      else { depots = compte('deposer', j, lendemain(j)) ? depots + 1 : 0; if (depots >= 3) { parti = false; depots = 0; } }
    }
    if (parti && compte('deposer', j0, j0 + 24 * H)) { depots++; if (depots >= 3) parti = false; }
    E.parti = parti; E.depots = depots; E.depotAujourdhui = !!compte('deposer', j0, j0 + 24 * H);
    E.vac = enVac(now); E.nuit = estNuit(now);
    // aujourd'hui
    E.repas = compte('manger', j0, j0 + 24 * H); E.sorties = compte('sortir', j0, j0 + 24 * H); E.soins = compte('soigner', j0, j0 + 24 * H);
    E.last = {}; E.perso = {};
    for (const s of soins) { E.last[s.a] = s.t; (E.perso[s.m] = E.perso[s.m] || {})[s.a] = s.t; }
    const lav = Math.max(E.last.laver || 0, E.ne);
    E.proprete = Math.max(0, Math.min(100, Math.round(100 - 4 * heuresJour(lav, now) - 10 * soins.filter(s => s.a === 'jouer' && s.t > lav).length)));
    const tendresse = soins.filter(s => (s.a === 'calin' || s.a === 'jouer') && s.t > now - 24 * H).length;
    const hier = veille(now);
    const hierMauvais = hier > E.ne && !enVac(hier + 12 * H) && score(hier) < 0.5;
    E.bonheur = Math.max(0, Math.min(100, 40 + 12 * Math.min(4, tendresse) + 5 * (E.repas + E.sorties) - (hierMauvais ? 15 : 0)));
    // humeur
    const h = hdec(now), soigneAuj = compte('soigner', j0, j0 + 24 * H);
    const depuisSortie = heuresJour(Math.max(E.last.sortir || 0, E.ne, j0 + 7 * H), now);
    if (E.nuit) E.humeur = 'endormi';
    else if (hierMauvais && !soigneAuj) E.humeur = 'malade';
    else if (((h >= 12 && E.repas < 1) || (h >= 19 && E.repas < 2)) && heuresJour(Math.max(E.last.manger || 0, E.ne), now) >= 3) E.humeur = 'affame';
    else if (E.sorties < 4 && depuisSortie >= 4) E.humeur = 'besoin';
    else if (E.proprete < 35) E.humeur = 'sale';
    else E.humeur = 'content';
    return E;
  }

  function dispo(E, k) { // '' si possible, sinon quand
    const r = RG[k], now = E.now;
    if (r.perso) { const l = (E.perso[me()] || {})[k]; return l && now - l < r.perso * H ? 'à ' + hm(l + r.perso * H) : ''; }
    if (k === 'laver' && E.humeur === 'sale') return '';
    if (k === 'soigner' && E.humeur === 'malade') return '';
    const nb = { manger: E.repas, sortir: E.sorties, soigner: E.soins }[k];
    if (r.max && nb >= r.max) return 'demain';
    const l = E.last[k]; if (l && now - l < r.ecart * H) return 'vers ' + hm(l + r.ecart * H);
    return '';
  }

  /* ---------- clips : gardés dans un cache, lus depuis un blob (lecture fluide, hors ligne) ---------- */
  const blobs = {};
  async function clip(n) {
    if (blobs[n]) return blobs[n];
    const url = DIR + n + '.mp4';
    let r;
    try { const c = await caches.open(CACHE); r = await c.match(url); if (!r) { r = await fetch(url); if (r.ok) await c.put(url, r.clone()); } }
    catch (e) { r = await fetch(url); }
    return (blobs[n] = URL.createObjectURL(await r.blob()));
  }
  let busy = false, boucleActuelle = '';
  async function setBoucle(n) {
    const v = $('dgLoop'); if (!v || !n) return;
    if (boucleActuelle === n && v.src) return;
    boucleActuelle = n;
    try { const u = await clip(n); if (boucleActuelle === n) { v.src = u; v.play().catch(() => {}); } } catch (e) {}
  }
  async function jouer(n, apres) {
    const top = $('dgTop'); if (!top || busy) return;
    busy = true; render();
    let fini = false;
    const finir = () => { if (fini) return; fini = true; clearTimeout(garde); top.classList.remove('on'); busy = false; if (apres) apres(); refresh(); };
    const garde = setTimeout(finir, 8000);
    try { top.src = await clip(n); } catch (e) { finir(); return; }
    top.onplaying = () => top.classList.add('on');
    top.onended = finir; top.onerror = finir;
    top.currentTime = 0; top.play().catch(finir);
  }

  /* ---------- rendu ---------- */
  const bar = (v, max) => { const p = Math.min(100, Math.round(v / max * 100)); return `<div class="dg-bar"><i class="${p < 50 ? 'bas' : ''}" style="width:${p}%"></i></div>`; };
  const IC = {
    manger: '<path d="M4 12h16a8 8 0 01-16 0z"/><path d="M9 8c0-2 1-3 1-4M13 8c0-2 1-3 1-4"/>',
    sortir: '<path d="M3 13c3-1 5-4 9-4s6 3 9 4"/><path d="M8 13l-2 5M16 13l2 5M12 9V5"/>',
    laver: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="10" r="2"/><circle cx="11" cy="16" r="4"/>',
    soigner: '<path d="M12 21s-8-5-8-11a4 4 0 018-1 4 4 0 018 1c0 6-8 11-8 11z"/><path d="M12 9v5M9.5 11.5h5"/>',
    calin: '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z"/>',
    jouer: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"/>'
  };
  const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[k]}</svg>`;
  let E = null;

  function scene(badge, extra) {
    return `<div class="dg-stage"><video id="dgLoop" muted playsinline loop autoplay></video><video id="dgTop" class="dg-top" muted playsinline></video>${badge || ''}${extra || ''}</div>`;
  }
  function vueOeuf() {
    const n = E.dejaChauffe.length;
    const moi = E.chauffeurs[me()];
    return `<h1 class="dg-h1">L'œuf de la tribu</h1>${scene('<span class="dg-mood">🥚 Un œuf mystérieux</span>')}
      <p class="muted center dg-gap">Qu'y a-t-il dedans ? Il éclora quand toute la tribu l'aura réchauffé.</p>
      <div class="dg-warm">${ORDRE.map(m => `<span class="av m-${m}${E.dejaChauffe.indexOf(m) >= 0 ? ' fait' : ''}">${MEMBRES[m].ini}</span>`).join('')}</div>
      <button class="primary" data-dg="rechauffer"${moi || busy ? ' disabled' : ''}>${moi ? 'Tu l\'as déjà réchauffé aujourd\'hui' : 'Réchauffer l\'œuf'}</button>
      <p class="muted center dg-gap">${n} / 4 · une fois par jour chacun</p>${admin()}`;
  }
  function vueParti() {
    return `<h1 class="dg-h1">${esc(E.nom || 'Le dragon')} est parti…</h1>
      <div class="dg-stage"><img src="${DIR}lettre.jpg" alt="Le nid vide avec une lettre"></div>
      <div class="dg-lettre">« Je me sentais un peu seul… Je suis parti faire un tour. Si quelqu'un dépose à manger devant mon nid trois jours de suite, je reviendrai. — ${esc(E.nom || 'Votre dragon')} »</div>
      <p class="muted center">Jours de suite : ${E.depots} / 3</p>
      <button class="primary" data-dg="deposer"${E.depotAujourdhui ? ' disabled' : ''}>${E.depotAujourdhui ? 'Déjà déposé aujourd\'hui, à demain' : 'Déposer à manger devant le nid'}</button>${admin()}`;
  }
  function vueBebe() {
    const [emo, lbl] = HUMEUR[E.humeur];
    const hot = { affame: 'manger', besoin: 'sortir', sale: 'laver', malade: 'soigner' }[E.humeur];
    const bloque = busy || E.nuit || E.vac;
    const nomL = E.nom ? esc(E.nom) : 'Bébé dragon';
    const sous = E.vac ? 'Mode vacances' : 'Il est ' + hm(E.now);
    const nomInfo = !sondage ? `<button class="dg-link" data-dg="nommer">Lui trouver un nom →</button>`
      : (votes.length < ORDRE.length ? `<button class="dg-link" data-dg="chat">Sondage du nom en cours · ${votes.length}/${ORDRE.length} votes →</button>` : '');
    return `<div class="dg-name"><b>${nomL}</b><span class="muted">${sous}</span></div>${nomInfo}
      ${scene(`<span class="dg-mood">${emo} ${lbl}</span>`, E.nuit ? '<span class="dg-zz">Nuit · besoins en pause</span>' : E.vac ? '<span class="dg-zz">Vacances · tout est en pause</span>' : '')}
      <div class="dg-needs">
        <div class="dg-need"><div class="l"><span>Repas</span><span>${E.repas}/2</span></div>${bar(E.repas, 2)}</div>
        <div class="dg-need"><div class="l"><span>Sorties</span><span>${E.sorties}/4</span></div>${bar(E.sorties, 4)}</div>
        <div class="dg-need"><div class="l"><span>Soins</span><span>${E.soins}/2</span></div>${bar(E.soins, 2)}</div>
        <div class="dg-need"><div class="l"><span>Propreté</span><span>${E.proprete} %</span></div>${bar(E.proprete, 100)}</div>
        <div class="dg-need wide"><div class="l"><span>Bonheur</span><span>${E.bonheur} %</span></div>${bar(E.bonheur, 100)}</div>
      </div>
      <div class="dg-acts">${ACTIONS.map(([k, l]) => { const d = bloque ? '' : dispo(E, k); return `<button class="dg-act${hot === k && !d && !bloque ? ' hot' : ''}" data-dg="${k}"${bloque || d ? ' disabled' : ''}>${svg(k)}<span>${l}</span>${d ? `<small>${d}</small>` : ''}</button>`; }).join('')}</div>
      ${E.nuit ? '<p class="muted center dg-gap">Il dort : on le laisse tranquille jusqu\'à 7 h.</p>' : ''}
      <h2 class="h3 dg-gap">Les soigneurs de la semaine</h2>
      <div class="card dg-board">${tableau()}</div>${admin()}`;
  }
  function tableau() {
    const d = new Date(debutJour(E.now)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const lundi = d.getTime();
    const c = {}; ORDRE.forEach(m => { c[m] = 0; });
    soins.forEach(s => { if (s.t >= lundi && c[s.m] != null) c[s.m]++; });
    const best = Math.max(...Object.values(c));
    return ORDRE.slice().sort((a, b) => c[b] - c[a]).map(m => `<div class="dg-row"><span class="av sm m-${m}">${MEMBRES[m].ini}</span><span class="n">${esc(nom(m))}${c[m] && c[m] === best ? ' 🏆' : ''}</span><span class="c">${c[m]} soin${c[m] > 1 ? 's' : ''}</span></div>`).join('');
  }
  function admin() {
    if (!estAdmin(me())) return '';
    const vac = enVac(Date.now());
    return `<div class="dg-admin"><span class="label">Administrateur</span>
      ${E.stade === 'bebe' ? `<button class="ghost" data-dg="vacances">${vac ? 'Terminer le mode vacances' : 'Mode vacances (tout mettre en pause)'}</button>` : ''}
      <button class="ghost danger" data-dg="recommencer">Recommencer à l'œuf</button></div>`;
  }
  function tuile() {
    const el = $('todayDragon'); if (!el) return;
    if (!me()) { el.innerHTML = ''; return; }
    let titre, txt, img;
    if (E.stade === 'oeuf') { titre = 'L\'œuf de la tribu'; txt = E.dejaChauffe.length + ' / 4 l\'ont réchauffé' + (E.chauffeurs[me()] ? '' : ' · et toi ?'); img = 'vignette-oeuf'; }
    else if (E.parti) { titre = E.nom || 'Le dragon'; txt = 'Il est parti… une lettre vous attend'; img = 'vignette'; }
    else { titre = E.nom || 'Bébé dragon'; const [emo, l] = HUMEUR[E.humeur]; txt = emo + ' ' + l + (['content', 'endormi'].indexOf(E.humeur) < 0 ? ' · il a besoin de vous' : ''); img = 'vignette'; }
    el.innerHTML = `<button class="card dg-tile" data-go="dragon"><img src="${DIR}${img}.jpg" alt=""><span><b>${esc(titre)}</b><span>${esc(txt)} →</span></span></button>`;
  }
  function onglet() {
    const b = document.querySelector('[data-tab="dragon"]'); if (!b) return;
    const oeuf = E.stade === 'oeuf';
    b.querySelector('span').textContent = oeuf ? 'Œuf' : 'Dragon';
    b.querySelector('svg').innerHTML = oeuf ? '<path d="M12 3c-4 0-7 6-7 11a7 7 0 0014 0c0-5-3-11-7-11z"/>'
      : '<path d="M5 17c0-5 3-9 7-9s7 4 7 9"/><path d="M8 9L6 4l4 3M16 9l2-5-4 3"/><circle cx="10" cy="13" r=".8"/><circle cx="14" cy="13" r=".8"/><path d="M4 17h16"/>';
  }
  function render() {
    if (!E) return;
    tuile(); onglet();
    const box = $('dragon'); if (!box || S.tab !== 'dragon') return;
    const garde = $('dgLoop');
    const html = E.stade === 'oeuf' ? vueOeuf() : E.parti ? vueParti() : vueBebe();
    if (garde && box.querySelector('.dg-stage video')) {
      // on garde les vidéos en place (pas de saut), on remplace le reste
      const tmp = document.createElement('div'); tmp.innerHTML = html;
      const st = box.querySelector('.dg-stage'), nst = tmp.querySelector('.dg-stage');
      if (st && nst && nst.querySelector('video')) {
        st.querySelectorAll('.dg-mood,.dg-zz').forEach(x => x.remove());
        nst.querySelectorAll('.dg-mood,.dg-zz').forEach(x => st.appendChild(x));
        [...box.children].forEach(c => { if (c !== st) c.remove(); });
        let avant = true;
        [...tmp.children].forEach(c => { if (c.classList.contains('dg-stage')) { avant = false; return; } if (avant) box.insertBefore(c, st); else box.appendChild(c); });
        setBoucle(boucle());
        return;
      }
    }
    box.innerHTML = html; boucleActuelle = '';
    setBoucle(boucle());
  }
  const boucle = () => E.stade === 'oeuf' ? 'oeuf' : E.parti ? '' : E.humeur;

  async function refresh() {
    if (!me()) return;
    await load();
    const avant = E && E.stade;
    E = etat(Date.now());
    // éclosion vue par ce téléphone : on la joue une fois
    const vuKey = 'dragonEclos_' + D.o;
    if (E.stade === 'bebe' && !S[vuKey] && S.tab === 'dragon' && !busy) {
      S[vuKey] = 1; save(); render();
      jouer('eclosion', () => { if (!sondage) nommer(); });
      return;
    }
    if (avant === 'oeuf' && E.stade === 'bebe' && S.tab !== 'dragon') { /* l'éclosion sera jouée à l'ouverture de l'onglet */ }
    if (!busy) render(); else tuile();
  }

  /* ---------- actions ---------- */
  function soin(a) { Sync.put('soin', 'soin:' + me() + ':' + newId(), { o: D.o, a, t: Date.now() }); vib(10); }
  const CLIP = { manger: () => 'manger', sortir: () => E.humeur === 'besoin' ? 'caca' : 'sortir', laver: () => 'bain', soigner: () => 'soigner', calin: () => 'calin', jouer: () => 'jouer' };
  const MOTS = { manger: 'Miam !', sortir: 'Petit vol au-dessus de la grotte', laver: 'Tout propre !', soigner: 'Soin du jour fait', calin: 'Il adore les câlins', jouer: 'Il s\'est bien amusé' };

  function nommer() {
    openSheet('Il est né ! Quel nom ?', `
      <p class="muted">Propose jusqu'à 4 noms : un sondage s'ouvre dans le chat et toute la tribu vote.</p>
      ${[0, 1, 2, 3].map(i => `<input class="input dg-nom" maxlength="20" placeholder="${['Ex. : Plume', 'Ex. : Azur', 'Ex. : Bleuet', 'Un autre nom…'][i]}">`).join('')}
      <button class="primary" data-act="nomok">Lancer le sondage</button>
      <button class="ghost" data-act="plustard">Plus tard</button>`, e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'plustard') { closeSheet(); return; }
      if (b.dataset.act === 'nomok') {
        const opts = [...document.querySelectorAll('.dg-nom')].map(i => i.value.trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);
        if (opts.length < 2) { toast('Il faut au moins 2 noms pour un sondage'); return; }
        Sync.put('sondage', 'sondage:' + me() + ':' + newId(), { q: 'Comment s\'appelle notre dragon ?', opts, at: Date.now(), dragon: D.o });
        closeSheet(); toast('Sondage lancé dans le chat');
      }
    });
  }
  function confirmer(titre, texte, oui, faire) {
    openSheet(titre, `<p class="muted">${texte}</p><button class="primary" data-act="oui">${oui}</button><button class="ghost" data-act="non">Annuler</button>`, e => {
      const b = e.target.closest('button'); if (!b) return;
      closeSheet(); if (b.dataset.act === 'oui') faire();
    });
  }

  function onClick(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.go === 'dragon') { showTab('dragon'); return; }
    const k = b.dataset.dg; if (!k || busy || !E) return;
    if (k === 'rechauffer') {
      soin('rechauffer');
      const reste = ORDRE.filter(m => m !== me() && E.dejaChauffe.indexOf(m) < 0).length;
      if (!reste) { S['dragonEclos_' + D.o] = 1; save(); toast('Toute la tribu l\'a réchauffé… il éclot !'); jouer('eclosion', () => { if (!sondage) nommer(); }); }
      else { toast(`Merci ${nom(me())}, l'œuf se sent bien au chaud.`); jouer('oeuf-chaud'); }
      return;
    }
    if (k === 'deposer') { soin('deposer'); toast(E.depots + 1 >= 3 ? 'Il revient !' : 'Merci, la gamelle sera vide demain matin…'); return; }
    if (k === 'nommer') { nommer(); return; }
    if (k === 'chat') { showTab('chat'); return; }
    if (k === 'vacances') {
      const vacs = (D.vacs || []).slice(), now = Date.now(), cur = vacs.find(v => !v.f);
      if (cur) cur.f = now; else vacs.push({ d: now });
      Sync.put('dragon', 'dragon:courant', { o: D.o, vacs }); toast(cur ? 'Fin des vacances' : 'Mode vacances : tout est en pause'); return;
    }
    if (k === 'recommencer') {
      confirmer('Recommencer à l\'œuf ?', 'Le dragon actuel, son nom et le tableau des soigneurs seront effacés pour toute la tribu. Un nouvel œuf apparaîtra dans le nid.', 'Oui, recommencer', () => {
        Sync.put('dragon', 'dragon:courant', { o: newId(), vacs: [] }); toast('Un nouvel œuf est apparu dans le nid…');
      });
      return;
    }
    if (RG[k]) { const c = CLIP[k](); soin(k); toast(MOTS[k]); jouer(c); }
  }
  $('dragon').addEventListener('click', onClick);
  $('todayDragon').addEventListener('click', onClick);

  Sync.on(kinds => { if (kinds.some(k => ['dragon', 'soin', 'sondage', 'vote', 'auth'].indexOf(k) >= 0)) refresh(); });
  document.addEventListener('tribu:tab', e => { if (e.detail === 'dragon') { boucleActuelle = ''; refresh(); } });
  setInterval(() => { if (document.visibilityState === 'visible' && !busy) refresh(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  refresh();
  window.TribuDragon = { etat: () => E };
})();
