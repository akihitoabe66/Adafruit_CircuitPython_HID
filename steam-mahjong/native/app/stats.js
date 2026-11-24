/* 実機: 遊び方とクイズの記録。診断(いいところ・のばせるところ)と、苦手な問題を多めに出すための重みに使う。
   記録は localStorage の 'mj_stats' に、小さな数字だけを残す。 */
(function (G) {
  const MJ = G.MJ, KEY = 'mj_stats';
  const CATN = {
    eff: '牌効率(何を切る)', def: '守備(安全な牌)', call: '鳴く・見送る', yaku: '役づくり', wait: '待ちを当てる', push: '押し引き', riichi: 'リーチかダマか', keep: '数牌と役牌',
    han: '飜を数える', fu: '符を数える', pts: '点数を出す', ly_hand: '役の形', ly_desc: '役の知識', ly_han: '役の飜数', dora: 'ドラ', tbl: '点数表', concept: '基本の考え方',
  };
  const blank = () => ({ play: { effN: 0, effOk: 0, safeN: 0, safeOk: 0, winPts: 0, hands: 0, win: 0, tsumo: 0, ron: 0, deal: 0, tsumoed: 0, riichi: 0, riichiWin: 0, calls: 0, draw: 0 }, quiz: {}, miss: {}, all: [] });
  let D = null;
  const load = () => {
    if (D) return D;
    try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && v.play) D = v; } catch (e) { /* ignore */ }
    if (!D) D = blank(); D.quiz = D.quiz || {}; D.miss = D.miss || {}; D.all = D.all || []; return D;
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* ignore */ } };
  const acc = (h, n) => { const a = h.slice(-(n || 10)); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
  const pct = (x) => Math.round(x * 100) + '%';

  const DORA = ['ドラ', '赤ドラ', '裏ドラ', '花牌(季節牌)'], num = (v) => v || 0;
  const hanOf = (w) => (w && w.res && w.res.han) || 0;
  // 鳴いた手に「役の見こみ」があるか(ざっくり): 役牌・風牌のポン / 全部が2〜8(タンヤオ) / 1色+字牌(混一色) / ポンが2つ以上(対々和)
  const callHasYaku = (g, me) => {
    const open = me.melds.filter((m) => m.kind !== 'ankan'); if (!open.length) return true;
    const tiles = me.hand.map((h) => h.t); me.melds.forEach((m) => (m.tiles || []).forEach((q) => tiles.push(q.t)));
    if (open.some((m) => m.kind !== 'chi' && (m.t >= 31 || m.t === 27 + g.seatWindOf(me) || m.t === 27 + g.roundWind))) return true;
    if (tiles.every((t) => !MJ.isYaochu(t))) return true;
    const suits = new Set(tiles.filter((t) => t < 27).map((t) => MJ.suitOf(t)));
    if (suits.size <= 1) return true;
    if (open.filter((m) => m.kind !== 'chi').length >= 2) return true;
    return false;
  };
  const detail = (g, r, me, P) => { // 1局ぶんの 詳しい記録(上がった役・点・鳴き・振り込みの中身)を、合計の数字に足していく
    const open = me.melds.some((m) => m.kind !== 'ankan'), won = r.type === 'win' ? r.wins.find((w) => w.winner.isHuman) : null, dealt = r.type === 'win' ? r.wins.find((w) => w.loser === me && !w.tsumo) : null;
    if (open) { P.callHands = num(P.callHands) + 1; if (!won && !callHasYaku(g, me)) P.callNoYaku = num(P.callNoYaku) + 1; }
    if (won) {
      const ys = won.res.yaku.map((y) => y.n).filter((n) => DORA.indexOf(n) < 0), han = hanOf(won), pts = Math.max(0, r.delta[me.seat] || 0);
      P.winHan = num(P.winHan) + han;
      if (ys.length && ys.every((n) => n === 'リーチ')) P.winRo = num(P.winRo) + 1;
      if (!me.riichi && !open) P.winDama = num(P.winDama) + 1;
      if (han >= 5) P.winBig = num(P.winBig) + 1;
      if (open) { P.winCall = num(P.winCall) + 1; P.winCallPts = num(P.winCallPts) + pts; } else { P.winMen = num(P.winMen) + 1; P.winMenPts = num(P.winMenPts) + pts; }
      P.yk = P.yk || {}; ys.forEach((n) => { const k = n.replace(/ $/, ''); P.yk[k] = num(P.yk[k]) + 1; });
    }
    if (dealt) {
      const w = dealt, t = w.winTile && w.winTile.t; P.dealBig = num(P.dealBig) + (hanOf(w) >= 5 ? 1 : 0); if (w.winner.riichi) P.dealRi = num(P.dealRi) + 1; if (open) P.dealCall = num(P.dealCall) + 1;
      if (t != null) { const k = t >= 27 ? 'dealHon' : (t % 9 === 0 || t % 9 === 8) ? 'dealTer' : 'dealMid'; P[k] = num(P[k]) + 1; }
    }
  };

  const S = (MJ.Stats = {
    CATN, load, save, reset() { D = null; }, // 記録を消したあと、メモリの中も はじめにもどす
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
        if (won) { P.win++; P.winPts = (P.winPts || 0) + Math.max(0, (r.delta && r.delta[0]) || 0); if (r.tsumo) P.tsumo++; else P.ron++; if (me.riichi) P.riichiWin++; }
        else if (r.delta && r.delta[0] < 0) { if (r.tsumo) P.tsumoed++; else P.deal++; }
      } else P.draw++;
      try { detail(g, r, me, P); } catch (e) { /* ignore */ }
      save();
    },
    discard(effOk, safe) { // 打牌1回ぶん: effOk=true/false/null(数えない)、safe=[true(当たり牌を守った)/false(捨てて振り込む形)...]
      const d = load(), P = d.play; if (effOk != null) { P.effN = (P.effN || 0) + 1; if (effOk) P.effOk = (P.effOk || 0) + 1; }
      (safe || []).forEach((ok) => { P.safeN = (P.safeN || 0) + 1; if (ok) P.safeOk = (P.safeOk || 0) + 1; }); // 保存は、局が終わるときにまとめて(hand())
    },
    /* 強さの6項目(0〜100。データが足りないものは null)。 60点=ふつうに打てる、80点=じょうず */
    strength() {
      const d = load(), P = d.play, H = P.hands || 0, lin = (x, pts) => { if (x <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]); return pts[pts.length - 1][1]; };
      const quiz = (tags) => { let n = 0, s = 0; tags.forEach((t) => { const q = d.quiz[t]; if (q && q.h.length) { n += q.h.length; s += q.h.reduce((a, b) => a + b, 0); } }); return n >= 5 ? { v: 100 * s / n, n } : null; };
      const mix = (play, qz) => (play != null && qz ? (play + qz.v) / 2 : play != null ? play : qz ? qz.v : null);
      const wr = H >= 10 ? P.win / H : null, dr = H >= 10 ? P.deal / H : null;
      const safe = (P.safeN || 0) >= 8 ? lin(P.safeOk / P.safeN, [[0.80, 0], [0.93, 60], [0.98, 100]]) : null;
      const eff = (P.effN || 0) >= 20 && H >= 10 ? lin(P.effOk / P.effN, [[0.50, 0], [0.75, 60], [0.95, 100]]) : null;
      const pts = P.win >= 3 ? lin((P.winPts || 0) / P.win, [[2000, 0], [4000, 60], [7000, 100]]) : null;
      const ax = [
        { name: '攻撃力', v: wr == null ? null : lin(wr, [[0.10, 0], [0.20, 60], [0.30, 100]]) },
        { name: '守備力', v: dr == null ? null : lin(1 - dr, [[0.75, 0], [0.86, 60], [0.95, 100]]) },
        { name: '洞察力', v: mix(safe, quiz(['wait', 'push', 'riichi'])) },
        { name: '牌効率', v: mix(eff, quiz(['eff', 'keep', 'call'])) },
        { name: '計算力', v: (() => { const q = quiz(['han', 'fu', 'pts', 'tbl', 'dora', 'ly_hand', 'ly_desc', 'ly_han', 'concept']); return q ? q.v : null; })() },
        { name: '打点力', v: pts },
      ].map((a) => ({ name: a.name, v: a.v == null ? null : Math.round(Math.max(0, Math.min(100, a.v))) }));
      const have = ax.filter((a) => a.v != null);
      return { ax, total: have.length >= 3 ? Math.round(have.reduce((s, a) => s + a.v, 0) / have.length) : null };
    },
    weights(tags) { // 出す問題の重み: 最近まちがえている種類ほど大きく。まだ解いていない種類は、少し大きく
      const d = load(); return tags.map((t) => { const q = d.quiz[t]; if (!q || q.n < 2) return 2; const a = acc(q.h, 10); return 1 + Math.round((1 - a) * 4); });
    },
    weakest(n, minN) { // 正解率の低い種類(正解率が8割を超えるものは入れない)
      const d = load(); return Object.keys(d.quiz).filter((t) => d.quiz[t].n >= (minN || 3) && acc(d.quiz[t].h, 10) < 0.8).sort((a, b) => acc(d.quiz[a].h, 10) - acc(d.quiz[b].h, 10)).slice(0, n || 2);
    },
    detailDiag() { // 「くわしく見る」: 役と点数 / 鳴き / 振り込み の、具体的な指摘
      const d = load(), P = d.play, H = P.hands || 0, W = P.win || 0, N = P.deal || 0, CH = P.callHands || 0, yk = P.yk || {};
      const cats = [{ name: '役と点数', items: [] }, { name: '鳴き', items: [] }, { name: '振り込み', items: [] }];
      const add = (c, lv, title, l1, l2) => cats[c].items.push({ lv, title, l1, l2: l2 || '' });
      const avg = (a, n) => (n ? Math.round(a / n / 100) * 100 : 0), yen = (v) => v.toLocaleString ? v.toLocaleString() : String(v);
      if (H >= 10) {
        // 役と点数
        if (W >= 4) {
          const ro = num(P.winRo), ap = avg(P.winPts || 0, W);
          if (ro / W >= 0.4) add(0, '!', '上がりの ' + Math.round(ro / W * 10) + '割が「リーチのみ」', '上がった ' + W + '回のうち ' + ro + '回が リーチのみです(平均 ' + yen(ap) + '点)。', '役を増やしましょう。タンヤオ・ピンフ・三色を 狙うと 点が 倍に なります。');
          if (ap < 3000) add(0, '!', '1回の上がりが 安めです', '上がった ' + W + '回の 平均は ' + yen(ap) + '点です。', 'ドラを 使う・役牌を 鳴く・ツモも 足すと 高くなります。');
          if (!P.winBig) add(0, '!', '満貫以上の手が まだ 0回', '高い手を 狙う場面が 少なめです。', 'リーチ+ツモ+ドラ や、役牌+ドラ を ねらってみましょう。');
          else add(0, '○', '満貫以上を ' + P.winBig + '回', '大きな手を 上がれています。', null);
          const miss = ['タンヤオ', '平和', '三色同順', '一気通貫', '七対子', '対々和', '混一色', '役牌'].filter((n) => !yk[n]);
          if (miss.length >= 2 && W >= 5) add(0, 'i', 'まだ 上がったことのない役', miss.slice(0, 4).join('・'), '勉強の「ステップ3」で 形を おぼえると 手が 伸びます。');
          const ts = P.tsumo || 0; if (ts / W >= 0.4) add(0, '○', 'ツモ上がりが 多いです', '上がりの ' + Math.round(ts / W * 10) + '割が ツモです。', null);
        } else if (H >= 10) add(0, 'i', 'まだ 上がりが すくないです', '上がりが ' + W + '回です。あと ' + (4 - W) + '回ほどで 詳しく 見られます。', null);
        // 鳴き
        if (CH >= 4) {
          const nb = num(P.callNoYaku); if (nb / CH >= 0.3) add(1, '!', '役のつかない 鳴きが ' + nb + '回', 'ポン・チーをした ' + CH + '局のうち ' + nb + '局は、役が 見こめない形でした。', '役牌(白發中・風牌)か タンヤオの 見こみが あるときだけ 鳴きましょう。');
          else if (nb === 0) add(1, '○', '役のある 鳴きが できています', 'ポン・チーをした ' + CH + '局に 役のない 鳴きは ありませんでした。', null);
          if (num(P.winCall) >= 2 && num(P.winMen) >= 2) { const a1 = avg(P.winCallPts, P.winCall), a2 = avg(P.winMenPts, P.winMen); if (a1 < a2 * 0.6) add(1, '!', '鳴くと 点が 安くなっています', '鳴いた上がり 平均 ' + yen(a1) + '点 / 鳴かない上がり 平均 ' + yen(a2) + '点。', '手が 良いときは 鳴かずに リーチも 考えましょう。'); }
          if (num(P.winCall) / CH < 0.15) add(1, '!', '鳴いても あまり 上がれていません', CH + '局 鳴いて、上がれたのは ' + num(P.winCall) + '局です。', '鳴くなら 早い巡目で 役が はっきり している手だけに。');
        } else if (H >= 12) add(1, 'i', '鳴きの記録が まだ すくないです', 'ポン・チーをした局が ' + CH + '局です(4局ほどで 見られます)。', null);
        // 振り込み
        if (N >= 3) {
          if (num(P.dealRi) / N >= 0.5) add(2, '!', 'リーチに 振り込みが 多いです', '振り込み ' + N + '回のうち ' + P.dealRi + '回が リーチをかけた人でした。', 'リーチが かかったら、現物(その人が 捨てた牌)を 先に 切りましょう。');
          if (num(P.dealBig) / N >= 0.3) add(2, '!', '大きな手に 振り込んでいます', '振り込み ' + N + '回のうち ' + P.dealBig + '回が 満貫以上でした。', 'ドラが 見えている人や 染め手の人には 特に 慎重に。');
          if (num(P.dealCall) / N >= 0.5) add(2, '!', '鳴いた手で 振り込みが 多いです', '振り込み ' + N + '回のうち ' + P.dealCall + '回は 自分が 鳴いている局でした。', '鳴いたあとは 手牌が 少なく 守りにくいので 注意を。');
          if (num(P.dealMid) / N >= 0.7 && N >= 4) add(2, 'i', '真ん中の牌(2〜8)での 振り込み', N + '回のうち ' + P.dealMid + '回が 真ん中の牌でした。', '相手の 捨て牌から スジや 現物を 確かめる 習慣を。');
        } else if (H >= 12 && N < 3) add(2, '○', '振り込みが すくないです', H + '局で 振り込みは ' + N + '回です。守りが 堅いです。', null);
      }
      cats.forEach((c) => { c.warn = c.items.filter((i) => i.lv === '!').length; c.items.sort((a, b) => ('!i○'.indexOf(a.lv)) - ('!i○'.indexOf(b.lv))); c.items = c.items.slice(0, 3); });
      return { cats, hands: H };
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
      if ((P.safeN || 0) >= 8) { const r = P.safeOk / P.safeN; if (r >= 0.96) good.push('当たり牌を よく 止めています。(守った率 ' + pct(r) + ')'); else if (r < 0.9) weak.push('ほかの人が待っている牌を 切ってしまうことが あります。(守った率 ' + pct(r) + ')  相手の捨て牌を 見てみましょう。'); }
      if ((P.effN || 0) >= 20) { const r = P.effOk / P.effN; if (r >= 0.8) good.push('打つ牌が 最善に 近いです。(' + pct(r) + ')'); else if (r < 0.6) weak.push('打つ牌が 最善と ちがうことが 多めです。(' + pct(r) + ')  牌効率の クイズが おすすめです。'); }
      Object.keys(d.quiz).forEach((t) => { const q = d.quiz[t]; if (q.n < 3) return; const a = acc(q.h, 10), nm = CATN[t] || t;
        if (a >= 0.8) good.push('「' + nm + '」が 得意です。(正解率 ' + pct(a) + ')'); else if (a <= 0.5) weak.push('「' + nm + '」が 苦手です。(正解率 ' + pct(a) + ')  クイズで 多めに 出題します。'); });
      let trend = '';
      if (d.all.length >= 12) { const n = d.all.length, last = acc(d.all, 8), prev = d.all.slice(0, n - 8).slice(-8).reduce((x, y) => x + y, 0) / Math.min(8, n - 8); if (last - prev >= 0.15) trend = '最近のクイズは、正解率が 上がっています。成長中です!'; else if (last - prev <= -0.15) trend = '最近は 少し まちがいが 増えています。ゆっくり 復習しましょう。'; else trend = '正解率は 安定しています。'; }
      if (trend) notes.push(trend);
      return { good, weak, notes, hands: H, quizN, bars: Object.keys(d.quiz).filter((t) => d.quiz[t].n > 0).map((t) => ({ t, name: CATN[t] || t, n: d.quiz[t].n, a: acc(d.quiz[t].h, 10) })).sort((x, y) => x.a - y.a) };
    },
  });
})(globalThis);
