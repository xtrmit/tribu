/* Tribu — moteur d'échecs (règles complètes : roque, prise en passant, promotion, échec, mat, pat)
   et pièces dessinées en SVG. Aucune dépendance. Exposé dans window.Echecs. */
(function () {
  'use strict';
const BASE = '<path d="M24 80 h52 a4 4 0 0 1 4 4 v4 a3 3 0 0 1 -3 3 h-54 a3 3 0 0 1 -3 -3 v-4 a4 4 0 0 1 4 -4z"/>';
  const PZ = {
   P: '<circle cx="50" cy="28" r="12"/><path d="M37 42 h26 l-4 7 h-18z"/><path d="M42 49 C41 62 34 70 30 80 h40 C66 70 59 62 58 49z"/>' + BASE,
   R: '<path d="M28 16 h9 v8 h7 v-8 h12 v8 h7 v-8 h9 v18 l-7 6 v30 l7 8 h-44 l7 -8 v-30 l-7 -6z"/><path class="ln" d="M35 40 h30 M35 70 h30"/>' + BASE,
   B: '<circle cx="50" cy="13" r="5"/><path d="M50 19 C34 30 32 46 39 56 h22 C68 46 66 30 50 19z"/><path class="ln" d="M56 30 L46 44"/><path d="M37 56 h26 v7 h-26z"/><path d="M41 63 C40 71 34 75 30 80 h40 C66 75 60 71 59 63z"/>' + BASE,
   N: '<path d="M70 80 H30 C29 68 34 60 44 54 C38 52 30 55 24 50 C19 46 20 40 25 36 L39 24 C41 18 45 13 49 10 L52 19 C66 21 77 34 76 52 C75 64 70 72 70 80 Z"/><circle class="eye" cx="40" cy="31" r="3"/><path class="ln" d="M52 22 C62 28 68 40 66 56"/>' + BASE,
   Q: '<path d="M26 72 L19 32 L33 52 L35 25 L44 50 L50 20 L56 50 L65 25 L67 52 L81 32 L74 72 Z"/><circle cx="19" cy="29" r="5"/><circle cx="35" cy="22" r="5"/><circle cx="50" cy="16" r="5"/><circle cx="65" cy="22" r="5"/><circle cx="81" cy="29" r="5"/><path d="M26 72 h48 v8 h-48z"/>' + BASE,
   K: '<path d="M46 6 h8 v8 h8 v8 h-8 v12 h-8 v-12 h-8 v-8 h8z"/><path d="M28 72 C20 56 24 38 37 38 C44 38 48 44 50 50 C52 44 56 38 63 38 C76 38 80 56 72 72 Z"/><path d="M27 72 h46 v8 h-46z"/><path class="ln" d="M36 62 h28"/>' + BASE
  };
  function svg(t, col){ return `<svg viewBox="0 0 100 100" class="pz ${col}">${PZ[t]}</svg>`; }
  
  const FR = { K:'R', Q:'D', R:'T', B:'F', N:'C', P:'' };
  function start(){
    const b = Array(64).fill(null), back = ['R','N','B','Q','K','B','N','R'];
    for (let c=0;c<8;c++){ b[c]='b'+back[c]; b[8+c]='bP'; b[48+c]='wP'; b[56+c]='w'+back[c]; }
    return { b, turn:'w', cs:{wK:1,wQ:1,bK:1,bQ:1}, ep:-1, hist:[], last:null, caps:{w:[],b:[]}, over:null };
  }
  const rc = i => [i>>3, i&7], idx = (r,c) => r*8+c, ok = (r,c) => r>=0&&r<8&&c>=0&&c<8;
  function attacked(b, sq, by){
    const [r,c] = rc(sq);
    const pd = by==='w' ? 1 : -1;
    for (const dc of [-1,1]) { const rr=r+pd, cc=c+dc; if (ok(rr,cc) && b[idx(rr,cc)]===by+'P') return true; }
    for (const [dr,dc] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) { const rr=r+dr,cc=c+dc; if (ok(rr,cc)&&b[idx(rr,cc)]===by+'N') return true; }
    for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) { if(!dr&&!dc) continue; const rr=r+dr,cc=c+dc; if (ok(rr,cc)&&b[idx(rr,cc)]===by+'K') return true; }
    const rays = [[1,0,'RQ'],[-1,0,'RQ'],[0,1,'RQ'],[0,-1,'RQ'],[1,1,'BQ'],[1,-1,'BQ'],[-1,1,'BQ'],[-1,-1,'BQ']];
    for (const [dr,dc,t] of rays) { let rr=r+dr,cc=c+dc; while (ok(rr,cc)) { const p=b[idx(rr,cc)]; if (p) { if (p[0]===by && t.includes(p[1])) return true; break; } rr+=dr; cc+=dc; } }
    return false;
  }
  function pseudo(s, col){
    const b=s.b, out=[], opp = col==='w'?'b':'w';
    for (let i=0;i<64;i++){
      const p=b[i]; if (!p||p[0]!==col) continue; const t=p[1], [r,c]=rc(i);
      const add=(to,extra)=>out.push(Object.assign({from:i,to},extra||{}));
      if (t==='P'){
        const d = col==='w'?-1:1, sr = col==='w'?6:1, pr = col==='w'?0:7;
        const push=(to,ex)=>{ if ((to>>3)===pr) ['Q','R','B','N'].forEach(q=>add(to,Object.assign({promo:q},ex))); else add(to,ex); };
        if (ok(r+d,c) && !b[idx(r+d,c)]) { push(idx(r+d,c)); if (r===sr && !b[idx(r+2*d,c)]) add(idx(r+2*d,c),{dbl:1}); }
        for (const dc of [-1,1]) { const rr=r+d, cc=c+dc; if (!ok(rr,cc)) continue; const to=idx(rr,cc);
          if (b[to] && b[to][0]===opp) push(to); else if (to===s.ep) add(to,{epc:1}); }
      } else if (t==='N' || t==='K'){
        const dl = t==='N' ? [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]] : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
        for (const [dr,dc] of dl){ const rr=r+dr,cc=c+dc; if (!ok(rr,cc)) continue; const q=b[idx(rr,cc)]; if (!q||q[0]===opp) add(idx(rr,cc)); }
        if (t==='K' && !attacked(b,i,opp)){
          const row = col==='w'?7:0;
          if (s.cs[col+'K'] && !b[idx(row,5)] && !b[idx(row,6)] && b[idx(row,7)]===col+'R' && !attacked(b,idx(row,5),opp) && !attacked(b,idx(row,6),opp)) add(idx(row,6),{castle:'K'});
          if (s.cs[col+'Q'] && !b[idx(row,1)] && !b[idx(row,2)] && !b[idx(row,3)] && b[idx(row,0)]===col+'R' && !attacked(b,idx(row,3),opp) && !attacked(b,idx(row,2),opp)) add(idx(row,2),{castle:'Q'});
        }
      } else {
        const dirs = t==='R'?[[1,0],[-1,0],[0,1],[0,-1]] : t==='B'?[[1,1],[1,-1],[-1,1],[-1,-1]] : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
        for (const [dr,dc] of dirs){ let rr=r+dr,cc=c+dc; while(ok(rr,cc)){ const q=b[idx(rr,cc)]; if (!q) add(idx(rr,cc)); else { if (q[0]===opp) add(idx(rr,cc)); break; } rr+=dr; cc+=dc; } }
      }
    }
    return out;
  }
  function apply(s, m){
    const n = { b:s.b.slice(), turn: s.turn==='w'?'b':'w', cs:Object.assign({},s.cs), ep:-1, hist:s.hist.slice(), last:{from:m.from,to:m.to}, caps:{w:s.caps.w.slice(),b:s.caps.b.slice()}, over:null };
    const b=n.b, p=b[m.from], col=p[0];
    let cap = b[m.to];
    if (m.epc){ const ci = m.to + (col==='w'?8:-8); cap=b[ci]; b[ci]=null; }
    if (cap) n.caps[col].push(cap);
    b[m.to] = m.promo ? col+m.promo : p; b[m.from]=null;
    if (m.castle){ const row=m.from>>3; if (m.castle==='K'){ b[idx(row,5)]=b[idx(row,7)]; b[idx(row,7)]=null; } else { b[idx(row,3)]=b[idx(row,0)]; b[idx(row,0)]=null; } }
    if (m.dbl) n.ep = (m.from+m.to)/2;
    if (p[1]==='K'){ n.cs[col+'K']=0; n.cs[col+'Q']=0; }
    for (const [sq,k] of [[63,'wK'],[56,'wQ'],[7,'bK'],[0,'bQ']]) if (m.from===sq||m.to===sq) n.cs[k]=0;
    m._cap = !!cap;
    return n;
  }
  const kingSq = (b,col) => b.indexOf(col+'K');
  function legal(s, col){ col = col || s.turn; const opp = col==='w'?'b':'w'; return pseudo(s,col).filter(m => { const n=apply(s,m); return !attacked(n.b, kingSq(n.b,col), opp); }); }
  const sqName = i => 'abcdefgh'[i&7] + (8-(i>>3));
  function play(s, m){
    const p = s.b[m.from], n = apply(s, m);
    const opp = n.turn, inChk = attacked(n.b, kingSq(n.b,opp), s.turn), nb = legal(n).length;
    let not = m.castle ? (m.castle==='K'?'O-O':'O-O-O') : (FR[p[1]] || (m._cap ? 'abcdefgh'[m.from&7] : '')) + (m._cap?'x':'') + sqName(m.to) + (m.promo?'='+FR[m.promo]:'');
    if (inChk) not += nb ? '+' : '#';
    n.hist.push(not);
    if (!nb) n.over = inChk ? { type:'mat', winner:s.turn } : { type:'pat' };
    return n;
  }

  // Rejoue une liste de coups { f, t, q } depuis la position de départ.
  function rejouer(coups) {
    let s = start();
    for (const c of coups) {
      const m = legal(s).find(x => x.from === c.f && x.to === c.t && (x.promo || '') === (c.q || ''));
      if (!m) break;            // coup invalide : on s'arrête là
      s = play(s, m);
    }
    return s;
  }
  const enEchec = s => attacked(s.b, kingSq(s.b, s.turn), s.turn === 'w' ? 'b' : 'w');
  window.Echecs = { start, legal, play, rejouer, kingSq, enEchec, svg, sqName };
})();
