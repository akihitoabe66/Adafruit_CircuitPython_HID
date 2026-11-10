/* 実機: 「点数計算の勉強」(ステップアップの読み物+クイズ)の中身。
   牌は H('234m 567p 東東') のように書く(m=萬子 p=筒子 s=索子、1文字の字牌は そのまま)。
   ここを書きかえれば、読み物の文章も、クイズも、増やしたり直したりできる。 */
(function (G) {
  const MJ = G.MJ;
  const HON = { 東: 27, 南: 28, 西: 29, 北: 30, 白: 31, 發: 32, 中: 33 };
  const SUITB = { m: 0, p: 9, s: 18 };
  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rnd(a.length)];
  const shuf = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const mk = (t) => '⟦' + t + '⟧';

  /* 牌の書きかた → 牌の番号の並び(手牌用)。空白は、かたまりの区切り(区切りは -1) */
  function tiles(str) {
    const out = []; let buf = [];
    for (const ch of String(str)) {
      if (ch >= '1' && ch <= '9') buf.push(+ch - 1);
      else if (SUITB[ch] != null) { buf.forEach((n) => out.push(SUITB[ch] + n)); buf = []; }
      else if (HON[ch] != null) out.push(HON[ch]);
      else if (ch === ' ') out.push(-1);
    }
    return out;
  }
  const H = (str) => tiles(str).map((t) => (t < 0 ? ' ' : mk(t))).join('');

  /* ふりがなを足す(Edge版の辞書に、役の名前などを足す) */
  const R = (MJ.Ruby = MJ.Ruby || { dict: {} });
  Object.assign(R.dict, {
    混一色: 'ほんいつ', 清一色: 'ちんいつ', 対々和: 'といといほー', 七対子: 'ちーといつ', 三色同順: 'さんしょくどうじゅん', 一気通貫: 'いっきつうかん',
    混全帯么九: 'ちゃんたいやおちゅう', 三暗刻: 'さんあんこう', 小三元: 'しょうさんげん', 大三元: 'だいさんげん', 四暗刻: 'すーあんこー', 国士無双: 'こくしむそう',
    字一色: 'つーいーそー', 緑一色: 'りゅーいーそー', 清老頭: 'ちんろうとう', 一盃口: 'いーぺーこー', 平和: 'ぴんふ', 断么九: 'たんやおちゅう', 立直: 'りーち',
    門前清自摸和: 'めんぜんちんつもほー', 役牌: 'やくはい', 食い下がり: 'くいさがり', 鳴く: 'なく', 鳴き: 'なき', 門前: 'めんぜん', 刻子: 'こうつ', 順子: 'しゅんつ',
    雀頭: 'じゃんとう', 面子: 'めんつ', 暗刻: 'あんこう', 対子: 'といつ', 么九牌: 'やおちゅうはい', 中張牌: 'ちゅんちゃんはい', 数牌: 'すうはい', 字牌: 'じはい',
    表示牌: 'ひょうじはい', 裏ドラ: 'うらどら', 赤ドラ: 'あかどら', 飜: 'はん', 符: 'ふ', 満貫: 'まんがん', 跳満: 'はねまん', 倍満: 'ばいまん', 三倍満: 'さんばいまん', 役満: 'やくまん',
    親: 'おや', 子: 'こ', 基本点: 'きほんてん', 副底: 'ふてい', 待ち: 'まち', 両面: 'りょうめん', 嵌張: 'かんちゃん', 辺張: 'ぺんちゃん', 単騎: 'たんき', 切り上げ: 'きりあげ',
    和了: 'あがり', 倍: 'ばい', 明刻: 'みんこう', 萬: 'まん', 筒: 'とん', 索: 'そう',
  });

  /* ---------- 役の一覧(名前・飜・説明・見本の手) ---------- */
  const Y = {
    riichi: { n: 'リーチ(立直)', han: 1, d: 'テンパイ(あと1枚で上がり)になったら「リーチ」と言って、牌を横にして捨てる役。鳴いていない手(門前)だけ。', note: '門前のみ' },
    tsumo: { n: 'ツモ(門前清自摸和)', han: 1, d: '鳴かずに、自分で引いた牌で上がる役。', note: '門前のみ' },
    tanyao: { n: 'タンヤオ(断么九)', han: 1, kui: 1, d: '2から8までの数牌だけで作る役。1・9・字牌が1枚もない手。鳴いてもOK。', hand: '234m 567m 345p 678s 55s' },
    pinfu: { n: 'ピンフ(平和)', han: 1, d: '順子だけで作る。雀頭は役にならない牌で、待ちは両面。門前のみ。', hand: '234m 456p 678p 345s 99m', note: '門前のみ' },
    yakuhai: { n: '役牌(やくはい)', han: 1, kui: 1, d: '白・發・中の刻子(同じ牌3枚)。1組で1飜。鳴いてもOK。', hand: '白白白 234m 567p 345s 88m' },
    ipeiko: { n: 'イーペーコー(一盃口)', han: 1, d: '同じ数字の順子が2組ある形。門前のみ。', hand: '112233m 456p 789s 55p', note: '門前のみ' },
    sanshoku: { n: '三色同順', han: 2, kui: 1, d: '萬子・筒子・索子で、同じ数字の順子をそろえる。', hand: '234m 234p 234s 567m 55p' },
    ittsu: { n: '一気通貫', han: 2, kui: 1, d: '同じ色で、123・456・789の順子をそろえる。', hand: '123m 456m 789m 234p 55s' },
    toitoi: { n: '対々和', han: 2, kui: 2, d: '4組とも刻子(同じ牌3枚)で作る。ポンをたくさんしても作れる。', hand: '222m 555p 777s 白白白 99m' },
    chiitoi: { n: '七対子', han: 2, d: '対子(同じ牌2枚)を7組そろえる。鳴けない。25符で数える。', hand: '11m 33m 55p 77p 22s 66s 白白', note: '門前のみ' },
    chanta: { n: 'チャンタ(混全帯么九)', han: 2, kui: 1, d: 'すべての面子と雀頭に、1・9・字牌が入っている。', hand: '123m 789m 123p 999s 東東' },
    sanankou: { n: '三暗刻', han: 2, kui: 2, d: '鳴かない刻子(暗刻)が3組ある。', hand: '222m 555p 888s 345m 99p' },
    shosangen: { n: '小三元', han: 2, kui: 2, d: '白・發・中のうち、2種類が刻子、1種類が雀頭。役牌の分も足して、合計4飜になる。', hand: '白白白 發發發 中中 234m 567p' },
    honitsu: { n: '混一色(ホンイツ)', han: 3, kui: 2, d: '1つの色の数牌と、字牌だけで作る。', hand: '123m 456m 789m 東東東 白白' },
    chinitsu: { n: '清一色(チンイツ)', han: 6, kui: 5, d: '1つの色の数牌だけで作る。字牌はなし。', hand: '111m 234m 567m 888m 99m' },
    daisangen: { n: '大三元', han: 13, d: '白・發・中の3つとも刻子で作る。役満(13飜と同じ)。', hand: '白白白 發發發 中中中 234m 55p', yakuman: 1 },
    suuankou: { n: '四暗刻', han: 13, d: '鳴かない刻子(暗刻)を4組作る。役満。', yakuman: 1 },
    kokushi: { n: '国士無双', han: 13, d: '1・9の数牌と字牌、全部で13種類を1枚ずつそろえ、どれか1枚を重ねる。役満。', yakuman: 1 },
    tsuuiisou: { n: '字一色', han: 13, d: '東南西北白發中の字牌だけで作る。役満。', yakuman: 1 },
    ryuuiisou: { n: '緑一色', han: 13, d: '緑色の牌(2・3・4・6・8索と發)だけで作る。役満。', yakuman: 1 },
  };
  const tl = (str) => tiles(str).filter((t) => t >= 0).map((t) => ({ t, red: false }));
  const hanText = (y) => (y.yakuman ? '役満' : y.han + '飜') + (y.kui ? '(鳴くと' + y.kui + '飜)' : y.note ? '(' + y.note + ')' : '');

  function pickOpts(correct, pool, n) { // 正解を1つと、ほかから選んだ誤りで、n個(まぜる)
    const wrong = shuf(pool.filter((x) => x !== correct)).slice(0, n - 1);
    return shuf([correct].concat(wrong));
  }
  /* この形は何の役? */
  const genYakuHand = (ids) => () => {
    const withHand = ids.filter((k) => Y[k].hand), k = pick(withHand), y = Y[k];
    const pool = ids.length >= 4 ? ids : ids.concat(Object.keys(Y).filter((x) => !Y[x].yakuman && x !== 'riichi' && x !== 'tsumo' && !ids.includes(x)));
    const opts = pickOpts(k, pool, 4);
    return { cat: 'learn', kind: 'choice', title: 'この形は、何の役?', sit: '上がりの形(14枚)です。', prompt: 'この手に ついている<b>役</b>は どれですか?', hand: tl(y.hand),
      options: opts.map((o) => ({ id: o, html: Y[o].n })),
      grade(id) { return { r: id === k ? 'ok' : 'ng', html: '<p>正解は 「' + y.n + '」(' + hanText(y) + ')。</p><p>' + y.d + '</p>' }; } };
  };
  /* 説明を読んで、役の名前を答える */
  const genYakuDesc = (ids) => () => {
    const k = pick(ids), y = Y[k];
    const opts = pickOpts(k, ids.length >= 4 ? ids : ids.concat(['tanyao', 'pinfu', 'yakuhai', 'toitoi', 'honitsu']), 4);
    return { cat: 'learn', kind: 'choice', title: 'この説明は、どの役?', sit: '', prompt: y.d.replace(/(役満|役の名前)/g, '$1'), hand: [],
      options: opts.map((o) => ({ id: o, html: Y[o].n })),
      grade(id) { return { r: id === k ? 'ok' : 'ng', html: '<p>正解は 「' + y.n + '」(' + hanText(y) + ')。</p>' + (y.hand ? '<p>こんな形です。</p>' : '') }; } };
  };
  /* この役は何飜? */
  const genYakuHan = (ids) => () => {
    const k = pick(ids.filter((x) => !Y[x].yakuman)), y = Y[k];
    const opts = pickOpts(y.han, [1, 2, 3, 4, 6], 4).sort((a, b) => a - b);
    return { cat: 'learn', kind: 'choice', title: '「' + y.n + '」は、何飜?', sit: '', prompt: '鳴かずに(門前で)作ったときの<b>飜数</b>は?', hand: y.hand ? tl(y.hand) : [],
      options: opts.map((o) => ({ id: String(o), html: o + '飜' })),
      grade(id) { return { r: +id === y.han ? 'ok' : 'ng', html: '<p>正解は <b>' + y.han + '飜</b>。' + (y.kui ? '鳴くと ' + y.kui + '飜に 減ります(食い下がり)。' : y.note ? y.note + 'の役です。' : '鳴いても 同じ飜数です。') + '</p>' }; } };
  };
  /* ドラは、どれ? */
  const genDora = () => {
    const nxt = (t) => (t < 27 ? (t % 9 === 8 ? t - 8 : t + 1) : t < 31 ? (t === 30 ? 27 : t + 1) : (t === 33 ? 31 : t + 1));
    const ind = Math.random() < 0.7 ? rnd(27) : 27 + rnd(7), dora = nxt(ind);
    const all = [dora]; while (all.length < 4) { const t = Math.random() < 0.7 ? rnd(27) : 27 + rnd(7); if (!all.includes(t) && t !== ind) all.push(t); }
    const opts = shuf(all);
    const name = (t) => MJ.tileName(t);
    return { cat: 'learn', kind: 'choice', title: 'ドラは、どれ?', sit: 'ドラ表示牌(めくった牌)は ' + mk(ind) + ' です。', prompt: '<b>ドラ</b>になる牌は どれですか?(ドラは 表示牌の「次の牌」)', hand: [],
      options: opts.map((t) => ({ id: String(t), html: mk(t) })),
      grade(id) { return { r: +id === dora ? 'ok' : 'ng', html: '<p>正解は ' + mk(dora) + ' (' + name(dora) + ')。表示牌 ' + mk(ind) + ' の「次の牌」がドラです。</p><p>9の次は1、東→南→西→北→東、白→發→中→白 の順です。</p>' }; } };
  };
  /* 子の満貫・跳満…の点数 */
  const LV = [{ n: '満貫', h: '5飜', ko: 8000 }, { n: '跳満', h: '6〜7飜', ko: 12000 }, { n: '倍満', h: '8〜10飜', ko: 16000 }, { n: '三倍満', h: '11〜12飜', ko: 24000 }, { n: '役満', h: '13飜以上(または役満の役)', ko: 32000 }];
  const man = (x) => x.toLocaleString ? String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '点' : x + '点';
  const genMangan = () => {
    const L = pick(LV), byHan = Math.random() < 0.5;
    const opts = shuf(LV.map((x) => x.ko));
    return { cat: 'learn', kind: 'choice', title: '子の点数(ロン)は?', sit: '', prompt: byHan ? '<b>子</b>が <b>' + L.h + '</b> の手を ロンで上がったときの点数は?' : '<b>子</b>が <b>' + L.n + '</b> を ロンで上がったときの点数は?', hand: [],
      options: opts.map((o) => ({ id: String(o), html: man(o) })),
      grade(id) { return { r: +id === L.ko ? 'ok' : 'ng', html: '<p>正解は <b>' + man(L.ko) + '</b>。</p><p>' + LV.map((x) => x.n + ' ' + x.ko).join(' / ') + '</p>' }; } };
  };
  const genOya = () => {
    const L = pick(LV), ans = L.ko * 1.5;
    const opts = shuf([ans, L.ko * 2, L.ko, L.ko * 1.25]);
    return { cat: 'learn', kind: 'choice', title: '親の点数(ロン)は?', sit: '子の' + L.n + 'は ' + man(L.ko) + ' です。', prompt: '<b>親</b>が同じ ' + L.n + ' を ロンで上がると? (親は 子の<b>1.5倍</b>)', hand: [],
      options: opts.map((o) => ({ id: String(o), html: man(o) })),
      grade(id) { return { r: +id === ans ? 'ok' : 'ng', html: '<p>正解は <b>' + man(ans) + '</b>。' + man(L.ko) + ' × 1.5 = ' + man(ans) + ' です。</p>' }; } };
  };
  const PT30 = { 1: 1000, 2: 2000, 3: 3900, 4: 7700 };
  const genPt30 = () => {
    const h = 1 + rnd(4), ans = PT30[h], opts = shuf(Object.values(PT30));
    return { cat: 'learn', kind: 'choice', title: '30符の目安(子・ロン)', sit: '', prompt: '<b>30符</b>の子が <b>' + h + '飜</b> で ロン上がり。点数は?', hand: [],
      options: opts.map((o) => ({ id: String(o), html: man(o) })),
      grade(id) { return { r: +id === ans ? 'ok' : 'ng', html: '<p>正解は <b>' + man(ans) + '</b>。</p><p>30符・子・ロン: 1飜 1000 / 2飜 2000 / 3飜 3900 / 4飜 7700</p>' }; } };
  };
  /* かんたんな○×(基本の考えかた) */
  const FIXED = [
    ['点数の計算で、いちばん最初に覚えるのは?', ['飜(はん)', '符(ふ)', '持ち点', '順位'], 0, '飜(役とドラの数)から覚えれば大丈夫です。符は あとから 覚えましょう。'],
    ['飜(はん)とは?', ['役とドラの 数', '牌の 枚数', 'points の 差', '場の 風'], 0, '飜は「役の飜数」と「ドラの数」を足した数です。'],
    ['親の点数は、子の何倍?', ['1.5倍', '2倍', '同じ', '3倍'], 0, '親は 子の 1.5倍 もらえます。だから、まずは 子だけ覚えれば OK です。'],
    ['点数は、何で決まる?', ['飜と符', '持ち点と順位', '牌の色', '局の数'], 0, '飜(はん)と符(ふ)で決まります。まずは 飜だけで 大丈夫です。'],
  ].map((q) => () => {
    const ans = q[1][q[2]], opts = shuf(q[1].map((x) => x.replace('points', '点'))), a2 = ans.replace('points', '点');
    return { cat: 'learn', kind: 'choice', title: 'ちょっと確認', sit: '', prompt: q[0], hand: [], options: opts.map((o) => ({ id: o, html: o })),
      grade(id) { return { r: id === a2 ? 'ok' : 'ng', html: '<p>正解は 「' + a2 + '」。</p><p>' + q[3] + '</p>' }; } };
  });
  const genFixed = () => pick(FIXED)();

  /* Edge版の点数問題から、ほしい種類だけ取り出す */
  const fromScore = (titleKey, kodomoOnly) => () => {
    for (let i = 0; i < 40; i++) { const p = MJ.Drill.genScore(); if (p && p.title === titleKey && (!kodomoOnly || /子の/.test(p.prompt || ''))) return p; }
    return null;
  };

  /* ---------- 読み物(ページ)と、クイズ ---------- */
  const E1 = ['tanyao', 'pinfu', 'yakuhai', 'ipeiko', 'riichi', 'tsumo'];
  const E2 = ['sanshoku', 'ittsu', 'toitoi', 'chiitoi', 'chanta', 'sanankou', 'shosangen', 'honitsu', 'chinitsu'];
  const EY = ['daisangen', 'suuankou', 'kokushi', 'tsuuiisou', 'ryuuiisou'];
  const yp = (k, extra) => ({ h: Y[k].n + '  ' + hanText(Y[k]), items: [Y[k].d + (extra ? '\n' + extra : ''), Y[k].hand ? { hand: Y[k].hand } : ''] });

  MJ.Learn = {
    Y, H, tiles,
    GOAL: 'ゴール: 自分の手の 点数を、自分で 数えられるように なる',
    STEPS: [
      { id: 'flow', t: '点数が決まる しくみ', lv: '入門', sum: '飜(はん)だけ、まず覚える', n: 3, gens: [genFixed], pages: [
        { h: '点数は 何で 決まる?', items: ['麻雀の点数は「飜(はん)」と「符(ふ)」で決まります。', '「飜」は、役と ドラの 数です。', '「符」は、手の形で 決まる 細かい数です。', '最初は、飜だけ 覚えれば 大丈夫です。符は あとの 上級で 読みます。'] },
        { h: '数える順番', items: ['①役を見つけて 飜数を 数える(+ ドラ)', '②飜数から、点数表で 点数を 調べる', 'たったこれだけです。', '符は、慣れてから「もっと正確に」と思ったときに 覚えましょう。'] },
        { h: '親は 子の 1.5倍', items: ['親が上がると、子の 1.5倍の 点数に なります。', '例: 子の満貫が 8000点なら、親の満貫は 12000点。', 'だから、覚えるのは「子の点数」だけで 大丈夫です。', '親のときは、1.5倍するだけ。'] },
      ] },
      { id: 'yaku1', t: 'まずは 1飜の やさしい役', lv: '初級', sum: 'タンヤオ・ピンフ・役牌など', n: 5, gens: [genYakuHand(E1), genYakuDesc(E1), genYakuHan(E1)], pages: [
        { h: '役が ないと 上がれません', items: ['麻雀は、役が1つ以上ないと 上がれません。', 'まずは、いちばん やさしい 1飜の役を 覚えましょう。', 'リーチ・ツモ・タンヤオ・ピンフ・役牌・イーペーコー の6つです。'] },
        { h: Y.riichi.n + '  ' + hanText(Y.riichi), items: [Y.riichi.d, '', Y.tsumo.n + '  ' + hanText(Y.tsumo) + '\n' + Y.tsumo.d] },
        yp('tanyao', 'いちばん 作りやすい役です。1・9・字牌を 捨てていけば できます。'),
        yp('yakuhai', '白・發・中が 2枚あれば、出たとき ポンして 役にできます。'),
        yp('pinfu'),
        yp('ipeiko'),
      ] },
      { id: 'yaku2', t: '2飜以上の おもな役', lv: '初級', sum: '三色・一気通貫・混一色など', n: 5, gens: [genYakuHand(E2), genYakuHand(E2), genYakuHan(E2), genYakuDesc(E2)], pages: [
        { h: '鳴くと 飜が 減る役', items: ['役の中には、鳴く(ポン・チーをする)と、1飜 減る役が あります。', 'これを「食い下がり」と 言います。', 'この先の 役は、「門前(鳴かない)のときの飜数」で 覚えましょう。'] },
        yp('chiitoi'), yp('toitoi'), yp('sanshoku'), yp('ittsu'), yp('chanta'), yp('sanankou'), yp('shosangen'), yp('honitsu', '字牌のポンで 進めやすい、よく出る役です。'), yp('chinitsu'),
      ] },
      { id: 'yakuman', t: '役満を 知ろう', lv: '初級', sum: 'めったに出ない 最高の役', n: 3, gens: [genYakuDesc(EY)], pages: [
        { h: '役満(やくまん)', items: ['役満は、いちばん 点数の高い 役です。子で 32000点、親で 48000点。', 'めったに 出ませんが、出たら大喜びです。', '名前と 形を 軽く 知っておくだけで OK。'] },
        { h: '代表的な 役満', items: [Y.daisangen.n + ': ' + Y.daisangen.d, { hand: Y.daisangen.hand }, Y.suuankou.n + ': ' + Y.suuankou.d, Y.kokushi.n + ': ' + Y.kokushi.d] },
        { h: 'ほかの 役満', items: [Y.tsuuiisou.n + ': ' + Y.tsuuiisou.d, Y.ryuuiisou.n + ': ' + Y.ryuuiisou.d] },
      ] },
      { id: 'dora', t: 'ドラを 数える', lv: '初級', sum: 'ドラは 1枚で 1飜', n: 5, gens: [genDora], pages: [
        { h: 'ドラ とは', items: ['ドラは、持っているだけで 1枚につき 1飜 増える 牌です。', 'ただし、ドラだけでは 上がれません。役が 必要です。', '場に めくってある「ドラ表示牌」の、次の牌が ドラです。'] },
        { h: 'ドラは「次の牌」', items: ['表示牌が ' + H('3m') + ' なら、ドラは ' + H('4m') + '。', '表示牌が ' + H('9p') + ' なら、ドラは ' + H('1p') + '(9の次は1に もどる)。', '表示牌が ' + H('東') + ' なら ドラは ' + H('南') + '(東→南→西→北→東)。', '表示牌が ' + H('白') + ' なら ドラは ' + H('發') + '(白→發→中→白)。'] },
        { h: '赤ドラ と 裏ドラ', items: ['赤ドラ: 赤い5の牌。1枚で 1飜。(このゲームでは、設定で 使うか 選べます)', '裏ドラ: リーチして 上がったときだけ、ドラ表示牌の 下も めくれます。同じく 1枚 1飜。'] },
      ] },
      { id: 'han', t: '飜を 数えてみよう', lv: '中級', sum: '役の飜 + ドラ = 合計', n: 5, gens: [fromScore('何飜?')], pages: [
        { h: '合計の飜数 の 出しかた', items: ['役の飜数を 足して、ドラの数を 足します。', '例: リーチ(1)+ タンヤオ(1)+ ドラ1枚(1)= 3飜', '例: 混一色(3)+ 役牌(1)= 4飜(門前のとき)', '鳴いていたら、食い下がりの役は 1飜 減らします。'] },
        { h: '数えるときの コツ', items: ['①まず 役を 全部 探す', '②その飜数を 足す', '③最後に ドラを 足す(ドラ表示牌を 見る)', 'ここまでで「何飜か」が 分かれば、点数の半分は 分かったも同じです。'] },
      ] },
      { id: 'points', t: '飜から 点数へ(子だけ)', lv: '中級', sum: '満貫以上の表 + 親は1.5倍', n: 5, gens: [genMangan, genOya, genPt30], pages: [
        { h: '5飜以上は 点数が 決まっています', items: ['子の ロン上がりの 点数です。', '満貫(5飜)  8000点', '跳満(6〜7飜)  12000点', '倍満(8〜10飜)  16000点', '三倍満(11〜12飜)  24000点', '役満  32000点'] },
        { h: '親は 1.5倍', items: ['親が上がったら、子の 1.5倍です。', '満貫 12000点 / 跳満 18000点 / 倍満 24000点 / 三倍満 36000点 / 役満 48000点', '子の表を 覚えれば、親は かけ算だけです。'] },
        { h: '4飜までの 目安(30符)', items: ['よく出る 30符の、子・ロンの 点数です。', '1飜 1000点 / 2飜 2000点 / 3飜 3900点 / 4飜 7700点', '符が 分からないうちは、「30符」と 思って 数えると、だいたい 合います。'] },
      ] },
      { id: 'fu', t: '符を 数える(上級)', lv: '上級', sum: '説明を読んで、少しずつ', n: 5, gens: [fromScore('何符?')], pages: [
        { h: '符って なに?', items: ['符は、手の形で 決まる 細かい点数のもとです。', '基本の考え: 20符から はじめて、足していきます。', '最後に、10符の 単位に 切り上げます。(例: 32符 → 40符)'] },
        { h: '足す符', items: ['門前で ロン: +10符', 'ツモ: +2符(ピンフ以外)', '待ちが 嵌張・辺張・単騎: +2符', '雀頭が 役牌: +2符'] },
        { h: '刻子の 符', items: ['中張牌(2〜8)の 暗刻: 4符 / 明刻(ポン): 2符', '么九牌(1・9・字牌)の 暗刻: 8符 / 明刻: 4符', '槓子は、さらに 4倍です。'] },
        { h: '特別な 場合', items: ['七対子は 25符 で 固定。', 'ピンフのツモ上がりは 20符。', 'まずは「だいたい 30符」で 覚えて、慣れたら 数えましょう。'] },
      ] },
      { id: 'total', t: '点数を 計算してみよう', lv: '上級', sum: '飜と符から 点数を出す', n: 5, gens: [fromScore('点数はいくつ?', false)], pages: [
        { h: '総合問題', items: ['これまでの 総まとめです。', '手牌と 飜・符が 出るので、点数を 答えてみましょう。', '分からなくても 大丈夫。答えのあとに、計算の流れが 出ます。'] },
      ] },
    ],
  };
})(globalThis);
