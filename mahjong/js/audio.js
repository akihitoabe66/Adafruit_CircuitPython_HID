/* BGM: ホーム画面は1曲をループ、対局中は3曲からランダムに選んで順に再生。
   iPhone は audio.volume が効かないため WebAudio の GainNode で音量を調整する */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  const HOME = 'audio/home.mp3';
  const GAME = ['audio/game1.mp3', 'audio/game2.mp3', 'audio/game3.mp3'];
  let el = null, gain = null, wired = false, last = null;

  const A = (MJ.Audio = {
    on: load('mj_bgm', true),
    volume: load('mj_bgmvol', 0.12),
    scene: 'title',

    _el() {
      if (!el && typeof Audio !== 'undefined') {
        el = new Audio();
        el.preload = 'auto';
        el.addEventListener('ended', () => { if (A.scene === 'game') A._playGame(); });
      }
      return el;
    },
    _wire() {
      if (wired || !el) return;
      const ctx = MJ.SFX && MJ.SFX.getCtx && MJ.SFX.getCtx();
      if (!ctx) return;
      try {
        const src = ctx.createMediaElementSource(el);
        gain = ctx.createGain();
        gain.gain.value = A.volume;
        src.connect(gain); gain.connect(ctx.destination);
        wired = true;
        el.volume = 1;
      } catch (e) { /* 失敗したら element.volume を使う */ }
    },
    _apply() { if (gain) gain.gain.value = A.volume; else if (el) el.volume = A.volume; },
    _load(src, loop) {
      const a = A._el();
      if (!a) return;
      a.loop = loop;
      if (!a.src.endsWith(src)) a.src = src;
      A._wire();
      A._apply();
      const p = a.play();
      if (p && p.catch) p.catch(() => { /* 操作前は再生できない。次の操作で resume() */ });
    },
    _playGame() {
      const pool = GAME.filter((s) => s !== last);
      last = pool[Math.floor(Math.random() * pool.length)];
      A._load(last, false);
    },
    /* シーン切替: 'home' | 'game' */
    setScene(scene) {
      const changed = A.scene !== scene || !el || el.paused;
      A.scene = scene;
      if (scene === 'title' || !A.on) { A.stop(); return; }
      if (scene === 'home') { if (changed || (el && !el.src.endsWith(HOME))) A._load(HOME, true); }
      else if (changed && !(el && el.src && GAME.some((s) => el.src.endsWith(s)) && !el.paused)) A._playGame();
    },
    resume() {
      if (!A.on || A.scene === 'title') return;
      const c = MJ.SFX && MJ.SFX.getCtx && MJ.SFX.getCtx();
      if (c && c.state !== 'running') { try { c.resume(); } catch (e) { /* ignore */ } }
      A.setScene(A.scene);
      if (el && el.paused) { const p = el.play(); if (p && p.catch) p.catch(() => {}); }
    },
    /* 実際に音が出ている状態か(自動再生が止められていないか) */
    isPlaying() {
      const c = MJ.SFX && MJ.SFX.getCtx && MJ.SFX.getCtx();
      return !!el && !el.paused && el.currentTime > 0 && (!wired || (c && c.state === 'running'));
    },
    stop() { if (el) el.pause(); },
    setOn(v) { A.on = v; save('mj_bgm', v); if (v) A.setScene(A.scene); else A.stop(); },
    setVolume(v) { A.volume = v; save('mj_bgmvol', v); A._apply(); },
  });
})(typeof window !== 'undefined' ? window : globalThis);
