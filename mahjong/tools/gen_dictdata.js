// js/glossary.js(Edge版の用語辞典)から、ゲーム用のデータ native/app/dictdata.js を作る。 node tools/gen_dictdata.js
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '..');
globalThis.window = globalThis; globalThis.MJ = { tileHTML: () => '' };
globalThis.document = { addEventListener() {}, body: { classList: { contains() { return false; } } }, getElementById() { return null; } };
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
eval(fs.readFileSync(path.join(R, 'js', 'glossary.js'), 'utf8'));
const L = MJ.Gloss.list.map((e) => ({ n: e.n, y: e.y, a: (e.a || []).filter((x) => x && x !== e.n && x !== e.y), c: e.c, d: e.d, r: e.r || [], x: e.x || [] }));
fs.writeFileSync(path.join(R, 'native', 'app', 'dictdata.js'), '/* 麻雀用語辞典のデータ(js/glossary.js から tools/gen_dictdata.js で作る。直接は、なおさない) */\n(function (G) { G.MJ = G.MJ || {}; G.MJ.DictData = { cats: ' + JSON.stringify(MJ.Gloss.cats) + ', list: ' + JSON.stringify(L) + ' }; })(globalThis);\n');
console.log(L.length + ' 語');
