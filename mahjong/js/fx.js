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

  /* 動作の記録: 画面が0.05秒以上、止まった(長い処理)ときを、直前の操作の名前つきで、記録する。設定の「動作の測定」で見られる */
  const T0 = performance.now();
  MJ.perf = {
    long: [], steps: [], gaps: [], last: '起動',
    mark(name) { this.last = name; },
    /* 「はじめる」を押してからの内訳 */
    step(name) { this.steps.push([name, Math.round(performance.now())]); if (this.steps.length > 40) this.steps.shift(); },
  };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        MJ.perf.long.push({ at: Math.round((e.startTime) / 100) / 10, dur: Math.round(e.duration), ctx: MJ.perf.last, scene: ['title', 'menu', 'game', 'drill', 'study'].find((s) => document.body.classList.contains('on-' + s)) || '' });
        if (MJ.perf.long.length > 60) MJ.perf.long.shift();
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch (e) { /* 対応していないブラウザでは、記録なし */ }
})(typeof window !== 'undefined' ? window : globalThis);
