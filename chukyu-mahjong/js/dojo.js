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
})();
