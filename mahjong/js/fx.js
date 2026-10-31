/* 演出の強さ: 豪華 / ふつう / 軽量。body に fx-full / fx-normal / fx-lite を付けて、CSSで切り替える。
   はじめて起動したとき、動きが毎秒15コマ以下の重い端末だと判定したら、自動で「軽量」にする(設定で、いつでも変えられる) */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const KEY = 'mj_fx', AUTO = 'mj_fx_auto';
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
  const LEVELS = ['full', 'normal', 'lite'];
  MJ.FX = {
    LEVELS, JP: { full: '豪華', normal: 'ふつう', lite: '軽量' },
    level() { const v = get(KEY); return LEVELS.includes(v) ? v : 'full'; },
    isAuto() { return get(AUTO) === '1'; },
    chosen() { return LEVELS.includes(get(KEY)); }, // 自分で選んだ(または自動で決まった)あと
    apply() { const b = document.body; LEVELS.forEach((l) => b.classList.toggle('fx-' + l, l === this.level())); },
    set(l, auto) { put(KEY, l); put(AUTO, auto ? '1' : '0'); this.apply(); },
    cycle() { const n = LEVELS[(LEVELS.indexOf(this.level()) + 1) % LEVELS.length]; this.set(n, false); return n; },
    /* 画面の動きの速さ(毎秒のコマ数)を、秒ごとに数えて、いちばん小さい値を返す。隠れているタブでは測らない */
    measure(sec = 3) {
      return new Promise((res) => {
        const frames = []; let n = 0, t0 = performance.now(), last = t0;
        const f = (t) => {
          if (document.hidden) return res(null);
          n++;
          if (t - last >= 1000) { frames.push(n * 1000 / (t - last)); n = 0; last = t; }
          if (frames.length >= sec) return res(frames);
          requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      });
    },
    /* 起動直後(タイトルが出てから)、まだ演出を選んでいないときだけ測る。15fps以下なら、自動で軽量に */
    async autoDetect() {
      if (this.chosen()) return null;
      await new Promise((r) => setTimeout(r, 1200)); // 読み込みが落ち着いてから
      const fr = await this.measure(3);
      if (!fr) return null;
      const sorted = fr.slice().sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
      MJ.FX.lastFps = Math.round(med);
      if (med <= 15) { this.set('lite', true); if (MJ.UI && MJ.UI.toast) MJ.UI.toast('動きが重いようなので、演出を「軽量」にしました(設定で変えられます)'); return 'lite'; }
      return 'full';
    },
  };
  MJ.FX.apply();

  /* 画質: 画面を小さい解像度で描いて、拡大して見せる(フルHDなどの大きい画面で、描く量を減らして軽くする)。
     きれい=そのまま / ふつう=高さ720で描く / かるい=高さ540で描く。ゲームの中身は、画面いっぱいに同じ形で出る */
  const RK = 'mj_res', RBASE = { full: 0, mid: 720, low: 540 };
  MJ.Res = {
    LEVELS: ['full', 'mid', 'low'], JP: { full: 'きれい', mid: 'ふつう', low: 'かるい', lower: 'もっとかるい', lowest: 'いちばんかるい' }, // (もっとかるい・いちばんかるいは、実機の計測で逆に遅かったので、選べなくした。記録の表示のためだけに名前を残す)
    level() { const v = get(RK); return RBASE[v] != null ? v : 'full'; },
    k() { const b = RBASE[this.level()]; if (!b) return 1; const H = Math.min(innerWidth, innerHeight) > 0 && innerHeight > innerWidth ? innerWidth : innerHeight; const k = H / b; return k > 1.05 ? k : 1; },
    W() { return innerWidth / this.k(); }, H() { return innerHeight / this.k(); }, // ゲームが見る「画面の大きさ」
    apply() { const k = this.k(), d = document.documentElement; d.style.setProperty('--rk', k.toFixed(4)); d.classList.toggle('res-on', k > 1); if (MJ.UI && MJ.UI.relayout) { try { MJ.UI.relayout(); } catch (e) { /* ignore */ } } },
    set(l) { put(RK, l); this.apply(); requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); }, // 切り替えた直後に、各画面(ホーム・勉強・クイズ・ダイアログ)の拡大率を計算し直す
    cycle() { const n = this.LEVELS[(this.LEVELS.indexOf(this.level()) + 1) % this.LEVELS.length]; this.set(n); return n; },
  };
  MJ.Res.apply();
  window.addEventListener('resize', () => MJ.Res.apply());

  /* 動作の記録: 画面が0.05秒以上、止まった(長い処理)ときを、直前の操作の名前つきで、記録する。設定の「動作の測定」で見られる */
  const T0 = performance.now();
  MJ.perf = {
    long: [], steps: [], gaps: [], last: '起動',
    mark(name) { this.last = name; },
    /* 「はじめる」を押してからの内訳 */
    step(name) { this.steps.push([name, Math.round(performance.now())]); if (this.steps.length > 40) this.steps.shift(); },
  };
  /* ===== 通しの記録: 遊びながら、場面ごとのコマ数・止まりを、画質×演出ごとに集めておく(設定の「📊 通しの記録」で見られる / 保存されるので、起動し直しても続く) ===== */
  const REC = 'mj_perfrec';
  let data = {};
  try { data = JSON.parse(localStorage.getItem(REC) || '{}') || {}; } catch (e) { data = {}; }
  const saveRec = () => { try { localStorage.setItem(REC, JSON.stringify(data)); } catch (e) { /* ignore */ } };
  const shown = (id) => { const e = document.getElementById('screen-' + id); return e && !e.classList.contains('hidden'); };
  const sceneOf = () => {
    if (document.getElementById('dice')) return 'サイコロ';
    if (document.getElementById('intro')) return '勝負!の演出';
    if (document.querySelector('.ky-slam')) return '東○局の叩きつけ';
    if (document.querySelector('.winfx')) return 'ロン・ツモの演出';
    const ov = document.getElementById('overlay'); if (ov && !ov.classList.contains('hidden')) return 'ダイアログ';
    const b = document.body.classList;
    if (b.contains('on-title')) return 'タイトル';
    if (b.contains('on-menu')) return 'ホーム';
    if (shown('game')) return MJ.UI && MJ.UI.sel && MJ.UI.sel.type === 'self' ? '対局(自分の番)' : '対局(CPUの番)';
    if (shown('drill')) return 'クイズ';
    if (shown('study')) return '勉強';
    if (shown('select')) return '相手えらび';
    return 'そのほか';
  };
  const grpKey = () => `${MJ.Res.level()}|${MJ.FX.level()}|${innerWidth}x${innerHeight}`;
  const grp = () => { const k = grpKey(); return data[k] || (data[k] = { s: {}, t: {} }); };
  /* ===== 処理ごとの時間の計測(50ms以上、メインスレッドを止めた処理を特定するため) =====
     ① 関数の時間: 主な処理を包んで、呼び出し回数・平均・最大・50ms超の回数を数える
     ② Long Animation Frames(Edge/Chromeにある): 50ms以上かかった「1コマ」の中の、スクリプトごとの時間・レイアウト/描画の時間 */
  MJ.perf.wrap = (obj, name, label) => {
    const f = obj && obj[name]; if (typeof f !== 'function' || f._pw) return;
    const w = function () {
      const t0 = performance.now(); let r;
      try { r = f.apply(this, arguments); } finally { MJ.perf.fn(label, performance.now() - t0); }
      return r;
    };
    w._pw = 1; obj[name] = w;
  };
  MJ.perf.fn = (label, ms) => {
    if (!MJ.perf.rec || ms < 1) return;
    const g = MJ.perf.rec.group(), t = g.fn || (g.fn = {}), r = t[label] || (t[label] = { n: 0, sum: 0, mx: 0, c: 0 });
    r.n++; r.sum += ms; if (ms > r.mx) r.mx = ms; if (ms >= 50) r.c++;
  };
  MJ.perf.installWraps = () => {
    const W = MJ.perf.wrap;
    if (MJ.App) { W(MJ.App, 'show', '画面を出す(App.show)'); W(MJ.App, 'launch', '対局を始める(App.launch)'); }
    if (MJ.UI) ['render', 'layout', 'refreshCoach', 'overlay', 'fitOverlay', 'buildDanger', 'askSelf', 'askReact', 'showResult2', 'gameEnd', 'kyokuSlam', 'fitTip', 'growFont', 'pageCoach'].forEach((n) => W(MJ.UI, n, 'UI.' + n));
    if (MJ.AI) ['chooseSelf', 'chooseReact', 'callEval'].forEach((n) => W(MJ.AI, n, 'AI.' + n));
    if (MJ.Coach) ['selfAdvice', 'reactAdvice'].forEach((n) => W(MJ.Coach, n, 'Coach.' + n));
    if (MJ.Game && MJ.Game.prototype) ['setupHand', 'draw'].forEach((n) => W(MJ.Game.prototype, n, 'Game.' + n));
    if (MJ.Intro) W(MJ.Intro, 'play', '勝負!の演出を作る');
    if (MJ.Dice) W(MJ.Dice, 'play', 'サイコロを作る');
    if (MJ.Rank) ['record', 'write'].forEach((n) => W(MJ.Rank, n, 'Rank.' + n));
    if (MJ.SFX) ['prepare', 'unlock', 'play'].forEach((n) => W(MJ.SFX, n, 'SFX.' + n));
    if (MJ.Audio) ['_load', 'setScene'].forEach((n) => W(MJ.Audio, n, 'Audio.' + n));
  };
  window.addEventListener('load', () => setTimeout(() => { try { MJ.perf.installWraps(); } catch (e) { /* ignore */ } }, 300));
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration < 50 || !MJ.perf.rec) continue;
        const g = MJ.perf.rec.group(), a = g.loaf || (g.loaf = []);
        a.push({ d: Math.round(e.duration), b: Math.round(e.blockingDuration || 0), sl: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0), rd: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0), sc: MJ.perf.rec.scene(), ctx: MJ.perf.last, s: (e.scripts ? Array.from(e.scripts) : []).sort((x, y) => y.duration - x.duration).slice(0, 2).map((x) => `${x.invoker || x.sourceFunctionName || '?'} ${String(x.sourceURL || '').split('/').pop().split('?')[0]}:${x.sourceCharPosition >= 0 ? x.sourceCharPosition : ''} ${Math.round(x.duration)}ms${x.forcedStyleAndLayoutDuration ? ' 強制レイアウト' + Math.round(x.forcedStyleAndLayoutDuration) + 'ms' : ''}`) });
        a.sort((x, y) => y.d - x.d); if (a.length > 6) a.length = 6;
      }
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch (e) { /* 対応していないブラウザでは、記録なし */ }
  MJ.perf.rec = {
    data: () => data, scene: sceneOf,
    reset() { data = {}; saveRec(); },
    group: () => grp(),
    ev(name, ms) { const g = grp(); const t = g.t[name] || (g.t[name] = { n: 0, sum: 0, mx: 0 }); t.n++; t.sum += ms; if (ms > t.mx) t.mx = ms; },
  };
  { // コマの間隔を、場面ごとに数える(隠れている間・長い放置は数えない)
    let last = 0, tick = 0;
    const f = (t) => {
      const dt = t - last; last = t;
      if (!document.hidden && dt > 0 && dt < 5000 && MJ.Res && MJ.FX) {
        const sc = sceneOf(), g = grp(), r = g.s[sc] || (g.s[sc] = { n: 0, sum: 0, a: 0, b: 0, c: 0, mx: 0 });
        r.n++; r.sum += dt; if (dt > 33.5) r.a++; if (dt > 50) r.b++; if (dt > 100) r.c++; if (dt > r.mx) r.mx = dt;
        if (dt > 200) { const w = g.w || (g.w = []); w.push([Math.round(dt), sc, MJ.perf.last || '']); w.sort((x, y) => y[0] - x[0]); if (w.length > 5) w.length = 5; } // 大きな止まりは、直前の操作の名前つきで、上位5件を覚える
      }
      requestAnimationFrame(f);
    };
    requestAnimationFrame((t) => { last = t; requestAnimationFrame(f); });
    setInterval(() => { if (++tick) saveRec(); }, 5000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveRec(); });
    window.addEventListener('pagehide', saveRec);
  }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        MJ.perf.long.push({ at: Math.round((e.startTime) / 100) / 10, dur: Math.round(e.duration), ctx: MJ.perf.last, scene: ['title', 'menu', 'game', 'drill', 'study'].find((s) => document.body.classList.contains('on-' + s)) || '' });
        if (MJ.perf.long.length > 60) MJ.perf.long.shift();
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch (e) { /* 対応していないブラウザでは、記録なし */ }
})(typeof window !== 'undefined' ? window : globalThis);
