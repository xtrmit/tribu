/* Tribu — Puissance 4, morpion (3 manches gagnantes) et bataille navale, branchés sur les défis (defis.js).
   Coups : Puissance 4 { c } (colonne) ; morpion { i } (case 0-8) ; bataille navale { flotte, role } puis { i } (case 0-99). */
(function () {
  'use strict';
  const J = window.TribuJeux; if (!J) return;
  const disc = m => `<span class="j-disc m-${esc(m)}"></span>`;

  /* ================== Puissance 4 ================== */
  const W = 7, H = 6;
  let p4Vu = {};
  function p4Gagne(g) {
    const at = (c, r) => g[r * W + c];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const v = at(c, r); if (!v) continue;
      for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const cells = [];
        for (let k = 0; k < 4; k++) { const cc = c + dc * k, rr = r + dr * k; if (cc < 0 || cc >= W || rr < 0 || rr >= H || at(cc, rr) !== v) break; cells.push(rr * W + cc); }
        if (cells.length === 4) return { v, cells };
      }
    }
    return null;
  }
  J.ajouter({
    id: 'p4', nom: 'Puissance 4', ico: '🔴', aux: 'au Puissance 4',
    fins: { aligne: 'Puissance 4', plein: 'Grille pleine' },
    etat(d, cs) {
      const g = Array(W * H).fill(null); let last = -1, gagne = null;
      cs.forEach((c, k) => {
        if (gagne) return;
        const qui = k % 2 ? d.b : d.w;
        for (let r = H - 1; r >= 0; r--) if (!g[r * W + c.c]) { g[r * W + c.c] = qui; last = r * W + c.c; break; }
        gagne = p4Gagne(g);
      });
      let fin = null;
      if (gagne) fin = { type: 'aligne', gagnant: gagne.v };
      else if (g.every(x => x)) fin = { type: 'plein', gagnant: null };
      return { g, last, gagne, trait: cs.length % 2 ? d.b : d.w, fin, ncoups: cs.length };
    },
    marque(e, r) { return `<span class="j-disc ${r === 'w' ? 'rouge' : 'bleu'}"></span>`; },
    statut(e, c) { if (c.aMoi) return 'À toi : touche une colonne'; },
    vue(e, c) {
      const anim = p4Vu[e.p.uid] !== e.cs.length ? e.last : -1; p4Vu[e.p.uid] = e.cs.length;
      const libre = col => !e.g[col];
      return `<div class="p4-arrows">${Array.from({ length: W }, (_, col) => `<span class="${c.aMoi && libre(col) ? 'on' : ''}">▼</span>`).join('')}</div>
        <div class="p4"><div class="p4-grid">${e.g.map((v, i) => {
          const r = Math.floor(i / W);
          return `<div class="p4-cell${e.gagne && e.gagne.cells.indexOf(i) >= 0 ? ' win' : ''}" data-c="${i % W}">${v ? `<i class="${v === e.d.w ? 'rouge' : 'bleu'}${i === anim ? ' drop' : ''}" style="--from:calc(${-(r + 1)} * (100% + 6px) * 1.14);--dur:${(0.25 + r * 0.07).toFixed(2)}s"></i>` : ''}</div>`;
        }).join('')}</div></div>`;
    },
    clic(ev, e, c) {
      const cell = ev.target.closest('[data-c]'); if (!cell) return;
      if (!c.aMoi) { toast('Ce n\'est pas ton tour'); return; }
      const col = +cell.dataset.c;
      if (e.g[col]) { toast('Colonne pleine'); return; }
      c.jouer({ c: col }, { txt: 'a joué dans la colonne ' + (col + 1) });
    }
  });

  /* ================== Morpion (3 manches gagnantes) ================== */
  const LIGNES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const X = `<svg viewBox="0 0 100 100"><path d="M22 22 L78 78 M78 22 L22 78"/></svg>`;
  const O = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30"/></svg>`;
  const mpLigne = g => { for (const l of LIGNES) if (g[l[0]] && g[l[0]] === g[l[1]] && g[l[0]] === g[l[2]]) return l; return null; };
  J.ajouter({
    id: 'morpion', nom: 'Morpion', ico: '✖️', aux: 'au morpion',
    fins: { manches: '3 manches gagnées' },
    etat(d, cs) {
      const sc = { [d.w]: 0, [d.b]: 0 };
      let g = Array(9).fill(null), depart = d.w, tour = d.w, manche = 1, prec = null, fin = null;
      for (const c of cs) {
        if (fin || g[c.i]) continue;
        g[c.i] = tour;
        const l = mpLigne(g), plein = g.every(x => x);
        if (l || plein) {
          const gagnant = l ? tour : null;
          if (gagnant) sc[gagnant]++;
          prec = { g: g.slice(), l, gagnant, manche };
          if (gagnant && sc[gagnant] >= 3) { fin = { type: 'manches', gagnant }; break; }
          depart = gagnant ? (gagnant === d.w ? d.b : d.w) : (depart === d.w ? d.b : d.w);
          g = Array(9).fill(null); tour = depart; manche++;
        } else tour = tour === d.w ? d.b : d.w;
      }
      return { g, sc, manche, prec, trait: tour, fin, ncoups: cs.length, vide: g.every(x => !x) };
    },
    marque(e, r, c) { return `<span class="mp-mark m-${esc(c.qui(r))}">${r === 'w' ? '✕' : '◯'}</span>`; },
    sousJoueur(e, r, c) { return `<span class="muted df-sub">${e.sc[c.qui(r)]} manche${e.sc[c.qui(r)] > 1 ? 's' : ''} gagnée${e.sc[c.qui(r)] > 1 ? 's' : ''}</span>`; },
    statut(e, c) {
      if (e.fin) return;
      const qui = e.trait === c.moi ? 'à toi' : 'à ' + esc(c.memb(e.trait).nom);
      if (e.vide && e.prec) return 'Manche ' + e.manche + ' : ' + qui + ' de commencer';
      return 'Manche ' + e.manche + ' : ' + qui + ' de jouer';
    },
    vue(e, c) {
      const montre = e.vide && e.prec ? e.prec : null;
      const g = montre ? montre.g : e.g, l = montre ? montre.l : (e.fin && e.prec ? e.prec.l : null);
      const grille = e.fin && e.prec ? e.prec.g : g;
      const banniere = montre ? `<div class="mp-ban">Manche ${montre.manche} : ${montre.gagnant ? (montre.gagnant === c.moi ? 'gagnée par toi' : 'gagnée par ' + esc(c.memb(montre.gagnant).nom)) : 'nulle'} · touche une case pour la suivante</div>` : '';
      return banniere + `<div class="mp${montre ? ' fade' : ''}">${grille.map((v, i) => `<div class="mp-cell${l && l.indexOf(i) >= 0 ? ' win' : ''}" data-i="${i}">${v ? `<span class="m-${esc(v)}">${v === e.d.w ? X : O}</span>` : ''}</div>`).join('')}</div>`;
    },
    clic(ev, e, c) {
      const cell = ev.target.closest('[data-i]'); if (!cell) return;
      if (!c.aMoi) { toast('Ce n\'est pas ton tour'); return; }
      const i = +cell.dataset.i;
      if (!e.vide && e.g[i]) return;
      c.jouer({ i }, { txt: 'a joué au morpion' });
    }
  });

  /* ================== Bataille navale ================== */
  const N = 10, FLOTTE = [['Porte-avions', 5], ['Croiseur', 4], ['Sous-marin', 3], ['Torpilleur', 3], ['Patrouilleur', 2]];
  const COLS = 'ABCDEFGHIJ';
  const caseNom = i => COLS[i % N] + (Math.floor(i / N) + 1);
  let brouillon = {};
  function placer() {
    const occ = new Set(), ships = [];
    for (const [, len] of FLOTTE) {
      for (let essai = 0; essai < 500; essai++) {
        const h = Math.random() < 0.5, r = Math.floor(Math.random() * (h ? N : N - len + 1)), c = Math.floor(Math.random() * (h ? N - len + 1 : N));
        const cells = Array.from({ length: len }, (_, k) => (h ? r * N + c + k : (r + k) * N + c));
        const touche = cells.some(x => { const rr = Math.floor(x / N), cc = x % N; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const y = rr + a, z = cc + b; if (y >= 0 && y < N && z >= 0 && z < N && occ.has(y * N + z)) return true; } return false; });
        if (touche) continue;
        cells.forEach(x => occ.add(x)); ships.push(cells); break;
      }
    }
    return ships.length === FLOTTE.length ? ships : placer();
  }
  const coule = (ship, tirs) => ship.every(x => tirs.has(x));
  function grille(ships, tirs, voirBateaux, last, cible) {
    let h = '';
    for (let i = 0; i < N * N; i++) {
      const s = ships ? ships.find(x => x.indexOf(i) >= 0) : null, t = tirs.has(i), cl = [];
      if (s && (voirBateaux || coule(s, tirs))) cl.push('ship');
      if (s && coule(s, tirs)) cl.push('sunk');
      if (t) cl.push(s ? 'hit' : 'miss');
      if (i === last) cl.push('last');
      h += `<div class="${cl.join(' ')}"${cible ? ` data-i="${i}"` : ''}></div>`;
    }
    return h;
  }
  J.ajouter({
    id: 'bataille', nom: 'Bataille navale', ico: '🚢', aux: 'à la bataille navale',
    fins: { flotte: 'Toute la flotte est coulée' },
    etat(d, cs) {
      const fl = { w: null, b: null }, tirs = { w: new Set(), b: new Set() }, last = { w: -1, b: -1 };   // tirs.w : tirs reçus par w
      let n = 0, fin = null;
      for (const c of cs) {
        if (c.flotte) { if (c.role === 'w' || c.role === 'b') fl[c.role] = c.flotte; continue; }
        if (!fl.w || !fl.b || fin) continue;
        const tireur = n % 2 ? 'b' : 'w', cible = tireur === 'w' ? 'b' : 'w';
        tirs[cible].add(c.i); last[cible] = c.i; n++;
        if (fl[cible].every(s => coule(s, tirs[cible]))) fin = { type: 'flotte', gagnant: tireur === 'w' ? d.w : d.b };
      }
      const pret = fl.w && fl.b;
      const aPreparer = [fl.w ? null : d.w, fl.b ? null : d.b].filter(Boolean);
      return { fl, tirs, last, trait: pret ? (n % 2 ? d.b : d.w) : null, aPreparer, fin, ncoups: n };
    },
    ouvrir() {},
    sousJoueur(e, r) { const f = e.fl[r]; return f ? `<span class="muted df-sub">${f.filter(s => coule(s, e.tirs[r])).length}/5 bateaux coulés</span>` : '<span class="muted df-sub">place sa flotte…</span>'; },
    statut(e, c) {
      if (e.fin) return;
      if (!e.trait) {
        if (c.role && !e.fl[c.role]) return 'Place ta flotte, puis « Je suis prêt »';
        return 'En attente : ' + e.aPreparer.map(m => esc(c.memb(m).nom)).join(' et ') + ' place sa flotte';
      }
      if (c.aMoi) return 'À toi : touche une case de ses eaux';
    },
    vue(e, c) {
      const pid = e.p.uid;
      if (c.role && !e.fl[c.role]) {
        brouillon[pid] = brouillon[pid] || placer();
        return `<div class="bn-title"><span>Ta flotte</span></div><div class="sea">${grille(brouillon[pid], new Set(), true, -1, false)}</div>
          <div class="df-btns"><button class="small" data-act="bn-hasard">🔀 Placer au hasard</button><button class="small acc" data-act="bn-pret">Je suis prêt</button></div>`;
      }
      const moi = c.role || 'w', lui = moi === 'w' ? 'b' : 'w';
      const voirLui = !!e.fin || !c.role;
      if (!e.trait && !e.fin) return `<div class="bn-title"><span>Ta flotte est prête</span></div><div class="sea">${grille(e.fl[moi], e.tirs[moi], true, -1, false)}</div>`;
      return `<div class="bn-title"><span>${c.role ? 'Ses eaux' : 'Eaux de ' + esc(c.memb(c.qui(lui)).nom)}</span><span>${e.fl[lui].filter(s => coule(s, e.tirs[lui])).length}/5 coulés</span></div>
        <div class="sea" id="bnCible">${grille(e.fl[lui], e.tirs[lui], voirLui, e.last[lui], c.aMoi)}</div>
        <div class="bn-title"><span>${c.role ? 'Ta flotte' : 'Flotte de ' + esc(c.memb(c.qui(moi)).nom)}</span><span>${e.fl[moi].filter(s => coule(s, e.tirs[moi])).length}/5 coulés</span></div>
        <div class="sea small">${grille(e.fl[moi], e.tirs[moi], true, e.last[moi], false)}</div>`;
    },
    clic(ev, e, c) {
      const pid = e.p.uid;
      const a = ev.target.closest('[data-act]');
      if (a && a.dataset.act === 'bn-hasard') { brouillon[pid] = placer(); c.rendre(); return; }
      if (a && a.dataset.act === 'bn-pret') {
        const f = brouillon[pid] || placer();
        c.jouer({ flotte: f, role: c.role }, { uid: 'coup:' + pid + ':f' + c.role, n: c.role === 'w' ? -2 : -1, txt: 'a placé sa flotte' });
        delete brouillon[pid]; return;
      }
      const cell = ev.target.closest('#bnCible [data-i]'); if (!cell) return;
      if (!c.aMoi) { toast('Ce n\'est pas ton tour'); return; }
      const i = +cell.dataset.i, lui = c.role === 'w' ? 'b' : 'w';
      if (e.tirs[lui].has(i)) return;
      const ship = e.fl[lui].find(s => s.indexOf(i) >= 0);
      const t2 = new Set(e.tirs[lui]); t2.add(i);
      const res = !ship ? 'à l\'eau' : coule(ship, t2) ? 'coulé !' : 'touché !';
      toast(caseNom(i) + ' : ' + (ship ? res.charAt(0).toUpperCase() + res.slice(1) : 'À l\'eau'));
      const nTirs = e.cs.filter(x => !x.flotte).length;
      c.jouer({ i }, { n: nTirs, txt: 'a tiré en ' + caseNom(i) + ' : ' + res });
    }
  });
})();
