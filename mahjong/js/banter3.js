/* 上がったあとの、結果画面のセリフ(煽り・悔しがり)と、ふだんのセリフの「ことばの種類」を増やす。
   - 上がった人(CPU)は、自慢・煽り。 放銃した人(CPU)は、悔しがり・次への意気込み。ツモのときは、ほかの人の ため息。
   - 同じ言い回しが続かないよう、直近のセリフは覚えておいて、避ける(連勝・連続の放銃などの流れも、ことばに反映する)。
   - 一人で遊ぶ人にも、友達と卓を囲んでいるように感じてもらうための、ことば。やさしい口調で、きつい言い方はしない。
   {w}=上がった人の名前 / {l}=放銃した人の名前 / {pts}=点数 / {yaku}=役名 / {y}=あなた */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const B = MJ.Banter; if (!B) return;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const hist = []; // 直近に使ったセリフ
  const fresh = (arr) => { const c = arr.filter((x) => !hist.includes(x)); const t = pick(c.length ? c : arr); hist.push(t); if (hist.length > 30) hist.shift(); return t; };

  /* ---- ことば(男性ふう m / 女性ふう f)。 {…} は あとで置きかえる ---- */
  const GEN = {
    m: {
      brag: ['よし、いただきだ。', 'ロン、ありがとう。', 'その牌を待っていたよ。', 'いいところに来てくれた。', 'これは、気持ちいいな。', '悪いね、今のは、いただいた。', 'うむ、読み通りだ。', 'ふふ、そこで来ると思っていたよ。', '一発で決まったな。', 'ありがたく、頂戴するよ。', '今日は、調子がいいぞ。', '{l}さん、いい牌をありがとう。'],
      bragTsumo: ['自分で引いたぞ。気持ちいい!', 'ツモだ。いい流れだな。', 'おっ、来た来た。ツモだ。', '自力で決めたぞ、どうだ。', 'いい牌が来てくれたな。ツモ!', '運も実力のうち、ということかな。'],
      bragBig: ['どうだ、{pts}点だ。', '大きいのが決まったな。', '{yaku}か。気持ちがいい!', 'これは、会心の一手だな。', 'いやあ、決まった。ここまで来た甲斐があったよ。'],
      bragCheap: ['小さくても、勝ちは勝ちだ。', 'こつこつ行くのが、私のやり方さ。', 'ちいさな積み重ねが、大事なんだよ。'],
      bragRiichi: ['リーチをかけた甲斐があったな。', '待った甲斐があったよ。', '信じて待つ、というやつだ。'],
      bragDealer: ['親の上がりは、大きいぞ。', '親の意地を見せたな。', 'まだまだ、親は続けさせてもらう。'],
      streak: ['おや、また私の勝ちか。', '今日は、勝ち運がついているな。', '連勝中だな。気を引き締めよう。'],
      regret: ['むう、やられたか。', 'そこに来るとは、読めなかったな。', 'いやあ、参った。', 'しまった、うっかりしたよ。', '今のは、痛かったな。', '次は、そうはいかないよ。', 'ううむ、勉強になった。', 'やるなあ。次は取り返す。', '油断したな。気をつけよう。', '悔しいが、お見事。'],
      regretBig: ['これは、大きな痛手だ…。', 'やれやれ、高くついたな。', '大物にやられたな。くやしい!'],
      regretAgain: ['また私か…。今日はついてないな。', '続けてやられるとは、情けない。', '二度目はないぞ。気を引き締めよう。'],
      sigh: ['ああ、先を越されたか。', '惜しい、あと少しだったんだがな。', 'やられたな、次に行こう。', '自分で引かれては、仕方がない。', 'うーむ、こっちも、いい手だったのに。'],
      humanWin: ['お見事。やられました。', 'さすがだな、{y}さん。', '今のは、完敗だ。', '{y}さん、腕を上げたな。', 'うまい。これは、一本取られた。', 'ほう、そう来たか。お見事!'],
      humanTsumo: ['ツモとは、運も味方につけたな。', '自力で来たか。見事だ。', 'お見事、{y}さん。'],
      onHumanLose: ['{y}さん、どんまい、どんまい。', '次がありますよ、{y}さん。', 'そういう日も、ありますよ。', '気を取り直して、次に行きましょう。', '{y}さん、牌はまだまだ来ますよ。'],
    },
    f: {
      brag: ['はい、いただきます。', 'ロンです。ありがとう。', 'その牌を、待っていましたの。', 'いいところに、来てくれましたわ。', 'うふふ、嬉しいわ。', 'ごめんなさいね、いただきます。', '思った通りでしたわ。', '来ると思っていましたのよ。', '一発で決まりましたわね。', 'ありがたく、頂戴いたします。', '今日は、調子がいいみたい。', '{l}さん、ありがとう。'],
      bragTsumo: ['自分で引けました。嬉しい!', 'ツモですわ。いい流れね。', 'あら、来ましたわ。ツモです。', '自力で決めましたわよ。', 'いい牌が、来てくれましたわ。', '運も、味方してくれたみたい。'],
      bragBig: ['{pts}点ですわ。', '大きいのが、決まりましたわね。', '{yaku}ですわ。気持ちがいいわ!', 'これは、会心の一手ですわ。', 'ここまで来た甲斐が、ありましたわ。'],
      bragCheap: ['小さくても、勝ちは勝ちですわ。', 'こつこつ、参りますの。', '小さな積み重ねが、大切ですのよ。'],
      bragRiichi: ['リーチした甲斐が、ありましたわ。', '待った甲斐が、ありましたわ。', '信じて待つ、ですわね。'],
      bragDealer: ['親の上がりは、大きいですわよ。', '親の意地を、お見せしましたわ。', 'まだまだ、親は続けますわ。'],
      streak: ['あら、また私の勝ちですわ。', '今日は、ついているみたい。', '連勝中ですわ。油断しないようにしますわ。'],
      regret: ['あら、やられましたわ。', 'そこに来るとは、思いませんでしたわ。', 'まあ、参りましたわ。', 'あっ、うっかりしましたわ。', '今のは、痛かったですわ。', '次は、そうはいきませんわよ。', 'まあ、勉強になりましたわ。', 'お見事。次は取り返しますわ。', '油断してしまいましたわ。', '悔しいけれど、お見事ですわ。'],
      regretBig: ['これは、大きな痛手ですわ…。', 'まあ、高くつきましたわ。', '大物に、やられましたわ。悔しい!'],
      regretAgain: ['また私ですの…。今日は、ついていませんわ。', '続けてやられるなんて、情けないですわ。', '二度目はありませんわよ。気を引き締めますわ。'],
      sigh: ['ああ、先を越されましたわ。', '惜しい、あと少しでしたのに。', 'やられましたわね。次に参りましょう。', '自分で引かれては、仕方ありませんわ。', 'こちらも、いい手でしたのに。'],
      humanWin: ['お見事。やられましたわ。', 'さすがですわ、{y}さん。', '今のは、完敗ですわ。', '{y}さん、腕を上げましたわね。', 'お上手。一本取られましたわ。', 'まあ、そう来ましたのね。お見事!'],
      humanTsumo: ['ツモだなんて、運も味方につけましたわね。', '自力で来ましたのね。お見事ですわ。', 'お見事ですわ、{y}さん。'],
      onHumanLose: ['{y}さん、どんまいですわ。', '次がありますわよ、{y}さん。', 'そういう日も、ありますわ。', '気を取り直して、次に参りましょう。', '{y}さん、牌はまだまだ来ますわよ。'],
    },
  };
  const gOf = (p) => (MJ.isFemaleChar && MJ.isFemaleChar(p.char) ? 'f' : 'm');
  /* 連勝・連続の放銃の記録 */
  const win = {}, lost = {}; // seat → 回数
  MJ.Banter.resetStreak = () => { for (const k of Object.keys(win)) delete win[k]; for (const k of Object.keys(lost)) delete lost[k]; };
  const fill = (t, o) => t.replace(/\{y\}/g, 'あなた').replace(/\{w\}/g, o.w || '').replace(/\{l\}/g, o.l || '').replace(/\{pts\}/g, o.pts || '').replace(/\{yaku\}/g, o.yaku || '').replace(/あなたさん/g, 'あなた');

  /* 上がったあとの、セリフの並び(最大2つ)。 戻り値: [{ p: 話す人, text }] */
  B.afterWin = function (game, r) {
    const out = [];
    try {
      if (!B.on || !r || r.type !== 'win' || !r.wins || !r.wins.length) return out;
      const w = r.wins[0], winner = w.winner, loser = w.loser, res = w.res || {}, tsumo = !!w.tsumo;
      const o = { w: winner.name, l: loser ? loser.name : '', pts: w.pay ? (w.pay.ron != null ? w.pay.ron : w.pay.each != null ? w.pay.each * 3 : (w.pay.fromOther || 0) * 2 + (w.pay.fromDealer || 0)) : '', yaku: res.yaku && res.yaku.length ? res.yaku[0].n : '役' };
      const big = !!(res.limit || res.yakuman || res.han >= 5), cheap = !res.limit && !res.yakuman && res.han <= 1, dealerWin = game && game.players[game.dealer] === winner;
      const sk = (p) => p.seat;
      const cpus = game.players.filter((q) => !q.isHuman);
      // 連勝・連続放銃の記録を更新
      game.players.forEach((q) => { if (q === winner) win[sk(q)] = (win[sk(q)] || 0) + 1; else win[sk(q)] = 0; if (loser && q === loser) lost[sk(q)] = (lost[sk(q)] || 0) + 1; else if (q !== loser) lost[sk(q)] = 0; });
      if (!winner.isHuman) {
        const G = GEN[gOf(winner)], set = B.lines && B.lines[winner.char.id];
        let pool = [];
        if (win[sk(winner)] >= 2) pool = pool.concat(G.streak);
        if (big) pool = pool.concat(G.bragBig);
        if (cheap) pool = pool.concat(G.bragCheap);
        if (winner.riichi && !pool.length) pool = pool.concat(G.bragRiichi);
        if (dealerWin && Math.random() < 0.4) pool = pool.concat(G.bragDealer);
        if (!pool.length || Math.random() < 0.5) pool = pool.concat(tsumo ? G.bragTsumo : G.brag);
        let text = fresh(pool);
        if (set && set.brag && set.brag.length && Math.random() < 0.4) text = fresh(set.brag); // そのキャラ らしい自慢も、ときどき
        out.push({ p: winner, text: fill(text, o) });
        if (!tsumo && loser && !loser.isHuman) {
          const GL = GEN[gOf(loser)]; let lp = GL.regret;
          if (big) lp = lp.concat(GL.regretBig, GL.regretBig); if (lost[sk(loser)] >= 2) lp = lp.concat(GL.regretAgain, GL.regretAgain);
          out.push({ p: loser, text: fill(fresh(lp), o) });
        } else if (!tsumo && loser && loser.isHuman) {
          const others = cpus.filter((q) => q !== winner); // あなたが放銃したとき: もう一人が、なぐさめる
          if (others.length && Math.random() < 0.7) { const q = pick(others); out.push({ p: q, text: fill(fresh(GEN[gOf(q)].onHumanLose), o) }); }
        } else if (tsumo) { // ツモ: ほかのだれかが、ため息
          const others = cpus.filter((q) => q !== winner);
          if (others.length) { const q = pick(others); out.push({ p: q, text: fill(fresh(GEN[gOf(q)].sigh), o) }); }
        }
      } else { // あなたが上がった: 放銃した人(いなければ、だれか)が、悔しがる・ほめる
        const q = loser && !loser.isHuman ? loser : cpus.length ? pick(cpus) : null;
        if (q) { const G = GEN[gOf(q)]; out.push({ p: q, text: fill(fresh(tsumo ? G.humanTsumo.concat(G.humanWin) : G.humanWin.concat(loser && !loser.isHuman ? G.regret : [])), o) }); }
        const rest = cpus.filter((c) => c !== q);
        if (rest.length && Math.random() < 0.5) { const c = pick(rest); out.push({ p: c, text: fill(fresh(GEN[gOf(c)].humanWin), o) }); }
      }
    } catch (e) { /* ignore */ }
    return out.slice(0, 2);
  };
})(typeof window !== 'undefined' ? window : globalThis);
