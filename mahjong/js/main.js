/* メニュー・画面遷移 */
(function () {
  const MJ = window.MJ;
  const $ = (s) => document.querySelector(s);
  const SCREENS = ['title', 'menu', 'drill', 'select', 'notes', 'game'];

  const MODE_CARDS = [
    { id: 'free', icon: '🎴', badge: 'ヒントON/OFF可', desc: '好きな相手3人と自由に対戦。慣れたらヒントを消して実戦練習。' },
    { id: 'beginner', icon: '🌱', badge: '初心者おすすめ', desc: '手牌を一緒に見ながら、シャンテン・おすすめ打牌・狙える役・鳴いて良いかを教えてくれます。ロンされないための注意も。' },
    { id: 'defense', icon: '🛡', badge: '捨て牌に特化', desc: '現物・スジ・カベ・字牌など安全牌の決め方を、実際の対戦で牌ごとの危険度を見ながら練習。' },
    { id: 'inter', icon: '🧠', badge: '中級のコツ', desc: '押し引き・打点・待ちの良し悪し・リーチかダマかなど、一歩進んだ判断を解説。' },
    { id: 'drill', icon: '📝', badge: '何パターンでも', desc: '何切る・狙える役・守備・鳴き判断・待ち当て・点数計算を、毎回ランダムな問題で練習。答え合わせで理由を解説します。' },
  ];
  /* モードごとのおすすめ対戦相手 (CHARSのid) */
  const RECO = { free: null, beginner: [9, 14, 5], defense: [5, 11, 13], inter: [2, 7, 12] };

  const App = (MJ.App = {
    mode: 'free', picks: [], length: 'east', game: null, lastCfg: null,

    show(id) {
      document.body.classList.toggle('on-menu', id === 'menu');
      document.body.classList.toggle('on-title', id === 'title');
      if (id !== 'game' || this.game) MJ.Audio.setScene(id === 'game' ? 'game' : id === 'title' ? 'title' : 'home');
      SCREENS.forEach((s) => $('#screen-' + s).classList.toggle('hidden', s !== id));
      window.scrollTo(0, 0);
    },

    buildMenu() {
      $('#menu-modes').innerHTML = MODE_CARDS.map((m) => `<button class="mode-card" data-mode="${m.id}"><div class="mi">${m.icon}</div><h3>${MJ.Coach.MODES[m.id].name}</h3><p>${m.desc}</p><span class="badge">${m.badge}</span></button>`).join('') +
        `<button class="mode-card" data-mode="notes"><div class="mi">📖</div><h3>麻雀ノート</h3><p>役の一覧・点数計算のしかた・点数早見表・スジ/カベの見方・鳴きのルールをまとめて確認。</p><span class="badge">読み物</span></button>`;
      $('#menu-modes').addEventListener('click', (e) => {
        const b = e.target.closest('[data-mode]');
        if (!b) return;
        if (b.dataset.mode === 'notes') this.openNotes(); else if (b.dataset.mode === 'drill') MJ.DrillUI.open(); else this.openSelect(b.dataset.mode);
      });
      try {
        const st = JSON.parse(localStorage.getItem('mj_stats') || 'null');
        if (st && st.games) $('#menu-stats').innerHTML = `対局成績: ${st.games}戦 / 1位 ${st.ranks[0]}回・2位 ${st.ranks[1]}回・3位 ${st.ranks[2]}回・4位 ${st.ranks[3]}回`;
      } catch (e) { /* ignore */ }
    },

    /* ---- 相手選択 ---- */
    openSelect(mode) {
      this.mode = mode;
      this.picks = [];
      const m = MJ.Coach.MODES[mode];
      $('#sel-title').textContent = m.name;
      $('#sel-desc').textContent = m.desc;
      this.renderChars();
      this.show('select');
    },
    renderChars() {
      $('#chars').innerHTML = MJ.CHARS.map((c) => {
        const n = this.picks.indexOf(c.id) + 1;
        return `<button class="char${n ? ' sel' : ''}" data-id="${c.id}" ${n ? `data-n="${n}"` : ''}><img src="${c.img}" alt=""><div class="cn">${c.name}</div><div class="cl"><span class="stars">${'★'.repeat(c.level)}${'☆'.repeat(5 - c.level)}</span> ${MJ.LEVEL_JP[c.level]}・${MJ.STYLE_JP[c.style]}</div></button>`;
      }).join('');
      $('#sel-bar').innerHTML = [0, 1, 2].map((i) => {
        const c = MJ.CHARS.find((x) => x.id === this.picks[i]);
        return `<div class="slot">${c ? `<img src="${c.img}">` : `相手${i + 1}`}</div>`;
      }).join('');
      document.querySelectorAll('.sel-start').forEach((b) => { b.disabled = this.picks.length !== 3; });
    },
    pickChar(id) {
      const i = this.picks.indexOf(id);
      if (i >= 0) this.picks.splice(i, 1);
      else if (this.picks.length < 3) this.picks.push(id);
      else { this.picks.shift(); this.picks.push(id); }
      const c = MJ.CHARS.find((x) => x.id === id);
      $('#char-detail').innerHTML = `<b>${c.name}</b>(${'★'.repeat(c.level)}${'☆'.repeat(5 - c.level)} ${MJ.LEVEL_JP[c.level]}・${MJ.STYLE_JP[c.style]})<br>${c.desc}`;
      this.renderChars();
    },

    /* ---- 対局 ---- */
    start() {
      if (this.picks.length !== 3) return;
      const chars = this.picks.map((id) => MJ.CHARS.find((c) => c.id === id));
      this.lastCfg = { mode: this.mode, picks: this.picks.slice(), length: $('#sel-length').value };
      this.launch(this.lastCfg);
    },
    launch(cfg) {
      this.stopGame();
      const chars = cfg.picks.map((id) => MJ.CHARS.find((c) => c.id === id));
      const game = new MJ.Game({ chars, mode: cfg.mode, length: cfg.length, ui: MJ.UI });
      this.game = game;
      MJ.UI.attach(game);
      MJ.SFX.unlock();
      MJ.SFX.preloadVoices([0].concat(chars.map((c) => c.id)));
      this.show('game');
      game.run().catch((e) => { console.error(e); });
    },
    again() { if (this.lastCfg) this.launch(this.lastCfg); },
    stopGame() {
      const g = this.game;
      if (!g) return;
      g.stopped = true;
      const s = MJ.UI.sel;
      if (s) { MJ.UI.sel = null; s.res({ act: 'pass', tile: s.p && s.p.hand[0] }); }
      this.game = null;
      MJ.UI.game = null;
      $('#fx').innerHTML = '';
    },
    toMenu() {
      this.stopGame();
      MJ.UI.closeOverlay();
      this.buildStatsOnly();
      this.show('menu');
    },
    buildStatsOnly() {
      try {
        const st = JSON.parse(localStorage.getItem('mj_stats') || 'null');
        if (st && st.games) $('#menu-stats').innerHTML = `対局成績: ${st.games}戦 / 1位 ${st.ranks[0]}回・2位 ${st.ranks[1]}回・3位 ${st.ranks[2]}回・4位 ${st.ranks[3]}回`;
      } catch (e) { /* ignore */ }
    },

    /* ---- ノート ---- */
    openNotes(id) {
      $('#notes-tabs').innerHTML = MJ.NOTES.map((n) => `<button data-n="${n.id}">${n.title}</button>`).join('');
      this.showNote(id || MJ.NOTES[0].id);
      this.show('notes');
    },
    showNote(id) {
      const n = MJ.NOTES.find((x) => x.id === id);
      $('#notes-body').innerHTML = n.html();
      document.querySelectorAll('#notes-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.n === id));
    },
  });

  function init() {
    MJ.UI.init();
    MJ.DrillUI.init();
    // 最初の操作でBGMを開始。iPhoneは pointerdown/touchstart では許可されないため、指を離した時(touchend/click)でも毎回試す
    const unlock = () => { MJ.SFX.unlock(); MJ.Audio.resume(); };
    ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, unlock, { capture: true, passive: true }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) MJ.Audio.resume(); });
    document.addEventListener('click', (e) => {
      if (e.target.closest('.hand .tile')) return;
      if (e.target.closest('button, summary, .char, .mode-card')) MJ.SFX.play('click');
    }, true);
    App.buildMenu();
    $('#btn-start').addEventListener('click', () => { MJ.SFX.unlock(); MJ.SFX.play('start'); App.show('menu'); });
    $('#bell').addEventListener('click', () => MJ.Audio.setOn(!MJ.Audio.on) || MJ.UI.syncAudio());
    App.show('title');
    $('#chars').addEventListener('click', (e) => { const b = e.target.closest('.char'); if (b) App.pickChar(+b.dataset.id); });
    $('#sel-back').addEventListener('click', () => App.show('menu'));
    $('#notes-back').addEventListener('click', () => App.show('menu'));
    $('#notes-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) App.showNote(b.dataset.n); });
    document.querySelectorAll('.sel-start').forEach((b) => b.addEventListener('click', () => App.start()));
    $('#sel-rand').addEventListener('click', () => {
      App.picks = MJ.shuffle(MJ.CHARS.slice()).slice(0, 3).map((c) => c.id);
      App.renderChars();
    });
    $('#sel-reco').addEventListener('click', () => {
      const r = RECO[App.mode];
      App.picks = r ? r.slice() : MJ.shuffle(MJ.CHARS.slice()).slice(0, 3).map((c) => c.id);
      App.renderChars();
    });
    $('#btn-quit').addEventListener('click', () => {
      MJ.UI.overlay('<h2>対局を中断しますか?</h2><p>メニューに戻ります。</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="q-no">続ける</button><button class="btn pri" id="q-yes">メニューへ</button></div>');
      document.querySelector('#q-no').addEventListener('click', () => MJ.UI.closeOverlay());
      document.querySelector('#q-yes').addEventListener('click', () => App.toMenu());
    });
  }
  init();
})();
