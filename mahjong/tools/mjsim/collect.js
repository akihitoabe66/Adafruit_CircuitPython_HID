// 学習用のデータ集め: 4人ともCPUで対局させ、「リーチを受けているとき」の打牌の特徴と、その結果(上がれたか・放銃したか)を記録する。
// 使い方: node collect.js [並列数] [試合数/並列] 。 results/data_*.jsonl に追記
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs'), path = require('path'), os = require('os');
const RES = path.join(__dirname, 'results');
if (!isMainThread) {
  const MJ = require('./harness')(); const A = MJ.AI;
  let cur = []; const out = [];
  const origCS = A.chooseSelf;
  A.chooseSelf = function (game, p, opts) {
    const act = origCS.call(this, game, p, opts);
    try {
      if (act && (act.act === 'discard' || act.act === 'riichi') && act.tile) {
        const opps = game.players.filter((q) => q !== p && q.riichi);
        if (opps.length) {
          const an = A.analyze(game, p, { know: 2 });
          const e = an.evals.find((x) => x.t === act.tile.t);
          if (e) {
            const doraT = game.doraInd.map((d) => MJ.doraOf(d.t)); let dora = 0;
            for (const h of p.hand) if (doraT.includes(h.t) || h.red) dora++;
            for (const m of p.melds) for (const h of m.tiles) if (doraT.includes(h.t) || h.red) dora++;
            cur.push({ s: p.seat, sh: e.sh, ms: an.minSh, n: e.sh === an.minSh ? (e.sh === 0 ? e.wl || 0 : e.ukeire.n) : -1, fu: e.furiten ? 1 : 0, live: game.live.length, f: p.melds.length, dora, dl: p.seat === game.dealer ? 1 : 0, t: e.t, os: opps.map((q) => q.seat), dg: (e.dangerBy || []).map((d) => +d.score.toFixed(1)), odl: opps.map((q) => (q.seat === game.dealer ? 1 : 0)) });
          }
        }
      }
    } catch (err) { /* ignore */ }
    return act;
  };
  const orig = MJ.Game.prototype.playHand;
  MJ.Game.prototype.playHand = async function () {
    cur = []; const r = await orig.call(this);
    if (r && cur.length) {
      const wins = (r.type === 'win' ? r.wins : []).map((w) => ({ w: w.winner.seat, l: w.loser ? w.loser.seat : -1, t: w.winTile ? w.winTile.t : -1, pts: r.delta[w.winner.seat] }));
      for (const rec of cur) {
        const mine = wins.find((w) => w.w === rec.s); if (mine) { rec.win = 1; rec.pts = mine.pts; }
      }
      // 放銃: そのひとが、最後に捨てた牌で、リーチ者にロンされた
      for (const w of wins) if (w.l >= 0) { for (let i = cur.length - 1; i >= 0; i--) if (cur[i].s === w.l && cur[i].t === w.t && cur[i].os.includes(w.w)) { cur[i].dealt = w.w; cur[i].loss = -r.delta[w.l]; break; } }
      for (const rec of cur) { const lw = wins.find((w) => w.l === rec.s); if (lw) { rec.dh = 1; rec.loss = -r.delta[rec.s]; } out.push(rec); } // dh: この局のうちに、誰かにロンされた(放銃)
    }
    return r;
  };
  const run = async (N) => {
    out.length = 0;
    for (let i = 0; i < N; i++) {
      const ids = []; while (ids.length < 4) { const id = 1 + Math.floor(Math.random() * (MJ.CHARS.length - 1)); if (!ids.includes(id)) ids.push(id); }
      const gm = new MJ.Game({ fast: true, allCpu: true, cpuLevel: 4, chars: ids.slice(1).map((i) => MJ.CHARS[i]), length: 'east' });
      gm.players[0].char = Object.assign({}, MJ.CHARS[ids[0]]);
      await gm.run();
    }
    return out.splice(0);
  };
  parentPort.on('message', async (m) => { if (m === 'exit') process.exit(0); parentPort.postMessage(await run(m)); });
  parentPort.postMessage('ready');
} else {
  const P = +process.argv[2] || 4, TOTAL = +process.argv[3] || 400; const CH = 10;
  fs.mkdirSync(RES, { recursive: true }); const file = path.join(RES, 'data.jsonl');
  let sent = 0, got = 0, active = 0, nrec = 0; const t0 = Date.now();
  const feed = (w) => { if (sent >= TOTAL) { w.postMessage('exit'); return; } const n = Math.min(CH, TOTAL - sent); sent += n; w.postMessage(n); };
  for (let i = 0; i < P; i++) {
    const w = new Worker(__filename); active++;
    w.on('message', (m) => { if (m === 'ready') return feed(w); fs.appendFileSync(file, m.map((r) => JSON.stringify(r)).join('\n') + '\n'); nrec += m.length; got += CH; process.stdout.write(`\r${Math.min(got, TOTAL)}/${TOTAL}試合 記録${nrec}件 ${((Date.now() - t0) / 1000).toFixed(0)}秒`); feed(w); });
    w.on('exit', () => { if (--active === 0) console.log('\n完了'); });
  }
}
