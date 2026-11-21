// 集めたデータから、「この牌を切ったときの 上がり点の期待値(W)」と「放銃で払う点の期待値(Ls)」の表を作る(段ごとに、ならして)。 node fit2.js [data.jsonl...] → js/ai.js の表を差しかえ
const fs = require('fs'), path = require('path');
const files = process.argv.slice(2).length ? process.argv.slice(2) : [path.join(__dirname, 'results', 'data.jsonl')];
const rows = [];
for (const f of files) for (const l of fs.readFileSync(f, 'utf8').split('\n')) { if (!l) continue; try { rows.push(JSON.parse(l)); } catch (e) { /* ignore */ } }
const LB2 = (l) => (l <= 10 ? 0 : l <= 22 ? 1 : 2);
const NB0 = (n) => (n <= 0 ? 0 : n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 3 : n <= 6 ? 4 : 5);
const NB1 = (n) => (n < 0 ? 0 : n <= 3 ? 1 : n <= 7 ? 2 : n <= 11 ? 3 : n <= 15 ? 4 : n <= 19 ? 5 : 6);
const DB = (d) => (d <= 0 ? 0 : d <= 2 ? 1 : d <= 4 ? 2 : d <= 6 ? 3 : d <= 8 ? 4 : d <= 11 ? 5 : d <= 14 ? 6 : d <= 18 ? 7 : 8);
const feat = (r) => { const sh = Math.min(r.sh, 3), on = r.n >= 0 ? 1 : 0, nb = r.sh === 0 ? NB0(r.n) : (r.n < 0 ? 0 : NB1(r.n)); const dm = r.dg.length ? Math.max(...r.dg) : 0; return { sh, on, nb, lb: LB2(r.live), db: DB(dm), np: r.os.length > 1 ? 1 : 0, op: r.f > 0 ? 1 : 0 }; };
const K = 40;
// 3段: A=(sh,on,db,np,op) → B=+nb → C=+lb
const lv = [(f) => `${f.sh}|${f.on}|${f.db}|${f.np}|${f.op}`, (f) => `${f.sh}|${f.on}|${f.db}|${f.np}|${f.op}|${f.nb}`, (f) => `${f.sh}|${f.on}|${f.db}|${f.np}|${f.op}|${f.nb}|${f.lb}`];
const acc = [{}, {}, {}]; let gW = 0, gL = 0;
for (const r of rows) {
  const f = feat(r), w = r.win ? r.pts : 0, l = r.dh ? r.loss : 0; gW += w; gL += l;
  for (let i = 0; i < 3; i++) { const k = lv[i](f); const a = acc[i][k] || (acc[i][k] = [0, 0, 0]); a[0]++; a[1] += w; a[2] += l; }
}
gW /= rows.length; gL /= rows.length;
const val = (f, which) => { // which: 1=W 2=Ls
  let v = which === 1 ? gW : gL;
  for (let i = 0; i < 3; i++) { const a = acc[i][lv[i](f)]; if (a) v = (a[which] + K * v) / (a[0] + K); }
  return Math.round(v);
};
const Q = {};
for (let sh = 0; sh < 4; sh++) for (const on of [0, 1]) for (let nb = 0; nb < 7; nb++) for (let lb = 0; lb < 3; lb++) for (let db = 0; db < 9; db++) for (let np = 0; np < 2; np++) for (let op = 0; op < 2; op++) {
  const f = { sh, on, nb, lb, db, np, op }; Q[`${sh}|${on}|${nb}|${lb}|${db}|${np}|${op}`] = [val(f, 1), val(f, 2)];
}
fs.writeFileSync(path.join(__dirname, 'results', 'q.json'), JSON.stringify({ rows: rows.length }));
const wr = rows.filter((r) => r.win), lr = rows.filter((r) => r.dh);
const tbl = JSON.stringify({ Q, vAvg: Math.round(wr.reduce((a, r) => a + r.pts, 0) / (wr.length || 1)), lAvg: Math.round(lr.reduce((a, r) => a + r.loss, 0) / (lr.length || 1)), rows: rows.length });
const aiPath = path.join(__dirname, '..', '..', 'js', 'ai.js'); let ai = fs.readFileSync(aiPath, 'utf8');
ai = ai.replace(/\/\*TABLE-BEGIN\*\/[\s\S]*?\/\*TABLE-END\*\//, () => '/*TABLE-BEGIN*/ MJ.AI_TABLE = ' + tbl + '; /*TABLE-END*/');
fs.writeFileSync(aiPath, ai);
console.log('records', rows.length, 'avg W', Math.round(gW), 'avg L', Math.round(gL), 'table bytes', tbl.length);
for (const db of [0, 4, 6, 8]) console.log('sh1 on nb3 db' + db, Q[`1|1|3|1|${db}|0|0`], ' sh0 on nb3', Q[`0|1|3|1|${db}|0|0`], ' sh1 off', Q[`1|0|0|1|${db}|0|0`]);
