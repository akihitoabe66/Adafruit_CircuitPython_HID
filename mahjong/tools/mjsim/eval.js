// 強さの測定: 1席だけ「新しい押し引き」、のこり3席は「前の押し引き」で対局し、平均順位などを比べる。
// 使い方: node eval.js <名前> <試合数> [並列数] [パラメータJSON]  例: node eval.js v2 2000 4 '{"kL":1.2}'  / 名前が old なら、全員 前のまま(基準)
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs'), path = require('path');
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
if (!isMainThread) {
  const MJ = require('./harness')(); const A = MJ.AI;
  const pool = MJ.CHARS.filter((c) => c.id > 0 && c.ai >= 4);
  const realRandom = Math.random;
  parentPort.on('message', async (m) => {
    if (m === 'exit') process.exit(0);
    const { name, from, to, params, all } = m; A.V2 = false; if (params) Object.assign(A.EVP, params);
    const rk = [0, 0, 0, 0]; let sumScore = 0, hands = 0, wins = 0, dealin = 0, fh = 0, fd = 0, fw = 0, fsum = 0, asum = 0, faced = false;
    const ocs = A.chooseSelf; A.chooseSelf = function (game, p, opts) { if (p.seat === 0 && game.players.some((q) => q !== p && q.riichi)) faced = true; return ocs.call(this, game, p, opts); };
    const orig = MJ.Game.prototype.playHand;
    MJ.Game.prototype.playHand = async function () { faced = false; const r = await orig.call(this); hands++; asum += r.delta ? r.delta[0] : 0; if (faced) { fh++; fsum += r.delta ? r.delta[0] : 0; if (r.type === 'win') { if (r.wins.some((w) => w.winner.seat === 0)) fw++; if (r.wins.some((w) => w.loser && w.loser.seat === 0)) fd++; } } if (r && r.type === 'win') r.wins.forEach((w) => { if (w.winner.seat === 0) wins++; if (w.loser && w.loser.seat === 0) dealin++; }); return r; };
    for (let g = from; g < to; g++) {
      Math.random = mulberry(g * 7919 + 13);
      const ids = []; while (ids.length < 4) { const c = pool[Math.floor(Math.random() * pool.length)]; if (!ids.includes(c)) ids.push(c); }
      const gm = new MJ.Game({ fast: true, allCpu: true, cpuLevel: 4, chars: ids.slice(1), length: 'east' });
      gm.players[0].char = Object.assign({}, ids[0]); gm.players[0].v2 = name === 'v2'; const pm = /^patch(\d)/.exec(name); gm.players[0].patch = pm ? +pm[1] : 0;
      for (let i = 1; i < 4; i++) gm.players[i].v2 = !!all;
      const f = await gm.run(); rk[f.order.findIndex((x) => x.seat === 0)]++; sumScore += gm.players[0].score;
    }
    Math.random = realRandom; MJ.Game.prototype.playHand = orig; A.chooseSelf = ocs;
    parentPort.postMessage({ rk, sumScore, hands, wins, dealin, fh, fd, fw, fsum, asum, n: to - from });
  });
  parentPort.postMessage('ready');
} else {
  const name = process.argv[2] || 'v2', N = +process.argv[3] || 1000, P = +process.argv[4] || 4, params = process.argv[5] ? JSON.parse(process.argv[5]) : null, all = process.argv[6] === 'all';
  const CH = 25; let next = 0, active = 0; const tot = { rk: [0, 0, 0, 0], sumScore: 0, hands: 0, wins: 0, dealin: 0, fh: 0, fd: 0, fw: 0, fsum: 0, asum: 0, n: 0 }; const t0 = Date.now();
  const feed = (w) => { if (next >= N) { w.postMessage('exit'); return; } const from = next; next = Math.min(N, next + CH); w.postMessage({ name, from, to: next, params, all }); };
  const report = () => { const n = tot.n, avg = (tot.rk[0] + 2 * tot.rk[1] + 3 * tot.rk[2] + 4 * tot.rk[3]) / n; return `${name}${params ? JSON.stringify(params) : ''} 試合${n} 順位 ${tot.rk.join('/')} 平均順位 ${avg.toFixed(3)} 平均点 ${Math.round(tot.sumScore / n)} 和了率 ${(tot.wins / tot.hands * 100).toFixed(1)}% 放銃率 ${(tot.dealin / tot.hands * 100).toFixed(1)}% | リーチを受けた局${tot.fh}: 放銃${(tot.fd / tot.fh * 100).toFixed(1)}% 和了${(tot.fw / tot.fh * 100).toFixed(1)}% 1局の増減${Math.round(tot.fsum / tot.fh)}点 | 全局の増減${Math.round(tot.asum / tot.hands)}点 (誤差±${(1.12 / Math.sqrt(n)).toFixed(3)}) ${((Date.now() - t0) / 1000).toFixed(0)}秒`; };
  for (let i = 0; i < P; i++) {
    const w = new (require('worker_threads').Worker)(__filename); active++;
    w.on('message', (m) => { if (m === 'ready') return feed(w); for (const k of ['sumScore', 'hands', 'wins', 'dealin', 'fh', 'fd', 'fw', 'fsum', 'asum', 'n']) tot[k] += m[k]; m.rk.forEach((x, i) => { tot.rk[i] += x; }); feed(w); });
    w.on('exit', () => { if (--active === 0) { console.log(report()); fs.appendFileSync(path.join(__dirname, 'results', 'eval.log'), report() + '\n'); } });
  }
}
