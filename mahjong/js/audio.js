/* BGM: ホーム画面は1曲をループ、対局中は3曲からランダムに選んで順に再生。
   iPhone は audio.volume が効かないため WebAudio の GainNode で音量を調整する */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  const HOME = 'audio/home.mp3';
  const GAME = ['audio/game1.mp3', 'audio/game2.mp3', 'audio/game3.mp3', 'audio/game4.mp3', 'audio/game5.mp3', 'audio/game6.mp3'];
  let el = null, gain = null, wired = false, last = null;

  /* 曲を先に取り寄せておく(押してから数秒待たされないように)。順番: ホーム → 対局曲 → 結果曲 */
  /* 取り寄せた曲は Blob(端末内のデータ)にして、再生はそこから行う。ネットを通さないので、押した瞬間に鳴る */
  const warmed = new Set(), blobs = {}, pending = {};
  const warm = (src) => {
    if (blobs[src] || typeof fetch === 'undefined' || typeof URL === 'undefined') return Promise.resolve();
    if (pending[src]) return pending[src];
    pending[src] = fetch(src).then((r) => { if (!r.ok) throw new Error('x'); return r.blob(); })
      .then((b) => { blobs[src] = URL.createObjectURL(b); warmed.add(src); })
      .catch(() => { /* 取り寄せに失敗したら、通常どおりネットから再生する */ })
      .then(() => { delete pending[src]; });
    return pending[src];
  };
  MJ.warmAudio = (list) => list.reduce((p, s) => p.then(() => warm(s)), Promise.resolve());

  const A = (MJ.Audio = {
    on: load('mj_bgm', true),
    volume: Math.min(0.3, load('mj_bgmvol', 0.1)), // 音量の最大を小さくした(以前の約2段階ぶんが標準)
    scene: 'title',

    _el() {
      if (!el && typeof Audio !== 'undefined') {
        el = new Audio();
        el.preload = 'auto';
        el.addEventListener('ended', () => { if (A.scene === 'game' && !A.resultOn) A._playGame(); });
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
      if (a.dataset.track !== src) { a.src = blobs[src] || src; a.dataset.track = src; }
      // 取り寄せ中なら、終わった時点で端末内のデータに切り替える(再生位置はそのまま)
      if (!blobs[src] && pending[src]) pending[src].then(() => { if (blobs[src] && a.dataset.track === src && a.src.indexOf('blob:') !== 0 && a.currentTime < 1) { const t = a.currentTime, ps = !a.paused; a.src = blobs[src]; a.currentTime = t; if (ps) a.play().catch(() => {}); } });
      A._wire();
      A._apply();
      const p = a.play();
      if (p && p.catch) p.catch(() => { /* 操作前は再生できない。次の操作で resume() */ });
    },
    _playGame() {
      // 取り寄せ済みの曲を優先して選ぶ(なければ通常どおり)
      const ready = GAME.filter((s) => s !== last && warmed.has(s));
      const pool = ready.length ? ready : GAME.filter((s) => s !== last);
      last = pool[Math.floor(Math.random() * pool.length)];
      A._load(last, false);
      MJ.warmAudio([...GAME, 'audio/result_win.mp3', 'audio/result_lose.mp3', 'audio/result_draw.mp3']);
    },
    /* 結果画面の専用BGM: 'win'(自分の和了) / 'lose'(マイナス) / 'draw'(流局)。閉じると対局BGMに戻る */
    playResult(kind) {
      if (!A.on || !['win', 'lose', 'draw'].includes(kind)) return;
      A.resultOn = true;
      A._load(`audio/result_${kind}.mp3`, true);
    },
    endResult() {
      if (!A.resultOn) return;
      A.resultOn = false;
      if (A.scene === 'game') A._playGame();
    },
    /* シーン切替: 'home' | 'game' */
    setScene(scene) {
      const changed = A.scene !== scene || !el || el.paused;
      A.scene = scene;
      if (scene === 'title' || !A.on) { A.stop(); return; }
      if (scene === 'home') MJ.warmAudio([...GAME]); // ホームの間に対局曲を取り寄せる
      if (scene === 'home') { if (changed || (el && el.dataset.track !== HOME)) A._load(HOME, true); }
      else if (changed && !(el && el.dataset.track && GAME.includes(el.dataset.track) && !el.paused)) A._playGame();
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
