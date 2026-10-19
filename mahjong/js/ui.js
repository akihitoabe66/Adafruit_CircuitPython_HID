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
      const M = $('#mine');
      M.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-act]');
        if (b) return this.onAction(b);
        const tl = e.target.closest('.hand .tile[data-id]');
        if (tl) this.onTile(+tl.dataset.id);
      });
      const hl = (ids) => M.querySelectorAll('.hand .tile[data-id]').forEach((tl) => tl.classList.toggle('cand', ids.includes(tl.dataset.id)));
      const allIds = () => [...M.querySelectorAll('.cq-btn[data-ids]')].flatMap((b) => b.dataset.ids.split(','));
      M.addEventListener('mouseover', (e) => {
        const cb = e.target.closest('.cq-btn[data-ids]');
        if (cb) hl(cb.dataset.ids.split(','));
      });
      M.addEventListener('mouseout', (e) => { if (e.target.closest('.cq-btn')) hl(allIds()); });
      M.addEventListener('mouseover', (e) => {
        const tl = e.target.closest('.hand .tile[data-id]');
        if (tl) this.showInfo(+tl.dataset.id);
      });
      $('#btn-coach').addEventListener('click', () => { document.body.classList.toggle('coach-open'); this.fitCoachText($('#coach')); });
      window.addEventListener('resize', () => this.relayout());
      window.addEventListener('orientationchange', () => setTimeout(() => this.relayout(), 250));
      $('#opt-reveal').addEventListener('change', (e) => { this.reveal = e.target.checked; if (this.game) this.render(this.game); });
      $('#opt-one').addEventListener('change', (e) => { this.oneClick = e.target.checked; });
      document.addEventListener('input', (e) => this.onAudioCtl(e));
      document.addEventListener('change', (e) => this.onAudioCtl(e));
      document.addEventListener('change', (e) => {
        const r = e.target.closest && e.target.closest('.vpr');
        if (r) { MJ.SFX.setReadVoice(r.value); this.renderVoices(); MJ.SFX.stopSpeak(); MJ.SFX.read('この声で読み上げます。'); }
      });
      this.renderVoices();
      if (window.speechSynthesis) window.speechSynthesis.addEventListener('voiceschanged', () => this.renderVoices());
      document.addEventListener('click', (e) => {
        const rf = e.target.closest('[data-readfrom]');
        if (rf) {
          const blk = rf.closest('.rfb'), root = blk && blk.parentElement;
          if (!root) return;
          if (!MJ.SFX.read(this.textOf(root, blk))) this.toast('この端末には日本語の読み上げ音声がありません');
          return;
        }
        const b = e.target.closest('[data-read]');
        if (!b) return;
        const root = b.dataset.read === 'coach' ? $('#coach') : b.dataset.read === 'drill' ? $('#dq-fb') : $('.modal');
        if (!root) return;
        if (MJ.SFX.speaking()) { MJ.SFX.stopSpeak(); return; }
        if (!MJ.SFX.read(this.textOf(root))) this.toast('この端末には日本語の読み上げ音声がありません');
      });
      document.addEventListener('click', (e) => {
        // 縦画面: 解説パネルをタップで大きく開く/閉じる
        const cp = e.target.closest('#coach');
        if (cp && !document.body.classList.contains('desk') && !document.body.classList.contains('land') && !e.target.closest('button, .gl, [data-pj], .rf')) {
          document.body.classList.toggle('coach-open');
          this.fitCoachText($('#coach'));
          return;
        }
        const g = e.target.closest('#coach [data-pg]'), j = e.target.closest('#coach [data-pj]');
        if (g) this.goCoachPage(+g.dataset.pg);
        else if (j) this.goCoachPage(0, +j.dataset.pj);
      });
      this.syncAudio();
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

    sfx(name) { MJ.SFX.play(name); },

    onAudioCtl(e) {
      const c = e.target.closest && e.target.closest('.ac');
      if (!c) return;
      const k = c.dataset.audio, v = c.type === 'range' ? +c.value : c.checked;
      if (k === 'bgm') MJ.Audio.setOn(v);
      else if (k === 'vol') MJ.Audio.setVolume(v);
      else if (k === 'sfx') MJ.SFX.setOn(v);
      else if (k === 'svol') MJ.SFX.setVol(v);
      else if (k === 'voice') MJ.SFX.setVoice(v);
      else if (k === 'cvol') { MJ.SFX.setCallVol(v); if (e.type === 'change') MJ.SFX.voice('ポン', { char: { id: 1 } }); }
      else if (k === 'rvol') { MJ.SFX.setReadVol(v); if (e.type === 'change') this.sampleRead(); }
      this.syncAudio(c);
    },
    /* 読み上げ音量を変えたとき、短い見本を読んで確かめられるようにする */
    /* 読み上げの声の選択(端末にある日本語音声から最大6つ) */
    renderVoices() {
      const list = MJ.SFX.voiceList(), cur = MJ.SFX.femaleVoice();
      document.querySelectorAll('.vp-list').forEach((box, bi) => {
        if (!list.length) { box.innerHTML = '<span class="cc-s">この端末では選べる声がありません</span>'; return; }
        box.innerHTML = list.map((v, i) => `<label><input type="radio" class="vpr" name="rv${bi}" value="${v.voiceURI}"${cur && cur.voiceURI === v.voiceURI ? ' checked' : ''}> 声${i + 1}<small>${MJ.SFX.voiceLabel(v)}</small></label>`).join('');
      });
    },
    /* 「ここから読む」ボタンを、読み上げ対象の各ブロックに付ける */
    addReadFrom(root, kids) {
      if (!root) return;
      (kids || [...root.children]).forEach((k) => {
        if (k.classList.contains('ch') || k.classList.contains('ctabs') || k.classList.contains('readbar') || k.querySelector(':scope > .rf') || (k.textContent || '').trim().length < 6 || k.tagName === 'BUTTON') return;
        k.classList.add('rfb');
        k.insertAdjacentHTML('afterbegin', '<button class="rf rd" data-readfrom title="ここから読み上げ" aria-label="ここから読み上げ">▶</button>');
      });
    },
    sampleRead() { if (!MJ.SFX.speaking()) MJ.SFX.read('この大きさで読み上げます。'); },
    syncAudio(except) {
      const val = { bgm: MJ.Audio.on, vol: MJ.Audio.volume, sfx: MJ.SFX.on, svol: MJ.SFX.vol, voice: MJ.SFX.voiceOn, rvol: MJ.SFX.readVol, cvol: MJ.SFX.callVol };
      const bell = $('#bell');
      if (bell) {
        bell.setAttribute('aria-pressed', String(MJ.Audio.on));
        bell.querySelector('.bi').textContent = MJ.Audio.on ? '🔔' : '🔕';
        bell.querySelector('.bt').textContent = MJ.Audio.on ? 'BGM ON' : 'BGM OFF';
      }
      document.querySelectorAll('.ac').forEach((c) => {
        if (c === except) return;
        const v = val[c.dataset.audio];
        if (c.type === 'range') c.value = v; else c.checked = v;
      });
    },
    toast(msg) {
      let t = $('#toast');
      if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
      t.textContent = msg; t.style.display = 'block';
      clearTimeout(this._tt); this._tt = setTimeout(() => { t.style.display = 'none'; }, 2200);
    },
    /* 画面の文章を読み上げ用テキストにする */
    textOf(root, from) {
      const c = root.cloneNode(true);
      if (from) { const k = [...root.children].indexOf(from); for (let n = 0; n < k; n++) c.children[0].remove(); }
      c.querySelectorAll('.ch, .rd, button, table.scores, .ctabs, summary, script, style').forEach((n) => n.remove());
      // 牌の絵は「名前」を読むが、すぐ後ろに同じ名前の文字がある場合は重複して読まない。牌が4つ以上並ぶ所は最初の3つまで
      c.querySelectorAll('img').forEach((i) => i.replaceWith(document.createTextNode(i.alt ? `\u0001${i.alt}\u0002` : '')));
      c.querySelectorAll('li, .cc, .cc-h, tr, p, div').forEach((n) => n.append('。'));
      let t = c.textContent;
      const map = [[/萬/g, 'マン'], [/筒/g, 'ピン'], [/索/g, 'ソウ'], [/飜/g, 'ハン'], [/符/g, 'フ'], [/和了/g, 'あがり'], [/牌/g, 'パイ'], [/×/g, 'かける'], [/≒/g, 'およそ'], [/→/g, '、'], [/%/g, 'パーセント'], [/\//g, '、'], [/[★☆✨🎉🛡🚨🔎📘🎯💡⚖🚫🥇🥈🥉]/gu, ''], [/ /g, ' ']];
      t = t.replace(/\u0001([^\u0002]+)\u0002\s*(\1)/g, '$1'); // 牌の絵+同じ名前の文字
      t = t.replace(/((?:\u0001[^\u0002]+\u0002[\s、,・]*){3})(?:\u0001[^\u0002]+\u0002[\s、,・]*)+/g, '$1など'); // 長い牌の並び
      t = t.replace(/[\u0001\u0002]/g, '');
      map.forEach(([r, s]) => { t = t.replace(r, s); });
      return t.replace(/\s+/g, ' ').replace(/。(\s*。)+/g, '。').trim();
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
      this.summary = '';
      document.body.classList.remove('coach-open');
      this.layoutKey = '';
      this.refreshCoach();
    },
    relayout() { if (this.game) { this.layoutKey = ''; this.render(this.game); } },
    coachActive() { return this.game.mode !== 'free' || this.hintOn; },

    /* ---------- レイアウト(画面サイズに合わせて牌の大きさを決める) ---------- */
    /* 対局画面を「ステージ」として扱う: PC/タブレット横=16:9を基準に拡大縮小、スマホ縦=9:16〜9:19.5、
       スマホ横=16:9〜19.5:9。比率が合わない分は黒帯(暗い背景)にして、画面内にスクロールなしで収める */
    fitStage() {
      const el = $('#screen-game');
      if (!el || el.classList.contains('hidden')) return;
      const W = window.innerWidth, H = window.innerHeight;
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      let sw, sh, sc = 1;
      if (W >= H) {
        const asp = clamp(W / H, 16 / 9, 19.5 / 9);
        if (H >= 600) { sh = 720; sw = Math.round(720 * asp); sc = Math.min(W / sw, H / sh); }
        else if (W / H >= asp) { sh = H; sw = Math.round(H * asp); } else { sw = W; sh = Math.round(W / asp); }
      } else {
        const asp = clamp(W / H, 9 / 19.5, 9 / 16);
        if (W / H > asp) { sh = H; sw = Math.round(H * asp); } else { sw = W; sh = Math.round(W / asp); }
      }
      const ox = Math.round((W - sw * sc) / 2), oy = Math.round((H - sh * sc) / 2);
      el.style.width = sw + 'px';
      el.style.height = sh + 'px';
      el.style.transform = `translate(${ox}px, ${oy}px) scale(${sc})`;
      if (!this.stage || this.stage.w !== sw || this.stage.h !== sh) this.layoutKey = '';
      this.stage = { w: sw, h: sh, sc };
    },

    layout() {
      this.fitStage();
      const st = this.stage;
      if (!st) return;
      const W = st.w, H = st.h;
      const desk = W >= 1000 && H >= 560;
      const land = !desk && W > H;
      const body = document.body;
      body.classList.toggle('desk', desk);
      body.classList.toggle('land', land);
      body.classList.toggle('short', land && H <= 640);
      const gl = $('.gleft');
      const full = gl ? gl.clientWidth : 0;
      if (!full) return;
      const gb = $('.gbar').offsetHeight;
      const key = [W, H, full, gb].join('x');
      if (key === this.layoutKey) return;
      this.layoutKey = key;
      const n = desk || land ? 4 : 2;
      const inner = full - 16;
      const bw = (inner - 5 * (n - 1)) / n;
      let sw = Math.floor((bw - 14) / 6.05);
      let hw = Math.floor((full - 14) / 14.3);
      sw = Math.min(sw, desk ? 52 : 40);
      hw = Math.min(hw, desk ? 74 : 66);
      if (desk || land) {
        const fit = () => gb + 14 + (sw * 2 + 14 + 2.4 * (sw * 1.32 + 2) + 16) + (hw * 1.32 + 24) + 50 + 22;
        while (fit() > H && hw > 22) { hw--; if (sw > hw * 0.55) sw--; }
      }
      this.setSizes(sw, hw);
    },
    setSizes(sw, hw) {
      this.sizes = { sw, hw };
      const r = document.documentElement.style;
      r.setProperty('--sw', sw + 'px');
      r.setProperty('--sh', Math.round(sw * 1.32) + 'px');
      r.setProperty('--hw', hw + 'px');
    },
    /* 描画後に実測して、はみ出していたら牌を少しずつ小さくする(スクロールを出さないため) */
    fitHeight() {
      const gm = $('.gmain'), gl = $('.gleft');
      if (!gm || !gl || !this.sizes) return;
      let { sw, hw } = this.sizes, n = 0;
      const room = () => (document.body.classList.contains('desk') || document.body.classList.contains('land') ? gm.clientHeight : gm.clientHeight - 90);
      while (gl.scrollHeight > room() && n++ < 14 && (sw > 16 || hw > 18)) {
        if (hw > 18) hw--;
        if (sw > hw * 0.6 || sw > 16) sw--;
        this.setSizes(sw, hw);
      }
    },

    /* ---------- 描画 ---------- */
    render(game) {
      if (this.game !== game) return;
      this.layout();
      const doras = game.doraInd.map((d) => MJ.tileHTML(d.t, '', '', d.red)).join('') + game.doraAll.slice(game.doraInd.length).map(() => MJ.backHTML()).join('');
      $('#ginfo').innerHTML = `<span class="kk">${game.kyokuLabel()}</span><span>${game.length === 'single' ? '1局戦' : '東風戦'}</span><span class="doras">ドラ表示 ${doras}</span><span>残り ${game.live.length}枚</span>${game.kyotaku ? `<span>供託 ${game.kyotaku}</span>` : ''}`;
      $('#table').innerHTML = `<div class="blocks">${[3, 2, 1, 0].map((s) => this.block(game, s)).join('')}</div>`;
      $('#mine').innerHTML = this.mineHTML(game);
      this.fitHeight();
    },

    meldHTML(m) {
      const tiles = m.tiles.map((h, i) => {
        if (m.kind === 'ankan' && (i === 0 || i === 3)) return MJ.backHTML();
        return MJ.tileHTML(h.t, h === m.called ? 'called-t' : '', '', h.red);
      });
      return `<div class="meld">${tiles.join('')}</div>`;
    },

    block(game, s) {
      const p = game.players[s];
      const ch = p.char;
      const w = game.seatWindOf(p);
      const b = this.bubbles[s];
      const bub = b && b.until > Date.now() ? `<div class="bubble">${b.text}</div>` : '';
      const face = ch.img ? `<img class="face${s === 0 ? ' you' : ''}" src="${ch.img}" alt="">` : '<div class="face me">🀄</div>';
      const chips = `<span class="chip ${w === 0 ? 'dealer' : ''}">${WINDS[w]}${w === 0 ? '親' : ''}</span>${p.riichi ? '<span class="chip r">リーチ</span>' : ''}${ch.level ? `<span class="chip lv">${MJ.LEVEL_JP[ch.level]}</span>` : ''}`;
      const melds = p.melds.length ? `<div class="melds">${p.melds.map((m) => this.meldHTML(m)).join('')}</div>` : '';
      const river = p.discards.map((d) => MJ.tileHTML(d.tile.t, `${d.called ? 'called' : ''}${d.riichi ? ' rch' : ''}${game.lastDiscard && game.lastDiscard.d === d && !d.called ? ' hl' : ''}`, '', d.tile.red)).join('');
      // まだ牌が置かれていない場所に、うっすら枠(影)を出す
      const ghosts = '<div class="gh"></div>'.repeat(Math.max(0, (document.body.classList.contains('desk') ? 24 : 12) - p.discards.length));
      const rev = this.reveal && s !== 0 ? `<div class="hrev">${p.hand.map((h) => MJ.tileHTML(h.t, '', '', h.red)).join('')}</div>` : '';
      return `<div class="blk${game.turn === s ? ' act' : ''}${p.riichi ? ' rch-on' : ''}">${bub}<div class="strip">${face}<div class="meta"><div class="nm">${p.name}</div><div class="sc">${fmt(p.score)}</div><div class="chips">${chips}</div></div></div>${melds}<div class="river">${river}${ghosts}</div>${rev}</div>`;
    },

    mineHTML(game) {
      const p = game.players[0];
      const sel = this.sel && this.sel.type === 'self' ? this.sel : null;
      const adv = this.adv;
      const hand = p.hand.filter((h) => h !== p.drawn);
      const all = p.drawn ? hand.concat([p.drawn]) : hand;
      const recH = adv && adv.recId ? p.hand.find((x) => x.id === adv.recId) : null;
      const recT = recH ? recH.t : null;
      const rs = this.sel && this.sel.type === 'react' ? this.sel : null;
      const cand = rs ? this.callOptions(rs) : null;
      const tiles = all.map((h) => {
        let cls = '', mk = '';
        if (cand && cand.union.has(h.id)) cls += ' cand';
        if (sel) {
          const ok = this.allowed(sel, h);
          cls += ok ? ' ok' : ' dis';
          if (this.riichiMode && ok) cls += ' rch-ok';
          if (adv && !this.riichiMode && (adv.recId === h.id || (recT != null && h.t === recT))) cls += ' rec';
          const m = adv && adv.marks[h.id];
          if (m && m.txt && this.coachActive()) mk = `<span class="mk ${m.cls}">${m.txt}</span>`;
        }
        if (h === p.drawn) cls += ' drawn';
        if (this.picked === h.id) cls += ' picked';
        return `<div class="tile${cls}${h.red ? ' aka' : ''}" data-id="${h.id}" data-t="${h.t}">${MJ.tileSVG(h.t)}${mk}</div>`;
      }).join('');
      const tip = this.picked && adv && adv.info && this.coachActive() ? adv.info[this.picked] || '' : '';
      const sum = this.sel && this.coachActive() ? this.summary || '' : '';
      const card = cand ? this.callCard(game, rs, cand) : '';
      return `${card}<div class="hand${this.riichiMode ? ' riichi-mode' : ''}" id="hand">${tiles}</div><div class="tipline" id="tipline">${tip}</div><div class="actrow"><div class="sumline">${sum}</div><div class="actions">${this.actionsHTML(game)}</div></div>`;
    },

    /* 鳴ける選択肢ごとに、手牌のどの牌を使うかを求める */
    callOptions(s) {
      const o = s.o, hand = s.p.hand;
      const take = (types) => {
        const used = new Set(), ids = [];
        for (const t of types) { const h = hand.find((x) => x.t === t && !used.has(x.id)); if (h) { used.add(h.id); ids.push(h.id); } }
        return ids;
      };
      const opts = [];
      if (o.pon) opts.push({ kind: 'pon', ids: take([o.tile.t, o.tile.t]), types: [o.tile.t, o.tile.t] });
      for (const c of o.chi) opts.push({ kind: 'chi', ids: take(c.use), types: c.use, a: c.use[0], b: c.use[1] });
      if (o.kan) opts.push({ kind: 'kan', ids: take([o.tile.t, o.tile.t, o.tile.t]), types: [o.tile.t, o.tile.t, o.tile.t] });
      const union = new Set();
      opts.forEach((x) => x.ids.forEach((i) => union.add(i)));
      return { opts, union };
    },
    /* 「どうする?」の大きな確認カード */
    callCard(game, s, cand) {
      const o = s.o;
      const from = game.players[o.from];
      const t = (x) => MJ.tileHTML(x, 't-s');
      const set = (types) => `<span class="cq-set">${types.map(t).join('')}</span><span class="cq-plus">+</span><span class="cq-set cq-new">${t(o.tile.t)}</span>`;
      const label = { pon: 'ポン', chi: 'チー', kan: 'カン' };
      const btns = [];
      if (o.ron) btns.push(`<button class="btn b-ron cq-btn" data-act="ron">ロン!<small>上がります</small></button>`);
      cand.opts.forEach((x) => {
        const extra = x.kind === 'chi' ? ` data-a="${x.a}" data-b="${x.b}"` : '';
        btns.push(`<button class="btn b-call cq-btn" data-act="${x.kind}" data-ids="${x.ids.join(',')}"${extra}><span class="cq-l">${label[x.kind]}</span>${set(x.types)}</button>`);
      });
      const canCall = o.ron || cand.opts.length;
      btns.push(`<button class="btn b-pass cq-btn" data-act="pass">${canCall ? 'パス<small>鳴かない</small>' : 'OK'}</button>`);
      let msg;
      if (o.ron) msg = `ロンできます!`;
      else if (cand.opts.length) msg = `${cand.opts.map((x) => label[x.kind]).filter((v, i, a) => a.indexOf(v) === i).join('・')}できます。どうしますか?`;
      else msg = o.ronBlock === 'furiten' ? 'フリテンのためロンできません' : o.ronBlock === 'noyaku' ? '役がないためロンできません' : '';
      const why = cand.opts.length ? '<div class="cq-why">↑ 持ち上がっている牌が、鳴いたときに使う牌です(ボタンの上にカーソルを置くと、その鳴き方の牌だけ光ります)</div>' : '';
      return `<div class="callq"><div class="cq-head"><span class="cq-from">${from.name}が捨てた</span><span class="cq-tile">${t(o.tile.t)}</span><span class="cq-msg">${msg}</span></div><div class="cq-btns">${btns.join('')}</div>${why}</div>`;
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
      return '';
      // eslint-disable-next-line no-unreachable
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
      if (!this.oneClick && this.picked !== id) { MJ.SFX.play('select'); this.picked = id; this.showInfo(id); this.render(this.game); return; }
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
      const t = this.adv && this.adv.info && this.adv.info[id];
      if (!t || !this.coachActive()) return;
      const el = $('#tipline');
      if (el) el.innerHTML = t;
      const ti = $('#tileinfo');
      if (ti) { ti.style.display = 'block'; ti.innerHTML = t; }
    },

    askSelf(game, p, opts, st) {
      return new Promise((res) => {
        this.sel = { type: 'self', p, opts, st, res };
        this.riichiMode = false; this.picked = null;
        this.adv = this.coachActive() || game.mode !== 'free' ? MJ.Coach.selfAdvice(game, p, opts, st) : null;
        this.coachHtml = this.adv ? this.adv.html : '';
        this.summary = this.adv ? this.adv.summary || '' : '';
        this.render(game);
        this.refreshCoach();
      });
    },
    askReact(game, q, o) {
      return new Promise((res) => {
        this.sel = { type: 'react', p: q, o, res };
        this.adv = null;
        this.coachHtml = this.coachActive() || game.mode !== 'free' ? MJ.Coach.reactAdvice(game, q, o) : '';
        this.summary = o.ron ? 'ロンできます!' : o.chi.length || o.pon || o.kan ? '鳴くかどうかは 🎓解説 で確認できます' : '';
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
      else if (this.coachHtml) {
        // 「この局のポイント」は最初の1巡だけ先頭に出し、その後は最後のページに回す
        const tip = this.tipHtml || '';
        body = g.players[0].discards.length < 1 ? tip + this.coachHtml : this.coachHtml + tip;
      }
      else body = `<div class="cc"><div class="cc-h">${m.short}モード</div><div class="cc-b">${m.desc}</div></div>${this.tipHtml || ''}`;
      if (this.sel && this.sel.type === 'self' && this.coachActive()) body = '<div class="tileinfo" id="tileinfo"></div>' + body;
      el.innerHTML = `<div class="ch"><b>🎓 ${m.name}</b><button class="btn sm rd" data-read="coach">🔊 読み上げ</button></div><div class="ctabs"></div>${body}`;
      this.pageCoach(el);
      MJ.Gloss.decorate(el);
      this.addReadFrom(el);
      this.fitCoachText(el);
    },

    /* 助言カードは、枠に収まる枚数だけまとめて表示(◀▶で次のまとまりへ)。文字は枠いっぱいまで大きくする */
    pageCoach(el) {
      let cards = [...el.querySelectorAll(':scope > .cc')];
      const tabs = el.querySelector('.ctabs');
      // 最初の1巡は「この局のポイント」の次に「おすすめ」を並べる
      const h0 = ((cards[0] && cards[0].querySelector('.cc-h')) || {}).textContent || '';
      const sIdx = cards.findIndex((c) => /★|おすすめ/.test(((c.querySelector('.cc-h') || {}).textContent || '')));
      if (/ポイント/.test(h0) && this.game.players[0].discards.length < 1 && sIdx > 1) { cards[0].after(cards[sIdx]); cards = [...el.querySelectorAll(':scope > .cc')]; }
      this.coachCards = cards.length;
      if (cards.length <= 1) { cards.forEach((c) => c.classList.add('on')); if (tabs) tabs.remove(); this.growFont(el); return; }
      const hd = (c) => ((c.querySelector('.cc-h') || {}).textContent || '').trim();
      const key = cards.length + '|' + hd(cards[0]);
      const star = cards.findIndex((c) => /★|おすすめ/.test(hd(c)));
      if (key !== this.coachKey) { this.coachKey = key; this.coachPage = 0; this.coachStar = true; }
      let i = Math.max(0, Math.min(this.coachPage || 0, cards.length - 1));
      const show = (from, g) => cards.forEach((c, j) => c.classList.toggle('on', j >= from && j < from + g));
      const fits = (px) => { el.style.fontSize = px + 'px'; return el.scrollHeight <= el.clientHeight + 1; };
      const choose = (from) => {
        for (let g = cards.length - from; g >= 1; g--) { show(from, g); if (fits(g === 1 ? 10 : 15)) return g; }
        show(from, 1); return 1;
      };
      let g = choose(i);
      // 最初は「おすすめ」カードが見える位置から
      const tipFirst = this.game.players[0].discards.length < 1 && /ポイント/.test(hd(cards[0]));
      if (this.coachStar && star >= 0 && !tipFirst && !(star >= i && star < i + g)) { i = star; g = choose(i); }
      this.coachStar = false;
      this.coachPage = i; this.coachG = g;
      this.growFont(el);
      tabs.innerHTML = `<button class="btn sm pg" data-pg="-1" aria-label="前へ">◀</button><span class="pgs">${cards.map((c, j) => `<i data-pj="${j}" class="${j >= i && j < i + g ? 'on' : ''}"></i>`).join('')}</span><span class="pgt">${i + 1}${g > 1 ? '-' + (i + g) : ''}/${cards.length}</span><button class="btn sm pg" data-pg="1" aria-label="次へ">▶</button>`;
    },
    /* 表示中の内容が枠に収まる最大の文字サイズにする(10〜22px) */
    growFont(el) {
      let px = 17;
      el.style.fontSize = px + 'px';
      while (el.scrollHeight > el.clientHeight + 1 && px > 10) { px -= 0.5; el.style.fontSize = px + 'px'; }
    },
    fitCoachText(el) { this.growFont(el); },
    goCoachPage(d, abs) {
      const el = $('#coach');
      const n = this.coachCards || 1, g = this.coachG || 1;
      if (abs != null) this.coachPage = abs;
      else { let nx = (this.coachPage || 0) + d * g; if (nx >= n) nx = 0; if (nx < 0) nx = Math.max(0, n - g); this.coachPage = nx; }
      this.pageCoach(el);
      MJ.Gloss.decorate(el);
      this.growFont(el);
    },

    /* ---------- 演出 ---------- */
    banner(game, p, text) {
      const col = text === 'リーチ' ? '#ff5b8a' : text === 'ロン' || text === 'ツモ' ? '#ff7b5a' : '#5aa6ff';
      const fx = $('#fx');
      const SFXN = { 'リーチ': 'riichi', 'ポン': 'call', 'チー': 'call', 'カン': 'kan', 'ロン': 'ron', 'ツモ': 'tsumo' };
      MJ.SFX.play(SFXN[text]);
      MJ.SFX.voice(text, p);
      const face = p.char && p.char.img ? `<img class="bface" src="${p.char.img}" alt="">` : '';
      fx.innerHTML = `<div class="banner" style="--c:${col}">${face}${text}<small>${p.name}</small></div>`;
      return new Promise((r) => setTimeout(() => { fx.innerHTML = ''; r(); }, game.fast ? 0 : 1000));
    },
    speak(game, p, text) {
      this.bubbles[p.seat] = { text, until: Date.now() + 2300 };
      setTimeout(() => { if (this.game === game) this.render(game); }, 2400);
    },
    handStart(game) {
      MJ.SFX.play('start');
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
      MJ.Gloss.decorate(o);
      this.addReadFrom(o.querySelector('.modal'));
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
        if (res.type === 'win') MJ.SFX.play(res.wins.some((w) => w.winner.isHuman) ? 'win' : res.delta[0] < 0 ? 'lose' : 'win');
        else MJ.SFX.play('drawgame');
        const last = game.length === 'single';
        html += `<div style="text-align:right"><button class="btn pri" id="res-next">${last ? '結果へ' : '次へ'}</button></div>`;
        html = `<div class="readbar"><button class="btn sm rd" data-read="modal">🔊 結果を読み上げ</button></div>` + html;
        this.overlay(html);
        $('#res-next').addEventListener('click', () => { this.closeOverlay(); resolve(); });
        this.render(game);
      });
    },

    gameEnd(game, final) {
      return new Promise((resolve) => {
        const me = final.results.find((r) => r.p.seat === 0);
        MJ.SFX.play(me.rank <= 2 ? 'end' : 'lose');
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
