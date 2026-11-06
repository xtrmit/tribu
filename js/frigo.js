/* Tribu — Frigo : post-it de la famille et liste de courses partagée.
   Données synchronisées :
   - note   uid note:<membre>:<id>    { t, cree, at }           (couleur de l'auteur, supprimable par son auteur)
   - course uid course:<membre>:<id>  { l, fait, cree, at }     (tout le monde coche ; « Retirer les cochés » pour tous) */
(function () {
  'use strict';
  const newId = () => me() + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const nom = id => (MEMBRES[id] || { nom: id || '?' }).nom;
  let vue = S.frigoVue || 'notes';
  let notes = [], courses = [];
  const byAt = (a, b) => (a.data.at || a.maj || 0) - (b.data.at || b.maj || 0);
  const x = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const check = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';

  async function load() {
    const [n, c] = await Promise.all([Sync.all('note'), Sync.all('course')]);
    notes = n.sort(byAt).reverse();            // le plus récent en premier
    courses = c.sort(byAt);
  }
  const aAcheter = () => courses.filter(c => !c.data.fait).length;

  function render() {
    const n = aAcheter(), cochees = courses.length - n;
    $('frSeg').innerHTML = `<button class="${vue === 'notes' ? 'sel' : ''}" data-vue="notes">Post-it</button>
      <button class="${vue === 'courses' ? 'sel' : ''}" data-vue="courses">Courses${n ? ' · ' + n : ''}</button>`;
    $('frInput').placeholder = vue === 'notes' ? 'Un petit mot pour la tribu…' : 'Ajouter un article…';
    $('frInput').maxLength = vue === 'notes' ? 300 : 80;
    if (vue === 'notes') {
      $('frList').className = 'postits';
      $('frList').innerHTML = notes.length ? notes.map(p => {
        const a = p.data.cree || p.auteur;
        return `<div class="postit m-${esc(a)}">
          ${a === me() ? `<button class="px" data-delnote="${esc(p.uid)}" aria-label="Supprimer ce post-it">${x}</button>` : ''}
          <span class="pt">${esc(p.data.t)}</span><span class="pa">— ${esc(nom(a))}</span></div>`;
      }).join('') : '<div class="empty-day">Aucun post-it. Laisse un petit mot à la tribu !</div>';
    } else {
      $('frList').className = 'courses card';
      $('frList').innerHTML = courses.length ? courses.map(c => `
        <button class="course${c.data.fait ? ' done' : ''}" data-course="${esc(c.uid)}">
          <span class="box">${c.data.fait ? check : ''}</span>
          <span class="cl">${esc(c.data.l)}</span>
          <span class="cw">${esc(nom(c.data.cree || c.auteur))}</span>
        </button>`).join('') + (cochees ? `<button class="ghost clear" data-act="vider">Retirer les ${cochees} article${cochees > 1 ? 's' : ''} coché${cochees > 1 ? 's' : ''}</button>` : '')
        : '<div class="empty-day">La liste est vide. Ajoute ce qu\'il manque à la maison.</div>';
    }
    renderToday();
  }
  function renderToday() {
    const n = aAcheter();
    $('todayCourses').innerHTML = courses.length ? `<button class="card courses-tile" data-go="courses">
      <b>Liste de courses</b><span>${n ? n + ' article' + (n > 1 ? 's' : '') + ' à acheter' : 'Tout est acheté'} →</span></button>` : '';
  }

  async function refresh() { if (!me()) return; await load(); render(); }

  function add() {
    const t = $('frInput').value.trim(); if (!t) return;
    $('frInput').value = '';
    if (vue === 'notes') Sync.put('note', 'note:' + newId(), { t: t.slice(0, 300), cree: me(), at: Date.now() });
    else Sync.put('course', 'course:' + newId(), { l: t.slice(0, 80), fait: false, cree: me(), at: Date.now() });
  }
  $('frAdd').addEventListener('click', add);
  $('frInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.vue) { vue = b.dataset.vue; S.frigoVue = vue; save(); render(); return; }
    if (b.dataset.delnote) {
      const p = notes.find(n => n.uid === b.dataset.delnote); if (!p) return;
      const keep = Object.assign({}, p.data);
      Sync.remove('note', p.uid);
      toast('Post-it supprimé', () => Sync.put('note', p.uid, keep));
      return;
    }
    if (b.dataset.course) {
      const c = courses.find(k => k.uid === b.dataset.course); if (!c) return;
      Sync.put('course', c.uid, Object.assign({}, c.data, { fait: !c.data.fait })); vib(8);
      return;
    }
    if (b.dataset.act === 'vider') {
      const done = courses.filter(c => c.data.fait).map(c => ({ uid: c.uid, data: Object.assign({}, c.data) }));
      done.forEach(c => Sync.remove('course', c.uid));
      toast(done.length + ' article' + (done.length > 1 ? 's' : '') + ' retiré' + (done.length > 1 ? 's' : ''), () => done.forEach(c => Sync.put('course', c.uid, c.data)));
      return;
    }
    if (b.dataset.go === 'courses') { vue = 'courses'; S.frigoVue = vue; save(); showTab('fridge'); render(); }
  }
  $('fridge').addEventListener('click', onClick);
  $('todayCourses').addEventListener('click', onClick);

  Sync.on(kinds => { if (kinds.some(k => ['note', 'course', 'auth'].indexOf(k) >= 0)) refresh(); });
  refresh();
})();
