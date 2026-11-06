/* Tribu — Carte : où est la tribu.
   - Fond de carte OpenStreetMap (assombri en thème sombre), affiché par un petit module maison (sans bibliothèque).
   - Position envoyée à l'ouverture de Tribu, puis toutes les 5 min tant qu'elle reste ouverte (si le partage est activé sur ce téléphone).
   - Une seule position par membre (aucun historique), mode discret, lieux clés placés sur la carte, « Je suis bien arrivé·e ».
   Données synchronisées :
   - pos  uid pos:<membre>  { lat, lng, acc, t, discret }
   - lieu uid lieu:<id>     { nom, lat, lng, r, cree } */
(function () {
  'use strict';
  const TILE = 256, ZMIN = 3, ZMAX = 19, RAYON = 150, EVERY = 5 * 60 * 1000;
  const GENRE = new Proxy({}, { get: (_, id) => (MEMBRES[id] && MEMBRES[id].genre) || '' });
  const SUGG = ['Maison', 'Collège', 'Lycée', 'Bureau', 'Stade'];
  const nom = id => (MEMBRES[id] || { nom: id }).nom;
  const ini = id => (MEMBRES[id] || { ini: '?' }).ini;
  let pos = {}, lieux = [];
  let view = null;              // { lat, lng, z }
  let placing = null;           // nom du lieu en cours de placement
  let lastSent = 0;

  /* ---------- Géométrie (Web Mercator) ---------- */
  const project = (lat, lng, z) => {
    const s = TILE * Math.pow(2, z), sin = Math.sin(lat * Math.PI / 180);
    return { x: (lng + 180) / 360 * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s };
  };
  const unproject = (x, y, z) => {
    const s = TILE * Math.pow(2, z), n = Math.PI - 2 * Math.PI * y / s;
    return { lat: 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng: x / s * 360 - 180 };
  };
  const dist = (a, b) => {   // mètres
    const R = 6371000, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r;
    const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const nearest = p => {
    let best = null, d = Infinity;
    lieux.forEach(l => { const x = dist(p, l.data); if (x < (l.data.r || RAYON) && x < d) { d = x; best = l; } });
    return best;
  };

  /* ---------- Données ---------- */
  async function load() {
    const [p, l] = await Promise.all([Sync.all('pos'), Sync.all('lieu')]);
    pos = {}; p.forEach(x => { pos[x.uid.slice(4)] = x; });
    lieux = l.sort((a, b) => String(a.data.nom).localeCompare(String(b.data.nom)));
  }
  function statut(id) {
    const p = pos[id];
    if (!p) return null;
    if (p.data.discret) return { txt: 'Position masquée', masque: true };
    if (typeof p.data.lat !== 'number') return null;
    const l = nearest(p.data);
    return { txt: (l ? l.data.nom : 'Position partagée') + ' · ' + ago(p.data.t), lieu: l, p: p.data };
  }
  const myDiscret = () => !!(pos[me()] && pos[me()].data.discret);

  /* ---------- Envoi de ma position ---------- */
  function geoOn() { return S.geo === 'on' && 'geolocation' in navigator; }
  // Si le téléphone autorise déjà la position, le partage se rétablit tout seul (après une mise à jour, un effacement…).
  if (S.geo !== 'on' && 'geolocation' in navigator && navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then(p => {
      if (p.state === 'granted') { S.geo = 'on'; save(); renderAsk(); setTimeout(() => sendPosition(true), 2000); }
    }).catch(() => {});
  }
  function sendPosition(force) {
    if (!me() || !geoOn() || myDiscret()) return;
    if (!force && Date.now() - lastSent < EVERY - 5000) return;
    lastSent = Date.now();
    navigator.geolocation.getCurrentPosition(g => {
      Sync.put('pos', 'pos:' + me(), { lat: +g.coords.latitude.toFixed(6), lng: +g.coords.longitude.toFixed(6), acc: Math.round(g.coords.accuracy || 0), t: Date.now(), discret: false });
    }, err => {
      if (err.code === 1) { S.geo = 'refus'; save(); renderAsk(); }
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
  }
  setInterval(() => { if (document.visibilityState === 'visible') sendPosition(false); }, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sendPosition(false); });

  /* ---------- Carte ---------- */
  const map = $('map'), tilesEl = $('mapTiles'), marksEl = $('mapMarks');
  const tiles = new Map();
  function dark() {
    const t = document.documentElement.dataset.theme;
    return t === 'sombre' || (!t && matchMedia('(prefers-color-scheme: dark)').matches);
  }
  // Tuiles standard d'OpenStreetMap (gratuites, sans clé, usage léger ; règlement : operations.osmfoundation.org/policies/tiles).
  // En thème sombre, la même carte est assombrie par un filtre CSS (classe .dark sur la carte).
  function tileUrl(z, x, y) { return 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png'; }
  function frame() {
    const w = map.clientWidth, h = map.clientHeight, c = project(view.lat, view.lng, view.z);
    return { w, h, left: c.x - w / 2, top: c.y - h / 2 };
  }
  function render() {
    if (!view || !map.clientWidth) return;
    map.classList.toggle('dark', dark());
    const f = frame(), z = view.z, n = Math.pow(2, z);
    const keep = new Set();
    for (let ty = Math.floor(f.top / TILE); ty <= Math.floor((f.top + f.h) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(f.left / TILE); tx <= Math.floor((f.left + f.w) / TILE); tx++) {
        const wx = ((tx % n) + n) % n, key = z + '/' + tx + '/' + ty;
        keep.add(key);
        let img = tiles.get(key);
        if (!img) {
          img = new Image(); img.crossOrigin = 'anonymous'; img.alt = ''; img.draggable = false;
          img.className = 'tile'; img.onerror = () => { img.style.visibility = 'hidden'; }; img.src = tileUrl(z, wx, ty);
          tilesEl.appendChild(img); tiles.set(key, img);
        }
        img.style.transform = 'translate(' + Math.round(tx * TILE - f.left) + 'px,' + Math.round(ty * TILE - f.top) + 'px)';
      }
    }
    tiles.forEach((img, key) => { if (!keep.has(key)) { img.remove(); tiles.delete(key); } });
    // Marqueurs : lieux puis membres
    let html = '';
    lieux.forEach(l => {
      const p = project(l.data.lat, l.data.lng, z);
      html += `<button class="mk-lieu" data-lieu="${esc(l.uid)}" style="transform:translate(${Math.round(p.x - f.left)}px,${Math.round(p.y - f.top)}px)"><span>${esc(l.data.nom)}</span></button>`;
    });
    ORDRE.forEach(id => {
      const s = statut(id); if (!s || s.masque) return;
      const p = project(s.p.lat, s.p.lng, z);
      html += `<button class="mk m-${id}" data-mk="${id}" style="transform:translate(${Math.round(p.x - f.left)}px,${Math.round(p.y - f.top)}px)" aria-label="${esc(nom(id))}"><span><b>${ini(id)}</b></span></button>`;
    });
    marksEl.innerHTML = html;
  }
  function points() {
    const pts = [];
    ORDRE.forEach(id => { const s = statut(id); if (s && s.p) pts.push(s.p); });
    lieux.forEach(l => pts.push(l.data));
    return pts;
  }
  function fit() {
    const pts = points();
    if (!pts.length) { view = view || { lat: 46.6, lng: 2.4, z: 5 }; render(); return; }
    if (pts.length === 1) { view = { lat: pts[0].lat, lng: pts[0].lng, z: 15 }; render(); return; }
    const w = map.clientWidth - 80, h = map.clientHeight - 80;
    let z = ZMAX;
    for (; z > ZMIN; z--) {
      const ps = pts.map(p => project(p.lat, p.lng, z));
      const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
      if (Math.max(...xs) - Math.min(...xs) <= w && Math.max(...ys) - Math.min(...ys) <= h) break;
    }
    z = Math.min(z, 16);
    const ps = pts.map(p => project(p.lat, p.lng, z));
    const cx = (Math.min(...ps.map(p => p.x)) + Math.max(...ps.map(p => p.x))) / 2;
    const cy = (Math.min(...ps.map(p => p.y)) + Math.max(...ps.map(p => p.y))) / 2;
    const c = unproject(cx, cy, z);
    view = { lat: c.lat, lng: c.lng, z };
    render();
  }
  function zoomAt(dz, mx, my) {
    const z2 = Math.max(ZMIN, Math.min(ZMAX, view.z + dz)); if (z2 === view.z) return;
    const f = frame();
    if (mx == null) { mx = f.w / 2; my = f.h / 2; }
    const m = unproject(f.left + mx, f.top + my, view.z);
    const p = project(m.lat, m.lng, z2);
    const c = unproject(p.x - mx + f.w / 2, p.y - my + f.h / 2, z2);
    view = { lat: c.lat, lng: c.lng, z: z2 };
    render();
  }

  /* ---------- Gestes : glisser, pincer, double toucher, molette ---------- */
  const ptrs = new Map();
  let g = null;   // geste en cours
  map.addEventListener('pointerdown', e => {
    if (e.target.closest('.map-ctl') || e.target.closest('.map-banner') || e.target.closest('.attrib')) return;
    map.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = map.getBoundingClientRect();
    if (ptrs.size === 1) g = { mode: 'pan', sx: e.clientX, sy: e.clientY, view: Object.assign({}, view), t: Date.now(), target: e.target, moved: false, r };
    else if (ptrs.size === 2) {
      const [a, b] = Array.from(ptrs.values());
      g = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, scale: 1, r };
    }
  });
  map.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId) || !g) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.mode === 'pan') {
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true;
      const c = project(g.view.lat, g.view.lng, g.view.z);
      const n = unproject(c.x - dx, c.y - dy, g.view.z);
      view = { lat: n.lat, lng: n.lng, z: g.view.z };
      render();
    } else if (g.mode === 'pinch' && ptrs.size === 2) {
      const [a, b] = Array.from(ptrs.values());
      g.scale = Math.hypot(a.x - b.x, a.y - b.y) / g.d0;
      const t = 'translate(' + g.mx + 'px,' + g.my + 'px) scale(' + g.scale + ') translate(' + (-g.mx) + 'px,' + (-g.my) + 'px)';
      tilesEl.style.transform = t; marksEl.style.transform = t;
    }
  });
  function endPtr(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (!g) return;
    if (g.mode === 'pinch') {
      tilesEl.style.transform = ''; marksEl.style.transform = '';
      const dz = Math.round(Math.log2(g.scale || 1));
      if (dz) zoomAt(dz, g.mx, g.my); else render();
      g = null; return;
    }
    if (g.mode === 'pan' && !g.moved && Date.now() - g.t < 350) onTap(e, g);
    g = null;
  }
  map.addEventListener('pointerup', endPtr);
  map.addEventListener('pointercancel', endPtr);
  map.addEventListener('wheel', e => { e.preventDefault(); const r = map.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  let lastTap = 0;
  function onTap(e, gg) {
    const r = gg.r, mx = e.clientX - r.left, my = e.clientY - r.top;
    if (placing) {
      const f = frame(), ll = unproject(f.left + mx, f.top + my, view.z);
      addLieu(placing, ll.lat, ll.lng); return;
    }
    const mk = gg.target.closest && gg.target.closest('[data-mk]');
    if (mk) return memberSheet(mk.dataset.mk);
    const lk = gg.target.closest && gg.target.closest('[data-lieu]');
    if (lk) return lieuSheet(lk.dataset.lieu);
    if (Date.now() - lastTap < 300) { zoomAt(1, mx, my); lastTap = 0; } else lastTap = Date.now();
  }
  $('mapCtl').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !view) return;
    if (b.dataset.z) zoomAt(+b.dataset.z); else if (b.dataset.fit != null) fit();
  });
  addEventListener('resize', () => render());

  /* ---------- Listes et boutons ---------- */
  function renderAsk() {
    const box = $('geoAsk');
    if (!('geolocation' in navigator)) { box.innerHTML = '<p class="note">Ce téléphone ne permet pas la localisation.</p>'; return; }
    if (S.geo === 'on') { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="card ask">
      <b>Partager ma position avec la tribu</b>
      <span>Ta position est envoyée quand tu ouvres Tribu, puis toutes les 5 min tant qu'elle reste ouverte. Seule la dernière est gardée, sans historique. Tu peux la masquer à tout moment (mode discret).</span>
      ${S.geo === 'refus' ? '<span class="danger">La localisation est refusée pour Tribu. Autorise-la dans les réglages du téléphone (Applications → Tribu T → Autorisations → Position), puis réessaie.</span>' : ''}
      <button class="primary" data-act="geo">Partager ma position</button></div>`;
  }
  function renderList() {
    $('mapList').innerHTML = ORDRE.map(id => {
      const s = statut(id);
      const txt = s ? s.txt : (id === me() && S.geo !== 'on' ? 'Partage non activé sur ce téléphone' : 'Position inconnue');
      const can = s && s.p && id !== me();
      return `<div class="rp card m-${id}">
        <span class="av">${ini(id)}</span>
        <span class="rp-txt"><b>${esc(nom(id))}${id === me() ? ' (toi)' : ''}</b><span>${esc(txt)}</span></span>
        ${can ? `<button class="small" data-route="${id}">Itinéraire</button>` : ''}
        ${s && s.p ? `<button class="ev-act" data-voir="${id}" aria-label="Voir sur la carte"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></button>` : ''}
      </div>`;
    }).join('');
    const d = myDiscret();
    $('discret').setAttribute('aria-pressed', String(d));
    $('discret').querySelector('.sw').classList.toggle('on', d);
    const mine = statut(me());
    $('geoInfo').textContent = S.geo !== 'on' ? '' : d ? 'Mode discret : ta position est masquée pour toute la tribu.'
      : mine && mine.p ? 'Ta position a été mise à jour ' + ago(mine.p.t) + (mine.p.acc ? ' (précision ± ' + mine.p.acc + ' m)' : '') + '.' : 'Recherche de ta position…';
    $('arrive').disabled = !(mine && mine.p) || d;
  }
  function routeTo(lat, lng) {
    const url = isIOS() ? 'https://maps.apple.com/?daddr=' + lat + ',' + lng : 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng;
    window.open(url, '_blank');
  }
  function memberSheet(id) {
    const s = statut(id); if (!s || !s.p) return;
    openSheet(nom(id), `<p class="note">${esc(s.txt)}${s.p.acc ? ' · précision ± ' + s.p.acc + ' m' : ''}</p>
      ${id !== me() ? '<button class="primary" data-act="route">Itinéraire pour y aller</button>' : ''}`, e => {
      if (e.target.closest('[data-act="route"]')) routeTo(s.p.lat, s.p.lng);
    });
  }
  function lieuSheet(uid) {
    const l = lieux.find(x => x.uid === uid); if (!l) return;
    const ici = ORDRE.filter(id => { const s = statut(id); return s && s.lieu && s.lieu.uid === uid; });
    openSheet(l.data.nom, `<p class="note">${ici.length ? 'En ce moment : ' + ici.map(nom).join(', ') : 'Personne en ce moment.'}</p>
      <button class="primary" data-act="route">Itinéraire</button>
      <button class="ghost danger" data-act="del">Supprimer ce lieu</button>`, e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'route') routeTo(l.data.lat, l.data.lng);
      else { const keep = Object.assign({}, l.data); Sync.remove('lieu', uid); closeSheet(); toast('Lieu supprimé', () => Sync.put('lieu', uid, keep)); }
    });
  }
  function addLieu(n, lat, lng) {
    placing = null; $('mapBanner').hidden = true;
    Sync.put('lieu', 'lieu:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), { nom: n, lat: +lat.toFixed(6), lng: +lng.toFixed(6), r: RAYON, cree: me() });
    toast('Lieu « ' + n + ' » enregistré');
  }
  function lieuxSheet() {
    openSheet('Lieux de la tribu', `
      ${lieux.length ? lieux.map(l => `<div class="row card"><span class="grow"><b>${esc(l.data.nom)}</b><span>Rayon ${l.data.r || RAYON} m</span></span>
        <button class="small" data-dellieu="${esc(l.uid)}">Supprimer</button></div>`).join('') : '<p class="note">Aucun lieu pour l\'instant.</p>'}
      <label class="label" for="lieuNom">Nouveau lieu</label>
      <input class="input" id="lieuNom" maxlength="40" placeholder="Ex. : Maison">
      <div class="row wrap">${SUGG.filter(s => !lieux.some(l => l.data.nom === s)).map(s => `<button class="chip" data-sugg="${s}">${s}</button>`).join('')}</div>
      <div class="row"><button class="small acc" style="flex:1" data-act="ici">Là où je suis</button><button class="small" style="flex:1" data-act="carte">Toucher la carte</button></div>
      <p class="note">« Là où je suis » utilise ta position actuelle. « Toucher la carte » : touche ensuite l'emplacement exact sur la carte. Quelqu'un à moins de ${RAYON} m d'un lieu y est considéré comme arrivé.</p>
      <p class="join-err" id="lieuErr"></p>`, e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.sugg) { $('lieuNom').value = b.dataset.sugg; return; }
      if (b.dataset.dellieu) { const l = lieux.find(x => x.uid === b.dataset.dellieu); if (l) { const keep = Object.assign({}, l.data); Sync.remove('lieu', l.uid); toast('Lieu supprimé', () => Sync.put('lieu', l.uid, keep)); } closeSheet(); return; }
      const n = $('lieuNom').value.trim();
      if (!n) { $('lieuErr').textContent = 'Donne un nom au lieu.'; return; }
      if (b.dataset.act === 'ici') {
        b.disabled = true; b.textContent = 'Localisation…';
        navigator.geolocation.getCurrentPosition(g2 => { closeSheet(); addLieu(n, g2.coords.latitude, g2.coords.longitude); },
          () => { $('lieuErr').textContent = 'Position introuvable. Essaie « Toucher la carte ».'; b.disabled = false; b.textContent = 'Là où je suis'; },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
      } else if (b.dataset.act === 'carte') {
        closeSheet(); placing = n;
        $('mapBanner').innerHTML = 'Touche la carte à l\'emplacement de « ' + esc(n) + ' » <button class="link" data-act="annuler">Annuler</button>';
        $('mapBanner').hidden = false;
        $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }
  $('mapBanner').addEventListener('click', e => { if (e.target.closest('[data-act="annuler"]')) { placing = null; $('mapBanner').hidden = true; } });

  $('carte').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.closest('#map')) return;
    if (b.dataset.act === 'geo') {
      b.disabled = true; b.textContent = 'Autorisation…';
      navigator.geolocation.getCurrentPosition(() => { S.geo = 'on'; save(); renderAsk(); sendPosition(true); },
        err => { S.geo = err.code === 1 ? 'refus' : S.geo; save(); renderAsk(); if (err.code !== 1) toast('Position introuvable pour le moment'); },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
    } else if (b.dataset.route) { const s = statut(b.dataset.route); if (s && s.p) routeTo(s.p.lat, s.p.lng); }
    else if (b.dataset.voir) { const s = statut(b.dataset.voir); if (s && s.p) { view = { lat: s.p.lat, lng: s.p.lng, z: Math.max(view ? view.z : 15, 16) }; render(); } }
    else if (b.id === 'discret') {
      if (myDiscret()) { Sync.put('pos', 'pos:' + me(), { discret: false, t: Date.now() }); toast('Position de nouveau partagée'); setTimeout(() => sendPosition(true), 300); }
      else { Sync.put('pos', 'pos:' + me(), { discret: true, t: Date.now() }); toast('Mode discret : ta position est masquée'); }
    } else if (b.id === 'arrive') {
      const s = statut(me()); if (!s || !s.p) return;
      const txt = nom(me()) + ' est bien arrivé' + (GENRE[me()] || '') + (s.lieu ? ' · ' + s.lieu.data.nom : '');
      Sync.put('msg', 'msg:' + me() + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), { t: txt, at: Date.now(), sys: true });
      toast('La tribu est prévenue'); vib(15);
    } else if (b.id === 'lieuxBtn') lieuxSheet();
  });

  async function refresh() {
    if (!me()) return;
    await load();
    renderAsk(); renderList();
    if (S.tab === 'map') { if (!view) fit(); else render(); }
    if (typeof renderTribe === 'function') renderTribe();
  }
  document.addEventListener('tribu:tab', e => { if (e.detail === 'map') { renderAsk(); renderList(); setTimeout(() => { if (!view) fit(); else render(); }, 30); sendPosition(false); } });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());
  new MutationObserver(() => render()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  Sync.on(kinds => { if (kinds.some(k => ['pos', 'lieu', 'auth'].indexOf(k) >= 0)) refresh(); });

  window.TribuCarte = { statut };
  refresh();
  setTimeout(() => sendPosition(true), 1500);
})();
