// 見本ページを画像にする: node tools/ui_mock/render.js 出力フォルダ  (steam-mahjong/ で、python3 -m http.server 8127 を動かしておく)
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '.'; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const [v, q] of [['a', ''], ['b', ''], ['c', ''], ['d', ''], ['e', '&seat=right&w=ロン'], ['e', '&seat=top&w=ポン'], ['r', '']]) { await p.goto(`http://localhost:8127/tools/ui_mock/mock.html?v=${v}${q}`); await p.waitForTimeout(900); await p.screenshot({ path: `${out}/ui_mock_${v}${q ? '_' + decodeURIComponent(q).split('&').pop().split('=')[1] + (q.includes('top') ? '_top' : '_right') : ''}.png` }); }
  await b.close();
})();
