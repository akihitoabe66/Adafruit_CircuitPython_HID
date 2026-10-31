/* メニュー・画面遷移 */
(function () {
  const MJ = window.MJ;
  const $ = (s) => document.querySelector(s);
  const SCREENS = ['title', 'menu', 'drill', 'study', 'select', 'notes', 'game'];

  const MODE_CARDS = [
    { id: 'free', icon: '🎴', badge: 'ヒントON/OFF可', desc: '好きな相手3人と自由に対戦。慣れたらヒントを消して実戦練習。' },
    { id: 'beginner', icon: '🌱', badge: '初心者おすすめ', desc: '手牌を一緒に見ながら、シャンテン・おすすめ打牌・狙える役・鳴いて良いかを教えてくれます。ロンされないための注意も。' },
    { id: 'defense', icon: '🛡', badge: '捨て牌に特化', desc: '現物・スジ・カベ・字牌など安全牌の決め方を、実際の対戦で牌ごとの危険度を見ながら練習。' },
    { id: 'inter', icon: '🧠', badge: '中級のコツ', desc: '押し引き・打点・待ちの良し悪し・リーチかダマかなど、一歩進んだ判断を解説。' },
    { id: 'drill', icon: '📝', badge: '何パターンでも', desc: '何切る・狙える役・守備・鳴き判断・待ち当て・点数計算を、毎回ランダムな問題で練習。答え合わせで理由を解説します。' },
  ];
  /* モードごとのおすすめ対戦相手 (CHARSのid) */
  const RECO = { free: null, beginner: [10, 4, 14], defense: [4, 12, 14], inter: [3, 7, 12] };

  const App = (MJ.App = {
    mode: 'free', picks: [], length: 'east', game: null, lastCfg: null,

    show(id, opt = {}) {
      MJ.perf.mark('画面: ' + id);
      MJ.UI.applyRot();
      document.body.classList.toggle('on-menu', id === 'menu');
      document.body.classList.toggle('on-title', id === 'title');
      document.body.classList.toggle('on-game', id === 'game' || id === 'drill' || id === 'study');
      if (!opt.quiet && (id !== 'game' || this.game)) MJ.Audio.setScene(id === 'game' ? 'game' : id === 'title' ? 'title' : id === 'study' ? 'study' : id === 'drill' ? 'quiz' : 'home');
      SCREENS.forEach((s) => $('#screen-' + s).classList.toggle('hidden', s !== id));
      if (id === 'game') MJ.UI.fitStage();
      if (id === 'menu') { if (MJ.Rank) MJ.Rank.syncMenu(); App.fitMenu(); if (MJ.DrillUI && MJ.DrillUI.prefetch) { MJ.DrillUI.mode = MJ.DrillUI.mode; MJ.DrillUI.prefetch(); } } // ホームにいるあいだに、クイズの1問目を作っておく
      if (id === 'title') App.fitTitle();
      if (id === 'study' && MJ.Study) MJ.Study.layout();
      if ((id === 'menu' || id === 'study') && MJ.Pad) setTimeout(() => MJ.Pad.preselect(true), 0);
      window.scrollTo(0, 0);
    },

    /* ホーム画面を、スクロールなしの1画面に収める(設計座標 832×428 を拡大縮小) */
    /* ホームを、見えない状態で一度だけ描いておく(はじめて押した瞬間の、描画の重さを減らす) */
    prewarmMenu() {
      const el = $('#screen-menu');
      if (!el || !el.classList.contains('hidden') || !document.body.classList.contains('on-title')) return;
      el.classList.remove('hidden'); el.style.cssText = 'opacity:.01;pointer-events:none;z-index:-5';
      this.fitMenu();
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.cssText = ''; el.classList.add('hidden'); }));
    },
    fitMenu() {
      const el = $('#screen-menu');
      if (!el || el.classList.contains('hidden')) return;
      const st = MJ.UI.stageFor(el);
      const S = Math.min(st.h / 428, st.w / 832);
      $('#mn').style.transform = `translate(${Math.round((st.w - 832 * S) / 2)}px, ${Math.round((st.h - 428 * S) / 2)}px) scale(${S})`;
    },
    fitTitle() {
      const el = $('#screen-title');
      if (!el || el.classList.contains('hidden')) return;
      const st = MJ.UI.stageFor(el);
      const S = Math.min(st.h / 428, st.w / 832);
      $('#tt').style.transform = `translate(${Math.round((st.w - 832 * S) / 2)}px, ${Math.round((st.h - 428 * S) / 2)}px) scale(${S})`;
    },
    /* ホーム: 4つの大きなボタン(麻雀を開始 / 麻雀クイズ / 点数計算の勉強 / 設定) */
    buildMenu() {
      $('#hm-play').addEventListener('click', () => this.playOrContinue());
      $('#hm-rec').addEventListener('click', () => MJ.Rank.open('rank', { from: 'menu' }));
      $('#hm-quiz').addEventListener('click', () => MJ.DrillUI.openAuto());
      $('#hm-study').addEventListener('click', () => MJ.Study.open());
      $('#hm-set').addEventListener('click', () => showSettings());
      this.buildStatsOnly();
    },
    /* 「麻雀をはじめる」: 前回のつづきがあれば「つづきから」「新しく始める」をたずねる。なければ、麻雀先生の確認へ */
    playOrContinue() {
      const sv = MJ.Rank.hasSave();
      if (!sv) return this.askTeacher();
      const names = (sv.cfg.picks || []).map((id) => (MJ.CHARS.find((c) => c.id === id) || {}).short).filter(Boolean).join('・');
      MJ.UI.overlay(`<div class="cf svd"><h2>前回のつづきがあります</h2><p>${sv.label}　あなた ${(sv.players[0] || 0).toLocaleString()}点<br>相手: ${names}</p><div class="cf-btns"><button class="btn pri" id="sv-cont" type="button">つづきから</button><button class="btn" id="sv-new" type="button">新しく始める</button></div></div>`, { plain: true });
      document.querySelector('#sv-cont').addEventListener('click', () => { MJ.UI.closeOverlay(); this.resume(sv); });
      document.querySelector('#sv-new').addEventListener('click', () => {
        MJ.UI.overlay('<div class="cf svd"><h2>新しく始めますか?</h2><p>前回のつづきは、消えます。</p><div class="cf-btns"><button class="btn pri" id="sv-back" type="button">もどる</button><button class="btn danger" id="sv-yes" type="button">新しく始める</button></div></div>', { plain: true });
        document.querySelector('#sv-back').addEventListener('click', () => this.playOrContinue());
        document.querySelector('#sv-yes').addEventListener('click', () => { MJ.Rank.clearSave(); MJ.UI.closeOverlay(); this.askTeacher(); });
      });
    },
    resume(sv) { this.lastCfg = Object.assign({}, sv.cfg); this.launch(this.lastCfg, sv); },
    /* 「麻雀をはじめる」を押したら、麻雀先生をつけるかをたずねる(最初の選択は「つけない」) */
    askTeacher() {
      // 大きな見出し+麻雀先生の顔。絵が読み込まれてから、文字といっしょに出す(文字だけ先に出ないように)
      const html = `<div class="cf tcd"><div class="tc-top">${MJ.UI.teacherImg('greet')}<div class="tc-q">麻雀先生を<br>つけますか?</div></div><div class="cf-btns"><button class="btn tc-b" id="tc-no">つけない</button><button class="btn tc-b" id="tc-yes">麻雀先生をつける</button></div></div>`;
      const src = (/src="([^"]+)"/.exec(html) || [])[1];
      let shown = false;
      const open = () => {
        if (shown) return; shown = true;
        MJ.UI.overlay(html, { plain: true });
        document.querySelector('#tc-no').addEventListener('click', () => { MJ.UI.closeOverlay(); this.startAuto(false); });
        document.querySelector('#tc-yes').addEventListener('click', () => { MJ.UI.closeOverlay(); this.startAuto(true); });
      };
      if (!src) return open();
      const im = new Image(); im.onload = im.onerror = open; im.src = src; if (im.complete) open(); setTimeout(open, 4000);
    },
    /* 相手は自動で決める(やさしめ〜中級の相手から3人) */
    startAuto(teacher) {
      const easy = MJ.CHARS.filter((c) => c.level <= 3).map((c) => c.id);
      this.picks = MJ.shuffle(easy).slice(0, 3);
      MJ.RULES.length = 'east'; MJ.saveRules();
      this.lastCfg = { mode: 'free', teacher: !!teacher, picks: this.picks.slice(), length: 'east' };
      this.launch(this.lastCfg);
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
        return `<button class="char${n ? ' sel' : ''}" data-id="${c.id}" ${n ? `data-n="${n}"` : ''}><img src="${c.img}" alt=""><div class="cn">${c.name}</div><div class="cl"><span class="stars">${'★'.repeat(c.level)}${'☆'.repeat(5 - c.level)}</span>・${MJ.STYLE_JP[c.style]}</div></button>`;
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
      MJ.UI.overlay(`<div class="cfm"><h2>この3人と対戦しますか?</h2><div class="cfm-row">${cs.map((c) => `<div class="cfm-c"><img src="${c.img}" alt=""><b>${c.name.replace(/\(.*$/, '')}</b><span>${'★'.repeat(c.level)}${'☆'.repeat(5 - c.level)}</span></div>`).join('')}</div><p class="sub">${MJ.rulesSummary()}</p><div class="cfm-btns"><button class="btn big" id="cfm-cancel">キャンセル</button><button class="btn pri big" id="cfm-go">対局開始</button></div></div>`, { plain: true });
      document.querySelector('#cfm-cancel').addEventListener('click', () => MJ.UI.closeOverlay());
      document.querySelector('#cfm-go').addEventListener('click', () => { MJ.UI.closeOverlay(); this.start(); });
    },
    pickChar(id) {
      const i = this.picks.indexOf(id);
      if (i >= 0) this.picks.splice(i, 1);
      else if (this.picks.length < 3) this.picks.push(id);
      else { this.picks.shift(); this.picks.push(id); }
      const c = MJ.CHARS.find((x) => x.id === id);
      $('#char-detail').innerHTML = `<b>${c.name}</b>(${'★'.repeat(c.level)}${'☆'.repeat(5 - c.level)}・${MJ.STYLE_JP[c.style]})<br>${c.desc}`;
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
    launch(cfg, sv) {
      this.stopGame();
      const chars = cfg.picks.map((id) => MJ.CHARS.find((c) => c.id === id));
      const game = new MJ.Game({ chars, mode: cfg.mode, length: cfg.length, ui: MJ.UI });
      this.game = game;
      if (sv && MJ.Rank) MJ.Rank.apply(game, sv); // つづきから: 点数・局・本場を戻す
      MJ.UI.attach(game);
      MJ.UI.hintOn = !!cfg.teacher; MJ.UI.dangerOn = !!cfg.teacher; MJ.UI.syncHintBtn(); // 麻雀先生(ヒント)は、えらんだとおりに始める
      MJ.SFX.unlock();
      MJ.SFX.preloadVoices([0].concat(chars.map((c) => c.voice || c.id)));
      this.show('game');
      MJ.Intro.play(game).then(() => { if (this.game === game) game.run().catch((e) => { console.error(e); }); }); // スタート演出のあとで、対局を始める
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
    /* アプリの終了の確認(Fire TVの「戻る」でいきなり終了しない)。最初に選ばれているのは「つづける」 */
    confirmExit() {
      MJ.UI.overlay('<div class="cf"><h2>アプリをおわりますか?</h2><div class="cf-btns"><button class="btn danger" id="ex-yes">おわる</button><button class="btn pri" id="ex-no">つづける</button></div></div>', { plain: true });
      document.querySelector('#ex-no').addEventListener('click', () => MJ.UI.closeOverlay());
      document.querySelector('#ex-yes').addEventListener('click', () => {
        MJ.UI.closeOverlay();
        try { if (window.MJNative && window.MJNative.exit) { window.MJNative.exit(); return; } } catch (e) { /* ignore */ }
        try { const A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App; if (A && A.exitApp) { A.exitApp(); return; } } catch (e) { /* ignore */ }
        try { window.close(); } catch (e) { /* ignore */ }
      });
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
        if (st && st.games && $('#menu-stats')) $('#menu-stats').innerHTML = `対局成績: ${st.games}戦 / 1位 ${st.ranks[0]}回・2位 ${st.ranks[1]}回・3位 ${st.ranks[2]}回・4位 ${st.ranks[3]}回`;
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

  /* コントローラーの設定: 決定・もどるのボタンを、おぼえさせる(古いUSBコントローラーは、ボタンの並びが、標準と違うことがある) */
  function showPadSetup(msg) {
    const P = MJ.Pad, pads = P ? P.pads() : [];
    const gp = pads[0];
    const m = gp ? P.mapFor(gp) : null;
    const nm = (i) => `ボタン${i + 1}`;
    const info = gp ? `<b>${gp.id.replace(/\(.*$/, '').slice(0, 40)}</b><br>決定(A)= <b>${nm(m.a)}</b> ／ もどる(B)= <b>${nm(m.b)}</b>(${m.learned ? 'おぼえさせた割り当て' : '自動'})<br>押したボタン: <b id="pd-live">-</b>` : 'コントローラーが見つかりません。<br>コントローラーのボタンを1回押してから、もう一度ひらいてください。';
    MJ.UI.overlay(`<div class="cf"><h2 style="font-size:24px;margin:0 0 4px">🎮 コントローラーの設定</h2><p style="font-size:18px;line-height:1.4;margin:4px 0">${msg ? `<span style="color:#ffe27a">${msg}</span><br>` : ''}${info}</p><div class="cf-btns" style="flex-wrap:wrap;gap:8px"><button class="btn" id="pd-a" ${gp ? '' : 'disabled'}>決定にするボタンを、おぼえる</button><button class="btn" id="pd-b" ${gp ? '' : 'disabled'}>もどるにするボタンを、おぼえる</button><button class="btn" id="pd-r">自動にもどす</button><button class="btn pri" id="pd-x">とじる</button></div></div>`, { plain: true });
    const learn = (k, label) => {
      MJ.UI.overlay(`<div class="cf"><h2 style="font-size:26px">🎮 ${label}にするボタンを、押してください</h2><p style="font-size:18px">コントローラーのボタンを、1つ押します。<br>(押していたボタンは、いったん離してください)</p><div class="cf-btns"><button class="btn" id="pd-c">やめる</button></div></div>`, { plain: true });
      document.querySelector('#pd-c').addEventListener('click', () => { P.learn = null; showPadSetup(); });
      P.learn = { k, ready: false, cb: (g, idx) => showPadSetup(`${label}を、ボタン${idx + 1} にしました`) };
    };
    document.querySelector('#pd-a').addEventListener('click', () => learn('a', '決定'));
    document.querySelector('#pd-b').addEventListener('click', () => learn('b', 'もどる'));
    document.querySelector('#pd-r').addEventListener('click', () => { P.resetMap(); showPadSetup('自動の割り当てにもどしました'); });
    document.querySelector('#pd-x').addEventListener('click', () => showSettings());
    if (gp) { const t = setInterval(() => { const l = document.querySelector('#pd-live'); if (!l) return clearInterval(t); const lp = P.pads()[0]; if (lp) { const ps = []; lp.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.6) ps.push('ボタン' + (i + 1)); }); l.textContent = ps.length ? ps.join('・') : '-'; } }, 120); }
  }
  /* ルール設定: 変更はすぐ保存され、次の対局から使われる */
  function showRules() {
    const R = MJ.RULES;
    const sel = (k, opts) => `<select data-rk="${k}">${opts.map(([v, l]) => `<option value="${v}"${String(R[k]) === String(v) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    const tog = (k, on, off) => `<select data-rk="${k}" data-bool="1"><option value="1"${R[k] ? ' selected' : ''}>${on}</option><option value="0"${R[k] ? '' : ' selected'}>${off}</option></select>`;
    const row = (name, ctl, note) => `<div class="rl-row"><div class="rl-h"><b>${name}</b>${ctl}</div><div class="rl-n">${note}</div></div>`;
    MJ.UI.overlay(`<h2>⚙ ルール設定</h2><div class="rl-grid">
      ${row('対局の長さ', sel('length', [['east', '東風戦(東1〜4局)'], ['south', '東南戦(計8局)'], ['single', '一局だけ']]), '一局だけは練習向き。')}
      ${row('喰いタン', tog('kuitan', 'あり', 'なし'), 'ありなら、鳴いた手でも<b>タンヤオ</b>が成立。')}
      ${row('赤ドラ', sel('aka', [[3, '3枚(5萬・5筒・5索)'], [0, 'なし']]), '赤い5は持つだけで1飜。')}
      ${row('一発', tog('ippatsu', 'あり', 'なし'), 'リーチ後、1巡以内の和了で+1飜。')}
      ${row('裏ドラ', tog('ura', 'あり', 'なし'), 'リーチ和了で、裏のドラ表示牌をめくる。')}
      ${row('飛び(ハコテン)', tog('tobi', '終了する', '続ける'), '持ち点が0未満になったらゲーム終了。')}
      ${row('ダブロン', tog('doubleRon', 'あり', 'なし(頭ハネ)'), '同じ牌で複数人がロンできるとき、全員の和了を認めるか。')}
      ${row('喰い替え', tog('kuikae', '許可', '禁止'), '鳴いた直後に、鳴いた牌と同じ(近い)牌を切ること。')}
      ${row('数え役満', tog('kazoe', 'あり', 'なし(三倍満止まり)'), '13飜以上を役満として扱うか。')}
      ${row('季節牌(花牌)', tog('flower', 'あり', 'なし'), 'ありなら、春夏秋冬の4枚を山に加える。1枚で1飜。')}
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
      <p>麻雀牌・キャラクター画像は制作者が用意(生成)したものです。対戦相手は、歴史上の人物をモチーフにしています。</p>
      <h3>注意</h3>
      <p>点数・符の計算や危険度は、学習用の目安です。実際のルール(店・地域・アプリ)によって異なる場合があります。</p>
      </div><div class="res-foot"><button class="btn pri" id="cr-close">閉じる</button></div>`, { plain: true });
    document.querySelector('#cr-close').addEventListener('click', () => MJ.UI.closeOverlay());
  }

  /* せってい: 音・ノート・用語辞典・ルール・クレジットへの入口(大きなボタン) */
  const AUDIO_HTML = `<div class="audioset">
        <label><input type="checkbox" class="ac" data-audio="bgm"> BGM</label>
        <label class="vol">BGM音量 <input type="range" class="ac" data-audio="vol" min="0" max="0.3" step="0.01"></label>
        <label><input type="checkbox" class="ac" data-audio="sfx"> 効果音</label>
        <label class="vol">効果音の音量 <input type="range" class="ac" data-audio="svol" min="0" max="1" step="0.05"></label>
        <label><input type="checkbox" class="ac" data-audio="voice"> 掛け声(ロン・ポン等)</label>
        <label class="vol">掛け声の音量 <input type="range" class="ac" data-audio="cvol" min="0.05" max="1" step="0.05"></label>
        <label><input type="checkbox" class="ac" data-audio="yakuread"> 上がったとき役を自動で読み上げ</label>
        <label class="vol">読み上げの音量 <input type="range" class="ac" data-audio="rvol" min="0.1" max="1" step="0.05"></label>
        <label class="vol">読み上げの速さ <input type="range" class="ac" data-audio="rrate" min="0.6" max="1.6" step="0.05"></label>
      </div>`;
  function showSettings() {
    MJ.UI.overlay(`<h2>設定</h2><div class="st-list">
      <button class="btn big" id="st-audio">🔊 音の大きさ</button>
      <button class="btn big" id="st-think"></button>
      <button class="btn big" id="st-spd"></button>
      <button class="btn big" id="st-fx"></button>
      <button class="btn big" id="st-fxl"></button>
      <button class="btn big" id="st-pad">🎮 コントローラー</button>
      <button class="btn big" id="st-perf">📈 動作の測定</button>
      <button class="btn big" id="st-save"></button>
      <button class="btn big" id="st-notes">📖 麻雀参考書</button>
      <button class="btn big" data-open-yaku>📖 役一覧</button>
      <button class="btn big" data-open-gloss>📚 用語辞典</button>
      <button class="btn big" data-open-rules>⚙ ルール</button>
      <button class="btn big" data-open-credits>ℹ クレジット</button>
      <button class="btn big" id="st-reset">🗑 セーブのリセット</button>
    </div><div class="res-foot"><button class="btn big" id="st-close">◀ もどる</button></div>`, { plain: true });
    const o = document.querySelector('#overlay');
    o.querySelector('#st-close').addEventListener('click', () => MJ.UI.closeOverlay());
    const TL = { off: 'なし', normal: 'ふつう', slow: 'ゆっくり' };
    const thBtn = o.querySelector('#st-think');
    const thSync = () => { thBtn.textContent = '💬 悩んだときのひとこと: ' + TL[MJ.UI.thinkMode()]; };
    thSync();
    const fxLB = o.querySelector('#st-fxl'); const fxLS = () => { fxLB.textContent = '✨ 演出: ' + MJ.FX.JP[MJ.FX.level()] + (MJ.FX.isAuto() ? '(自動)' : ''); }; fxLS(); fxLB.addEventListener('click', () => { MJ.FX.cycle(); fxLS(); });
    o.querySelector('#st-pad').addEventListener('click', () => showPadSetup());
    o.querySelector('#st-perf').addEventListener('click', async () => {
      const t0 = performance.now(); MJ.UI.overlay('<div class="cf"><h2>📈 動作の測定中…(約5秒)</h2><p>そのまま、お待ちください。</p></div>', { plain: true });
      const fr = await MJ.FX.measure(5); const ms = Math.round(performance.now() - t0);
      const ua = navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 60);
      const rows = fr ? '1秒ごと: ' + fr.map((v) => Math.round(v)).join(' / ') : '測れませんでした(画面が隠れていました)';
      const avg = fr ? Math.round(fr.reduce((a, b) => a + b, 0) / fr.length) : '-';
      const SC = { title: 'タイトル', menu: 'ホーム', game: '対局・クイズ・勉強' };
      const lg = MJ.perf.long.filter((x) => x.dur >= 50).slice(-6).reverse();
      const longRows = lg.length ? lg.map((x) => `${x.at}秒 ${x.dur}ミリ秒止まった(${SC[x.scene] || x.scene}・直前: ${x.ctx})`).join('<br>') : 'なし(50ミリ秒以上の止まりは、記録されていません)';
      const st = MJ.perf.steps, base = st.length ? st[0][1] : 0;
      const stepRows = st.length ? st.map((x, i) => `${x[0]}: +${x[1] - base}ミリ秒`).join(' → ') : '(「はじめる」を押すと、ここに内訳が出ます)';
      MJ.UI.overlay(`<div class="cf"><h2 style="font-size:22px;margin:0 0 2px">📈 動作の測定の結果</h2><p style="font-size:17px;line-height:1.3;margin:2px 0">平均 <b>${avg}</b> コマ/秒(60に近いほど、なめらか)<br>${rows}<br>演出: ${MJ.FX.JP[MJ.FX.level()]}${MJ.FX.isAuto() ? '(自動)' : ''} ／ 画面 ${innerWidth}×${innerHeight} ／ CPU ${navigator.hardwareConcurrency || '?'}コア ／ メモリ ${navigator.deviceMemory || '?'}GB</p><p style="font-size:15px;line-height:1.3;text-align:left;margin:4px 0"><b>止まった記録</b>(新しい順)<br>${longRows}<br><b>「はじめる」の内訳</b><br>${stepRows}</p><div class="cf-btns"><button class="btn pri" id="pf-close">とじる</button></div></div>`, { plain: true });
      document.querySelector('#pf-close').addEventListener('click', () => showSettings());
    });
    const spB = o.querySelector('#st-spd'); const spS = () => { spB.textContent = '⏱ CPUの速さ: ' + MJ.CPU_SPEED_JP[MJ.cpuSpeed()]; }; spS(); spB.addEventListener('click', () => { MJ.cycleCpuSpeed(); spS(); });
    const fxB = o.querySelector('#st-fx'); const fxS = () => { fxB.textContent = '⚡ 派手な上がり演出: ' + (MJ.UI.winFxOn() ? 'あり' : 'なし'); }; fxS(); fxB.addEventListener('click', () => { MJ.UI.setWinFx(!MJ.UI.winFxOn()); fxS(); });
    const svB = o.querySelector('#st-save'); const svS = () => { svB.textContent = '💾 自動セーブ(つづき): ' + (MJ.Rank.saveOn() ? 'あり' : 'なし'); }; svS(); svB.addEventListener('click', () => { MJ.Rank.setSaveOn(!MJ.Rank.saveOn()); svS(); });
    thBtn.addEventListener('click', () => { const o2 = ['normal', 'slow', 'off']; MJ.UI.setThinkMode(o2[(o2.indexOf(MJ.UI.thinkMode()) + 1) % 3]); thSync(); });
    o.querySelector('#st-reset').addEventListener('click', () => {
      MJ.UI.overlay('<div class="cf"><h2>セーブをリセットしますか?</h2><p>対局の成績と、あなたのキャラクターが消えます。<br>次からは、新しいキャラクターが選ばれます。</p><div class="cf-btns"><button class="btn danger" id="rs-yes">⚠ リセットする</button><button class="btn pri" id="rs-no">やめる</button></div></div>', { plain: true });
      document.querySelector('#rs-no').addEventListener('click', () => showSettings());
      document.querySelector('#rs-yes').addEventListener('click', () => {
        MJ.resetSave();
        const st = document.querySelector('#menu-stats'); if (st) st.textContent = '';
        MJ.UI.closeOverlay();
        MJ.UI.toast('セーブをリセットしました');
      });
    });
    o.querySelector('#st-notes').addEventListener('click', () => { MJ.UI.closeOverlay(); MJ.App.openNotes(); });
    o.querySelector('#st-audio').addEventListener('click', () => {
      MJ.UI.overlay(`<h2>🔊 音の大きさ</h2>${AUDIO_HTML}<div class="res-foot"><button class="btn pri big" id="au-close">◀ もどる</button></div>`, { plain: true });
      MJ.UI.syncAudio();
      document.querySelector('#au-close').addEventListener('click', () => showSettings());
    });
  }

  /* ホーム・タイトルの桜吹雪: ゆっくり、ずっと流れる(CSSだけで動かす) */
  function addPetals(sel, n) {
    const host = $(sel); if (!host || host.querySelector('.mn-petals')) return;
    const box = document.createElement('div'); box.className = 'mn-petals';
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i'); p.className = 'mn-petal';
      const dur = 11 + Math.random() * 8;
      p.style.cssText = `left:${(Math.random() * 100).toFixed(1)}%;--dx:${(Math.random() * 16 - 4).toFixed(1)}vw;--sz:${(8 + Math.random() * 10).toFixed(0)}px;--r:${(Math.random() * 360).toFixed(0)}deg;animation-duration:${dur.toFixed(1)}s;animation-delay:${(-Math.random() * dur).toFixed(1)}s`;
      box.appendChild(p);
    }
    host.insertBefore(box, host.firstChild);
  }

  function init() {
    addPetals('#screen-menu', 22); // タイトルは桜吹雪なし(邪魔だったため)
    MJ.Gloss.init();
    MJ.loadRules();
    document.addEventListener('click', (e) => { if (e.target.closest('[data-open-credits]')) showCredits(); else if (e.target.closest('[data-open-rules]') || e.target.closest('#sel-rules')) showRules(); });
    $('#sel-length').addEventListener('change', () => { MJ.RULES.length = $('#sel-length').value; MJ.saveRules(); $('#sel-rule-sum').textContent = 'ルール: ' + MJ.rulesSummary(); });
    MJ.UI.init();
    window.addEventListener('resize', () => { App.fitMenu(); App.fitTitle(); });
    MJ.DrillUI.init();
    MJ.Study.init();
    if (MJ.SFX.isIOS) document.body.classList.add('ios'); // iPhone・iPad: 音声合成の読み上げは、AirPlayのテレビに出ないので、読み上げボタンを出さない
    ['11', '14', '21', '36'].forEach((n) => { const im = new Image(); im.src = `img/teacher/t${n}.webp`; MJ.preloaded.push(im); }); // 麻雀先生の顔は、起動してすぐ読み込む
    MJ.SFX.loadYk(); // 上がったときの役・点数の読み上げ(収録音声)
    // 最初の操作でBGMを開始。iPhoneは pointerdown/touchstart では許可されないため、指を離した時(touchend/click)でも毎回試す
    // 読み上げ(音声合成)の準備は、最初のタップでは行わない: Windowsでは、はじめて使うとき、数秒、画面が止まることがあるため。いちばん最初に読み上げるときに、準備される
    const unlock = () => { MJ.SFX.unlock(); MJ.Audio.resume(); };
    ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, unlock, { capture: true, passive: true }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) MJ.Audio.resume(); });
    document.addEventListener('click', (e) => {
      if (e.target.closest('.hand .tile')) return;
      if (e.target.closest('button, summary, .char, .mode-card')) MJ.SFX.play('click');
    }, true);
    App.buildMenu();
    $('#btn-start').addEventListener('click', () => {
      MJ.perf.mark('はじめる'); MJ.perf.step('押した');
      const go = () => {
        App.show('menu', { quiet: true }); MJ.perf.step('ホームを出した');
        requestAnimationFrame(() => requestAnimationFrame(() => { // 最初の1コマが描かれたあとに、音を鳴らす
          MJ.perf.step('ホームの1コマ目');
          MJ.SFX.unlock(); MJ.SFX.play('start'); MJ.perf.step('音の準備');
          setTimeout(() => { MJ.Audio.setScene('home'); MJ.perf.step('BGMを開始'); MJ.Rank.syncMenu(); setTimeout(() => MJ.Rank.daily(), 500); }, 60);
        }));
      };
      Promise.race([MJ.menuReady || Promise.resolve(), new Promise((r) => setTimeout(r, 2500))]).then(go);
    }); // メニューの背景が読み込まれてから移る
    $('#bell').addEventListener('click', () => MJ.Audio.setOn(!MJ.Audio.on) || MJ.UI.syncAudio());
    // 「おわる」は、AndroidとパソコンのSteamだけ(iPhoneとFire TVには、アプリを自分で終了する仕組みがないので出さない)
    const ua = navigator.userAgent || '';
    const noExit = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || /AFT[A-Z0-9]*\b|Fire ?TV|FireOS/i.test(ua);
    if (noExit) { const ex = $('#btn-exit'); if (ex) ex.remove(); }
    else $('#btn-exit').addEventListener('click', () => App.confirmExit());
    $('#hm-title').addEventListener('click', () => App.show('title'));
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
    $('#btn-vol').addEventListener('click', () => MJ.UI.openVolume());
    $('#btn-quit').addEventListener('click', () => {
      MJ.UI.overlay('<div class="cf"><h2>対局をやめますか?</h2><p>ホームに戻ります。</p><div class="cf-btns"><button class="btn danger" id="q-yes">ホームにもどる</button><button class="btn pri" id="q-no">つづける</button></div></div>', { plain: true });
      document.querySelector('#q-no').addEventListener('click', () => MJ.UI.closeOverlay());
      document.querySelector('#q-yes').addEventListener('click', () => App.toMenu());
    });
  }
  /* 画像の先読み: タイトル/ホームの背景 → キャラ → 自分のアイコン → 牌 の順に、起動直後から裏で読み込んでおく(画面切替で真っ黒にならない) */
  MJ.preloaded = [];
  const pad2 = (i) => String(i).padStart(2, '0');
  /* 画像を読み込んで、デコードまで終わらせる(失敗しても止まらない)。読み込んだ絵は MJ.preloaded に持っておく */
  const loadImg = (u) => new Promise((ok) => { const im = new Image(); im.decoding = 'async'; im.onload = () => { (im.decode ? im.decode() : Promise.resolve()).then(ok, ok); }; im.onerror = ok; im.src = u; MJ.preloaded.push(im); });
  /* 背景の絵は、データとして取り寄せて、CSS変数に入れる(CSSの背景の読み込みが遅れたり、抜けたりしないように) */
  const loadArt = (u, v) => fetch(u).then((r) => { if (!r.ok) throw new Error('x'); return r.blob(); }).then((b) => { const url = URL.createObjectURL(b); document.documentElement.style.setProperty(v, `url(${url})`); (MJ.artUrl = MJ.artUrl || {})[v] = url; return loadImg(url); }).catch(() => loadImg(u));
  const pool = (urls, n) => new Promise((done) => { let k = 0, run = 0; const go = () => { if (k >= urls.length && run === 0) return done(); while (run < n && k < urls.length) { run++; loadImg(urls[k++]).then(() => { run--; go(); }); } }; go(); });
  /* 全画面で必要な絵(牌・顔・麻雀先生・背景・ボタン)は、タイトルを出す前に全部そろえる */
  const ESSENTIAL = (() => {
    const u = [];
    for (let i = 0; i < 34; i++) u.push(`img/tiles/${i}.webp`);
    ['r4', 'r13', 'r22'].forEach((n) => u.push(`img/tiles/${n}.webp`));
    for (let i = 1; i <= MJ.CHARS.length; i++) { u.push(`img/chars/face/${pad2(i)}.webp`); u.push(`img/chars/${pad2(i)}.webp`); }
    ['11', '14', '21', '36'].forEach((n) => u.push(`img/teacher/t${n}.webp`));
    try { const yi = pad2(MJ.youIndex()); u.push(`img/you/${yi}.webp`); } catch (e) { /* ignore */ } // いまの、あなたの絵(成績・段位の画面・対局)
    ['img/btn_start.webp', 'img/bgm_on.png', 'img/bgm_off.png', 'img/logo.webp', 'img/rank_bg.webp', 'img/cert.webp'].forEach((x) => u.push(x));
    return u;
  })();
  /* そのほか(左右反転の顔・あなたの絵・麻雀先生の表情)は、タイトルのあと、裏で読み込む */
  const LATER = (() => {
    const u = [];
    for (let i = 1; i <= MJ.CHARS.length; i++) u.push(`img/chars/face/${pad2(i)}_f.webp`);
    for (let i = 1; i <= 18; i++) { u.push(`img/you/${pad2(i)}.webp`); }
    for (const a of [1, 2, 3]) for (const b of [1, 2, 3, 4, 5, 6]) u.push(`img/teacher/t${a}${b}.webp`);
    return u;
  })();
  MJ.essentialReady = Promise.all([loadArt('img/title_art.webp', '--art-title'), loadArt('img/menu_bg.webp', '--art-menu'), pool(ESSENTIAL, 6)]);
  MJ.laterReady = MJ.essentialReady.then(() => pool(LATER, 4));
  function preload() { /* (以前の先読みは、上の MJ.essentialReady / MJ.laterReady が行う) */ }
  init();
  /* タイトル画面の桜: 花びらを、ゆっくり何度でも降らせる(最初から画面全体に散らばっているように、アニメの開始位置をずらす) */
  (function sakura() {
    const host = $('#tt-petals'); if (!host) return;
    for (let i = 0; i < 28; i++) {
      const p = document.createElement('i');
      const sz = 1.3 + Math.random() * 1.5, dur = 9 + Math.random() * 7;
      p.style.cssText = `left:${(Math.random() * 110 - 5).toFixed(1)}%;--sz:${sz.toFixed(2)}cqw;--dx:${(Math.random() * 16 - 4).toFixed(1)}cqw;--r:${Math.round(Math.random() * 360)}deg;animation-duration:${dur.toFixed(1)}s;animation-delay:${(-Math.random() * dur).toFixed(1)}s`;
      host.appendChild(p);
    }
  })();
  function placeStart() { App.fitTitle(); }
  MJ.placeStart = placeStart;
  window.addEventListener('resize', placeStart);
  window.addEventListener('orientationchange', () => setTimeout(placeStart, 250));
  (function titleReady() {
    const done = () => { placeStart(); document.body.classList.add('title-ready'); };
    placeStart();
    let fired = false;
    const once = () => { if (!fired) { fired = true; done(); } };
    // 背景の絵・ボタン・牌・顔など、全画面で使う絵が、すべて読み込まれて(デコードまで終わって)から出す
    MJ.essentialReady.then(once);
    MJ.essentialReady.then(() => { if (MJ.FX) MJ.FX.autoDetect(); }); // 重い端末なら、自動で演出を軽量に
    // タイトルが落ち着いたら、押す前に、重い準備を済ませておく(音の出口・ホームの背景の変換と、最初の描画)
    MJ.essentialReady.then(() => setTimeout(() => {
      MJ.perf.mark('先読み'); try { MJ.SFX.prepare(); } catch (e) { /* ignore */ }
      const u = MJ.artUrl && MJ.artUrl['--art-menu']; if (u) { const im = new Image(); im.src = u; if (im.decode) im.decode().catch(() => {}); }
      setTimeout(() => App.prewarmMenu && App.prewarmMenu(), 600);
    }, 1500));
    MJ.menuReady = MJ.essentialReady;
    setTimeout(once, 20000); // 回線がとても遅いときだけ、あきらめて先に出す
  })();
  // 起動直後(タイトルの間)に、ホーム曲を最優先で取り寄せる
  // 画像の先読みは、ホーム曲が取り寄せ終わってから(通信を取り合って曲が遅れないように)
  if (MJ.warmAudio) MJ.warmAudio(['audio/home.mp3']).then(preload); else preload();
})();
