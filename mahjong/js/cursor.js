/* マウスカーソルを、使っていないときは消す。わずかなゆれ(10px未満)では出さない。キー・コントローラーを使ったら、すぐ消す。 */
(function (G) {
  const h = document.documentElement;
  if (/[?&]safe=1/.test(G.location.search)) { (G.MJ = G.MJ || {}).hideCursor = () => {}; return; } // 安全モード(start_safe.bat): カーソルは消さない
  let t = 0, ax = -1, ay = -1, keyAt = 0;
  const hide = () => { clearTimeout(t); h.classList.add('nocur'); };
  const keyHide = () => { keyAt = Date.now(); hide(); }; // キー・コントローラーで消したあと少しの間は、画面が動いて起きる見かけのマウス移動を、無視する
  const show = () => { h.classList.remove('nocur'); clearTimeout(t); t = setTimeout(hide, 1200); };
  hide();
  G.addEventListener('mousemove', (e) => {
    if (Date.now() - keyAt < 700) return;
    if (h.classList.contains('nocur')) { if (Math.abs(e.clientX - ax) + Math.abs(e.clientY - ay) < 16) return; show(); } else show();
    ax = e.clientX; ay = e.clientY;
  }, { passive: true });
  G.addEventListener('keydown', keyHide, true);
  G.addEventListener('mousedown', show, true);
  (G.MJ = G.MJ || {}).hideCursor = keyHide; // コントローラーの操作からも呼ぶ
})(typeof window !== 'undefined' ? window : globalThis);
