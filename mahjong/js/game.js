/* 対局の進行 (4人麻雀・東風戦/1局) */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const c100 = (x) => Math.ceil(x / 100) * 100;

  MJ.Game = class Game {
    constructor(cfg) {
      this.cfg = cfg;
      this.ui = cfg.ui || null;
      this.fast = !!cfg.fast;
      this.mode = cfg.mode || 'free';
      this.length = cfg.length || MJ.RULES.length || 'east'; // 'east' | 'south' | 'single'
      const me = { id: 0, name: 'あなた', short: 'あなた', level: 0, style: 'balanced', img: `img/you/${String(MJ.youIndex()).padStart(2, '0')}.jpg`, lines: {} };
      const chars = [me].concat(cfg.chars);
      this.players = chars.map((ch, i) => ({
        seat: i, char: ch, name: ch.short, isHuman: i === 0 && !cfg.allCpu, score: MJ.RULES.start || 25000,
        hand: [], melds: [], discards: [], discardTypes: new Set(),
      }));
      if (cfg.allCpu) this.players[0].char = Object.assign({}, MJ.CHARS[cfg.cpuLevelSeat0 || 0], { level: cfg.cpuLevel || 3 });
      this.dealer = 0;
      this.kyoku = 0;
      this.honba = 0;
      this.kyotaku = 0;
      this.roundWind = 0;
      this.handCount = 0;
      this.log = [];
      this.stopped = false;
    }

    seatWindOf(p) { return (p.seat - this.dealer + 4) % 4; }
    wait(ms) { // 音量の板が開いている間(MJ.paused)は、CPUの動きも止める
      if (this.fast) return Promise.resolve();
      return sleep(ms).then(async () => { while (MJ.paused && !this.stopped) await sleep(120); });
    }
    sync() { if (this.ui) this.ui.render(this); }
    async banner(p, text) { if (this.ui) await this.ui.banner(this, p, text); }
    sfx(name) { if (this.ui && this.ui.sfx) this.ui.sfx(name); }
    speak(p, key, tsumo) { if (this.ui && !p.isHuman && p.char.lines && p.char.lines[key]) this.ui.speak(this, p, key === 'win' ? MJ.winWords(p.char.lines[key], tsumo) : p.char.lines[key]); }

    /* ---------- 全体進行 ---------- */
    async run() {
      if (this.ui && this.ui.dice) { // 対局のはじめ: サイコロを振って、最初の親(東家)を決める
        const d = await this.ui.dice(this, true);
        if (this.stopped) return null;
        if (d !== null && d !== undefined) this.dealer = d;
      }
      for (;;) {
        if (this.handCount > 0 && this.ui && this.ui.dice) { await this.ui.dice(this, false); if (this.stopped) return null; } // 局のはじめ: 親がサイコロを振る
        const r = await this.playHand();
        if (this.stopped) return null;
        this.handCount++;
        let renchan;
        if (r.type === 'draw') { renchan = r.dealerTenpai; this.honba++; }
        else {
          renchan = r.wins.some((w) => w.winner.seat === this.dealer);
          this.honba = renchan ? this.honba + 1 : 0;
        }
        let end = (MJ.RULES.tobi && this.players.some((p) => p.score < 0)) || this.handCount >= 32;
        if (this.length === 'single') end = true;
        if (!renchan) { this.dealer = (this.dealer + 1) % 4; this.kyoku++; }
        if (this.length === 'east' && this.kyoku >= 4) end = true;
        if (this.length === 'south' && this.kyoku >= 8) end = true;
        this.roundWind = Math.min(1, Math.floor(this.kyoku / 4));
        if (end) {
          const order = this.players.slice().sort((a, b) => b.score - a.score || a.seat - b.seat);
          const final = { order, results: order.map((p, i) => ({ p, rank: i + 1 })) };
          if (this.ui) await this.ui.gameEnd(this, final);
          return final;
        }
      }
    }

    kyokuLabel() { const K = ['一', '二', '三', '四', '五', '六', '七', '八', '九']; return `${MJ.windName(this.roundWind)}${K[this.kyoku % 4]}局${this.honba ? ' ' + (K[this.honba - 1] || this.honba) + '本場' : ''}`; }

    setupHand() {
      const wall = MJ.buildWall();
      this.dead = wall.splice(0, 14);
      this.live = wall;
      this.rin = this.dead.slice(0, 4);
      this.rinCount = 0;
      this.doraAll = [4, 6, 8, 10, 12].map((i) => this.dead[i]);
      this.uraAll = [5, 7, 9, 11, 13].map((i) => this.dead[i]);
      this.doraInd = [this.doraAll[0]];
      this.kans = 0;
      this.discardLog = [];
      this.seq = 0;
      this.lastDiscard = null;
      this.humanReview = null;
      this.humanLog = [];
      for (const p of this.players) {
        p.hand = this.live.splice(0, 13);
        p.melds = [];
        p.discards = [];
        p.discardTypes = new Set();
        p.riichi = false;
        p.riichiPending = false;
        p.riichiSeq = -1;
        p.ippatsu = false;
        p.tempFuriten = false;
        p.riichiFuriten = false;
        p.kuikae = [];
        p.drawn = null;
        p.lastSay = '';
        this.sortHand(p);
      }
    }
    sortHand(p) { p.hand.sort((a, b) => a.t - b.t || a.id - b.id); }

    draw(p) {
      const t = this.live.shift();
      p.hand.push(t);
      p.drawn = t;
      if (p.isHuman) this.sfx('draw');
    }
    drawRinshan(p) {
      const t = this.rin[this.rinCount++];
      this.live.pop();
      p.hand.push(t);
      p.drawn = t;
      this.doraInd.push(this.doraAll[this.doraInd.length]);
    }

    /* ---------- 評価ctx ---------- */
    buildCtx(p, tile, tsumo, extra = {}) {
      const counts = MJ.toCounts(p.hand);
      let aka = 0;
      for (const h of p.hand) if (h.red) aka++;
      for (const m of p.melds) for (const h of m.tiles) if (h.red) aka++;
      if (!tsumo) { counts[tile.t]++; if (tile.red) aka++; }
      return Object.assign({
        counts, melds: p.melds, winTile: tile.t, tsumo, riichi: p.riichi, ippatsu: p.ippatsu,
        roundWind: this.roundWind, seatWind: this.seatWindOf(p),
        haitei: tsumo && this.live.length === 0 && !extra.rinshan,
        houtei: !tsumo && this.live.length === 0,
        rinshan: !!extra.rinshan,
        dora: this.doraInd.map((d) => MJ.doraOf(d.t)),
        ura: p.riichi ? this.uraAll.slice(0, this.doraInd.length).map((d) => MJ.doraOf(d.t)) : [],
        aka,
      }, extra);
    }
    menzen(p) { return p.melds.every((m) => m.kind === 'ankan'); }

    isFuriten(q) {
      if (q.tempFuriten || q.riichiFuriten) return true;
      const ws = MJ.waits(MJ.toCounts(q.hand), q.melds.length);
      return ws.some((w) => q.discardTypes.has(w));
    }

    /* ---------- 自分の手番の選択肢 ---------- */
    selfOptions(p, st) {
      const f = p.melds.length;
      const c = MJ.toCounts(p.hand);
      const o = { tsumo: null, riichi: [], ankan: [], kakan: [], afterCall: !!st.afterCall, forbid: p.kuikae || [] };
      if (st.afterCall) return o;
      if (MJ.shanten(c, f) === -1) {
        const res = MJ.evaluate(this.buildCtx(p, p.drawn, true, { rinshan: st.rinshan }));
        if (res) o.tsumo = res;
        else o.tsumoNoYaku = true;
      }
      const types = [...new Set(p.hand.map((h) => h.t))];
      if (this.menzen(p) && !p.riichi && p.score >= 1000 && this.live.length >= 4) {
        for (const t of types) {
          c[t]--;
          if (MJ.shanten(c, f) === 0) o.riichi.push(t);
          c[t]++;
        }
      }
      if (this.kans < 4 && this.live.length > 0) {
        for (const t of types) {
          if (c[t] === 4) {
            if (!p.riichi) o.ankan.push(t);
            else if (p.drawn && t === p.drawn.t) {
              const c13 = c.slice(); c13[t]--;
              const w1 = MJ.waits(c13, f);
              const c10 = c.slice(); c10[t] -= 4;
              const w2 = MJ.waits(c10, f + 1);
              if (w1.length === w2.length && w1.every((x) => w2.includes(x))) o.ankan.push(t);
            }
          }
        }
        if (!p.riichi) for (const m of p.melds) if (m.kind === 'pon' && c[m.t] >= 1) o.kakan.push(m.t);
      }
      return o;
    }

    async decideSelf(p, opts, st) {
      if (p.isHuman) return this.ui.askSelf(this, p, opts, st);
      const act = MJ.AI.chooseSelf(this, p, opts);
      if (this.cfg.cpuDelay != null) { await this.wait(this.cfg.cpuDelay); return act; }
      // 考える時間にゆらぎを持たせる: 引いた牌をそのまま切るときは短め、手を入れかえるときは長め。ときどき、じっくり考える
      const r = Math.random();
      const swap = act.tile && p.drawn && act.tile !== p.drawn;
      let ms = swap ? 1100 + r * 1000 : 700 + r * 600;
      if (r > 0.88) ms += 1200 + Math.random() * 1200;
      await this.wait(ms);
      return act;
    }

    /* ---------- 1局 ---------- */
    async playHand() {
      this.setupHand();
      if (this.ui) await this.ui.handStart(this);
      if (this.ui && MJ.Banter) MJ.Banter.handStart(this);
      this.sync();
      let cur = this.dealer;
      let drawMode = 'normal'; // normal | none (鳴き後) | rinshan
      for (;;) {
        if (this.stopped) return { type: 'draw', dealerTenpai: false };
        const p = this.players[cur];
        this.turn = cur;
        let rinshan = false;
        const afterCall = drawMode === 'none';
        if (drawMode === 'normal') {
          if (this.live.length === 0) return this.exhaustive();
          this.draw(p);
        } else if (drawMode === 'rinshan') { this.drawRinshan(p); rinshan = true; }
        drawMode = 'normal';
        p.tempFuriten = p.riichi ? p.tempFuriten : false;
        this.sync();

        let tile = null, declare = false;
        for (;;) {
          const opts = this.selfOptions(p, { afterCall, rinshan });
          let act;
          if (p.riichi && !opts.tsumo && !opts.ankan.length) { await this.wait(p.isHuman ? 1100 : 1000 + Math.random() * 300); act = { act: 'discard', tile: p.drawn }; }
          else act = await this.decideSelf(p, opts, { afterCall, rinshan });
          if (this.stopped) return { type: 'draw', dealerTenpai: false };
          if (act.act === 'tsumo') return this.winTsumo(p, opts.tsumo, rinshan);
          if (act.act === 'ankan' || act.act === 'kakan') {
            await this.doKan(p, act);
            rinshan = true;
            this.sync();
            continue;
          }
          tile = act.tile;
          declare = act.act === 'riichi';
          break;
        }
        await this.doDiscard(p, tile, declare);
        const r = await this.reactions(p, tile);
        if (r.type === 'ron') return r.result;
        if (r.type === 'call') {
          cur = r.caller.seat;
          drawMode = r.kind === 'kan' ? 'rinshan' : 'none';
        } else cur = (cur + 1) % 4;
      }
    }

    async doKan(p, act) {
      if (act.act === 'ankan') {
        const tiles = p.hand.filter((h) => h.t === act.t);
        p.hand = p.hand.filter((h) => h.t !== act.t);
        p.melds.push({ kind: 'ankan', t: act.t, tiles, from: -1 });
      } else {
        const m = p.melds.find((x) => x.kind === 'pon' && x.t === act.t);
        const i = p.hand.findIndex((h) => h.t === act.t);
        const tl = p.hand.splice(i, 1)[0];
        m.tiles.push(tl);
        m.kind = 'kakan';
      }
      p.drawn = null;
      if (this.ui && MJ.Banter && MJ.Banter.kan) MJ.Banter.kan(this, p);
      this.kans++;
      for (const q of this.players) q.ippatsu = false;
      this.sortHand(p);
      this.sync();
      await this.banner(p, 'カン');
      this.drawRinshan(p);
    }

    async doDiscard(p, tile, riichi) {
      if (p.isHuman) this.recordHumanReview(p, tile);
      const i = p.hand.indexOf(tile);
      p.hand.splice(i, 1);
      p.drawn = null;
      p.kuikae = [];
      p.ippatsu = false;
      p.tempFuriten = false;
      this.sfx('discard');
      const d = { tile, riichi: !!riichi, called: false, seq: ++this.seq };
      p.discards.push(d);
      p.discardTypes.add(tile.t);
      this.discardLog.push({ seq: d.seq, tile, by: p.seat });
      this.lastDiscard = { tile, by: p.seat, d };
      this.sortHand(p);
      if (this.ui && MJ.Banter && !riichi) MJ.Banter.discard(this, p, tile);
      if (riichi) {
        p.riichiPending = true;
        this.sync();
        this.speak(p, 'riichi');
        await this.banner(p, 'リーチ');
        if (this.ui && MJ.Banter) MJ.Banter.riichi(this, p);
      } else this.sync();
      if (!p.isHuman) await this.wait(120);
    }

    recordHumanReview(p, tile) {
      const others = this.players.filter((q) => q !== p);
      const opps = others.filter((q) => q.riichi);
      // ---- 従来: リーチ者がいるときの放銃用データ ----
      this.humanReview = null;
      let pub = null; // 対局中に見える情報だけ(リーチ者に対する危険度)
      if (opps.length) {
        const an = MJ.AI.analyze(this, p);
        const e = an.evals.find((x) => x.t === tile.t);
        if (e && e.danger) {
          const safer = MJ.AI.bySafety(an.evals).filter((x) => x.t !== tile.t && x.danger.score < e.danger.score).slice(0, 2);
          this.humanReview = { t: tile.t, danger: e.danger, safer: safer.map((x) => ({ t: x.t, tag: x.danger.tag })), opps: opps.map((q) => q.name), seq: this.seq + 1 };
          const b0 = MJ.AI.bySafety(an.evals)[0];
          pub = { opps: opps.map((q) => q.name), tag: e.danger.tag, score: Math.round(e.danger.score), safest: b0 && b0.t !== tile.t ? { t: b0.t, tag: b0.danger.tag, score: Math.round(b0.danger.score) } : null };
        }
      }
      // ---- 振り返り用の記録(リーチなしでも、相手がテンパイ(ダマテン)していたら記録する。後から分かる情報) ----
      try {
        const A = MJ.AI;
        const threats = others.map((q) => {
          const ct = MJ.toCounts(q.hand), f = q.melds.length;
          const tp = MJ.shanten(ct, f) === 0;
          return { q, tp, waits: tp ? MJ.waits(ct, f) : [] };
        }).filter((x) => x.q.riichi || x.tp);
        const vis = A.visible(this, p);
        const score = (t) => threats.reduce((sum, x) => sum + A.danger1(this, vis, t, x.q, A.safeSet(this, x.q), 2).score, 0);
        const worstTag = (t) => { let w = null; threats.forEach((x) => { const d = A.danger1(this, vis, t, x.q, A.safeSet(this, x.q), 2); if (!w || d.score > w.score) w = d; }); return w; };
        const types = [...new Set(p.hand.map((h) => h.t))];
        let safest = null;
        if (threats.length) {
          types.filter((t) => t !== tile.t).forEach((t) => { const sc = score(t); if (!safest || sc < safest.score) safest = { t, score: Math.round(sc) }; });
          if (safest) safest.tag = worstTag(safest.t).tag;
        }
        const c0 = MJ.toCounts(p.hand), f0 = p.melds.length;
        let best = 99;
        types.forEach((t) => { c0[t]--; best = Math.min(best, MJ.shanten(c0, f0)); c0[t]++; });
        c0[tile.t]--;
        const shAfter = MJ.shanten(c0, f0);
        const wt = threats.length ? worstTag(tile.t) : null;
        this.humanLog.push({
          t: tile.t, live: this.live.length, turn: this.humanLog.length + 1,
          threats: threats.map((x) => ({ name: x.q.name, riichi: !!x.q.riichi, waits: x.waits.slice(), hit: x.waits.includes(tile.t) })),
          pub, tag: wt ? wt.tag : '', score: wt ? Math.round(score(tile.t)) : 0, safest, shAfter, shBest: best, worse: shAfter > best,
        });
      } catch (e) { /* 記録に失敗しても対局は続ける */ }
    }

    /* ---------- 他家の反応 ---------- */
    reactOptions(q, p, tile) {
      const o = { tile, from: p.seat, ron: null, ronBlock: null, pon: false, kan: false, chi: [] };
      const f = q.melds.length;
      const c = MJ.toCounts(q.hand);
      const t = tile.t;
      // ロン
      c[t]++;
      if (MJ.shanten(c, f) === -1) {
        const res = MJ.evaluate(this.buildCtx(q, tile, false));
        if (!res) o.ronBlock = 'noyaku';
        else if (this.isFuriten(q)) { o.ronBlock = 'furiten'; o.ronRes = res; }
        else o.ron = res;
      }
      c[t]--;
      if (q.riichi || this.live.length === 0) return o;
      const canDiscardAfter = (removeTypes, forbid) => {
        const cc = c.slice();
        for (const r of removeTypes) cc[r]--;
        return cc.some((n, i) => n > 0 && !forbid.includes(i));
      };
      if (c[t] >= 2 && canDiscardAfter([t, t], [t])) o.pon = true;
      if (c[t] >= 3 && this.kans < 4) o.kan = true;
      if (q.seat === (p.seat + 1) % 4 && t < 27) {
        const n = t % 9;
        const tryUse = (a, b, forbidExtra) => {
          if (a < 0 || b < 0) return;
          if (Math.floor(a / 9) !== Math.floor(t / 9) || Math.floor(b / 9) !== Math.floor(t / 9)) return;
          if (a >= 27 || b >= 27) return;
          if (c[a] < 1 || c[b] < 1) return;
          const forbid = [t].concat(forbidExtra);
          if (!canDiscardAfter([a, b], forbid)) return;
          o.chi.push({ use: [a, b], forbid });
        };
        if (n >= 2) tryUse(t - 2, t - 1, n - 3 >= 0 ? [t - 3] : []);
        if (n >= 1 && n <= 7) tryUse(t - 1, t + 1, []);
        if (n <= 6) tryUse(t + 1, t + 2, n + 3 <= 8 ? [t + 3] : []);
      }
      return o;
    }

    async reactions(p, tile) {
      const decs = [];
      for (let k = 1; k <= 3; k++) {
        const q = this.players[(p.seat + k) % 4];
        const o = this.reactOptions(q, p, tile);
        const any = o.ron || o.pon || o.kan || o.chi.length || o.ronBlock;
        const actionable = o.ron || o.pon || o.kan || o.chi.length;
        if (!any) continue;
        let d;
        if (q.isHuman && (actionable || o.ronBlock)) d = await this.ui.askReact(this, q, o);
        else if (q.isHuman) d = { act: 'pass' };
        else d = MJ.AI.chooseReact(this, q, o);
        if (this.stopped) return { type: 'none' };
        if (o.ron && d.act !== 'ron') { q.tempFuriten = true; if (q.riichi) q.riichiFuriten = true; }
        decs.push({ q, d, o });
      }
      const rons = decs.filter((x) => x.d.act === 'ron');
      if (rons.length) { const rq = rons.map((x) => x.q); return { type: 'ron', result: await this.winRon(p, tile, MJ.RULES.doubleRon ? rq : [rq[0]]) }; }

      // リーチ成立
      if (p.riichiPending) {
        p.riichiPending = false;
        p.riichi = true;
        p.riichiSeq = this.lastDiscard.d.seq;
        p.ippatsu = true;
        p.score -= 1000;
        this.kyotaku++;
        this.sync();
      }
      const callers = decs.filter((x) => ['pon', 'kan', 'chi'].includes(x.d.act));
      callers.sort((a, b) => (a.d.act === 'chi' ? 1 : 0) - (b.d.act === 'chi' ? 1 : 0));
      if (callers.length) {
        const { q, d, o } = callers[0];
        await this.doCall(q, p, tile, d, o);
        return { type: 'call', caller: q, kind: d.act === 'kan' ? 'kan' : d.act };
      }
      return { type: 'none' };
    }

    async doCall(q, p, tile, d, o) {
      const t = tile.t;
      let kind = d.act, use;
      const take = (type, n) => {
        const out = [];
        // 赤ドラは手元に残さず副露に使う(点数が見えるため)
        const cand = q.hand.filter((h) => h.t === type).sort((a, b) => (b.red ? 1 : 0) - (a.red ? 1 : 0));
        for (let i = 0; i < n; i++) { const h = cand[i]; q.hand.splice(q.hand.indexOf(h), 1); out.push(h); }
        return out;
      };
      let meld;
      if (kind === 'pon') {
        const ts = take(t, 2);
        meld = { kind: 'pon', t, tiles: ts.concat([tile]), from: p.seat, called: tile };
        q.kuikae = MJ.RULES.kuikae ? [] : [t];
      } else if (kind === 'kan') {
        const ts = take(t, 3);
        meld = { kind: 'minkan', t, tiles: ts.concat([tile]), from: p.seat, called: tile };
        this.kans++;
      } else {
        use = d.use;
        const opt = o.chi.find((x) => x.use[0] === use[0] && x.use[1] === use[1]);
        const ts = take(use[0], 1).concat(take(use[1], 1));
        meld = { kind: 'chi', t: Math.min(use[0], use[1], t), tiles: ts.concat([tile]), from: p.seat, called: tile };
        q.kuikae = MJ.RULES.kuikae ? [] : (opt ? opt.forbid : [t]);
      }
      this.lastDiscard.d.called = true;
      q.melds.push(meld);
      for (const x of this.players) x.ippatsu = false;
      q.drawn = null;
      this.sortHand(q);
      this.sync();
      await this.banner(q, kind === 'pon' ? 'ポン' : kind === 'chi' ? 'チー' : 'カン');
      if (this.ui && MJ.Banter) MJ.Banter.call(this, q, p);
      if (kind === 'kan') { /* 嶺上牌は playHand 側で引く */ }
    }

    /* ---------- 和了 ---------- */
    handView(p, winTile, tsumo) {
      const concealed = p.hand.filter((h) => !(tsumo && h === p.drawn)).slice().sort((a, b) => a.t - b.t || a.id - b.id);
      return { concealed, melds: p.melds.map((m) => ({ kind: m.kind, t: m.t, tiles: m.tiles.slice() })), winTile };
    }

    async winTsumo(p, res, rinshan) {
      this.speak(p, 'win', true);
      this.sync();
      await this.banner(p, 'ツモ');
      const delta = [0, 0, 0, 0];
      const pay = MJ.payments(res, p.seat === this.dealer, true, this.honba);
      if (p.seat === this.dealer) {
        for (const q of this.players) if (q !== p) { delta[q.seat] -= pay.each; delta[p.seat] += pay.each; }
      } else {
        for (const q of this.players) {
          if (q === p) continue;
          const v = q.seat === this.dealer ? pay.fromDealer : pay.fromOther;
          delta[q.seat] -= v; delta[p.seat] += v;
        }
      }
      delta[p.seat] += this.kyotaku * 1000;
      const win = { winner: p, loser: null, res, tsumo: true, pay, view: this.handView(p, p.drawn, true), winTile: p.drawn,
        ura: p.riichi ? this.uraAll.slice(0, this.doraInd.length) : [], kyotaku: this.kyotaku, honba: this.honba };
      this.kyotaku = 0;
      return this.finishWin([win], delta);
    }

    async winRon(from, tile, winners) {
      const delta = [0, 0, 0, 0];
      const wins = [];
      let first = true;
      for (const q of winners) {
        this.speak(q, 'win');
        this.sync();
        await this.banner(q, 'ロン');
        const res = MJ.evaluate(this.buildCtx(q, tile, false));
        const pay = MJ.payments(res, q.seat === this.dealer, false, first ? this.honba : 0);
        delta[from.seat] -= pay.ron; delta[q.seat] += pay.ron;
        const w = { winner: q, loser: from, res, tsumo: false, pay, view: this.handView(q, tile, false), winTile: tile,
          ura: q.riichi ? this.uraAll.slice(0, this.doraInd.length) : [], kyotaku: first ? this.kyotaku : 0, honba: first ? this.honba : 0 };
        if (first) { delta[q.seat] += this.kyotaku * 1000; this.kyotaku = 0; }
        first = false;
        wins.push(w);
      }
      if (!from.isHuman) this.speak(from, 'lose');
      const review = from.isHuman && this.humanReview && this.humanReview.t === tile.t ? this.humanReview : null;
      let loseReview = null;
      if (from.isHuman) {
        const w0 = wins[0];
        let dg = null;
        try { dg = MJ.AI.danger1(this, MJ.AI.visible(this, from), tile.t, w0.winner, MJ.AI.safeSet(this, w0.winner), 2); } catch (e) { dg = null; }
        loseReview = {
          t: tile.t, tile, danger: review ? review.danger : dg, safer: review ? review.safer : [], log: (this.humanLog || []).slice(),
          dora: this.doraInd.some((d) => MJ.doraOf(d.t) === tile.t), red: !!tile.red,
          winners: wins.map((w) => ({ name: w.winner.name, wait: w.res.wait, kind: w.res.kind, riichi: w.winner.riichi, dealer: w.winner.seat === this.dealer, han: w.res.han, yaku: w.res.yaku.map((y) => y.n), melds: w.winner.melds.map((m) => ({ kind: m.kind, t: m.t })), river: w.winner.discards.map((d) => d.tile.t), yakuhai: MJ.AI.isYakuhaiFor(this, w.winner, tile.t) })),
        };
      }
      return this.finishWin(wins, delta, { review, loseReview });
    }

    finishWin(wins, delta, extra = {}) {
      const before = this.players.map((p) => p.score);
      this.players.forEach((p, i) => { p.score += delta[i]; });
      const result = Object.assign({ type: 'win', wins, delta, before, after: this.players.map((p) => p.score), tsumo: wins[0].tsumo }, extra);
      return this.ui ? this.ui.showResult(this, result).then(() => result) : result;
    }

    /* ---------- 流局 ---------- */
    async exhaustive() {
      const tenpai = this.players.map((p) => MJ.shanten(MJ.toCounts(p.hand), p.melds.length) === 0);
      const n = tenpai.filter(Boolean).length;
      const delta = [0, 0, 0, 0];
      if (n > 0 && n < 4) {
        this.players.forEach((p, i) => { delta[i] = tenpai[i] ? 3000 / n : -3000 / (4 - n); });
      }
      const before = this.players.map((p) => p.score);
      this.players.forEach((p, i) => { p.score += delta[i]; });
      const result = { type: 'draw', delta, before, after: this.players.map((p) => p.score), tenpai, dealerTenpai: tenpai[this.dealer],
        hands: this.players.map((p) => this.handView(p, null, false)),
        drawReview: this.players.some((p) => p.isHuman) ? { log: (this.humanLog || []).slice(), tenpai: tenpai.slice(), names: this.players.map((p) => p.name), waits: this.players.map((p) => (MJ.shanten(MJ.toCounts(p.hand), p.melds.length) === 0 ? MJ.waits(MJ.toCounts(p.hand), p.melds.length) : [])) } : null };
      if (this.ui) await this.ui.showResult(this, result);
      return result;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
