/* Tribu — Bip d'urgence et raccourci « Je suis arrivé ».
   - bip uid bip:<membre>:<id>  { pour, at }   → notification prioritaire (répétée 3 fois par le téléphone),
     puis, dès que Tribu est ouverte, une alarme sonore en boucle jusqu'à « Je suis là » (message de la tribu, sys « bip »).
   Limite d'une appli web : un téléphone en silencieux et verrouillé ne fait que vibrer. Pour un téléphone perdu,
   on propose Google Localiser / Localiser d'Apple, qui sonnent à fond même en silencieux. */
(function () {
  'use strict';
  const memb = id => MEMBRES[id] || { nom: id || '?', ini: '?' };
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const FRAIS = 30 * 60 * 1000;   // un bip reste actif 30 min

  /* ---------- Envoyer un bip ---------- */
  function bipSheet(id) {
    const n = memb(id).nom;
    openSheet('Bip d\'urgence', `
      <p class="note">Le téléphone de <b>${esc(n)}</b> reçoit une notification prioritaire répétée, puis une alarme qui sonne dès que Tribu s'ouvre, jusqu'à ce que ${esc(n)} réponde « Je suis là ».</p>
      <button class="primary" data-x="bip">🔔 Faire sonner le téléphone de ${esc(n)}</button>
      <p class="note">En silencieux et verrouillé, son téléphone vibrera seulement. Téléphone perdu dans la maison ? Ces services le font sonner à fond, même en silencieux :</p>
      <a class="ghost lien-btn" href="https://www.google.com/android/find" target="_blank" rel="noopener">Android : Google Localiser mon appareil</a>
      <a class="ghost lien-btn" href="https://www.icloud.com/find" target="_blank" rel="noopener">iPhone : Localiser (iCloud)</a>`, e => {
      if (!e.target.closest('[data-x="bip"]')) return;
      Sync.put('bip', 'bip:' + me() + ':' + newId(), { pour: id, at: Date.now() });
      closeSheet(); toast('🔔 Bip envoyé à ' + n); vib(20);
    });
  }
  // Bouton 🔔 sur les cartes de « La tribu » (capturé avant l'ouverture de la carte).
  $('tribe').addEventListener('click', e => {
    const b = e.target.closest('[data-bip]'); if (!b) return;
    e.stopPropagation(); bipSheet(b.dataset.bip);
  }, true);

  /* ---------- Recevoir un bip : alarme ---------- */
  let ctx = null, boucle = null, actuel = null;
  function son() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      let t = ctx.currentTime + 0.05;
      for (let k = 0; k < 4; k++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = k % 2 ? 1046 : 1318;
        g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.22);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.24); t += 0.3;
      }
    } catch (e) {}
    try { navigator.vibrate && navigator.vibrate([400, 150, 400, 150, 400]); } catch (e) {}
  }
  function alarme(b) {
    if (actuel === b.uid) return;
    actuel = b.uid;
    let el = $('alarme');
    if (!el) { el = document.createElement('div'); el.id = 'alarme'; el.className = 'alarme'; document.body.appendChild(el); }
    el.innerHTML = `<div class="alarme-cloche">🔔</div><h2>${esc(memb(b.auteur).nom)} te cherche !</h2><p>Bip d'urgence · ${ago(b.data.at)}</p>
      <button class="alarme-ok" data-ok>Je suis là</button><small>Touche le bouton pour arrêter l'alarme et prévenir ${esc(memb(b.auteur).nom)}</small>`;
    el.hidden = false;
    el.onclick = ev => { if (ev.target.closest('[data-ok]')) repondre(b); else son(); };
    son(); clearInterval(boucle);
    let n = 0; boucle = setInterval(() => { if (++n > 90) arreter(); else son(); }, 1500);
  }
  function arreter() { clearInterval(boucle); boucle = null; actuel = null; const el = $('alarme'); if (el) el.hidden = true; try { navigator.vibrate && navigator.vibrate(0); } catch (e) {} }
  function repondre(b) {
    arreter();
    S.bipsVus = (S.bipsVus || []).concat(b.uid).slice(-30); save();
    Sync.put('msg', 'msg:' + me() + ':' + newId(), { t: '✅ ' + memb(me()).nom + ' a répondu au bip de ' + memb(b.auteur).nom + ' : « Je suis là »', at: Date.now(), sys: 'bip', bip: b.uid });
    toast(memb(b.auteur).nom + ' est prévenu' + (memb(b.auteur).genre || ''));
  }
  async function verifier() {
    if (!me()) return;
    const [bips, msgs] = await Promise.all([Sync.all('bip'), Sync.all('msg')]);
    const vus = S.bipsVus || [];
    const repondus = new Set(msgs.filter(m => m.data && m.data.sys === 'bip' && m.data.bip).map(m => m.data.bip));
    const b = bips.filter(x => x.data && x.data.pour === me() && Date.now() - (x.data.at || 0) < FRAIS && vus.indexOf(x.uid) < 0 && !repondus.has(x.uid))
      .sort((a, c) => c.data.at - a.data.at)[0];
    if (b) alarme(b); else if (actuel) arreter();
  }
  Sync.on(kinds => { if (kinds.some(k => ['bip', 'msg', 'auth'].indexOf(k) >= 0)) verifier(); });
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'bip') { Sync.sync(); setTimeout(verifier, 1500); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verifier(); });
  setTimeout(verifier, 2500);

  /* ---------- Raccourci « Je suis arrivé » (réglages) ---------- */
  function raccourci() {
    const ios = isIOS();
    const url = Sync.BASE + 'arrive';
    const jeton = (Sync.state.auth && Sync.state.auth.jeton) || '';
    openSheet('Raccourci « Je suis arrivé »', ios ? `
      <p class="note">Sur iPhone, le raccourci se crée dans l'appli <b>Raccourcis</b> d'Apple. Il envoie ta position et « bien arrivé » à la tribu, sans ouvrir Tribu.</p>
      <ol class="guide">
        <li>Ouvre <b>Raccourcis</b>, touche <b>+</b>, nomme-le « Je suis arrivé ».</li>
        <li>Ajoute l'action <b>Obtenir la position actuelle</b>.</li>
        <li>Ajoute <b>Obtenir le contenu de l'URL</b>. URL : colle l'adresse ci-dessous. Touche <b>Afficher plus</b> : Méthode <b>POST</b>, Corps de la requête <b>JSON</b>, puis ajoute 3 champs texte :
          <br>• <b>jeton</b> = ton code ci-dessous
          <br>• <b>lat</b> = Position actuelle → Latitude
          <br>• <b>lng</b> = Position actuelle → Longitude</li>
        <li>Ajoute <b>Afficher la notification</b> avec le « Contenu de l'URL » (elle dira « ✅ La tribu est prévenue »).</li>
        <li>Touche ⓘ (ou le nom en haut) → <b>Ajouter à l'écran d'accueil</b>. Tu peux aussi le mettre en widget Raccourcis.</li>
      </ol>
      <button class="small" data-c="url">Copier l'adresse</button>
      <button class="small" data-c="jeton">Copier mon code (garde-le pour toi)</button>
      <p class="note">Ton code est personnel : ne le partage pas. Si on t'invite à nouveau, il change : refais l'étape 3.</p>` : `
      <p class="note">Sur Android, c'est un raccourci de l'icône Tribu :</p>
      <ol class="guide">
        <li>Sur l'écran d'accueil, <b>appui long</b> sur l'icône Tribu.</li>
        <li>Le menu affiche <b>Je suis arrivé</b> : garde le doigt dessus et <b>glisse-le</b> sur l'écran d'accueil.</li>
        <li>Une nouvelle icône apparaît : un toucher prend ta position et prévient la tribu.</li>
      </ol>
      <p class="note">Si « Je suis arrivé » n'apparaît pas encore, attends un jour ou deux (Chrome met à jour l'appli tout seul), ou désinstalle puis réinstalle Tribu depuis Chrome : tu restes connecté.</p>
      <button class="small" data-c="test">Essayer maintenant</button>`, e => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      if (b.dataset.c === 'url') copy(url, 'Adresse copiée');
      else if (b.dataset.c === 'jeton') copy(jeton, 'Code copié');
      else if (b.dataset.c === 'test') { closeSheet(); if (window.TribuCarte && TribuCarte.arriver) TribuCarte.arriver(); }
    });
  }
  window.TribuUrgence = { bipSheet, raccourci };
})();
