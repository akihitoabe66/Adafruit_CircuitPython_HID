/* 実機: 遊び方とクイズの記録。診断(いいところ・のばせるところ)と、苦手な問題を多めに出すための重みに使う。
   記録は localStorage の 'mj_stats' に、小さな数字だけを残す。 */
(function (G) {
  const MJ = G.MJ, KEY = 'mj_stats';
  const CATN = {
    eff: '牌効率(何を切る)', def: '守備(安全な牌)', call: '鳴く・見送る', yaku: '役づくり', wait: '待ちを当てる', push: '押し引き', riichi: 'リーチかダマか', keep: '数牌と役牌',
    han: '飜を数える', fu: '符を数える', pts: '点数を出す', ly_hand: '役の形', ly_desc: '役の知識', ly_han: '役の飜数', dora: 'ドラ', tbl: '点数表', concept: '基本の考え方',
  };
  const blank = () => ({ play: { hands: 0, win: 0, tsumo: 0, ron: 0, deal: 0, tsumoed: 0, riichi: 0, riichiWin: 0, calls: 0, draw: 0 }, quiz: {}, miss: {}, all: [] });
  let D = null;
  const load = () => {
    if (D) return D;
    try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && v.play) D = v; } catch (e) { /* ignore */ }
    if (!D) D = blank(); D.quiz = D.quiz || {}; D.miss = D.miss || {}; D.all = D.all || []; return D;
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* ignore */ } };
  const acc = (h, n) => { const a = h.slice(-(n || 10)); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
  const pct = (x) => Math.round(x * 100) + '%';

  const S = (MJ.Stats = {
    CATN, load, save,
    tag(p) { if (p.tag) return p.tag; if (p.cat === 'score') return p.title === '何飜?' ? 'han' : p.title === '何符?' ? 'fu' : 'pts'; return p.cat || 'other'; },
    quiz(p, ok) { // クイズ1問ぶんの結果
      const d = load(), t = S.tag(p), q = d.quiz[t] || (d.quiz[t] = { n: 0, ok: 0, h: [] });
      q.n++; if (ok) q.ok++; q.h.push(ok ? 1 : 0); if (q.h.length > 12) q.h.shift();
      d.all.push(ok ? 1 : 0); if (d.all.length > 40) d.all.shift();
      if (p.yid) d.miss[p.yid] = Math.max(0, (d.miss[p.yid] || 0) + (ok ? -1 : 2));
      save();
    },
    hand(g, r) { // 1局が終わったときの記録(自分の分だけ)
      const d = load(), P = d.play, me = g.players[0]; P.hands++;
      if (me.riichi) P.riichi++;
      if (me.melds && me.melds.some((m) => m.kind !== 'ankan')) P.calls++;
      if (r.type === 'win') {
        const won = r.wins.some((w) => w.winner.isHuman);
        if (won) { P.win++; if (r.tsumo) P.tsumo++; else P.ron++; if (me.riichi) P.riichiWin++; }
        else if (r.delta && r.delta[0] < 0) { if (r.tsumo) P.tsumoed++; else P.deal++; }
      } else P.draw++;
      save();
    },
    weights(tags) { // 出す問題の重み: 最近まちがえている種類ほど大きく。まだ解いていない種類は、少し大きく
      const d = load(); return tags.map((t) => { const q = d.quiz[t]; if (!q || q.n < 2) return 2; const a = acc(q.h, 10); return 1 + Math.round((1 - a) * 4); });
    },
    weakest(n, minN) { // 正解率の低い種類(正解率が8割を超えるものは入れない)
      const d = load(); return Object.keys(d.quiz).filter((t) => d.quiz[t].n >= (minN || 3) && acc(d.quiz[t].h, 10) < 0.8).sort((a, b) => acc(d.quiz[a].h, 10) - acc(d.quiz[b].h, 10)).slice(0, n || 2);
    },
    diag() { // 診断: いいところ・のばせるところ・記録
      const d = load(), P = d.play, H = P.hands, good = [], weak = [], notes = [];
      const quizN = Object.keys(d.quiz).reduce((a, t) => a + d.quiz[t].n, 0);
      if (H >= 6) {
        const wr = P.win / H, dr = P.deal / H, rr = P.riichi / H, cr = P.calls / H;
        if (dr <= 0.10) good.push('守りが堅いです。振り込み(放銃)が少なく、点を失いにくい打ち方です。(振り込み ' + pct(dr) + ')');
        if (wr >= 0.25) good.push('上がる力があります。' + pct(wr) + ' の局で上がっています。');
        if (P.riichi >= 3 && P.riichiWin / P.riichi >= 0.4) good.push('リーチをかけた手が、よく上がれています。(リーチ後の和了率 ' + pct(P.riichiWin / P.riichi) + ')');
        if (cr >= 0.2 && cr <= 0.5) good.push('ポン・チーを使い分けられています。');
        if (dr >= 0.18) weak.push('振り込みが多めです(' + pct(dr) + ')。危ないと思ったら、現物(相手が捨てた牌)やスジを先に確かめましょう。クイズ「守備」が おすすめです。');
        if (wr <= 0.12 && H >= 10) weak.push('上がりが少なめです(' + pct(wr) + ')。まずは、タンヤオや役牌など、作りやすい役を意識しましょう。学習コーナーの ステップ2 が おすすめです。');
        if (cr <= 0.08 && H >= 10) weak.push('ポン・チーを、ほとんど していません。鳴くと上がりやすくなります。タンヤオ・役牌から 試してみましょう。');
        if (cr >= 0.6) weak.push('鳴きすぎかもしれません。鳴くと点が安くなります。門前で リーチも 狙ってみましょう。');
        if (rr <= 0.05 && H >= 12) weak.push('リーチが少なめです。テンパイしたら、リーチも 考えてみましょう。');
        notes.push('遊んだ局数 ' + H + '局    上がり ' + pct(wr) + '    振り込み ' + pct(dr) + '    リーチ ' + pct(rr) + '    鳴き ' + pct(cr));
      } else notes.push('遊んだ局が まだ少ないので(' + H + '局)、遊び方の診断は あと ' + (6 - H) + '局 ほどで できます。');
      Object.keys(d.quiz).forEach((t) => { const q = d.quiz[t]; if (q.n < 3) return; const a = acc(q.h, 10), nm = CATN[t] || t;
        if (a >= 0.8) good.push('「' + nm + '」が 得意です。(正解率 ' + pct(a) + ')'); else if (a <= 0.5) weak.push('「' + nm + '」が 苦手です。(正解率 ' + pct(a) + ')  クイズで 多めに 出題します。'); });
      let trend = '';
      if (d.all.length >= 12) { const n = d.all.length, last = acc(d.all, 8), prev = d.all.slice(0, n - 8).slice(-8).reduce((x, y) => x + y, 0) / Math.min(8, n - 8); if (last - prev >= 0.15) trend = '最近のクイズは、正解率が 上がっています。成長中です!'; else if (last - prev <= -0.15) trend = '最近は 少し まちがいが 増えています。ゆっくり 復習しましょう。'; else trend = '正解率は 安定しています。'; }
      if (trend) notes.push(trend);
      return { good, weak, notes, hands: H, quizN, bars: Object.keys(d.quiz).filter((t) => d.quiz[t].n > 0).map((t) => ({ t, name: CATN[t] || t, n: d.quiz[t].n, a: acc(d.quiz[t].h, 10) })).sort((x, y) => x.a - y.a) };
    },
  });
})(globalThis);
