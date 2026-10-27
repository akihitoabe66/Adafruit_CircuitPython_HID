/* 中級養成所(課題麻雀)と、対局中のミスノート */
(function () {
  const MJ = window.MJ;
  const $ = (s) => document.querySelector(s);
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };

  /* ===== ミスノート: 対局中にシャンテン数が戻る牌を切ったら、局面を保存。毎日の1問に出す ===== */
  const MAX = 20;
  const Mistakes = (MJ.Mistakes = {
    list() { return load('mj_mistakes', []); },
    count() { return this.list().length; },
    /* 切る直前に呼ぶ(手牌14枚・鳴きなし・リーチ者なしのときだけ。リーチ者がいる局面は、牌効率でなく守備の話になるので対象外) */
    check(game, p, tile) {
      if (!p.isHuman || p.melds.length || p.hand.length !== 14 || game.mode === 'drill') return;
      if (game.players.some((q) => q !== p && q.riichi)) return;
      const an = MJ.AI.analyze(game, p, { know: 2 });
      const e = an.evals.find((x) => x.t === tile.t);
      if (!e || e.sh <= an.minSh) return;
      const snap = {
        id: Date.now() + Math.random(), tries: 0,
        hand: p.hand.map((h) => h.t).sort((a, b) => a - b), dora: game.doraInd[0].t, dealer: game.dealer,
        rivers: game.players.map((q) => q.discards.map((d) => d.tile.t)),
      };
      const all = this.list();
      all.push(snap);
      save('mj_mistakes', all.slice(-MAX));
      game.mistakeN = (game.mistakeN || 0) + 1;
    },
    /* 出題: 保存した局面から1問(いちばん古いもの) */
    gen() {
      const all = this.list();
      for (const m of all) {
        const q = MJ.Drill.genEffFrom(m);
        if (q) { q.mistakeId = m.id; return q; }
      }
      return null;
    },
    /* 答え合わせの後: 正解なら消す。間違いは3回まで残す */
    resolve(id, good) {
      let all = this.list();
      const m = all.find((x) => x.id === id);
      if (!m) return;
      m.tries = (m.tries || 0) + 1;
      if (good || m.tries >= 3) all = all.filter((x) => x.id !== id);
      save('mj_mistakes', all);
    },
  });

  /* ===== 課題麻雀 ===== */
  const has = (w, re) => w.res.yaku.some((y) => re.test(y.n));
  const MISSIONS = [
    { id: 'tanyao', s: 'タンヤオ', lv: 1, name: 'タンヤオで上がれ', tip: '2〜8の数牌だけで作る。端の牌(1・9・字牌)から先に切ろう。', test: (w) => has(w, /^タンヤオ$/) },
    { id: 'pinfu', s: 'ピンフ', lv: 1, name: 'ピンフで上がれ', tip: '順子だけ・雀頭は役牌以外・両面待ち。鳴かずに作る。', test: (w) => has(w, /^平和$/) },
    { id: 'yakuhai', s: '役牌', lv: 1, name: '役牌で上がれ', tip: '白・發・中や、自風・場風を3枚そろえる(ポンもOK)。', test: (w) => has(w, /^(役牌|自風|場風)/) },
    { id: 'riichi', s: 'リーチ上がり', lv: 1, name: 'リーチをかけて上がれ', tip: '門前でテンパイしたらリーチ。その局のうちに上がること。', test: (w) => has(w, /^リーチ$/) },
    { id: 'tsumo', s: '門前ツモ', lv: 1, name: 'ツモで上がれ(門前)', tip: '鳴かずに、自分で引いて上がる(門前清自摸和)。', test: (w) => has(w, /^門前清自摸和$/) },
    { id: 'dora3', s: 'ドラ3枚', lv: 2, name: 'ドラを3枚以上持って上がれ', tip: 'ドラ・赤ドラ・裏ドラの合計3枚以上。ドラは切らずに大事に。', test: (w) => w.res.yaku.filter((y) => y.dora).reduce((a, y) => a + y.h, 0) >= 3 },
    { id: 'chiitoi', s: '七対子', lv: 2, name: '七対子で上がれ', tip: '同じ牌2枚の組を7つ。同じ牌4枚は使えない。', test: (w) => has(w, /^七対子$/) },
    { id: 'iipeikou', s: '一盃口', lv: 2, name: '一盃口で上がれ', tip: '同じ順子を2組(例: 456と456)。門前でないと成立しない。', test: (w) => has(w, /^(一盃口|二盃口)$/) },
    { id: 'toitoi', s: '対々和', lv: 2, name: '対々和で上がれ', tip: '4面子すべてを刻子(同じ牌3枚)にする。ポンを活用。', test: (w) => has(w, /^対々和$/) },
    { id: 'sanshoku', s: '三色同順', lv: 3, name: '三色同順で上がれ', tip: '萬・筒・索で同じ数字の順子(例: 345を3色)。', test: (w) => has(w, /^三色同順$/) },
    { id: 'ittsu', s: '一気通貫', lv: 3, name: '一気通貫で上がれ', tip: '同じ色で123・456・789をそろえる。', test: (w) => has(w, /^一気通貫$/) },
    { id: 'honitsu', s: '混一色', lv: 3, name: '混一色(染め手)で上がれ', tip: '数牌は1色だけ+字牌。他の色は切っていく。', test: (w) => has(w, /^(混一色|清一色)$/) },
    { id: 'mangan', s: '満貫以上', lv: 3, name: '満貫(5飜)以上で上がれ', tip: 'リーチ・ドラ・役を重ねて、5飜以上に。', test: (w) => w.res.han >= 5 },
    { id: 'noron', s: 'ノー放銃', lv: 3, name: '誰にも振り込まずに終えろ', tip: '危ないときは降りる。放銃したらその時点で失敗。', noRon: true },
  ];

  const Dojo = (MJ.Dojo = {
    list: MISSIONS,
    get(id) { return MISSIONS.find((m) => m.id === id) || null; },
    cleared() { return load('mj_dojo', {}); },

    open() {
      const cl = this.cleared();
      const n = MISSIONS.filter((m) => cl[m.id]).length;
      const btn = (m) => `<button class="btn dj-m${cl[m.id] ? ' ok' : ''}" data-mis="${m.id}"><span class="dj-lv">${'★'.repeat(m.lv)}</span> ${m.name}${cl[m.id] ? ' <b>✔</b>' : ''}</button>`;
      MJ.UI.overlay(`<div class="dj"><h2>🏯 中級養成所(課題麻雀)</h2><p class="dj-h">課題を選んで対局。課題の役で上がれたらクリア! 達成 ${n}/${MISSIONS.length}</p><div class="dj-g">${MISSIONS.map(btn).join('')}</div><div class="dj-foot"><span class="dj-t" id="dj-tip">課題をタップすると、コツが表示されます。</span><button class="btn" id="dj-close">閉じる</button></div></div>`, { plain: true });
      let sel = null;
      $('#overlay').querySelector('.dj').addEventListener('click', (e) => {
        const b = e.target.closest('[data-mis]');
        if (!b) return;
        const m = this.get(b.dataset.mis);
        if (sel === m.id) { MJ.UI.closeOverlay(); MJ.App.mission = m.id; MJ.App.openSelect('inter'); return; }
        sel = m.id;
        document.querySelectorAll('#overlay .dj-m').forEach((x) => x.classList.toggle('sel', x === b));
        $('#dj-tip').innerHTML = `<b>コツ</b> ${m.tip}<br><small>もう一度タップで、対戦相手の選択へ。</small>`;
      });
      $('#dj-close').addEventListener('click', () => { MJ.UI.closeOverlay(); if (MJ.Pad) MJ.Pad.refocus(); });
      if (MJ.Pad) { MJ.Pad.cur = null; MJ.Pad.desc = null; MJ.Pad.refocus(); }
    },

    /* 1局が終わるたびに呼ぶ。課題クリアか失敗が決まったら、対局を終える */
    step(game, r) {
      const m = game.mission;
      if (!m || game.missionOver) return;
      if (r.type === 'win') {
        for (const w of r.wins) {
          if (w.winner.isHuman && m.test && m.test(w)) { game.missionClear = true; game.missionOver = true; }
          if (w.loser && w.loser.isHuman) game.dealtIn = (game.dealtIn || 0) + 1;
        }
      }
      if (m.noRon && game.dealtIn) game.missionOver = true;
    },
    /* 対局終了ダイアログに差し込む結果(クリアは保存する) */
    endHTML(game) {
      const m = game.mission;
      if (!m) return '';
      const ok = m.noRon ? !game.dealtIn : !!game.missionClear;
      if (ok) { const c = this.cleared(); c[m.id] = 1; save('mj_dojo', c); }
      return `<p class="dj-res ${ok ? 'ok' : 'ng'}">${ok ? '🏯 課題クリア!' : '🏯 課題は未達成…'}<br><b>${m.name}</b>${ok ? '' : `<br><small>コツ: ${m.tip}</small>`}</p>`;
    },
  });

  /* ===== 課題に合わせた打牌アドバイス =====
     課題ごとに「課題から遠い牌(cut=切りたい)」と「課題に近い牌(keep=残したい)」を決める。
     ★は、シャンテン数を悪くしない範囲で、切りたい牌を優先する。 */
  const isYao = (t) => t >= 27 || t % 9 === 0 || t % 9 === 8;
  const suitOf = (t) => (t < 27 ? Math.floor(t / 9) : -1);
  const SUITN = ['萬子', '筒子', '索子'];
  const ADV = {
    tanyao(c) {
      const n = c.hand.filter((h) => isYao(h.t)).length;
      const meldYao = c.melds.some((m) => m.tiles.some((h) => isYao(h.t)));
      return { status: meldYao ? '鳴いた面子に1・9・字牌が入っていて、<b>タンヤオは不可能</b>です。この局は別の方針に。' : n ? `1・9・字牌が<b>${n}枚</b>。これらは先に切りましょう。` : '1・9・字牌がありません。<b>タンヤオの形</b>です。', cut: (h) => isYao(h.t) };
    },
    pinfu(c) {
      const meld = c.melds.some((m) => m.kind !== 'ankan');
      const yh = (t) => t >= 31 || t === 27 + c.seatWind || t === 27 + c.roundWind;
      return { status: meld ? '鳴くと<b>平和はつきません</b>。この局は別の方針に。' : '鳴かずに、順子だけで両面待ちを作ります。役牌の対子・刻子や、カンチャン/ペンチャン待ちは平和になりません。', cut: (h) => !meld && yh(h.t) && c.cnt[h.t] >= 2 };
    },
    yakuhai(c) {
      const yh = (t) => t >= 31 || t === 27 + c.seatWind || t === 27 + c.roundWind;
      const pairs = [...new Set(c.hand.filter((h) => yh(h.t) && c.cnt[h.t] >= 2).map((h) => h.t))];
      return { status: pairs.length ? `役牌の対子(${pairs.map(MJ.tileName).join('・')})があります。<b>ポン</b>か3枚目のツモで役になります。` : '役牌(白・發・中、自風、場風)を2枚以上集めましょう。1枚の役牌は、他と重なるまで残す手も。', keep: (h) => yh(h.t) };
    },
    riichi(c) {
      const meld = c.melds.some((m) => m.kind !== 'ankan');
      return { status: meld ? '鳴くと<b>リーチはできません</b>。' : '鳴かずにテンパイを目指し、テンパイしたら<b>リーチ</b>をかけます。' };
    },
    tsumo(c) {
      const meld = c.melds.some((m) => m.kind !== 'ankan');
      return { status: meld ? '鳴くと<b>門前ツモにはなりません</b>。' : '鳴かずに、<b>自分で引いて</b>上がります(ロンでは成立しません)。' };
    },
    dora3(c) {
      const isD = (h) => c.game.doraInd.some((d) => MJ.doraOf(d.t) === h.t) || h.red;
      const n = c.all.filter(isD).length;
      return { status: `ドラ・赤が<b>${n}枚</b>(目標3枚以上)。ドラは切らずに残し、ドラ周りの牌をつなげましょう。`, keep: isD };
    },
    chiitoi(c) {
      const meld = c.melds.length;
      const pairs = Object.keys(c.cnt).filter((t) => c.cnt[t] >= 2).length;
      return { status: meld ? '鳴くと<b>七対子はできません</b>。' : `対子が<b>${Math.min(pairs, 7)}組</b>(7組で完成)。同じ牌は2枚ずつ。単独の牌は、対子になりにくいものから切ります。`, keep: (h) => !meld && c.cnt[h.t] === 2 };
    },
    iipeikou(c) {
      const meld = c.melds.some((m) => m.kind !== 'ankan');
      return { status: meld ? '鳴くと<b>一盃口はつきません</b>。' : '同じ順子を2組(例: 456と456)つくります。連続した牌が2枚ずつ並ぶ形を残しましょう。', keep: (h) => !meld && c.cnt[h.t] === 2 && h.t < 27 };
    },
    toitoi(c) {
      const sets = Object.keys(c.cnt).filter((t) => c.cnt[t] >= 2).length;
      const runy = (h) => h.t < 27 && c.cnt[h.t] === 1 && ((h.t % 9 > 0 && c.cnt[h.t - 1]) || (h.t % 9 < 8 && c.cnt[h.t + 1]));
      return { status: `対子・刻子が<b>${sets}組</b>。同じ牌を集めて<b>ポン</b>で刻子にします。順子の形(連続した牌)は崩してOK。`, keep: (h) => c.cnt[h.t] >= 2, cut: (h) => runy(h) };
    },
    sanshoku(c) {
      let best = 0, bs = -1;
      for (let r = 0; r < 7; r++) {
        let sc = 0;
        for (let s = 0; s < 3; s++) { let k = 0; for (let d = 0; d < 3; d++) if (c.cnt[s * 9 + r + d]) k++; sc += k; }
        if (sc > best) { best = sc; bs = r; }
      }
      const inR = (t) => t < 27 && t % 9 >= bs && t % 9 < bs + 3;
      return { status: bs < 0 ? '萬・筒・索で同じ数字の順子をそろえます。' : `いちばん近いのは<b>${bs + 1}${bs + 2}${bs + 3}</b>の三色(${best}/9枚)。この数字の牌を3色で集めましょう。`, keep: (h) => bs >= 0 && inR(h.t) };
    },
    ittsu(c) {
      const sc = [0, 1, 2].map((s) => { let k = 0; for (let i = 0; i < 9; i++) if (c.cnt[s * 9 + i]) k++; return k; });
      const bs = sc.indexOf(Math.max(...sc));
      return { status: `いちばん近いのは<b>${SUITN[bs]}</b>(1〜9のうち${sc[bs]}種類)。123・456・789を1色でそろえます。`, keep: (h) => suitOf(h.t) === bs };
    },
    honitsu(c) {
      const sc = [0, 1, 2].map((s) => { let k = 0; for (let i = 0; i < 9; i++) k += c.cnt[s * 9 + i] || 0; return k; });
      const bs = sc.indexOf(Math.max(...sc));
      return { status: `<b>${SUITN[bs]}</b>が${sc[bs]}枚で最多。数牌はこの色だけにして、字牌も使います。ほかの2色は切っていきましょう。`, keep: (h) => suitOf(h.t) === bs || h.t >= 27, cut: (h) => suitOf(h.t) >= 0 && suitOf(h.t) !== bs };
    },
    mangan(c) {
      const isD = (h) => c.game.doraInd.some((d) => MJ.doraOf(d.t) === h.t) || h.red;
      const n = c.all.filter(isD).length;
      return { status: `5飜が目標。<b>リーチ</b>(1)+ドラ(いま${n}枚)+役を重ねます。ドラは残し、鳴かずにリーチを狙うのが近道です。`, keep: isD };
    },
    noron(c) {
      const opps = c.game.players.filter((q) => q !== c.p && q.riichi);
      return { status: opps.length ? `<b>${opps.map((q) => q.name).join('・')}</b>がリーチ中。攻めずに、安全な牌(現物・スジ)を切って降りましょう。` : 'いまはリーチ者がいません。でも、手が遠いなら攻めすぎないこと。⚠危険度の表示を見ながら切りましょう。' };
    },
  };

  /* an=Coach側の分析、eff=有効牌順の評価。戻り値: { html(カード), marks, recId } */
  Dojo.advice = function (game, p, an, eff, card) {
    const m = game.mission;
    const f = m && ADV[m.id];
    if (!f) return null;
    const melds = p.melds;
    const all = p.hand.concat([].concat(...melds.map((x) => x.tiles)));
    const cnt = {};
    all.forEach((h) => { cnt[h.t] = (cnt[h.t] || 0) + 1; });
    const c = { game, p, hand: p.hand, melds, all, cnt, seatWind: game.seatWindOf(p), roundWind: game.roundWind };
    const a = f(c);
    const marks = {};
    const cutIds = [];
    p.hand.forEach((h) => {
      if (a.cut && a.cut(h)) { marks[h.id] = { txt: '課題✕', cls: 'danger' }; cutIds.push(h); }
      else if (a.keep && a.keep(h)) marks[h.id] = { txt: '課題◎', cls: 'safe' };
    });
    // 切りたい牌のうち、シャンテン数を悪くしないもの(有効牌が多い順)を★に
    let rec = null, note = '';
    const best = eff[0];
    const okCut = eff.filter((e) => e.sh === an.minSh && cutIds.some((h) => h.t === e.t));
    if (okCut.length && !(an.opps && an.opps.length)) {
      rec = cutIds.find((h) => h.t === okCut[0].t);
      if (best && best.t !== rec.t) note = `<div class="cc-s">通常の最善は${MJ.tileName(best.t)}ですが、課題のために<b>${MJ.tileName(rec.t)}</b>を★にしています(シャンテン数は同じ)。</div>`;
    } else if (cutIds.length && best && !cutIds.some((h) => h.t === best.t)) {
      note = '<div class="cc-s">課題に合わない牌を切ると手が遠のくので、今はふつうの最善を優先しています。</div>';
    }
    return { card: card(`🎯 課題「${m.s}」`, `${a.status}${note}`, ''), marks, recId: rec ? rec.id : null, summary: `🎯${m.s}` };
  };
})();
