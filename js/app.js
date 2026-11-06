/* Tribu — logique de l'app (v0.2).
   Contient : environnement, onglets, rejoindre la tribu (lien, code, scan), invitations (admin),
   réglages, présence de la tribu, toast « Annuler », hors ligne et mise à jour automatique. */
'use strict';
const VERSION = self.TRIBU_VERSION || '?';
const ENV = window.TRIBU_ENV || 'local';
const Sync = window.TribuSync;
const KEY = 'tribu.' + ENV + '.reglages';
// Les membres (identifiants neutres m1…m4, prénoms, initiales, accord, administrateur) viennent du serveur
// après connexion : aucun prénom n'est écrit dans le code (dépôt public).
const MEMBRES = {};
const ORDRE = [];
function appliquerFamille(f) {
  Object.keys(MEMBRES).forEach(k => delete MEMBRES[k]); ORDRE.length = 0;
  (f || []).slice().sort((a, b) => (a.rang || 0) - (b.rang || 0)).forEach(x => {
    if (!x || !/^m\d+$/.test(x.membre)) return;
    MEMBRES[x.membre] = { nom: x.nom || x.membre, ini: x.ini || String(x.nom || '?').slice(0, 2), genre: x.genre || '', admin: !!x.admin };
    ORDRE.push(x.membre);
  });
}
appliquerFamille(Sync.store.get('famille', []));
const estAdmin = id => !!(id && MEMBRES[id] && MEMBRES[id].admin);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);
const me = () => (Sync.state.auth && Sync.state.auth.membre) || null;
const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/* ================== Réglages locaux ================== */
let S = { theme: 'auto', fs: 1, tab: 'today' };
try { S = Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
function applyLook() {
  const r = document.documentElement;
  if (S.theme === 'auto') delete r.dataset.theme; else r.dataset.theme = S.theme;
  r.dataset.fs = String(S.fs);
  const dark = S.theme === 'sombre' || (S.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.content = dark ? '#1D1615' : '#FFF7F4');
}
function vib(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }
function ago(t) {
  if (!t) return 'jamais';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'à l\'instant';
  const m = Math.round(s / 60); if (m < 60) return 'il y a ' + m + ' min';
  const h = Math.round(m / 60); if (h < 24) return 'il y a ' + h + ' h';
  const d = Math.round(h / 24); return 'il y a ' + d + ' j';
}

/* ================== Onglets ================== */
const TABS = ['today', 'chat', 'agenda', 'map', 'fridge', 'dragon'];
function showTab(t) {
  if (TABS.indexOf(t) < 0) t = 'today';
  S.tab = t; save();
  document.querySelectorAll('[data-screen]').forEach(s => { s.hidden = s.dataset.screen !== t; });
  document.querySelectorAll('[data-tab]').forEach(b => {
    if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('main').scrollTop = 0;
  if (window.onTab) window.onTab(t);
  document.dispatchEvent(new CustomEvent('tribu:tab', { detail: t }));
}
document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]'); if (b) { showTab(b.dataset.tab); vib(6); }
});

/* ================== Accueil ================== */
function greet() {
  const d = new Date(), h = d.getHours();
  const m = me();
  $('hello').textContent = (h >= 5 && h < 18 ? 'Bonjour' : 'Bonsoir') + (m && MEMBRES[m] ? ' ' + MEMBRES[m].nom : '');
  const txt = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('todayDate').textContent = txt.charAt(0).toUpperCase() + txt.slice(1);
}
async function renderTribe() {
  const pres = {};
  try { (await Sync.all('presence')).forEach(p => { pres[p.auteur] = p.maj; }); } catch (e) {}
  $('tribe').innerHTML = ORDRE.map(id => {
    const t = pres[id];
    let st;
    const enLigne = id === me() ? (Sync.state.lastOk && !Sync.state.error) : (t && Date.now() - t < 2 * 60 * 1000);
    const loc = window.TribuCarte && window.TribuCarte.statut(id);
    if (loc) st = (enLigne ? '<i class="dot"></i>' : '') + esc(loc.txt);
    else if (id === me()) st = (enLigne ? '<i class="dot"></i>' : '') + 'C\'est toi';
    else if (!t) st = 'Pas encore connecté·e';
    else if (enLigne) st = '<i class="dot"></i>Dans Tribu en ce moment';
    else st = 'Vu·e ' + ago(t);
    return `<div class="card m-${id}" data-go-map><span class="av">${MEMBRES[id].ini}</span><span class="who"><b>${MEMBRES[id].nom}</b><span>${st}</span></span></div>`;
  }).join('');
}
function renderMe() {
  const b = $('meBtn'), m = me();
  b.className = 'avatar' + (m ? ' m-' + m : '');
  b.textContent = m && MEMBRES[m] ? MEMBRES[m].ini : '?';
  greet();
}

/* ================== Feuilles (réglages, invitations…) ================== */
const sheet = $('sheet'), scrim = $('scrim');
let onSheetClose = null;
function openSheet(title, html, onClick) {
  $('sheetTitle').textContent = title;
  $('sheetBody').innerHTML = html;
  $('sheetBody').onclick = onClick || null;
  sheet.hidden = false; scrim.hidden = false;
}
function closeSheet() {
  sheet.hidden = true; scrim.hidden = true; $('sheetBody').onclick = null;
  if (onSheetClose) { const f = onSheetClose; onSheetClose = null; f(); }
  if (reloadPending) location.reload();
}
$('sheetClose').addEventListener('click', closeSheet);
$('tribe').addEventListener('click', e => { if (e.target.closest('[data-go-map]')) showTab('map'); });
scrim.addEventListener('click', closeSheet);

function syncLabel() {
  const st = Sync.state;
  if (!st.auth) return 'Pas encore dans la tribu';
  if (st.revoked) return 'Accès retiré : demande une nouvelle invitation';
  let t = st.lastOk ? 'Synchronisé ' + ago(st.lastOk) : 'Jamais synchronisé';
  if (st.error) t = 'Hors ligne · dernière synchro ' + ago(st.lastOk);
  if (st.pending) t += ' · ' + st.pending + ' envoi' + (st.pending > 1 ? 's' : '') + ' en attente';
  return t;
}
function settingsSheet() {
  const m = me();
  const seg = (name, items, cur) => `<div class="seg">${items.map(([v, l, st]) => `<button data-${name}="${v}" class="${String(cur) === String(v) ? 'sel' : ''}"${st ? ` style="${st}"` : ''}>${l}</button>`).join('')}</div>`;
  openSheet('Réglages', `
    <div class="row card">
      <span class="av ${m ? 'm-' + m : ''}" style="width:48px;height:48px">${m && MEMBRES[m] ? MEMBRES[m].ini : '?'}</span>
      <span class="grow"><b>${m && MEMBRES[m] ? MEMBRES[m].nom : 'Invité'}</b><span id="syncInfo">${esc(syncLabel())}</span></span>
    </div>
    ${m && window.TribuProfil ? `<div class="row"><button class="small grow" data-act="photo">${TribuProfil.aUnePhoto(m) ? 'Changer ma photo' : 'Ajouter ma photo'}</button>${TribuProfil.aUnePhoto(m) ? '<button class="small" data-act="nophoto">Retirer</button>' : ''}</div>` : ''}
    ${estAdmin(m) ? '<button class="primary" data-act="invite">Inviter la famille</button>' : ''}
    ${m ? '<div class="field"><span class="label">Notifications</span><div class="notif" id="notifBox"></div></div>' : ''}
    <div class="field"><span class="label">Thème</span>${seg('theme', [['auto', 'Auto'], ['clair', 'Clair'], ['sombre', 'Sombre']], S.theme)}</div>
    <div class="field"><span class="label">Taille du texte</span>${seg('fs', [[0, 'A', 'font-size:14px'], [1, 'A', 'font-size:17px'], [2, 'A', 'font-size:21px']], S.fs)}</div>
    <button class="ghost" data-act="upd">Rechercher une mise à jour</button>
    <p class="muted center" id="updInfo">Tribu v${VERSION}${ENV !== 'prod' ? ' · ' + ENV.toUpperCase() : ''}</p>
    ${m ? '<button class="ghost danger" data-act="leave">Quitter la tribu sur ce téléphone</button>' : ''}
  `, e => {
    const b = e.target.closest('button'); if (!b || b.closest('#notifBox')) return;
    if (b.dataset.theme) { S.theme = b.dataset.theme; save(); applyLook(); mark(b); }
    else if (b.dataset.fs != null) { S.fs = +b.dataset.fs; save(); applyLook(); mark(b); }
    else if (b.dataset.act === 'upd') checkUpdate($('updInfo'));
    else if (b.dataset.act === 'invite') inviteSheet();
    else if (b.dataset.act === 'photo') TribuProfil.editer();
    else if (b.dataset.act === 'nophoto') { TribuProfil.retirer(); closeSheet(); }
    else if (b.dataset.act === 'leave') {
      if (confirm('Quitter la tribu sur ce téléphone ? Les données locales seront effacées. Il faudra une nouvelle invitation pour revenir.')) {
        Sync.leave().then(() => { closeSheet(); showJoin(); });
      }
    }
  });
  function mark(b) { b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); }
  if (m && window.TribuNotif) window.TribuNotif.mount($('notifBox'));
}
$('meBtn').addEventListener('click', settingsSheet);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyLook);

/* ================== Invitations (réservé à l'administrateur) ================== */
async function inviteSheet() {
  openSheet('Inviter la famille', '<p class="note">Chargement…</p>');
  let liste;
  try { liste = (await Sync.admin('liste')).membres || []; }
  catch (err) { $('sheetBody').innerHTML = `<p class="note">${esc(err.message)}</p>`; return; }
  const actif = {}; liste.forEach(x => { actif[x.membre] = x.actif; });
  const rows = ORDRE.filter(id => !estAdmin(id)).map(id => `
    <div class="row card m-${id}">
      <span class="av">${MEMBRES[id].ini}</span>
      <span class="grow"><b>${MEMBRES[id].nom}</b><span>${actif[id] ? 'Invitation active' : 'Pas encore invité·e'}</span></span>
      ${actif[id] ? `<button class="small" data-rev="${id}">Retirer</button>` : ''}
      <button class="small acc" data-inv="${id}">${actif[id] ? 'Nouveau QR' : 'Inviter'}</button>
    </div>`).join('');
  $('sheetBody').innerHTML = rows + '<p class="note">Chaque invitation est personnelle. « Nouveau QR » remplace l\'ancienne invitation : l\'ancien code ne marche plus. « Retirer » coupe l\'accès de ce téléphone.</p>';
  $('sheetBody').onclick = async e => {
    const inv = e.target.closest('[data-inv]'), rev = e.target.closest('[data-rev]');
    if (inv) {
      const id = inv.dataset.inv;
      if (actif[id] && !confirm('Créer une nouvelle invitation pour ' + MEMBRES[id].nom + ' ? Son téléphone actuel sera déconnecté.')) return;
      inv.disabled = true; inv.textContent = '…';
      try { const r = await Sync.admin('inviter', id); showInvite(id, r.jeton); }
      catch (err) { toast(err.message); inv.disabled = false; inv.textContent = 'Inviter'; }
    } else if (rev) {
      const id = rev.dataset.rev;
      if (!confirm('Retirer l\'accès de ' + MEMBRES[id].nom + ' ?')) return;
      try { await Sync.admin('revoquer', id); toast('Accès retiré pour ' + MEMBRES[id].nom); inviteSheet(); }
      catch (err) { toast(err.message); }
    }
  };
}
function showInvite(id, jeton) {
  const link = appUrl() + '#jeton=' + jeton;
  openSheet('Invitation de ' + MEMBRES[id].nom, `
    <div class="qr">${window.TribuQR.svg(link, { ink: '#2B2320', bg: '#FFFFFF' })}</div>
    <p class="note center">${esc(MEMBRES[id].nom)} scanne ce QR code avec l'appareil photo de son téléphone, puis suit les indications.</p>
    <div class="row">
      <button class="small acc" style="flex:1" data-act="share">Envoyer le lien</button>
      <button class="small" style="flex:1" data-act="copy">Copier le code</button>
    </div>
    <div class="code">${esc(jeton)}</div>
    <p class="note">Ce QR code et ce code donnent accès à la tribu : montre-les seulement à ${esc(MEMBRES[id].nom)}.</p>
    <button class="ghost" data-act="back">Retour aux invitations</button>
  `, async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'share') {
      if (navigator.share) { try { await navigator.share({ title: 'Rejoins la tribu', text: 'Ton invitation pour Tribu :', url: link }); } catch (err) {} }
      else copy(link, 'Lien copié');
    } else if (b.dataset.act === 'copy') copy(jeton, 'Code copié');
    else if (b.dataset.act === 'back') inviteSheet();
  });
}
function copy(text, msg) {
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(msg), () => toast('Copie impossible : sélectionne le code à la main'));
}

/* ================== Rejoindre la tribu ================== */
function extractCode(v) {
  v = String(v || '').trim();
  const m = v.match(/jeton=([A-Za-z0-9_-]{16,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{16,}$/.test(v) ? v : '';
}
function showJoin(msg) {
  $('join').hidden = false;
  $('joinErr').textContent = msg || '';
  $('scanBtn').hidden = !('BarcodeDetector' in window && navigator.mediaDevices);
}
async function doJoin(code) {
  const err = $('joinErr'); err.textContent = '';
  if (!code) { err.textContent = 'Ce n\'est pas un lien ou un code d\'invitation valable.'; return; }
  $('joinBtn').disabled = true; $('joinBtn').textContent = 'Connexion…';
  try {
    const m = await Sync.join(code);
    $('join').hidden = true;
    renderMe(); renderTribe();
    afterJoin(m, code);
  } catch (e) {
    err.textContent = e.message;
    $('joinText').textContent = 'Scanne le QR code d\'invitation avec l\'appareil photo, ou colle ici le lien ou le code reçu.';
  } finally {
    $('joinBtn').disabled = false; $('joinBtn').textContent = 'Rejoindre';
  }
}
function afterJoin(m, code) {
  const nom = MEMBRES[m] ? MEMBRES[m].nom : m;
  if (standalone()) { toast('Bienvenue dans la tribu, ' + nom + ' !'); return; }
  // Ouvert dans le navigateur (lien ou QR) : expliquer la suite selon le téléphone.
  openSheet('Bienvenue, ' + nom + ' !', isIOS() ? `
    <p class="note">Dernière étape pour avoir Tribu sur ton iPhone :</p>
    <p class="note">1. Touche <b>Partager</b> (le carré avec une flèche), puis <b>Sur l'écran d'accueil</b>, puis <b>Ajouter</b>.</p>
    <p class="note">2. Ouvre <b>Tribu</b> depuis ton écran d'accueil.</p>
    <p class="note">3. Colle ce code quand Tribu te le demande :</p>
    <div class="code">${esc(code)}</div>
    <button class="primary" data-act="copy">Copier le code</button>
  ` : `
    <p class="note">Tu es connecté·e à la tribu sur ce téléphone.</p>
    <p class="note">Si Tribu n'est pas encore installée : menu <b>⋮</b> de Chrome, puis <b>Ajouter à l'écran d'accueil</b>, puis <b>Installer</b>. Ensuite, ouvre Tribu depuis son icône.</p>
    <p class="note">Si elle est déjà installée, ouvre-la simplement depuis son icône : tu y seras reconnu·e.</p>
    <button class="primary" data-act="ok">Compris</button>
  `, e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'copy') copy(code, 'Code copié'); else closeSheet();
  });
}
$('joinBtn').addEventListener('click', () => doJoin(extractCode($('joinCode').value)));
$('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(extractCode($('joinCode').value)); });

// Scanner un QR code dans l'app (Android/Chrome : BarcodeDetector)
let scanStream = null;
$('scanBtn').addEventListener('click', async () => {
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (e) { $('joinErr').textContent = 'Accès à l\'appareil photo refusé.'; return; }
  $('join').hidden = true;
  openSheet('Scanner l\'invitation', '<video class="scan" id="scanVideo" playsinline muted></video><p class="note center">Vise le QR code affiché sur le téléphone de la personne qui t\'invite.</p>');
  const v = $('scanVideo'); v.srcObject = scanStream; await v.play().catch(() => {});
  const det = new window.BarcodeDetector({ formats: ['qr_code'] });
  let stop = false;
  onSheetClose = () => { stop = true; if (scanStream) scanStream.getTracks().forEach(t => t.stop()); scanStream = null; if (!me()) showJoin(); };
  (async function loop() {
    if (stop) return;
    try {
      const codes = await det.detect(v);
      const c = codes.length && extractCode(codes[0].rawValue);
      if (c) { vib(20); closeSheet(); doJoin(c); return; }
    } catch (e) {}
    setTimeout(loop, 250);
  })();
});

/* ================== Toast « Annuler » (5 s) ================== */
let tTimer = null, tUndo = null;
const toastEl = $('toast');
function toast(msg, undo) {
  clearTimeout(tTimer); tUndo = undo || null;
  $('toastMsg').textContent = msg;
  $('toastUndo').hidden = !undo;
  toastEl.classList.add('on');
  tTimer = setTimeout(() => { toastEl.classList.remove('on'); tUndo = null; }, 5000);
}
$('toastUndo').addEventListener('click', () => {
  if (tUndo) { tUndo(); tUndo = null; vib(10); }
  clearTimeout(tTimer); toastEl.classList.remove('on');
});

/* ================== Synchro → écran ================== */
Sync.on(kinds => {
  if (kinds.indexOf('auth') >= 0) {
    renderMe();
    if (Sync.state.revoked) showJoin('Ton accès a été retiré ou remplacé. Demande une nouvelle invitation à l\'administrateur de la tribu.');
    else if (!me()) showJoin();
  }
  if (kinds.indexOf('presence') >= 0 || kinds.indexOf('sync') >= 0) renderTribe();
  const si = $('syncInfo'); if (si) si.textContent = syncLabel();
});
setInterval(() => { if (document.visibilityState === 'visible' && me()) renderTribe(); }, 30000);

/* ================== Hors ligne & mises à jour ================== */
let swReg = null, reloadPending = false;
function applyUpdate() { if (!sheet.hidden) { reloadPending = true; return; } location.reload(); }
async function checkUpdate(out) {
  if (!swReg) { if (out) out.textContent = 'Mises à jour indisponibles ici.'; return; }
  if (out) out.textContent = 'Recherche…';
  try { await swReg.update(); } catch (e) { if (out) out.textContent = 'Pas de réseau. Tribu v' + VERSION; return; }
  setTimeout(() => { if (out && !swReg.installing && !swReg.waiting) out.textContent = 'Tribu v' + VERSION + ' est à jour.'; }, 1500);
}
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => { swReg = r; }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) applyUpdate(); });
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'open-tab') showTab(e.data.tab); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && swReg) swReg.update().catch(() => {}); });
}
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

/* ================== Démarrage ================== */
if (ENV !== 'prod') { const t = $('envTag'); t.textContent = ENV.toUpperCase(); t.hidden = false; t.classList.add('env-' + ENV); }
applyLook(); renderMe();
const hashCode = extractCode(location.hash);
const hashTab = (location.hash || '').slice(1);
if (hashCode) history.replaceState(null, '', location.pathname);   // le code ne reste pas dans l'adresse
showTab(TABS.indexOf(hashTab) >= 0 ? hashTab : S.tab);
if (hashCode) { showJoin(); $('joinText').textContent = 'Connexion avec ton invitation…'; doJoin(hashCode); }
else if (!me()) showJoin();
else { renderTribe(); Sync.sync(); }
if (S.lastV && S.lastV !== VERSION) S.updNote = VERSION;
S.lastV = VERSION; save();
if (S.updNote === VERSION) setTimeout(() => { toast('Tribu mis à jour (v' + VERSION + ')'); setTimeout(() => { delete S.updNote; save(); }, 4000); }, 500);
