// 麻雀AIの学習・測定用の共通部品(Node.jsだけで動く)。js/ の中身を、そのまま読み込む
const fs = require('fs'), path = require('path'), vm = require('vm');
module.exports = function load(dir) {
  dir = dir || path.join(__dirname, '..', '..', 'js');
  const g = globalThis; g.window = g; const ls = {};
  g.localStorage = { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } };
  g.document = { documentElement: { classList: { add() {}, remove() {}, contains() { return false; } } }, body: { classList: { add() {}, remove() {}, contains() { return false; } } }, addEventListener() {} };
  g.navigator = { userAgent: 'node', platform: '', maxTouchPoints: 0 }; g.location = { protocol: 'file:', search: '' };
  g.addEventListener = () => {}; g.requestAnimationFrame = (f) => setTimeout(f, 0);
  for (const f of ['tiles', 'rules', 'forms', 'chars', 'chars2', 'ai', 'aitable', 'game']) {
    const p = path.join(dir, f + '.js'); if (!fs.existsSync(p)) continue;
    vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: f + '.js' });
  }
  const MJ = g.MJ; try { MJ.loadRules && MJ.loadRules(); } catch (e) { /* ignore */ }
  return MJ;
};
