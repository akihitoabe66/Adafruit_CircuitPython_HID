/* 対局画面の描画と入力 */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const $ = (s) => document.querySelector(s);
  const WINDS = ['東', '南', '西', '北'];
  const fmt = (n) => n.toLocaleString('ja-JP');
  const signed = (n) => (n > 0 ? `<span class="plus">+${fmt(n)}</span>` : n < 0 ? `<span class="minus">${fmt(n)}</span>` : '±0');

  const UI = (MJ.UI = {
    orient: (() => { try { return localStorage.getItem('mj_orient') || 'auto'; } catch (e) { return 'auto'; } })(),
    dangerSym: (() => { try { return JSON.parse(localStorage.getItem('mj_dsym')) === true; } catch (e) { return false; } })(), game: null, hintOn: true, oneClick: false, reveal: false, sel: null, bubbles: {}, adv: null, picked: null, riichiMode: false, reactHtml: '', coachHtml: '',

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
        const cb = e.target.closest('.cq-cb');
        if (cb) { this.setChi(+cb.dataset.i); const cbtn = document.querySelector('.callq .cq-btn[data-act=chi]'); if (cbtn) this.onAction(cbtn); return; }
        const b = e.target.closest('button[data-act]');
        if (b) return this.onAction(b);
        const tl = e.target.closest('.hand .tile[data-id]');
        if (tl) this.onTile(+tl.dataset.id);
      });
      $('#sd-act').addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b && !b.disabled) this.onAction(b); });
      $('#btn-tools').addEventListener('click', () => $('#sd-tools').classList.toggle('hidden'));
      document.addEventListener('click', (e) => { if (!e.target.closest('#sd-tools, #btn-tools')) $('#sd-tools').classList.add('hidden'); });
      const hl = (ids) => M.querySelectorAll('.hand .tile[data-id]').forEach((tl) => tl.classList.toggle('cand', ids.includes(tl.dataset.id)));
      const allIds = () => [...M.querySelectorAll('.cq-btn[data-ids]')].flatMap((b) => b.dataset.ids.split(','));
      M.addEventListener('click', (e) => {
        const dt = e.target.closest('[data-dtab]');
        if (!dt) return;
        this.dngTab = dt.dataset.dtab === 'all' ? 'all' : +dt.dataset.dtab;
        this.render(this.game);
      });
      M.addEventListener('mouseout', (e) => {
        if (e.target.closest('.hand .tile[data-id]') && this.dng) {
          const pk = this.picked != null ? this.sel && this.sel.p.hand.find((x) => x.id === this.picked) : null;
          this.hilite(pk ? pk.t : null);
        }
      });
      M.addEventListener('mouseover', (e) => {
        const cb = e.target.closest('.cq-btn[data-ids]');
        if (cb) hl(cb.dataset.ids.split(','));
      });
      M.addEventListener('mouseout', (e) => { if (e.target.closest('.cq-btn')) this.hlCall(null); });
      M.addEventListener('mouseover', (e) => {
        const tl = e.target.closest('.hand .tile[data-id]');
        if (tl) this.showInfo(+tl.dataset.id);
      });
      $('#btn-danger').addEventListener('click', () => this.setDanger(!this.dangerOn));
      $('#btn-tl').addEventListener('click', () => this.showTimeline());
      $('#btn-coach').addEventListener('click', () => { const on = document.body.classList.toggle('coach-open'); $('#btn-coach').textContent = on ? '✕ 閉じる' : '🎓 解説'; this.fitCoachText($('#coach')); });
      window.addEventListener('resize', () => { this.relayout(); this.fitOverlay(); });
      window.addEventListener('orientationchange', () => setTimeout(() => this.relayout(), 250));
      $('#opt-reveal').addEventListener('change', (e) => { this.reveal = e.target.checked; document.body.classList.toggle('reveal-on', this.reveal); if (this.game) this.render(this.game); });
      $('#btn-peek').addEventListener('click', () => this.showPeek());
      $('#opt-one').addEventListener('change', (e) => { this.oneClick = e.target.checked; });
      $('#opt-dsym').checked = this.dangerSym; $('#opt-dsym').addEventListener('change', (e) => { this.dangerSym = e.target.checked; try { localStorage.setItem('mj_dsym', JSON.stringify(this.dangerSym)); } catch (x) { /* ignore */ } if (this.game) this.render(this.game); });
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
          if (MJ.SFX.speaking()) { MJ.SFX.stopSpeak(); if (this._rfLast === rf) { this._rfLast = null; return; } }
          this._rfLast = rf;
          if (!this.readAloud(root, blk, rf)) this.toast('この端末には日本語の読み上げ音声がありません');
          return;
        }
        const b = e.target.closest('[data-read]');
        if (!b) return;
        const root = b.dataset.read === 'coach' ? $('#coach') : b.dataset.read === 'drill' ? $('#dq-fb') : b.dataset.read === 'page' ? ($('.modal .pm-page.on') || $('.modal')) : b.dataset.read === 'review' ? ($('.modal .rv') || $('.modal')) : $('.modal');
        if (!root) return;
        if (MJ.SFX.speaking()) { MJ.SFX.stopSpeak(); return; }
        if (!this.readAloud(root, null, b)) this.toast('この端末には日本語の読み上げ音声がありません');
      });
      document.addEventListener('click', (e) => {
        // 解説の引き出し: ✕ボタン、または引き出しの外をタップで閉じる
        if (document.body.classList.contains('coach-open')) {
          const inDrawer = e.target.closest('#coach');
          const isDrawer = !document.body.classList.contains('desk');
          if (isDrawer && (e.target.closest('[data-coachclose]') || (!inDrawer && !e.target.closest('#btn-coach, .gl, #overlay, #gloss-sheet, #gloss-panel, #mine, #side') && !(e.composedPath ? e.composedPath() : []).some((n) => n && (n.id === 'mine' || n.id === 'side'))))) { document.body.classList.remove('coach-open'); return; }
        }
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
      // 解説ボタンの文字は、窓がどの方法で開閉されても(外をタッチ・✕・ボタン)、実際の状態に合わせる
      new MutationObserver(() => { const b = $('#btn-coach'); if (b) b.textContent = document.body.classList.contains('coach-open') ? '✕ 閉じる' : '🎓 解説'; }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      $('#btn-hint').addEventListener('click', () => this.toggleHint());
      $('#btn-teach').addEventListener('click', () => this.setTeacher(!this.hintOn)); // 対局中に、先生(ヒント)の あり / なし を切り替える
      document.addEventListener('click', (e) => { if (e.target.closest('[data-hintoggle]')) this.toggleHint(); });
    },

    /* フリー対戦のヒント(★・解説・危険度)を、入れたり消したりする */
    toggleHint() {
      this.hintOn = !this.hintOn;
      const s = this.sel;
      if (this.hintOn) {
        if (s) {
          if (s.type === 'self') { this.adv = MJ.Coach.selfAdvice(this.game, s.p, s.opts, s.st); this.coachHtml = this.adv.html; this.summary = this.adv.summary || ''; }
          else this.coachHtml = MJ.Coach.reactAdvice(this.game, s.p, s.o);
        }
      } else { this.adv = null; this.coachHtml = ''; this.summary = ''; this.picked = null; }
      this.syncHintBtn();
      if (this.game) this.render(this.game);
      this.refreshCoach();
    },
    /* 先生(おすすめの牌・注意の表示)の あり / なし */
    setTeacher(on) {
      if (!!this.hintOn !== !!on) this.toggleHint();
      this.dangerOn = !!on;
      if (this.game) { if (this.sel && this.sel.type === 'self') this.buildDanger(this.game, this.sel.p); else { this.dng = null; } this.render(this.game); }
      this.syncHintBtn();
      this.toast(on ? '先生を つけました' : '先生を はずしました');
    },
    syncHintBtn() {
      const t = $('#btn-teach');
      if (t) { t.textContent = `先生: ${this.hintOn ? 'あり' : 'なし'}`; t.classList.toggle('on', !!this.hintOn); }
      const b = $('#btn-hint');
      if (b) { b.textContent = `💡 ヒント: ${this.hintOn ? 'オン' : 'オフ'}`; b.classList.toggle('on', !!this.hintOn); }
    },

    sfx(name) { MJ.SFX.play(name); },

    onAudioCtl(e) {
      const c = e.target.closest && e.target.closest('.ac');
      if (!c) return;
      const k = c.dataset.audio, v = c.type === 'range' ? +c.value : c.tagName === 'SELECT' ? c.value : c.checked;
      if (k === 'bgm') MJ.Audio.setOn(v);
      else if (k === 'vol') MJ.Audio.setVolume(v);
      else if (k === 'sfx') MJ.SFX.setOn(v);
      else if (k === 'svol') MJ.SFX.setVol(v);
      else if (k === 'voice') MJ.SFX.setVoice(v);
      else if (k === 'banter') MJ.Banter.setOn(v);
      else if (k === 'yakuread') MJ.SFX.setYakuRead(v);
      else if (k === 'danger') { if (this.game) this.setDanger(v); }
      else if (k === 'orient') { this.orient = v; try { localStorage.setItem('mj_orient', v); } catch (e) { /* ignore */ } this.relayout(); }
      else if (k === 'cvol') { MJ.SFX.setCallVol(v); if (e.type === 'change') MJ.SFX.voice('ポン', { char: { id: 1 } }); }
      else if (k === 'rvol') { MJ.SFX.setReadVol(v); if (e.type === 'change') this.sampleRead(); }
      else if (k === 'rrate') { MJ.SFX.setReadRate(v); if (e.type === 'change') this.sampleRead(); }
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
      if (!root || root.querySelector('.tl')) return;
      (kids || [...root.children]).forEach((k) => {
        if (k.classList.contains('ch') || k.classList.contains('ctabs') || k.classList.contains('readbar') || k.querySelector(':scope > .rf') || (k.textContent || '').trim().length < 6 || k.tagName === 'BUTTON') return;
        k.classList.add('rfb');
        k.insertAdjacentHTML('afterbegin', '<button class="rf rd" data-readfrom title="ここから読み上げ" aria-label="ここから読み上げ">▶</button>');
      });
    },
    sampleRead() { MJ.SFX.stopSpeak(); MJ.SFX.read('この速さと大きさで読み上げます。白は、ハク。'); },
    syncAudio(except) {
      const val = { bgm: MJ.Audio.on, vol: MJ.Audio.volume, sfx: MJ.SFX.on, svol: MJ.SFX.vol, voice: MJ.SFX.voiceOn, banter: MJ.Banter.on, yakuread: MJ.SFX.yakuRead, danger: !!this.dangerOn, orient: this.orient, rvol: MJ.SFX.readVol, rrate: MJ.SFX.readRate, cvol: MJ.SFX.callVol };
      const bell = $('#bell');
      if (bell) {
        bell.setAttribute('aria-pressed', String(MJ.Audio.on));
        bell.querySelector('.bi').textContent = MJ.Audio.on ? '🔔' : '🔕';
        bell.querySelector('.bt').textContent = MJ.Audio.on ? 'BGM ON' : 'BGM OFF';
      }
      document.querySelectorAll('.ac').forEach((c) => {
        if (c === except) return;
        const v = val[c.dataset.audio];
        if (c.type === 'range' || c.tagName === 'SELECT') c.value = v; else c.checked = v;
      });
    },
    toast(msg) {
      let t = $('#toast');
      if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
      t.textContent = msg; t.style.display = 'block';
      clearTimeout(this._tt); this._tt = setTimeout(() => { t.style.display = 'none'; }, 2200);
    },
    /* 画面の文章を読み上げ用テキストにする */
    /* 読み上げ: 読んでいる場所の文を色で示し(流れるように移る)、押したボタンも「読み上げ中」の表示にする */
    readAloud(root, from, btn) {
      const text = this.textOf(root, from);
      // 画面の文字(読む対象のぶん)を、順に並べて位置を数える
      const skip = '.ch, .rd, button, table.scores, .ctabs, summary, script, style, .cnav, .rf';
      const nodes = [];
      let total = 0;
      const startEl = from || null;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => {
        const p = n.parentElement;
        if (!p || p.closest(skip) || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const cs = getComputedStyle(p);
        if (cs.display === 'none' || cs.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
        if (p.closest('.cc:not(.on)')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      } });
      let started = !startEl;
      let n;
      while ((n = walker.nextNode())) {
        if (!started) { if (startEl.contains(n) || (startEl.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING)) started = true; else continue; }
        nodes.push({ n, s: total }); total += n.nodeValue.length;
      }
      const full = nodes.map((x) => x.n.nodeValue).join('');
      const bounds = [0];
      for (let i = 0; i < full.length; i++) if (/[。!?\n]/.test(full[i])) bounds.push(i + 1);
      // 見出し・箇条書きなど、ブロックの切れ目も、文の区切りにする
      const blk = (el) => el.closest('div, li, p, ul, ol, h2, h3, tr');
      for (let k = 1; k < nodes.length; k++) if (blk(nodes[k].n.parentElement) !== blk(nodes[k - 1].n.parentElement)) bounds.push(nodes[k].s);
      bounds.sort((x, y) => x - y);
      for (let k = bounds.length - 1; k > 0; k--) if (bounds[k] === bounds[k - 1]) bounds.splice(k, 1);
      if (bounds[bounds.length - 1] < full.length) bounds.push(full.length);
      const locate = (off) => { for (const x of nodes) if (off < x.s + x.n.nodeValue.length) return [x.n, Math.max(0, off - x.s)]; const l = nodes[nodes.length - 1]; return l ? [l.n, l.n.nodeValue.length] : null; };
      const hi = (f) => {
        if (!window.CSS || !CSS.highlights || !nodes.length) return;
        const off = Math.min(full.length - 1, Math.max(0, Math.floor(f * full.length)));
        let s0 = 0, e0 = full.length;
        for (let i = 0; i + 1 < bounds.length; i++) if (off >= bounds[i] && off < bounds[i + 1]) { s0 = bounds[i]; e0 = bounds[i + 1]; break; }
        const A = locate(s0), B = locate(Math.max(s0, e0 - 1));
        if (!A || !B) return;
        try { const r = document.createRange(); r.setStart(A[0], A[1]); r.setEnd(B[0], Math.min(B[0].nodeValue.length, B[1] + 1)); CSS.highlights.set('reading', new Highlight(r)); } catch (x) { /* ignore */ }
      };
      const label = btn && btn.dataset && btn.dataset.read ? btn.innerHTML : null;
      const mark = (on) => {
        document.body.classList.toggle('reading', on);
        document.querySelectorAll('.reading-btn').forEach((x) => { x.classList.remove('reading-btn'); if (x._lab != null) { x.innerHTML = x._lab; x._lab = null; } });
        if (on && btn) { btn.classList.add('reading-btn'); if (label != null) { btn._lab = label; btn.innerHTML = '<span class="eq"><i></i><i></i><i></i></span> 読み上げ中(タップで止める)'; } }
        if (!on && window.CSS && CSS.highlights) CSS.highlights.delete('reading');
      };
      const ok = MJ.SFX.read(text, (ev) => { if (!ev) { mark(false); return; } hi((ev.a + ev.b) / 2 * 0.98 + 0.0001); });
      if (ok) mark(true);
      return ok;
    },
    textOf(root, from) {
      const c = root.cloneNode(true);
      if (from) { const k = [...root.children].indexOf(from); for (let n = 0; n < k; n++) c.children[0].remove(); }
      if (root.id === 'coach') c.querySelectorAll('.cc:not(.on)').forEach((n) => n.remove()); // いま見えているカードだけ読む(タブを切り替えたらそこから)
      c.querySelectorAll('.ch, .rd, button, table.scores, .ctabs, summary, script, style').forEach((n) => n.remove());
      // 牌の絵は「名前」を読むが、すぐ後ろに同じ名前の文字がある場合は重複して読まない。牌が4つ以上並ぶ所は最初の3つまで
      c.querySelectorAll('img').forEach((i) => i.replaceWith(document.createTextNode(i.alt ? `\u0001${i.alt}\u0002` : '')));
      c.querySelectorAll('li, .cc, .cc-h, tr, p, div').forEach((n) => n.append('。'));
      let t = c.textContent;
      const map = [[/萬/g, 'マン'], [/筒/g, 'ピン'], [/索/g, 'ソウ'], [/飜/g, 'ハン'], [/符/g, 'フ'], [/和了/g, 'あがり'], [/牌/g, 'パイ'], [/×/g, 'かける'], [/≒/g, 'およそ'], [/→/g, '、'], [/%/g, 'パーセント'], [/\//g, '、'], [/[★☆✨🎉🛡🚨🔎📘🎯💡⚖🚫🥇🥈🥉🧠📊⚠🎓📈]/gu, ''], [/ /g, ' ']];
      t = t.replace(/\u0001([^\u0002]+)\u0002\s*(\1)/g, '$1'); // 牌の絵+同じ名前の文字
      t = t.replace(/((?:\u0001[^\u0002]+\u0002[\s、,・]*){3})(?:\u0001[^\u0002]+\u0002[\s、,・]*)+/g, '$1など'); // 長い牌の並び
      t = t.replace(/[\u0001\u0002]/g, '');
      if (MJ.Yomi) t = MJ.Yomi.fix(t); // 用語・牌の名前の正しい読み(「牌→パイ」などの置き換えより先に)
      map.forEach(([r, s]) => { t = t.replace(r, s); });
      return t.replace(/\s+/g, ' ').replace(/。(\s*。)+/g, '。').trim();
    },

    attach(game) {
      this.game = game;
      // 前の対局の盤面・手牌が残って見えないよう、最初に空にする(配牌が終わるまで盤面は出さない)
      ['#table', '#mine', '#says', '#sd-act', '#sd-info', '#fx'].forEach((s) => { const e = $(s); if (e) e.innerHTML = ''; });
      document.body.classList.add('dealing');
      this.sel = null; this.bubbles = {}; this.adv = null; this.picked = null; this.riichiMode = false; this.reactHtml = '';
      this.hintOn = game.mode !== 'free';
      this.syncHintBtn();
      // 危険度の表示(◎○△✕・★): 入門・捨て牌・中級は初期ON、フリー対戦は初期OFF(設定で切替、モードごとに記憶)
      try { const v = localStorage.getItem('mj_danger_' + game.mode); this.dangerOn = v === null ? game.mode !== 'free' : JSON.parse(v); } catch (e) { this.dangerOn = game.mode !== 'free'; }
      this.dng = null; this.dngTab = 'all'; this.hiType = null;
      this.syncAudio();
      this.oneClick = game.mode === 'free';
      $('#opt-one').checked = this.oneClick;
      this.reveal = false;
      document.body.classList.remove('reveal-on');
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
    setDanger(v) {
      this.dangerOn = v;
      try { localStorage.setItem('mj_danger_' + this.game.mode, JSON.stringify(v)); } catch (e) { /* ignore */ }
      if (this.sel && this.sel.type === 'self') this.buildDanger(this.game, this.sel.p); else { this.dng = null; this.hilite(null); }
      this.syncAudio();
      this.render(this.game);
    },
    relayout() { this.applyRot(); if (this.game) { this.layoutKey = ''; this.render(this.game); } },
    /* 縦持ちのスマホは、タイトルからすべての画面を90°回して横画面で表示する(設定で縦のままにもできる) */
    applyRot() {
      const RW = window.innerWidth, RH = window.innerHeight;
      const rot = RH > RW; // 縦持ちは常に横画面(90°回転)で表示する
      document.body.classList.toggle('rot', rot);
      const rs = document.documentElement.style;
      rs.setProperty('--vw', RW + 'px'); rs.setProperty('--vh', RH + 'px');
      // 文字・牌を読みやすい大きさに保つための拡大率(スマホ横=1、720pで約1.5、1080pで約2.3)
      const Wl = rot ? RH : RW, Hl = rot ? RW : RH;
      this.S2 = Math.max(1, Math.min(2.6, Math.min(Hl / 428, Wl / 832)));
      rs.setProperty('--S', this.S2.toFixed(3));
      rs.setProperty('--Z', Math.max(1, Math.min(2.2, Hl / 520)).toFixed(3));
      rs.setProperty('--oy', Math.max(0, Math.round((Hl - 428 * this.S2) / 2)) + 'px');
      return rot;
    },
    coachActive() { return this.game.mode !== 'free' || this.hintOn; },

    /* ---------- レイアウト(画面サイズに合わせて牌の大きさを決める) ---------- */
    /* 対局画面を「ステージ」として扱う: PC/タブレット横=16:9を基準に拡大縮小、スマホ縦=9:16〜9:19.5、
       スマホ横=16:9〜19.5:9。比率が合わない分は黒帯(暗い背景)にして、画面内にスクロールなしで収める */
    /* ステージの大きさを決めて el に適用する(対局・練習問題で共通) */
    stageFor(el) {
      let W = window.innerWidth, H = window.innerHeight;
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      const rot = this.applyRot(); // 回転は #app 全体に掛かる(CSS)。ここでは回転後の大きさで計算するだけ
      const RW = W, RH = H; // 実際の画面サイズ
      if (rot) { W = RH; H = RW; }
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
      return { w: sw, h: sh, sc };
    },
    fitStage() {
      const el = $('#screen-game');
      if (!el || el.classList.contains('hidden')) return;
      const st = this.stageFor(el);
      if (!this.stage || this.stage.w !== st.w || this.stage.h !== st.h) this.layoutKey = '';
      this.stage = st;
    },

    /* 盤面は設計座標(720×428)に固定し、ステージの大きさに合わせて拡大縮小する。右端に 112 幅のボタン列 */
    layout() {
      this.fitStage();
      const st = this.stage;
      if (!st) return;
      const W = st.w, H = st.h;
      const body = document.body;
      body.classList.remove('desk');
      body.classList.add('land', 'tbl');
      body.classList.toggle('short', H <= 640);
      const S = Math.min(H / 428, W / 832);
      this.S = S;
      const ox = Math.round((W - 112 * S - 720 * S) / 2), oy = Math.round((H - 428 * S) / 2);
      document.documentElement.style.setProperty('--S', S.toFixed(4)); document.documentElement.style.setProperty('--oy', oy + 'px'); // 解説の窓は、対局画面の設計座標に合わせる
      const key = [W, H].join('x');
      if (key === this.layoutKey) return;
      this.layoutKey = key;
      $('#sc').style.transform = `translate(${ox}px, ${oy}px) scale(${S})`;
      document.documentElement.style.setProperty('--ox', ox + 'px');
      $('#side').style.width = Math.round(112 * S) + 'px';
      $('#side-in').style.transform = `translateY(${oy}px) scale(${S})`;
      this.setSizes(26, 44);
    },
    setSizes(sw, hw) {
      this.sizes = { sw, hw };
      const r = document.documentElement.style;
      r.setProperty('--sw', sw + 'px');
      r.setProperty('--sh', Math.round(sw * 1.32) + 'px');
      r.setProperty('--hw', hw + 'px');
    },
    fitHeight() {},

    /* ---------- 描画 ---------- */
    render(game) {
      if (this.game !== game) return;
      this.layout();
      document.body.classList.remove('dealing');
      const s0 = this.sel;
      if (s0 && this._alertSel !== s0) { // 上がれるとき(ツモ・ロン)は、大きく知らせる
        if (s0.type === 'self' && s0.opts && s0.opts.tsumo) { this._alertSel = s0; this.alertWin('ツモれる!'); }
        else if (s0.type === 'react' && s0.o && s0.o.ron) { this._alertSel = s0; this.alertWin('ロンできる!'); }
      }
      $('#table').innerHTML = this.tableHTML(game);
      $('#mine').innerHTML = this.mineHTML(game);
      $('#sd-act').innerHTML = this.sideHTML(game);
      $('#sd-info').innerHTML = `<b>${game.kyokuLabel()}</b><span>${{ single: '1局戦', south: '東南戦' }[game.length] || '東風戦'}</span>`;
      document.body.classList.toggle('calling', !!(this.sel && this.sel.type === 'react' && this.callOptions(this.sel).opts.length));
      this.fitTip();
      if (this.sel && this.sel.type === 'react' && document.querySelector('.callq .cq-btn[data-ids]')) this.hlCall(null); // 鳴きの確認が出たら、最初の鳴き方の牌を光らせる
      // 鳴きの確認が出ている間は、先生のアドバイスを左下に出す。終わったら消す
      if (this.sel && this.sel.type === 'react' && this._brief && document.querySelector('.callq')) { const d = $('#says .tdock'); if (!d || d.dataset.kind !== 'call') this.teacherSay(this._brief.text, this._brief.rec === 'pass' ? 'pass' : this._brief.rec === 'ron' ? 'ron' : 'ok', 0, 'call'); }
      else this.clearDock('call');
      if (MJ.Pad && MJ.Pad.syncLock) MJ.Pad.syncLock();
      if (this.dng) this.hilite(this.picked != null ? ((game.players[0].hand.find((x) => x.id === this.picked) || {}).t) : this.hiType);
      if (MJ.Pad) MJ.Pad.refocus();
    },

    meldHTML(m) {
      const tiles = m.tiles.map((h, i) => {
        if (m.kind === 'ankan' && (i === 0 || i === 3)) return MJ.backHTML();
        return MJ.tileHTML(h.t, h === m.called ? 'called-t' : '', '', h.red);
      });
      return `<div class="meld">${tiles.join('')}</div>`;
    },

    /* ---------- 卓(設計座標 720×428)---------- */
    /* 牌を、席の向き rot(0/90/180/-90)に合わせて置く。called=鳴いた牌(さらに横向き) */
    seatTile(t, rot, w, h, o = {}) {
      const a = (((rot + (o.side ? 90 : 0)) % 360) + 360) % 360;
      const flat = a % 180 === 0;
      const bw = flat ? w : h, bh = flat ? h : w;
      return `<div class="tile st${o.cls ? ' ' + o.cls : ''}${o.red ? ' aka' : ''}" style="width:${bw}px;height:${bh}px" data-t="${t}"><img src="${MJ.tileSrc(t, o.red)}" alt="" draggable="false" style="width:${w}px;height:${h}px;transform:translate(-50%,-50%) rotate(${a}deg)"></div>`;
    },
    tableHTML(game) {
      // 本物の麻雀のように、王牌を、上下2段に重ねた7つの山で見せる。左から 槓ドラ④③②①、ドラ表示牌、嶺上牌2つ。表の牌は、めくれている表示牌だけ
      const stk = [];
      for (let i = 0; i < 7; i++) {
        const di = 4 - i; // 左から4番目(0始まり)がドラ表示牌 = doraInd[0]。左へ、槓ドラ
        const up = di >= 0 && di < game.doraInd.length ? MJ.tileHTML(game.doraInd[di].t, '', '', game.doraInd[di].red) : MJ.backHTML();
        stk.push(`<span class="stk"><span class="dn">${MJ.backHTML()}</span><span class="up">${up}</span></span>`);
      }
      const doras = stk.join('');
      const dora2 = '';
      const sub = [game.kyotaku ? `供託${game.kyotaku}` : ''].filter(Boolean).join(' ');
      const ctr = `<div class="ctr"><div class="k">${game.kyokuLabel()}${sub ? `<small>${sub}</small>` : ''}</div><div class="n"><small>残り</small>${game.live.length}<small>枚</small></div><div class="dr wall">${doras}</div></div>`;
      return ctr + [0, 1, 2, 3].map((s) => this.block(game, s)).join('');
    },
    block(game, s) {
      const p = game.players[s];
      const ch = p.char || {};
      const w = game.seatWindOf(p);
      const ROT = [0, -90, 180, 90][s];
      // 河: 6枚ずつ。1段目が中央側、新しい段ほど席の手前。リーチ牌は横向き(横幅ぶん隣を押し出す)
      let rows = '';
      for (let i = 0; i < p.discards.length; i += 6) {
        rows += `<div class="rrow">${p.discards.slice(i, i + 6).map((d) => MJ.tileHTML(d.tile.t, `${d.called ? 'called' : ''}${d.riichi ? ' rch' : ''}${game.lastDiscard && game.lastDiscard.d === d && !d.called ? ' hl' : ''}`, '', d.tile.red)).join('')}</div>`;
      }
      const river = `<div class="river r${s}">${rows}</div>`;
      // 伏せた(または見える)手牌を席の縁に並べる
      let hand = '';
      if (s !== 0) {
        const n = p.hand.length;
        const sorted = p.hand.slice().sort((a, b) => a.t - b.t || a.id - b.id);
        for (let i = 0; i < n; i++) {
          if (this.reveal) {
            const x = s === 2 ? 228 + i * 22 : s === 1 ? 688 : 6, y = s === 2 ? 3 : 30 + i * 20;
            hand += `<div class="ab" style="left:${x}px;top:${y}px">${this.seatTile(sorted[i].t, s === 2 ? 0 : ROT, 22, 30, { red: sorted[i].red })}</div>`;
          } else {
            const x = s === 2 ? 240 + i * 17 : s === 1 ? 690 : 6, y = s === 2 ? 4 : 30 + i * 17;
            hand += s === 2 ? `<div class="bk" style="left:${x}px;top:${y}px;width:16px;height:24px"></div>` : `<div class="bk" style="left:${x}px;top:${y}px;width:24px;height:16px"></div>`;
          }
        }
      }
      // 公開した面子(席の手前)。鳴いた牌は横向き
      const mt = s === 0 ? [30, 40] : [22, 30];
      const melds = p.melds.length ? `<div class="melds m${s}">${p.melds.map((m) => `<div class="mg">${m.tiles.map((h, i) => (m.kind === 'ankan' && (i === 0 || i === 3) ? this.seatTile(h.t, ROT, mt[0], mt[1], { cls: 'bkt' }).replace(/<img[^>]*>/, '') : this.seatTile(h.t, ROT, mt[0], mt[1], { side: h === m.called, red: h.red }))).join('')}</div>`).join('')}</div>` : '';
      const plq = `<div class="plq p${s}${game.turn === s ? ' act' : ''}${p.riichi ? ' rch-on' : ''}"><b class="wd${w === 0 ? ' dl' : ''}">${WINDS[w]}</b><span class="pn" style="font-size:${p.name.length <= 4 ? 17 : p.name.length <= 5 ? 16 : 14}px">${p.name}</span><i>${fmt(p.score)}</i>${p.riichi ? '<em>リーチ</em>' : ''}</div>`;
      return `<div class="blk" data-seat="${s}">${river}${hand}${melds}${plq}</div>`;
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
        if (sel) {
          const ok = this.allowed(sel, h);
          cls += ok ? ' ok' : ' dis';
          if (this.riichiMode && ok) cls += ' rch-ok';
          if (adv && !this.riichiMode && (adv.recId === h.id || (recT != null && h.t === recT))) cls += ' rec';
          const m = adv && adv.marks[h.id];
          if (m && m.txt && this.coachActive() && !this.dng) mk = `<span class="mk ${m.cls}">${m.txt}</span>`;
        }
        if (h === p.drawn) cls += ' drawn';
        if (this.picked === h.id) cls += ' picked';
        const dv0 = sel && this.dng ? this.dangerView(h.t) : null;
        const chip = dv0 ? (this.dangerSym ? `<span class="dgc ${dv0.cls}${dv0.hyp ? ' hyp' : ''}">${dv0.sym}</span>` : `<span class="dgc tg ${dv0.cls}${dv0.hyp ? ' hyp' : ''}">${this.tagShort(dv0.tag)}</span>`) : '';
        if (dv0) cls += ` dgt dg-${dv0.cls}`;
        const isDora = game.doraInd.some((d) => MJ.doraOf(d.t) === h.t);
        const badge = `${isDora ? '<span class="bg dr">ドラ</span>' : ''}${h.red ? '<span class="bg ak">赤</span>' : ''}`;
        return `<div class="tile${cls}${h.red ? ' aka' : ''}${isDora ? ' isdora' : ''}" data-id="${h.id}" data-t="${h.t}">${MJ.tileSVG(h.t, h.red)}${chip}${mk}${badge}</div>`;
      }).join('') + (p.drawn ? '' : '<div class="tile drawn ph"></div>'); // 引いた牌の場所を常に確保(牌の数が変わっても手牌が左右にずれない)
      let tip = this.picked && adv && adv.info && this.coachActive() ? adv.info[this.picked] || '' : '';
      if (!tip && this.dng && sel) tip = this.dangerSym ? `<span class="dglg">左上の印: <b class="dgl safe">◎</b>ほぼ安全 <b class="dgl ok">○</b>比較的安全 <b class="dgl warn">△</b>注意 <b class="dgl danger">✕</b>危険${this.dng.hyp ? ' <span class="cc-s">(いまはリーチなし。「もし全員がリーチしていたら」の目安)</span>' : ''}</span>` : `<span class="dglg">左上の印: <b class="dgl safe">現物</b>100%安全 <b class="dgl safe">スジ</b>安全 <b class="dgl ok">半スジ</b>少し安全 <b class="dgl warn">無スジ</b>注意 ${this.dng.hyp ? ' <span class="cc-s">(いまはリーチなし。「もし全員がリーチしていたら」の目安)</span>' : ''}</span>`;
      const sum = this.sel && this.coachActive() ? this.summary || '' : '';
      const card = cand ? this.callCard(game, rs, cand) : '';
      const dtabs = sel && this.dng && this.dng.opps.length >= 2 ? `<div class="dtabs"><span>危険度の対象:</span><button class="btn sm${this.dngTab === 'all' ? ' on' : ''}" data-dtab="all">全員</button>${this.dng.opps.map((q, i) => `<button class="btn sm${this.dngTab === i ? ' on' : ''}" data-dtab="${i}">${q.name}</button>`).join('')}</div>` : '';
      const msg = sel ? this.msgText(sel) : '';
      const tipHtml = `${msg ? `<div class="tmsg">${msg}</div>` : ''}${tip}`;
      return `${card}<div class="hand${this.riichiMode ? ' riichi-mode' : ''}" id="hand">${tiles}</div><div class="tipline" id="tipline">${tipHtml}</div>${dtabs}`;
    },

    /* スマホ横: CPUの手牌は、盤面の中に小さく出さず、大きな一覧で見せる(盤面や自分の牌が小さくならない) */
    showPeek() {
      const g = this.game;
      if (!g) return;
      const rows = [1, 2, 3].map((s) => {
        const q = g.players[s];
        const hand = q.hand.slice().sort((a, b) => a.t - b.t || a.id - b.id);
        const melds = q.melds.map((m) => '<span class="gap"></span>' + m.tiles.map((h) => MJ.tileHTML(h.t, 't-m', '', h.red)).join('')).join('');
        return `<div class="peek-row"><div class="peek-n"><b>${q.name}</b>${q.riichi ? '<span class="chip r">リーチ</span>' : ''}</div><div class="peek-t">${hand.map((h) => MJ.tileHTML(h.t, 't-m', '', h.red)).join('')}${melds}</div></div>`;
      }).join('');
      this.overlay(`<h2>👁 相手の手牌</h2><div class="peek">${rows}</div><div class="res-foot"><button class="btn pri" id="peek-close">閉じる</button></div>`, { plain: true });
      $('#peek-close').addEventListener('click', () => this.closeOverlay());
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
    /* 先生(麻雀牌のキャラ)。表情ごとに、数枚から選ぶ */
    teacherImg(mood, cls = '') {
      // 表情ごとに、使える絵を、たくさん持っておく(毎回、同じ顔にならないように、かぶらない順で選ぶ)
      const M = {
        ok: ['21', '22', '31', '32', '35'],          // おすすめ・ほめる
        pass: ['15', '25', '24', '34', '12'],        // 見送り・注意
        advice: ['26', '36', '16', '13', '12'],      // ふつうのアドバイス
        aim: ['16', '13', '26', '36', '12'],         // 目指す手
        warn: ['24', '34', '25', '15'],              // 危ない(相手のリーチなど)
        cheer: ['35', '31', '21', '32', '22'],       // 応援
        greet: ['14', '21', '11', '36'],             // あいさつ
        ron: ['23', '33', '35', '11'],
        kan: ['14', '15', '24'],
        pon: ['11', '31'], chi: ['12', '22'],
      };
      const a = M[mood] || M.advice;
      const last = (this._tLast = this._tLast || {});
      let pick = a[Math.floor(Math.random() * a.length)];
      if (a.length > 1 && pick === last[mood]) pick = a[(a.indexOf(pick) + 1) % a.length];
      last[mood] = pick;
      return `<img class="tcut ${cls}" src="img/teacher/t${pick}.png" alt="">`;
    },
    /* 先生が、ときどき出てきて「目指す手」を教える(先生ありのときだけ。25秒以上あけて、確率でたまに) */
    maybeAim(game, p) {
      if (!this.hintOn || game.fast || game.stopped) return;
      this._aimTurns = (this._aimTurns || 0) + 1;
      const now = Date.now();
      if (this._aimTurns < 3 || now - (this._aimAt || 0) < 25000 || Math.random() > 0.3) return;
      const h = MJ.Coach.aimHint(game, p);
      if (!h || h.name === this._aimLast) return;
      this._aimAt = now; this._aimLast = h.name;
      this.teacherSay(h.text, 'aim', 7000);
    },
    /* 先生の置き場所: 左下の、手牌の上(いつもは「切る牌をタップ」の表示がある所)。プレイの邪魔にならない場所に固定 */
    teacherSay(text, mood, ms = 6000, kind = 'tip') {
      const host = $('#says'); if (!host) return;
      this.clearDock();
      const tok = (this._tdTok = (this._tdTok || 0) + 1);
      const el = document.createElement('div');
      el.className = 'tdock'; el.dataset.kind = kind;
      const fs = text.length > 34 ? 11 : text.length > 24 ? 12 : 13;
      el.innerHTML = `${this.teacherImg(mood)}<div class="tb" style="font-size:${fs}px"><b>先生</b>${text}</div>`;
      // セリフとキャラは同時に出す: 絵が読み込まれてから、まとめて表示する(読み込み待ちで横幅が変わらないように)
      const show = () => {
        if (tok !== this._tdTok || !host.isConnected) return;
        host.appendChild(el);
        document.body.classList.add('tdock-on');
        clearTimeout(this._tdT);
        if (ms) this._tdT = setTimeout(() => this.clearDock(), ms);
      };
      const im = el.querySelector('img');
      if (im && !(im.complete && im.naturalWidth)) {
        let done = false;
        const go = () => { if (!done) { done = true; show(); } };
        im.addEventListener('load', go); im.addEventListener('error', go); setTimeout(go, 600);
      } else show();
    },
    clearDock(kind) {
      if (!kind) this._tdTok = (this._tdTok || 0) + 1; // 読み込み待ちの表示も取り消す
      const d = $('#says .tdock');
      if (!d || (kind && d.dataset.kind !== kind)) return;
      d.remove(); document.body.classList.remove('tdock-on'); clearTimeout(this._tdT);
    },
    /* 「どうする?」: 文字だけのボタンを手牌の上に並べる。選んでいる鳴きに使う手牌が持ち上がって光り、捨てられた牌は枠で光る */
    callCard(game, s, cand) {
      const o = s.o;
      const label = { pon: 'ポン', chi: 'チー', kan: 'カン' };
      const chis = cand.opts.filter((x) => x.kind === 'chi');
      this.chiCombos = chis; this.chiIdx = 0;
      const brief = this.hintOn ? MJ.Coach.reactBrief(game, s.p, o) : null; // 先生のひとこと(先生ありのとき)
      this._brief = brief;
      const recKind = brief && brief.rec === 'call' ? brief.kind : null;
      const recTag = '<small class="cq-sub cq-rec">おすすめ</small>';
      const btns = [];
      cand.opts.forEach((x) => {
        if (x.kind === 'chi') {
          if (x !== chis[0]) return; // チーは1つのボタンにまとめる(組み合わせが複数なら、▼で牌を選ぶ)
          const multi = chis.length > 1;
          const ci = brief && brief.rec === 'call' && brief.kind === 'チー' && brief.idx != null && chis[brief.idx] ? brief.idx : 0; // おすすめの組み合わせを、最初から選んでおく
          this.chiIdx = ci;
          const cx = chis[ci];
          btns.push(`<button class="btn b-call cq-btn" data-act="chi" data-ids="${cx.ids.join(',')}" data-a="${cx.a}" data-b="${cx.b}"${multi ? ' data-multi="1"' : ''}>チー${multi ? '<small class="cq-sub cq-pick">▼ 牌をえらぶ</small>' : ''}${recKind === 'チー' ? recTag : ''}</button>`);
          return;
        }
        btns.push(`<button class="btn b-call cq-btn" data-act="${x.kind}" data-ids="${x.ids.join(',')}">${label[x.kind]}${recKind === label[x.kind] ? recTag : ''}</button>`);
      });
      if (o.ron) btns.push(`<button class="btn b-ron cq-btn" data-act="ron">ロン${brief && brief.rec === 'ron' ? recTag : ''}</button>`);
      btns.push(`<button class="btn b-pass cq-btn" data-act="pass">見送る${brief && brief.rec === 'pass' ? recTag : ''}</button>`); // 見送るは、いちばん右
      // チーの組み合わせが複数あるときは、マウスでも選べるように、組み合わせごとのボタンを出す(押すと、その組み合わせでチー)
      const ct = o.tile.t;
      const multiNote = chis.length > 1 ? `<span class="cq-cl">チーの組み合わせ</span>${chis.map((x, i) => `<span class="cq-cb" data-i="${i}">${[x.a, x.b, ct].sort((p, q) => p - q).map((t) => MJ.tileHTML(t, 't-xs' + (t === ct ? ' cq-called' : ''))).join('')}</span>`).join('')}` : '';
      const note = multiNote || (!o.ron && !cand.opts.length ? (o.ronBlock === 'furiten' ? 'フリテンのためロンできません' : o.ronBlock === 'noyaku' ? '役がないためロンできません' : '') : '');
      return `<div class="callq"><div class="cq-btns">${btns.join('')}</div>${note ? `<div class="cq-note">${note}</div>` : ''}<div class="cq-keys"><span class="cq-pk">◀▶ でえらんで <b data-k="A">A</b> で決定</span><span class="cq-pt">◀▶ で牌をえらんで <b data-k="A">A</b> で決定(▲ もどる)</span></div></div>`;
    },
    /* チーの組み合わせを切り替える(▼で牌の選択に入ったあと、◀▶で) */
    setChi(i) {
      const cs = this.chiCombos || [];
      if (!cs.length) return;
      this.chiIdx = Math.max(0, Math.min(cs.length - 1, i));
      const x = cs[this.chiIdx], btn = document.querySelector('.callq .cq-btn[data-act=chi]');
      if (!btn) return;
      btn.dataset.ids = x.ids.join(','); btn.dataset.a = x.a; btn.dataset.b = x.b;
      this.hlCall(btn);
    },
    /* 選んでいる鳴きボタンに合わせて、使う手牌を持ち上げて光らせる */
    hlCall(btn) {
      // 「見送る」などを選んでいるときも、最初の鳴き方(チー・ポン)の牌は、光らせたままにする(何を鳴けるか分かるように)
      if (!btn || !btn.dataset || !btn.dataset.ids) btn = document.querySelector('.callq .cq-btn[data-ids]');
      const ids = btn && btn.dataset && btn.dataset.ids ? btn.dataset.ids.split(',') : [];
      document.querySelectorAll('#mine .hand .tile[data-id]').forEach((tl) => tl.classList.toggle('cand', ids.includes(tl.dataset.id)));
    },

    allowed(sel, h) {
      const p = sel.p;
      if (p.riichi) return h === p.drawn;
      if (sel.opts.forbid.includes(h.t)) return false;
      if (this.riichiMode) return sel.opts.riichi.includes(h.t);
      return true;
    },

    msgText(s) {
      const o = s.opts;
      return !s.p.riichi && o.riichi.length && !this.riichiMode ? '<b class="rch-hint">テンパイ!リーチできます</b>' : s.p.riichi ? 'リーチ中: ツモ切りです' : s.st.afterCall ? '1枚切ります(暗い牌は食い替え禁止)' : this.riichiMode ? '赤枠の牌でリーチ成立' : this.oneClick ? '切る牌をタップ' : '牌を選んで、もう一度タッチで捨てる';
    },
    /* 右端の縦ボタン列(いつも同じ並びで、押せないものは灰色) */
    sideHTML(game) {
      const s = this.sel;
      const self = s && s.type === 'self' ? s : null;
      const o = self ? self.opts : null;
      const B = (cls, act, label, on, extra = '') => `<button class="btn sb act ${cls}${on ? ' on' : ''}" data-act="${act}" ${on ? '' : 'disabled'} ${extra}>${label}</button>`;
      const kans = self ? [...o.ankan.map((t) => ['ankan', t]), ...o.kakan.map((t) => ['kakan', t])] : [];
      const kan = kans.length ? `<div class="sb-row">${kans.map(([k, t]) => B('b-call', k, kans.length > 1 ? `カン${MJ.tileName(t)}` : 'カン', true, `data-t="${t}"`)).join('')}</div>` : B('b-call', 'kan', 'カン', false);
      const canDis = !!(self && this.picked != null);
      return `${o && o.tsumo ? B('b-tsumo pulse', 'tsumo', 'ツモ!', true) : B('b-tsumo', 'tsumo', 'ツモ', false)}${o && o.riichi.length ? B('b-riichi', 'riichi', this.riichiMode ? 'リーチ取消' : '🔥リーチ', true) : B('b-riichi', 'riichi', 'リーチ', false)}${kan}${B('b-call', 'pon', 'ポン', false)}${B('b-call', 'chi', 'チー', false)}`;
    },

    actionsHTML(game) {
      const s = this.sel;
      if (!s) return '<span class="msg">…</span>';
      const btn = (cls, act, label, extra = '') => `<button class="btn ${cls}" data-act="${act}" ${extra}>${label}</button>`;
      if (s.type === 'self') {
        const o = s.opts;
        let h = '';
        if (o.tsumo) h += btn('b-tsumo', 'tsumo', 'ツモ!');
        if (o.riichi.length) h += btn('b-riichi', 'riichi', this.riichiMode ? 'リーチ取消' : '🔥 リーチできる!');
        for (const t of o.ankan) h += btn('b-call', 'ankan', `カン(${MJ.tileName(t)})`, `data-t="${t}"`);
        for (const t of o.kakan) h += btn('b-call', 'kakan', `加槓(${MJ.tileName(t)})`, `data-t="${t}"`);
        let msg = !s.p.riichi && o.riichi.length && !this.riichiMode ? '<b class="rch-hint">テンパイ!リーチを宣言できます</b>' : s.p.riichi ? 'リーチ中: ツモ切りです(牌をクリック)' : s.st.afterCall ? '鳴いたので1枚切ります(暗い牌は食い替え禁止)' : this.riichiMode ? '赤枠の牌を切るとリーチ成立' : this.oneClick ? '切る牌をクリック' : '切る牌を選んで、もう一度クリックで捨てる';
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
      if (s && s.type === 'react' && this.chiCombos && this.chiCombos.length > 1) { // マウス・タッチ: 光らせたい組み合わせの牌をタッチ
        const i = this.chiCombos.findIndex((x) => x.ids.includes(String(id)) || x.ids.includes(id));
        if (i >= 0) { MJ.SFX.play('select'); this.setChi(i); }
        return;
      }
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
        if (a === 'discard') { const h = s.p.hand.find((x) => x.id === this.picked); if (h && this.allowed(s, h)) this.finish({ act: this.riichiMode ? 'riichi' : 'discard', tile: h }); return; }
        if (a === 'tsumo') return this.finish({ act: 'tsumo' });
        if (a === 'ankan' || a === 'kakan') return this.finish({ act: a, t: +b.dataset.t });
      } else {
        if (a === 'chi') return this.finish({ act: 'chi', use: [+b.dataset.a, +b.dataset.b] });
        return this.finish({ act: a });
      }
    },
    finish(act) {
      const s = this.sel;
      this.sel = null; this.picked = null; this.riichiMode = false; this.adv = null; this.dng = null; this.hiType = null;
      this.reactHtml = '';
      s.res(act);
      this.render(this.game);
      this.coachHtml = '';
      this.refreshCoach();
    },
    showInfo(id) {
      const hh = this.sel && this.sel.type === 'self' ? this.sel.p.hand.find((x) => x.id === id) : null;
      if (hh && this.dng) {
        this.hilite(hh.t);
        const dl = this.dangerLine(hh.t);
        const base = this.adv && this.adv.info && this.adv.info[id] && this.coachActive() ? `${this.adv.info[id]}<br>` : '';
        const el0 = $('#tipline'); if (el0) { el0.innerHTML = dl; this.fitTip(); }
        const ti0 = $('#tileinfo'); if (ti0) { ti0.style.display = 'block'; ti0.innerHTML = base + dl; }
        return;
      }
      const t = this.adv && this.adv.info && this.adv.info[id];
      if (!t || !this.coachActive()) return;
      const el = $('#tipline');
      if (el) { el.innerHTML = t; this.fitTip(); }
      const ti = $('#tileinfo');
      if (ti) { ti.style.display = 'block'; ti.innerHTML = (this.adv.infoLong && this.adv.infoLong[id]) || t; }
    },

    /* ---------- 危険度の見える化(◎○△✕・★・色)/ 河のスジ・現物マップ ---------- */
    buildDanger(game, p) {
      this.dng = null;
      if (!this.dangerOn) return;
      const A = MJ.AI;
      const vis = A.visible(game, p);
      const others = game.players.filter((q) => q !== p);
      const rii = others.filter((q) => q.riichi);
      // リーチ者がいなければ「もし全員がリーチしていたら」の仮定で、河(公開情報)だけから危険度を出す
      if (!rii.length) return; // リーチが入るまでは表示しない(危険な場面から表示)
      const opps = rii;
      const map = {};
      [...new Set(p.hand.map((h) => h.t))].forEach((t) => { map[t] = opps.map((q) => A.danger1(game, vis, t, q, A.safeSet(game, q), 2)); });
      this.dng = { opps, hyp: !rii.length, map };
      if (this.dngTab !== 'all' && !opps[this.dngTab]) this.dngTab = 'all';
    },
    /* 危険度の印は、初期設定では「現物/スジ/半スジ/無スジ」など言葉で出す(設定で◎○△✕に切替) */
    tagShort(tag) {
      if (/^現物/.test(tag)) return '現物';
      if (/^全見え/.test(tag)) return '全見え';
      if (/^字牌/.test(tag)) return '字牌';
      if (/^スジ/.test(tag)) return 'スジ';
      if (/^半スジ/.test(tag)) return '半スジ';
      if (/^カベ/.test(tag)) return 'カベ';
      if (/^ワンチャンス/.test(tag)) return 'ワンC';
      return '無スジ';
    },
    dangerView(t) {
      const d = this.dng;
      if (!d || !d.map[t]) return null;
      const per = d.map[t];
      let score, w;
      if (this.dngTab !== 'all') { w = per[this.dngTab]; score = w.score; }
      else { w = per.reduce((m, x) => (x.score > m.score ? x : m), per[0]); score = d.hyp ? w.score : per.reduce((s2, x) => s2 + x.score, 0); }
      const r = MJ.Coach.rate(score);
      const who = this.dngTab !== 'all' ? d.opps[this.dngTab].name : (d.hyp ? '全員がリーチしていたと仮定して(いちばん危ない相手)' : d.opps.length > 1 ? `${d.opps.length}人のリーチ全体` : d.opps[0].name);
      return { sym: r.sym, cls: r.cls, stars: r.stars, score: Math.round(score), tag: w.tag, why: w.why, who, hyp: d.hyp };
    },
    /* 河の中で「その牌の安全の理由になる牌」を光らせる(同じ牌=現物 / 3つ違い=スジの元) */
    hilite(t) {
      this.hiType = t;
      document.querySelectorAll('#table .river .tile.rel-g, #table .river .tile.rel-s').forEach((x) => x.classList.remove('rel-g', 'rel-s'));
      if (t == null || !this.dng) return;
      const seats = (this.dngTab === 'all' ? this.dng.opps : [this.dng.opps[this.dngTab]]).map((q) => q.seat);
      const bases = [];
      if (t < 27) { const n = t % 9; if (n >= 3) bases.push(t - 3); if (n <= 5) bases.push(t + 3); }
      seats.forEach((s) => {
        document.querySelectorAll(`#table .blk[data-seat="${s}"] .river .tile[data-t]`).forEach((el) => {
          const x = +el.dataset.t;
          if (x === t) el.classList.add('rel-g'); else if (bases.includes(x)) el.classList.add('rel-s');
        });
      });
    },
    dangerLine(t) {
      const dv = this.dangerView(t);
      if (!dv) return '';
      return `<b class="dgl ${dv.cls}">${dv.sym} 安全度 ${dv.stars}</b> (${dv.who}に対して約${dv.score}%・${dv.tag})<br><span class="cc-s">${dv.why}</span>`;
    },
    /* 対局中に見られる、自分の切り牌ログ(危険度は対局中に見える情報=リーチだけで判定。相手の手は使わない) */
    showTimeline() {
      const g = this.game;
      const log = (g && g.humanLog) || [];
      this.overlay(`<h2>📈 この局のあなたの切り牌ログ</h2><p class="cc-s">切った牌と、そのときの危険度です。リーチが入った場面から色が付きます(相手の手牌は使っていないので、対局中でも見られます)。</p>${MJ.Coach.timeline(log, { full: false })}<div class="res-foot"><button class="btn pri" id="tl-close">閉じる</button></div>`);
      $('#tl-close').addEventListener('click', () => this.closeOverlay());
    },

    askSelf(game, p, opts, st) {
      return new Promise((res) => {
        this.sel = { type: 'self', p, opts, st, res };
        this.riichiMode = false; this.picked = null;
        this.adv = this.coachActive() || game.mode !== 'free' ? MJ.Coach.selfAdvice(game, p, opts, st) : null;
        this.maybeAim(game, p);
        this.coachHtml = this.adv ? this.adv.html : '';
        this.summary = this.adv ? this.adv.summary || '' : '';
        this.buildDanger(game, p);
        this.render(game);
        this.refreshCoach();
      });
    },
    askReact(game, q, o) {
      return new Promise((res) => {
        this.sel = { type: 'react', p: q, o, res };
        this.reactAt = Date.now();
        if (MJ.Pad && MJ.Pad.onReact) MJ.Pad.onReact();
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
      if (!this.coachActive()) body = '<div class="cc"><div class="cc-h">先生なし</div><div class="cc-b">いまは、アドバイスはありません。</div></div>';
      else if (this.coachHtml) {
        // 「この局のポイント」は最初の1巡だけ先頭に出し、その後は最後のページに回す
        const tip = this.tipHtml || '';
        body = g.players[0].discards.length < 1 ? tip + this.coachHtml : this.coachHtml + tip;
      }
      else body = g.mode === 'free' ? '<div class="cc"><div class="cc-h">先生</div><div class="cc-b">自分の番になると、おすすめの牌と理由が出ます。</div></div>' : `<div class="cc"><div class="cc-h">${m.short}モード</div><div class="cc-b">${m.desc}</div></div>${this.tipHtml || ''}`;
      el.innerHTML = `<div class="ch"><b>🎓 ${g.mode === 'free' ? '先生' : m.name}</b><span class="chb"><button class="btn sm" data-open-yaku>役一覧</button><button class="btn sm" data-open-gloss>用語</button><button class="btn sm rd" data-read="coach">🔊 読み上げ</button><button class="btn sm cx" data-coachclose aria-label="閉じる">✕ 閉じる</button></span></div><div class="ctabs"></div>${body}<button class="cnav l off" data-pg="-1" aria-label="前へ">◀</button><button class="cnav r off" data-pg="1" aria-label="次へ">▶</button>`;
      this.pageCoach(el);
      MJ.Gloss.decorate(el);
      if (this.coachActive()) this.addReadFrom(el);
      this.fitCoachText(el);
      // 牌画像などが後から読み込まれて高さが変わっても、枠からはみ出さないよう再調整する
      if (!el._ld) { el._ld = 1; el.addEventListener('load', () => this.growFont(el), true); }
      clearTimeout(this._gt); this._gt = setTimeout(() => this.growFont(el), 250);
    },

    /* 助言カードは、枠に収まる枚数だけまとめて表示(◀▶で次のまとまりへ)。文字は枠いっぱいまで大きくする */
    /* 1枚のカードが枠に収まらないときは、文字を小さくせず、続きのカードに分ける */
    splitLongCards(el, cards) {
      const tabs0 = el.querySelector('.ctabs');
      if (tabs0) tabs0.style.display = 'none';
      el.style.paddingBottom = '84px'; // ボタンの2行ぶんの高さを空けて測る
      el.style.fontSize = document.body.classList.contains('tbl') ? '20px' : '15px';
      const only = (c) => { el.querySelectorAll(':scope > .cc').forEach((x) => x.classList.remove('on')); c.classList.add('on'); };
      const over = () => el.scrollHeight > el.clientHeight + 1;
      const out = [];
      cards.forEach((c) => {
        only(c);
        const body = c.querySelector('.cc-b');
        if (!over() || !body) { out.push(c); return; }
        const units = [];
        let run = [];
        const flush = (br) => { if (run.length) { run.br = br; units.push(run); run = []; } };
        [...body.childNodes].forEach((n) => {
          if (n.nodeName === 'BR') flush(true);
          else if (n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName) && n.children.length > 1) { flush(true); [...n.children].forEach((li) => { const l2 = n.cloneNode(false); l2.appendChild(li); units.push([l2]); }); } else if (n.nodeType === 1 && /^(UL|OL|DIV|P|TABLE)$/.test(n.tagName)) { flush(true); units.push([n]); } else run.push(n);
        });
        flush(false);
        if (units.length < 2) { out.push(c); return; }
        const head = c.querySelector('.cc-h');
        const mk = () => { const n = c.cloneNode(false); n.className = c.className; n.dataset.cont = '1'; n.innerHTML = (head ? head.outerHTML.replace('</div>', ' <small>(つづき)</small></div>') : '') + '<div class="cc-b"></div>'; return n; };
        body.innerHTML = '';
        let cur = c, curBody = body, count = 0;
        const pages = [c];
        units.forEach((u) => {
          const add = (b) => { u.forEach((n) => b.appendChild(n)); if (u.br) b.appendChild(document.createElement('br')); };
          add(curBody); count++;
          only(cur);
          if (over() && count > 1) {
            // この塊は次のカードへ
            const moved = [...curBody.childNodes].slice(-(u.length + (u.br ? 1 : 0)));
            const nx = mk(); cur.after(nx); const nb = nx.querySelector('.cc-b');
            moved.forEach((n) => nb.appendChild(n));
            cur = nx; curBody = nb; count = 1; pages.push(nx);
          }
        });
        pages.forEach((p) => out.push(p));
      });
      if (tabs0) tabs0.style.display = '';
      el.style.paddingBottom = '';
      return out;
    },
    pageCoach(el) {
      let cards = [...el.querySelectorAll(':scope > .cc')];
      cards = this.splitLongCards(el, cards);
      const tabs = el.querySelector('.ctabs');
      // 最初の1巡は「この局のポイント」の次に「おすすめ」を並べる
      const h0 = ((cards[0] && cards[0].querySelector('.cc-h')) || {}).textContent || '';
      const sIdx = cards.findIndex((c) => /★|おすすめ/.test(((c.querySelector('.cc-h') || {}).textContent || '')));
      if (/ポイント/.test(h0) && this.game.players[0].discards.length < 1 && sIdx > 1) { cards[0].after(cards[sIdx]); cards = [...el.querySelectorAll(':scope > .cc')]; }
      this.coachCards = cards.length;
      if (cards.length <= 1) { cards.forEach((c) => c.classList.add('on')); if (tabs) tabs.remove(); el.querySelectorAll('.cnav').forEach((n) => n.classList.add('off')); this.growFont(el); return; }
      const hd = (c) => ((c.querySelector('.cc-h') || {}).textContent || '').trim();
      const key = cards.length + '|' + hd(cards[0]);
      const star = cards.findIndex((c) => /★|おすすめ/.test(hd(c)));
      if (key !== this.coachKey) { this.coachKey = key; this.coachPage = 0; this.coachStar = true; }
      let i = Math.max(0, Math.min(this.coachPage || 0, cards.length - 1));
      const show = (from, g) => cards.forEach((c, j) => c.classList.toggle('on', j >= from && j < from + g));
      const fits = (px) => { el.style.fontSize = px + 'px'; return el.scrollHeight <= el.clientHeight + 1; };
      const choose = (from) => {
        for (let g = cards.length - from; g >= 1; g--) { show(from, g); if (fits(document.body.classList.contains('tbl') ? (g === 1 ? 18 : 20) : (g === 1 ? 13 : 15))) return g; }
        show(from, 1); return 1;
      };
      let g = choose(i);
      // 最初は「おすすめ」カードが見える位置から
      const tipFirst = this.game.players[0].discards.length < 1 && /ポイント/.test(hd(cards[0]));
      if (this.coachStar && star >= 0 && !tipFirst && !(star >= i && star < i + g)) { i = star; g = choose(i); }
      this.coachStar = false;
      this.coachPage = i; this.coachG = g;
      this.growFont(el);
      // 名前つきのボタン(おすすめ・どうして?…)。続きのページは、元のカードのボタンにまとめる
      const starts = [];
      cards.forEach((c, j) => { if (!c.dataset.cont || !starts.length) starts.push(j); });
      tabs.innerHTML = starts.map((s, k) => {
        const e = k + 1 < starts.length ? starts[k + 1] : cards.length;
        const on = i >= s && i < e;
        const cnt = e - s > 1 ? `<small>${on ? i - s + 1 : 1}/${e - s}</small>` : '';
        return `<button class="chip${on ? ' on' : ''}" data-pj="${s}" title="${hd(cards[s]).replace(/"/g, '')}">${this.shortLabel(hd(cards[s]))}${cnt}</button>`;
      }).join('');
      const nl = el.querySelector('.cnav.l'), nr = el.querySelector('.cnav.r');
      if (nl) nl.classList.toggle('off', i <= 0);
      if (nr) nr.classList.toggle('off', i + g >= cards.length);
    },
    /* カードの見出しから、ボタン用のひとこと(短い名前)を作る */
    shortLabel(h) {
      const M = [[/どうして/, 'どうして?'], [/形の名前/, '形の名前'], [/安全な牌ランキング/, '安全牌'], [/守備の目線/, '守備'], [/リーチへの警戒/, '警戒'], [/いまはリーチなし/, 'リーチなし'], [/役がありません|形はできている/, '役なし'], [/フリテン/, 'フリテン'], [/リーチ者の捨て牌/, '現物'], [/河を観察/, '河を見る'], [/状況/, '状況'], [/コツ/, 'コツ'], [/狙える役|目指す役/, '目指す役'], [/打点/, '打点'], [/ロンできます/, 'ロン!'], [/ツモ和了/, 'ツモ!'], [/鳴いた後/, '鳴いた後'], [/ロンされない/, '放銃注意'], [/リーチのチャンス/, 'リーチ!'], [/スジの実例/, 'スジ例'], [/カン/, 'カン'], [/いまの手牌/, '手牌'], [/押す|押し引き/, '押し引き'], [/おすすめ/, 'おすすめ'], [/ポイント/, 'ポイント']];
      for (const [re, l] of M) if (re.test(h)) return l;
      const t = h.replace(/^[^\p{L}\p{N}]+/u, '').split(/[(（]/)[0].replace(/[:：]\s*$/, '');
      return t.length > 7 ? t.slice(0, 7) : t;
    },
    /* 表示中の内容が枠に収まる最大の文字サイズにする(10〜22px) */
    growFont(el) {
      let px = document.body.classList.contains('tbl') ? 30 : 17; // 広いパネルでは大きく
      el.classList.remove('tight'); el.style.overflowY = '';
      el.style.fontSize = px + 'px';
      const over = () => el.scrollHeight > el.clientHeight + 1;
      while (over() && px > 10) { px -= 0.5; el.style.fontSize = px + 'px'; }
      // 1枚のカードでも収まらないときは補足(小さい注釈)を省き、それでも駄目なときだけスクロールできるようにする(文字は切らない)
      if (over()) { el.classList.add('tight'); if (over()) el.style.overflowY = 'auto'; }
    },
    fitCoachText(el) { this.growFont(el); },
    /* 手牌の下の説明が枠からはみ出さないよう、文字サイズを下げて収める */
    fitTip() {
      const el = $('#tipline');
      if (!el) return;
      el.style.fontSize = '';
      el.querySelectorAll('.cmp').forEach((c) => { c.style.display = ''; });
      const over = () => el.scrollHeight > el.clientHeight + 1;
      let px = parseFloat(getComputedStyle(el).fontSize) || 15;
      const shrink = (min) => { while (over() && px > min) { px -= 0.5; el.style.fontSize = px + 'px'; } };
      shrink(13);
      // まだ収まらなければ補足の比較行を省き、それでも駄目なら文字をさらに小さく(文章を途中で切らない)
      if (over()) { const c = el.querySelector('.cmp'); if (c) c.style.display = 'none'; }
      shrink(9);
    },
    goCoachPage(d, abs) {
      const el = $('#coach');
      const n = this.coachCards || 1, g = this.coachG || 1;
      if (abs != null) this.coachPage = abs;
      else { let nx = (this.coachPage || 0) + d * g; if (nx >= n) nx = n - g > 0 ? Math.max(0, this.coachPage || 0) : 0; if (nx < 0) nx = 0; this.coachPage = nx; }
      this.pageCoach(el);
      MJ.Gloss.decorate(el);
      this.growFont(el);
    },

    /* ---------- 演出 ---------- */
    /* キャラの顔: どこでも同じ「輪郭の切り抜き(首元まで・丸い枠なし)」。自分のシルエットだけは正方形の画像 */
    faceImg(ch, cls = '') {
      if (ch && ch.face) return `<img class="fcut ${cls}" src="${ch.face}" alt="">`;
      if (ch && ch.img) return `<img class="fyou ${cls}" src="${ch.img}" alt="">`;
      return '';
    },
    /* 同じ席の顔・吹き出し・宣言が重ならないように、その席の古い表示を消す */
    clearSeat(seat, keep) {
      const host = $('#says');
      if (host) host.querySelectorAll(`.say.sy${seat}, .shout.sh${seat}`).forEach((x) => { if (x !== keep) x.remove(); });
      const ci = $('#screen-game .cutin'); if (ci && +ci.dataset.seat === seat && ci !== keep) ci.remove();
    },
    banner(game, p, text) {
      if ((text === 'ロン' || text === 'ツモ') && !game.fast) return this.winFx(game, p, text); // 上がりは、雷つきの派手な演出
      const col = text === 'リーチ' ? '#ff5b8a' : text === 'ロン' || text === 'ツモ' ? '#ff7b5a' : '#c48bff';
      const SFXN = { 'リーチ': 'riichi', 'ポン': 'call', 'チー': 'call', 'カン': 'kan', 'ロン': 'ron', 'ツモ': 'tsumo' };
      MJ.SFX.play(SFXN[text]);
      MJ.SFX.voice(text, p);
      const face = this.faceImg(p.char);
      // 顔は、鳴き・リーチ・和了のこの瞬間にだけ、その席のそばに大きく出す
      const host = $('#says');
      host.querySelectorAll('.shout').forEach((x) => x.remove());
      if (this.hintOn && text === 'リーチ' && !game.fast) { // 先生: 相手のリーチには注意、自分のリーチには応援
        const msg = p.isHuman ? 'リーチ! いい形です。がんばって!' : 'リーチに注意! 安全な牌を切りましょう。';
        setTimeout(() => { if (!(this.sel && this.sel.type === 'react')) this.teacherSay(msg, p.isHuman ? 'cheer' : 'warn', 6000); }, 900);
      }
      this.clearSeat(p.seat); // 同じ席のセリフの顔が残っていたら消す
      const el = document.createElement('div');
      el.className = `shout sh${p.seat}`;
      el.style.setProperty('--c', col);
      el.innerHTML = `${face}<div class="sw">${text}</div><small>${p.name}</small>`;
      host.appendChild(el);
      return new Promise((r) => setTimeout(() => { el.remove(); r(); }, game.fast ? 0 : 1000));
    },
    /* 上がりの演出: 画面が暗くなる → 顔とセリフの帯 → 当たり牌に雷 → 大きな顔と「ロン!!!」(約4.8秒。クリック・Aでとばせる) */
    winTarget(game, p, text) {
      // 雷の落ち先(設計座標 720×428): ロンは放銃した人の河の最後の牌、ツモは上がった人の手牌
      const sc = $('#sc');
      const hl = $('#table .tile.hl');
      if (text === 'ロン' && hl) { // 河の牌の位置を、#sc の中の座標に直す
        const a = hl.getBoundingClientRect(), b = sc.getBoundingClientRect();
        const rot = document.body.classList.contains('rot');
        const S = (rot ? b.height : b.width) / 720;
        if (!rot) return { x: (a.left + a.width / 2 - b.left) / S, y: (a.top + a.height / 2 - b.top) / S };
        return { x: (a.top + a.height / 2 - b.top) / S, y: (b.right - a.left - a.width / 2) / S };
      }
      if (p.isHuman) { const d = $('#mine .hand .tile.drawn'); const h = $('#mine .hand'); if (d && h) return { x: 20 + d.offsetLeft + d.offsetWidth / 2, y: 354 + 30 }; }
      return [{ x: 360, y: 300 }, { x: 600, y: 214 }, { x: 360, y: 90 }, { x: 120, y: 214 }][p.seat] || { x: 360, y: 214 };
    },
    winFx(game, p, text) {
      const sc = $('#sc');
      if (!sc) return Promise.resolve();
      const tg = this.winTarget(game, p, text);
      const bolt = (w, dx, d) => { // ぎざぎざの雷の線(上から当たり牌まで)
        let x = tg.x + dx, pts = [`${x.toFixed(0)},0`];
        const n = 6;
        for (let i = 1; i < n; i++) { x += (Math.random() * 2 - 1) * 26; pts.push(`${(i === n - 1 ? tg.x + dx * 0.15 : x).toFixed(0)},${((tg.y * i) / n).toFixed(0)}`); }
        pts.push(`${tg.x.toFixed(0)},${tg.y.toFixed(0)}`);
        const P = pts.join(' ');
        return `<g class="wf-bolt" style="animation-delay:${d}ms"><polyline points="${P}" fill="none" stroke="#8fc5ff" stroke-width="${w * 2.6}" stroke-linejoin="round" stroke-linecap="round" opacity=".55"/><polyline points="${P}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/></g>`;
      };
      const line = ((p.char && p.char.lines && p.char.lines.win) || `${text}!`).split(/[。]/)[0].slice(0, 22);
      const fx = document.createElement('div');
      fx.className = 'winfx';
      fx.innerHTML = `<div class="wf-dim"></div><div class="wf-rays"></div><div class="wf-slash"></div>${this.faceImg(p.char, 'wf-face1')}<div class="wf-line">${line}</div>
        <svg class="wf-svg" viewBox="0 0 720 428" preserveAspectRatio="none">${bolt(9, -18, 2150)}${bolt(4, 46, 2260)}${bolt(14, 6, 2380)}${bolt(3, -52, 2480)}</svg>
        <div class="wf-flash" style="--tx:${tg.x}px;--ty:${tg.y}px"></div><div class="wf-ring"></div>${this.faceImg(p.char, 'wf-face2')}<div class="wf-ron">${text}!!!</div>`;
      sc.appendChild(fx);
      const hit = (cls) => { const el = text === 'ロン' ? $('#table .tile.hl') : $('#mine .hand .tile.drawn'); if (el) el.classList.toggle('wf-hit', cls); };
      MJ.SFX.don(0.9);
      return new Promise((resolve) => {
        const T = [];
        let done = false;
        const finish = () => { if (done) return; done = true; T.forEach(clearTimeout); hit(false); fx.remove(); document.removeEventListener('keydown', onKey, true); resolve(); };
        const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); } };
        fx.addEventListener('click', finish);
        document.addEventListener('keydown', onKey, true);
        T.push(setTimeout(() => MJ.SFX.don(0.7), 500));
        T.push(setTimeout(() => { hit(true); MJ.SFX.thunder(1); }, 2150));
        T.push(setTimeout(() => MJ.SFX.thunder(0.8), 2380));
        T.push(setTimeout(() => { fx.classList.add('final'); MJ.SFX.voice(text, p); MJ.SFX.play(text === 'ロン' ? 'ron' : 'tsumo'); }, 3300));
        T.push(setTimeout(finish, 4900));
      });
    },
    /* 「ツモれる!」「ロンできる!」: 上がれるときに、気づかず通り過ぎないよう、画面の真ん中に大きく出す */
    alertWin(text) {
      const sc = $('#sc');
      if (!sc) return;
      sc.querySelectorAll('.wf-alert').forEach((x) => x.remove());
      const el = document.createElement('div');
      el.className = 'wf-alert';
      el.innerHTML = `<b>${text}</b><small>上がれます</small>`;
      sc.appendChild(el);
      MJ.SFX.play('select');
      setTimeout(() => el.remove(), 2200);
    },
    speak(game, p, text) {
      // セリフは、話しているキャラの顔と吹き出しを、その席のそばに短く出す
      const host = $('#says');
      if (host.querySelector(`.shout.sh${p.seat}`) || ($('#screen-game .cutin') && +$('#screen-game .cutin').dataset.seat === p.seat)) return; // 宣言や特別なセリフの最中は、同じ人の吹き出しを出さない
      host.querySelectorAll(`.say.sy${p.seat}`).forEach((x) => x.remove());
      const el = document.createElement('div');
      el.className = `say sy${p.seat}`;
      el.innerHTML = `${this.faceImg(p.char)}<div class="sb2"><small>${p.name}</small>${text}</div>`; // 顔(首元まで)の切り抜き(輪郭だけ・丸い枠なし)
      host.appendChild(el);
      setTimeout(() => el.remove(), 3600);
    },
    /* 顔のカットイン(特別なセリフ) */
    cutin(game, p, text) {
      const host = $('#screen-game');
      const old = host.querySelector('.cutin');
      if (old) old.remove();
      this.clearSeat(p.seat);
      const el = document.createElement('div');
      el.className = 'cutin'; el.dataset.seat = p.seat;
      el.innerHTML = `${this.faceImg(p.char)}<div class="ct"><small>${p.name}</small>${text}</div>`;
      host.appendChild(el);
      setTimeout(() => el.remove(), 2600);
    },
    handStart(game) {
      if (this.hintOn && game.honba === 0 && game.kyoku === 0) setTimeout(() => this.teacherSay('先生がついています。迷ったら、おしえます!', 'greet', 7000), 800);
      MJ.SFX.play('start');
      this.tipHtml = ''; // 開始時の「この局のポイント」は出さない
      this.coachHtml = '';
      this.refreshCoach();
      const fx = $('#fx');
      fx.innerHTML = `<div class="banner" style="--c:#ffcc4d">${game.kyokuLabel()}<small>親: ${game.players[game.dealer].name} ／ ドラ表示牌: ${MJ.tileName(game.doraInd[0].t)}</small></div>`;
      return new Promise((r) => setTimeout(() => { fx.innerHTML = ''; r(); }, game.fast ? 0 : (game.honba === 0 && game.kyoku === 0 ? 3400 : 1800))); // 最初の局は、読めるように長めに
    },

    /* ---------- 結果 ---------- */
    overlay(html, opt = {}) {
      const o = $('#overlay');
      if (o.classList.contains('hidden') && MJ.Pad) MJ.Pad.saveCur(); // 閉じたときに、元の選択に戻す
      o.classList.remove('hidden');
      o.innerHTML = `<div class="ovi">${opt.raw ? html : `<div class="modal">${html}</div>`}</div>`;
      this.fitOverlay();
      o.scrollTop = 0;
      if (MJ.Pad) MJ.Pad.preselect(true); // ダイアログでも、最初のボタンを選択中にしておく
      if (!opt.plain) { MJ.Gloss.decorate(o); if (opt.read) this.addReadFrom(o.querySelector('.modal')); } // 「ここから読み上げ」▶は、読み上げが役立つ所(opt.read)だけに付ける
      return o;
    },
    /* ダイアログも、画面の大きさに合わせて文字・牌ごと拡大する(論理サイズ=スマホ横の 926×428 前後) */
    fitOverlay() {
      const o = $('#overlay');
      const ovi = o && o.querySelector('.ovi');
      if (!ovi || o.classList.contains('hidden')) return;
      const S = this.S2 || 1;
      ovi.style.width = o.clientWidth / S + 'px';
      ovi.style.height = o.clientHeight / S + 'px';
      ovi.style.transform = `scale(${S})`;
      this.ovH = o.clientHeight / S;
    },
    closeOverlay() { $('#overlay').classList.add('hidden'); $('#overlay').innerHTML = ''; if (MJ.Pad) MJ.Pad.restoreCur(); },

    winExplHTML(game, w) {
      const lines = MJ.Coach.explainScore(w, game);
      return `<div class="expl-h">📘 点数計算のしくみ(${w.winner.name}の和了)</div><ol class="expl-ol">${lines.map((l) => `<li>${l}</li>`).join('')}</ol>`.replace(/門前清自摸和/g, '門前清自摸和(メンゼンツモ)');
    },
    winHTML(game, w) {
      const r = w.res;
      const win = w.winner;
      const v = w.view;
      const concealed = v.concealed.map((h) => MJ.tileHTML(h.t, 't-m', '', h.red)).join('');
      const winT = w.winTile ? `<span class="gap"></span>${MJ.tileHTML(w.winTile.t, 't-m hl', '', w.winTile.red)}` : '';
      const melds = v.melds.map((m) => `<span class="gap"></span>` + m.tiles.map((h, i) => (m.kind === 'ankan' && (i === 0 || i === 3) ? MJ.backHTML('t-m') : MJ.tileHTML(h.t, 't-m', '', h.red))).join('')).join('');
      const dora = game.doraInd.map((d) => MJ.tileHTML(d.t, 't-m', '', d.red)).join('');
      const ura = w.ura.length && MJ.RULES.ura ? '　裏ドラ表示牌: ' + w.ura.map((d) => MJ.tileHTML(d.t, 't-m', '', d.red)).join('') : '';
      const rows = r.yaku.map((y) => `<tr><td>${y.n}</td><td>${r.yakuman ? '役満' : y.h + '飜'}</td></tr>`).join('');
      let pts;
      if (!w.tsumo) pts = `${fmt(w.pay.ron)}点(${w.loser.name}から)`;
      else if (win.seat === game.dealer) pts = `${fmt(w.pay.each)}点オール`;
      else pts = `${fmt(w.pay.fromOther)}・${fmt(w.pay.fromDealer)}点`;
      return `<div class="win-head">${this.faceImg(win.char) || '<div style="font-size:40px">🀄</div>'}<div><div class="big">${win.name}の${w.tsumo ? 'ツモ和了' : 'ロン和了'}!</div><div>${w.tsumo ? '' : `放銃(ロンされた人): ${w.loser.name}`}</div>${win.isHuman ? '' : `<div class="brag">「${MJ.Banter.brag(win) || (win.char.lines && win.char.lines.win) || ''}」</div>`}</div></div>
      <div class="win-cols"><div class="win-l"><div class="win-hand">${concealed}${melds}${winT}</div>
      <div>ドラ表示牌: ${dora}${ura}</div></div>
      <div class="win-r"><table class="yakus">${rows.replace(/門前清自摸和/g, '門前清自摸和(メンゼンツモ)')}</table>
      <div class="score-big">${r.yakuman ? r.limit : `${r.han}飜 ${r.fu}符${r.limit ? ' ' + r.limit : ''}`} → ${pts}</div></div></div>
      `;
    },

    scoreTable(game, res) {
      const rows = game.players.map((p, i) => `<tr><td>${p.name}</td><td>${fmt(res.before[i])}</td><td>${signed(res.delta[i])}</td><td><b>${fmt(res.after[i])}</b></td></tr>`).join('');
      return `<table class="scores"><tr><th>プレイヤー</th><th>前</th><th>増減</th><th>持ち点</th></tr>${rows}</table>`;
    },

    /* 長い振り返りを、見出し(①②③④)ごとに2つずつのページに分ける */
    splitReview(html) {
      const d = document.createElement('div');
      d.innerHTML = html;
      const card = d.querySelector('.cc');
      if (!card) return [];
      const head = card.querySelector('.cc-h').outerHTML;
      const body = card.querySelector('.cc-b');
      const groups = [];
      [...body.childNodes].forEach((n) => {
        if (n.nodeType === 1 && n.classList.contains('rv-h')) groups.push([]);
        if (!groups.length) groups.push([]);
        groups[groups.length - 1].push(n.outerHTML || n.textContent);
      });
      const pages = [];
      // 見出しごとの大きさ(文字数+図の分)を見積もって、1ページに収まる分だけまとめる
      const wOf = (html) => { const t = document.createElement('div'); t.innerHTML = html; return t.textContent.length + (t.querySelector('.tl') ? 300 : 0) + (t.querySelectorAll('.tile,svg').length ? 12 : 0); };
      const weight = (g) => g.reduce((s, h) => s + wOf(h), 0);
      const cap = 230; // スマホ横は画面が低いので、1ページに入れる量を減らす(文字を小さくしないため)
      // 1つの見出しが長すぎるときは、中の段落・箇条書きの項目ごとに分けて、続きのページに回す
      const exploded = [];
      groups.forEach((g) => {
        if (weight(g) <= cap) { exploded.push(g); return; }
        let cur = [];
        const flush = () => { if (cur.length) { exploded.push(cur); cur = []; } };
        g.forEach((h) => {
          const t = document.createElement('div'); t.innerHTML = h;
          const el = t.firstElementChild;
          if (el && /^(UL|OL)$/.test(el.tagName) && t.children.length === 1 && wOf(h) > cap / 2) {
            [...el.children].forEach((li) => {
              const piece = `<${el.tagName.toLowerCase()} class="${el.className}">${li.outerHTML}</${el.tagName.toLowerCase()}>`;
              if (cur.length && weight(cur) + wOf(piece) > cap) flush();
              cur.push(piece);
            });
          } else {
            if (cur.length && weight(cur) + wOf(h) > cap) flush();
            cur.push(h);
          }
        });
        flush();
      });
      const chunks = [];
      let curC = [], w = 0;
      exploded.forEach((g) => { const gw = weight(g); if (curC.length && w + gw > cap) { chunks.push(curC); curC = []; w = 0; } curC.push(g); w += gw; });
      if (curC.length) chunks.push(curC);
      chunks.forEach((c) => { if (c.length) pages.push(`<div class="${card.className}">${head}<div class="cc-b">${c.map((g) => g.join('')).join('')}</div></div>`); });
      return pages;
    },
    /* ページ式のダイアログ(スクロールなしで画面に収める) */
    pagedModal(pages, onDone, lastLabel) {
      let cur = 0;
      this.overlay(`<div class="modal paged"><div class="pm-top"><span class="pm-title"></span><span class="pm-dots">${pages.map(() => '<i></i>').join('')}</span></div><div class="pm-body">${pages.map((p) => `<div class="pm-page">${p.html}</div>`).join('')}</div><div class="pm-foot"><button class="btn" id="pm-skip">⏭ スキップ</button><button class="btn pri" id="pm-done"></button></div><button class="pm-arrow l" id="pm-prev" aria-label="前へ">◀</button><button class="pm-arrow r" id="pm-next" aria-label="次へ">▶</button></div>`, { plain: true, raw: true });
      const modal = $('#overlay .modal');
      const body = modal.querySelector('.pm-body');
      const els = [...modal.querySelectorAll('.pm-page')];
      els.forEach((e) => MJ.Gloss.decorate(e));
      const show = (i) => {
        cur = Math.max(0, Math.min(pages.length - 1, i));
        els.forEach((e, k) => { e.classList.toggle('on', k === cur); e.style.zoom = ''; });
        modal.querySelector('.pm-title').textContent = `${pages[cur].t}  ${cur + 1}/${pages.length}`;
        modal.querySelectorAll('.pm-dots i').forEach((d, k) => d.classList.toggle('on', k === cur));
        modal.querySelector('#pm-prev').classList.toggle('off', cur === 0);
        modal.querySelector('#pm-skip').style.visibility = pages.length > 1 && cur < pages.length - 1 ? 'visible' : 'hidden';
        modal.querySelector('#pm-next').classList.toggle('off', cur >= pages.length - 1);
        const dn = modal.querySelector('#pm-done'); dn.textContent = lastLabel; dn.style.visibility = cur === pages.length - 1 ? 'visible' : 'hidden';
        const pg = els[cur];
        // 枠に収まるまで文字サイズを下げる(iPhoneのSafariでも確実に効くよう zoom ではなく font-size で調整)
        pg.style.fontSize = '';
        let fpx = parseFloat(getComputedStyle(pg).fontSize) || 16;
        const fover = () => pg.scrollHeight > body.clientHeight + 1;
        while (fover() && fpx > 13) { fpx -= 0.5; pg.style.fontSize = fpx + 'px'; }
        // それでも収まらなければ、スクロールさせず、全体を少しだけ縮めて1画面に収める(下限0.6)
        if (fover()) { pg.style.zoom = String(Math.max(0.6, (body.clientHeight - 2) / Math.max(1, pg.scrollHeight))); }
        MJ.SFX.stopSpeak();
      };
      modal.querySelector('#pm-prev').addEventListener('click', () => show(cur - 1));
      modal.querySelector('#pm-skip').addEventListener('click', () => { MJ.SFX.stopSpeak(); onDone(); }); // 残りのページを飛ばして、次へ進む
      modal.querySelector('#pm-next').addEventListener('click', () => { if (cur < pages.length - 1) show(cur + 1); });
      modal.querySelector('#pm-done').addEventListener('click', () => onDone());
      show(0);
      return { show };
    },

    showResult(game, res) {
      return new Promise((resolve) => {
        const pages = [];
        if (res.type === 'win') {
          pages.push({ t: '和了', html: `<h2>${game.kyokuLabel()} 和了</h2>` + res.wins.map((w) => this.winHTML(game, w)).join('<hr>') });
          pages.push({ t: '点数計算', html: res.wins.map((w) => this.winExplHTML(game, w)).join('<hr>') + this.scoreTable(game, res) });
          const rv = res.loseReview ? MJ.Coach.loseReview(game, res) : res.review ? MJ.Coach.reviewText(res.review) : '';
          if (rv) this.splitReview(rv).forEach((h, i, a) => pages.push({ t: `振り返り`, html: h, rv: true }));
        } else {
          const cards = res.tenpai.map((t, i) => {
            const p = game.players[i], ch = p.char || {};
            const face = this.faceImg(ch, 'dr-face') || '<div class="dr-face dr-me">🀄</div>';
            const d = res.delta[i];
            return `<div class="dr-p${t ? ' tp' : ''}">${face}<div class="dr-n">${p.name}</div><div class="dr-s ${t ? 'tp' : 'no'}">${t ? 'テンパイ' : 'ノーテン'}</div><div class="dr-d ${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${d ? (d > 0 ? '+' : '') + d.toLocaleString() : '±0'}</div><div class="dr-t">${fmt(res.after[i])}点</div>${t ? `<div class="dr-h">${res.hands[i].concealed.map((h) => MJ.tileHTML(h.t, 't-s')).join('')}</div>` : ''}</div>`;
          }).join('');
          pages.push({ t: '流局', html: `<div class="dr-big">流局</div><div class="dr-sub">${game.kyokuLabel()} ／ 山の牌がなくなりました(荒牌平局)</div><div class="dr-row">${cards}</div><p class="dr-note">テンパイの人がノーテンの人から合計3000点を受け取ります。</p><div class="dr-tbl">${this.scoreTable(game, res)}</div>` });
          if (res.drawReview) this.splitReview(MJ.Coach.drawReview(game, res)).forEach((h) => pages.push({ t: '流局の振り返り', html: h, rv: true }));
        }
        if (res.type === 'win') MJ.SFX.play(res.wins.some((w) => w.winner.isHuman) ? 'win' : res.delta[0] < 0 ? 'lose' : 'win');
        else MJ.SFX.play('drawgame');
        const last = game.length === 'single';
        this.pagedModal(pages, () => { MJ.SFX.stopSpeak(); MJ.Audio.endResult(); this.closeOverlay(); resolve(); }, last ? '結果へ ▶' : '次の局へ ▶');
        if (res.type === 'win') this.announceWin(game, res);
        // 結果画面のBGM: 自分が上がった=win / 自分がマイナス=lose / 流局・CPU同士の和了=draw
        MJ.Audio.playResult(res.type === 'draw' ? 'draw' : res.wins.some((w) => w.winner.isHuman) ? 'win' : res.delta[0] < 0 ? 'lose' : 'draw'); // CPU同士の和了など、自分に関係ない結果は落ち着いた曲(流局と同じ)
        this.render(game);
      });
    },

    /* 上がったとき、役の名前を必ず読み上げる(「リーチ、イッパツ、ツモ、サンショク、ドラ2」) */
    announceWin(game, res) {
      if (!MJ.SFX.yakuRead || game.fast) return;
      const READ = { '門前清自摸和': 'ツモ', '断么九': 'タンヤオ', '平和': 'ピンフ', '一盃口': 'イーペーコー', '二盃口': 'リャンペーコー', '七対子': 'チートイツ', '対々和': 'トイトイ', '三暗刻': 'サンアンコー', '三色同順': 'サンショク', '三色同刻': 'サンショクドウコー', '一気通貫': 'イッツー', '混全帯么九': 'チャンタ', '純全帯么九': 'ジュンチャン', '混一色': 'ホンイツ', '清一色': 'チンイツ', '小三元': 'ショウサンゲン', '大三元': 'ダイサンゲン', '国士無双': 'コクシムソウ', '四暗刻': 'スーアンコー', '嶺上開花': 'リンシャンカイホー', '海底摸月': 'ハイテイ', '河底撈魚': 'ホーテイ', '混老頭': 'ホンロートー', '清老頭': 'チンロートー', '四槓子': 'スーカンツ', '三槓子': 'サンカンツ', '緑一色': 'リューイーソー', '字一色': 'ツーイーソー', '小四喜': 'ショウスーシー', '大四喜': 'ダイスーシー', '九蓮宝燈': 'チューレンポートー', '天和': 'テンホー', '地和': 'チーホー', 'ダブルリーチ': 'ダブルリーチ', 'ダブル立直': 'ダブルリーチ', '立直': 'リーチ', 'リーチ': 'リーチ', '一発': 'イッパツ', '槍槓': 'チャンカン' };
      const yh = { '白': 'ハク', '發': 'ハツ', '中': 'チュン', '東': 'トン', '南': 'ナン', '西': 'シャー', '北': 'ペー' };
      const S = MJ.SFX;
      const keys = [];
      const num = (n) => { // 100点単位の点数を、収録した音声(万・千・百)でつなぐ
        const k = [];
        const man = Math.floor(n / 10000), th = Math.floor((n % 10000) / 1000), hu = Math.floor((n % 1000) / 100);
        if (man) k.push('m:' + man);
        if (th) k.push('k:' + th);
        if (hu) k.push('h:' + hu);
        return k;
      };
      res.wins.forEach((w) => {
        const r = w.res;
        keys.push('p:' + (w.winner.char ? w.winner.char.id : 0), w.tsumo ? 'y:ツモ' : 'y:ロン', null);
        r.yaku.forEach((y) => {
          if (y.n === 'ドラ' || y.n === '赤ドラ' || y.n === '裏ドラ') keys.push('y:' + (y.n === 'ドラ' ? 'ドラ' : y.n === '赤ドラ' ? 'アカドラ' : 'ウラドラ'), 'n:' + Math.min(13, y.h));
          else {
            const m = /^役牌[ \s　]*(.*)$/.exec(y.n);
            if (m) keys.push('y:ヤクハイ', 'y:' + (yh[m[1]] || m[1]));
            else if (/場風|自風/.test(y.n)) { const k = y.n.replace(/[^東南西北]/g, '').slice(-1); keys.push(/場風/.test(y.n) ? 'y:バフウ' : 'y:ジフウ', 'y:' + (yh[k] || '')); }
            else keys.push('y:' + (READ[y.n] || y.n));
          }
          keys.push(null);
        });
        const p = w.pay;
        if (!w.tsumo) keys.push(...num(p.ron), 'pt');
        else if (game.dealer === w.winner.seat) keys.push(...num(p.each), 'pt_all');
        else keys.push(...num(p.fromOther), null, ...num(p.fromDealer), 'pt');
        keys.push(null);
      });
      const known = keys.filter((k) => !k || S.ykHas(k)); // 収録にない言葉(まれな役など)は、読み飛ばす
      setTimeout(() => {
        if (!document.querySelector('#overlay .modal')) return;
        if (!S.speakClips(known)) { // 収録音声が読み込めないとき(iPhoneは、手元から鳴るため使わない)
          const parts = res.wins.map((w) => `${w.winner.name}の${w.tsumo ? 'ツモ' : 'ロン'}。${w.res.yaku.map((y) => (y.n === 'ドラ' || y.n === '赤ドラ' || y.n === '裏ドラ' ? `${y.n}${y.h}` : READ[y.n] || y.n)).join('。')}。`);
          S.read(parts.join(' '));
        }
      }, 1100);
    },

    scoreTable(game, res) {
      const rows = game.players.map((p, i) => `<tr><td>${p.name}</td><td>${fmt(res.before[i])}</td><td>${signed(res.delta[i])}</td><td><b>${fmt(res.after[i])}</b></td></tr>`).join('');
      return `<table class="scores"><tr><th>プレイヤー</th><th>前</th><th>増減</th><th>持ち点</th></tr>${rows}</table>`;
    },


    gameEnd(game, final) {
      return new Promise((resolve) => {
        const me = final.results.find((r) => r.p.seat === 0);
        MJ.SFX.play(me.rank <= 2 ? 'end' : 'lose');
        const msg = me.rank === 1 ? '🎉 トップ!おめでとうございます!' : me.rank === 4 ? '残念…ラスでした。振り返って次に活かそう!' : `${me.rank}位でした。`;
        const rows = final.results.map((r) => `<div class="rank"><div class="rk">${r.rank}</div>${MJ.UI.faceImg(r.p.char) || '<div style="font-size:30px;width:56px;text-align:center">🀄</div>'}<div><b>${r.p.name}</b></div><div class="rs">${fmt(r.p.score)}点</div></div>`).join('');
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
