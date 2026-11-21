// 雀士ごとの「打ち方の特徴」を測る: 1人を指名して、のこり3人はランダムな雀士と対局。 鳴き・リーチ・ダマ・和了・放銃・平均順位を出す。
// 使い方: node charstats.js [1人あたりの試合数=100] [並列数=4]  → results/charstats.txt
const { Worker, isMainThread, parentPort } = require('worker_threads');
const fs = require('fs'), path = require('path');
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
if (!isMainThread) {
  const MJ = require('./harness')(); const A = MJ.AI; const realRandom = Math.random;
  parentPort.on('message', async (m) => {
    if (m === 'exit') process.exit(0);
    const { id, n } = m; const st = { hands: 0, calls: 0, riichi: 0, wins: 0, dama: 0, open: 0, dealin: 0, rk: 0, pts: 0, tsumo: 0, hon: 0, chi: 0 };
    const ocs = A.chooseSelf, ocr = A.chooseReact;
    A.chooseSelf = function (g, p, o) { const a = ocs.call(this, g, p, o); if (p.seat === 0 && a && a.act === 'riichi') st.riichi++; return a; };
    A.chooseReact = function (g, p, o) { const a = ocr.call(this, g, p, o); if (p.seat === 0 && a && (a.act === 'pon' || a.act === 'chi')) st.calls++; return a; };
    const orig = MJ.Game.prototype.playHand;
    MJ.Game.prototype.playHand = async function () { const r = await orig.call(this); st.hands++; if (r && r.type === 'win') r.wins.forEach((w) => { if (w.winner.seat === 0) { st.wins++; { const ys = (w.res.yaku || []).map((y) => y.n || '').join(','); if (/混一|清一/.test(ys)) st.hon++; if (/七対子/.test(ys)) st.chi++; } if (w.tsumo) st.tsumo++; if (w.winner.melds.length) st.open++; else if (!w.winner.riichi) st.dama++; } if (w.loser && w.loser.seat === 0) st.dealin++; }); return r; };
    for (let g = 0; g < n; g++) {
      Math.random = mulberry(id * 100003 + g * 7919 + 5);
      const pool = MJ.CHARS.filter((c) => c.id > 0 && c.id !== id); const ids = [MJ.CHARS.find((c) => c.id === id)];
      while (ids.length < 4) { const c = pool[Math.floor(Math.random() * pool.length)]; if (!ids.includes(c)) ids.push(c); }
      const gm = new MJ.Game({ fast: true, allCpu: true, cpuLevel: 4, chars: ids.slice(1), length: 'east' });
      gm.players[0].char = Object.assign({}, ids[0]);
      const f = await gm.run(); st.rk += f.order.findIndex((x) => x.seat === 0) + 1; st.pts += gm.players[0].score;
    }
    Math.random = realRandom; A.chooseSelf = ocs; A.chooseReact = ocr; MJ.Game.prototype.playHand = orig;
    parentPort.postMessage({ id, n, st });
  });
  parentPort.postMessage('ready');
} else {
  const N = +process.argv[2] || 100, P = +process.argv[3] || 4; const MJ = require('./harness')();
  const ids = MJ.CHARS.filter((c) => c.id > 0).map((c) => c.id); const out = {}; let next = 0, active = 0; const t0 = Date.now();
  const feed = (w) => { if (next >= ids.length) { w.postMessage('exit'); return; } w.postMessage({ id: ids[next++], n: N }); };
  const report = () => {
    const L = ['id 名前          ★ 鳴き/局 リーチ/局 ダマ和了% 副露和了% 混一色% 七対子% 和了率 放銃率 平均順位'];
    for (const id of ids) { const o = out[id]; if (!o) continue; const c = MJ.CHARS.find((x) => x.id === id), s = o.st, h = s.hands; const pc = (x, d) => (x / d * 100).toFixed(0).padStart(3) + '%';
      L.push(String(id).padStart(2) + ' ' + c.short.padEnd(8, '　') + ' ' + String(c.level).padStart(2) + ' ' + (s.calls / h).toFixed(2).padStart(6) + ' ' + (s.riichi / h).toFixed(2).padStart(8) + '  ' + pc(s.dama, Math.max(1, s.wins)).padStart(8) + ' ' + pc(s.open, Math.max(1, s.wins)).padStart(8) + ' ' + pc(s.hon, Math.max(1, s.wins)).padStart(7) + ' ' + pc(s.chi, Math.max(1, s.wins)).padStart(7) + ' ' + pc(s.wins, h).padStart(6) + ' ' + pc(s.dealin, h).padStart(6) + '  ' + (s.rk / o.n).toFixed(2)); }
    return L.join('\n');
  };
  for (let i = 0; i < P; i++) {
    const w = new Worker(__filename); active++;
    w.on('message', (m) => { if (m === 'ready') return feed(w); out[m.id] = m; process.stdout.write(`\r${Object.keys(out).length}/${ids.length} ${((Date.now() - t0) / 1000).toFixed(0)}秒`); feed(w); });
    w.on('exit', () => { if (--active === 0) { const t = report(); fs.writeFileSync(path.join(__dirname, 'results', 'charstats.txt'), t + '\n'); console.log('\n' + t); } });
  }
}
