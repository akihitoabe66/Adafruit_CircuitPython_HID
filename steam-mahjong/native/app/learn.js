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
  const pickY = (ids) => { // 苦手な役(まちがえた役)ほど、出やすくする
    const m = (MJ.Stats && MJ.Stats.load().miss) || {}, w = ids.map((k) => 1 + Math.min(4, m[k] || 0)); let r = Math.random() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < ids.length; i++) { r -= w[i]; if (r <= 0) return ids[i]; } return ids[ids.length - 1];
  };
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
    const wrong = shuf(Array.from(new Set(pool)).filter((x) => x !== correct)).slice(0, n - 1);
    return shuf([correct].concat(wrong));
  }
  /* この形は何の役? */
  const genYakuHand = (ids) => () => {
    const withHand = ids.filter((k) => Y[k].hand), k = pickY(withHand), y = Y[k];
    const pool = ids.length >= 4 ? ids : ids.concat(Object.keys(Y).filter((x) => !Y[x].yakuman && x !== 'riichi' && x !== 'tsumo' && !ids.includes(x)));
    const opts = pickOpts(k, pool, 4);
    return { cat: 'learn', tag: 'ly_hand', yid: k, kind: 'choice', title: 'この形は、何の役?', sit: '上がりの形(14枚)です。', prompt: 'この手に ついている<b>役</b>は どれですか?', hand: tl(y.hand),
      options: opts.map((o) => ({ id: o, html: Y[o].n })),
      grade(id) { return { r: id === k ? 'ok' : 'ng', html: '<p>正解は 「' + y.n + '」(' + hanText(y) + ')。</p><p>' + y.d + '</p>' }; } };
  };
  /* 説明を読んで、役の名前を答える */
  const genYakuDesc = (ids) => () => {
    const k = pickY(ids), y = Y[k];
    const opts = pickOpts(k, ids.length >= 4 ? ids : ids.concat(['tanyao', 'pinfu', 'yakuhai', 'toitoi', 'honitsu']), 4);
    return { cat: 'learn', tag: 'ly_desc', yid: k, kind: 'choice', title: 'この説明は、どの役?', sit: '', prompt: y.d.replace(/(役満|役の名前)/g, '$1'), hand: [],
      options: opts.map((o) => ({ id: o, html: Y[o].n })),
      grade(id) { return { r: id === k ? 'ok' : 'ng', html: '<p>正解は 「' + y.n + '」(' + hanText(y) + ')。</p>' + (y.hand ? '<p>こんな形です。</p>' : '') }; } };
  };
  /* この役は何飜? */
  const genYakuHan = (ids) => () => {
    const k = pickY(ids.filter((x) => !Y[x].yakuman)), y = Y[k];
    const opts = pickOpts(y.han, [1, 2, 3, 4, 6], 4).sort((a, b) => a - b);
    return { cat: 'learn', tag: 'ly_han', yid: k, kind: 'choice', title: '「' + y.n + '」は、何飜?', sit: '', prompt: '鳴かずに(門前で)作ったときの<b>飜数</b>は?', hand: y.hand ? tl(y.hand) : [],
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
    return { cat: 'learn', tag: 'dora', kind: 'choice', title: 'ドラは、どれ?', sit: 'ドラ表示牌(めくった牌)は ' + mk(ind) + ' です。', prompt: '<b>ドラ</b>になる牌は どれですか?(ドラは 表示牌の「次の牌」)', hand: [],
      options: opts.map((t) => ({ id: String(t), html: mk(t) })),
      grade(id) { return { r: +id === dora ? 'ok' : 'ng', html: '<p>正解は ' + mk(dora) + ' (' + name(dora) + ')。表示牌 ' + mk(ind) + ' の「次の牌」がドラです。</p><p>9の次は1、東→南→西→北→東、白→發→中→白 の順です。</p>' }; } };
  };
  /* 子の満貫・跳満…の点数 */
  const LV = [{ n: '満貫', h: '5飜', ko: 8000 }, { n: '跳満', h: '6〜7飜', ko: 12000 }, { n: '倍満', h: '8〜10飜', ko: 16000 }, { n: '三倍満', h: '11〜12飜', ko: 24000 }, { n: '役満', h: '13飜以上(または役満の役)', ko: 32000 }];
  const man = (x) => x.toLocaleString ? String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '点' : x + '点';
  const genMangan = () => {
    const L = pick(LV), byHan = Math.random() < 0.5;
    const opts = shuf(LV.map((x) => x.ko));
    return { cat: 'learn', tag: 'tbl', kind: 'choice', title: '子の点数(ロン)は?', sit: '', prompt: byHan ? '<b>子</b>が <b>' + L.h + '</b> の手を ロンで上がったときの点数は?' : '<b>子</b>が <b>' + L.n + '</b> を ロンで上がったときの点数は?', hand: [],
      options: opts.map((o) => ({ id: String(o), html: man(o) })),
      grade(id) { return { r: +id === L.ko ? 'ok' : 'ng', html: '<p>正解は <b>' + man(L.ko) + '</b>。</p><p>' + LV.map((x) => x.n + ' ' + x.ko).join(' / ') + '</p>' }; } };
  };
  const genOya = () => {
    const L = pick(LV), ans = L.ko * 1.5;
    const opts = shuf([ans, L.ko * 2, L.ko, L.ko * 1.25]);
    return { cat: 'learn', tag: 'tbl', kind: 'choice', title: '親の点数(ロン)は?', sit: '子の' + L.n + 'は ' + man(L.ko) + ' です。', prompt: '<b>親</b>が同じ ' + L.n + ' を ロンで上がると? (親は 子の<b>1.5倍</b>)', hand: [],
      options: opts.map((o) => ({ id: String(o), html: man(o) })),
      grade(id) { return { r: +id === ans ? 'ok' : 'ng', html: '<p>正解は <b>' + man(ans) + '</b>。' + man(L.ko) + ' × 1.5 = ' + man(ans) + ' です。</p>' }; } };
  };
  const PT30 = { 1: 1000, 2: 2000, 3: 3900, 4: 7700 };
  const genPt30 = () => {
    const h = 1 + rnd(4), ans = PT30[h], opts = shuf(Object.values(PT30));
    return { cat: 'learn', tag: 'tbl', kind: 'choice', title: '30符の目安(子・ロン)', sit: '', prompt: '<b>30符</b>の子が <b>' + h + '飜</b> で ロン上がり。点数は?', hand: [],
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
    return { cat: 'learn', tag: 'concept', kind: 'choice', title: 'ちょっと確認', sit: '', prompt: q[0], hand: [], options: opts.map((o) => ({ id: o, html: o })),
      grade(id) { return { r: id === a2 ? 'ok' : 'ng', html: '<p>正解は 「' + a2 + '」。</p><p>' + q[3] + '</p>' }; } };
  });
  const genFixed = () => pick(FIXED)();

  /* Edge版の点数問題から、ほしい種類だけ取り出す */
  const fromScore = (titleKey, kodomoOnly) => () => {
    for (let i = 0; i < 40; i++) { const p = MJ.Drill.genScore(); if (p && p.title === titleKey && (!kodomoOnly || /子の/.test(p.prompt || ''))) return p; }
    return null;
  };


  /* ---------- 役を、足す(一発・海底・チャンタ系など) ---------- */
  Object.assign(Y, {
    ippatsu: { n: '一発', han: 1, d: 'リーチをかけたあと、1巡(自分がもう一度 牌を切るまで)のうちに上がる役。ほかの人が鳴くと、なくなる。', note: 'リーチしたときだけ' },
    haitei: { n: '海底摸月(ハイテイ)', han: 1, d: '山の いちばん最後の牌を ツモって 上がる役。', note: 'ツモ上がりのとき' },
    houtei: { n: '河底撈魚(ホーテイ)', han: 1, d: '山の いちばん最後の牌を 切った人から、ロンで 上がる役。', note: 'ロン上がりのとき' },
    rinshan: { n: '嶺上開花(リンシャン)', han: 1, d: 'カンをしたあとに 引く牌で ツモ上がりする役。', note: 'カンのあとの ツモ' },
    chankan: { n: '槍槓(チャンカン)', han: 1, d: 'ほかの人が「加カン」をしたとき、その牌で ロンする役。', note: 'ロン上がりのとき' },
    dabururiichi: { n: 'ダブルリーチ', han: 2, d: '配牌のあと、いちばん最初の捨て牌で リーチをかける役。そのときまで、だれも鳴いていないこと。', note: '門前のみ' },
    honroutou: { n: '混老頭(ホンロウトウ)', han: 2, kui: 2, d: '1・9の数牌と、字牌だけで作る。刻子か対子ばかりに なる。', hand: '111m 999m 111p 999p 東東' },
    sanshokudoukou: { n: '三色同刻', han: 2, kui: 2, d: '萬子・筒子・索子で、同じ数字の刻子(同じ牌3枚)をそろえる。', hand: '555m 555p 555s 234m 77p' },
    junchan: { n: '純チャン(純全帯么九)', han: 3, kui: 2, d: 'すべての面子と雀頭に、1か9の数牌が入っている。字牌は使わない。チャンタより 1飜 高い。', hand: '123m 789m 123p 999s 11p' },
    ryanpeiko: { n: '二盃口(リャンペーコー)', han: 3, d: 'イーペーコー(同じ順子2組)を 2セット作る。門前のみ。', hand: '112233m 556677p 99s', note: '門前のみ' },
  });
  Object.assign(R.dict, { 一発: 'いっぱつ', 海底摸月: 'はいていまおゆえ', 河底撈魚: 'ほーていらおゆい', 嶺上開花: 'りんしゃんかいほう', 槍槓: 'ちゃんかん', 混老頭: 'ほんろうとう', 三色同刻: 'さんしょくどうこう', 純全帯么九: 'じゅんちゃんたいやおちゅう', 二盃口: 'りゃんぺーこー', 供託: 'きょうたく', 本場: 'ほんば', 連荘: 'れんちゃん', 加槓: 'かかん', 副底: 'ふてい' });

  /* ---------- クイズを作る道具 ---------- */
  const fromList = (list, tag, title) => list.map((q) => () => {
    const ans = q[1][q[2]], opts = shuf(q[1].slice());
    return { cat: 'learn', tag: tag || 'concept', kind: 'choice', title: title || 'ちょっと確認', sit: '', prompt: q[0], hand: [], options: opts.map((o) => ({ id: o, html: o })),
      grade(id) { return { r: id === ans ? 'ok' : 'ng', html: '<p>正解は 「' + ans + '」。</p><p>' + q[3] + '</p>' }; } };
  });
  const oneOf = (list, tag, title) => () => pick(fromList(list, tag, title))();
  const TERMS = [
    ['「' + H('555m') + '」のように、同じ牌3枚の かたまりは?', ['刻子(こうつ)', '順子(しゅんつ)', '雀頭(じゃんとう)', '待ち'], 0, '同じ牌3枚が「刻子」。数字が3つ続くのは「順子」です。'],
    ['「' + H('456p') + '」のように、数字が3つ続く かたまりは?', ['順子(しゅんつ)', '刻子(こうつ)', '雀頭(じゃんとう)', '対子(ついつ)'], 0, '連番3枚が「順子」。順子と刻子を合わせて「面子(めんつ)」と 言います。'],
    ['「' + H('東東') + '」のように、同じ牌2枚の ペアは?', ['対子・雀頭', '順子', '刻子', '面子'], 0, '同じ牌2枚は「対子(ついつ)」。上がりの形で 1組だけ入る対子を「雀頭(じゃんとう)」と言います。'],
    ['上がりの形(14枚)は、どれ?', ['4つの面子 + 1つの雀頭', '5つの面子', '3つの面子 + 2つの雀頭', '7つの雀頭だけ'], 0, '「4つの面子 + 1つの雀頭」が基本の形です。(7つの対子の「七対子」だけは 例外)'],
    ['ポンやチーを しないで 作った手を 何という?', ['門前(めんぜん)', '鳴き', '副露', '親'], 0, '鳴かない手が「門前」。鳴くと、門前ではなくなります。'],
    ['ポン・チーを することを、何という?', ['鳴く', 'ツモる', 'ロンする', '切る'], 0, 'ポン・チー・カン(明カン)を「鳴く」と言います。鳴くと 使えない役や、飜が減る役が あります。'],
    ['あと1枚で 上がれる状態は?', ['テンパイ', 'ノーテン', 'フリテン', 'ドラ'], 0, 'あと1枚で上がれる状態が「テンパイ」です。'],
    ['「' + H('45m') + '」で 3萬か 6萬を待つ形は?', ['両面(りょうめん)', '嵌張(かんちゃん)', '辺張(ぺんちゃん)', '単騎(たんき)'], 0, '両面は、いちばん上がりやすい待ち。符は つきません。'],
    ['「' + H('46m') + '」で 5萬を待つ形は?', ['嵌張(かんちゃん)', '両面(りょうめん)', '辺張(ぺんちゃん)', '単騎(たんき)'], 0, '真ん中の1枚を待つ形が「嵌張」。待ちが1種類なので、2符が つきます。'],
    ['「' + H('12m') + '」で 3萬を待つ形は?', ['辺張(ぺんちゃん)', '両面(りょうめん)', '嵌張(かんちゃん)', '単騎(たんき)'], 0, '1・2 や 8・9 のはしを待つ形が「辺張」。2符が つきます。'],
    ['自分で 引いた牌で 上がることは?', ['ツモ', 'ロン', 'ポン', 'チー'], 0, '自分で引いて上がるのが「ツモ」。ほかの人の捨て牌で上がるのが「ロン」です。'],
    ['ほかの人が 捨てた牌で 上がることは?', ['ロン', 'ツモ', 'ポン', 'リーチ'], 0, '人の捨て牌で上がるのが「ロン」です。'],
  ];
  const PAYQ = [
    ['ロン上がりのとき、点数を払うのは?', ['捨てた人 1人', 'ほかの3人 みんな', '親 だけ', '払う人は いない'], 0, 'ロンは、牌を捨てた人 1人が、全部 払います。'],
    ['ツモ上がりのとき、点数を払うのは?', ['ほかの3人 みんなで', '1位の人', '親 だけ', '払う人は いない'], 0, 'ツモは、ほかの3人が わけて払います。'],
    ['親と子、上がったとき 点数が 高いのは?', ['親(子の 1.5倍)', '子', '同じ', '順位で 決まる'], 0, '親は、子の 1.5倍の 点数に なります。'],
    ['点数は、いくつごとに 切り上げる?', ['100点', '10点', '500点', '1000点'], 0, '点数は、100点の 単位に 切り上げます。(例: 1920点 → 2000点)'],
    ['親は、局ごとに 何人?', ['1人', '2人', '3人', '4人'], 0, '親は 1人だけ。ほかの3人が「子」です。'],
  ];
  const FUQ = [
    ['ふつうの符の 数え方は、何符から はじめる?', ['20符', '10符', '30符', '0符'], 0, '「副底(ふてい)」20符から はじめて、足していきます。'],
    ['門前(鳴かない手)で ロン上がり。足す符は?', ['10符', '2符', '4符', '足さない'], 0, '門前ロンは +10符(門前加符)です。'],
    ['ツモ上がり。足す符は?', ['2符', '10符', '4符', '足さない'], 0, 'ツモは +2符。ただし、ピンフのツモは 足しません(20符)。'],
    ['符の合計が 32符。何符として 数える?', ['40符', '30符', '35符', '32符'], 0, '符は 10符の単位に 切り上げます。32符 → 40符。'],
    ['七対子の 符は?', ['25符(固定)', '20符', '30符', '40符'], 0, '七対子は 25符で 固定です。(2飜 25符 = 子のロン 1600点)'],
    ['ピンフを ツモ上がり。符は?', ['20符', '30符', '22符', '25符'], 0, 'ピンフ+ツモは 20符。ピンフの ロンは 30符です。'],
    ['待ちが 嵌張・辺張・単騎。足す符は?', ['2符', '10符', '4符', '足さない'], 0, '待ちが 1種類しかない形は +2符。両面は 足しません。'],
    ['中張牌(2〜8)の 暗刻(鳴かない刻子)は?', ['4符', '2符', '8符', '16符'], 0, '中張牌の暗刻 4符 / 明刻(ポン) 2符。1・9・字牌は その2倍(暗刻8 / 明刻4)です。'],
    ['1・9・字牌の 暗刻(鳴かない刻子)は?', ['8符', '4符', '2符', '16符'], 0, '么九牌(1・9・字牌)の暗刻は 8符、明刻(ポン)は 4符です。'],
    ['役牌(白發中・場風・自風)の 雀頭は?', ['2符', '4符', '10符', '足さない'], 0, '役牌の雀頭は +2符。(場風と自風が同じ牌なら 4符)'],
  ];
  const genTerms = oneOf(TERMS, 'concept'), genPay = oneOf(PAYQ, 'concept'), genFuBasic = oneOf(FUQ, 'fu', '符の きほん');

  /* ドラを数える: 手牌の中の ドラは 何枚? */
  const genDoraCount = () => {
    const nxt = (t) => (t < 27 ? (t % 9 === 8 ? t - 8 : t + 1) : t < 31 ? (t === 30 ? 27 : t + 1) : (t === 33 ? 31 : t + 1));
    const ind = rnd(27), dora = nxt(ind), k = rnd(4), hand = []; for (let i = 0; i < k; i++) hand.push(dora);
    while (hand.length < 13) { const t = rnd(34); if (t === dora || hand.filter((x) => x === t).length >= 3) continue; hand.push(t); }
    const hs = shuf(hand).sort((a, b) => a - b).map((t) => mk(t)).join('');
    const opts = shuf([0, 1, 2, 3]);
    return { cat: 'learn', tag: 'dora', kind: 'choice', title: '手牌の ドラは 何枚?', sit: 'ドラ表示牌は ' + mk(ind) + '(ドラは ' + mk(dora) + ')。', prompt: '手牌は ' + hs + ' です。<b>ドラは 何枚</b>ありますか?(1枚が 1飜)', hand: [],
      options: opts.map((o) => ({ id: String(o), html: o + '枚' })),
      grade(id) { return { r: +id === k ? 'ok' : 'ng', html: '<p>正解は <b>' + k + '枚</b>(' + k + '飜)。</p><p>ドラは ' + mk(dora) + ' です。手牌の中の ' + mk(dora) + ' を 数えます。</p>' }; } };
  };
  /* 役の飜を足して、ドラも足す */
  const HANSET = [['riichi', 1, 'リーチ'], ['tsumo', 1, 'ツモ'], ['tanyao', 1, 'タンヤオ'], ['pinfu', 1, 'ピンフ'], ['yakuhai', 1, '役牌'], ['ipeiko', 1, 'イーペーコー'], ['sanshoku', 2, '三色同順'], ['ittsu', 2, '一気通貫'], ['toitoi', 2, '対々和'], ['honitsu', 3, '混一色']];
  const genHanSum = () => {
    const n = 2 + rnd(2), ys = shuf(HANSET).slice(0, n), d = rnd(4), tot = ys.reduce((a, x) => a + x[1], 0) + d;
    const opts = shuf([tot, tot + 1, Math.max(1, tot - 1), tot + 2].filter((v, i, a) => a.indexOf(v) === i)).slice(0, 4); while (opts.length < 4) opts.push(opts[opts.length - 1] + 1);
    const label = ys.map((x) => x[2] + '(' + x[1] + '飜)').join(' + ') + (d ? ' + ドラ' + d + '枚(' + d + '飜)' : '');
    return { cat: 'learn', tag: 'han', kind: 'choice', title: '合計で 何飜?', sit: '', prompt: '(門前の手) <b>' + ys.map((x) => x[2]).join('・') + '</b>' + (d ? ' と ドラ ' + d + '枚' : '') + '。<b>合計 何飜</b>ですか?', hand: [],
      options: Array.from(new Set(opts)).slice(0, 4).sort((a, b) => a - b).map((o) => ({ id: String(o), html: o + '飜' })),
      grade(id) { return { r: +id === tot ? 'ok' : 'ng', html: '<p>正解は <b>' + tot + '飜</b>。</p><p>' + label + ' = ' + tot + '飜</p>' }; } };
  };
  /* ○飜は、満貫? 跳満? */
  const LIMITS = [[5, 5, '満貫'], [6, 7, '跳満'], [8, 10, '倍満'], [11, 12, '三倍満'], [13, 13, '役満']];
  const genLimitHan = () => {
    const L = pick(LIMITS), h = L[0] + rnd(L[1] - L[0] + 1), names = LIMITS.map((x) => x[2]);
    return { cat: 'learn', tag: 'tbl', kind: 'choice', title: 'この飜数は、何?', sit: '', prompt: '<b>' + h + '飜</b>の手は、何と 呼ぶ?', hand: [],
      options: shuf([L[2]].concat(shuf(names.filter((x) => x !== L[2])).slice(0, 3))).map((o) => ({ id: o, html: o })),
      grade(id) { return { r: id === L[2] ? 'ok' : 'ng', html: '<p>正解は <b>' + L[2] + '</b>。</p><p>満貫 5飜 / 跳満 6〜7飜 / 倍満 8〜10飜 / 三倍満 11〜12飜 / 役満 13飜〜</p>' }; } };
  };
  /* 点数表の問題: 子・親 × ロン・ツモ */
  const fmtN = (x) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fmtPay = (t, who, way) => (who === 'ko' ? (way === 'ron' ? fmtN(t.childRon) + '点' : fmtN(t.childTsumo[0]) + '・' + fmtN(t.childTsumo[1]) + '点') : (way === 'ron' ? fmtN(t.dealerRon) + '点' : fmtN(t.dealerTsumo) + '点オール'));
  const genTbl = (o) => () => {
    const who = o.who === 'both' ? pick(['ko', 'oya']) : o.who, way = o.way === 'both' ? pick(['ron', 'tsumo']) : o.way, fu = pick(o.fus), han = pick(o.hans);
    const t = MJ.scoreTable(fu, han), ans = fmtPay(t, who, way), pool = [];
    o.fus.forEach((f) => o.hans.forEach((h) => { const a = fmtPay(MJ.scoreTable(f, h), who, way); if (a !== ans && !pool.includes(a)) pool.push(a); }));
    const opts = shuf([ans].concat(shuf(pool).slice(0, 3)));
    const big = han >= 5 || (fu >= 40 && han >= 4) || (fu >= 70 && han >= 3), b = MJ.basicPoints(han, fu);
    const wh = (who === 'ko' ? '子' : '親') + 'の ' + (way === 'ron' ? 'ロン' : 'ツモ');
    const how = big ? '満貫(基本点 2000)です。' : '基本点 = ' + fu + ' × 2<sup>(' + han + '+2)</sup> = ' + fu + ' × ' + Math.pow(2, han + 2) + ' = ' + fmtN(fu * Math.pow(2, han + 2)) + '(100点単位に切り上げて ' + fmtN(b) + ')。';
    const how2 = who === 'ko' ? (way === 'ron' ? '子のロン: 基本点 × 4 → ' : '子のツモ: 親が 基本点 × 2、子が 基本点 × 1 → ') : (way === 'ron' ? '親のロン: 基本点 × 6 → ' : '親のツモ: 子3人が 基本点 × 2 ずつ → ');
    return { cat: 'learn', tag: 'tbl', kind: 'choice', title: wh + 'の 点数は?', sit: '', prompt: '<b>' + wh + '</b>。' + (han >= 5 ? '<b>' + han + '飜</b>' : '<b>' + fu + '符 ' + han + '飜</b>') + '。点数は?' + (way === 'tsumo' && who === 'ko' ? '(「子・親」の順に 払う点数)' : ''), hand: [],
      options: opts.map((x) => ({ id: x, html: x })),
      grade(id) { return { r: id === ans ? 'ok' : 'ng', html: '<p>正解は <b>' + ans + '</b>。</p><p>' + how + '</p><p>' + how2 + ans + '</p>' }; } };
  };
  /* 符の足し算 */
  const genFuSum = () => {
    const menzen = Math.random() < 0.6, tsumo = Math.random() < 0.5, parts = [['副底', 20]], lines = [];
    lines.push('・' + (menzen ? '鳴かない手(門前)' : '鳴いた手') + 'で ' + (tsumo ? 'ツモ' : 'ロン') + ' 上がり');
    if (menzen && !tsumo) parts.push(['門前ロン', 10]);
    if (tsumo) parts.push(['ツモ', 2]);
    const cand = [['中張牌の暗刻 1組', 4, menzen || Math.random() < 0.5], ['1・9・字牌の暗刻 1組', 8, true], ['中張牌の明刻(ポン) 1組', 2, !menzen], ['1・9・字牌の明刻(ポン) 1組', 4, !menzen]].filter((x) => x[2]);
    const chosen = shuf(cand).slice(0, 1 + rnd(2)); chosen.forEach((c) => { lines.push('・' + c[0]); parts.push([c[0], c[1]]); });
    if (Math.random() < 0.4) { lines.push('・雀頭は 役牌'); parts.push(['役牌の雀頭', 2]); }
    const w = pick([['両面待ち', 0], ['嵌張待ち', 2], ['辺張待ち', 2], ['単騎待ち', 2]]); lines.push('・' + w[0]); if (w[1]) parts.push([w[0], w[1]]);
    let raw = parts.reduce((a, x) => a + x[1], 0), ans = Math.ceil(raw / 10) * 10; if (!menzen && ans === 20) ans = 30;
    const opts = Array.from(new Set([ans, ans + 10, Math.max(20, ans - 10), ans + 20, raw])).filter((v) => v >= 20).slice(0, 4); while (opts.length < 4) opts.push(opts[opts.length - 1] + 10);
    const sum = parts.map((x) => x[1]).join(' + ') + ' = ' + raw;
    return { cat: 'learn', tag: 'fu', kind: 'choice', title: '符を 数えよう', sit: '', prompt: '次の手は、<b>何符</b>?(七対子・ピンフ以外)<br>' + lines.join('<br>'), hand: [],
      options: shuf(Array.from(new Set(opts))).slice(0, 4).map((o) => ({ id: String(o), html: o + '符' })),
      grade(id) { return { r: +id === ans ? 'ok' : 'ng', html: '<p>正解は <b>' + ans + '符</b>。</p><p>' + parts.map((x) => x[0] + ' ' + x[1]).join(' / ') + '</p><p>' + sum + (raw !== ans ? ' → 10符単位に切り上げて ' + ans + '符' : '') + '</p>' }; } };
  };
  /* 本場: ロンは +300 / 本場 */
  const genHonba = () => {
    const fu = pick([30, 40]), han = 1 + rnd(3), hb = 1 + rnd(3), t = MJ.scoreTable(fu, han), ron = Math.random() < 0.5;
    const ans = ron ? t.childRon + 300 * hb : t.childTsumo[0] + 100 * hb, ans2 = ron ? null : t.childTsumo[1] + 100 * hb;
    const txt = ron ? fmtN(ans) + '点' : fmtN(ans) + '・' + fmtN(ans2) + '点';
    const pool = ron ? [t.childRon + 300 * (hb + 1), t.childRon + 100 * hb, t.childRon, t.childRon + 300 * hb + 300].map((x) => fmtN(x) + '点') : [fmtN(t.childTsumo[0] + 300 * hb) + '・' + fmtN(t.childTsumo[1] + 300 * hb) + '点', fmtN(t.childTsumo[0]) + '・' + fmtN(t.childTsumo[1]) + '点', fmtN(t.childTsumo[0] + 100 * (hb + 1)) + '・' + fmtN(t.childTsumo[1] + 100 * (hb + 1)) + '点'];
    const opts = shuf([txt].concat(shuf(Array.from(new Set(pool)).filter((x) => x !== txt)).slice(0, 3)));
    return { cat: 'learn', tag: 'tbl', kind: 'choice', title: '本場の 点数は?', sit: '', prompt: '<b>子の ' + (ron ? 'ロン' : 'ツモ') + '</b>。' + fu + '符 ' + han + '飜 で、<b>' + hb + '本場</b>。点数は?' + (ron ? '' : '(「子・親」の順)'), hand: [],
      options: opts.map((x) => ({ id: x, html: x })),
      grade(id) { return { r: id === txt ? 'ok' : 'ng', html: '<p>正解は <b>' + txt + '</b>。</p><p>もとの点数 ' + (ron ? fmtN(t.childRon) + '点' : fmtN(t.childTsumo[0]) + '・' + fmtN(t.childTsumo[1]) + '点') + ' に、ロンは 1本場ごとに +300点。ツモは 1人 +100点ずつ(合計 +300点)。</p>' }; } };
  };
  /* 鳴くと どうなる役? */
  const KUIS = ['riichi', 'tsumo', 'pinfu', 'ipeiko', 'tanyao', 'yakuhai', 'sanshoku', 'ittsu', 'toitoi', 'chiitoi', 'chanta', 'sanankou', 'shosangen', 'honitsu', 'chinitsu', 'junchan', 'ryanpeiko', 'honroutou'];
  const kuiOf = (y) => (y.note === '門前のみ' ? 'ならない' : y.kui && y.kui < y.han ? y.kui + '飜' : '同じ');
  const genKui = () => {
    const k = pick(KUIS), y = Y[k], a = kuiOf(y), lab = (v) => (v === 'ならない' ? '鳴くと 役に ならない' : v === '同じ' ? '鳴いても 同じ飜数' : '鳴くと ' + v + 'に へる');
    const opts = shuf(['ならない', '同じ', y.han > 1 ? (y.han - 1) + '飜' : '1飜', y.han > 2 ? (y.han - 2) + '飜' : '2飜'].filter((v, i, ar) => ar.indexOf(v) === i)).slice(0, 4);
    if (!opts.includes(a)) opts[0] = a; while (opts.length < 4) opts.push((opts.length + 1) + '飜');
    return { cat: 'learn', tag: 'ly_han', yid: k, kind: 'choice', title: '鳴くと どうなる?', sit: '', prompt: '「<b>' + y.n + '</b>」は 門前で ' + (y.yakuman ? '役満' : y.han + '飜') + '。ポンやチーで 鳴くと?', hand: y.hand ? tl(y.hand) : [],
      options: Array.from(new Set(opts)).slice(0, 4).map((o) => ({ id: o, html: lab(o) })),
      grade(id) { return { r: id === a ? 'ok' : 'ng', html: '<p>正解は 「' + lab(a) + '」。</p>' + (a === 'ならない' ? '<p>この役は 門前(鳴かない手)だけの役です。</p>' : a === '同じ' ? '<p>鳴いても 飜数は 変わりません。</p>' : '<p>鳴くと 1飜 へります(食い下がり)。</p>') }; } };
  };
  const genKaWari = () => pick([genKui, genYakuHan(ALLY)])();

  /* ---------- 読み物(ページ)と、クイズ ---------- */
  const E1A = ['riichi', 'tsumo', 'pinfu'], E1B = ['tanyao', 'yakuhai', 'ipeiko'], E1C = ['ippatsu', 'haitei', 'houtei', 'rinshan', 'chankan', 'dabururiichi'];
  const E2A = ['chiitoi', 'toitoi', 'sanankou', 'sanshoku', 'ittsu'], E2B = ['chanta', 'honroutou', 'sanshokudoukou', 'shosangen'], E3 = ['honitsu', 'junchan', 'ryanpeiko', 'chinitsu'];
  const E1 = E1A.concat(E1B), E2 = E2A.concat(E2B, E3), EY = ['daisangen', 'suuankou', 'kokushi', 'tsuuiisou', 'ryuuiisou'];
  const ALLY = E1.concat(E1C, E2);
  const yp = (k, extra) => ({ h: Y[k].n + '  ' + hanText(Y[k]), items: [Y[k].d + (extra ? '\n' + extra : ''), Y[k].hand ? { hand: Y[k].hand } : ''] });
  const genY = (ids) => [genYakuDesc(ids), genYakuHan(ids)].concat(ids.filter((k) => Y[k].hand).length >= 2 ? [genYakuHand(ids)] : []);

  MJ.Learn = {
    Y, H, tiles,
    TAGGEN: { ly_hand: [genYakuHand(ALLY)], ly_desc: [genYakuDesc(ALLY)], ly_han: [genYakuHan(ALLY), genKui], dora: [genDora, genDoraCount], tbl: [genMangan, genOya, genPt30, genLimitHan, genTbl({ fus: [30, 40], hans: [1, 2, 3, 4], who: 'both', way: 'both' }), genHonba], concept: [genFixed, genTerms, genPay], han: [fromScore('何飜?'), genHanSum], fu: [fromScore('何符?'), genFuSum, genFuBasic], pts: [fromScore('点数はいくつ?', false)] },
    GOAL: 'ゴール: 自分の手の 点数を、自分で 数えられるように なる(先のページも、自由に 読めます)',
    STEPS: [
      /* ===== 入門: 全体のしくみ・言葉 ===== */
      { id: 'flow', t: '点数が決まる しくみ', lv: '入門', sum: '飜(はん)だけ、まず覚える', n: 3, gens: [genFixed], pages: [
        { h: '点数は 何で 決まる?', items: ['麻雀の点数は「飜(はん)」と「符(ふ)」で決まります。', '「飜」は、役と ドラの 数です。', '「符」は、手の形で 決まる 細かい数です。', '最初は、飜だけ 覚えれば 大丈夫です。符は あとから 覚えましょう。'] },
        { h: '数える順番', items: ['①役を見つけて 飜数を 数える(+ ドラ)', '②飜数から、点数表で 点数を 調べる', 'たったこれだけです。', '符は、慣れてから「もっと正確に」と思ったときに 覚えましょう。'] },
        { h: '親は 子の 1.5倍', items: ['親が上がると、子の 1.5倍の 点数に なります。', '例: 子の満貫が 8000点なら、親の満貫は 12000点。', 'だから、覚えるのは「子の点数」だけで 大丈夫です。', '親のときは、1.5倍するだけ。'] },
        { h: 'この勉強の 進めかた', items: ['①読む → ②クイズ → ③もう一度クイズ の くりかえしです。', '順番は「役 → 飜 → 子の点数 → 親・ツモ → 符」です。', '先のページも 自由に 読めます。分からなくなったら、前に もどってOK。', 'クイズの答えの 説明も、ヒントに なります。'] },
      ] },
      { id: 'shape', t: '手の形と 言葉', lv: '入門', sum: '面子・雀頭・門前・鳴き・待ち', n: 5, gens: [genTerms], pages: [
        { h: '上がりの形', items: ['上がりの形は、14枚です。', '「4つの面子」+「1つの雀頭」で できています。', { hand: '123m 456p 789s 東東東 白白' }, '(例: 順子3つ + 刻子1つ + 雀頭)'] },
        { h: '面子と 雀頭', items: ['順子: 数字が 3つ続く(例 ' + H('456p') + ')', '刻子: 同じ牌 3枚(例 ' + H('東東東') + ')', '面子 = 順子と 刻子の こと。', '雀頭: 同じ牌 2枚の ペア(例 ' + H('白白') + ')。1つだけ。'] },
        { h: '門前と 鳴き', items: ['門前(めんぜん): ポン・チーを しない手。', '鳴く: 人の捨て牌を もらって、ポン・チーをすること。', '鳴くと、使えない役や、飜が 減る役が あります。', '(暗カンは、鳴いても 門前のままです)'] },
        { h: '待ちの 形', items: ['あと1枚で上がれる状態を「テンパイ」と 言います。', '両面: ' + H('45m') + ' → 3・6萬 が待ち(いちばん 上がりやすい)', '嵌張: ' + H('46m') + ' → 5萬 / 辺張: ' + H('12m') + ' → 3萬', '単騎: 1枚だけ待つ(雀頭の待ち) / 双碰: 2つの対子の どちらか'] },
        { h: 'ロンと ツモ', items: ['ロン: ほかの人が 捨てた牌で 上がる。', 'ツモ: 自分で 引いた牌で 上がる。', 'ロンは、捨てた人 1人が 払います。', 'ツモは、ほかの3人が わけて 払います。'] },
      ] },
      { id: 'payer', t: '親と子・払いかた', lv: '入門', sum: '親は1人・100点単位', n: 4, gens: [genPay], pages: [
        { h: '親と 子', items: ['局ごとに、親は 1人。(東家の人)', 'ほかの3人は「子」です。', '親が 上がると、点数が 子の 1.5倍に なります。', '親が上がると 続けて 親(連荘)に なれます。'] },
        { h: '払いかた', items: ['ロン: 捨てた人が 全部 払う。', 'ツモ: ほかの3人が わけて 払う。', '点数は、100点単位に 切り上げます。', '(例: 計算で 1920点 → 2000点)'] },
      ] },
      /* ===== 役を 覚える ===== */
      { id: 'yaku1a', t: '1飜の役 ① 基本', lv: '初級', sum: 'リーチ・ツモ・ピンフ', n: 4, gens: genY(E1A.concat(['tanyao'])), pages: [
        { h: '役が ないと 上がれません', items: ['麻雀は、役が1つ以上ないと 上がれません。', 'まずは、いちばん やさしい 1飜の役から 覚えましょう。', 'リーチ・ツモ・ピンフ・タンヤオ・役牌・イーペーコー の6つが 基本です。'] },
        { h: Y.riichi.n + '  ' + hanText(Y.riichi), items: [Y.riichi.d, 'リーチするときは、1000点を 場に出します(供託)。', 'リーチしたあとは、手牌を 変えられません。'] },
        { h: Y.tsumo.n + '  ' + hanText(Y.tsumo), items: [Y.tsumo.d, '自分で引いて上がるだけで つく、いちばん かんたんな役です。'] },
        yp('pinfu', '条件: 順子だけ・雀頭が 役牌でない・両面待ち・門前。'),
      ] },
      { id: 'yaku1b', t: '1飜の役 ② 基本', lv: '初級', sum: 'タンヤオ・役牌・イーペーコー', n: 4, gens: genY(E1B), pages: [
        yp('tanyao', 'いちばん 作りやすい役です。1・9・字牌を 捨てていけば できます。'),
        yp('yakuhai', '白・發・中が 2枚あれば、出たとき ポンして 役にできます。'),
        { h: '場風と 自風', items: ['東・南・西・北も 役牌になる ことが あります。', '場風: 今の局の風(東場なら 東)。自風: 自分の席の風(親が東)。', '場風か 自風の牌の 刻子が 1飜。', '場風と自風が 同じ牌(例: 東場の 親の東)なら 2飜に なります(ダブ東)。'] },
        yp('ipeiko', '同じ順子が 2組。鳴くと 役に なりません。'),
      ] },
      { id: 'yaku1c', t: '1飜の役 ③ 偶然系', lv: '初級', sum: '一発・海底・嶺上など', n: 4, gens: genY(E1C), pages: [
        { h: '運しだいで つく役', items: ['上がった ときの 状況で ついてくる 役です。', '狙って つくることは 少ないので、「あったら ラッキー」くらいで 覚えましょう。'] },
        { h: Y.ippatsu.n + '  ' + hanText(Y.ippatsu), items: [Y.ippatsu.d, 'リーチしたあと 1巡以内に 上がれれば つきます。'] },
        { h: '最後の牌の 役', items: [Y.haitei.n + ': ' + Y.haitei.d, Y.houtei.n + ': ' + Y.houtei.d, '山の最後の 牌が かかわる 役です。(どちらも 1飜)'] },
        { h: 'カンに かかわる 役', items: [Y.rinshan.n + ': ' + Y.rinshan.d, Y.chankan.n + ': ' + Y.chankan.d, 'どちらも 1飜。めったに 出ません。'] },
        { h: Y.dabururiichi.n + '  ' + hanText(Y.dabururiichi), items: [Y.dabururiichi.d, '最初の1巡で テンパイしていたら 狙えます。'] },
      ] },
      { id: 'yaku2a', t: '2飜の役 ①', lv: '初級', sum: '七対子・対々和・三色・一気通貫', n: 5, gens: genY(E2A), pages: [
        { h: '2飜の役 とは', items: ['1飜の役より 1つ 作るのが 大変ですが、点数が 倍に なります。', '鳴くと 1飜 へる役が 多いので、「門前のとき」の飜数で 覚えましょう。'] },
        yp('chiitoi', '7組の対子。同じ牌 4枚で 2組には できません。'), yp('toitoi', 'ポンを 3回して 作ることも できます。'), yp('sanankou', '暗刻 = 鳴かない刻子。'),
        yp('sanshoku'), yp('ittsu'),
      ] },
      { id: 'yaku2b', t: '2飜の役 ②', lv: '初級', sum: 'チャンタ・混老頭・三色同刻・小三元', n: 5, gens: genY(E2B), pages: [
        yp('chanta', '字牌が 入ってもOK。入らない(数牌だけ)のは「純チャン」(3飜)。'), yp('honroutou', '対々和と いっしょに つきます(合わせて 4飜)。'),
        yp('sanshokudoukou', '三色同順(順子)と まちがえないように。'), yp('shosangen', '白・發・中 の 3つのうち、2つが 刻子・1つが 雀頭。'),
      ] },
      { id: 'yaku3', t: '3飜以上の役', lv: '初級', sum: '混一色・純チャン・二盃口・清一色', n: 5, gens: genY(E3), pages: [
        { h: '3飜〜6飜の役', items: ['点数の高い 役です。', '色を そろえる役(混一色・清一色)が、狙いやすく よく出ます。'] },
        yp('honitsu', '字牌のポンで 進めやすい、よく出る役です。'), yp('junchan'), yp('ryanpeiko'), yp('chinitsu', '色を ひとつに そろえて、字牌も なし。'),
      ] },
      { id: 'kui', t: '鳴くと 減る役', lv: '初級', sum: '食い下がりと 門前のみ の役', n: 5, gens: [genKui], pages: [
        { h: '3つに わけて 覚えよう', items: ['①鳴くと 1飜 へる役(食い下がり)', '②鳴くと 役に ならない役(門前のみ)', '③鳴いても 同じ飜数の役', '鳴く前に、役が つぶれないか 確認しましょう。'] },
        { h: '①鳴くと 1飜 へる', items: ['三色同順(2→1)・一気通貫(2→1)・チャンタ(2→1)', '混一色(3→2)・純チャン(3→2)・清一色(6→5)', '「色や形を そろえる 系」が 多いです。'] },
        { h: '②門前のみ(鳴くと なし)', items: ['リーチ・ツモ・ピンフ・イーペーコー・二盃口・七対子', '一発・ダブルリーチ', '「門前だから つく」という 考えかたの役です。'] },
        { h: '③鳴いても 同じ', items: ['タンヤオ・役牌・対々和・三暗刻・混老頭・三色同刻・小三元・役満の多く', '(三暗刻は 暗刻が 3つ あれば ほかで 鳴いて OK)', '鳴いても つかえる役が、鳴き麻雀の 武器です。'] },
      ] },
      { id: 'yakuman', t: '役満を 知ろう', lv: '初級', sum: 'めったに出ない 最高の役', n: 3, gens: [genYakuDesc(EY)], pages: [
        { h: '役満(やくまん)', items: ['役満は、いちばん 点数の高い 役です。子で 32000点、親で 48000点。', 'めったに 出ませんが、出たら大喜びです。', '名前と 形を 軽く 知っておくだけで OK。'] },
        { h: '代表的な 役満', items: [Y.daisangen.n + ': ' + Y.daisangen.d, { hand: Y.daisangen.hand }, Y.suuankou.n + ': ' + Y.suuankou.d, Y.kokushi.n + ': ' + Y.kokushi.d] },
        { h: 'ほかの 役満', items: [Y.tsuuiisou.n + ': ' + Y.tsuuiisou.d, Y.ryuuiisou.n + ': ' + Y.ryuuiisou.d, '数え役満: 飜が 13飜以上 たまっても 役満 に なります。'] },
      ] },
      { id: 'yakutest', t: '役の 総復習', lv: '初級', sum: '全部の役を まぜて テスト', n: 8, gens: [genYakuHand(ALLY), genYakuDesc(ALLY), genYakuHan(ALLY), genKui], pages: [
        { h: '総復習 テスト', items: ['ここまでの 役を まぜた 問題です。', '8問のうち、80%(7問)で 合格です。', '分からなかった 役は、答えの 説明を 読んで、前のステップで もう一度 読みましょう。', 'ここを 越えれば、飜の数えかたは すぐです。'] },
      ] },
      /* ===== 飜を 数える ===== */
      { id: 'dora', t: 'ドラを 数える', lv: '中級', sum: 'ドラは 1枚で 1飜', n: 5, gens: [genDora, genDoraCount], pages: [
        { h: 'ドラ とは', items: ['ドラは、持っているだけで 1枚につき 1飜 増える 牌です。', 'ただし、ドラだけでは 上がれません。役が 必要です。', '場に めくってある「ドラ表示牌」の、次の牌が ドラです。'] },
        { h: 'ドラは「次の牌」', items: ['表示牌が ' + H('3m') + ' なら、ドラは ' + H('4m') + '。', '表示牌が ' + H('9p') + ' なら、ドラは ' + H('1p') + '(9の次は1に もどる)。', '表示牌が ' + H('東') + ' なら ドラは ' + H('南') + '(東→南→西→北→東)。', '白→發→中→白 の 順です。'] },
        { h: '赤ドラ と 裏ドラ', items: ['赤ドラ: 赤い5の牌。1枚で 1飜。(このゲームでは、設定で 使うか 選べます)', '裏ドラ: リーチして 上がったときだけ、ドラ表示牌の 下も めくれます。同じく 1枚 1飜。', '手牌・鳴いた牌 すべての 中の ドラを 数えます。'] },
      ] },
      { id: 'han', t: '飜を 数えよう', lv: '中級', sum: '役の飜 + ドラ = 合計', n: 5, gens: [fromScore('何飜?'), genHanSum], pages: [
        { h: '合計の飜数 の 出しかた', items: ['役の飜数を 足して、ドラの数を 足します。', '例: リーチ(1)+ タンヤオ(1)+ ドラ1枚(1)= 3飜', '例: 混一色(3)+ 役牌(1)= 4飜(門前のとき)', '鳴いていたら、食い下がりの役は 1飜 減らします。'] },
        { h: '数えるときの コツ', items: ['①まず 役を 全部 探す', '②その飜数を 足す', '③最後に ドラを 足す(ドラ表示牌を 見る)', 'ここまでで「何飜か」が 分かれば、点数の半分は 分かったも同じです。'] },
        { h: '5飜以上は 点数が 決まる', items: ['5飜以上になると、符は 関係なく 点数が 決まります(満貫以上)。', 'だから、飜が 多い手ほど 計算が かんたんです。', 'まずは「5飜以上か どうか」を 見る クセを つけましょう。'] },
      ] },
      /* ===== 飜から 点数へ(子) ===== */
      { id: 'limit', t: '満貫以上の 点数', lv: '中級', sum: '子のロン:満貫8000〜役満32000', n: 5, gens: [genMangan, genLimitHan], pages: [
        { h: '5飜以上は 点数が 決まっています', items: ['子の ロン上がりの 点数です。', '満貫(5飜)  8000点', '跳満(6〜7飜)  12000点', '倍満(8〜10飜)  16000点', '三倍満(11〜12飜)  24000点', '役満  32000点'] },
        { h: '満貫に なる ほかの形', items: ['4飜でも 符が 多いと 満貫に なります(例: 40符 4飜 = 満貫)。', '3飜 70符以上も 満貫です。', 'これを「切り上げ満貫」と 呼ぶことも あります。'] },
        { h: '覚えかた', items: ['8000 → 12000 → 16000 → 24000 → 32000', '満貫の 1.5倍 → 2倍 → 3倍 → 4倍。', '「8・12・16・24・32」と 声に出して 覚えましょう。'] },
      ] },
      { id: 'pt14', t: '1〜4飜の 点数', lv: '中級', sum: '子・ロン: 30符と40符の表', n: 6, gens: [genPt30, genTbl({ fus: [30, 40], hans: [1, 2, 3, 4], who: 'ko', way: 'ron' })], pages: [
        { h: '30符の 子・ロン', items: ['よく出る 30符の 子・ロンの 点数です。', '1飜 1000点 / 2飜 2000点 / 3飜 3900点 / 4飜 7700点', '符が 分からないうちは、「30符」と 思って 数えると、だいたい 合います。'] },
        { h: '40符の 子・ロン', items: ['1飜 1300点 / 2飜 2600点 / 3飜 5200点 / 4飜 8000点(満貫)', '30符より 少し 高くなります。', '40符 4飜は 満貫に なる点に 注意。'] },
        { h: '点数の 出しかた(参考)', items: ['基本点 = 符 × 2の(飜 + 2)乗', '子のロン = 基本点 × 4(100点単位に 切り上げ)', '例: 30符 2飜 → 30 × 16 = 480 → × 4 = 1920 → 2000点', '暗記が 苦手なら、この式でも 出せます。'] },
      ] },
      { id: 'ko_tsumo', t: '子の ツモ', lv: '中級', sum: '「子・親」の順に 払う点数', n: 6, gens: [genTbl({ fus: [30, 40], hans: [1, 2, 3, 4, 5], who: 'ko', way: 'tsumo' })], pages: [
        { h: 'ツモは 3人で 払う', items: ['子が ツモ上がりすると、親と 子2人が 払います。', '親は 多く(基本点 × 2)、子は 少なく(基本点 × 1)払います。', '「1000・2000」のように、子・親の順で 書きます。'] },
        { h: 'よく出る ツモの 点数(子)', items: ['30符 1飜 300・500 / 2飜 500・1000', '30符 3飜 1000・2000 / 4飜 2000・3900', '満貫(5飜) 2000・4000 / 跳満 3000・6000', '合計は ロンの 点数と ほぼ 同じです。'] },
        { h: 'ロンとの ちがい', items: ['ロンは 1人が 払う。ツモは 3人で わけて払う。', '合計の 点数は 同じくらい。', '1人あたりの 負担は、ツモのほうが 軽いです。'] },
      ] },
      { id: 'oya', t: '親の 点数', lv: '中級', sum: '子の 1.5倍(ロン)・オール(ツモ)', n: 6, gens: [genOya, genTbl({ fus: [30, 40], hans: [1, 2, 3, 4], who: 'oya', way: 'both' })], pages: [
        { h: '親は 1.5倍', items: ['親が上がったら、子の 1.5倍です。', '満貫 12000点 / 跳満 18000点 / 倍満 24000点 / 三倍満 36000点 / 役満 48000点', '子の表を 覚えれば、親は かけ算だけです。'] },
        { h: '親の ロン(よく出る点数)', items: ['30符 1飜 1500点 / 2飜 2900点', '30符 3飜 5800点 / 4飜 11600点', '満貫 12000点。', '(子の点数 × 1.5 を 100点単位に 切り上げます)'] },
        { h: '親の ツモ(オール)', items: ['親が ツモ上がりすると、子3人が 同じ点数を 払います。', 'これを「〇〇点オール」と 言います。', '例: 30符 2飜 1000オール / 3飜 2000オール', '満貫は 4000オール、跳満は 6000オール。'] },
      ] },
      /* ===== 符を 数える ===== */
      { id: 'fu1', t: '符の 基本', lv: '上級', sum: '20符から 足して 切り上げ', n: 5, gens: [genFuBasic], pages: [
        { h: '符って なに?', items: ['符は、手の形で 決まる 細かい点数のもとです。', '20符(副底)から はじめて、足していきます。', '最後に、10符の 単位に 切り上げます。(例: 32符 → 40符)'] },
        { h: '最初に 足す符', items: ['門前で ロン: +10符', 'ツモ: +2符', 'ピンフの ツモは 足さず、20符で 計算。', '鳴いて ロンした 手は、+10符は ありません。'] },
        { h: '使いわけ', items: ['よく出る符は 20・30・40 の3つです。', '慣れるまでは「だいたい 30符」と思って 数えて OK。', 'ここから 先は、「もっと 正確に」と思う人 向けです。'] },
      ] },
      { id: 'fu2', t: '面子と 雀頭の符', lv: '上級', sum: '暗刻・明刻・役牌の雀頭', n: 5, gens: [genFuBasic, genFuSum], pages: [
        { h: '刻子の 符', items: ['順子は 0符です。(順子だけなら 符は 増えません)', '中張牌(2〜8)の 暗刻: 4符 / 明刻(ポン): 2符', '么九牌(1・9・字牌)の 暗刻: 8符 / 明刻: 4符', '槓子(カン)は、さらに 4倍です。'] },
        { h: '暗刻と 明刻', items: ['暗刻: 自分で そろえた 刻子(鳴いていない)', '明刻: ポンして できた 刻子', '(ロンで 刻子が 完成したときは、明刻 あつかい になることも あります)', 'とりあえず「鳴かない刻子は 倍」と 覚えましょう。'] },
        { h: '雀頭の 符', items: ['役牌(白發中)の 雀頭: +2符', '場風・自風の 雀頭: +2符', '場風と自風が 同じ牌なら +4符(2符 + 2符)。', '数牌の 雀頭は 0符。'] },
      ] },
      { id: 'fu3', t: '待ちの符・特別', lv: '上級', sum: '嵌張・辺張・単騎 +2 / 七対子25', n: 5, gens: [genFuBasic, genFuSum], pages: [
        { h: '待ちの 符', items: ['嵌張・辺張・単騎の 待ち: +2符', '両面・双碰(シャンポン)の 待ち: 0符', '待ちが 1種類しかない形は 上がりにくい ので、符が つきます。'] },
        { h: '特別な 手(七対子)', items: ['七対子は 25符 で 固定です。', '25符 2飜 = 子の ロン 1600点(親 2400点)', 'ふつうの符の 数えかたは しません。'] },
        { h: 'ピンフ と 鳴いた手', items: ['ピンフ ツモは 20符 / ピンフ ロンは 30符。', '鳴いた手で 符が 20符に なるときは 30符に します。', '「ピンフ形の 鳴き」は 30符、と 覚えましょう。'] },
      ] },
      { id: 'fu4', t: '符の 計算れんしゅう', lv: '上級', sum: '1つずつ 足していく 練習', n: 6, gens: [genFuSum, fromScore('何符?')], pages: [
        { h: '符を 足す 順番', items: ['①20符(副底)から はじめる', '②門前ロン +10 / ツモ +2', '③刻子の符(暗刻・明刻)を 足す', '④雀頭が 役牌なら +2 / 待ちの符 +2', '⑤10符の 単位に 切り上げる'] },
        { h: '例題', items: ['門前ロン・中張牌の暗刻 1組・嵌張待ち', '20 + 10 + 4 + 2 = 36符 → 40符', '40符 3飜 なら 子のロン 5200点。', 'こうして「飜 → 符 → 点数」と 進めます。'] },
      ] },
      /* ===== 総合 ===== */
      { id: 'honba', t: '本場と 供託', lv: '上級', sum: 'ロン+300・ツモ+100ずつ・リーチ棒', n: 4, gens: [genHonba], pages: [
        { h: '本場(ほんば)', items: ['親が 連荘したり、流局が 続くと「本場」が 増えます。', '1本場ごとに、ロンは +300点。ツモは 1人 +100点ずつ。', '例: 子の ロン 3900点 の 2本場 → 3900 + 600 = 4500点'] },
        { h: '供託(きょうたく)', items: ['リーチ棒(1000点)は 場に 残ります。', '次に 上がった人が、リーチ棒を まとめて もらえます。', '本場と 供託は、まず 基本の点数を 覚えてから で 大丈夫。'] },
      ] },
      { id: 'total', t: '点数を 計算してみよう', lv: '上級', sum: '飜と符から 点数を出す', n: 6, gens: [fromScore('点数はいくつ?', false), fromScore('何符?'), fromScore('何飜?')], pages: [
        { h: '総合問題', items: ['これまでの 総まとめです。', '手牌と 飜・符が 出るので、点数を 答えてみましょう。', '分からなくても 大丈夫。答えのあとに、計算の流れが 出ます。', '(順番: 役を探す → 飜を数える → 符を数える → 点数表)'] },
        { h: 'ここまで 来たら', items: ['何度か クイズを くりかえすと、数字が 自然に 覚えられます。', 'ゲームの 中の 上がり画面の「この役で 学ぶ」も 使えます。', '麻雀クイズの「点数計算ドリル」も 練習に なります。'] },
      ] },
    ],
  };
})(globalThis);
