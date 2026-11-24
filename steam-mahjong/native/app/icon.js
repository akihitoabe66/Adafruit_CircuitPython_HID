/* 実機: 練習問題の牌の絵は、文字の目印(⟦牌の番号⟧)にして、画面に出すときに本物の牌の絵に置きかえる。coach.js のあと、drill.js の前に読む */
(function (G) { const MJ = G.MJ; MJ.icon = (t) => '⟦' + t + '⟧'; })(globalThis);
