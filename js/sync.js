/* Tribu — synchronisation avec n8n.
   - Copie locale dans IndexedDB (une base par environnement), file d'attente des envois hors ligne.
   - Appels en POST "text/plain" avec le jeton dans le corps : pas de requête préalable CORS.
   - Toutes les 4 s quand l'app est ouverte et visible, et tout de suite après une modification. */
(function () {
  'use strict';
  const ENV = window.TRIBU_ENV || 'local';
  const BASE = 'https://monn8n06.duckdns.org/webhook/' + (ENV === 'prod' ? 'tribu' : 'tribu-test') + '/';
  const P = 'tribu.' + ENV + '.';
  const POLL_MS = 4000;

  const ls = {
    get(k, d) { try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(P + k); } catch (e) {} }
  };

  /* ---------- IndexedDB ---------- */
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('tribu-' + ENV, 2);
      r.onupgradeneeded = (ev) => {
        const d = r.result;
        if (ev.oldVersion < 1) {
          d.createObjectStore('elements', { keyPath: 'uid' });
          d.createObjectStore('file', { keyPath: 'n', autoIncrement: true });
        }
        if (ev.oldVersion < 2) d.createObjectStore('photos', { keyPath: 'id' });   // photos à envoyer
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function run(stores, mode, fn) {
    return db().then(d => new Promise((res, rej) => {
      const t = d.transaction(stores, mode);
      let out;
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      out = fn(t);
    }));
  }
  const req2p = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  /* ---------- État ---------- */
  const S = {
    auth: ls.get('auth', null),          // { membre, jeton }
    since: ls.get('since', 0),
    lastOk: ls.get('lastOk', 0),
    pending: 0,
    online: navigator.onLine,
    busy: false,
    again: false,
    revoked: false,
    error: ''
  };
  const listeners = [];
  function emit(kinds) { listeners.forEach(f => { try { f(kinds || []); } catch (e) { console.error(e); } }); }

  async function post(path, body) {
    const r = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body),
      cache: 'no-store'
    });
    let j = null;
    try { j = await r.json(); } catch (e) {}
    return { status: r.status, json: j };
  }

  /* ---------- Lecture locale ---------- */
  async function all(kind) {
    const rows = await run(['elements'], 'readonly', t => req2p(t.objectStore('elements').getAll())).then(p => p);
    return (await rows).filter(e => !e.supprime && (!kind || e.kind === kind));
  }
  async function countPending() {
    S.pending = await run(['file'], 'readonly', t => req2p(t.objectStore('file').count())).then(p => p);
    S.pending = await S.pending;
    return S.pending;
  }

  /* ---------- Écriture locale + file d'attente ---------- */
  async function put(kind, uid, data, supprime) {
    const me = S.auth && S.auth.membre;
    const el = { uid, kind, data: data || {}, auteur: me, maj: Date.now(), supprime: !!supprime, local: true };
    await run(['elements', 'file'], 'readwrite', t => {
      t.objectStore('elements').put(el);
      t.objectStore('file').add({ uid, kind, data: el.data, supprime: el.supprime });
    });
    await countPending();
    emit([kind]);
    sync();
    return el;
  }

  /* ---------- Synchronisation ---------- */
  async function sync() {
    if (!S.auth || S.revoked) return;
    if (S.busy) { S.again = true; return; }
    S.busy = true;
    try {
      await uploadPhotos();
      const ops = await run(['file'], 'readonly', t => req2p(t.objectStore('file').getAll())).then(p => p);
      const batch = (await ops).slice(0, 200);
      const res = await post('api', { jeton: S.auth.jeton, since: S.since, version: self.TRIBU_VERSION, ops: batch.map(o => ({ uid: o.uid, kind: o.kind, data: o.data, supprime: o.supprime })) });
      if (res.status === 401) { S.revoked = true; S.error = 'jeton'; emit(['auth']); return; }
      if (!res.json || !res.json.ok) throw new Error('Réponse inattendue (' + res.status + ')');
      if (res.json.famille) famille(res.json.famille);
      if (res.json.membre && res.json.membre !== S.auth.membre) {
        // identifiant du membre changé côté serveur (anonymisation) : on repart d'une copie locale propre
        S.auth = { membre: res.json.membre, jeton: S.auth.jeton }; ls.set('auth', S.auth);
        await run(['elements', 'file'], 'readwrite', t => { t.objectStore('elements').clear(); t.objectStore('file').clear(); });
        S.since = 0; ls.set('since', 0); S.again = true; emit(['auth']);
        return;
      }
      const changes = res.json.changes || [];
      const sentUids = new Set(batch.map(o => o.uid));
      const kinds = new Set();
      await run(['elements', 'file'], 'readwrite', t => {
        const f = t.objectStore('file'), e = t.objectStore('elements');
        batch.forEach(o => f.delete(o.n));
        // Ce qui reste en file (modifié pendant l'envoi) n'est pas écrasé par le serveur.
        const keep = new Set();
        return req2p(f.getAll()).then(rest => {
          rest.forEach(o => keep.add(o.uid));
          changes.forEach(c => {
            if (keep.has(c.uid) && !sentUids.has(c.uid)) return;
            if (keep.has(c.uid)) return;
            e.put({ uid: c.uid, kind: c.kind, data: c.data || {}, auteur: c.auteur, maj: c.maj, supprime: !!c.supprime, local: false });
            kinds.add(c.kind);
          });
        });
      });
      S.since = res.json.now || S.since; ls.set('since', S.since);
      S.lastOk = Date.now(); ls.set('lastOk', S.lastOk);
      S.online = true; S.error = '';
      await countPending();
      emit(Array.from(kinds).concat(['sync']));
      if (S.pending > 0) S.again = true;
    } catch (err) {
      S.online = navigator.onLine && false;
      S.error = String(err && err.message || err);
      emit(['sync']);
    } finally {
      S.busy = false;
      if (S.again) { S.again = false; setTimeout(sync, 300); }
    }
  }

  function famille(f) {
    if (!Array.isArray(f)) return;
    const txt = JSON.stringify(f);
    if (txt === JSON.stringify(ls.get('famille', null))) return;
    ls.set('famille', f);
    if (window.appliquerFamille) window.appliquerFamille(f);
    emit(['famille', 'auth', 'presence']);
  }

  /* ---------- Photos ---------- */
  async function uploadPhotos() {
    const pend = await run(['photos'], 'readonly', t => req2p(t.objectStore('photos').getAll())).then(p => p);
    for (const ph of (await pend)) {
      try {
        const res = await post('photos', { jeton: S.auth.jeton, action: 'put', id: ph.id, image: ph.b64 });
        if (res.json && res.json.ok) await run(['photos'], 'readwrite', t => { t.objectStore('photos').delete(ph.id); });
        else if (res.status === 400 || res.status === 403) await run(['photos'], 'readwrite', t => { t.objectStore('photos').delete(ph.id); });
      } catch (e) { break; }   // pas de réseau : on réessaiera
    }
  }
  async function queuePhoto(id, b64) {
    await run(['photos'], 'readwrite', t => { t.objectStore('photos').put({ id, b64 }); });
  }
  async function getPhoto(id) {
    const local = await run(['photos'], 'readonly', t => req2p(t.objectStore('photos').get(id))).then(p => p);
    const l = await local;
    if (l) return 'data:image/jpeg;base64,' + l.b64;
    const res = await post('photos', { jeton: S.auth.jeton, action: 'get', id });
    if (res.status === 404) throw new Error('absente');
    if (!res.json || !res.json.ok) throw new Error('reseau');
    return 'data:image/jpeg;base64,' + res.json.image;
  }

  /* ---------- Rejoindre / quitter ---------- */
  async function join(jeton) {
    const res = await post('api', { jeton, since: 0, version: self.TRIBU_VERSION, ops: [] });
    if (res.status === 401) throw new Error('Ce code n\'est pas (ou plus) valable. Demande une nouvelle invitation.');
    if (!res.json || !res.json.ok) throw new Error('Le serveur de la tribu ne répond pas. Vérifie le réseau et réessaie.');
    if (res.json.famille) famille(res.json.famille);
    S.auth = { membre: res.json.membre, jeton }; ls.set('auth', S.auth);
    S.revoked = false; S.since = 0; ls.set('since', 0);
    await sync();
    return S.auth.membre;
  }
  async function leave() {
    S.auth = null; ls.del('auth'); ls.del('since'); ls.del('lastOk'); ls.del('famille');
    S.since = 0; S.lastOk = 0; S.revoked = false;
    await run(['elements', 'file', 'photos'], 'readwrite', t => { t.objectStore('elements').clear(); t.objectStore('file').clear(); t.objectStore('photos').clear(); });
    S.pending = 0;
    emit(['auth']);
  }

  async function admin(action, membre) {
    if (!S.auth) throw new Error('Non connecté');
    const res = await post('admin', { jeton: S.auth.jeton, action, membre });
    if (!res.json || !res.json.ok) throw new Error(res.status === 403 ? 'Action réservée à l\'administrateur.' : 'Le serveur ne répond pas.');
    return res.json;
  }

  /* ---------- Notifications ---------- */
  async function push(action, extra) {
    if (!S.auth) throw new Error('Non connecté');
    const res = await post('push', Object.assign({ jeton: S.auth.jeton, action }, extra || {}));
    if (!res.json || !res.json.ok) throw new Error(res.json && res.json.erreur === 'non-abonne' ? 'Active d\'abord les notifications.' : 'Le serveur ne répond pas.');
    return res.json;
  }

  /* ---------- Rythme ---------- */
  setInterval(() => { if (document.visibilityState === 'visible') sync(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  addEventListener('online', () => { S.online = true; sync(); });
  addEventListener('offline', () => { S.online = false; emit(['sync']); });
  countPending().catch(() => {});

  window.TribuSync = {
    state: S, BASE, ENV,
    on(f) { listeners.push(f); },
    all, put, sync, join, leave, admin, queuePhoto, getPhoto, push,
    remove(kind, uid) { return put(kind, uid, {}, true); },
    store: ls
  };
})();
