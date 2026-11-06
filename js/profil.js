/* Tribu — photo de profil.
   Donnée synchronisée : profil  uid profil:<membre>  { img (JPEG 256 px en data URL), at }
   Chacun ne peut changer que la sienne (contrôlé aussi par le serveur).
   Affichage : une feuille de style générée remplace les initiales par la photo partout
   où un avatar porte la classe du membre (.av.m-x, .avatar.m-x, cartes .m-x .av, épingles de carte). */
(function () {
  'use strict';
  const TAILLE = 256;
  let photos = {};

  async function load() {
    photos = {};
    (await Sync.all('profil')).forEach(p => { if (p.data && p.data.img && /^data:image\/jpeg;base64,/.test(p.data.img)) photos[p.uid.slice(7)] = p.data.img; });
    css();
  }
  function css() {
    let el = document.getElementById('profilCss');
    if (!el) { el = document.createElement('style'); el.id = 'profilCss'; document.head.appendChild(el); }
    el.textContent = Object.keys(photos).filter(id => MEMBRES[id]).map(id => {
      const u = `url("${photos[id]}")`, c = `m-${id}`;
      return `.av.${c},.avatar.${c},.${c} .av:not([class*="m-"]){background-image:${u};background-size:cover;background-position:center;color:transparent!important;font-size:0}
.mk.${c} b{width:30px;height:30px;border-radius:50%;background:${u} center/cover;color:transparent;font-size:0}`;
    }).join('\n');
  }
  const aUnePhoto = id => !!photos[id];

  /* ---------- Recadrage : glisser pour déplacer, pincer ou curseur pour zoomer ---------- */
  function editer() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = () => { const f = input.files && input.files[0]; if (f) ouvrir(f); };
    input.click();
  }
  function ouvrir(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => recadrer(img, url);
    img.onerror = () => { URL.revokeObjectURL(url); toast('Impossible de lire cette image'); };
    img.src = url;
  }
  function recadrer(img, url) {
    const V = 260; // taille de l'aperçu à l'écran
    openSheet('Ma photo de profil', `
      <div class="crop"><canvas id="cropCv" width="${V * 2}" height="${V * 2}" style="width:${V}px;height:${V}px"></canvas><span class="crop-ring"></span></div>
      <p class="muted center">Fais glisser la photo pour la placer, pince ou utilise le curseur pour zoomer.</p>
      <input type="range" id="cropZoom" min="1" max="4" step="0.01" value="1" aria-label="Zoom">
      <button class="primary" data-act="ok">Enregistrer ma photo</button>
      <button class="ghost" data-act="non">Annuler</button>`, e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'non') { fin(); closeSheet(); }
      else if (b.dataset.act === 'ok') { enregistrer(); }
    });
    const cv = $('cropCv'), ctx = cv.getContext('2d'), zoomIn = $('cropZoom');
    const base = Math.max(V / img.width, V / img.height); // l'image couvre au moins le cercle
    let z = 1, x = 0, y = 0; // décalage en px d'aperçu, depuis le centre
    const borne = () => {
      const w = img.width * base * z, h = img.height * base * z;
      x = Math.max(-(w - V) / 2, Math.min((w - V) / 2, x));
      y = Math.max(-(h - V) / 2, Math.min((h - V) / 2, y));
    };
    const dessiner = (c, taille) => {
      const k = taille / V, w = img.width * base * z * k, h = img.height * base * z * k;
      c.fillStyle = '#fff'; c.fillRect(0, 0, taille, taille);
      c.drawImage(img, (taille - w) / 2 + x * k, (taille - h) / 2 + y * k, w, h);
    };
    const maj = () => { borne(); dessiner(ctx, V * 2); };
    maj();
    zoomIn.oninput = () => { z = +zoomIn.value; maj(); };
    const pts = new Map(); let ref = null;
    cv.style.touchAction = 'none';
    cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); ref = null; };
    cv.onpointermove = e => {
      if (!pts.has(e.pointerId)) return;
      const avant = pts.get(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { x += e.clientX - avant.x; y += e.clientY - avant.y; }
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (ref) { z = Math.max(1, Math.min(4, z * d / ref)); zoomIn.value = z; }
        ref = d;
      }
      maj();
    };
    cv.onpointerup = cv.onpointercancel = e => { pts.delete(e.pointerId); ref = null; };
    cv.onwheel = e => { e.preventDefault(); z = Math.max(1, Math.min(4, z * (e.deltaY < 0 ? 1.08 : 0.93))); zoomIn.value = z; maj(); };

    function fin() { URL.revokeObjectURL(url); }
    function enregistrer() {
      const out = document.createElement('canvas'); out.width = out.height = TAILLE;
      dessiner(out.getContext('2d'), TAILLE);
      let q = 0.85, data = out.toDataURL('image/jpeg', q);
      while (data.length > 45000 && q > 0.4) { q -= 0.1; data = out.toDataURL('image/jpeg', q); }
      fin();
      Sync.put('profil', 'profil:' + me(), { img: data, at: Date.now() });
      closeSheet(); toast('Photo de profil enregistrée');
    }
  }
  function retirer() {
    if (!aUnePhoto(me())) return;
    const avant = photos[me()];
    Sync.remove('profil', 'profil:' + me());
    toast('Photo retirée', () => Sync.put('profil', 'profil:' + me(), { img: avant, at: Date.now() }));
  }

  Sync.on(kinds => { if (kinds.some(k => ['profil', 'auth'].indexOf(k) >= 0)) load(); });
  load();
  window.TribuProfil = { editer, retirer, aUnePhoto };
})();
