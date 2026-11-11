/* Tribu — jeux à plusieurs : petits chevaux (2 à 4), Yams (2 à 4), pendu de la tribu (un maître du mot, une équipe qui devine).
   Coups : petits chevaux { qui, d (dé), h (cheval, -1 si aucun) } ; Yams { qui, des [5], cat } ; pendu, chacun son tour : { qui, l (lettre) } ou { qui, mot }.
   Le dé et les lancers en cours sont gardés sur le téléphone (localStorage) jusqu'à ce que le coup soit joué. */
(function () {
  'use strict';
  const J = window.TribuJeux; if (!J) return;
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const rnd = () => 1 + Math.floor(Math.random() * 6);
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const de = (v, cls, attr) => `<div class="j-die ${cls || ''}" ${attr || ''}>${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[v] && PIPS[v].indexOf(i) >= 0 ? 'on' : ''}"></i>`).join('')}</div>`;
  // Joueur suivant encore en jeu (après « qui »), dans l'ordre de la partie.
  function suivant(d, qui) {
    const js = d.joueurs, q = d.quitte || [];
    const i = js.indexOf(qui);
    for (let k = 1; k <= js.length; k++) { const m = js[(i + k) % js.length]; if (q.indexOf(m) < 0) return m; }
    return null;
  }
  const premier = d => d.joueurs.find(m => (d.quitte || []).indexOf(m) < 0);

  /* ================== Petits chevaux ================== */
  const T = [];
  (() => { const seg = (r0, c0, dr, dc, n) => { for (let i = 0; i < n; i++) T.push([r0 + dr * i, c0 + dc * i]); };
    seg(6, 1, 0, 1, 5); seg(5, 6, -1, 0, 6); seg(0, 7, 0, 0, 1); seg(0, 8, 1, 0, 6); seg(6, 9, 0, 1, 6); seg(7, 14, 0, 0, 1); seg(8, 14, 0, -1, 6); seg(9, 8, 1, 0, 6); seg(14, 7, 0, 0, 1); seg(14, 6, -1, 0, 6); seg(8, 5, 0, -1, 6); seg(7, 0, 0, 0, 1); seg(6, 0, 0, 0, 1); })();
  const HOME = [[0, 1, 2, 3, 4, 5].map(i => [7, 1 + i]), [0, 1, 2, 3, 4, 5].map(i => [1 + i, 7]), [0, 1, 2, 3, 4, 5].map(i => [7, 13 - i]), [0, 1, 2, 3, 4, 5].map(i => [13 - i, 7])];
  const YARD = [[0, 0], [0, 9], [9, 9], [9, 0]];
  const FIN = 57;
  const coins = n => (n === 2 ? [0, 2] : [0, 1, 2, 3].slice(0, n));
  const absIdx = (k, pos) => (pos >= 0 && pos <= 50 ? (13 * k + pos) % 52 : null);
  const caseDe = (k, pos) => (pos < 0 ? null : pos <= 50 ? T[(13 * k + pos) % 52] : pos <= 56 ? HOME[k][pos - 51] : [7, 7]);
  function pcMoves(pos, d) { const out = []; pos.forEach((p, i) => { if (p === FIN) return; if (p < 0) { if (d === 6) out.push(i); return; } if (p + d <= FIN) out.push(i); }); return out; }
  J.ajouter({
    id: 'chevaux', nom: 'Petits chevaux', ico: '🐴', aux: 'aux petits chevaux', multi: 4,
    fins: { arrives: 'Tous ses chevaux sont arrivés' },
    lancement: {
      defaut: { chevaux: '2' },
      html: o => `<p class="label">Chevaux par joueur</p><div class="seg two">${[['2', '2 (partie rapide)'], ['4', '4 (classique)']].map(c => `<button class="${o.chevaux === c[0] ? 'sel' : ''}" data-opt="chevaux" data-v="${c[0]}">${c[1]}</button>`).join('')}</div>`
    },
    etat(d, cs) {
      const nb = +(d.opts && d.opts.chevaux) || 2, js = d.joueurs, co = coins(js.length);
      const pos = {}; js.forEach(m => { pos[m] = Array(nb).fill(-1); });
      let trait = premier(d), fin = null, evt = '';
      for (const c of cs) {
        if (fin || c.qui !== trait) continue;
        const k = co[js.indexOf(c.qui)];
        evt = '';
        if (c.h >= 0 && pcMoves(pos[c.qui], c.d).indexOf(c.h) >= 0) {
          const p = pos[c.qui];
          p[c.h] = p[c.h] < 0 ? 0 : p[c.h] + c.d;
          const a = absIdx(k, p[c.h]);
          if (a !== null && a % 13 !== 0) js.forEach((o, oi) => { if (o === c.qui) return; pos[o].forEach((q, qi) => { if (absIdx(co[oi], q) === a) { pos[o][qi] = -1; evt = o; } }); });
          if (p.every(x => x === FIN)) fin = { type: 'arrives', gagnant: c.qui };
        }
        trait = c.d === 6 && (d.quitte || []).indexOf(c.qui) < 0 ? c.qui : suivant(d, c.qui);
      }
      const der = cs[cs.length - 1];
      return { pos, nb, co, trait: fin ? null : trait, fin, ncoups: cs.length, der, evt };
    },
    chip(e, m) { return e.pos[m].filter(x => x === FIN).length + '/' + e.nb; },
    statut(e, c) {
      if (e.fin) return;
      const att = lsGet(c.cle);
      if (c.aMoi) return att && att.n === e.cs.length ? (pcMoves(e.pos[c.moi], att.d).length ? 'Touche le cheval à avancer' : 'Aucun cheval ne peut bouger') : (e.der && e.der.qui === c.moi && e.der.d === 6 ? 'Tu as fait 6 : rejoue !' : 'À toi : lance le dé');
    },
    vue(e, c) {
      const js = c.joueurs, att = c.aMoi ? lsGet(c.cle) : null, dv = att && att.n === e.cs.length ? att.d : 0;
      const mv = dv ? pcMoves(e.pos[c.moi], dv) : [];
      const coinDe = k => js[e.co.indexOf(k)] || null;
      const occ = {};
      js.forEach((m, i) => e.pos[m].forEach((p, h) => { if (p >= 0 && p < FIN) { const cc = caseDe(e.co[i], p).join(','); (occ[cc] = occ[cc] || []).push({ m, h }); } }));
      let html = '';
      for (let r = 0; r < 15; r++) for (let col = 0; col < 15; col++) {
        const yk = YARD.findIndex(([a, b]) => r >= a && r < a + 6 && col >= b && col < b + 6);
        if (yk >= 0) {
          if (r === YARD[yk][0] && col === YARD[yk][1]) {
            const m = coinDe(yk);
            const slots = [0, 1, 2, 3].map(i => `<div class="pc-slot">${m && i < e.nb && e.pos[m][i] < 0 ? `<span class="pc-horse m-${esc(m)}${m === c.moi && mv.indexOf(i) >= 0 ? ' can' : ''}" data-h="${m === c.moi ? i : ''}"></span>` : ''}</div>`).join('');
            html += `<div class="pc-yard${m ? ' m-' + esc(m) : ' vide'}" style="grid-row:${r + 1}/span 6;grid-column:${col + 1}/span 6"><div class="pc-yardbox">${slots}</div>${m ? `<span class="pc-done">${e.pos[m].filter(x => x === FIN).length ? '🏁 ' + e.pos[m].filter(x => x === FIN).length : ''}</span>` : ''}</div>`;
          }
          continue;
        }
        if (r >= 6 && r <= 8 && col >= 6 && col <= 8) { if (r === 6 && col === 6) html += '<div class="pc-ctr" style="grid-row:7/span 3;grid-column:7/span 3"></div>'; continue; }
        let cl = 'pc-tr', mc = '';
        const hk = HOME.findIndex(h => h.some(([a, b]) => a === r && b === col)); if (hk >= 0 && coinDe(hk)) { cl = 'pc-hm'; mc = ' m-' + coinDe(hk); }
        const tk = [0, 1, 2, 3].find(k => T[13 * k][0] === r && T[13 * k][1] === col); if (tk !== undefined && coinDe(tk)) { cl = 'pc-st'; mc = ' m-' + coinDe(tk); }
        const here = occ[r + ',' + col] || [];
        const mine = here.find(x => x.m === c.moi && mv.indexOf(x.h) >= 0);
        const h = mine || here[0];
        const inner = h ? `<span class="pc-horse m-${esc(h.m)}${mine ? ' can' : ''}" data-h="${mine ? h.h : ''}">${here.length > 1 ? here.length : ''}</span>` : '';
        html += `<div class="${cl}${mc}" style="grid-row:${r + 1};grid-column:${col + 1}">${inner}</div>`;
      }
      const evt = e.evt && e.der ? `<p class="note pc-evt">${esc(c.nom(e.der.qui))} a renvoyé un cheval de ${esc(e.evt === c.moi ? 'toi' : c.memb(e.evt).nom)} à l'écurie !</p>` : '';
      return `<div class="pc-board" id="pcBoard">${html}</div>
        <div class="df-btns pc-bar">${de(dv || (e.der ? e.der.d : 6), dv ? 'roll' : '')}<button class="primary" data-act="pc-lancer" ${c.aMoi && !dv ? '' : 'disabled'}>Lancer le dé</button></div>${evt}`;
    },
    clic(ev, e, c) {
      const a = ev.target.closest('[data-act]');
      const att = lsGet(c.cle), dv = att && att.n === e.cs.length ? att.d : 0;
      const pourApres = d => (d === 6 ? c.moi : suivant(e.d, c.moi));
      if (a && a.dataset.act === 'pc-lancer') {
        if (!c.aMoi || dv) return;
        const d = rnd(); lsSet(c.cle, { n: e.cs.length, d }); vib(10); c.rendre();
        if (!pcMoves(e.pos[c.moi], d).length) setTimeout(() => { lsSet(c.cle, null); c.jouer({ qui: c.moi, d, h: -1 }, { txt: 'a fait ' + d + ' (aucun cheval ne bouge)', pour: pourApres(d) }); }, 1200);
        return;
      }
      const h = ev.target.closest('.pc-horse.can'); if (!h || !dv) return;
      lsSet(c.cle, null);
      c.jouer({ qui: c.moi, d: dv, h: +h.dataset.h }, { txt: dv === 6 ? 'a fait 6 et rejoue' : 'a avancé de ' + dv, pour: pourApres(dv) });
    }
  });

  /* ================== Yams ================== */
  const CAT = [['1', 'As'], ['2', 'Deux'], ['3', 'Trois'], ['4', 'Quatre'], ['5', 'Cinq'], ['6', 'Six'], ['brelan', 'Brelan'], ['carre', 'Carré'], ['full', 'Full'], ['petite', 'Petite suite'], ['grande', 'Grande suite'], ['yams', 'Yams'], ['chance', 'Chance']];
  function points(cat, d) {
    const c = [0, 0, 0, 0, 0, 0, 0]; d.forEach(x => { c[x]++; }); const s = d.reduce((a, b) => a + b, 0), mx = Math.max.apply(null, c);
    const has = seq => seq.every(v => c[v]);
    switch (cat) {
      case 'brelan': return mx >= 3 ? s : 0; case 'carre': return mx >= 4 ? s : 0; case 'full': return c.indexOf(3) >= 0 && c.indexOf(2) >= 0 ? 25 : 0;
      case 'petite': return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) ? 30 : 0; case 'grande': return has([1, 2, 3, 4, 5]) || has([2, 3, 4, 5, 6]) ? 40 : 0;
      case 'yams': return mx === 5 ? 50 : 0; case 'chance': return s; default: return c[+cat] * (+cat);
    }
  }
  const haut = f => ['1', '2', '3', '4', '5', '6'].reduce((a, k) => a + (f[k] || 0), 0);
  const totalY = f => Object.keys(f).reduce((a, k) => a + f[k], 0) + (haut(f) >= 63 ? 35 : 0);
  J.ajouter({
    id: 'yams', nom: 'Yams', ico: '🎲', aux: 'au Yams', multi: 4,
    fins: { score: 'Feuilles remplies' },
    etat(d, cs) {
      const f = {}; d.joueurs.forEach(m => { f[m] = {}; });
      let trait = premier(d);
      for (const c of cs) {
        if (c.qui !== trait || !f[c.qui] || f[c.qui][c.cat] !== undefined || !CAT.some(x => x[0] === c.cat)) continue;
        f[c.qui][c.cat] = points(c.cat, c.des);
        trait = suivant(d, c.qui);
        let k = 0; while (trait && Object.keys(f[trait]).length >= CAT.length && k++ < 5) trait = suivant(d, trait);
      }
      const actifs = d.joueurs.filter(m => (d.quitte || []).indexOf(m) < 0);
      let fin = null;
      if (actifs.length && actifs.every(m => Object.keys(f[m]).length >= CAT.length)) {
        const best = Math.max.apply(null, actifs.map(m => totalY(f[m])));
        fin = { type: 'score', gagnants: actifs.filter(m => totalY(f[m]) === best) };
      }
      return { f, trait: fin ? null : trait, fin, ncoups: cs.length };
    },
    chip(e, m) { return totalY(e.f[m]) + ' pts'; },
    statut(e, c) {
      if (e.fin || !c.aMoi) return;
      const t = lsGet(c.cle), l = t && t.n === e.cs.length ? t.lancers : 0;
      return l === 0 ? 'À toi : lance les dés' : l < 3 ? 'Touche les dés à garder, puis relance (ou note un score)' : 'Choisis une case à remplir';
    },
    vue(e, c) {
      let t = c.aMoi ? lsGet(c.cle) : null;
      if (!t || t.n !== e.cs.length) t = { n: e.cs.length, des: [0, 0, 0, 0, 0], gard: [false, false, false, false, false], lancers: 0 };
      const js = c.joueurs, moiIdx = js.indexOf(c.moi);
      const rel = t.gard.filter(g => !g).length;
      const rows = CAT.map(([k, l], ix) => `${ix === 6 ? `<tr class="ya-sep"><td>Bonus (63 en haut : +35)</td>${js.map(m => `<td>${haut(e.f[m]) >= 63 ? 35 : haut(e.f[m]) + '/63'}</td>`).join('')}</tr>` : ''}<tr><td class="ya-nom" data-a="${k}">${l}</td>${js.map((m, i) => {
        const v = e.f[m][k], can = c.aMoi && i === moiIdx && v === undefined && t.lancers > 0;
        return `<td class="${i === moiIdx ? 'me' : ''}${can ? ' can' : ''}" ${can ? `data-k="${k}"` : ''}>${v !== undefined ? v : can ? points(k, t.des) : ''}</td>`;
      }).join('')}</tr>`).join('');
      const zones = c.aMoi ? `<div class="ya-zone k"><h4>🔒 Gardés</h4><div class="ya-dice">${t.des.map((v, i) => (t.gard[i] && t.lancers ? de(v, 'keep', `data-g="${i}"`) : '')).join('') || `<span class="muted df-sub">${t.lancers ? 'Touche un dé pour le garder' : 'Lance d\'abord les dés'}</span>`}</div></div>
        <div class="ya-zone r"><h4>🎲 À relancer</h4><div class="ya-dice">${t.des.map((v, i) => (!(t.gard[i] && t.lancers) ? de(t.lancers ? v : 0, '', `data-g="${i}"`) : '')).join('') || '<span class="muted df-sub">Tous les dés sont gardés</span>'}</div></div>
        <button class="primary" data-act="ya-lancer" ${t.lancers >= 3 || (t.lancers && !rel) ? 'disabled' : ''}>${t.lancers === 0 ? 'Lancer les 5 dés' : t.lancers >= 3 ? 'Plus de lancer : choisis une case' : 'Relancer ' + rel + ' dé' + (rel > 1 ? 's' : '') + ' (' + (3 - t.lancers) + ' restant' + (3 - t.lancers > 1 ? 's' : '') + ')'}</button>` : '';
      return `${zones}<div class="ya-aide-l"><span class="muted df-sub">${c.aMoi && t.lancers ? 'Touche une case orange pour noter ton score.' : 'Touche le nom d\'une case pour son explication.'}</span><button class="ya-help" data-act="ya-aide" aria-label="Aide du Yams">?</button></div>
        <div class="ya-wrap"><table class="ya-sheet"><tr><th></th>${js.map(m => `<th class="m-${esc(m)}">${esc(c.nom(m))}</th>`).join('')}</tr>${rows}<tr class="ya-sep"><td>Total</td>${js.map(m => `<td>${totalY(e.f[m])}</td>`).join('')}</tr></table></div>`;
    },
    clic(ev, e, c) {
      const aide = ev.target.closest('[data-act="ya-aide"]'), nom = ev.target.closest('[data-a]');
      if (aide || nom) { aideYams(nom ? nom.dataset.a : null); return; }
      if (!c.aMoi) return;
      let t = lsGet(c.cle); if (!t || t.n !== e.cs.length) t = { n: e.cs.length, des: [0, 0, 0, 0, 0], gard: [false, false, false, false, false], lancers: 0 };
      const a = ev.target.closest('[data-act="ya-lancer"]');
      if (a) {
        if (t.lancers >= 3) return;
        if (!t.lancers) t.gard = [false, false, false, false, false];
        t.des = t.des.map((v, i) => (t.gard[i] ? v : rnd())); t.lancers++; lsSet(c.cle, t); vib(10); c.rendre();
        document.querySelectorAll('.ya-zone.r .j-die').forEach(x => x.classList.add('roll'));
        return;
      }
      const g = ev.target.closest('[data-g]');
      if (g) { if (!t.lancers || t.lancers >= 3) return; t.gard[+g.dataset.g] = !t.gard[+g.dataset.g]; lsSet(c.cle, t); vib(6); c.rendre(); return; }
      const k = ev.target.closest('[data-k]');
      if (k && t.lancers) {
        const cat = k.dataset.k, pts = points(cat, t.des), nomC = CAT.find(x => x[0] === cat)[1];
        lsSet(c.cle, null);
        c.jouer({ qui: c.moi, des: t.des, cat }, { txt: 'a marqué ' + pts + ' en ' + nomC, pour: suivant(e.d, c.moi) });
      }
    }
  });
  const AIDE = {
    1: ['Total des 1', '⚀⚀⚂⚃⚅', 2], 2: ['Total des 2', '⚁⚁⚁⚀⚄', 6], 3: ['Total des 3', '⚂⚂⚀⚃⚅', 6], 4: ['Total des 4', '⚃⚃⚃⚃⚀', 16], 5: ['Total des 5', '⚄⚄⚀⚁⚂', 10], 6: ['Total des 6', '⚅⚅⚅⚀⚁', 18],
    brelan: ['3 dés identiques : total des 5 dés', '⚃⚃⚃⚀⚅', 19], carre: ['4 dés identiques : total des 5 dés', '⚄⚄⚄⚄⚁', 22], full: ['3 dés identiques + 2 dés identiques', '⚂⚂⚂⚄⚄', 25],
    petite: ['4 dés qui se suivent', '⚀⚁⚂⚃⚅', 30], grande: ['5 dés qui se suivent', '⚁⚂⚃⚄⚅', 40], yams: ['5 dés identiques', '⚅⚅⚅⚅⚅', 50], chance: ['N\'importe quels dés : total des 5', '⚀⚂⚃⚅⚅', 21]
  };
  function aideYams(k) {
    const liste = k ? CAT.filter(x => x[0] === k) : CAT;
    openSheet(k ? liste[0][1] : 'Les cases du Yams', `<div class="ya-aide">${liste.map(([key, nom]) => { const a = AIDE[key]; return `<div><b>${nom}</b><span>${a[0]}<br><span class="ya-ex">${a[1]}</span> = <b>${a[2]} pts</b></span></div>`; }).join('')}
      ${k ? '' : '<div><b>Bonus</b><span>63 points ou plus dans les cases As à Six : +35</span></div><div><b>0 point</b><span>On peut remplir une case sans avoir la combinaison : elle vaut alors 0</span></div><div><b>Le tour</b><span>3 lancers au plus : on garde les dés qu\'on veut entre deux lancers, puis on remplit une case</span></div>'}</div>
      <button class="primary" data-x="ok">Compris</button>`, ev => { if (ev.target.closest('[data-x]')) closeSheet(); });
  }

  /* ================== Pendu de la tribu ================== */
  const MAX = 7;
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const PARTS = ['<line class="bois" x1="20" y1="160" x2="110" y2="160"/>', '<line class="bois" x1="45" y1="160" x2="45" y2="18"/><line class="bois" x1="45" y1="18" x2="120" y2="18"/><line class="bois" x1="45" y1="45" x2="72" y2="18"/>', '<line x1="120" y1="18" x2="120" y2="38"/>', '<circle cx="120" cy="52" r="14"/>', '<line x1="120" y1="66" x2="120" y2="110"/>', '<line x1="120" y1="78" x2="100" y2="96"/><line x1="120" y1="78" x2="140" y2="96"/>', '<line x1="120" y1="110" x2="104" y2="136"/><line x1="120" y1="110" x2="136" y2="136"/>'];
  J.ajouter({
    id: 'pendu', nom: 'Pendu de la tribu', ico: '🪢', aux: 'au pendu', multi: 4, equipe: true,
    fins: { trouve: 'Mot trouvé', pendu: 'Pendu' },
    lancement: {
      defaut: { mot: '', indice: '' },
      html: o => `<p class="label">Ton mot secret (toi seul le vois)</p><input class="input" id="peMot" maxlength="24" autocomplete="off" placeholder="ex. BARBECUE" value="${esc(o.mot || '')}">
        <p class="label">Un indice (facultatif)</p><input class="input" id="peInd" maxlength="40" autocomplete="off" placeholder="ex. On en fait l'été au jardin" value="${esc(o.indice || '')}">`,
      lire: box => ({ mot: (box.querySelector('#peMot') || {}).value || '', indice: (box.querySelector('#peInd') || {}).value || '' }),
      valider: o => (/^[A-Za-zÀ-ÿ' -]{2,24}$/.test(String(o.mot).trim()) && /[A-Za-zÀ-ÿ]/.test(o.mot) ? null : 'Choisis un mot de 2 à 24 lettres')
    },
    etat(d, cs) {
      const mot = String((d.opts && d.opts.mot) || '').trim(), M = norm(mot);
      const maitre = d.joueurs[0], dev = d.joueurs.slice(1);
      const actifs = dev.filter(m => (d.quitte || []).indexOf(m) < 0);
      const prochain = qui => { const i = dev.indexOf(qui); for (let k = 1; k <= dev.length; k++) { const m = dev[(i + k) % dev.length]; if (actifs.indexOf(m) >= 0) return m; } return null; };
      const prop = [], essais = [];
      let err = 0, trait = actifs[0] || null, fin = null, par = null;
      for (const c of cs) {
        if (fin || c.qui !== trait) continue;
        if (c.mot) {
          if (norm(c.mot) === M) { fin = { type: 'trouve', gagnants: dev, par: c.qui }; par = c.qui; }
          else { err++; essais.push(c); }
        } else if (c.l && /^[A-Z]$/.test(c.l) && !prop.some(p => p.l === c.l)) {
          prop.push(c);
          if (M.indexOf(c.l) < 0) err++;
          else if ([...M].every(ch => !/[A-Z]/.test(ch) || prop.some(p => p.l === ch))) { fin = { type: 'trouve', gagnants: dev, par: c.qui }; par = c.qui; }
        }
        if (!fin && err >= MAX) fin = { type: 'pendu', gagnant: maitre };
        if (!fin) trait = prochain(c.qui);
      }
      if (!mot) fin = null;
      return { mot, M, prop, essais, err, maitre, dev, trait: fin ? null : trait, fin, par, ncoups: prop.length + essais.length };
    },
    chip(e, m) { return m === e.maitre ? 'maître du mot' : 'devine'; },
    statut(e, c) {
      if (e.fin) return;
      if (c.moi === e.maitre) return 'Tu es le maître du mot · au tour de ' + esc(c.memb(e.trait).nom);
      return c.aMoi ? 'À toi : une lettre, ou le mot entier' : esc(c.memb(e.trait).nom) + ' choisit une lettre…';
    },
    messageFin(d, f, noms) {
      const mot = String((d.opts && d.opts.mot) || '').toUpperCase(), maitre = d.joueurs[0], dev = d.joueurs.slice(1);
      if (f.type === 'trouve') return '🏆 ' + noms(dev) + (dev.length > 1 ? ' ont trouvé' : ' a trouvé') + ' le mot de ' + noms([maitre]) + ' au pendu : « ' + mot + ' »' + (f.par && dev.length > 1 ? ' · 🎯 ' + noms([f.par]) + ' a trouvé' : '');
      if (f.type === 'pendu') return '🏆 ' + noms([maitre]) + ' a pendu ' + noms(dev) + ' : le mot était « ' + mot + ' »';
      return null;
    },
    vue(e, c) {
      const voit = c.moi === e.maitre || !!e.fin;
      const mot = [...e.mot].map(ch => { const n = norm(ch); if (!/[A-Z]/.test(n)) return `<span class="sp">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`; return `<span>${voit || e.prop.some(p => p.l === n) ? esc(ch.toUpperCase()) : ''}</span>`; }).join('');
      const essais = e.essais.length ? `<div class="pe-hint">Mots tentés : ${e.essais.map(x => esc(String(x.mot).toUpperCase()) + ' (' + esc(c.memb(x.qui).ini) + ')').join(', ')}</div>` : '';
      return `<svg class="pe-gallows" viewBox="0 0 170 170">${PARTS.slice(0, e.err).join('')}</svg>
        <div class="pe-hint">${e.err}/${MAX} erreurs${e.d.opts && e.d.opts.indice ? ' · Indice : ' + esc(e.d.opts.indice) : ''}</div>
        <div class="pe-word">${mot}</div>${essais}
        <div class="pe-kb">${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => { const p = e.prop.find(x => x.l === l); const ok = p && e.M.indexOf(l) >= 0; return `<button data-l="${l}" ${p || !c.aMoi ? 'disabled' : ''} class="${p ? (ok ? 'ok' : 'ko') : ''}">${l}${p ? `<small>${esc(c.memb(p.qui).ini)}</small>` : ''}</button>`; }).join('')}</div>
        ${c.aMoi ? '<div class="pe-mot"><input class="input" id="peEssai" maxlength="24" autocomplete="off" placeholder="Proposer le mot entier"><button class="small" data-act="pe-mot">Proposer</button></div>' : ''}`;
    },
    clic(ev, e, c) {
      if (!c.aMoi || c.moi === e.maitre) return;
      const pour = (() => { const dev = e.dev, act = dev.filter(m => (e.d.quitte || []).indexOf(m) < 0), i = dev.indexOf(c.moi); for (let k = 1; k <= dev.length; k++) { const m = dev[(i + k) % dev.length]; if (act.indexOf(m) >= 0) return m; } return null; })();
      const a = ev.target.closest('[data-act="pe-mot"]');
      if (a) {
        const v = ($('peEssai') || {}).value || '';
        if (!/[A-Za-zÀ-ÿ]/.test(v)) { toast('Écris le mot à proposer'); return; }
        if (norm(v.trim()) !== e.M) toast('Ce n\'est pas le mot : une erreur');
        c.jouer({ qui: c.moi, mot: v.trim().slice(0, 24) }, { pour, txt: 'a tenté un mot' });
        return;
      }
      const b = ev.target.closest('[data-l]'); if (!b || b.disabled) return;
      c.jouer({ qui: c.moi, l: b.dataset.l }, { pour, txt: 'a proposé la lettre ' + b.dataset.l });
    }
  });
})();
