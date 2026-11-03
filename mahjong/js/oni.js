/* 雀鬼モード・覚醒: 強い人向けの「チャレンジモード」。いつでも、設定で、ふつうに戻せる。
   ・雀鬼モード: 相手3人の強さ(★)が1つ上がる。顔の背景は赤
   ・覚醒: 相手3人の強さが2つ上がる。顔の背景は金色(雀鬼モードで昇段する、または六段になると、解放される)
   段位のポイントのしくみは、ふつうのモードと同じ(バランスを変えない)。 */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const KEY = 'mj_oni';
  const load = () => { try { return Object.assign({ mode: 'off', awake: false }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { mode: 'off', awake: false }; } };
  const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } };
  const O = (MJ.Oni = {
    JP: { off: 'ふつう', oni: '雀鬼モード', awake: '覚醒' },
    NOTE: { off: '相手は、ふつうの強さです。', oni: '相手3人の強さが ★1つ 上がります(顔の背景: 赤)。', awake: '相手3人の強さが ★2つ 上がります(顔の背景: 金)。' },
    mode() { const o = load(); return o.mode === 'awake' && !o.awake ? 'off' : o.mode; },
    awakeOK() { return !!load().awake; },
    set(m) { const o = load(); if (m === 'awake' && !o.awake) return false; o.mode = m; save(o); if (m !== 'off') O.ready(); return true; },
    next() { const o = load(); const order = o.awake ? ['off', 'oni', 'awake'] : ['off', 'oni']; const i = order.indexOf(O.mode()); O.set(order[(i + 1) % order.length]); return O.mode(); },
    /* 赤・金の顔の画像(大きいので、使うときだけ読み込む)。読み込めたら解決する */
    ready() {
      if (MJ.OniFaces) return Promise.resolve();
      if (!O._p) O._p = new Promise((ok) => { const sc = document.createElement('script'); sc.src = 'js/oni_faces.js?v=' + (MJ.VER || 1); sc.onload = sc.onerror = () => ok(); document.head.appendChild(sc); setTimeout(ok, 8000); });
      return O._p;
    },
    boost() { return { off: 0, oni: 1, awake: 2 }[O.mode()] || 0; },
    /* 対局の相手に、強さの上乗せと、顔の色の印をつける(元のデータは書き換えない) */
    apply(chars) {
      const b = O.boost(), m = O.mode();
      if (!b) return chars;
      return chars.map((c) => Object.assign({}, c, { level: Math.min(10, c.level + b), ai: c.ai ? Math.min(10, c.ai + b) : c.ai, oni: m }));
    },
    /* 対局が終わったとき: 覚醒の解放を調べる。解放されたら、お知らせの文(HTML)を返す。
       雀鬼モードで昇段 → 解放 / ふつうのモードでも、六段になったら解放 */
    afterGame(rk, maxdan) {
      const o = load();
      if (o.awake || !rk) return '';
      const viaOni = rk.promoted && O.mode() !== 'off';
      if (viaOni) { o.awake = true; save(o); return '<div class="oni-note"><b>🔥 雀鬼モードに「覚醒」が追加されました!</b><span>設定の「対局モード」で切り替えられます(相手の強さ ★2つ 上がる)。</span></div>'; }
      if ((maxdan || 0) >= 6) { o.awake = true; save(o); return '<div class="oni-note"><b>🔥 「覚醒」が解放されました!</b><span>六段になりました。設定の「対局モード」で、雀鬼モード・覚醒に切り替えられます。</span></div>'; }
      return '';
    },
  });
  if (O.mode() !== 'off') O.ready(); // 前回の設定が雀鬼モード・覚醒なら、顔の画像を、先に読み込んでおく
})(typeof window !== 'undefined' ? window : globalThis);
