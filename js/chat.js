/* Tribu — Chat : fil familial, réactions, modifier/supprimer, sondages.
   Données synchronisées (types) :
   - msg      uid msg:<membre>:<id>                 { t, at, edit }
   - reaction uid reaction:<uid msg>|<membre>       { m, e }        (une réaction par personne et par message)
   - sondage  uid sondage:<membre>:<id>             { q, opts[], at }
   - vote     uid vote:<uid sondage>|<membre>       { s, o }        (un vote par personne, modifiable) */
(function () {
  'use strict';
  const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  const MAX_SHOWN = 300;
  const list = $('chatList'), input = $('chatInput'), composer = $('composer');
  let data = { msgs: [], polls: [], reacts: [], votes: [] };

  const newId = () => me() + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const hhmm = t => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  function dayLabel(t) {
    const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0);
    const x = new Date(d); x.setHours(0, 0, 0, 0);
    const diff = Math.round((today - x) / 86400000);
    if (diff === 0) return 'Aujourd\'hui';
    if (diff === 1) return 'Hier';
    const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  const nl2br = s => esc(s).replace(/\n/g, '<br>');
  const memb = id => MEMBRES[id] || { nom: id || '?', ini: '?' };

  /* ---------- Lecture ---------- */
  async function load() {
    const [msgs, polls, reacts, votes] = await Promise.all(['msg', 'sondage', 'reaction', 'vote'].map(k => Sync.all(k)));
    data = { msgs, polls, reacts, votes };
  }
  function at(e) { return (e.data && e.data.at) || e.maj || 0; }

  /* ---------- Rendu d'un sondage (chat et Aujourd'hui) ---------- */
  function pollHtml(p) {
    const opts = (p.data.opts || []);
    const votes = data.votes.filter(v => v.data.s === p.uid);
    const by = opts.map((_, i) => votes.filter(v => v.data.o === i).map(v => v.auteur));
    const total = votes.length;
    const mine = votes.find(v => v.auteur === me());
    const a = memb(p.auteur);
    const waiting = Math.max(0, 4 - total);
    return `<div class="poll" data-poll="${esc(p.uid)}">
      <div class="poll-head"><span class="av sm m-${esc(p.auteur)}">${a.ini}</span><span>Sondage de ${esc(a.nom)} · ${hhmm(at(p))}</span>
        ${p.auteur === me() ? `<button class="link" data-delpoll="${esc(p.uid)}">Supprimer</button>` : ''}</div>
      <div class="poll-q">${esc(p.data.q)}</div>
      ${opts.map((o, i) => {
        const n = by[i].length, pct = total ? Math.round(n * 100 / total) : 0;
        const sel = mine && mine.data.o === i;
        return `<button class="opt${sel ? ' sel' : ''}" data-vote="${esc(p.uid)}" data-o="${i}">
          <span class="bar" style="width:${pct}%"></span>
          <span class="opt-in"><span class="opt-l">${esc(o)}</span>
          <span class="opt-r">${by[i].map(id => `<span class="av xs m-${esc(id)}">${memb(id).ini}</span>`).join('')}<b>${n}</b></span></span>
        </button>`;
      }).join('')}
      <div class="poll-foot">${total} vote${total > 1 ? 's' : ''}${waiting ? ' · ' + waiting + ' en attente' : ' · tout le monde a voté'} · touche une réponse pour voter</div>
    </div>`;
  }

  /* ---------- Rendu du fil ---------- */
  function render() {
    const items = data.msgs.map(m => ({ type: 'msg', e: m, t: at(m) }))
      .concat(data.polls.map(p => ({ type: 'poll', e: p, t: at(p) })))
      .sort((x, y) => x.t - y.t).slice(-MAX_SHOWN);
    if (!items.length) {
      list.innerHTML = '<div class="empty">Aucun message pour l\'instant.<br>Écris le premier mot à la tribu !</div>';
      return;
    }
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    let html = '', lastDay = '', lastAuthor = '', lastT = 0;
    for (const it of items) {
      const dl = dayLabel(it.t);
      if (dl !== lastDay) { html += `<div class="day">${dl}</div>`; lastDay = dl; lastAuthor = ''; }
      if (it.type === 'poll') { html += pollHtml(it.e); lastAuthor = ''; continue; }
      const m = it.e, mine = m.auteur === me(), a = memb(m.auteur);
      if (m.data.sys) { html += `<div class="sysmsg m-${esc(m.auteur)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>${esc(m.data.t)} · ${hhmm(it.t)}</div>`; lastAuthor = ''; continue; }
      const grouped = m.auteur === lastAuthor && it.t - lastT < 5 * 60 * 1000;
      lastAuthor = m.auteur; lastT = it.t;
      const rs = data.reacts.filter(r => r.data.m === m.uid);
      const counts = {};
      rs.forEach(r => { counts[r.data.e] = (counts[r.data.e] || 0) + 1; });
      const myR = rs.find(r => r.auteur === me());
      const reacts = Object.keys(counts).length ? `<div class="reacts">${Object.keys(counts).map(e => `<button class="react${myR && myR.data.e === e ? ' mine' : ''}" data-react="${esc(m.uid)}" data-e="${e}">${e} ${counts[e]}</button>`).join('')}</div>` : '';
      const ph = m.data.photo;
      const body = (ph ? `<img class="ph" src="${esc(ph.th)}" alt="Photo" data-photo="${esc(ph.id)}" data-msgid="${esc(m.uid)}" style="aspect-ratio:${ph.w}/${ph.h}">` : '') + (m.data.t ? (ph ? '<span class="cap">' + nl2br(m.data.t) + '</span>' : nl2br(m.data.t)) : '');
      const meta = `<span class="meta">${m.local ? 'envoi… · ' : ''}${m.data.edit ? 'modifié · ' : ''}${hhmm(it.t)}</span>`;
      if (mine) {
        html += `<div class="msg me"><button class="bubble${ph ? ' has-ph' : ''}" data-msg="${esc(m.uid)}">${body}${meta}</button>${reacts}</div>`;
      } else {
        html += `<div class="msg other${grouped ? ' grouped' : ''}">
          <span class="av sm m-${esc(m.auteur)}">${grouped ? '' : a.ini}</span>
          <div class="col">${grouped ? '' : `<span class="name m-${esc(m.auteur)}">${esc(a.nom)}</span>`}
          <button class="bubble${ph ? ' has-ph' : ''}" data-msg="${esc(m.uid)}">${body}${meta}</button>${reacts}</div></div>`;
      }
    }
    list.innerHTML = html;
    if (nearBottom || firstRender) { list.scrollTop = list.scrollHeight; firstRender = false; }
  }
  let firstRender = true;

  /* ---------- Aujourd'hui : dernier sondage + derniers messages ---------- */
  function renderToday() {
    const lp = data.polls.slice().sort((a, b) => at(b) - at(a))[0];
    $('todayPoll').innerHTML = lp ? `<h2 class="h3">Dernier sondage</h2>${pollHtml(lp)}` : '';
    const last = data.msgs.slice().sort((a, b) => at(a) - at(b)).slice(-2);
    $('todayMsgs').innerHTML = last.length ? `<h2 class="h3">Derniers messages</h2>
      <button class="card lastmsgs" data-go="chat">${last.map(m => `<span class="row"><span class="av sm m-${esc(m.auteur)}">${memb(m.auteur).ini}</span><span class="ell">${m.data.sys ? '' : esc(memb(m.auteur).nom) + ' : '}${m.data.photo ? 'Photo' + (m.data.t ? ' · ' : '') : ''}${esc(m.data.t || '')}</span></span>`).join('')}
      <span class="go">Ouvrir le chat →</span></button>` : '';
  }

  /* ---------- Pastille « non lus » sur l'onglet Chat ---------- */
  function renderBadge() {
    const seen = S.chatSeen || 0;
    const n = data.msgs.filter(m => m.auteur !== me() && at(m) > seen).length + data.polls.filter(p => p.auteur !== me() && at(p) > seen).length;
    const b = $('chatBadge');
    if (S.tab === 'chat' && document.visibilityState === 'visible') { markSeen(); b.hidden = true; return; }
    b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n);
  }
  function markSeen() {
    const all = data.msgs.concat(data.polls).map(at);
    const mx = all.length ? Math.max.apply(null, all) : 0;
    if (mx > (S.chatSeen || 0)) { S.chatSeen = mx; save(); }
  }

  async function refresh() {
    if (!me()) return;
    await load();
    render(); renderToday(); renderBadge();
  }

  /* ---------- Actions ---------- */
  async function send() {
    const t = input.value.trim();
    if (!t || !me()) return;
    input.value = ''; autoGrow();
    await Sync.put('msg', 'msg:' + newId(), { t: t.slice(0, 4000), at: Date.now() });
    list.scrollTop = list.scrollHeight;
  }
  function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; }
  $('chatSend').addEventListener('click', send);
  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); send(); } });

  function react(msgUid, e) {
    const uid = 'reaction:' + msgUid + '|' + me();
    const cur = data.reacts.find(r => r.uid === uid);
    if (cur && cur.data.e === e) Sync.remove('reaction', uid);
    else Sync.put('reaction', uid, { m: msgUid, e });
  }
  function vote(pollUid, o) {
    const uid = 'vote:' + pollUid + '|' + me();
    const cur = data.votes.find(v => v.uid === uid);
    if (cur && cur.data.o === o) Sync.remove('vote', uid);
    else Sync.put('vote', uid, { s: pollUid, o });
  }

  function msgSheet(uid) {
    const m = data.msgs.find(x => x.uid === uid); if (!m) return;
    const mine = m.auteur === me();
    openSheet(mine ? 'Mon message' : 'Message de ' + memb(m.auteur).nom, `
      <div class="emoji-row">${EMOJIS.map(e => `<button data-e="${e}" aria-label="Réagir ${e}">${e}</button>`).join('')}</div>
      ${mine ? '<button class="ghost" data-act="edit">Modifier</button><button class="ghost danger" data-act="del">Supprimer</button>' : ''}
      ${m.data.t ? '<button class="ghost" data-act="copy">Copier le texte</button>' : ''}
    `, e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.e) { react(uid, b.dataset.e); closeSheet(); vib(8); }
      else if (b.dataset.act === 'copy') { copy(m.data.t, 'Texte copié'); closeSheet(); }
      else if (b.dataset.act === 'del') {
        const keep = Object.assign({}, m.data);
        Sync.remove('msg', uid); closeSheet();
        toast('Message supprimé', () => Sync.put('msg', uid, keep));
      } else if (b.dataset.act === 'edit') editSheet(m);
    });
  }
  function editSheet(m) {
    openSheet('Modifier le message', `
      <textarea class="input area" id="editText" rows="4">${esc(m.data.t)}</textarea>
      <button class="primary" data-act="save">Enregistrer</button>
    `, e => {
      const b = e.target.closest('[data-act="save"]'); if (!b) return;
      const t = $('editText').value.trim(); if (!t) return;
      Sync.put('msg', m.uid, { t: t.slice(0, 4000), at: m.data.at, edit: true });
      closeSheet();
    });
    setTimeout(() => $('editText') && $('editText').focus(), 50);
  }

  function attachSheet() {
    openSheet('Ajouter', `
      <button class="ghost big" data-act="poll"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>Sondage</button>
      <button class="ghost big" data-act="camera"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Prendre une photo</button>
      <button class="ghost big" data-act="photo"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4 4 3 3-2 4 3"/></svg>Choisir dans la galerie</button>
    `, e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'poll') pollSheet();
      else { closeSheet(); pickPhoto(b.dataset.act === 'camera'); }
    });
  }
  $('chatPlus').addEventListener('click', attachSheet);

  /* ---------- Photos ---------- */
  const fileIn = document.createElement('input');
  fileIn.type = 'file'; fileIn.accept = 'image/*'; fileIn.hidden = true;
  document.body.appendChild(fileIn);
  function pickPhoto(camera) {
    fileIn.value = '';
    if (camera) fileIn.setAttribute('capture', 'environment'); else fileIn.removeAttribute('capture');
    fileIn.click();
  }
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files && fileIn.files[0]; if (!f) return;
    openSheet('Envoyer une photo', '<p class="note">Préparation de la photo…</p>');
    let img;
    try { img = await shrink(f); } catch (e) { $('sheetBody').innerHTML = '<p class="note">Cette image ne peut pas être lue. Essaie une autre photo.</p>'; return; }
    $('sheetBody').innerHTML = `
      <img class="preview" src="data:image/jpeg;base64,${img.b64}" alt="Aperçu">
      <label class="label" for="phCap">Un petit mot (facultatif)</label>
      <input class="input" id="phCap" maxlength="500" placeholder="Ex. : Le dessin du jour">
      <button class="primary" data-act="send">Envoyer à la tribu</button>
      <p class="note">${Math.round(img.b64.length * 0.75 / 1024)} Ko · la photo en grand reste 30 jours sur le serveur de la tribu.</p>`;
    $('sheetBody').onclick = async e => {
      if (!e.target.closest('[data-act="send"]')) return;
      const id = me() + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await Sync.queuePhoto(id, img.b64);
      await Sync.put('msg', 'msg:' + newId(), { t: $('phCap').value.trim().slice(0, 500), at: Date.now(), photo: { id, w: img.w, h: img.h, th: img.th } });
      closeSheet(); showTab('chat');
      setTimeout(() => { list.scrollTop = list.scrollHeight; }, 50);
    };
  });
  async function shrink(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { bmp = await createImageBitmap(file); }
    const draw = (max, q) => {
      const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return { url: c.toDataURL('image/jpeg', q), w: c.width, h: c.height };
    };
    let full = draw(1600, 0.82);
    if (full.url.length > 460000) full = draw(1600, 0.7);
    if (full.url.length > 460000) full = draw(1280, 0.68);
    let th = draw(360, 0.6);
    if (th.url.length > 45000) th = draw(260, 0.5);
    return { b64: full.url.split(',')[1], w: full.w, h: full.h, th: th.url };
  }
  async function viewPhoto(id, msgUid) {
    const m = data.msgs.find(x => x.uid === msgUid);
    const th = m && m.data.photo ? m.data.photo.th : '';
    openSheet('Photo', `<img class="viewer" id="phView" src="${esc(th)}" alt="Photo"><p class="note center" id="phInfo">Chargement en grand…</p>
      <button class="primary" data-act="save" disabled>Enregistrer sur le téléphone</button>
      <button class="ghost" data-act="share" disabled>Partager…</button>`);
    let url = '';
    try {
      url = await Sync.getPhoto(id);
      if ($('phView')) { $('phView').src = url; $('phInfo').textContent = m ? memb(m.auteur).nom + ' · ' + hhmm(at(m)) : ''; }
      $('sheetBody').querySelectorAll('[data-act]').forEach(b => { b.disabled = false; });
    } catch (e) {
      if ($('phInfo')) $('phInfo').textContent = e.message === 'absente'
        ? 'Cette photo n\'est plus disponible en grand (plus de 30 jours, ou pas encore envoyée). Seule la miniature reste.'
        : 'Pas de réseau : seule la miniature est disponible.';
    }
    $('sheetBody').onclick = async e => {
      const act = e.target.closest('[data-act]');
      if (!act || !url) return;
      if (act.dataset.act === 'share') {
        const bl = await (await fetch(url)).blob();
        const fi = new File([bl], 'tribu-' + id + '.jpg', { type: 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [fi] })) { try { await navigator.share({ files: [fi] }); } catch (err) {} }
        else toast('Partage impossible sur ce téléphone');
        return;
      }
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], 'tribu-' + id + '.jpg', { type: 'image/jpeg' });
      // iPhone : pas de téléchargement direct depuis une app installée -> menu Partager, qui propose « Enregistrer l'image ».
      if (isIOS() && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); } catch (err) {}
        return;
      }
      // Android : téléchargement direct (la photo apparaît dans Téléchargements et dans la Galerie).
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      toast('Photo enregistrée sur le téléphone (Téléchargements)');
    };
  }

  function pollSheet() {
    const field = (i, ph) => `<input class="input" data-opt="${i}" maxlength="80" placeholder="${ph}">`;
    openSheet('Nouveau sondage', `
      <label class="label" for="pollQ">Question</label>
      <input class="input" id="pollQ" maxlength="140" placeholder="Ex. : Où mange-t-on ce soir ?">
      <span class="label">Réponses (2 à 6)</span>
      <div class="opts" id="pollOpts">${field(0, 'Réponse 1')}${field(1, 'Réponse 2')}${field(2, 'Réponse 3 (facultatif)')}</div>
      <button class="ghost" data-act="more">+ Ajouter une réponse</button>
      <button class="primary" data-act="pub">Publier le sondage</button>
      <p class="join-err" id="pollErr"></p>
    `, e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const box = $('pollOpts');
      if (b.dataset.act === 'more') {
        const n = box.querySelectorAll('input').length;
        if (n < 6) box.insertAdjacentHTML('beforeend', field(n, 'Réponse ' + (n + 1) + ' (facultatif)'));
        if (n + 1 >= 6) b.hidden = true;
      } else if (b.dataset.act === 'pub') {
        const q = $('pollQ').value.trim();
        const opts = Array.from(box.querySelectorAll('input')).map(i => i.value.trim()).filter(Boolean);
        if (!q) { $('pollErr').textContent = 'Écris la question.'; return; }
        if (opts.length < 2) { $('pollErr').textContent = 'Il faut au moins 2 réponses.'; return; }
        Sync.put('sondage', 'sondage:' + newId(), { q, opts: opts.slice(0, 6), at: Date.now() });
        closeSheet(); showTab('chat');
        setTimeout(() => { list.scrollTop = list.scrollHeight; }, 50);
      }
    });
    setTimeout(() => $('pollQ') && $('pollQ').focus(), 50);
  }

  // Clics dans le fil et sur l'écran Aujourd'hui (sondage, derniers messages)
  function onClick(e) {
    const v = e.target.closest('[data-vote]');
    if (v) { vote(v.dataset.vote, +v.dataset.o); vib(8); return; }
    const r = e.target.closest('[data-react]');
    if (r) { react(r.dataset.react, r.dataset.e); return; }
    const dp = e.target.closest('[data-delpoll]');
    if (dp) {
      const p = data.polls.find(x => x.uid === dp.dataset.delpoll); if (!p) return;
      const keep = Object.assign({}, p.data);
      Sync.remove('sondage', p.uid);
      toast('Sondage supprimé', () => Sync.put('sondage', p.uid, keep));
      return;
    }
    const ph = e.target.closest('[data-photo]');
    if (ph) { viewPhoto(ph.dataset.photo, ph.dataset.msgid); return; }
    const m = e.target.closest('[data-msg]');
    if (m) { msgSheet(m.dataset.msg); return; }
    const g = e.target.closest('[data-go]');
    if (g) showTab(g.dataset.go);
  }
  list.addEventListener('click', onClick);
  $('todayPoll').addEventListener('click', onClick);
  $('todayMsgs').addEventListener('click', onClick);

  /* ---------- Branchements ---------- */
  window.onTab = t => {
    composer.hidden = t !== 'chat';
    document.body.classList.toggle('in-chat', t === 'chat');
    if (t === 'chat') { firstRender = true; render(); markSeen(); renderBadge(); }
  };
  Sync.on(kinds => {
    if (kinds.some(k => ['msg', 'sondage', 'reaction', 'vote', 'auth'].indexOf(k) >= 0)) refresh();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderBadge(); });
  window.onTab(S.tab);
  refresh();
})();
