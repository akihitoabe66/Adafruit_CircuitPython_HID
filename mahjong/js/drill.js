/* 練習問題: 何切る / 役づくり / 守備 / 鳴き判断 / 待ち当て / 点数計算 を毎回ランダムな問題で練習する */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const A = MJ.AI;
  const tn = MJ.tileName;
  const ic = MJ.icon;
  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rnd(a.length)];
  const WINDS = ['東', '南', '西', '北'];

  /* ---------- 牌プール(枚数4枚の制約を守って牌を取り出す) ---------- */
  class Pool {
    constructor() {
      this.by = Array.from({ length: 34 }, (_, t) => [0, 1, 2, 3].map((k) => ({ id: t * 4 + k, t, red: MJ.isRedId(t * 4 + k) })).sort((a, b) => (a.red ? 1 : 0) - (b.red ? 1 : 0)));
      this.used = new Set();
    }
    left(t) { return this.by[t].filter((x) => !this.used.has(x.id)).length; }
    take(t) {
      for (const x of this.by[t]) if (!this.used.has(x.id)) { this.used.add(x.id); return x; }
      return null;
    }
    takeMany(ts) {
      const out = [];
      for (const t of ts) { const x = this.take(t); if (!x) return null; out.push(x); }
      return out;
    }
  }
  const sortTiles = (a) => a.sort((x, y) => x.t - y.t || x.id - y.id);

  /* 面子の種類 */
  const shun = (s, r) => [s * 9 + r, s * 9 + r + 1, s * 9 + r + 2];
  const koutsu = (t) => [t, t, t];
  function randSet(suits, honorP) {
    if (Math.random() < honorP) return koutsu(27 + rnd(7));
    const s = pick(suits);
    if (Math.random() < 0.72) return shun(s, rnd(7));
    return koutsu(s * 9 + rnd(9));
  }
  /* 4面子1雀頭 (型だけ) */
  function randomComplete(opts = {}) {
    const suits = opts.suits || MJ.shuffle([0, 1, 2]).slice(0, 1 + rnd(2));
    const sets = [];
    for (let i = 0; i < 4; i++) sets.push(randSet(suits, opts.honorP == null ? 0.1 : opts.honorP));
    const pair = Math.random() < (opts.honorPair == null ? 0.2 : opts.honorPair) ? 27 + rnd(7) : pick(suits) * 9 + rnd(9);
    return { sets, pair, suits };
  }
  const flat = (c) => [].concat(...c.sets, [c.pair, c.pair]);

  /* 完成形から n 枚を別の牌にすり替えた手牌(型崩れさせて向聴数を上げる) */
  function makeHand(pool, o = {}) {
    for (let tries = 0; tries < 200; tries++) {
      const c = randomComplete(o);
      const types = flat(c);
      const cnt = new Array(34).fill(0);
      for (const t of types) cnt[t]++;
      if (cnt.some((n) => n > 4)) continue;
      let ts = types.slice();
      const rep = o.replace == null ? 2 : o.replace;
      for (let i = 0; i < rep; i++) {
        const k = rnd(ts.length);
        const nt = Math.random() < 0.6 ? pick(c.suits) * 9 + rnd(9) : Math.random() < 0.5 ? 27 + rnd(7) : rnd(27);
        ts[k] = nt;
      }
      const n = o.tiles || 14;
      while (ts.length > n) ts.splice(rnd(ts.length), 1);
      const c3 = new Array(34).fill(0);
      ts.forEach((t) => c3[t]++);
      if (c3.some((n) => n > 3)) continue;
      const p2 = new Pool();
      p2.used = new Set(pool.used);
      const tiles = p2.takeMany(ts);
      if (!tiles) continue;
      pool.used = p2.used;
      return sortTiles(tiles);
    }
    return null;
  }

  /* ---------- 局面(CPUの河など)を持つ仮のゲーム ---------- */
  function mock(o) {
    const dealer = o.dealer || 0;
    const chars = o.chars || [];
    const players = [0, 1, 2, 3].map((s) => ({
      seat: s, name: s === 0 ? 'あなた' : (chars[s] ? chars[s].short : 'CPU'), char: chars[s] || { id: 0, level: 3 }, isHuman: s === 0,
      hand: s === 0 ? o.hand : [], melds: s === 0 ? o.melds || [] : [], discards: [], discardTypes: new Set(),
      riichi: false, riichiSeq: -1, kuikae: [], score: 25000, ippatsu: false,
    }));
    const log = [];
    let seq = 0;
    const rivers = o.rivers || [[], [], [], []];
    const max = Math.max(0, ...rivers.map((r) => r.length));
    for (let i = 0; i < max; i++) {
      for (const s of [1, 2, 3, 0]) {
        const tile = rivers[s][i];
        if (!tile) continue;
        seq++;
        const isR = o.riichiIdx && o.riichiIdx[s] === i;
        players[s].discards.push({ tile, riichi: !!isR, called: false, seq });
        players[s].discardTypes.add(tile.t);
        log.push({ seq, tile, by: s });
        if (isR) { players[s].riichi = true; players[s].riichiSeq = seq; }
      }
    }
    return {
      players, doraInd: o.doraInd || [], doraAll: o.doraInd || [], discardLog: log, seq, dealer, roundWind: 0, mode: 'drill',
      seatWindOf(p) { return (p.seat - dealer + 4) % 4; }, menzen(p) { return p.melds.every((m) => m.kind === 'ankan'); },
      live: new Array(40), handCount: 0, kyoku: 0, honba: 0,
    };
  }
  const randTile = (pool, numP = 0.72) => {
    for (let i = 0; i < 30; i++) {
      const t = Math.random() < numP ? rnd(27) : 27 + rnd(7);
      const x = pool.take(t);
      if (x) return x;
    }
    return null;
  };
  function randRiver(pool, n) {
    const r = [];
    for (let i = 0; i < n; i++) { const x = randTile(pool); if (x) r.push(x); }
    return r;
  }
  const iconsOf = (arr, max = 12) => arr.slice(0, max).map(ic).join('');
  const typesIcons = (ts) => ts.map(ic).join('');

  /* 場の説明 */
  const sitHTML = (g, extra) => `<span class="chip dealer">東1局</span> あなたは<b>${WINDS[g.seatWindOf(g.players[0])]}家</b>${g.dealer === 0 ? '(親)' : '(子)'}　ドラ表示牌 ${g.doraInd.map((d) => ic(d.t)).join('')}${extra ? '　' + extra : ''}`;

  /* ====================================================================
     1) 何切る (牌効率)
     ==================================================================== */
  function genEff() {
    for (let tries = 0; tries < 400; tries++) {
      const pool = new Pool();
      const dora = randTile(pool, 1);
      const hand = makeHand(pool, { replace: 1 + rnd(3), honorP: 0.12 });
      if (!hand) continue;
      const rivers = [0, 1, 2, 3].map(() => randRiver(pool, 3 + rnd(4)));
      const g = mock({ hand, doraInd: [dora], rivers, chars: MJ.shuffle(MJ.CHARS.slice()).slice(0, 4) });
      const an = A.analyze(g, g.players[0], { know: 2 });
      if (an.minSh < 1 || an.minSh > 2 || an.evals.length < 6) continue;
      const rank = A.byEff(an.evals);
      const best = rank[0];
      const second = rank.find((e) => A.effScore(e) < A.effScore(best) - 0.01);
      if (!second || A.effScore(best) - A.effScore(second) < 4) continue;
      return {
        cat: 'eff', kind: 'tile', title: '何を切る?(牌効率)', hand, g, an, rank, best,
        sit: sitHTML(g, `<b>${an.minSh}シャンテン</b>の形`), prompt: '14枚の手牌から、<b>1枚切る</b>なら何を切りますか?(目標: テンパイに近づく牌を残す)',
        grade(tile) {
          const e = an.evals.find((x) => x.t === tile.t);
          const ok = e.sh === best.sh && e.ukeire.n >= best.ukeire.n - 1;
          const near = !ok && e.sh === best.sh;
          const top = rank.slice(0, 4).map((x) => `<li>${x === best ? '★' : ''}${ic(x.t)} ${tn(x.t)} → ${x.sh === an.minSh ? `有効牌 <b>${x.ukeire.n}枚</b>` : `シャンテンが戻る(${x.sh}シャンテン)`}${x.t === tile.t ? ' ←あなたの選択' : ''}</li>`).join('');
          const why = MJ.Coach.reasonFor(g, g.players[0], an, best);
          return {
            r: ok ? 'ok' : near ? 'near' : 'ng',
            html: `<p>おすすめは <b>${ic(best.t)} ${tn(best.t)}</b>。${why}。</p><ul class="cc-ul">${top}</ul><div class="cc-s">有効牌=引くとシャンテン数が進む牌の残り枚数。同じシャンテンなら<b>有効牌が多い</b>方を選びます。孤立した字牌・端牌→ターツ(形)の弱い方、の順に切るのが基本です。</div>`,
          };
        },
      };
    }
    return null;
  }

  /* ====================================================================
     2) 守備 (安全牌を選ぶ)
     ==================================================================== */
  const THEMES = {
    genbutsu: { name: '現物', tag: (t) => t === '現物' },
    suji: { name: 'スジ', tag: (t) => t === 'スジ' || t === 'スジ・カベ' },
    nakasuji: { name: '中スジ(4・5・6)', tag: (t) => t === 'スジ' },
    kabe: { name: 'カベ', tag: (t) => /カベ/.test(t) },
    honor: { name: '字牌の見え枚数', tag: (t) => /字牌/.test(t) || t === '全見え' },
    mix: { name: '総合', tag: () => true },
  };
  function genDef(theme) {
    theme = theme || pick(['genbutsu', 'suji', 'nakasuji', 'kabe', 'honor', 'mix']);
    for (let tries = 0; tries < 600; tries++) {
      const pool = new Pool();
      const rs = 1 + rnd(3);
      const others = [1, 2, 3].filter((s) => s !== rs);
      const dora = randTile(pool, 1);
      const hand = makeHand(pool, { replace: 3 + rnd(2), honorP: 0.08 });
      if (!hand) continue;
      const rivers = [[], [], [], []];
      const types = new Set(hand.map((h) => h.t));
      const L = 9 + rnd(6);
      const need = []; // 河に入れたい牌
      let ok = true;
      const addRiver = (seat, t) => { const x = pool.take(t); if (!x) { ok = false; return; } rivers[seat].push(x); };
      const r1 = Math.random() < 0.5;
      if (theme === 'genbutsu') {
        const cand = [...types].filter((t) => t < 27 && t % 9 >= 2 && t % 9 <= 6);
        if (!cand.length) continue;
        addRiver(rs, pick(cand));
      } else if (theme === 'suji') {
        const cand = [...types].filter((t) => t < 27 && (t % 9 <= 2 || t % 9 >= 6));
        if (!cand.length) continue;
        const t = pick(cand);
        addRiver(rs, t % 9 <= 2 ? t + 3 : t - 3);
      } else if (theme === 'nakasuji') {
        const cand = [...types].filter((t) => t < 27 && t % 9 >= 3 && t % 9 <= 5);
        if (!cand.length) continue;
        const t = pick(cand);
        addRiver(rs, t - 3); addRiver(rs, t + 3);
      } else if (theme === 'kabe') {
        const cand = [...types].filter((t) => t < 27 && t % 9 >= 1 && t % 9 <= 7);
        if (!cand.length) continue;
        const t = pick(cand);
        const K = Math.random() < 0.5 ? t + 1 : t - 1;
        if (K < 0 || Math.floor(K / 9) !== Math.floor(t / 9)) continue;
        if (types.has(K)) continue;
        for (let i = 0; i < 4; i++) addRiver(i % 2 ? others[0] : others[1], K);
      } else if (theme === 'honor') {
        const hs = [...types].filter((t) => t >= 27);
        if (!hs.length) continue;
        const h = pick(hs);
        for (let i = 0; i < 2; i++) addRiver(pick(others), h);
      }
      if (!ok) continue;
      for (let s = 1; s <= 3; s++) {
        const extra = (s === rs ? L : L - rnd(2)) - rivers[s].length;
        for (let i = 0; i < extra; i++) {
          const x = randTile(pool, 0.75);
          if (!x) continue;
          // 手牌と同じ種類は河に入れすぎない(テーマが壊れるため)
          if (types.has(x.t) && theme !== 'mix' && Math.random() < 0.9) { pool.used.delete(x.id); continue; }
          rivers[s].push(x);
        }
        MJ.shuffle(rivers[s]);
      }
      const g = mock({ hand, doraInd: [dora], rivers, riichiIdx: { [rs]: rivers[rs].length - 1 - rnd(2) }, chars: MJ.shuffle(MJ.CHARS.slice()).slice(0, 4), dealer: rnd(4) });
      const an = A.analyze(g, g.players[0], { know: 2 });
      if (!an.opps.length) continue;
      const rank = A.bySafety(an.evals);
      const safest = rank[0];
      const danger = an.evals.filter((e) => e.danger.score >= 12).length;
      if (safest.danger.score > 8 || danger < 2 || an.evals.length < 6 || safest.danger.tag === '全見え') continue;
      if (!THEMES[theme].tag(safest.danger.tag)) continue;
      if (theme !== 'genbutsu' && theme !== 'mix' && an.evals.some((e) => e.danger.tag === '現物')) continue;
      const opp = g.players[rs];
      return {
        cat: 'def', kind: 'tile', theme, title: `どれを切る?(守備: ${THEMES[theme].name})`, hand, g, an, rank, rs,
        sit: sitHTML(g, `<b>${opp.name}</b>がリーチ中`), prompt: `${opp.name}がリーチしました。あなたは<b>オリ(守備)</b>を選びます。<b>いちばん安全な牌</b>を1枚切ってください。`,
        grade(tile) {
          const e = an.evals.find((x) => x.t === tile.t);
          const min = safest.danger.score;
          const okk = e.danger.score <= min + 1.2;
          const near = !okk && e.danger.score <= min + 5;
          const list = rank.slice(0, 4).map((x, i) => `<li>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''}${ic(x.t)} ${tn(x.t)} … <b>${x.danger.tag}</b>(危険度 約${Math.round(x.danger.score)}%)${x.t === tile.t ? ' ←あなたの選択' : ''}</li>`).join('');
          const help = MJ.Coach.TAG_HELP[safest.danger.tag] || MJ.Coach.TAG_HELP[(safest.danger.tag || '').replace(/\(.*\)/, '')] || '';
          return {
            r: okk ? 'ok' : near ? 'near' : 'ng',
            html: `<p>いちばん安全なのは <b>${ic(safest.t)} ${tn(safest.t)}</b>(${safest.danger.tag})。</p><div class="cc-s">${safest.danger.why}</div><ul class="cc-ul">${list}</ul><p>あなたが選んだ ${ic(tile.t)} は <b>${e.danger.tag}</b>(約${Math.round(e.danger.score)}%)。${e.danger.why}</p>${help ? `<div class="cc cc-help"><div class="cc-b">${help}</div></div>` : ''}`,
          };
        },
      };
    }
    return null;
  }

  /* ====================================================================
     3) 鳴き判断
     ==================================================================== */
  function genCall() {
    for (let tries = 0; tries < 500; tries++) {
      const pool = new Pool();
      const dora = randTile(pool, 1);
      const dealer = rnd(4);
      let hand = makeHand(pool, { replace: 1 + rnd(2), honorP: 0.15, tiles: 14 });
      if (!hand) continue;
      hand.splice(rnd(hand.length), 1); // 13枚
      sortTiles(hand);
      const g = mock({ hand, doraInd: [dora], dealer, chars: MJ.shuffle(MJ.CHARS.slice()).slice(0, 4) });
      const me = g.players[0];
      const c = MJ.toCounts(hand);
      // 出された牌を決める(ポン/チーができる牌を優先)
      const cand = [];
      for (let t = 0; t < 34; t++) {
        if (pool.left(t) === 0) continue;
        const opts = callOptions(c, t);
        if (opts.length) cand.push({ t, opts });
      }
      if (!cand.length) continue;
      const cd = pick(cand);
      const offered = pool.take(cd.t);
      const evs = cd.opts.map((o) => ({ o, ev: A.callEval(g, me, o.kind, cd.t, o.use) }));
      const good = evs.filter((x) => x.ev.yaku.ok && x.ev.after < x.ev.before && x.ev.before > 0);
      const passOk = good.length === 0;
      const front = good.length ? 'call' : 'pass';
      // 問題の偏りを避ける: 半分は見送りが正解になるように
      if (front === 'call' && Math.random() < 0.15) continue;
      const labels = evs.map((x, i) => ({ id: 'c' + i, label: x.o.kind === 'pon' ? `ポン(${ic(cd.t)}${ic(cd.t)}+${ic(cd.t)})` : `チー(${ic(x.o.use[0])}${ic(x.o.use[1])}+${ic(cd.t)})`, x }));
      labels.push({ id: 'pass', label: '見送り(鳴かない)' });
      const fromName = pick(['上家(左)', '対面', '下家(右)']);
      const canChi = fromName === '上家(左)';
      const shown = labels.filter((l) => l.id === 'pass' || l.x.o.kind === 'pon' || canChi);
      if (shown.length < 2) continue;
      const goodIds = new Set(good.filter((x) => shown.some((l) => l.x === x)).map((x) => labels.find((l) => l.x === x).id));
      if (!goodIds.size && !passOk) continue;
      if (passOk) goodIds.add('pass');
      return {
        cat: 'call', kind: 'choice', title: '鳴く?見送る?', hand, g, melds: [],
        sit: sitHTML(g, `${fromName}が ${ic(cd.t)} を捨てました`), prompt: `手牌は13枚です。<b>${tn(cd.t)}</b>を鳴きますか?`,
        options: shown.map((l) => ({ id: l.id, html: l.label })),
        grade(id) {
          const lines = evs.map((x) => `<li>${x.o.kind === 'pon' ? 'ポン' : 'チー'}: シャンテン ${x.ev.before}→<b>${x.ev.after}</b> / ${x.ev.yaku.ok ? `<span class="good">${x.ev.yaku.why}</span>` : `<span class="bad">${x.ev.yaku.why}</span>`}${x.ev.menzen ? ' / 門前を崩す' : ''}</li>`).join('');
          const r = goodIds.has(id) ? 'ok' : 'ng';
          const rec = passOk ? '<b>見送り</b>がおすすめ(鳴いても役がない/手が進まない/テンパイ済み)。' : '<b>鳴いてOK</b>(役が確定し、手が1歩進む)。';
          return { r, html: `<p>${rec}</p><ul class="cc-ul">${lines}</ul><div class="cc-s">鳴きの基本: <b>役がつくこと</b>と<b>手が進むこと</b>の両方が必要。役なしの鳴きは禁物。門前でテンパイしているなら、基本は鳴きません。</div>` };
        },
      };
    }
    return null;
  }
  function callOptions(c, t) {
    const o = [];
    if (c[t] >= 2) o.push({ kind: 'pon' });
    if (t < 27) {
      const n = t % 9;
      const has = (u) => u >= 0 && Math.floor(u / 9) === Math.floor(t / 9) && c[u] > 0;
      if (n >= 2 && has(t - 2) && has(t - 1)) o.push({ kind: 'chi', use: [t - 2, t - 1] });
      if (n >= 1 && n <= 7 && has(t - 1) && has(t + 1)) o.push({ kind: 'chi', use: [t - 1, t + 1] });
      if (n <= 6 && has(t + 1) && has(t + 2)) o.push({ kind: 'chi', use: [t + 1, t + 2] });
    }
    return o;
  }

  /* ====================================================================
     4) 役づくり (狙える役)
     ==================================================================== */
  const YAKU_INFO = {
    tanyao: ['タンヤオ', '2〜8の数牌だけで作る役(1飜)。鳴いてもOKなので初心者向き。1・9・字牌を切っていけば成立します。'],
    chiitoi: ['七対子', '対子を7組そろえる役(2飜・25符)。対子が5組以上あれば狙い目。同じ牌4枚は1組にしか数えません。'],
    honitsu: ['混一色', '1つの色の数牌+字牌だけで作る役(門前3飜/鳴き2飜)。字牌のポンで進めやすい。'],
    yakuhai: ['役牌', '白・發・中(や場風・自風)の刻子で1飜。対子があれば、出たらポンで役が確定します。'],
    pinfu: ['平和(ピンフ)', '門前で、順子4つ+役のつかない雀頭+両面待ち(1飜)。字牌や刻子がない手はピンフ向き。'],
    toitoi: ['対々和', '刻子(同じ牌3枚)を4つそろえる役(2飜)。対子が多い手でポンしながら狙えます。'],
    ittsu: ['一気通貫', '同じ色で123・456・789の順子をそろえる役(門前2飜/鳴き1飜)。'],
    sanshoku: ['三色同順', '萬子・筒子・索子で同じ数字の順子(例:234)をそろえる役(門前2飜/鳴き1飜)。'],
  };
  function genYaku() {
    const kinds = Object.keys(YAKU_INFO);
    for (let tries = 0; tries < 300; tries++) {
      const k = pick(kinds);
      const pool = new Pool();
      let ts = [];
      const S = MJ.shuffle([0, 1, 2]);
      const s0 = S[0], s1 = S[1];
      if (k === 'tanyao') {
        for (let i = 0; i < 4; i++) ts.push(...(Math.random() < 0.75 ? shun(pick(S), 1 + rnd(5)) : koutsu(pick(S) * 9 + 1 + rnd(7))));
        const pt = pick(S) * 9 + 1 + rnd(7); ts.push(pt, pt);
        ts.splice(rnd(ts.length), 1);
        ts.splice(rnd(ts.length), 1, Math.random() < 0.5 ? pick(S) * 9 + (Math.random() < 0.5 ? 0 : 8) : 27 + rnd(7));
      } else if (k === 'chiitoi') {
        const used = new Set();
        const np = 5 + rnd(2);
        while (used.size < np) used.add(Math.random() < 0.8 ? pick(S) * 9 + rnd(9) : 27 + rnd(7));
        used.forEach((t) => ts.push(t, t));
        while (ts.length < 13) ts.push(rnd(27));
        ts = ts.slice(0, 13);
      } else if (k === 'honitsu') {
        for (let i = 0; i < 3; i++) ts.push(...(Math.random() < 0.6 ? shun(s0, rnd(7)) : koutsu(s0 * 9 + rnd(9))));
        ts.push(...koutsu(27 + rnd(7)));
        const ph = 27 + rnd(7); ts.push(ph);
        ts.splice(rnd(ts.length), 1);
        if (Math.random() < 0.5) ts.splice(rnd(ts.length), 1, s1 * 9 + rnd(9));
      } else if (k === 'yakuhai') {
        const d = 31 + rnd(3);
        ts.push(d, d);
        for (let i = 0; i < 3; i++) ts.push(...randSet([s0, s1], 0));
        ts.push(s0 * 9 + rnd(9), s1 * 9 + rnd(9), rnd(27));
        ts = ts.slice(0, 13);
      } else if (k === 'pinfu') {
        for (let i = 0; i < 4; i++) ts.push(...shun(pick(S), rnd(7)));
        const pt = pick(S) * 9 + 1 + rnd(7); ts.push(pt, pt);
        // 両面待ちになるように、1枚抜く(順子の端)
        const idx = ts.findIndex((t, i) => i % 3 === 0 && i < 12 && t % 9 >= 1 && t % 9 <= 5);
        if (idx < 0) continue;
        ts.splice(idx, 1);
      } else if (k === 'toitoi') {
        for (let i = 0; i < 3; i++) ts.push(...koutsu(Math.random() < 0.25 ? 27 + rnd(7) : pick(S) * 9 + rnd(9)));
        const a = pick(S) * 9 + rnd(9), b = pick(S) * 9 + rnd(9);
        ts.push(a, a, b, b);
      } else if (k === 'ittsu') {
        const s = s0;
        ts.push(...shun(s, 0), ...shun(s, 3), s * 9 + 6, s * 9 + 7);
        ts.push(...randSet([s1], 0));
        const pt = s1 * 9 + rnd(9); ts.push(pt, pt);
        ts = ts.slice(0, 13);
      } else if (k === 'sanshoku') {
        const r = 1 + rnd(5);
        ts.push(...shun(0, r), ...shun(1, r), shun(2, r)[0], shun(2, r)[1]);
        ts.push(...randSet([0, 1, 2], 0));
        const pt = rnd(27); ts.push(pt, pt);
        ts = ts.slice(0, 13);
      }
      if (ts.length !== 13) { if (ts.length === 14) ts.splice(rnd(14), 1); else continue; }
      const hand = pool.takeMany(ts);
      if (!hand) continue;
      sortTiles(hand);
      const names = Object.keys(YAKU_INFO).filter((x) => x !== k);
      const opts = MJ.shuffle([k].concat(MJ.shuffle(names).slice(0, 3)));
      return {
        cat: 'yaku', kind: 'choice', title: 'どの役を狙う?', hand, g: mock({ hand, doraInd: [pool.take(rnd(27))], chars: [] }),
        sit: '13枚の手牌(まだテンパイしていません)。', prompt: 'この手牌で<b>いちばん狙いやすい役</b>はどれですか?',
        options: opts.map((x) => ({ id: x, html: YAKU_INFO[x][0] })),
        grade(id) {
          return { r: id === k ? 'ok' : 'ng', html: `<p>正解は <b>${YAKU_INFO[k][0]}</b>。</p><div class="cc"><div class="cc-b">${YAKU_INFO[k][1]}</div></div>${id !== k ? `<p>あなたの答え「${YAKU_INFO[id][0]}」: ${YAKU_INFO[id][1]}</p>` : ''}` };
        },
      };
    }
    return null;
  }

  /* ====================================================================
     5) 待ち当て
     ==================================================================== */
  function genWait() {
    for (let tries = 0; tries < 400; tries++) {
      const pool = new Pool();
      const c = randomComplete({ honorP: 0.05, honorPair: 0.1 });
      const ts = flat(c);
      const cnt = new Array(34).fill(0);
      ts.forEach((t) => cnt[t]++);
      if (cnt.some((n) => n > 4)) continue;
      ts.splice(rnd(14), 1);
      const hand = pool.takeMany(ts);
      if (!hand) continue;
      sortTiles(hand);
      const counts = MJ.toCounts(hand);
      const ws = MJ.waits(counts.slice(), 0);
      if (!ws.length || ws.length > 3) continue;
      // 選択肢: 正解 + それらしい誤り
      const cands = new Map();
      const key = (a) => a.slice().sort((x, y) => x - y).join(',');
      cands.set(key(ws), ws);
      const near = (t, d) => (t < 27 && Math.floor((t + d) / 9) === Math.floor(t / 9) && t + d >= 0 ? t + d : null);
      for (let i = 0; i < 40 && cands.size < 4; i++) {
        let w = ws.slice();
        const m = rnd(3);
        if (m === 0) w = w.map((t) => near(t, pick([-1, 1, 3, -3])) ?? t);
        else if (m === 1) w = w.concat([pick(hand).t]);
        else w = w.slice(0, Math.max(1, w.length - 1)).concat([near(ws[0], pick([1, 2, -1, -2])) ?? ws[0]]);
        w = [...new Set(w)];
        if (!w.length || key(w) === key(ws)) continue;
        cands.set(key(w), w);
      }
      if (cands.size < 3) continue;
      const opts = MJ.shuffle([...cands.entries()]).slice(0, 4);
      if (!opts.some(([k]) => k === key(ws))) continue;
      const left = ws.reduce((a, w) => a + Math.max(0, 4 - counts[w]), 0);
      return {
        cat: 'wait', kind: 'choice', title: 'テンパイ! 待ちはどれ?', hand, g: mock({ hand, doraInd: [pool.take(rnd(27))] }),
        sit: '13枚の手牌はテンパイしています(あと1枚で上がり)。', prompt: '<b>上がり牌(待ち)</b>はどれですか?',
        options: opts.map(([k, w]) => ({ id: k, html: typesIcons(w) })),
        grade(id) {
          const okk = id === key(ws);
          return { r: okk ? 'ok' : 'ng', html: `<p>待ちは ${typesIcons(ws)}(自分の手の中に${ws.length === 1 ? '1種類' : ws.length + '種類'}、場に最大${left}枚)。</p><div class="cc-s">待ちの数え方: ①4面子1雀頭のうち「足りない1枚」を探す ②両面(23→1・4)・カンチャン(13→2)・ペンチャン(12→3)・シャンポン(同じ牌2組→どちらか)・単騎(1枚→同じ牌)。待ちは<b>多いほど上がりやすい</b>。</div>` };
        },
      };
    }
    return null;
  }

  /* ====================================================================
     6) 点数計算
     ==================================================================== */
  const c100 = (x) => Math.ceil(x / 100) * 100;
  function payText(basic, dealer, tsumo) {
    const p = MJ.payments({ basic }, dealer, tsumo, 0);
    if (!tsumo) return `${p.ron.toLocaleString('ja-JP')}点`;
    if (dealer) return `${p.each.toLocaleString('ja-JP')}点オール`;
    return `${p.fromOther.toLocaleString('ja-JP')}・${p.fromDealer.toLocaleString('ja-JP')}点`;
  }
  function genScore(kindWanted) {
    for (let tries = 0; tries < 800; tries++) {
      const pool = new Pool();
      const dealer = Math.random() < 0.3;
      const seatWind = dealer ? 0 : 1 + rnd(3);
      const nOpen = Math.random() < 0.7 ? 0 : 1 + rnd(2);
      const c = randomComplete({ honorP: 0.18, honorPair: 0.25 });
      const melds = [];
      let concealed = [];
      let bad = false;
      c.sets.forEach((s, i) => {
        if (i < nOpen) {
          const isShun = s[0] !== s[1];
          const tiles = pool.takeMany(s);
          if (!tiles) { bad = true; return; }
          melds.push({ kind: isShun ? 'chi' : 'pon', t: Math.min(...s), tiles });
        } else concealed.push(...s);
      });
      if (bad) continue;
      concealed.push(c.pair, c.pair);
      const winType = concealed[rnd(concealed.length)];
      const tsumo = Math.random() < 0.5;
      const menzen = nOpen === 0;
      const riichi = menzen && Math.random() < 0.6;
      const ind = pool.take(rnd(34));
      if (!ind) continue;
      const tiles = pool.takeMany(concealed);
      if (!tiles) continue;
      sortTiles(tiles);
      const ctx = { counts: MJ.toCounts(tiles), melds, winTile: winType, tsumo, riichi, ippatsu: false, roundWind: 0, seatWind, dora: [MJ.doraOf(ind.t)], ura: [], aka: 0 };
      const res = MJ.evaluate(ctx);
      if (!res || res.yakuman || res.han > 4 || res.han < 1) continue;
      const winObj = tiles.find((t) => t.t === winType);
      const rest = tiles.filter((t) => t !== winObj);
      const qk = kindWanted || pick(['han', 'fu', 'points']);
      const winInfo = { res, tsumo, pay: MJ.payments(res, dealer, tsumo, 0), honba: 0, winner: { seat: dealer ? 0 : 1 } };
      const sit = `<span class="chip dealer">東1局</span> ${dealer ? '親' : '子'}(${WINDS[seatWind]}家)の${tsumo ? '<b>ツモ</b>' : '<b>ロン</b>'}上がり${riichi ? '・<b>リーチ</b>あり' : ''}${melds.length ? `・<b>鳴き${melds.length}回</b>` : '・門前'}　ドラ表示牌 ${ic(ind.t)}　場風: 東`;
      const base = { cat: 'score', kind: 'choice', hand: rest, win: winObj, melds, g: mock({ hand: rest, doraInd: [ind], melds }), sit };
      const exp = `<ol class="expl-list">${MJ.Coach.explainScore(winInfo, { dealer: 0 }).map((l) => `<li>${l}</li>`).join('')}</ol>`;
      if (qk === 'han') {
        const ans = res.han;
        let opts = [...new Set([ans - 1, ans, ans + 1, ans + 2].filter((x) => x >= 1))].slice(0, 4);
        while (opts.length < 4) opts.push(Math.max(...opts) + 1);
        opts = MJ.shuffle(opts);
        return Object.assign(base, { title: '何飜?', prompt: '役とドラを数えて、<b>合計の飜数</b>を答えてください。(リーチ・ツモ・タンヤオ・役牌・ドラなど)', options: opts.map((x) => ({ id: String(x), html: `${x}飜` })),
          grade(id) { return { r: +id === ans ? 'ok' : 'ng', html: `<p>正解は <b>${ans}飜</b>。</p>${exp}` }; } });
      }
      if (qk === 'fu') {
        if (res.kind === 'chiitoi') continue;
        const ans = res.fu;
        const pool2 = [20, 25, 30, 40, 50, 60, 70];
        let opts = [ans];
        pool2.forEach((x) => { if (x !== ans && opts.length < 4 && Math.abs(x - ans) <= 20) opts.push(x); });
        opts = MJ.shuffle([...new Set(opts)]);
        if (opts.length < 3) continue;
        return Object.assign(base, { title: '何符?', prompt: `この手の<b>符</b>はいくつ? (飜数は${res.han}飜です。副底20符+門前ロン10+ツモ2+刻子・待ち・雀頭、を足して10符単位で切り上げ)`, options: opts.map((x) => ({ id: String(x), html: `${x}符` })),
          grade(id) { return { r: +id === ans ? 'ok' : 'ng', html: `<p>正解は <b>${ans}符</b>。</p>${exp}` }; } });
      }
      const ansB = res.basic;
      const ansT = payText(ansB, dealer, tsumo);
      const alt = new Set([ansT]);
      const tryAlt = (h, f) => { if (h >= 1 && f >= 20) alt.add(payText(MJ.basicPoints(h, f), dealer, tsumo)); };
      tryAlt(res.han + 1, res.fu); tryAlt(res.han - 1, res.fu); tryAlt(res.han, res.fu + 10); tryAlt(res.han, Math.max(20, res.fu - 10)); tryAlt(res.han + 1, res.fu + 10);
      const opts = MJ.shuffle([...alt].slice(0, 4));
      if (opts.length < 3 || !opts.includes(ansT)) continue;
      return Object.assign(base, { title: '点数はいくつ?', prompt: `この手は <b>${res.han}飜${res.fu}符</b> です。${dealer ? '親' : '子'}の${tsumo ? 'ツモ' : 'ロン'}の<b>点数</b>は?(基本点=符×2<sup>飜+2</sup>)`, options: opts.map((x) => ({ id: x, html: x })),
        grade(id) { return { r: id === ansT ? 'ok' : 'ng', html: `<p>正解は <b>${ansT}</b>。</p>${exp}` }; } });
    }
    return null;
  }

  /* ====================================================================
     7) 押すか引くか (リーチ者に対する押し引き)
     ==================================================================== */
  const PUSH_LABEL = { push: '押す(攻める)', mawashi: '回し打ち', fold: 'オリる' };
  const r100 = (x) => Math.round(x / 100) * 100;
  function genPush() {
    const target = pick(['push', 'mawashi', 'fold']);
    for (let tries = 0; tries < 700; tries++) {
      const pool = new Pool();
      const rs = 1 + rnd(3);
      const dora = randTile(pool, 1);
      const hand = makeHand(pool, { replace: rnd(4), honorP: 0.08 });
      if (!hand) continue;
      const rivers = [[], [], [], []];
      for (let s = 1; s <= 3; s++) rivers[s] = randRiver(pool, (s === rs ? 9 : 8) + rnd(5));
      const dealer = rnd(4);
      const g = mock({ hand, doraInd: [dora], rivers, riichiIdx: { [rs]: rivers[rs].length - 1 - rnd(2) }, chars: MJ.shuffle(MJ.CHARS.slice()).slice(0, 4), dealer });
      const an = A.analyze(g, g.players[0], { know: 2 });
      if (!an.opps.length || an.minSh < 0 || an.minSh > 3) continue;
      const push = A.byEff(an.evals.filter((e) => e.sh === an.minSh))[0];
      const fold = A.bySafety(an.evals)[0];
      const sh = an.minSh;
      const dng = push.danger.score;
      // 和了率の目安
      let left = 0;
      let value = 0, valueTxt = '';
      const doraN = hand.filter((h) => h.red).length + hand.filter((h) => g.doraInd.some((d) => MJ.doraOf(d.t) === h.t)).length;
      const oppDealer = rs === dealer;
      const meDealer = dealer === 0;
      if (sh === 0) {
        const c = an.c.slice(); c[push.t]--;
        const info = A.tenpaiValue(g, g.players[0], c, 0, true);
        if (!info || !info.best) continue;
        left = info.left;
        const r = info.best.res;
        value = meDealer ? c100(r.basic * 6) : c100(r.basic * 4);
        valueTxt = `リーチした場合 ${r.han}飜${r.fu}符 = <b>約${value}点</b>`;
      } else {
        left = push.ukeire.n;
        const han = 1 + doraN;
        const b = MJ.basicPoints(han, 30);
        value = meDealer ? c100(b * 6) : c100(b * 4);
        valueTxt = `役+ドラ${doraN}枚で約${han}飜 → 目安 <b>約${value}点</b>`;
      }
      const win = sh === 0 ? Math.min(70, left * 5.5) : sh === 1 ? Math.min(35, left * 0.9) : sh === 2 ? Math.min(15, left * 0.3) : 3;
      const risk = sh === 0 ? 1.2 : sh === 1 ? 2.2 : 3.2;
      const lossBase = oppDealer ? 7700 : 5200;
      const loss = (dng / 100) * lossBase * risk;
      const ev = (win / 100) * value - loss;
      const ans = ev > 400 ? 'push' : ev > -250 ? 'mawashi' : 'fold';
      if (tries < 500 && ans !== target) continue;
      const shTxt = ['テンパイ(聴牌)', '1シャンテン', '2シャンテン', '3シャンテン'][sh];
      const opp = g.players[rs];
      const oppWind = ['東', '南', '西', '北'][g.seatWindOf(opp)];
      const info = `<ul class="cc-ul"><li>あなたの手: <b>${shTxt}</b>(${sh === 0 ? '待ち残り' : '有効牌'} <b>${left}枚</b>)</li><li>${valueTxt}${oppDealer ? '' : ''}</li><li>押す場合に切る牌 ${ic(push.t)} ${tn(push.t)}: <b>${push.danger.tag}</b>(放銃率 約${Math.round(dng)}%)</li></ul>`;
      return {
        cat: 'push', kind: 'choice', title: '押す? 引く?(押し引き)', hand, g, an, rs,
        sit: sitHTML(g, `<b>${opp.name}</b>(${oppWind}家${oppDealer ? '・親' : ''})がリーチ中`),
        prompt: `あなたは14枚の手牌です。${opp.name}のリーチに対して、<b>押す・回し打ち・オリる</b>のどれにしますか?<br><span class="cc-s">${PUSH_LABEL.push}=手を進める牌を切って勝負 / ${PUSH_LABEL.mawashi}=安全寄りに受けつつ進める / ${PUSH_LABEL.fold}=手を崩して安全牌だけ切る</span>`,
        options: ['push', 'mawashi', 'fold'].map((id) => ({ id, html: PUSH_LABEL[id] })),
        grade(id) {
          const okk = id === ans;
          const adj = (id === 'mawashi' || ans === 'mawashi');
          const why = {
            push: `期待値がプラス(約${r100(ev)}点)。待ちが良く(または点が高く)、放銃の危険に見合うので<b>押し</b>ます。`,
            mawashi: `期待値は±0付近(約${r100(ev)}点)。無理に突っ込まず、<b>危険度の低い牌</b>を選びつつ手を進める「回し打ち」が無難です。`,
            fold: `期待値がマイナス(約${r100(ev)}点)。放銃すると大きな失点になるので、<b>${ic(fold.t)} ${tn(fold.t)}</b>(${fold.danger.tag})など安全牌でオリるのが得です。`,
          }[ans];
          return {
            r: okk ? 'ok' : adj ? 'near' : 'ng',
            html: `<p>おすすめは <b>${PUSH_LABEL[ans]}</b>。</p><p>${why}</p>${info}<div class="cc-s">計算の目安: 和了率 約${Math.round(win)}% × 打点 − 放銃率 約${Math.round(dng)}% × 失点${lossBase}点${oppDealer ? '(相手が親なので高め)' : ''} × 先の危険補正${risk} ≒ <b>${r100(ev)}点</b>。この数字はあくまで目安で、点差・局面(順位や残り局)でも判断は変わります。</div><div class="cc cc-help"><div class="cc-b"><b>押し引きの目安</b>: ①テンパイなら基本は押す(特に高打点・良い待ち) ②1シャンテンは「安全な牌で進められるか」 ③2シャンテン以上や安い手は基本オリ ④相手が親ならより慎重に。</div></div>`,
          };
        },
      };
    }
    return null;
  }

  /* ====================================================================
     8) リーチか ダマか
     ==================================================================== */
  function genRiichi() {
    const target = pick(['riichi', 'dama']);
    for (let tries = 0; tries < 800; tries++) {
      const pool = new Pool();
      const c = randomComplete({ honorP: 0.12, honorPair: 0.2 });
      const ts = flat(c);
      const cnt = new Array(34).fill(0);
      ts.forEach((t) => cnt[t]++);
      if (cnt.some((n) => n > 4)) continue;
      ts.splice(rnd(14), 1);
      const hand = pool.takeMany(ts);
      if (!hand) continue;
      sortTiles(hand);
      const counts = MJ.toCounts(hand);
      const ws = MJ.waits(counts.slice(), 0);
      if (!ws.length || ws.length > 3) continue;
      const dora = randTile(pool, 1);
      const dealer = rnd(4);
      const rivers = [[], randRiver(pool, 4 + rnd(4)), randRiver(pool, 4 + rnd(4)), randRiver(pool, 4 + rnd(4))];
      const aka = hand.filter((h) => h.red).length;
      const rows = ws.map((w) => {
        const cc = counts.slice(); cc[w]++;
        const res = MJ.evaluate({ counts: cc, melds: [], winTile: w, tsumo: false, riichi: false, ippatsu: false, roundWind: 0, seatWind: (0 - dealer + 4) % 4, dora: [MJ.doraOf(dora.t)], ura: [], aka });
        return { w, res, left: pool.left(w) };
      });
      const left = rows.reduce((a, r) => a + r.left, 0);
      if (left === 0) continue;
      const noYaku = rows.some((r) => !r.res);
      const hanD = noYaku ? 0 : Math.min(...rows.map((r) => r.res.han));
      let ans, why;
      if (noYaku) { ans = 'riichi'; why = 'ダマだと<b>役がなく、上がれない待ち</b>があります。リーチをかけて「リーチ」という役をつけましょう。'; }
      else if (hanD >= 3) { ans = 'dama'; why = `ダマでもすでに<b>${hanD}飜</b>以上あり、打点は十分。リーチすると警戒されて出上がりが減るので、<b>ダマ(ヤミテン)</b>がおすすめです。`; }
      else if (hanD === 2) {
        if (left >= 5) { ans = 'dama'; why = `ダマで<b>${hanD}飜</b>、待ちも${left}枚と多い。出上がりしやすいので<b>ダマ</b>で十分です。`; }
        else { ans = 'riichi'; why = `ダマで${hanD}飜ですが待ちが${left}枚と少なめ。出上がりに期待しにくいので、<b>リーチ</b>でツモ・裏ドラ・一発の上乗せを狙います。`; }
      } else { ans = 'riichi'; why = `ダマだと<b>${hanD}飜</b>で安い。リーチをかけると+1飜(裏ドラ・一発も)で、手が大きく伸びます。<b>リーチ</b>が基本です。`; }
      if (tries < 600 && ans !== target) continue;
      const g = mock({ hand, doraInd: [dora], rivers, dealer, chars: MJ.shuffle(MJ.CHARS.slice()).slice(0, 4) });
      const tbl = rows.map((r) => `<li>${ic(r.w)} (あと${r.left}枚): ${r.res ? r.res.yaku.filter((y) => !y.dora).map((y) => y.n).join('・') + (r.res.yaku.some((y) => y.dora) ? '+ドラ' : '') + ` = <b>${r.res.han}飜${r.res.fu}符</b>` : '<span class="bad">役なし(ダマだと上がれない)</span>'}</li>`).join('');
      return {
        cat: 'riichi', kind: 'choice', title: 'リーチ? ダマ?', hand, g,
        sit: sitHTML(g, '全員ノーリーチ・あなたはテンパイ'), prompt: `13枚で<b>門前テンパイ</b>しました。<b>リーチ</b>をかけますか? それとも黙って(<b>ダマ・ヤミテン</b>)上がりを待ちますか?<br><span class="cc-s">待ち: ${typesIcons(ws)}(場にあと${left}枚)</span>`,
        options: [{ id: 'riichi', html: 'リーチ' }, { id: 'dama', html: 'ダマ(ヤミテン)' }],
        grade(id) {
          const okk = id === ans;
          return {
            r: okk ? 'ok' : (hanD === 2 ? 'near' : 'ng'),
            html: `<p>おすすめは <b>${ans === 'riichi' ? 'リーチ' : 'ダマ'}</b>。</p><p>${why}</p><ul class="cc-ul">${tbl}</ul><div class="cc cc-help"><div class="cc-b"><b>目安</b>: 役なし→リーチ ／ ダマで3飜以上→ダマ ／ 2飜は待ちの枚数しだい(5枚以上ならダマ) ／ 1飜→リーチ。リーチは打点が上がる代わりに、<b>手が固定され、他家に警戒され、1,000点を供託</b>します。実戦では点差や形(愚形かどうか)でも変わる目安です。</div></div>`,
          };
        },
      };
    }
    return null;
  }

  /* ---------- カテゴリ一覧 ---------- */
  MJ.DRILLS = [
    { id: 'eff', icon: '✂️', name: '何を切る?(牌効率)', level: '入門', desc: '14枚の手牌から、テンパイに近づく牌を選びます。有効牌の数と、切る順番の基本が身につきます。', gen: genEff },
    { id: 'yaku', icon: '🎯', name: '狙える役はどれ?', level: '入門', desc: 'タンヤオ・七対子・混一色・役牌・ピンフ・対々和・一気通貫・三色。手牌の形から役を見つけます。', gen: genYaku },
    { id: 'def', icon: '🛡', name: '安全牌を選ぼう(守備)', level: '入門〜中級', desc: 'リーチ者がいる場面で、現物・スジ・中スジ・カベ・字牌の見え枚数を使って、いちばん安全な牌を選びます。', gen: () => genDef() },
    { id: 'call', icon: '🔔', name: '鳴く?見送る?', level: '入門〜中級', desc: 'ポン・チーできる場面で、役がつくか・手が進むかを見て、鳴くか見送るかを判断します。', gen: genCall },
    { id: 'wait', icon: '👀', name: '待ちを当てよう', level: '入門', desc: 'テンパイ形から上がり牌(待ち)を探します。両面・カンチャン・シャンポンなど待ちの形が分かります。', gen: genWait },
    { id: 'score', icon: '🧮', name: '点数計算ドリル', level: '入門〜中級', desc: '飜数・符・点数を、ランダムな上がり形で練習。答え合わせで計算のしくみが一手ずつ分かります。', gen: () => genScore() },
    { id: 'push', icon: '⚖️', name: '押すか引くか', level: '中級', desc: '相手がリーチ。自分の手の進み具合・打点・危険度を比べて「押す・回し打ち・オリる」を判断します。', gen: genPush },
    { id: 'riichi', icon: '🔥', name: 'リーチかダマか', level: '中級', desc: 'テンパイしたとき、リーチをかけるか黙って待つか。役・打点・待ちの枚数から判断します。', gen: genRiichi },
  ];
  MJ.DRILL_THEMES = THEMES;
  MJ.Drill = { Pool, mock, genEff, genDef, genCall, genYaku, genWait, genScore, genPush, genRiichi };
})(typeof window !== 'undefined' ? window : globalThis);
