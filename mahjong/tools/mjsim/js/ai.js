/* CPUの思考 + 牌効率/危険度の分析 (コーチ機能と共用) */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const A = (MJ.AI = {});

  /* ---- 見えている牌 ---- */
  A.visible = (game, p) => {
    const v = new Array(34).fill(0);
    for (const t of p.hand) v[t.t]++;
    for (const q of game.players) {
      for (const d of q.discards) if (!d.called) v[d.tile.t]++;
      for (const m of q.melds) for (const t of m.tiles) v[t.t]++;
    }
    for (const i of game.doraInd) v[i.t]++;
    return v;
  };

  /* opp に対して絶対安全な牌種 (現物 + リーチ後に通った牌) */
  A.safeSet = (game, opp) => {
    const s = new Set(opp.discardTypes);
    if (opp.riichi) for (const d of game.discardLog) if (d.seq > opp.riichiSeq) s.add(d.tile.t);
    return s;
  };

  const isYakuhaiFor = (game, p, t) => t >= 31 || t === 27 + game.seatWindOf(p) || t === 27 + game.roundWind;
  A.isYakuhaiFor = isYakuhaiFor;

  /* ---- 危険度 (おおよその放銃率%) ---- */
  A.danger1 = function (game, vis, t, opp, safe, know = 2) {
    const tn = MJ.tileName(t);
    if (safe.has(t))
      return { score: 0, tag: '現物', cls: 'safe', why: `${tn}は${opp.name}が捨てた牌(またはリーチ後に通った牌)。${opp.name}は同じ牌ではロンできない(フリテン)ので100%安全。` };
    const left = 4 - vis[t];
    // 字牌は両面などの待ちがなく、シャンポン・単騎は「同じ牌を持っている」ことが必要。4枚見えていれば誰も持っていない=当たらない。
    // 数牌は、4枚見えていても順子の待ち(両面・カンチャンなど)には当たる(シャンポン・単騎だけが消える)ので、安全とは言えない。
    if (left <= 0 && t >= 27) return { score: 0, tag: '全見え', cls: 'safe', why: `${tn}は4枚全て見えているので、誰も持っていません。当たりません。` };
    if (t >= 27) {
      let sc = (left >= 2 ? 3.0 : 1.0) * 1.6;
      const yh = isYakuhaiFor(game, opp, t);
      if (yh && left >= 2) sc *= 1.5;
      const tag = left === 1 ? '字牌(残1)' : '字牌';
      const why =
        left === 1
          ? `${tn}は残り1枚。相手が持っていてもタンキ待ち(単騎)だけなので比較的安全。`
          : `${tn}は場に${vis[t]}枚見えている。字牌は両面待ちがなくシャンポン・タンキだけなので、数牌の真ん中よりは安全。${yh ? '(ただし' + opp.name + 'の役牌なので少し注意)' : ''}`;
      return { score: sc, tag, cls: sc < 4 ? 'safe' : sc < 8 ? 'ok' : 'warn', why };
    }
    const n = t % 9;
    let total = 0, ryCount = 0, sujiEx = 0, kabeEx = 0, one = false;
    const why = [];
    // A: 相手が t+1,t+2 を持ち t を待つ (n<=5: 両面 / n==6: 辺張)
    if (n <= 6) {
      const ry = n <= 5;
      let w = ry ? 4.0 : 1.5;
      if (ry) ryCount++;
      if (ry && know >= 2 && safe.has(t + 3)) { sujiEx++; w = 0; why.push(`${MJ.tileName(t + 3)}が現物なので、${tn}は(${MJ.tileName(t + 1)}${MJ.tileName(t + 2)}の)両面待ちでは当たらない=スジ`); }
      else if (know >= 2 && (vis[t + 1] >= 4 || vis[t + 2] >= 4)) { if (ry) kabeEx++; w = 0; why.push(`${MJ.tileName(vis[t + 1] >= 4 ? t + 1 : t + 2)}が4枚見えている(カベ)ので、その形での待ちは作れない`); }
      else if (know >= 2 && (vis[t + 1] >= 3 || vis[t + 2] >= 3)) { w *= 0.4; one = true; }
      total += w;
    }
    // B: 相手が t-2,t-1 を持ち t を待つ
    if (n >= 2) {
      const ry = n >= 3;
      let w = ry ? 4.0 : 1.5;
      if (ry) ryCount++;
      if (ry && know >= 2 && safe.has(t - 3)) { sujiEx++; w = 0; why.push(`${MJ.tileName(t - 3)}が現物なので、${tn}は(${MJ.tileName(t - 2)}${MJ.tileName(t - 1)}の)両面待ちでは当たらない=スジ`); }
      else if (know >= 2 && (vis[t - 1] >= 4 || vis[t - 2] >= 4)) { if (ry) kabeEx++; w = 0; why.push(`${MJ.tileName(vis[t - 1] >= 4 ? t - 1 : t - 2)}が4枚見えている(カベ)ので、その形での待ちは作れない`); }
      else if (know >= 2 && (vis[t - 1] >= 3 || vis[t - 2] >= 3)) { w *= 0.4; one = true; }
      total += w;
    }
    // C: カンチャン
    if (n >= 1 && n <= 7) {
      let w = 1.8;
      if (know >= 2 && (vis[t - 1] >= 4 || vis[t + 1] >= 4)) w = 0;
      else if (know >= 2 && (vis[t - 1] >= 3 || vis[t + 1] >= 3)) w *= 0.5;
      total += w;
    }
    // D: シャンポン/タンキ
    total += left >= 2 ? 2.0 : left === 1 ? 1.0 : 0; // 4枚見えている数牌は、シャンポン・単騎(同じ牌を持つ待ち)だけが消える
    let sc = total * 1.6;
    let dora = false;
    for (const d of game.doraInd) if (MJ.doraOf(d.t) === t) dora = true;
    if (dora) { sc *= 1.25; }
    let tag;
    if (sujiEx && sujiEx === ryCount && kabeEx === 0) tag = 'スジ';
    else if (sujiEx && sujiEx + kabeEx >= ryCount) tag = 'スジ・カベ';
    else if (sujiEx) tag = '半スジ';
    else if (kabeEx && kabeEx >= ryCount) tag = 'カベ';
    else if (kabeEx) tag = 'カベ(片側)';
    else if (one) tag = 'ワンチャンス';
    else tag = left <= 0 ? '4枚見え(無スジ)' : n === 0 || n === 8 ? '端牌(無スジ)' : '無スジ';
    if (left <= 0) why.push(`${tn}は4枚とも見えていますが、順子の待ち(両面・カンチャン)には当たります。安全牌ではありません`);
    if (one) why.push('隣の牌が3枚見えている(ワンチャンス)ので、その形の待ちは作りにくい');
    if (dora) why.push('ドラは相手が持っている/待っている可能性が高く特に危険');
    if (!why.length) why.push(`${tn}は手がかりのない牌。${n >= 2 && n <= 6 ? '真ん中の牌は両面待ちに当たりやすく危険' : '端に近い牌は両面待ちに当たりにくい'}。`);
    return { score: sc, tag, cls: sc < 4 ? 'safe' : sc < 8 ? 'ok' : sc < 13 ? 'warn' : 'danger', why: why.join(' / ') };
  };

  /* ---- 受け入れ ---- */
  const shMemo = new Map();
  const shanC = (c, f) => {
    if (typeof globalThis.__shanten === 'function') return MJ.shanten(c, f); // C言語で計算できるときは、記憶表を使うより速い
    const k = f + ':' + c.join('');
    let v = shMemo.get(k);
    if (v === undefined) { v = MJ.shanten(c, f); if (shMemo.size > (MJ.MEMO_CAP || 120000)) shMemo.clear(); shMemo.set(k, v); }
    return v;
  };
  A.shanC = shanC;
  function ukeireOf(c, f, curSh, vis) {
    let n = 0;
    const tiles = [];
    let kokuKinds = 0;
    for (const y of [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]) if (c[y]) kokuKinds++;
    for (let t = 0; t < 34; t++) {
      const left = 4 - vis[t];
      if (left <= 0) continue;
      let rel = c[t] > 0 || (MJ.isYaochu(t) && kokuKinds >= 7);
      if (!rel && t < 27) {
        const r = t % 9;
        for (let d = -2; d <= 2; d++) {
          if (!d || r + d < 0 || r + d > 8) continue;
          if (c[t + d] > 0) { rel = true; break; }
        }
      }
      if (!rel) continue;
      c[t]++;
      if (shanC(c, f) < curSh) { n += left; tiles.push(t); }
      c[t]--;
    }
    return { n, tiles };
  }
  A.ukeireOf = ukeireOf;

  /* 2手先まで読んだ「受け入れの見込み」: 有効牌を引いた後に、最も良い打牌をしたときの受け入れ枚数を、引ける枚数で重みづけした平均。
     (1手先の受け入れ枚数だけでは分からない「形の良さ」を数値にする) */
  A.eff2 = function (c13, f, curSh, vis, ukeire, deadline) {
    if (curSh <= 0 || !ukeire.tiles.length) return ukeire.n;
    let sum = 0, wt = 0;
    for (const t of ukeire.tiles) {
      if (deadline && Date.now() > deadline) return null; // 時間切れ(読みきれない候補は、ほかの候補の比率で見積もる)
      const left = 4 - vis[t];
      if (left <= 0) continue;
      c13[t]++;
      let best = 0;
      for (let x = 0; x < 34; x++) {
        if (!c13[x]) continue;
        c13[x]--;
        if (shanC(c13, f) === curSh - 1) {
          const u = curSh - 1 === 0
            ? MJ.waits(c13, f).reduce((a, w) => a + Math.max(0, 4 - vis[w] - (w === t || w === x ? 0 : 0)), 0)
            : ukeireOf(c13, f, curSh - 1, vis).n;
          if (u > best) best = u;
        }
        c13[x]++;
      }
      c13[t]--;
      sum += left * best; wt += left;
    }
    return wt ? sum / wt : ukeire.n;
  };

  const pickTile = (hand, t) => {
    const l = hand.filter((h) => h.t === t);
    return l.find((h) => !h.red) || l[0];
  };

  /* 手の方向(役を見据えた、牌の取捨): 一色に寄っているなら、ほかの色を切る。么九牌が少ないなら、タンヤオに向けて端・字牌を切る */
  A.planAdj = function (game, p, t, c) {
    let v = 0;
    const suit = [0, 0, 0]; let hon = 0, yao = 0, yh = 0;
    for (let i = 0; i < 27; i++) { suit[(i / 9) | 0] += c[i]; if (MJ.isYaochu(i)) yao += c[i]; }
    for (let i = 27; i < 34; i++) { hon += c[i]; yao += c[i]; if (c[i] >= 2 && isYakuhaiFor(game, p, i)) yh++; }
    for (const m of p.melds) { if (m.t >= 27) hon += 3; else suit[(m.t / 9) | 0] += 3; }
    const total = suit[0] + suit[1] + suit[2] + hon;
    const top = Math.max(suit[0], suit[1], suit[2]);
    if (total >= 10 && top + hon >= total - 3 && top >= 5) { // 混一色・清一色に寄っている
      const ts = suit.indexOf(top);
      if (t < 27 && ((t / 9) | 0) !== ts) v += 3; else v -= 1;
    } else if (!yh && yao <= 3 && MJ.RULES.kuitan !== false) { // タンヤオに近い
      if (MJ.isYaochu(t)) v += 2.5; else v -= 0.5;
    }
    return v;
  };

  /* 手の価値による打牌補正 (大きいほど切りたい) */
  A.valueAdj = function (game, p, t, c) {
    let v = 0;
    for (const d of game.doraInd) if (MJ.doraOf(d.t) === t) v -= 6;
    if (c[t] >= 2 && isYakuhaiFor(game, p, t)) v -= 5;
    if (c[t] === 1 && t >= 27 && t < 31 && t === 27 + game.seatWindOf(p) && t === 27 + game.roundWind) v -= 2; // 連風牌(場風と自風が同じ)は2飜なので特に残す
    if (t >= 27 && c[t] === 1 && !isYakuhaiFor(game, p, t)) v += 2;
    if (t >= 27 && c[t] === 1 && isYakuhaiFor(game, p, t)) v -= 1;
    if (MJ.isTerminal(t) && c[t] === 1) v += 1.5;
    if (p.hand.some((h) => h.t === t && h.red)) v -= 2;
    v += A.planAdj(game, p, t, c);
    return v;
  };


  /* 鳴いている手が、この待ちで上がったとき、役があるか(ロン)。リーチはできない手なので、役がなければ上がれない */
  A.waitHasYaku = function (game, p, c, w) {
    try {
      const counts = c.slice(); counts[w]++;
      const r = MJ.evaluate({ counts, melds: p.melds, winTile: w, tsumo: false, riichi: false, ippatsu: false, roundWind: game.roundWind, seatWind: game.seatWindOf(p), haitei: false, houtei: false, flowers: 0, rinshan: false, dora: [], ura: [], aka: 0 });
      return !!r;
    } catch (e) { return true; }
  };
  /* 鳴いている手に、役がつく見込みがあるか(役牌の刻子・対子 / タンヤオ / 一色手)。c=手牌(捨てたあと) */
  A.yakuPath = function (game, p, c) {
    for (const m of p.melds) if (m.kind !== 'chi' && isYakuhaiFor(game, p, m.t)) return true; // 役牌の鳴き
    for (let t = 27; t < 34; t++) if (c[t] >= 2 && isYakuhaiFor(game, p, t)) return true; // 役牌の対子・刻子
    if (MJ.RULES.kuitan !== false) { // タンヤオ: 鳴きに么九がなく、手牌の么九が少ない
      const meldYao = p.melds.some((m) => (m.kind === 'chi' ? m.t % 9 === 0 || m.t % 9 === 6 : MJ.isYaochu(m.t)));
      let yao = 0; for (let t = 0; t < 34; t++) if (MJ.isYaochu(t)) yao += c[t];
      if (!meldYao && yao <= 3) return true;
    }
    const suit = [0, 0, 0]; let hon = 0; // 混一色・清一色
    for (let t = 0; t < 27; t++) suit[(t / 9) | 0] += c[t];
    for (let t = 27; t < 34; t++) hon += c[t];
    for (const m of p.melds) { if (m.t >= 27) hon += 3; else suit[(m.t / 9) | 0] += 3; }
    const total = suit[0] + suit[1] + suit[2] + hon, top = Math.max(suit[0], suit[1], suit[2]);
    if (top + hon >= total - 2) return true;
    return false;
  };

  /* ---- 打牌分析 ---- */
  A.analyze = function (game, p, opt = {}) {
    const f = p.melds.length;
    const c = MJ.toCounts(p.hand);
    const vis = A.visible(game, p);
    const know = opt.know || 2;
    const others = game.players.filter((q) => q !== p);
    const opps = others.filter((q) => q.riichi);
    const safes = opps.map((q) => A.safeSet(game, q));
    const forbid = p.kuikae || [];
    const types = [...new Set(p.hand.map((h) => h.t))].filter((t) => !forbid.includes(t));
    const evals = [];
    for (const t of types) {
      c[t]--;
      evals.push({ t, tile: pickTile(p.hand, t), sh: shanC(c, f), ukeire: { n: 0, tiles: [] } });
      c[t]++;
    }
    let minSh = 99;
    for (const e of evals) if (e.sh < minSh) minSh = e.sh;
    for (const e of evals) {
      if (e.sh === minSh) {
        c[e.t]--; e.ukeire = ukeireOf(c, f, e.sh, vis);
        if (e.sh === 0) { // テンパイになる切り方: フリテン(自分が捨てた牌が待ち)と、待ちの枚数も見る
          const ws = MJ.waits(c, f);
          e.waits = ws; e.wl = ws.reduce((a, w) => a + Math.max(0, 4 - vis[w] - (w === e.t ? 1 : 0)), 0);
          e.furiten = ws.length > 0 && ws.some((w) => p.discardTypes.has(w) || w === e.t);
        }
        c[e.t]++;
      }
    }
    // 鳴いている手: 役がない形になる切り方(役なしテンパイ・役の見込みがない形)は、上がれないので、おすすめにしない
    if (f > 0 && p.melds.some((m) => m.kind !== 'ankan')) {
      for (const e of evals) {
        c[e.t]--;
        if (e.sh === 0 && e.waits) e.noYaku = !e.waits.some((w) => A.waitHasYaku(game, p, c, w));
        else e.noYakuPath = !A.yakuPath(game, p, c);
        c[e.t]++;
      }
    }
    // 2手先の読み(上位の候補だけ): 受け入れ枚数が同程度でも、形の良い方を選べるようにする
    if (opt.deep && minSh > 0) {
      const top = evals.filter((e) => e.sh === minSh).sort((a, b) => b.ukeire.n - a.ukeire.n).slice(0, opt.deepN || 6);
      let r = 0, rn = 0;
      const deadline = Date.now() + (opt.budget || 250) * (MJ.AI_BUDGET || 1); // (非力な機械では、考える時間の上限を縮める)
      for (const e of top) {
        c[e.t]--; const v = A.eff2(c, f, e.sh, vis, e.ukeire, deadline); c[e.t]++;
        if (v !== null) { e.eff2 = v; if (e.ukeire.n) { r += v / e.ukeire.n; rn++; } }
      }
      const ratio = rn ? r / rn : 1;
      for (const e of evals) if (e.sh === minSh && e.eff2 === undefined) e.eff2 = e.ukeire.n * ratio * 0.9;
    }
    for (const e of evals) {
      e.adj = A.valueAdj(game, p, e.t, c);
      e.genCount = others.filter((q) => q.discardTypes.has(e.t) || A.safeSet(game, q).has(e.t)).length;
      if (opps.length) {
        const per = opps.map((q, i) => A.danger1(game, vis, e.t, q, safes[i], know));
        let worst = per[0], sum = 0;
        for (const d of per) { sum += d.score; if (d.score > worst.score) worst = d; }
        e.dangerBy = per;
        e.danger = { score: sum, tag: worst.tag, cls: sum < 4 ? 'safe' : sum < 8 ? 'ok' : sum < 13 ? 'warn' : 'danger', why: per.map((d, i) => (per.length > 1 ? `【${opps[i].name}】` : '') + d.why).join(' ') };
      } else e.danger = null;
    }
    return { f, c, vis, evals, minSh, opps, others };
  };
  A.effScore = (e) => (e.noYaku ? -130 : 0) + (e.noYakuPath ? -35 : 0) + (e.furiten ? -45 : 0) + -e.sh * 100 + (e.eff2 !== undefined ? (e.ukeire.n + e.eff2) * 0.75 : e.ukeire.n) * 1.5 + e.adj; // adj: 大きいほど「切りたい牌」(ドラ・役牌の対子は負=残したい)
  A.byEff = (evals) => evals.slice().sort((a, b) => A.effScore(b) - A.effScore(a));
  A.bySafety = (evals) => evals.slice().sort((a, b) => (a.danger ? a.danger.score : 0) - (b.danger ? b.danger.score : 0) || A.effScore(b) - A.effScore(a));

  /* ---- 鳴き後に役があるか ---- */
  A.hasYakuAfterCall = function (game, p, newMeld, c2) {
    const melds = p.melds.concat([newMeld]);
    for (const m of melds) {
      if (m.kind !== 'chi' && isYakuhaiFor(game, p, m.t)) return { ok: true, why: `役牌(${MJ.tileName(m.t)})のポンで役が確定` };
    }
    let yao = 0;
    for (let t = 0; t < 34; t++) if (MJ.isYaochu(t)) yao += c2[t];
    const meldYao = melds.some((m) => (m.kind === 'chi' ? m.t % 9 === 0 || m.t % 9 === 6 : MJ.isYaochu(m.t)));
    if (!meldYao && yao <= 1 && MJ.RULES.kuitan) return { ok: true, why: 'タンヤオ(断么九)で役になる形' };
    // 混一色/清一色
    const suitCnt = [0, 0, 0], hon = [];
    for (let t = 0; t < 27; t++) suitCnt[(t / 9) | 0] += c2[t];
    let honors = 0;
    for (let t = 27; t < 34; t++) honors += c2[t];
    for (const m of melds) { if (m.t >= 27) honors += 3; else suitCnt[(m.t / 9) | 0] += 3; }
    const total = suitCnt[0] + suitCnt[1] + suitCnt[2] + honors;
    const top = Math.max(...suitCnt);
    if (top + honors >= total - 1) return { ok: true, why: '一色手(混一色)で役になる形' };
    return { ok: false, why: '鳴いても役がありません(役なし=上がれない)' };
  };

  /* 鳴きの効果を評価 */
  A.callEval = function (game, p, kind, t, use) {
    const f = p.melds.length;
    const c = MJ.toCounts(p.hand);
    const before = MJ.shanten(c, f);
    const c2 = c.slice();
    let newMeld;
    if (kind === 'pon') { c2[t] -= 2; newMeld = { kind: 'pon', t }; }
    else if (kind === 'kan') { c2[t] -= 3; newMeld = { kind: 'minkan', t }; }
    else { c2[use[0]]--; c2[use[1]]--; newMeld = { kind: 'chi', t: Math.min(use[0], use[1], t) }; }
    const after = MJ.shanten(c2, f + 1);
    const yk = A.hasYakuAfterCall(game, p, newMeld, c2);
    const plan = A.callPlan(game, p, kind, t, use, c2, newMeld, before);
    return { before, after, yaku: yk, menzen: p.melds.every((m) => m.kind === 'ankan'), plan };
  };

  /* 鳴いたあとに切る牌まで読む: いちばん進む切り方(フリテンは避ける)と、そのときの役・待ちの枚数を返す。
     食い替え(鳴いた牌・同じ形の牌をすぐ切ること)は禁止なので候補から外す */
  A.callPlan = function (game, p, kind, t, use, c2, newMeld, before) {
    const f1 = p.melds.length + 1;
    const vis = A.visible ? A.visible(game, p) : null;
    const left = (w) => Math.max(0, 4 - (vis ? vis[w] : 0));
    const forbid = new Set([t]);
    if (kind === 'chi') {
      const lo = Math.min(use[0], use[1], t), hi = Math.max(use[0], use[1], t);
      if (t === lo && lo % 9 <= 5) forbid.add(lo + 3);
      if (t === hi && hi % 9 >= 3) forbid.add(hi - 3);
    }
    let best = null;
    for (let d = 0; d < 34; d++) {
      if (!c2[d] || forbid.has(d)) continue;
      const c3 = c2.slice(); c3[d]--;
      const sh = MJ.shanten(c3, f1);
      let waits = [], furiten = false, wl = 0;
      if (sh === 0) {
        waits = MJ.waits(c3, f1);
        furiten = waits.length > 0 && waits.some((w) => p.discardTypes.has(w) || w === d);
        wl = waits.reduce((s, w) => s + left(w), 0);
      } else if (sh > 0) {
        for (let w = 0; w < 34; w++) { if (c3[w] >= 4) continue; c3[w]++; if (MJ.shanten(c3, f1) < sh) wl += left(w); c3[w]--; }
      }
      const yk = A.yakuStrict(game, p, newMeld, c3);
      const rec = { d, sh, waits, furiten, wl, yaku: yk };
      const score = -sh * 100 + (furiten ? -60 : 0) + (yk.level === 'sure' ? 20 : yk.level === 'maybe' ? 0 : -50) + wl;
      rec.score = score;
      if (!best || score > best.score) best = rec;
    }
    return best;
  };
  /* 鳴いて切ったあとの手で、役が成立するか(sure=確実 / maybe=あと1枚で成立 / none=ない) */
  A.yakuStrict = function (game, p, newMeld, c3) {
    const melds = p.melds.concat([newMeld]);
    for (const m of melds) if (m.kind !== 'chi' && isYakuhaiFor(game, p, m.t)) return { level: 'sure', why: `役牌(${MJ.tileName(m.t)})のポンで役あり` };
    for (let t = 27; t < 34; t++) if (c3[t] >= 3 && isYakuhaiFor(game, p, t)) return { level: 'sure', why: '役牌の刻子で役あり' };
    let yao = 0;
    for (let t = 0; t < 34; t++) if (MJ.isYaochu(t)) yao += c3[t];
    const meldYao = melds.some((m) => (m.kind === 'chi' ? m.t % 9 === 0 || m.t % 9 === 6 : MJ.isYaochu(m.t)));
    if (MJ.RULES.kuitan && !meldYao) {
      if (yao === 0) return { level: 'sure', why: 'タンヤオで役あり' };
      if (yao <= 2) return { level: 'maybe', why: `么九牌があと${yao}枚。切ればタンヤオ` };
    }
    const suitCnt = [0, 0, 0]; let honors = 0;
    for (let t = 0; t < 27; t++) suitCnt[(t / 9) | 0] += c3[t];
    for (let t = 27; t < 34; t++) honors += c3[t];
    for (const m of melds) { if (m.t >= 27) honors += 3; else suitCnt[(m.t / 9) | 0] += 3; }
    const total = suitCnt[0] + suitCnt[1] + suitCnt[2] + honors;
    const top = Math.max(...suitCnt);
    if (top + honors >= total) return { level: 'sure', why: honors && top ? '混一色で役あり' : '清一色で役あり' };
    return { level: 'none', why: '鳴くと役がありません' };
  };

  /* ---- 先読みの下ごしらえ(裏で少しずつ): 自分の番が終わったあと、次に引く牌ごとの「シャンテン・受け入れ」を、あらかじめ計算しておく。
     山の牌は見ない(引く牌が何でもよいように、全部の牌について計算)。1回に数ミリ秒ずつ、画面の動きを止めないように進める ---- */
  const warmJobs = new Map();
  A.prewarm = function (game, p) {
    if (!game || !p || game.fast || game.stopped || typeof setTimeout === 'undefined') return;
    const old = warmJobs.get(p); if (old) { old.stop = true; }
    const c = MJ.toCounts(p.hand);
    let n13 = 0; for (let i = 0; i < 34; i++) n13 += c[i];
    if (n13 % 3 !== 1) return; // 13枚(捨てたあと)のときだけ
    const f = p.melds.length, vis = A.visible(game, p);
    const draws = [];
    for (let t = 0; t < 34; t++) if (vis[t] < 4) draws.push(t);
    const base = shanC(c, f);
    // 有効牌・近くの牌を先に
    const near = (t) => (c[t] > 0 ? 0 : t < 27 && [-2, -1, 1, 2].some((d) => (t % 9) + d >= 0 && (t % 9) + d <= 8 && c[t + d] > 0) ? 1 : 2);
    draws.sort((a, b) => near(a) - near(b));
    const job = { stop: false, i: 0 };
    warmJobs.set(p, job);
    const step = () => {
      if (job.stop || game.stopped || MJ.paused) { if (warmJobs.get(p) === job && !job.stop && MJ.paused) setTimeout(step, 400); return; }
      const t0 = Date.now();
      while (job.i < draws.length && Date.now() - t0 < 6) {
        const t = draws[job.i++];
        c[t]++;
        let mn = 99; const cand = [];
        for (let x = 0; x < 34; x++) { if (!c[x]) continue; c[x]--; const s2 = shanC(c, f); if (s2 < mn) { mn = s2; cand.length = 0; } if (s2 === mn) cand.push(x); c[x]++; }
        if (mn > 0) for (const x of cand.slice(0, 6)) { c[x]--; ukeireOf(c, f, mn, vis); c[x]++; }
        c[t]--;
      }
      if (job.i < draws.length) setTimeout(step, 8); else warmJobs.delete(p);
    };
    setTimeout(step, 30);
  };

  /* ---- リーチを受けたときの構え: 押す(攻める) / 半押し(役を残して危険の少ない牌を選ぶ) / 回す(安全に降りる) ---- */
  /* 構え(push/mid/fold)に合う牌を選ぶ */
  A.stancePick = function (kind, ev) {
    const dn = (e) => (e.danger ? e.danger.score : 0);
    if (kind === 'push') return ev.slice().sort((a, b) => (A.effScore(b) - dn(b) * 0.6) - (A.effScore(a) - dn(a) * 0.6))[0];
    if (kind === 'mid') {
      const okc = ev.filter((e) => dn(e) < 8);
      return (okc.length ? okc : ev).slice().sort((a, b) => (A.effScore(b) - dn(b) * 4) - (A.effScore(a) - dn(a) * 4))[0];
    }
    return ev.slice().sort((a, b) => (-dn(b) * 10 - b.sh * 3 + b.ukeire.n * 0.2) - (-dn(a) * 10 - a.sh * 3 + a.ukeire.n * 0.2))[0];
  };
  A.stance0 = function (game, p, an) {
    const opps = an.opps, minSh = an.minSh;
    if (!opps.length) return null;
    let dora = 0;
    const doraT = game.doraInd.map((d) => MJ.doraOf(d.t));
    for (const h of p.hand) if (doraT.includes(h.t) || h.red) dora++;
    for (const m of p.melds) for (const h of m.tiles) if (doraT.includes(h.t) || h.red) dora++;
    let yaku = p.melds.some((m) => m.kind !== 'chi' && isYakuhaiFor(game, p, m.t));
    for (let t = 27; t < 34; t++) if (an.c[t] >= 2 && isYakuhaiFor(game, p, t)) yaku = true;
    const dealerRiichi = opps.some((q) => q.seat === game.dealer);
    const bestN = Math.max(0, ...an.evals.filter((e) => e.sh === minSh).map((e) => e.ukeire.n));
    const iAmDealer = p.seat === game.dealer;
    let kind, why;
    if (minSh === 0) {
      const wl = Math.max(0, ...an.evals.filter((e) => e.sh === 0 && !e.furiten).map((e) => e.wl || 0));
      if (wl >= 2) { kind = 'push'; why = `テンパイしています(待ち${wl}枚)。危ない牌でも、押して勝負しましょう。`; }
      else { kind = 'mid'; why = 'テンパイですが待ちが少ないので、危険の少ない牌で様子を見ましょう。'; }
    } else if (minSh === 1) {
      if (opps.length === 1 && (dora >= 2 || yaku || (iAmDealer && dora >= 1)) && bestN >= 6) { kind = 'push'; why = `あと1歩で、${dora >= 2 ? 'ドラが多く' : yaku ? '役があり' : '親番でドラがあり'}手が高くなりそう。押しましょう。`; }
      else if (opps.length >= 2 || dealerRiichi) { kind = dora >= 3 ? 'mid' : 'fold'; why = dora >= 3 ? 'ドラが多いので、安全な牌を選びながら、手を残しましょう。' : `${dealerRiichi ? '親のリーチ' : 'リーチが複数'}です。無理をせず、回しましょう。`; }
      else { kind = 'mid'; why = '手は悪くありません。役を残しながら、危険の少ない牌(スジ・字牌)を切りましょう。'; }
    } else if (minSh === 2) {
      if (opps.length === 1 && (dora >= 2 || yaku) && !dealerRiichi) { kind = 'mid'; why = '手は少し遠いですが、役・ドラがあります。危険の少ない牌で、様子を見ましょう。'; }
      else { kind = 'fold'; why = '手が遠いので、安全な牌で回しましょう。'; }
    } else { kind = 'fold'; why = '手が遠いので、安全な牌で降りましょう。'; }
    const pick = A.stancePick(kind, an.evals);
    return { kind, why, pick, label: kind === 'push' ? '押す' : kind === 'mid' ? '半押し' : '回す(降り)' };
  };


  /* 順位・点差・残り枚数(押し引きの材料) */
  A.rankInfo = function (game, p) {
    const sc = game.players.map((q) => q.score), me = p.score;
    const order = game.players.map((q, i) => i).sort((x, y) => sc[y] - sc[x] || x - y);
    const rank = order.indexOf(p.seat) + 1;
    const third = sc[order[2]], second = sc[order[1]], top = sc[order[0]], last = sc[order[3]];
    return { rank, gap3: rank === 4 ? third - me : 0, leadOver2: rank === 1 ? me - second : 0, behindTop: top - me, live: game.live.length, oras: game.isOras ? game.isOras() : false };
  };
  const KI = { fold: 0, mid: 1, push: 2 }, KN = ['fold', 'mid', 'push'], KL = ['回す(降り)', '半押し', '押す'];
  /* 先生のタイプ(defense=守備 / balance=バランス / attack=攻撃)と、順位・残り枚数を考えた「押し引き」。リーチ者がいないときは null */
  A.stance = function (game, p, an, type) {
    const base = A.stance0(game, p, an);
    if (!base || !type || p.coachNoType) return base;
    const R = A.rankInfo(game, p);
    if (p.coachNoRank) { R.rank = 2; R.live = 99; } // (測定用)順位・残り枚数を考えない
    let k = KI[base.kind], why = base.why;
    const notes = [];
    if (type === 'attack' && an.minSh <= 2 && R.rank >= 2) { k += 1; notes.push('攻める型なので、前に出ます。'); }
    if (type === 'defense' && !(an.minSh === 0) && R.rank !== 4) { k -= 1; notes.push('守る型なので、安全を優先します。'); }
    if (R.rank === 4 && R.gap3 <= 12000 && an.minSh <= 2) { k += 1; notes.push(`いまは4位です。3位まで${R.gap3.toLocaleString()}点。降りるだけでは3位に上がれません。`); }
    if (R.rank === 4 && R.gap3 > 12000 && an.minSh <= 1) { k += 1; notes.push('4位で点差が大きいので、降りても順位は変わりません。勝負になるところは、前に出ます。'); }
    if (R.rank === 1 && R.leadOver2 >= 8000 && type !== 'attack') { k -= 1; notes.push(`トップで${R.leadOver2.toLocaleString()}点リードしています。守りを重くします。`); }
    if (R.live <= 16 && an.minSh >= 2) { k -= 1; notes.push('山が残り少なく、手が遠いので、降り寄りです。'); }
    if (an.minSh >= 3 && R.live >= 20 && k > 1) k = 1;
    k = Math.max(0, Math.min(2, k));
    const kind = KN[k];
    const pick = kind === base.kind ? base.pick : A.stancePick(kind, an.evals);
    return { kind, why: notes.length ? notes.join('') + (kind === base.kind ? base.why : '') : why, pick, label: KL[k], rank: R.rank, notes };
  };

  /* 麻雀先生の言うとおりに打つプレイヤー(自動対戦で、先生のタイプの強さを測る用)。opt.saki=true: 先制ならリーチ(愚形でも) */
  A.coachSelf = function (game, p, opts, type, opt = {}) {
    if (opts.tsumo) return { act: 'tsumo' };
    const an = A.analyze(game, p, { know: 2, deep: true, deepN: 6, budget: 60 });
    if (!an.evals.length) return { act: 'discard', tile: p.drawn || p.hand[p.hand.length - 1] };
    const stc = an.opps.length ? A.stance(game, p, an, type) : null;
    let pick;
    if (stc && stc.pick) {
      pick = stc.pick;
      if (opts.riichi.includes(pick.t) && stc.kind === 'push' && A.wantRiichi(game, p, pick, an)) return { act: 'riichi', tile: pick.tile };
      return { act: 'discard', tile: pick.tile };
    }
    pick = A.byEff(an.evals)[0];
    const sorted = A.byEff(an.evals);
    const rp = sorted.find((e) => opts.riichi.includes(e.t));
    if (rp && rp.sh === 0) {
      if (opt.saki ? (rp.wl > 0) : A.wantRiichi(game, p, rp, an)) return { act: 'riichi', tile: rp.tile };
    }
    return { act: 'discard', tile: pick.tile };
  };

  /* ================= CPU 行動決定 ================= */
  A.chooseSelf = function (game, p, opts) {
    if (opts.tsumo) return { act: 'tsumo' };
    const lv = p.char.ai || p.char.level, st = p.char.style;
    const an = A.analyze(game, p, { know: lv >= 4 ? 2 : 1, deep: lv >= 4, deepN: lv >= 5 ? 6 : 4, budget: lv >= 4 ? 80 : 50 });
    const { evals, minSh, opps } = an;
    if (!evals.length) return { act: 'discard', tile: p.drawn || p.hand[p.hand.length - 1] };

    // 暗槓
    if (opts.ankan.length && lv >= 3 && !opps.length) {
      for (const t of opts.ankan) {
        const c2 = an.c.slice();
        c2[t] -= 4;
        if (MJ.shanten(c2, an.f + 1) <= minSh) return { act: 'ankan', t };
      }
    }

    if (opps.length && lv >= 4 && !(opts.riichi && opts.riichi.length && false)) { // 強いCPUは、押す・半押し・回すを決めて打つ
      const stc = A.stance(game, p, an);
      if (stc && stc.pick) {
        const pk = stc.pick;
        if (opts.riichi.includes(pk.t) && stc.kind === 'push' && A.wantRiichi(game, p, pk, an)) return { act: 'riichi', tile: pk.tile };
        return { act: 'discard', tile: pk.tile };
      }
    }
    let fold = false;
    if (opps.length && lv >= 3) {
      const thr = st === 'defense' ? 1 : st === 'attack' ? 3 : 2;
      if (minSh >= thr) fold = true;
      if (lv >= 4 && minSh === 1 && opps.length >= 2 && st !== 'attack') fold = true;
      if (lv === 3 && Math.random() < 0.2) fold = false;
    }
    const k = lv >= 5 ? 1.6 : lv === 4 ? 1.1 : lv === 3 ? 0.6 : 0;
    const kk = minSh === 0 ? 0.35 : 1;
    const scored = evals.map((e) => {
      const dn = e.danger ? e.danger.score : 0;
      let s;
      if (fold) s = -dn * 10 - e.sh * 3 + e.ukeire.n * 0.2;
      else s = -e.sh * 100 + (e.eff2 !== undefined && lv >= 4 ? (e.ukeire.n + e.eff2) * 0.75 : e.ukeire.n) * (lv === 1 ? 0.3 : 1.5) + (lv >= 2 ? e.adj : 0) - dn * k * kk * 1.5;
      return { e, s };
    });
    scored.sort((a, b) => b.s - a.s);
    let pick = scored[0];
    if (lv === 1 && Math.random() < 0.35) pick = scored[Math.floor(Math.random() * Math.min(4, scored.length))];
    else if (lv === 2 && Math.random() < 0.15) pick = scored[Math.floor(Math.random() * Math.min(3, scored.length))];
    const e = pick.e;

    // リーチ判断
    if (opts.riichi.includes(e.t) && !fold) {
      if (A.wantRiichi(game, p, e, an)) return { act: 'riichi', tile: e.tile };
    }
    return { act: 'discard', tile: e.tile };
  };

  A.wantRiichi = function (game, p, e, an) {
    const lv = p.char.ai || p.char.level;
    // 待ち牌の残り枚数
    const c = an.c.slice();
    c[e.t]--;
    const ws = MJ.waits(c, an.f);
    let left = 0;
    for (const w of ws) left += Math.max(0, 4 - an.vis[w]);
    if (left === 0) return false;
    if (lv <= 2) return true;
    // ダマで十分な高打点か
    const info = A.tenpaiValue(game, p, c, an.f, false);
    if (info && info.best && lv >= 4) {
      const r = info.best.res;
      if (r && (r.han >= 4 || (r.han >= 3 && left >= 6) || (r.han >= 2 && left <= 3 && p.melds.length === 0 && game.players.some((q) => q.riichi)))) return false;
    }
    if (lv === 3 && left <= 1) return false;
    return true;
  };

  /* テンパイ時の待ち別の価値 (c: 13枚) riichiFlag: リーチ前提で評価するか */
  A.tenpaiValue = function (game, p, c, f, riichiFlag, tsumo) {
    const ws = MJ.waits(c, f);
    if (!ws.length) return null;
    const vis = A.visible(game, p);
    const out = [];
    for (const w of ws) {
      const cc = c.slice();
      cc[w]++;
      let aka = 0;
      for (const h of p.hand) if (h.red) aka++;
      for (const m of p.melds) for (const h of m.tiles) if (h.red) aka++;
      const res = MJ.evaluate({
        counts: cc, melds: p.melds, winTile: w, tsumo: !!tsumo,
        riichi: riichiFlag || p.riichi, ippatsu: false,
        roundWind: game.roundWind, seatWind: game.seatWindOf(p),
        dora: game.doraInd.map((d) => MJ.doraOf(d.t)), ura: [], aka,
      });
      out.push({ t: w, left: Math.max(0, 4 - vis[w]), res });
    }
    let best = null;
    for (const o of out) if (o.res && (!best || o.res.score > best.res.score)) best = o;
    let left = 0;
    for (const o of out) left += o.left;
    return { waits: out, best, left, hasYaku: out.some((o) => o.res) };
  };

  /* 鳴き・ロンへの反応 */
  A.chooseReact = function (game, p, opts) {
    if (opts.ron) return { act: 'ron' };
    const lv = p.char.ai || p.char.level, st = p.char.style;
    if (p.riichi || lv < 1) return { act: 'pass' };
    const cands = [];
    if (opts.pon) cands.push({ kind: 'pon' });
    for (const o of opts.chi) cands.push({ kind: 'chi', use: o.use });
    if (!cands.length) return { act: 'pass' };
    const opps = game.players.filter((q) => q !== p && q.riichi);
    let bestC = null, bestScore = -99;
    for (const cd of cands) {
      const ev = A.callEval(game, p, cd.kind, opts.tile.t, cd.use);
      if (ev.before === 0) continue;
      if (opps.length && lv >= 3 && ev.before >= 2) continue;
      if (!ev.yaku.ok) continue;
      if (ev.plan && (ev.plan.furiten || ev.plan.yaku.level === 'none')) continue; // フリテン・役なしになる鳴きはしない
      const yakuhaiPon = cd.kind === 'pon' && isYakuhaiFor(game, p, opts.tile.t);
      const faster = ev.after < ev.before;
      let okay = false;
      if (lv === 1) okay = yakuhaiPon && Math.random() < 0.5;
      else if (lv === 2) okay = (faster || yakuhaiPon) && (cd.kind === 'pon' || ev.yaku.why.startsWith('タンヤオ'));
      else okay = faster || (yakuhaiPon && ev.after <= ev.before);
      if (lv >= 3 && !faster && !yakuhaiPon) okay = false;
      if (st === 'defense' && opps.length && ev.after >= 1) okay = false;
      if (st === 'attack' && lv >= 2 && faster) okay = true;
      if (!okay) continue;
      const sc = (ev.before - ev.after) * 10 + (cd.kind === 'pon' ? 2 : 0);
      if (sc > bestScore) { bestScore = sc; bestC = cd; }
    }
    if (!bestC) return { act: 'pass' };
    return bestC.kind === 'pon' ? { act: 'pon' } : { act: 'chi', use: bestC.use };
  };
})(typeof window !== 'undefined' ? window : globalThis);
