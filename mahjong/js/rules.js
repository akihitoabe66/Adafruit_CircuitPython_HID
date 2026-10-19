/* 麻雀ルール: 向聴数・待ち・役判定・符計算・点数計算 */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const YAO = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

  MJ.toCounts = (tiles) => {
    const c = new Array(34).fill(0);
    for (const t of tiles) c[t.t]++;
    return c;
  };

  /* ---------- 向聴数 ---------- */
  function stdShanten(c, f) {
    let best = 8;
    function rec(i, m, t, j) {
      while (i < 34 && c[i] === 0) i++;
      if (i >= 34) {
        const s = 8 - 2 * m - Math.min(t, 4 - m) - j;
        if (s < best) best = s;
        return;
      }
      const num = i < 27,
        r = i % 9;
      if (c[i] >= 3) { c[i] -= 3; rec(i, m + 1, t, j); c[i] += 3; }
      if (num && r <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
        c[i]--; c[i + 1]--; c[i + 2]--;
        rec(i, m + 1, t, j);
        c[i]++; c[i + 1]++; c[i + 2]++;
      }
      if (c[i] >= 2) {
        if (!j) { c[i] -= 2; rec(i, m, t, 1); c[i] += 2; }
        c[i] -= 2; rec(i, m, t + 1, j); c[i] += 2;
      }
      if (num && r <= 7 && c[i + 1] > 0) { c[i]--; c[i + 1]--; rec(i, m, t + 1, j); c[i]++; c[i + 1]++; }
      if (num && r <= 6 && c[i + 2] > 0) { c[i]--; c[i + 2]--; rec(i, m, t + 1, j); c[i]++; c[i + 2]++; }
      c[i]--; rec(i, m, t, j); c[i]++;
    }
    rec(0, f, 0, 0);
    return best;
  }
  function chiitoiShanten(c) {
    let pairs = 0, kinds = 0;
    for (let i = 0; i < 34; i++) { if (c[i] >= 1) kinds++; if (c[i] >= 2) pairs++; }
    return 6 - pairs + Math.max(0, 7 - kinds);
  }
  function kokushiShanten(c) {
    let k = 0, p = 0;
    for (const y of YAO) { if (c[y] >= 1) k++; if (c[y] >= 2) p = 1; }
    return 13 - k - p;
  }
  /* c: 門前内の牌枚数(34), f: 副露数 */
  MJ.shanten = (c, f = 0) => {
    let s = stdShanten(c, f);
    if (f === 0) s = Math.min(s, chiitoiShanten(c), kokushiShanten(c));
    return s;
  };
  MJ.shantenDetail = (c, f = 0) => ({
    std: stdShanten(c, f),
    chiitoi: f === 0 ? chiitoiShanten(c) : 99,
    kokushi: f === 0 ? kokushiShanten(c) : 99,
  });
  MJ.isAgari = (c, f = 0) => MJ.shanten(c, f) === -1;
  /* 13枚(3n+1)の待ち牌種 */
  MJ.waits = (c, f = 0) => {
    const res = [];
    for (let t = 0; t < 34; t++) {
      if (c[t] >= 4) continue;
      c[t]++;
      if (MJ.shanten(c, f) === -1) res.push(t);
      c[t]--;
    }
    return res;
  };

  /* ---------- 面子分解 ---------- */
  MJ.decompose = (c) => {
    const res = [], cc = c.slice();
    function rec(i, sets, pair) {
      while (i < 34 && cc[i] === 0) i++;
      if (i >= 34) { if (pair !== null) res.push({ pair, sets: sets.slice() }); return; }
      if (cc[i] >= 3) { cc[i] -= 3; sets.push({ k: 'k', t: i }); rec(i, sets, pair); sets.pop(); cc[i] += 3; }
      if (i < 27 && i % 9 <= 6 && cc[i + 1] > 0 && cc[i + 2] > 0) {
        cc[i]--; cc[i + 1]--; cc[i + 2]--;
        sets.push({ k: 's', t: i }); rec(i, sets, pair); sets.pop();
        cc[i]++; cc[i + 1]++; cc[i + 2]++;
      }
      if (pair === null && cc[i] >= 2) { cc[i] -= 2; rec(i, sets, i); cc[i] += 2; }
    }
    rec(0, [], null);
    return res;
  };

  const isKokushi = (c) => {
    let pair = 0;
    for (let i = 0; i < 34; i++) {
      const y = YAO.includes(i);
      if (!y && c[i] > 0) return false;
      if (y) { if (c[i] === 0) return false; if (c[i] === 2) pair++; else if (c[i] > 2) return false; }
    }
    return pair === 1;
  };
  const isChiitoi = (c) => {
    let p = 0;
    for (let i = 0; i < 34; i++) { if (c[i] === 2) p++; else if (c[i] !== 0) return false; }
    return p === 7;
  };

  /* ---------- 点数 ---------- */
  MJ.basicPoints = (han, fu) => {
    if (han >= 13) return MJ.RULES.kazoe ? 8000 : 6000;
    if (han >= 11) return 6000;
    if (han >= 8) return 4000;
    if (han >= 6) return 3000;
    if (han >= 5) return 2000;
    return Math.min(2000, fu * Math.pow(2, han + 2));
  };
  MJ.limitName = (han, basic, yakuman) => {
    if (yakuman) return yakuman > 1 ? `${yakuman}倍役満` : '役満';
    if (han >= 13) return '数え役満';
    if (han >= 11) return '三倍満';
    if (han >= 8) return '倍満';
    if (han >= 6) return '跳満';
    if (basic >= 2000) return '満貫';
    return '';
  };
  const c100 = (x) => Math.ceil(x / 100) * 100;
  MJ.payments = (res, dealer, tsumo, honba = 0) => {
    const b = res.basic;
    if (!tsumo) return { ron: c100(b * (dealer ? 6 : 4)) + 300 * honba };
    if (dealer) return { each: c100(b * 2) + 100 * honba };
    return { fromDealer: c100(b * 2) + 100 * honba, fromOther: c100(b) + 100 * honba };
  };

  /* ---------- 役判定 ---------- */
  function placements(dec, w) {
    const res = [];
    if (dec.pair === w) res.push({ wait: 'tanki', setIdx: -1 });
    dec.sets.forEach((s, i) => {
      if (s.k === 'k') {
        if (s.t === w) res.push({ wait: 'shanpon', setIdx: i });
      } else {
        if (w < s.t || w > s.t + 2) return;
        const pos = w - s.t;
        let wait;
        if (pos === 1) wait = 'kanchan';
        else if (pos === 0) wait = s.t % 9 === 6 ? 'penchan' : 'ryanmen';
        else wait = s.t % 9 === 0 ? 'penchan' : 'ryanmen';
        res.push({ wait, setIdx: i });
      }
    });
    return res;
  }

  const WAIT_JP = { ryanmen: '両面', kanchan: 'カンチャン', penchan: 'ペンチャン', tanki: '単騎', shanpon: 'シャンポン' };
  MJ.WAIT_JP = WAIT_JP;

  function finalize(ctx, y, ym, fu, fd, all, extra) {
    if (ym.length) {
      const n = ym.length;
      return Object.assign({ yakuman: ym, yaku: ym.map((x) => ({ n: x, h: 13 })), han: 13 * n, fu: 0, fuDetails: [], basic: 8000 * n, limit: MJ.limitName(0, 0, n), score: 100000 * n }, extra);
    }
    let han = y.reduce((a, b) => a + b.h, 0);
    if (han === 0) return null;
    const yaku = y.slice();
    let d = 0;
    for (const t of ctx.dora || []) d += all[t];
    if (d) { yaku.push({ n: 'ドラ', h: d, dora: true }); han += d; }
    if (ctx.riichi && MJ.RULES.ura) {
      let u = 0;
      for (const t of ctx.ura || []) u += all[t];
      if (u) { yaku.push({ n: '裏ドラ', h: u, dora: true }); han += u; }
    }
    if (ctx.aka) { yaku.push({ n: '赤ドラ', h: ctx.aka, dora: true }); han += ctx.aka; }
    const basic = MJ.basicPoints(han, fu);
    return Object.assign({ yakuman: null, yaku, han, fu, fuDetails: fd, basic, limit: MJ.limitName(han, basic, 0), score: basic * 10 + han }, extra);
  }

  /* 共通(役牌・タンヤオ・染め手など) */
  function commonYaku(ctx, all, menzen, y) {
    if (ctx.riichi) y.push({ n: 'リーチ', h: 1 });
    if (ctx.ippatsu && MJ.RULES.ippatsu) y.push({ n: '一発', h: 1 });
    if (ctx.tsumo && menzen) y.push({ n: '門前清自摸和', h: 1 });
    if (ctx.haitei) y.push({ n: '海底摸月', h: 1 });
    if (ctx.houtei) y.push({ n: '河底撈魚', h: 1 });
    if (ctx.rinshan) y.push({ n: '嶺上開花', h: 1 });
    let hasYao = false, onlyYao = true;
    const suits = new Set();
    let honors = 0;
    for (let t = 0; t < 34; t++) {
      if (!all[t]) continue;
      if (MJ.isYaochu(t)) hasYao = true; else onlyYao = false;
      if (t >= 27) honors += all[t]; else suits.add((t / 9) | 0);
    }
    if (!hasYao && (menzen || MJ.RULES.kuitan)) y.push({ n: 'タンヤオ', h: 1 });
    if (suits.size === 1) {
      if (honors) y.push({ n: '混一色', h: menzen ? 3 : 2 });
      else y.push({ n: '清一色', h: menzen ? 6 : 5 });
    }
    return { onlyYao, honors, suits };
  }

  function yakumanCheck(ctx, all, sets, pair, menzen) {
    const ym = [];
    const k = sets.filter((s) => s.k === 'k');
    if ([31, 32, 33].every((d) => k.some((s) => s.t === d))) ym.push('大三元');
    if (k.filter((s) => s.conc).length === 4) ym.push('四暗刻');
    let hon = 0, num = 0;
    for (let t = 0; t < 34; t++) { if (t >= 27) hon += all[t]; else num += all[t]; }
    if (num === 0) ym.push('字一色');
    let nonTerm = 0;
    for (let t = 0; t < 34; t++) if (all[t] && !MJ.isTerminal(t)) nonTerm++;
    if (nonTerm === 0) ym.push('清老頭');
    const green = [19, 20, 21, 23, 25, 32];
    let ok = true;
    for (let t = 0; t < 34; t++) if (all[t] && !green.includes(t)) ok = false;
    if (ok) ym.push('緑一色');
    const windK = k.filter((s) => MJ.isWind(s.t)).length;
    if (windK === 4) ym.push('大四喜');
    else if (windK === 3 && MJ.isWind(pair)) ym.push('小四喜');
    if (sets.filter((s) => s.kan).length === 4) ym.push('四槓子');
    return ym;
  }

  function evalStd(ctx, dec, pl, menzen, all) {
    const sets = dec.sets.map((s, i) => {
      const ronTrip = pl.setIdx === i && s.k === 'k' && !ctx.tsumo;
      return { k: s.k, t: s.t, open: ronTrip, conc: !ronTrip, kan: false };
    });
    for (const m of ctx.melds) sets.push({ k: m.kind === 'chi' ? 's' : 'k', t: m.t, open: m.kind !== 'ankan', conc: m.kind === 'ankan', kan: /kan/.test(m.kind) });
    const pair = dec.pair;

    const ym = yakumanCheck(ctx, all, sets, pair, menzen);
    if (menzen && ctx.melds.length === 0) {
      // 九蓮宝燈
      for (let s = 0; s < 3; s++) {
        let ok = true, tot = 0;
        for (let r = 0; r < 9; r++) { const n = all[s * 9 + r]; tot += n; if (n < (r === 0 || r === 8 ? 3 : 1)) ok = false; }
        if (ok && tot === 14) ym.push('九蓮宝燈');
      }
    }
    if (ym.length) return finalize(ctx, [], ym, 0, [], all, { wait: pl.wait, kind: 'std' });

    const y = [];
    const info = commonYaku(ctx, all, menzen, y);
    const yakuhaiPair = pair >= 31 || pair === 27 + ctx.seatWind || pair === 27 + ctx.roundWind;
    const allShun = sets.every((s) => s.k === 's');
    const pinfu = menzen && allShun && !yakuhaiPair && pl.wait === 'ryanmen';
    if (pinfu) y.push({ n: '平和', h: 1 });

    for (const s of sets) {
      if (s.k !== 'k') continue;
      if (s.t >= 31) y.push({ n: '役牌 ' + MJ.HONOR_CH[s.t - 27], h: 1 });
      if (s.t === 27 + ctx.seatWind) y.push({ n: '自風 ' + MJ.windName(ctx.seatWind), h: 1 });
      if (s.t === 27 + ctx.roundWind) y.push({ n: '場風 ' + MJ.windName(ctx.roundWind), h: 1 });
    }
    if (menzen) {
      const cnt = {};
      for (const s of sets) if (s.k === 's') cnt[s.t] = (cnt[s.t] || 0) + 1;
      let pk = 0;
      for (const t in cnt) pk += Math.floor(cnt[t] / 2);
      if (pk === 1) y.push({ n: '一盃口', h: 1 });
      else if (pk >= 2) y.push({ n: '二盃口', h: 3 });
    }
    const shun = sets.filter((s) => s.k === 's');
    const kou = sets.filter((s) => s.k === 'k');
    for (let r = 0; r < 7; r++) {
      if ([0, 9, 18].every((o) => shun.some((s) => s.t === o + r))) y.push({ n: '三色同順', h: menzen ? 2 : 1 });
    }
    for (let s = 0; s < 3; s++) {
      if ([0, 3, 6].every((o) => shun.some((x) => x.t === s * 9 + o))) y.push({ n: '一気通貫', h: menzen ? 2 : 1 });
    }
    for (let r = 0; r < 9; r++) {
      if ([0, 9, 18].every((o) => kou.some((s) => s.t === o + r))) y.push({ n: '三色同刻', h: 2 });
    }
    if (kou.length === 4) y.push({ n: '対々和', h: 2 });
    if (kou.filter((s) => s.conc).length === 3) y.push({ n: '三暗刻', h: 2 });
    if (sets.filter((s) => s.kan).length === 3) y.push({ n: '三槓子', h: 2 });
    if (kou.filter((s) => s.t >= 31).length === 2 && pair >= 31) y.push({ n: '小三元', h: 2 });
    if (info.onlyYao) y.push({ n: '混老頭', h: 2 });
    else {
      const chanta = sets.every((s) => (s.k === 's' ? s.t % 9 === 0 || s.t % 9 === 6 : MJ.isYaochu(s.t))) && MJ.isYaochu(pair);
      if (chanta && shun.length) {
        if (info.honors === 0) y.push({ n: '純全帯么九', h: menzen ? 3 : 2 });
        else y.push({ n: '混全帯么九', h: menzen ? 2 : 1 });
      }
    }

    // 符
    let fu = 20;
    const fd = [['副底(基本)', 20]];
    if (pinfu) {
      if (!ctx.tsumo) { fu = 30; fd.push(['門前ロン', 10]); }
    } else {
      if (menzen && !ctx.tsumo) { fu += 10; fd.push(['門前ロン', 10]); }
      if (ctx.tsumo) { fu += 2; fd.push(['ツモ', 2]); }
      for (const s of sets) {
        if (s.k !== 'k') continue;
        let v = MJ.isYaochu(s.t) ? 2 : 1;
        if (!s.open) v *= 2;
        if (s.kan) v *= 4;
        v *= 2;
        fu += v;
        fd.push([`${s.open ? '明' : '暗'}${s.kan ? '槓' : '刻'} ${MJ.tileName(s.t)}${MJ.isYaochu(s.t) ? '(么九)' : ''}`, v]);
      }
      if (pair >= 31) { fu += 2; fd.push(['役牌の雀頭 ' + MJ.tileName(pair), 2]); }
      else {
        if (pair === 27 + ctx.seatWind) { fu += 2; fd.push(['自風の雀頭', 2]); }
        if (pair === 27 + ctx.roundWind) { fu += 2; fd.push(['場風の雀頭', 2]); }
      }
      if (pl.wait === 'kanchan' || pl.wait === 'penchan' || pl.wait === 'tanki') { fu += 2; fd.push([WAIT_JP[pl.wait] + '待ち', 2]); }
      if (!menzen && fu === 20) { fu = 30; fd.push(['鳴き手の最低符(20→30)', 10]); }
    }
    const raw = fu;
    fu = Math.ceil(fu / 10) * 10;
    if (fu !== raw) fd.push(['切り上げ', fu - raw]);
    return finalize(ctx, y, [], fu, fd, all, { wait: pl.wait, kind: 'std', pinfu });
  }

  function evalChiitoi(ctx, all) {
    const y = [{ n: '七対子', h: 2 }];
    const info = commonYaku(ctx, all, true, y);
    if (info.onlyYao) y.push({ n: '混老頭', h: 2 });
    const ym = [];
    if (info.suits.size === 0) ym.push('字一色');
    if (ym.length) return finalize(ctx, [], ym, 0, [], all, { kind: 'chiitoi' });
    return finalize(ctx, y, [], 25, [['七対子は25符固定', 25]], all, { kind: 'chiitoi', wait: 'tanki' });
  }

  /* 評価: 上がれない/役なしなら null */
  MJ.evaluate = (ctx) => {
    const { counts, melds } = ctx;
    const menzen = melds.every((m) => m.kind === 'ankan');
    const all = counts.slice();
    for (const m of melds) for (const t of m.tiles) all[t.t]++;
    let best = null;
    const consider = (r) => {
      if (!r) return;
      if (!best || r.score > best.score) best = r;
    };
    if (melds.length === 0) {
      if (isKokushi(counts)) consider(finalize(ctx, [], ['国士無双'], 0, [], all, { kind: 'kokushi' }));
      if (isChiitoi(counts)) consider(evalChiitoi(ctx, all));
    }
    for (const dec of MJ.decompose(counts)) {
      for (const pl of placements(dec, ctx.winTile)) consider(evalStd(ctx, dec, pl, menzen, all));
    }
    return best;
  };

  /* ---------- 点数早見表 ---------- */
  MJ.scoreTable = (fu, han) => {
    const b = MJ.basicPoints(han, fu);
    return { childRon: c100(b * 4), dealerRon: c100(b * 6), childTsumo: [c100(b), c100(b * 2)], dealerTsumo: c100(b * 2) };
  };
})(typeof window !== 'undefined' ? window : globalThis);
