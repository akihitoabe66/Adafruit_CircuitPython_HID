/* 開発用の近道: index.html?quick=1 で開くと、タイトルとメニューを飛ばして、新キャラ3人との対局がすぐ始まる。
   ?quick=1&seed=名前,名前,名前 で、相手を指定できる(例: ?quick=1&seed=源造,ナオミ,ショウ) */
(function (G) {
  const q = new URLSearchParams(G.location.search);
  if (!q.has('quick') && G.location.hash !== '#quick') return; // ?quick=1 か #quick
  G.addEventListener('load', () => setTimeout(() => {
    try {
      const MJ = G.MJ, names = (q.get('seed') || '').split(',').filter(Boolean);
      let ids = names.map((n) => (MJ.CHARS.find((c) => c.short === n) || {}).id).filter(Boolean);
      if (ids.length !== 3) ids = MJ.shuffle(MJ.CHARS.slice()).slice(0, 3).map((c) => c.id);
      const b = document.querySelector('#btn-start'); if (b) b.click();
      setTimeout(() => { MJ.App.picks = ids; MJ.App.mode = 'free'; MJ.App.start(); }, 500);
    } catch (e) { console.error(e); }
  }, 800));
})(window);
