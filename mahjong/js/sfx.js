/* 効果音(WebAudioで合成)と掛け声(ブラウザの音声合成) */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };


  let ctx = null, master = null;
  const S = (MJ.SFX = {
    on: load('mj_sfx', true),
    voiceOn: load('mj_voice', true),
    vol: load('mj_sfxvol2', 0.8),
    readVol: load('mj_readvol', 0.8),
    readVoice: load('mj_readvoice', ''),
    callVol: load('mj_callvol', 0.3),

    getCtx() { return ctx; },

    unlock() {
      try {
        if (!ctx) {
          const AC = G.AudioContext || G.webkitAudioContext;
          if (AC) { ctx = new AC(); master = ctx.createGain(); master.gain.value = S.vol; master.connect(ctx.destination); }
        }
        if (ctx && ctx.state === 'suspended') ctx.resume();
      } catch (e) { /* ignore */ }
    },
    setOn(v) { S.on = v; save('mj_sfx', v); },
    setVoice(v) { S.voiceOn = v; save('mj_voice', v); if (!v && G.speechSynthesis) G.speechSynthesis.cancel(); },
    setCallVol(v) { S.callVol = v; save('mj_callvol', v); },
    setReadVol(v) { S.readVol = v; save('mj_readvol', v); },
    setVol(v) { S.vol = v; save('mj_sfxvol2', v); if (master) master.gain.value = v; },

    /* ---- 部品 ---- */
    tone(f, dur, type = 'sine', vol = 0.3, to = null, at = 0) {
      if (!ctx) return;
      const t = ctx.currentTime + at;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, freq, vol = 0.3, q = 1, at = 0, type = 'bandpass') {
      if (!ctx) return;
      const t = ctx.currentTime + at;
      const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(master); src.start(t);
    },
    clack(vol = 0.5, at = 0, pitch = 1) { S.noise(0.05, 2200 * pitch, vol, 2.5, at); S.tone(170 * pitch, 0.07, 'triangle', vol * 0.8, 70 * pitch, at); },

    /* ---- 効果音 ---- */
    play(name) {
      if (!S.on) return;
      S.unlock();
      if (!ctx) return;
      const T = S.tone, N = S.noise;
      switch (name) {
        case 'click': T(1100, 0.05, 'sine', 0.22, 700); break;
        case 'select': T(760, 0.05, 'triangle', 0.2, 980); break;
        case 'draw': N(0.04, 1500, 0.22, 1.5); T(300, 0.04, 'triangle', 0.12); break;
        case 'discard': S.clack(0.55); break;
        case 'call': S.clack(0.5); S.clack(0.5, 0.09, 1.1); T(880, 0.22, 'triangle', 0.22, 1320, 0.14); break;
        case 'kan': S.clack(0.5); S.clack(0.5, 0.08, 1.1); S.clack(0.5, 0.16, 1.2); T(520, 0.35, 'sawtooth', 0.15, 260, 0.2); break;
        case 'riichi': N(0.3, 3000, 0.25, 0.7, 0); T(420, 0.35, 'sawtooth', 0.14, 1300); T(1760, 0.25, 'sine', 0.22, null, 0.28); S.clack(0.4, 0.3); break;
        case 'ron': N(0.45, 500, 0.5, 0.5); T(140, 0.5, 'sawtooth', 0.4, 45); T(660, 0.4, 'square', 0.14, null, 0.08); T(990, 0.4, 'square', 0.12, null, 0.08); T(1320, 0.5, 'triangle', 0.16, null, 0.12); break;
        case 'tsumo': [523, 659, 784, 1047, 1319].forEach((f, i) => T(f, 0.28, 'triangle', 0.22, null, i * 0.07)); N(0.3, 6000, 0.12, 0.8, 0.3, 'highpass'); break;
        case 'win': [523, 659, 784, 1047].forEach((f, i) => T(f, 0.3, 'triangle', 0.26, null, i * 0.12)); T(1047, 0.7, 'sine', 0.2, null, 0.5); T(784, 0.7, 'sine', 0.16, null, 0.5); break;
        case 'lose': [392, 349, 294, 220].forEach((f, i) => T(f, 0.32, 'sine', 0.24, null, i * 0.16)); break;
        case 'drawgame': T(330, 0.3, 'sine', 0.2); T(294, 0.5, 'sine', 0.2, null, 0.22); break;
        case 'start': T(196, 1.2, 'sine', 0.3, 190); T(392, 1.0, 'sine', 0.16, null, 0.0); T(588, 0.8, 'sine', 0.1); N(0.12, 4000, 0.2, 1, 0, 'highpass'); break;
        case 'end': [392, 523, 659, 784, 1047].forEach((f, i) => T(f, 0.34, 'square', 0.12, null, i * 0.12)); T(1047, 0.9, 'triangle', 0.22, null, 0.6); break;
        case 'ok': T(660, 0.12, 'triangle', 0.25); T(990, 0.28, 'triangle', 0.25, null, 0.1); break;
        case 'ng': T(220, 0.28, 'sawtooth', 0.18, 140); break;
        case 'error': T(200, 0.12, 'square', 0.15); break;
        default: break;
      }
    },

    /* ---- 読み上げ(女性の声) ---- */
    /* Web Speech API(標準機能)の日本語音声から、女性の声らしいものを選ぶ。
       端末にない場合はブラウザ既定の日本語音声を使う */
    /* 日本語の音声の一覧(女性らしい声・高品質な声を先に) */
    voiceList() {
      const vs = G.speechSynthesis ? G.speechSynthesis.getVoices().filter((v) => /^ja/i.test(v.lang)) : [];
      const female = /kyoko|o-?ren|haruka|nanami|ayumi|sayaka|mizuki|female|woman|girl/i;
      const male = /otoya|ichiro|hattori|takumi|keita|ken\b|male(?!.*female)|man\b/i;
      const hq = /enhanced|premium|natural|online|neural|google/i;
      const score = (v) => (male.test(v.name) ? 0 : 4) + (female.test(v.name) ? 2 : 0) + (hq.test(v.name) ? 1 : 0);
      return vs.slice().sort((a, b) => score(b) - score(a)).slice(0, 6);
    },
    /* 声の表示名: 「Ayumi - Japanese (Japan)」→「Ayumi(女性)」、「Google 日本語」はそのまま */
    voiceLabel(v) {
      const female = /kyoko|o-?ren|haruka|nanami|ayumi|sayaka|mizuki|female|woman|girl/i;
      const male = /otoya|ichiro|hattori|takumi|keita|ken\b|male(?!.*female)|man\b/i;
      let n = v.name.replace(/^Microsoft\s+/i, '').replace(/\s*[-–]\s*(Japanese|Japan|日本語).*$/i, '').replace(/\s*\((Japanese|Japan)[^)]*\)\s*$/i, '').trim() || v.name;
      const g = female.test(v.name) ? '女性' : male.test(v.name) ? '男性' : '';
      return g ? `${n}・${g}` : n;
    },
    femaleVoice() {
      const list = S.voiceList();
      return list.find((v) => v.voiceURI === S.readVoice) || list[0] || null;
    },
    setReadVoice(uri) { S.readVoice = uri; save('mj_readvoice', uri); },
    hasJaVoice() {
      if (!G.speechSynthesis) return false;
      const all = G.speechSynthesis.getVoices();
      return !all.length || all.some((v) => /^ja/i.test(v.lang));
    },
    speaking() { return !!(G.speechSynthesis && (G.speechSynthesis.speaking || G.speechSynthesis.pending)); },
    stopSpeak() { if (G.speechSynthesis) { S._readId = (S._readId || 0) + 1; G.speechSynthesis.cancel(); } },
    /* 読み上げ: 文ごとに区切り、見出しっぽい短文・疑問・文末で声の高さ/速さ/間を変えて抑揚をつける */
    read(text) {
      const syn = G.speechSynthesis;
      if (!syn || !S.hasJaVoice()) return false;
      syn.cancel();
      const id = (S._readId = (S._readId || 0) + 1);
      const parts = [];
      text.replace(/([。!?\n])/g, '$1|').split('|').forEach((seg) => {
        const t = seg.trim();
        if (!t || /^[。!?、\s]+$/.test(t)) return;
        // 長い文は読点で区切る(息つぎ)
        if (t.length > 46) t.replace(/([、,])/g, '$1|').split('|').forEach((c) => { c = c.trim(); if (!c) return; const l = parts[parts.length - 1]; if (l && !l.end && (l.t + c).length <= 40) l.t += c; else parts.push({ t: c, end: false }); });
        else parts.push({ t, end: true });
        parts[parts.length - 1].end = true;
      });
      const v = S.femaleVoice();
      const base = v && /enhanced|premium|natural|online|neural|google/i.test(v.name) ? 1.0 : 1.06;
      const speakAt = (i) => {
        if (i >= parts.length || S._readId !== id) return;
        const { t } = parts[i];
        const u = new SpeechSynthesisUtterance(t);
        u.lang = 'ja-JP';
        if (v) u.voice = v;
        const head = t.length <= 14 && i > 0; // 見出し・短い言い切り
        const q = /[?]$/.test(t) || /でしょうか|ですか$/.test(t);
        // 文ごとに少しずつ高さと速さをゆらす
        u.pitch = base + (head ? 0.06 : 0) + (q ? 0.1 : 0);
        u.rate = head ? 0.95 : 1.0;
        u.volume = S.readVol;
        const next = () => { if (S._readId !== id) return; const gap = head ? 380 : parts[i].end ? 220 : 90; setTimeout(() => speakAt(i + 1), gap); };
        u.onend = next;
        u.onerror = next;
        syn.speak(u);
      };
      speakAt(0);
      return true;
    },

    /* ---- 掛け声(収録済みの音声ファイル audio/voice/<キャラid>_<種類>.mp3) ---- */
    _vbuf: {},
    _vkey: { 'リーチ': 'riichi', 'ポン': 'pon', 'チー': 'chi', 'カン': 'kan', 'ロン': 'ron', 'ツモ': 'tsumo' },
    _loadVoice(id, key) {
      const k = id + '_' + key;
      if (S._vbuf[k] !== undefined) return S._vbuf[k];
      S._vbuf[k] = null;
      if (!ctx || typeof fetch === 'undefined') { delete S._vbuf[k]; return null; }
      fetch(`audio/voice/${k}.mp3`).then((r) => r.arrayBuffer()).then((ab) => new Promise((ok, ng) => ctx.decodeAudioData(ab, ok, ng)))
        .then((buf) => { S._vbuf[k] = buf; }).catch(() => { /* 読み込めなければ無音 */ });
      return null;
    },
    preloadVoices(ids) {
      if (!ctx) return;
      ids.forEach((id) => Object.values(S._vkey).forEach((key) => S._loadVoice(id, key)));
    },
    voice(text, p) {
      const key = S._vkey[text];
      if (!S.voiceOn || !key || !ctx) return;
      const id = p && p.char ? p.char.id : 0;
      const buf = S._vbuf[id + '_' + key] || S._loadVoice(id, key);
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = S.callVol; // 掛け声専用の音量(効果音の音量とは別)
      src.connect(g); g.connect(master);
      src.start();
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
