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
      if (MJ.shanten(c, f) < curSh) { n += left; tiles.push(t); }
      c[t]--;
    }
    return { n, tiles };
  }
  A.ukeireOf = ukeireOf;

  const pickTile = (hand, t) => {
    const l = hand.filter((h) => h.t === t);
    return l.find((h) => !h.red) || l[0];
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
    return v;
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
      evals.push({ t, tile: pickTile(p.hand, t), sh: MJ.shanten(c, f), ukeire: { n: 0, tiles: [] } });
      c[t]++;
    }
    let minSh = 99;
    for (const e of evals) if (e.sh < minSh) minSh = e.sh;
    for (const e of evals) {
      if (e.sh === minSh) { c[e.t]--; e.ukeire = ukeireOf(c, f, e.sh, vis); c[e.t]++; }
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
  A.effScore = (e) => -e.sh * 100 + e.ukeire.n * 1.5 + e.adj; // adj: 大きいほど「切りたい牌」(ドラ・役牌の対子は負=残したい)
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
    return { before, after, yaku: yk, menzen: p.melds.every((m) => m.kind === 'ankan') };
  };

  /* ================= CPU 行動決定 ================= */
  A.chooseSelf = function (game, p, opts) {
    if (opts.tsumo) return { act: 'tsumo' };
    const lv = p.char.level, st = p.char.style;
    const an = A.analyze(game, p, { know: lv >= 4 ? 2 : 1 });
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
      else s = -e.sh * 100 + e.ukeire.n * (lv === 1 ? 0.3 : 1.5) + (lv >= 2 ? e.adj : 0) - dn * k * kk * 1.5;
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
    const lv = p.char.level;
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
    const lv = p.char.level, st = p.char.style;
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
