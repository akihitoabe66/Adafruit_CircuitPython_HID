/* 対局画面の描画と入力 */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const $ = (s) => document.querySelector(s);
  const WINDS = ['東', '南', '西', '北'];
  const fmt = (n) => n.toLocaleString('ja-JP');
  const signed = (n) => (n > 0 ? `<span class="plus">+${fmt(n)}</span>` : n < 0 ? `<span class="minus">${fmt(n)}</span>` : '±0');

  const UI = (MJ.UI = {
    game: null, hintOn: true, oneClick: false, reveal: false, sel: null, bubbles: {}, adv: null, picked: null, riichiMode: false, reactHtml: '', coachHtml: '',

    init() {
      const T = $('#table');
      T.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-act]');
        if (b && T.contains(b)) return this.onAction(b);
        const tl = e.target.closest('.hand .tile[data-id]');
        if (tl) this.onTile(+tl.dataset.id);
      });
      T.addEventListener('mouseover', (e) => {
        const tl = e.target.closest('.hand .tile[data-id]');
        if (tl) this.showInfo(+tl.dataset.id);
      });
      $('#opt-reveal').addEventListener('change', (e) => { this.reveal = e.target.checked; if (this.game) this.render(this.game); });
      $('#opt-one').addEventListener('change', (e) => { this.oneClick = e.target.checked; });
      $('#btn-hint').addEventListener('click', () => {
        this.hintOn = !this.hintOn;
        const s = this.sel;
        if (this.hintOn && s) {
          if (s.type === 'self') { this.adv = MJ.Coach.selfAdvice(this.game, s.p, s.opts, s.st); this.coachHtml = this.adv.html; }
          else this.coachHtml = MJ.Coach.reactAdvice(this.game, s.p, s.o);
          this.render(this.game);
        }
        this.refreshCoach();
      });
    },

    attach(game) {
      this.game = game;
      this.sel = null; this.bubbles = {}; this.adv = null; this.picked = null; this.riichiMode = false; this.reactHtml = '';
      this.hintOn = game.mode !== 'free';
      this.oneClick = game.mode === 'free';
      $('#opt-one').checked = this.oneClick;
      this.reveal = false;
      $('#opt-reveal').checked = false;
      $('#g-title').textContent = MJ.Coach.MODES[game.mode].name;
      $('#btn-hint').classList.toggle('hidden', game.mode !== 'free');
      $('#fx').innerHTML = '';
      this.coachHtml = '';
      this.refreshCoach();
    },
    coachActive() { return this.game.mode !== 'free' || this.hintOn; },

    /* ---------- 描画 ---------- */
    render(game) {
      if (this.game !== game) return;
      $('#g-kyoku').textContent = `${game.kyokuLabel()}${game.length === 'single' ? '(1局戦)' : '(東風戦)'}`;
      $('#table').innerHTML =
        `<div class="seat top">${this.seatCard(game, 2)}</div>` +
        `<div class="seat left">${this.seatCard(game, 3)}</div>` +
        `<div class="center">${this.centerHTML(game)}</div>` +
        `<div class="seat right">${this.seatCard(game, 1)}</div>` +
        `<div class="seat bottom">${this.myArea(game)}</div>`;
    },

    meldHTML(m) {
      const tiles = m.tiles.map((h, i) => {
        if (m.kind === 'ankan' && (i === 0 || i === 3)) return MJ.backHTML();
        return MJ.tileHTML(h.t, h === m.called ? 'called-t' : '', '', h.red);
      });
      return `<div class="meld">${tiles.join('')}</div>`;
    },

    seatCard(game, s) {
      const p = game.players[s];
      const ch = p.char;
      const b = this.bubbles[s];
      const bub = b && b.until > Date.now() ? `<div class="bubble">${b.text}</div>` : '';
      const chips = `<span class="chip ${game.seatWindOf(p) === 0 ? 'dealer' : ''}">${WINDS[game.seatWindOf(p)]}${game.seatWindOf(p) === 0 ? '(親)' : ''}</span>${p.riichi ? '<span class="chip r">リーチ</span>' : ''}${ch.level ? `<span class="chip lv">${MJ.LEVEL_JP[ch.level]}</span>` : ''}`;
      const melds = p.melds.length ? `<div class="melds">${p.melds.map((m) => this.meldHTML(m)).join('')}</div>` : '';
      const hand = this.reveal
        ? p.hand.map((h) => MJ.tileHTML(h.t, '', '', h.red)).join('')
        : p.hand.map(() => MJ.backHTML()).join('');
      const act = game.turn === s ? ' act' : '';
      return `<div class="scard${act}${p.riichi ? ' rch-on' : ''}">${bub}<img class="face" src="${ch.img}" alt="${ch.short}"><div class="meta"><div class="nm">${p.name}</div><div class="sc">${fmt(p.score)}</div><div>${chips}</div></div></div>${melds}<div class="cards-row">${hand}</div>`;
    },

    centerHTML(game) {
      const rivers = game.players.map((p) => {
        const items = p.discards.map((d) => MJ.tileHTML(d.tile.t, `t-s${d.called ? ' called' : ''}${d.riichi ? ' rch' : ''}${game.lastDiscard && game.lastDiscard.d === d && !d.called ? ' hl' : ''}`, '', d.tile.red)).join('');
        return `<div class="river r${p.seat}">${items}</div>`;
      }).join('');
      const doras = game.doraInd.map((d) => MJ.tileHTML(d.t, 't-s', '', d.red)).join('') + game.doraAll.slice(game.doraInd.length).map(() => MJ.backHTML('t-s')).join('');
      const info = `<div class="cinfo"><div class="kk">${game.kyokuLabel()}</div><div class="doras">${doras}</div><div class="sub2">残り ${game.live.length}枚${game.kyotaku ? ` / 供託${game.kyotaku}` : ''}</div></div>`;
      return rivers + info;
    },

    myArea(game) {
      const p = game.players[0];
      const sel = this.sel && this.sel.type === 'self' ? this.sel : null;
      const adv = this.adv;
      const w = game.seatWindOf(p);
      const info = `<div class="myrow"><div class="scard${game.turn === 0 ? ' act' : ''}${p.riichi ? ' rch-on' : ''}"><div class="face me">🀄</div><div class="meta"><div class="nm">あなた</div><div class="sc">${fmt(p.score)}</div><div><span class="chip ${w === 0 ? 'dealer' : ''}">${WINDS[w]}${w === 0 ? '(親)' : ''}</span>${p.riichi ? '<span class="chip r">リーチ</span>' : ''}</div></div></div><div class="melds">${p.melds.map((m) => this.meldHTML(m)).join('')}</div></div>`;
      const hand = p.hand.filter((h) => h !== p.drawn);
      const all = p.drawn ? hand.concat([p.drawn]) : hand;
      const tiles = all.map((h) => {
        let cls = '', mk = '';
        if (sel) {
          const ok = this.allowed(sel, h);
          cls += ok ? ' ok' : ' dis';
          if (this.riichiMode && ok) cls += ' rch-ok';
          if (adv && adv.recId === h.id && !this.riichiMode) cls += ' rec';
          if (sel.opts.riichi.length && sel.opts.riichi.includes(h.t) && !this.riichiMode && false) cls += ' rch-ok';
          const m = adv && adv.marks[h.id];
          if (m && m.txt && this.coachActive()) mk = `<span class="mk ${m.cls}">${m.txt}</span>`;
        }
        if (h === p.drawn) cls += ' drawn';
        if (this.picked === h.id) cls += ' picked';
        return `<div class="tile${cls}${h.red ? ' aka' : ''}" data-id="${h.id}" data-t="${h.t}">${MJ.tileSVG(h.t)}${mk}</div>`;
      }).join('');
      return `${info}<div class="hand${this.riichiMode ? ' riichi-mode' : ''}" id="hand">${tiles}</div><div class="actions">${this.actionsHTML(game)}</div><div class="tipline" id="tipline"></div>`;
    },

    allowed(sel, h) {
      const p = sel.p;
      if (p.riichi) return h === p.drawn;
      if (sel.opts.forbid.includes(h.t)) return false;
      if (this.riichiMode) return sel.opts.riichi.includes(h.t);
      return true;
    },

    actionsHTML(game) {
      const s = this.sel;
      if (!s) return '<span class="msg">…</span>';
      const btn = (cls, act, label, extra = '') => `<button class="btn ${cls}" data-act="${act}" ${extra}>${label}</button>`;
      if (s.type === 'self') {
        const o = s.opts;
        let h = '';
        if (o.tsumo) h += btn('b-tsumo', 'tsumo', 'ツモ!');
        if (o.riichi.length) h += btn('b-riichi', 'riichi', this.riichiMode ? 'リーチ取消' : 'リーチ');
        for (const t of o.ankan) h += btn('b-call', 'ankan', `カン(${MJ.tileName(t)})`, `data-t="${t}"`);
        for (const t of o.kakan) h += btn('b-call', 'kakan', `加槓(${MJ.tileName(t)})`, `data-t="${t}"`);
        let msg = s.p.riichi ? 'リーチ中: ツモ切りです(牌をクリック)' : s.st.afterCall ? '鳴いたので1枚切ります(暗い牌は食い替え禁止)' : this.riichiMode ? '赤枠の牌を切るとリーチ成立' : this.oneClick ? '切る牌をクリック' : '切る牌を選んで、もう一度クリックで捨てる';
        h += `<span class="msg">${msg}</span>`;
        return h;
      }
      const o = s.o;
      let h = '';
      if (o.ron) h += btn('b-ron', 'ron', 'ロン!');
      if (o.pon) h += btn('b-call', 'pon', 'ポン');
      for (const c of o.chi) h += btn('b-call', 'chi', `チー(${MJ.tileName(c.use[0])}${MJ.tileName(c.use[1])})`, `data-a="${c.use[0]}" data-b="${c.use[1]}"`);
      if (o.kan) h += btn('b-call', 'kan', 'カン');
      h += btn('b-pass', 'pass', o.ron || o.pon || o.kan || o.chi.length ? 'パス' : 'OK');
      return h;
    },

    /* ---------- 入力 ---------- */
    onTile(id) {
      const s = this.sel;
      if (!s || s.type !== 'self') return;
      const h = s.p.hand.find((x) => x.id === id);
      if (!h || !this.allowed(s, h)) return;
      if (!this.oneClick && this.picked !== id) { this.picked = id; this.showInfo(id); this.render(this.game); return; }
      this.finish({ act: this.riichiMode ? 'riichi' : 'discard', tile: h });
    },
    onAction(b) {
      const s = this.sel;
      if (!s) return;
      const a = b.dataset.act;
      if (s.type === 'self') {
        if (a === 'riichi') { this.riichiMode = !this.riichiMode; this.picked = null; this.render(this.game); return; }
        if (a === 'tsumo') return this.finish({ act: 'tsumo' });
        if (a === 'ankan' || a === 'kakan') return this.finish({ act: a, t: +b.dataset.t });
      } else {
        if (a === 'chi') return this.finish({ act: 'chi', use: [+b.dataset.a, +b.dataset.b] });
        return this.finish({ act: a });
      }
    },
    finish(act) {
      const s = this.sel;
      this.sel = null; this.picked = null; this.riichiMode = false; this.adv = null;
      this.reactHtml = '';
      s.res(act);
      this.render(this.game);
      this.coachHtml = '';
      this.refreshCoach();
    },
    showInfo(id) {
      const el = $('#tileinfo');
      if (!el) return;
      const t = this.adv && this.adv.info && this.adv.info[id];
      if (t && this.coachActive()) { el.style.display = 'block'; el.innerHTML = t; }
    },

    askSelf(game, p, opts, st) {
      return new Promise((res) => {
        this.sel = { type: 'self', p, opts, st, res };
        this.riichiMode = false; this.picked = null;
        this.adv = this.coachActive() || game.mode !== 'free' ? MJ.Coach.selfAdvice(game, p, opts, st) : null;
        this.coachHtml = this.adv ? this.adv.html : '';
        this.render(game);
        this.refreshCoach();
      });
    },
    askReact(game, q, o) {
      return new Promise((res) => {
        this.sel = { type: 'react', p: q, o, res };
        this.adv = null;
        this.coachHtml = this.coachActive() || game.mode !== 'free' ? MJ.Coach.reactAdvice(game, q, o) : '';
        const tile = o.tile;
        this.render(game);
        this.refreshCoach();
      });
    },

    refreshCoach() {
      const g = this.game;
      const el = $('#coach');
      if (!g) return;
      const m = MJ.Coach.MODES[g.mode];
      let body;
      if (!this.coachActive()) body = '<div class="cc"><div class="cc-b">💡「ヒント」ボタンでアドバイスを表示できます。</div></div>';
      else if (this.coachHtml) body = this.coachHtml;
      else body = `<div class="cc"><div class="cc-h">${m.short}モード</div><div class="cc-b">${m.desc}</div></div>${this.tipHtml || ''}`;
      if (this.sel && this.sel.type === 'self' && this.coachActive()) body = '<div class="tileinfo" id="tileinfo"></div>' + body;
      el.innerHTML = `<div class="ch"><b>🎓 ${m.name}</b></div>${body}`;
    },

    /* ---------- 演出 ---------- */
    banner(game, p, text) {
      const col = text === 'リーチ' ? '#ff5b8a' : text === 'ロン' || text === 'ツモ' ? '#ff7b5a' : '#5aa6ff';
      const fx = $('#fx');
      fx.innerHTML = `<div class="banner" style="--c:${col}">${text}<small>${p.name}</small></div>`;
      return new Promise((r) => setTimeout(() => { fx.innerHTML = ''; r(); }, game.fast ? 0 : 950));
    },
    speak(game, p, text) {
      this.bubbles[p.seat] = { text, until: Date.now() + 2300 };
      setTimeout(() => { if (this.game === game) this.render(game); }, 2400);
    },
    handStart(game) {
      const tip = MJ.Coach.startTip(game);
      this.tipHtml = `<div class="cc rec"><div class="cc-h">💡 この局のポイント</div><div class="cc-b">${tip}</div></div>`;
      this.coachHtml = '';
      this.refreshCoach();
      const fx = $('#fx');
      fx.innerHTML = `<div class="banner" style="--c:#ffcc4d">${game.kyokuLabel()}<small>親: ${game.players[game.dealer].name} ／ ドラ表示牌: ${MJ.tileName(game.doraInd[0].t)}</small></div>`;
      return new Promise((r) => setTimeout(() => { fx.innerHTML = ''; r(); }, game.fast ? 0 : 1500));
    },

    /* ---------- 結果 ---------- */
    overlay(html) {
      const o = $('#overlay');
      o.innerHTML = `<div class="modal">${html}</div>`;
      o.classList.remove('hidden');
      o.scrollTop = 0;
      return o;
    },
    closeOverlay() { $('#overlay').classList.add('hidden'); $('#overlay').innerHTML = ''; },

    winHTML(game, w) {
      const r = w.res;
      const win = w.winner;
      const v = w.view;
      const concealed = v.concealed.map((h) => MJ.tileHTML(h.t, 't-m', '', h.red)).join('');
      const winT = w.winTile ? `<span class="gap"></span>${MJ.tileHTML(w.winTile.t, 't-m hl', '', w.winTile.red)}` : '';
      const melds = v.melds.map((m) => `<span class="gap"></span>` + m.tiles.map((h, i) => (m.kind === 'ankan' && (i === 0 || i === 3) ? MJ.backHTML('t-m') : MJ.tileHTML(h.t, 't-m', '', h.red))).join('')).join('');
      const dora = game.doraInd.map((d) => MJ.tileHTML(d.t, 't-m', '', d.red)).join('');
      const ura = w.ura.length ? '　裏ドラ表示牌: ' + w.ura.map((d) => MJ.tileHTML(d.t, 't-m', '', d.red)).join('') : '';
      const rows = r.yaku.map((y) => `<tr><td>${y.n}</td><td>${r.yakuman ? '役満' : y.h + '飜'}</td></tr>`).join('');
      let pts;
      if (!w.tsumo) pts = `${fmt(w.pay.ron)}点(${w.loser.name}から)`;
      else if (win.seat === game.dealer) pts = `${fmt(w.pay.each)}点オール`;
      else pts = `${fmt(w.pay.fromOther)}・${fmt(w.pay.fromDealer)}点`;
      const lines = MJ.Coach.explainScore(w, game);
      const open = game.mode !== 'free' || win.isHuman ? ' open' : '';
      return `<div class="win-head">${win.char.img ? `<img src="${win.char.img}">` : '<div style="font-size:40px">🀄</div>'}<div><div class="big">${win.name}の${w.tsumo ? 'ツモ和了' : 'ロン和了'}!</div><div>${w.tsumo ? '' : `放銃: ${w.loser.name}`}</div></div></div>
      <div class="win-hand">${concealed}${melds}${winT}</div>
      <div>ドラ表示牌: ${dora}${ura}</div>
      <table class="yakus">${rows}</table>
      <div class="score-big">${r.yakuman ? r.limit : `${r.han}飜 ${r.fu}符${r.limit ? ' ' + r.limit : ''}`} → ${pts}</div>
      <details class="expl"${open}><summary>📘 点数計算のしくみ(クリックで開閉)</summary><ol>${lines.map((l) => `<li>${l}</li>`).join('')}</ol></details>`;
    },

    scoreTable(game, res) {
      const rows = game.players.map((p, i) => `<tr><td>${p.name}</td><td>${fmt(res.before[i])}</td><td>${signed(res.delta[i])}</td><td><b>${fmt(res.after[i])}</b></td></tr>`).join('');
      return `<table class="scores"><tr><th>プレイヤー</th><th>前</th><th>増減</th><th>持ち点</th></tr>${rows}</table>`;
    },

    showResult(game, res) {
      return new Promise((resolve) => {
        let html;
        if (res.type === 'win') {
          html = `<h2>${game.kyokuLabel()} 和了</h2>` + res.wins.map((w) => this.winHTML(game, w)).join('<hr>');
          if (res.review) html += MJ.Coach.reviewText(res.review);
          else if (res.wins.some((w) => w.loser && w.loser.isHuman) && game.mode !== 'free') html += '<div class="cc bad"><div class="cc-h">🔎 放銃の振り返り</div><div class="cc-b">リーチ者がいない状況での放銃でした。ドラ・役牌・真ん中の牌が当たりやすいので、他家の鳴きや河(捨て牌)もよく観察しましょう。</div></div>';
        } else {
          const tp = res.tenpai.map((t, i) => `<tr><td>${game.players[i].name}</td><td>${t ? '<b class="good">テンパイ</b>' : 'ノーテン'}</td><td>${res.tenpai[i] ? res.hands[i].concealed.map((h) => MJ.tileHTML(h.t, 't-s')).join('') : ''}</td></tr>`).join('');
          html = `<h2>${game.kyokuLabel()} 流局</h2><p>山の牌がなくなりました(荒牌平局)。テンパイ者がノーテン者から3000点を受け取ります。</p><table class="scores">${tp}</table>`;
        }
        html += this.scoreTable(game, res);
        const last = game.length === 'single';
        html += `<div style="text-align:right"><button class="btn pri" id="res-next">${last ? '結果へ' : '次へ'}</button></div>`;
        this.overlay(html);
        $('#res-next').addEventListener('click', () => { this.closeOverlay(); resolve(); });
        this.render(game);
      });
    },

    gameEnd(game, final) {
      return new Promise((resolve) => {
        const me = final.results.find((r) => r.p.seat === 0);
        const msg = me.rank === 1 ? '🎉 トップ!おめでとうございます!' : me.rank === 4 ? '残念…ラスでした。振り返って次に活かそう!' : `${me.rank}位でした。`;
        const rows = final.results.map((r) => `<div class="rank"><div class="rk">${r.rank}</div>${r.p.char.img ? `<img src="${r.p.char.img}">` : '<div style="font-size:30px;width:56px;text-align:center">🀄</div>'}<div><b>${r.p.name}</b></div><div class="rs">${fmt(r.p.score)}点</div></div>`).join('');
        this.overlay(`<h2>対局終了</h2><p>${msg}</p><div class="ranks">${rows}</div><div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn" id="end-menu">メニューへ</button><button class="btn pri" id="end-again">もう一度</button></div>`);
        try {
          const st = JSON.parse(localStorage.getItem('mj_stats') || '{"games":0,"ranks":[0,0,0,0]}');
          st.games++; st.ranks[me.rank - 1]++;
          localStorage.setItem('mj_stats', JSON.stringify(st));
        } catch (e) { /* ignore */ }
        $('#end-menu').addEventListener('click', () => { this.closeOverlay(); resolve(); MJ.App.toMenu(); });
        $('#end-again').addEventListener('click', () => { this.closeOverlay(); resolve(); MJ.App.again(); });
      });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
