/* マウスカーソルを、使っていないときは消す。わずかなゆれ(10px未満)では出さない。キー・コントローラーを使ったら、すぐ消す。 */
(function (G) {
  const h = document.documentElement;
  let t = 0, ax = -1, ay = -1;
  const hide = () => { clearTimeout(t); h.classList.add('nocur'); };
  const show = () => { h.classList.remove('nocur'); clearTimeout(t); t = setTimeout(hide, 1200); };
  hide();
  G.addEventListener('mousemove', (e) => {
    if (h.classList.contains('nocur')) { if (Math.abs(e.clientX - ax) + Math.abs(e.clientY - ay) < 10) return; show(); } else show();
    ax = e.clientX; ay = e.clientY;
  }, { passive: true });
  G.addEventListener('keydown', hide, true);
  G.addEventListener('mousedown', show, true);
  (G.MJ = G.MJ || {}).hideCursor = hide; // コントローラーの操作からも呼ぶ
})(typeof window !== 'undefined' ? window : globalThis);
