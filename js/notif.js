/* Tribu — notifications (Web Push via n8n).
   - Abonnement du téléphone : clé publique fournie par n8n (tribu · push), la clé privée reste sur le serveur.
   - Réglages par catégorie, envoi d'essai, désactivation.
   - Au démarrage, si la permission est déjà accordée, l'abonnement est renvoyé au serveur (il peut changer). */
(function () {
  'use strict';
  const CATS = [
    { k: 'chat', l: 'Messages, photos et sondages', ok: true },
    { k: 'agenda', l: 'Agenda et rappels', ok: true },
    { k: 'qdj', l: 'Question et devinette du jour', ok: true },
    { k: 'dragon', l: 'Dragon (quand il a besoin de vous)', ok: true },
    { k: 'arrivees', l: 'Arrivées et départs', ok: false }
  ];
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  function keyBytes(b64) {
    const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64.length % 4) % 4));
    return Uint8Array.from(s, c => c.charCodeAt(0));
  }
  async function currentSub() {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }
  async function subscribe(prefs) {
    const info = await Sync.push('cle');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notifications refusées. Pour les autoriser : Paramètres du téléphone → Applications → Tribu T → Notifications.');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(info.cle) });
    return Sync.push('abonner', { abonnement: sub.toJSON(), prefs });
  }

  async function mount(box) {
    if (!box) return;
    if (!supported()) {
      box.innerHTML = `<p class="note">${isIOS() && !standalone()
        ? 'Sur iPhone, les notifications marchent seulement quand Tribu est installée sur l\'écran d\'accueil (Partager → Sur l\'écran d\'accueil), puis ouverte depuis son icône.'
        : 'Ce téléphone ou ce navigateur ne permet pas les notifications.'}</p>`;
      return;
    }
    box.innerHTML = '<p class="note">Chargement…</p>';
    let info, sub;
    try { [info, sub] = await Promise.all([Sync.push('cle'), currentSub()]); }
    catch (e) { box.innerHTML = '<p class="note">Notifications : serveur injoignable pour le moment.</p>'; return; }
    const on = !!(sub && info.abonne && Notification.permission === 'granted');
    const prefs = info.prefs || {};
    if (!on) {
      box.innerHTML = `<button class="primary" data-n="on">Activer les notifications</button>
        <p class="note">Tu seras prévenu·e d'un nouveau message, d'une photo ou d'un sondage quand Tribu est fermée.</p>
        ${Notification.permission === 'denied' ? '<p class="note danger">Les notifications sont bloquées pour Tribu dans les réglages du téléphone. Débloque-les : Paramètres → Applications → Tribu T → Notifications.</p>' : ''}`;
    } else {
      box.innerHTML = CATS.map(c => {
        const v = c.ok && prefs[c.k] !== false;
        return `<button class="toggle" data-cat="${c.k}" aria-pressed="${v}"${c.ok ? '' : ' disabled'}>
          <span>${c.l}${c.ok ? '' : ' <i class="soon-tag">bientôt</i>'}</span><span class="sw${v ? ' on' : ''}"><i></i></span></button>`;
      }).join('') + `
        <div class="row"><button class="small" style="flex:1" data-n="test">M'envoyer un essai</button>
        <button class="small" style="flex:1" data-n="off">Désactiver ici</button></div>`;
    }
    box.onclick = async e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      try {
        if (b.dataset.n === 'on') { b.disabled = true; b.textContent = 'Activation…'; await subscribe(); toast('Notifications activées'); mount(box); }
        else if (b.dataset.n === 'off') {
          const s = await currentSub(); if (s) await s.unsubscribe().catch(() => {});
          await Sync.push('desabonner'); toast('Notifications désactivées sur ce téléphone'); mount(box);
        } else if (b.dataset.n === 'test') { await Sync.push('essai'); toast('Notification d\'essai envoyée : elle arrive dans quelques secondes'); }
        else if (b.dataset.cat) {
          prefs[b.dataset.cat] = !(prefs[b.dataset.cat] !== false);
          await Sync.push('prefs', { prefs });
          mount(box);
        }
      } catch (err) { toast(err.message || 'Erreur'); mount(box); }
    };
  }

  // Renvoie l'abonnement existant au serveur au démarrage (l'adresse d'abonnement peut changer).
  async function refresh() {
    if (!supported() || !me() || Notification.permission !== 'granted') return;
    try { const s = await currentSub(); if (s) await Sync.push('abonner', { abonnement: s.toJSON() }); } catch (e) {}
  }
  setTimeout(refresh, 3000);

  window.TribuNotif = { mount, refresh };
})();
