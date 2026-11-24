// 麻雀の対戦シミュレーション(Node.js だけで動く)。使い方: node sim.js [並列数=7] [各型の試合数=4000]
// 結果は results/ に保存(途中で止めても、もう一度 node sim.js で続きから)。 results/summary.txt が、まとめの表。
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const VARIANTS = ['cpu', 'defense', 'balance', 'attack', 'defense-saki', 'balance-saki', 'attack-saki', 'balance-notype'];
const CHUNK = 250, RES = path.join(__dirname, 'results');

if (!isMainThread) {
  const g = globalThis; g.window = g; const ls = {};
  g.localStorage = { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } };
  g.document = { documentElement: { classList: { add() {}, remove() {}, contains() { return false; } } }, body: { classList: { add() {}, remove() {}, contains() { return false; } } }, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} }; }, getElementById() { return null; } };
  g.navigator = { userAgent: 'node', platform: '', maxTouchPoints: 0 }; g.location = { protocol: 'file:', search: '' };
  g.addEventListener = () => {}; g.requestAnimationFrame = (f) => setTimeout(f, 0);
  for (const f of ['tiles', 'rules', 'forms', 'chars', 'chars2', 'ai', 'game']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'js', f + '.js'), 'utf8'), { filename: f + '.js' });
  const MJ = g.MJ; try { MJ.loadRules && MJ.loadRules(); } catch (e) { /* ignore */ }
  const run = async (V, N) => {
    const rk = [0, 0, 0, 0]; let hands = 0, wins = 0, dealin = 0, sumScore = 0, sumPt = 0; const PT = [30, 10, -10, -30];
    const type = V.split('-')[0], saki = /saki/.test(V), notype = /notype/.test(V);
    const orig = MJ.Game.prototype.playHand;
    MJ.Game.prototype.playHand = async function () { const r = await orig.call(this); hands++; if (r && r.type === 'win') r.wins.forEach((w) => { if (w.winner.seat === 0) wins++; if (w.loser && w.loser.seat === 0) dealin++; }); return r; };
    for (let i = 0; i < N; i++) {
      const gm = new MJ.Game({ fast: true, allCpu: true, cpuLevel: 4, chars: [MJ.CHARS[1], MJ.CHARS[3], MJ.CHARS[5]], length: 'east' });
      gm.players[0].char = Object.assign({}, gm.players[0].char, { style: 'balanced', level: 4, ai: 4 });
      if (type !== 'cpu') { gm.players[0].coachType = type; gm.players[0].coachSaki = saki; gm.players[0].coachNoType = notype; }
      const f = await gm.run(); const rank = f.order.findIndex((x) => x.seat === 0); rk[rank]++; sumScore += gm.players[0].score; sumPt += PT[rank];
    }
    MJ.Game.prototype.playHand = orig;
    return { variant: V, games: N, ranks: rk, hands, wins, dealin, sumScore, sumPt };
  };
  parentPort.on('message', async (m) => { if (m === 'exit') process.exit(0); parentPort.postMessage(await run(m.v, m.n)); });
  parentPort.postMessage('ready');
} else {
  const P = +process.argv[2] || Math.max(1, os.cpus().length - 1), N = +process.argv[3] || 4000;
  fs.mkdirSync(RES, { recursive: true });
  const done = {}; for (const v of VARIANTS) { const f = path.join(RES, v + '.jsonl'); done[v] = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).reduce((a, l) => a + JSON.parse(l).games, 0) : 0; }
  const queued = Object.assign({}, done);
  const next = () => { // いちばん進んでいない型から、1つずつ配る(全部の型が、同じペースで進む)
    let best = null; for (const v of VARIANTS) if (queued[v] < N && (best === null || queued[v] < queued[best])) best = v;
    if (!best) return null; const n = Math.min(CHUNK, N - queued[best]); queued[best] += n; return { v: best, n };
  };
  const summary = () => {
    const lines = ['型              試合   1位  2位  3位  4位  平均順位  和了率  放銃率  平均pt'];
    for (const v of VARIANTS) {
      const f = path.join(RES, v + '.jsonl'); if (!fs.existsSync(f)) continue;
      const rows = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(JSON.parse); if (!rows.length) continue;
      const n = rows.reduce((a, r) => a + r.games, 0), rk = [0, 1, 2, 3].map((i) => rows.reduce((a, r) => a + r.ranks[i], 0));
      const h = rows.reduce((a, r) => a + r.hands, 0), w = rows.reduce((a, r) => a + r.wins, 0), d = rows.reduce((a, r) => a + r.dealin, 0), pt = rows.reduce((a, r) => a + r.sumPt, 0);
      const avg = (rk[0] + rk[1] * 2 + rk[2] * 3 + rk[3] * 4) / n;
      lines.push(v.padEnd(15) + String(n).padStart(5) + rk.map((x) => String(x).padStart(5)).join('') + ('   ' + avg.toFixed(3)).padStart(9) + (' ' + (w / h * 100).toFixed(1) + '%').padStart(8) + (' ' + (d / h * 100).toFixed(1) + '%').padStart(8) + (' ' + (pt / n).toFixed(2)).padStart(8));
    }
    const t = lines.join('\n') + '\n(誤差の目安: 平均順位 ±' + (1.12 / Math.sqrt(Math.max(1, Math.min(...VARIANTS.map((v) => queued[v]))))).toFixed(3) + ')\n';
    fs.writeFileSync(path.join(RES, 'summary.txt'), t); return t;
  };
  let active = 0, finished = false;
  const workers = [];
  const feed = (w) => { const j = next(); if (!j) { w.postMessage('exit'); if (--active === 0 && !finished) { finished = true; console.log(summary()); console.log('完了'); } return; } w.postMessage(j); };
  for (let i = 0; i < P; i++) {
    const w = new Worker(__filename); active++; workers.push(w);
    w.on('message', (m) => { if (m === 'ready') return feed(w); fs.appendFileSync(path.join(RES, m.variant + '.jsonl'), JSON.stringify(m) + '\n'); console.log(summary()); feed(w); });
    w.on('error', (e) => { console.error('エラー', e); });
  }
  if (!next.length && false) { /* noop */ }
  console.log('開始: 並列 ' + P + ' / 各型 ' + N + ' 試合(すでに終わった分は、続きから)');
}
