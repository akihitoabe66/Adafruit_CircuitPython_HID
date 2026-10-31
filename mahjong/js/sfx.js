/* 効果音(WebAudioで合成)と掛け声(ブラウザの音声合成) */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };


  const num = (k, d) => { const v = load(k, d); return typeof v === 'number' && isFinite(v) ? v : d; }; // 壊れた値(null・NaN)が保存されていても、初期値に戻す
  let ctx = null, master = null, bus = null, lim0 = null;
  const S = (MJ.SFX = {
    on: load('mj_sfx', true),
    voiceOn: load('mj_voice', true),
    vol: num('mj_sfxvol2', 0.8),
    readVol: num('mj_readvol', 0.8),
    readRate: num('mj_readrate', 1),
    readVoice: load('mj_readvoice', ''),
    callVol: num('mj_callvol', 0.3),
    yakuRead: load('mj_yakuread', true),

    getCtx() { return ctx; },
    getBus() { return lim0; }, // BGMも、効果音・声と同じリミッターを通す

    /* 音の出口は、最初の操作の前に、静かに作っておく(はじめて押した瞬間に、画面が止まらないように) */
    prepare() { this._make(); },
    _make() {
      try {
        if (!ctx) {
          const AC = G.AudioContext || G.webkitAudioContext;
          if (AC) {
            ctx = new AC(); master = ctx.createGain(); master.gain.value = S.vol;
            // 音が重なっても、割れて(ビリビリして)聞こえないように、最後にリミッターを通す
            const lim = ctx.createDynamicsCompressor();
            lim.threshold.value = -10; lim.knee.value = 8; lim.ratio.value = 14; lim.attack.value = 0.003; lim.release.value = 0.15;
            // 出口の手前に少し余裕(0.8倍)を持たせる。BGMも同じ出口を通して、足し算で1.0を超えて割れないようにする
            bus = ctx.createGain(); bus.gain.value = 0.8;
            lim0 = lim; master.connect(lim); lim.connect(bus); bus.connect(ctx.destination);
          }
        }
      } catch (e) { /* ignore */ }
    },
    unlock() {
      try {
        this._make();
        if (ctx && ctx.state === 'suspended') ctx.resume();
      } catch (e) { /* ignore */ }
    },
    setOn(v) { S.on = v; save('mj_sfx', v); },
    setVoice(v) { S.voiceOn = v; save('mj_voice', v); if (!v && G.speechSynthesis) G.speechSynthesis.cancel(); },
    setYakuRead(v) { S.yakuRead = v; save('mj_yakuread', v); },
    setCallVol(v) { if (!isFinite(v)) return; S.callVol = v; save('mj_callvol', v); },
    setReadVol(v) { if (!isFinite(v)) return; S.readVol = v; save('mj_readvol', v); },
    setReadRate(v) { S.readRate = v; save('mj_readrate', v); },
    setVol(v) { if (!isFinite(v)) return; S.vol = v; save('mj_sfxvol2', v); if (master) master.gain.value = v; },

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
    /* 雷の「バリバリ!」: 高いひび割れ音 + 低いゴロゴロ(上がりの演出用) */
    thunder(vol = 1) {
      if (!ctx) return;
      S.noise(0.14, 5200, 0.85 * vol, 0.6, 0, 'highpass');
      S.noise(0.5, 1800, 0.55 * vol, 0.5, 0.02, 'bandpass');
      S.noise(1.3, 220, 0.9 * vol, 0.5, 0.06, 'lowpass');
      S.tone(55, 0.9, 'sawtooth', 0.35 * vol, 28, 0.04);
    },
    /* 和太鼓の「ドン!」: 低い胴の音 + 皮を打つ音 + 余韻(スタート演出用) */
    don(vol = 1, at = 0) {
      if (!ctx) return;
      S.tone(120, 0.55, 'sine', 0.95 * vol, 42, at);
      S.tone(70, 0.7, 'sine', 0.8 * vol, 38, at);
      S.noise(0.18, 900, 0.7 * vol, 0.7, at, 'lowpass');
      S.noise(0.05, 3200, 0.5 * vol, 1.5, at);
      S.noise(1.1, 5200, 0.16 * vol, 0.5, at + 0.04, 'highpass'); // シャーン(余韻)
    },
    /* 演出の声(収録ファイル audio/voice/<名前>.mp3)。なければ、端末の音声合成で代用する */
    _clip: {},
    playClip(name, text, vol = 1) {
      if (!S.voiceOn) return;
      const run = (buf) => {
        if (!ctx || !buf) return false;
        const src = ctx.createBufferSource(); src.buffer = buf;
        const g = ctx.createGain(); g.gain.value = Math.min(0.9, S.callVol * 3.2 * vol);
        src.connect(g); g.connect(master); src.start(); return true;
      };
      const c = S._clip[name];
      if (c && c.buf) { run(c.buf); return; }
      if (c && c.fail) { S._say(text); return; }
      if (!ctx || typeof fetch === 'undefined') { S._say(text); return; }
      S.loadClip(name).then((buf) => { if (!run(buf)) S._say(text); });
    },
    loadClip(name) {
      const c = (S._clip[name] = S._clip[name] || {});
      if (c.p) return c.p;
      c.p = (!ctx || typeof fetch === 'undefined') ? Promise.resolve(null)
        : fetch(`audio/voice/${name}.mp3`).then((r) => { if (!r.ok) throw new Error('x'); return r.arrayBuffer(); }).then((ab) => new Promise((ok, ng) => ctx.decodeAudioData(ab, ok, ng)))
          .then((buf) => { c.buf = buf; return buf; }).catch(() => { c.fail = true; return null; });
      return c.p;
    },
    _say(text) {
      try { const syn = G.speechSynthesis; if (!syn || !text || S.isIOS) return; const u = new G.SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; u.pitch = 0.6; u.rate = 0.85; u.volume = Math.min(1, S.readVol); syn.speak(u); } catch (e) { /* ignore */ }
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
        case 'slam': T(150, 0.22, 'sine', 0.9, 38); N(0.25, 2400, 0.5, 0.7, 0, 'lowpass'); T(90, 0.18, 'triangle', 0.55, 45); break; // 局のはじまりの「ダンッ!」
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
      // 「Google 日本語」は選択肢に出さない
      const vs = G.speechSynthesis ? G.speechSynthesis.getVoices().filter((v) => /^ja/i.test(v.lang) && !/google/i.test(v.name)) : [];
      const female = /kyoko|o-?ren|haruka|nanami|ayumi|sayaka|mizuki|female|woman|girl/i;
      const male = /otoya|ichiro|hattori|takumi|keita|ken\b|male(?!.*female)|man\b/i;
      const hq = /enhanced|premium|natural|online|neural|google/i;
      const score = (v) => (male.test(v.name) ? 0 : 4) + (female.test(v.name) ? 2 : 0) + (hq.test(v.name) ? 1 : 0);
      return vs.slice().sort((a, b) => score(b) - score(a)).slice(0, 6);
    },
    /* 声の表示名: 「Ayumi - Japanese (Japan)」→「Ayumi(女性)」、「Google 日本語」はそのまま */
    voiceLabel(v) {
      // 名前から性別を決めつけない(端末の声の名前だけを、分かりやすく短くして出す)
      return v.name.replace(/^Microsoft\s+/i, '').replace(/\s*[-–]\s*(Japanese|Japan|日本語).*$/i, '').replace(/\s*\((Japanese|Japan)[^)]*\)\s*$/i, '').trim() || v.name;
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
    stopSpeak() { S.stopClips(); if (G.speechSynthesis) { S._readId = (S._readId || 0) + 1; G.speechSynthesis.cancel(); } if (S._cb) { const f = S._cb; S._cb = null; try { f(null); } catch (e) { /* ignore */ } } },
    /* 読み上げ: 文ごとに区切り、見出しっぽい短文・疑問・文末で声の高さ/速さ/間を変えて抑揚をつける */
    read(text, cb) {
      const syn = G.speechSynthesis;
      if (S.isIOS) return false; // iPhone・iPad: 音声合成はテレビ(AirPlay)に出ず手元の端末から鳴ってしまうので使わない
      if (!syn || !S.hasJaVoice()) return false;
      if (MJ.Yomi) text = MJ.Yomi.fix(text); // 麻雀用語・牌の名前を正しい読みに直す
      if (S._cb) { const f = S._cb; S._cb = null; try { f(null); } catch (e) { /* ignore */ } }
      syn.cancel();
      const id = (S._readId = (S._readId || 0) + 1);
      S._cb = cb || null;
      const parts = [];
      text.replace(/([。!?\n])/g, '$1|').split('|').forEach((seg) => {
        const t = seg.trim();
        if (!t || /^[。!?、\s]+$/.test(t)) return;
        // 長い文は読点で区切る(息つぎ)
        if (t.length > 46) t.replace(/([、,])/g, '$1|').split('|').forEach((c) => { c = c.trim(); if (!c) return; const l = parts[parts.length - 1]; if (l && !l.end && (l.t + c).length <= 40) l.t += c; else parts.push({ t: c, end: false }); });
        else parts.push({ t, end: true });
        parts[parts.length - 1].end = true;
      });
      const totalLen = parts.reduce((a, p) => a + p.t.length, 0) || 1;
      let doneLen = 0;
      const finish = () => { if (S._readId === id && S._cb === cb && cb) { S._cb = null; try { cb(null); } catch (e) { /* ignore */ } } };
      const v = S.femaleVoice();
      const base = v && /enhanced|premium|natural|online|neural|google/i.test(v.name) ? 1.0 : 1.06;
      const speakAt = (i) => {
        if (S._readId !== id) return;
        if (i >= parts.length) { finish(); return; }
        const { t } = parts[i];
        if (cb) { try { cb({ i, n: parts.length, a: doneLen / totalLen, b: (doneLen + t.length) / totalLen }); } catch (e) { /* ignore */ } }
        doneLen += t.length;
        const u = new SpeechSynthesisUtterance(t);
        u.lang = 'ja-JP';
        if (v) u.voice = v;
        const head = t.length <= 14 && i > 0; // 見出し・短い言い切り
        const q = /[?]$/.test(t) || /でしょうか|ですか$/.test(t);
        // 文ごとに少しずつ高さと速さをゆらす
        u.pitch = base + (head ? 0.06 : 0) + (q ? 0.1 : 0);
        u.rate = (head ? 0.95 : 1.0) * (S.readRate || 1);
        u.volume = S.readVol;
        const next = () => { if (S._readId !== id) return; const gap = head ? 380 : parts[i].end ? 220 : 90; setTimeout(() => speakAt(i + 1), gap); };
        u.onend = next;
        u.onerror = next;
        syn.speak(u);
      };
      setTimeout(() => { if (S._readId === id) speakAt(0); }, 80); // iOSは cancel 直後の speak を捨てることがあるため少し待つ
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
    /* ---- 役・点数の読み上げ(収録済みの音声 audio/yk/*.mp3 を、効果音・BGMと同じ経路で鳴らす) ----
       端末の音声合成(Web Speech)は、AirPlayでテレビに映していても手元の端末から出てしまうため、
       ふだんの読み上げ(上がったときの役と点数)は、収録した音声をつなげて、テレビからも鳴るようにする */
    isIOS: /iPad|iPhone|iPod/.test((G.navigator && G.navigator.userAgent) || '') || (G.navigator && G.navigator.platform === 'MacIntel' && G.navigator.maxTouchPoints > 1),
    _yk: null, _ykBuf: {}, _ykSrc: [], _ykId: 0,
    loadYk() {
      if (S._yk !== null || typeof fetch === 'undefined') return;
      S._yk = {};
      fetch('audio/yk/manifest.json').then((r) => r.json()).then((m) => { S._yk = m; }).catch(() => { S._yk = {}; });
    },
    ykHas(key) { return !!(S._yk && S._yk[key]); },
    _ykGet(key) {
      const fn = S._yk && S._yk[key];
      if (!fn || !ctx) return Promise.resolve(null);
      if (S._ykBuf[key]) return S._ykBuf[key];
      S._ykBuf[key] = fetch(`audio/yk/${fn}`).then((r) => r.arrayBuffer()).then((ab) => new Promise((ok, ng) => ctx.decodeAudioData(ab, ok, ng))).catch(() => null);
      return S._ykBuf[key];
    },
    /* keys: 'y:タンヤオ' などの並び。null は少し間をあける。つなげて鳴らす。鳴らせたら true */
    speakClips(keys, cb) {
      if (!ctx || !S._yk || !Object.keys(S._yk).length || !S.readVol) return false;
      S.stopClips();
      const id = S._ykId;
      Promise.all(keys.map((k) => (k ? S._ykGet(k) : Promise.resolve(false)))).then((bufs) => {
        if (id !== S._ykId) return;
        let t = ctx.currentTime + 0.05;
        bufs.forEach((b) => {
          if (b === false) { t += 0.28; return; }
          if (!b) return;
          const src = ctx.createBufferSource(); src.buffer = b;
          const g = ctx.createGain(), gv = Math.min(0.7, S.readVol * 0.7); // 1より大きくすると、音が割れる
          // 切れ目の「プツッ」を防ぐ: 頭とおしりを、短くなめらかに
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gv, t + 0.01);
          g.gain.setValueAtTime(gv, Math.max(t + 0.01, t + b.duration - 0.02)); g.gain.linearRampToValueAtTime(0, t + b.duration);
          src.connect(g); g.connect(master);
          src.start(t); S._ykSrc.push(src);
          t += b.duration + 0.07;
        });
        // 読み上げている間は、結果のBGMを小さくする(重なって割れるのを防ぐ)
        try { if (MJ.Audio && MJ.Audio.duck) { MJ.Audio.duck(true); clearTimeout(S._duckT); S._duckT = setTimeout(() => MJ.Audio.duck(false), Math.max(0, (t - ctx.currentTime) * 1000) + 300); } } catch (e) { /* ignore */ }
        if (cb) setTimeout(cb, Math.max(0, (t - ctx.currentTime) * 1000));
      });
      return true;
    },
    stopClips() { clearTimeout(S._duckT); try { if (MJ.Audio && MJ.Audio.duck) MJ.Audio.duck(false); } catch (e) { /* ignore */ } S._ykId++; S._ykSrc.forEach((s) => { try { s.stop(); } catch (e) { /* ignore */ } }); S._ykSrc = []; },
    voice(text, p) {
      const key = S._vkey[text];
      if (!S.voiceOn || !key || !ctx) return;
      const id = p && p.char ? (p.char.voice || p.char.id) : 0; // 掛け声の声は、キャラごとの voice 番号のファイルを使う
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
