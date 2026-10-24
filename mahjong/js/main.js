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
      MJ.UI.applyRot();
      document.body.classList.toggle('on-menu', id === 'menu');
      document.body.classList.toggle('on-title', id === 'title');
      document.body.classList.toggle('on-game', id === 'game' || id === 'drill');
      if (id !== 'game' || this.game) MJ.Audio.setScene(id === 'game' ? 'game' : id === 'title' ? 'title' : 'home');
      SCREENS.forEach((s) => $('#screen-' + s).classList.toggle('hidden', s !== id));
      if (id === 'game') MJ.UI.fitStage();
      window.scrollTo(0, 0);
    },

    buildMenu() {
      $('#menu-modes').innerHTML = MODE_CARDS.map((m) => `<button class="mode-card" data-mode="${m.id}"><div class="mi">${m.icon}</div><h3>${MJ.Coach.MODES[m.id].name}</h3><p>${m.desc}</p><span class="badge">${m.badge}</span></button>`).join('') +
        `<button class="mode-card" data-mode="notes"><div class="mi">📖</div><h3>麻雀ノート</h3><p>役の一覧・点数計算のしかた・点数早見表・スジ/カベの見方・鳴きのルールをまとめて確認。</p><span class="badge">読み物</span></button>` +
        `<button class="mode-card" data-open-gloss><div class="mi">📚</div><h3>用語辞典</h3><p>専門用語の意味を検索。「チートイ」「ニコニコ」など地域・世代で違う<b>俗称</b>も載っています。</p><span class="badge">検索できます</span></button>` +
        `<button class="mode-card" data-open-rules><div class="mi">⚙️</div><h3>ルール設定</h3><p>喰いタン・赤ドラ・一発・裏ドラ・飛び・東南戦などを自分好みに変更。</p><span class="badge">喰いタンなど</span></button>` +
        `<button class="mode-card" data-open-credits><div class="mi">ℹ️</div><h3>クレジット・ライセンス</h3><p>使用している音声・BGM・画像の出典とライセンス表記。</p><span class="badge">権利表記</span></button>`;
      $('#menu-modes').addEventListener('click', (e) => {
        const b = e.target.closest('[data-mode]');
        if (!b) return;
        if (b.dataset.mode === 'notes') this.openNotes(); else if (b.dataset.mode === 'drill') MJ.DrillUI.open(); else this.openSelect(b.dataset.mode);
      });
      this.showRuleLine();
      try {
        const st = JSON.parse(localStorage.getItem('mj_stats') || 'null');
        if (st && st.games) $('#menu-stats').innerHTML = `対局成績: ${st.games}戦 / 1位 ${st.ranks[0]}回・2位 ${st.ranks[1]}回・3位 ${st.ranks[2]}回・4位 ${st.ranks[3]}回`;
      } catch (e) { /* ignore */ }
    },

    showRuleLine() { const el = $('#menu-rules'); if (el) el.textContent = '4人対戦・' + MJ.rulesSummary() + '(「ルール設定」で変更できます)。CPUは5段階の強さ(入門〜達人)。'; },

    /* ---- 相手選択 ---- */
    openSelect(mode) {
      this.mode = mode;
      this.picks = [];
      const m = MJ.Coach.MODES[mode];
      $('#sel-title').textContent = m.name;
      $('#sel-desc').textContent = m.desc;
      $('#sel-length').value = MJ.RULES.length;
      $('#sel-rule-sum').textContent = 'ルール: ' + MJ.rulesSummary();
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
        return c
          ? `<button class="slot on" data-id="${c.id}" title="タップで外す"><img src="${c.img}" alt=""><span class="sn">${c.name.replace(/\(.*$/, '')}</span><span class="ss">${'★'.repeat(c.level)}${'☆'.repeat(5 - c.level)}</span><span class="sx">✕</span></button>`
          : `<div class="slot"><span class="sq">?</span><span class="sn">相手${i + 1}</span></div>`;
      }).join('');
      $('#sel-n').textContent = this.picks.length;
    },
    /* 3人そろったら、画面の中央に「対局開始 / キャンセル」の確認を出す(3人選ぶまで開始できない) */
    confirmStart() {
      if (this.picks.length !== 3) return;
      const cs = this.picks.map((id) => MJ.CHARS.find((c) => c.id === id));
      MJ.UI.overlay(`<div class="cfm"><h2>この3人と対戦しますか?</h2><div class="cfm-row">${cs.map((c) => `<div class="cfm-c"><img src="${c.img}" alt=""><b>${c.name.replace(/\(.*$/, '')}</b><span>${'★'.repeat(c.level)}${'☆'.repeat(5 - c.level)} ${MJ.LEVEL_JP[c.level]}</span></div>`).join('')}</div><p class="sub">${MJ.rulesSummary()}</p><div class="cfm-btns"><button class="btn big" id="cfm-cancel">キャンセル</button><button class="btn pri big" id="cfm-go">対局開始</button></div></div>`, { plain: true });
      document.querySelector('#cfm-cancel').addEventListener('click', () => MJ.UI.closeOverlay());
      document.querySelector('#cfm-go').addEventListener('click', () => { MJ.UI.closeOverlay(); this.start(); });
    },
    pickChar(id) {
      const i = this.picks.indexOf(id);
      if (i >= 0) this.picks.splice(i, 1);
      else if (this.picks.length < 3) this.picks.push(id);
      else { this.picks.shift(); this.picks.push(id); }
      const c = MJ.CHARS.find((x) => x.id === id);
      $('#char-detail').innerHTML = `<b>${c.name}</b>(${'★'.repeat(c.level)}${'☆'.repeat(5 - c.level)} ${MJ.LEVEL_JP[c.level]}・${MJ.STYLE_JP[c.style]})<br>${c.desc}`;
      this.renderChars();
      if (this.picks.length === 3 && i < 0) this.confirmStart();
    },

    /* ---- 対局 ---- */
    start() {
      if (this.picks.length !== 3) return;
      const chars = this.picks.map((id) => MJ.CHARS.find((c) => c.id === id));
      MJ.RULES.length = $('#sel-length').value; MJ.saveRules();
      this.lastCfg = { mode: this.mode, picks: this.picks.slice(), length: MJ.RULES.length };
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
      MJ.Gloss.decorate($('#notes-body'));
      document.querySelectorAll('#notes-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.n === id));
    },
  });

  /* ルール設定: 変更はすぐ保存され、次の対局から使われる */
  function showRules() {
    const R = MJ.RULES;
    const sel = (k, opts) => `<select data-rk="${k}">${opts.map(([v, l]) => `<option value="${v}"${String(R[k]) === String(v) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    const tog = (k, on, off) => `<select data-rk="${k}" data-bool="1"><option value="1"${R[k] ? ' selected' : ''}>${on}</option><option value="0"${R[k] ? '' : ' selected'}>${off}</option></select>`;
    const row = (name, ctl, note) => `<div class="rl-row"><div class="rl-h"><b>${name}</b>${ctl}</div><div class="rl-n">${note}</div></div>`;
    MJ.UI.overlay(`<h2>⚙ ルール設定</h2><div class="rl-grid">
      ${row('対局の長さ', sel('length', [['east', '東風戦(東1〜4局)'], ['south', '東南戦(計8局)'], ['single', '1局だけ']]), '1局だけは練習向き。')}
      ${row('喰いタン', tog('kuitan', 'あり', 'なし'), 'ありなら、鳴いた手でも<b>タンヤオ</b>が成立。')}
      ${row('赤ドラ', sel('aka', [[3, '3枚(5萬・5筒・5索)'], [0, 'なし']]), '赤い5は持つだけで1飜。')}
      ${row('一発', tog('ippatsu', 'あり', 'なし'), 'リーチ後、1巡以内の和了で+1飜。')}
      ${row('裏ドラ', tog('ura', 'あり', 'なし'), 'リーチ和了で、裏のドラ表示牌をめくる。')}
      ${row('飛び(ハコテン)', tog('tobi', '終了する', '続ける'), '持ち点が0未満になったらゲーム終了。')}
      ${row('ダブロン', tog('doubleRon', 'あり', 'なし(頭ハネ)'), '同じ牌で複数人がロンできるとき、全員の和了を認めるか。')}
      ${row('喰い替え', tog('kuikae', '許可', '禁止'), '鳴いた直後に、鳴いた牌と同じ(近い)牌を切ること。')}
      ${row('数え役満', tog('kazoe', 'あり', 'なし(三倍満止まり)'), '13飜以上を役満として扱うか。')}
      ${row('持ち点', sel('start', [[25000, '25,000点'], [30000, '30,000点'], [35000, '35,000点']]), '開始時の持ち点。')}
    </div><div class="res-foot"><button class="btn" id="rl-reset">初期値に戻す</button><button class="btn pri" id="rl-close">閉じる</button></div>`, { plain: true });
    const root = document.querySelector('#overlay');
    root.querySelectorAll('[data-rk]').forEach((el) => el.addEventListener('change', () => {
      const k = el.dataset.rk;
      R[k] = el.dataset.bool ? el.value === '1' : (k === 'length' ? el.value : +el.value);
      MJ.saveRules();
    }));
    root.querySelector('#rl-reset').addEventListener('click', () => { Object.assign(R, MJ.RULE_DEFAULTS); MJ.saveRules(); MJ.UI.closeOverlay(); showRules(); });
    root.querySelector('#rl-close').addEventListener('click', () => {
      MJ.UI.closeOverlay();
      MJ.App.showRuleLine();
      const sum = document.querySelector('#sel-rule-sum'); if (sum) sum.textContent = 'ルール: ' + MJ.rulesSummary();
      const sl = document.querySelector('#sel-length'); if (sl) sl.value = R.length;
    });
  }

  function showCredits() {
    MJ.UI.overlay(`<h2>ℹ️ クレジット・ライセンス</h2>
      <div class="credits">
      <h3>音声(掛け声)</h3>
      <p>pyopenjtalk(Open JTalk)で生成。音響モデル: Mei (MMDAgent Example Characters) — <b>CC BY 3.0</b></p>
      <h3>BGM</h3>
      <p>制作者が用意した楽曲を使用しています。</p>
      <h3>画像</h3>
      <p>麻雀牌・タイトル・キャラクター画像は制作者が用意(または生成)したものです。キャラクターは既存作品の人物をもじったパロディです。公開・配布する場合は、権利者の許諾の確認(またはオリジナル画像への差し替え)が必要です。</p>
      <h3>注意</h3>
      <p>点数・符の計算や危険度は、学習用の目安です。実際のルール(店・地域・アプリ)によって異なる場合があります。</p>
      </div><div class="res-foot"><button class="btn pri" id="cr-close">閉じる</button></div>`, { plain: true });
    document.querySelector('#cr-close').addEventListener('click', () => MJ.UI.closeOverlay());
  }

  function init() {
    MJ.Gloss.init();
    MJ.loadRules();
    document.addEventListener('click', (e) => { if (e.target.closest('[data-open-credits]')) showCredits(); else if (e.target.closest('[data-open-rules]') || e.target.closest('#sel-rules')) showRules(); });
    $('#sel-length').addEventListener('change', () => { MJ.RULES.length = $('#sel-length').value; MJ.saveRules(); $('#sel-rule-sum').textContent = 'ルール: ' + MJ.rulesSummary(); });
    MJ.UI.init();
    MJ.DrillUI.init();
    // 最初の操作でBGMを開始。iPhoneは pointerdown/touchstart では許可されないため、指を離した時(touchend/click)でも毎回試す
    let spk = false;
    const unlock = () => { MJ.SFX.unlock(); MJ.Audio.resume(); if (!spk && window.speechSynthesis && window.SpeechSynthesisUtterance && /^(click|touchend|keydown)$/.test(event.type)) { spk = true; try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); } catch (e) {} } }; // 読み上げの音声を最初のタップで有効にする(CPU同士の結果でも読めるように)
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
    $('#sel-bar').addEventListener('click', (e) => { const b = e.target.closest('.slot.on'); if (b) App.pickChar(+b.dataset.id); });
    $('#sel-rand').addEventListener('click', () => {
      App.picks = MJ.shuffle(MJ.CHARS.slice()).slice(0, 3).map((c) => c.id);
      App.renderChars(); App.confirmStart();
    });
    $('#sel-reco').addEventListener('click', () => {
      const r = RECO[App.mode];
      App.picks = r ? r.slice() : MJ.shuffle(MJ.CHARS.slice()).slice(0, 3).map((c) => c.id);
      App.renderChars(); App.confirmStart();
    });
    $('#btn-quit').addEventListener('click', () => {
      MJ.UI.overlay('<h2>対局を中断しますか?</h2><p>メニューに戻ります。</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="q-no">続ける</button><button class="btn pri" id="q-yes">メニューへ</button></div>');
      document.querySelector('#q-no').addEventListener('click', () => MJ.UI.closeOverlay());
      document.querySelector('#q-yes').addEventListener('click', () => App.toMenu());
    });
  }
  /* 画像の先読み: タイトル/ホームの背景 → キャラ → 自分のアイコン → 牌 の順に、起動直後から裏で読み込んでおく(画面切替で真っ黒にならない) */
  MJ.preloaded = [];
  function preload() {
    const urls = ['img/title.jpg', 'img/title_p.jpg'];
    for (let i = 1; i <= 16; i++) urls.push(`img/chars/${String(i).padStart(2, '0')}.jpg`);
    for (let i = 1; i <= 18; i++) urls.push(`img/you/${String(i).padStart(2, '0')}.jpg`);
    for (let i = 0; i < 34; i++) urls.push(`img/tiles/${i}.png`);
    ['r4', 'r13', 'r22'].forEach((n) => urls.push(`img/tiles/${n}.png`));
    let k = 0;
    const next = () => {
      // 同時に4枚ずつ読む
      for (let n = 0; n < 4 && k < urls.length; n++, k++) {
        const im = new Image();
        im.decoding = 'async';
        im.onload = im.onerror = () => { if (k < urls.length) next(); };
        im.src = urls[k];
        if (im.decode) im.decode().catch(() => {});
        MJ.preloaded.push(im);
      }
    };
    next();
  }
  init();
  preload();
})();
