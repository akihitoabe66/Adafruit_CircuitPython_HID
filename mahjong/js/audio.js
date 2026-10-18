/* BGM (対局中のみ再生。ブラウザの仕様でボタン操作の中で再生を開始する) */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  let el = null;
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  const A = (MJ.Audio = {
    on: load('mj_bgm', true),
    volume: load('mj_vol', 0.5),
    _el() {
      if (!el && typeof Audio !== 'undefined') {
        el = new Audio('audio/bgm.mp3');
        el.loop = true;
        el.preload = 'auto';
        el.volume = A.volume;
      }
      return el;
    },
    start() {
      const a = A._el();
      if (!a || !A.on) return;
      a.volume = A.volume;
      const p = a.play();
      if (p && p.catch) p.catch(() => { /* 再生できない環境では無音のまま */ });
    },
    stop() { if (el) el.pause(); },
    setOn(v) { A.on = v; save('mj_bgm', v); if (v) A.start(); else A.stop(); },
    setVolume(v) { A.volume = v; save('mj_vol', v); if (el) el.volume = v; },
  });
})(typeof window !== 'undefined' ? window : globalThis);
