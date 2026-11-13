/* ネイティブ版の音: BGM(SDL_mixer)・効果音(audio/sfx/*.wav)・掛け声・役と点数の読み上げ(audio/yk の録音をつなぐ) */
(function () {
  const MJ = window.MJ;
  const GAME = ['game1', 'game2', 'game3', 'game4', 'game5', 'game6', 'game7', 'game10', 'game11'].map((n) => 'audio/' + n + '.mp3');
  const LATE = ['audio/game8.mp3', 'audio/game9.mp3'], FINAL = ['audio/game12.mp3', 'audio/game13.mp3', 'audio/game14.mp3'], HOME = 'audio/home.mp3';
  const SFX = ['click', 'select', 'draw', 'deal4', 'deal1', 'sort1', 'sort2', 'deal', 'discard', 'call', 'kan', 'riichi', 'ron', 'tsumo', 'win', 'lose', 'drawgame', 'slam', 'start', 'end', 'ok', 'ng', 'error'];
  const D = { bgm: 0.22, sfx: 0.7, voice: 0.85, read: 0.6 }; // 初期値(音量の目盛り5のとき)
  const V = { bgm: D.bgm, sfx: D.sfx, voice: D.voice, read: D.read };
  const lvlOf = (k) => { let v = 5; try { const s = localStorage.getItem('mj_vol_' + k); if (s !== null) v = Math.max(0, Math.min(10, parseInt(s, 10))); } catch (e) { /* ignore */ } return isNaN(v) ? 5 : v; };
  const applyLvl = (k) => { const l = lvlOf(k); V[k] = Math.min(1, D[k] * l / 5); if (k === 'voice') V.read = Math.min(1, D.read * l / 5); };
  ['bgm', 'sfx', 'voice'].forEach(applyLvl);
  let yk = null, token = 0, last = null, cur = '', duckT = 0;
  try { const t = __readtext('audio/yk/manifest.json'); yk = t ? JSON.parse(t) : {}; } catch (e) { yk = {}; }
  const A = (window.NSND = {
    on: true,
    scale: 1, bv() { return V.bgm * A.scale; }, /* 画面ごとのBGMの大きさ(結果の画面は、はじめから少し小さく。声のたびに上げ下げしない) */
    music(p) { if (!A.on) { snd.music(''); cur = ''; return; } if (cur === p) return; cur = p; snd.musicVol(A.bv(), 0); snd.music(p, true); },
    getLevel(k) { return lvlOf(k); },
    setLevel(k, l) { l = Math.max(0, Math.min(10, l)); try { localStorage.setItem('mj_vol_' + k, String(l)); } catch (e) { /* ignore */ } applyLvl(k); if (k === 'bgm') snd.musicVol(A.bv(), 200); },
    home() { A.scale = 1; A.music(HOME); },
    game(g) {
      // 最終局(東風戦=東四局 / 南風戦=東四局と南四局)は、60%の確率で「勝負後半の曲」から選ぶ
      const isGameTrack = GAME.indexOf(cur) >= 0 || LATE.indexOf(cur) >= 0 || FINAL.indexOf(cur) >= 0;
      const finalHand = !!g && g.kyoku % 4 === 3;
      if (isGameTrack && !(finalHand && FINAL.indexOf(cur) < 0 && !A._finalDone)) return; // いま対局の曲が流れているなら、局ごとに曲を替えない(曲の読み込みで、音が途切れるため)
      A.scale = 1; if (!finalHand) A._finalDone = false;
      if (finalHand) A._finalDone = true;
      const cand = GAME.concat(g && g.kyoku >= 1 ? LATE : []).filter((x) => x !== last);
      const fin = FINAL.filter((x) => x !== last);
      const pool = finalHand && Math.random() < 0.6 && fin.length ? fin : cand;
      last = pool[Math.floor(Math.random() * pool.length)]; cur = ''; A.music(last);
    },
    resultCpuRon() { A.scale = 0.65; cur = ''; A.music('audio/result_cpu.mp3'); }, /* CPU同士の「ロン」(人は関係ない): かならず、この曲に切りかえる */
    result(kind) { const n = kind === 'win' && Math.random() < 0.5 ? 'result_win2' : 'result_' + kind; if (kind === 'calm') return; /* CPU同士の上がり: 対局のBGMを、そのまま流す(明るい曲にも、負けた曲にもしない) */ A.scale = 0.65; cur = ''; A.music('audio/' + n + '.mp3'); },
    toggle() { A.on = !A.on; if (!A.on) { snd.music(''); cur = ''; } return A.on; },
    sfx(name, v) { if (SFX.indexOf(name) >= 0) snd.play('audio/sfx/' + name + '.wav', (v == null ? V.sfx : v)); },
    call(p, text) {
      const K = { 'リーチ': 'riichi', 'ポン': 'pon', 'チー': 'chi', 'カン': 'kan', 'ロン': 'ron', 'ツモ': 'tsumo' }[text]; if (!K) return;
      const id = p && p.char && p.char.voice != null ? p.char.voice : 0; const path = 'audio/voice/' + id + '_' + K + '.mp3'; snd.play(path, V.voice); A.callEnd = __now() + Math.round((snd.len(path) || 0.8) * 1000); /* 掛け声が終わる時刻(結果の読み上げを、これが終わってから始めるため) */
      if (id === 0 && yk && yk['x:なのだ'] && Math.random() < 0.3) { const L = snd.len(path) || 0.6, nk = A.nd(K === 'riichi' ? 'firm' : K === 'ron' || K === 'tsumo' ? 'bright' : 'flat'); if (nk) setTimeout(() => A.speak([nk]), Math.round((L - 0.1) * 1000)); } // あなた(ずんだもん)の掛け声のあと、ときどき「なのだ」
    },
    /* 語尾「なのだ」を、たまに(確率 p)つけた並びにする */
    /* 「なのだ」は3種類: firm=少し暗い・言い切る(x:なのだ) / bright=明るい(x:なのだ2) / flat=フラット(x:なのだ3)。場面に合うものを選ぶ */
    nd(mood) { const M = { firm: 'x:なのだ', bright: 'x:なのだ2', flat: 'x:なのだ3' }; if (!yk) return null; if (M[mood] && yk[M[mood]]) return M[mood]; const ks = Object.keys(M).map((m) => M[m]).filter((k) => yk[k]); return ks.length ? ks[Math.floor(Math.random() * ks.length)] : null; },
    nanoda(keys, p, mood) { const k = Math.random() < (p == null ? 0.3 : p) ? A.nd(mood) : null; return k ? keys.concat('+', k) : keys; },
    stopSpeak() { token++; },
    /* 'y:ツモ' などの並び(null は短い間)を、録音をつなげて鳴らす。 BGMは読み上げの間だけ小さくする */
    speak(keys, cb) {
      const id = ++token; let t = 0.05; const known = keys.filter((k) => !k || k === '+' || yk[k]);
      known.forEach((k) => {
        if (k === '+') { t -= 0.06; return; } // 「+」: 前の声に、ほとんど間をあけずに つなげる(じゅう + いっぽんば)
        if (!k) { t += 0.28; return; }
        const p = 'audio/yk/' + yk[k]; const len = snd.len(p); if (!len) return;
        setTimeout(() => { if (id === token) snd.play(p, V.read); }, t * 1000); t += len + 0.07;
      });
      /* 声のたびに、BGMの音量を 上げ下げしない(新しい声は はっきり聞こえる。音量の切りかえで、BGMがガサガサするのを防ぐ) */
      if (cb) setTimeout(cb, t * 1000);
      return t; // 読み上げにかかる秒数
    },
    has(k) { return !!yk[k]; },
    /* 上がったときの、役と点数の読み上げ(ブラウザ版 ui.js と同じ組み立て) */
    readWin(game, res) {
      const READ = { '門前清自摸和': 'ツモ', '断么九': 'タンヤオ', '平和': 'ピンフ', '一盃口': 'イーペーコー', '二盃口': 'リャンペーコー', '七対子': 'チートイツ', '対々和': 'トイトイ', '三暗刻': 'サンアンコー', '三色同順': 'サンショク', '三色同刻': 'サンショクドウコー', '一気通貫': 'イッツー', '混全帯么九': 'チャンタ', '純全帯么九': 'ジュンチャン', '混一色': 'ホンイツ', '清一色': 'チンイツ', '小三元': 'ショウサンゲン', '大三元': 'ダイサンゲン', '国士無双': 'コクシムソウ', '四暗刻': 'スーアンコー', '嶺上開花': 'リンシャンカイホー', '海底摸月': 'ハイテイ', '河底撈魚': 'ホーテイ', '混老頭': 'ホンロートー', '清老頭': 'チンロートー', '四槓子': 'スーカンツ', '三槓子': 'サンカンツ', '緑一色': 'リューイーソー', '字一色': 'ツーイーソー', '小四喜': 'ショウスーシー', '大四喜': 'ダイスーシー', '九蓮宝燈': 'チューレンポートー', '天和': 'テンホー', '地和': 'チーホー', 'ダブルリーチ': 'ダブルリーチ', 'ダブル立直': 'ダブルリーチ', '立直': 'リーチ', 'リーチ': 'リーチ', '一発': 'イッパツ', '槍槓': 'チャンカン' };
      const yh = { '白': 'ハク', '發': 'ハツ', '中': 'チュン', '東': 'トン', '南': 'ナン', '西': 'シャー', '北': 'ペー' };
      const keys = [];
      const num = (n) => { const k = [], man = Math.floor(n / 10000), th = Math.floor((n % 10000) / 1000), hu = Math.floor((n % 1000) / 100); if (man) k.push('m:' + man); if (th) k.push('k:' + th); if (hu) k.push('h:' + hu); return k; };
      res.wins.forEach((w) => {
        const r = w.res;
        // 「桃太郎 ツモ!」: 上がった人の名前 + ツモ/ロン(あなたも)。「の」は入れない(声が、つなぎ言葉として合わないため)
        if (yk['nm:' + w.winner.name]) keys.push('nm:' + w.winner.name); // 「〇〇 ロン」: 上がった人の名前と、ツモ/ロン(CPUのときも読む。ただし、その人自身の掛け声が終わってから)
        if (!((A.callEnd || 0) > __now() - 20000)) keys.push(w.tsumo ? 'w:ツモ' : 'w:ロン', null); // 掛け声(ツモ・ロン)を、いま言ったばかりなら、くりかえさない(2回言うと、声が重なる)
        r.yaku.forEach((y) => {
          if (w.tsumo && y.n === '門前清自摸和') return; // 「ツモ」は、いま言ったので、くりかえさない
          if (y.n === 'ドラ' || y.n === '赤ドラ' || y.n === '裏ドラ') keys.push('y:' + (y.n === 'ドラ' ? 'ドラ' : y.n === '赤ドラ' ? 'アカドラ' : 'ウラドラ'), 'n:' + Math.min(13, y.h));
          else {
            const m = /^役牌[ \s　]*(.*)$/.exec(y.n);
            if (m) keys.push('y:ヤクハイ', 'y:' + (yh[m[1]] || m[1]));
            else if (/場風|自風/.test(y.n)) { const k = y.n.replace(/[^東南西北]/g, '').slice(-1); keys.push(/場風/.test(y.n) ? 'y:バフウ' : 'y:ジフウ', 'y:' + (yh[k] || '')); }
            else keys.push('y:' + (READ[y.n] || y.n));
          }
          keys.push(null);
        });
        const p = w.pay;
        if (r.limit) keys.push('l:' + r.limit, null);
        if (!w.tsumo) keys.push(...num(p.ron), 'pt');
        else if (game.dealer === w.winner.seat) keys.push(...num(p.each), 'pt_all');
        else keys.push(...num(p.fromOther), null, ...num(p.fromDealer), 'pt');
        if (Math.random() < 0.3) { const nk = A.nd(w.winner.isHuman || r.limit ? 'bright' : w.loser && w.loser.isHuman ? 'firm' : 'flat'); if (nk) keys.push('+', nk); } // ときどき、ずんだもんの語尾「なのだ」(自分の上がり・満貫以上は明るく / 放銃したときは言い切り / ほかはフラット)
        keys.push(null);
      });
      const wait = Math.max(900, (A.callEnd || 0) - __now() + 250); setTimeout(() => A.speak(keys), wait); // 掛け声と重ならないように
    },
    /* 局のはじまり: 「トン、イッキョク!」など */
    readKyoku(game) {
      const W = ['トン', 'ナン', 'シャー', 'ペー'], KY = ['イッキョク', 'ニキョク', 'サンキョク', 'ヨンキョク'];
      const keys = ['x:' + W[game.roundWind % 4], null, 'x:' + (KY[game.kyoku % 4] || 'イッキョク')];
      const HB = { 1: 'イッポンバ', 2: 'ニホンバ', 3: 'サンボンバ', 4: 'ヨンホンバ', 5: 'ゴホンバ', 6: 'ロッポンバ', 7: 'ナナホンバ', 8: 'ハッポンバ', 9: 'キュウホンバ', 10: 'ジュッポンバ' };
      const hb = Math.min(19, game.honba || 0); // 10本場までは、そのまま。11本場からは「じゅう」+「1〜9本場」(19本場まで)
      if (hb >= 1 && hb <= 10) keys.push(null, 'x:' + HB[hb]); else if (hb > 10) keys.push(null, 'x:ジュウ', '+', 'x:' + HB[hb - 10]);
      if (game.isOras && game.isOras()) keys.push(null, 'x:オーラス'); // 最終局
      return A.speak(keys);
    },
  });
})();
