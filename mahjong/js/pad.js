/* コントローラー・リモコン・キーボード操作(Fire TV / Bluetoothパッド / Steam想定)
   使うのは、十字キー(カーソル移動)と A(決定)と B(戻る・パス)だけ。リーチ・ポン・解説なども、枠を動かして A で押す
   最初にボタンを押すと「パッド操作」になり、カーソル(白い枠)が出る。マウスやタッチを使うと枠は消える */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const $ = (s, r = document) => r.querySelector(s);
  const FOCUSABLE = 'button, [data-act], .hand .tile[data-id], .pm-arrow, #dq-hand .hand .tile.ok[data-i], summary, input, select, a[href], .mode-card, [data-mode], .char, [data-pj], [data-pg], [data-readfrom], [data-dtab], [data-open-gloss], [data-open-yaku], [data-open-credits], .gl, [tabindex]';
  const P = (MJ.Pad = { on: false, cur: null, desc: null, dev: 'mouse' });
  /* 鳴き・ロンの確認が出た直後は、パッド/キーを受け付けない(連打で押してしまうのを防ぐ)。マウス・タッチは対象外 */
  const LOCK_MS = 2000;
  P.lockLeft = () => {
    const U = MJ.UI;
    if (!(U && U.sel && U.sel.type === 'react' && P.dev === 'pad')) return 0;
    return Math.max(0, LOCK_MS - (Date.now() - (U.reactAt || 0)));
  };
  P.syncLock = () => {
    const cq = $('.callq');
    if (!cq) return;
    const left = P.lockLeft();
    cq.classList.toggle('locked', left > 0);
    cq.classList.toggle('pick', !!P.tiles);
    if (left > 0) { clearTimeout(P._lt); P._lt = setTimeout(() => { const c = $('.callq'); if (c) c.classList.remove('locked'); }, left + 20); }
  };
  P.onReact = () => { P.tiles = false; document.body.classList.remove('pick-tiles'); if (P.cur) P.cur.classList.remove('pf'); P.cur = null; P.desc = null; }; // 確認が出たら、カーソルは「見送る」から始める

  const rectOf = (el) => el.getBoundingClientRect();
  const visible = (el) => {
    if (!el.isConnected) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.disabled) return false;
    const r = rectOf(el);
    if (r.width < 4 || r.height < 4) return false;
    // スクロールする画面(メニュー・選択・ノート・ダイアログなど)は、画面の外にある項目も選べる(選ぶと自動でスクロールする)
    { const d = el.closest('details'); if (d && !d.open && !el.matches('summary')) return false; } // 閉じた設定の中は選べない
    if (el.closest('#screen-menu, #screen-select, #screen-notes, #overlay, #gloss-panel, #rk-panel, #screen-title')) return true;
    return r.right > 0 && r.bottom > 0 && r.left < G.innerWidth && r.top < G.innerHeight;
  };
  /* いま操作できる範囲: 説明パネル > ダイアログ > ゲーム/各画面 */
  const scope = () => {
    const gl = ['#rk-panel.on', '#gloss-panel.on', '#gloss-sheet.on', '#gloss-panel:not(.hidden)'].map((s) => $(s)).find(Boolean);
    if (gl) return [gl];
    const ov = $('#overlay');
    if (ov && !ov.classList.contains('hidden')) return [ov];
    const cq = $('.callq');
    if (cq && visible(cq)) return [cq]; // 鳴きの確認が出ている間は、そのボタンだけを選べる
    const roots = [...document.querySelectorAll('.screen:not(.hidden)')];
    const tools = $('#sd-tools');
    if (tools && !tools.classList.contains('hidden')) return [tools];
    if (document.body.classList.contains('coach-open') && $('#coach')) return [$('#coach'), ...roots];
    return roots.length ? roots : [document.body];
  };
  const inScope = (el) => scope().some((r) => r.contains(el));
  const items = () => {
    const out = [];
    scope().forEach((root) => root.querySelectorAll(FOCUSABLE).forEach((el) => {
      if (el.matches('[tabindex="-1"], input[type=hidden], .ph')) return;
      if (el.tagName === 'DETAILS') return;
      if (el.closest('.hidden') && !root.classList.contains('hidden')) return;
      if (visible(el)) out.push(el);
    }));
    return out;
  };
  const descOf = (el) => {
    if (!el) return null;
    if (el.matches('.hand .tile[data-id]')) return `.hand .tile[data-id="${el.dataset.id}"]`;
    if (el.matches('#dq-hand .tile[data-i]')) return `#dq-hand .tile[data-i="${el.dataset.i}"]`;
    if (el.dataset && el.dataset.ids) return `[data-ids="${el.dataset.ids}"]`;
    if (el.dataset && el.dataset.act) return `[data-act="${el.dataset.act}"]${el.dataset.t ? `[data-t="${el.dataset.t}"]` : ''}`;
    if (el.id) return `#${el.id}`;
    return null;
  };
  // 光っている(.pf)のは、いつも1つだけ。画面の切り替えで残った古い光を、まとめて消す
  const clearPf = (keep) => { document.querySelectorAll('.pf').forEach((x) => { if (x !== keep) { x.classList.remove('pf'); x.classList.remove('pf-rel'); } }); };
  P.clearPf = clearPf;
  const setCur = (el) => {
    clearPf(el);
    if (P.cur) { P.cur.classList.remove('pf'); P.cur.classList.remove('pf-rel'); }
    P.cur = el || null;
    P.desc = descOf(el);
    if (el && el.matches('.hand .tile[data-id]')) P.idx = [...document.querySelectorAll('.hand .tile[data-id]')].indexOf(el); else P.idx = -1; // 手牌の何番目か(捨てたあとも、同じ位置にカーソルを残す)
    if (el) {
      el.classList.toggle('pf-rel', getComputedStyle(el).position === 'static');
      el.classList.add('pf');
      if (el.matches('.cq-btn') && MJ.UI && MJ.UI.hlCall) MJ.UI.hlCall(el);
      try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* ignore */ }
      if (el.matches('.hand .tile[data-id]') && MJ.UI && MJ.UI.showInfo) { try { MJ.UI.showInfo(+el.dataset.id); } catch (e) { /* ignore */ } }
    }
  };
  /* 最初に選ぶ場所(自分の番ならおすすめの牌、鳴けるなら最初の鳴きボタン) */
  const pickDefault = () => {
    const U = MJ.UI;
    if (U && U.game && !$('#screen-game').classList.contains('hidden') && $('#overlay').classList.contains('hidden')) {
      const cq = $('.cq-btn.b-pass') || $('.cq-btn[data-act]'); // 初めは「見送る」
      if (cq && visible(cq)) return cq;
      const t = $('.hand .tile.rec') || $('.hand .tile.drawn:not(.ph)') || [...document.querySelectorAll('.hand .tile[data-id]')].pop();
      if (t && visible(t)) return t;
    }
    // 練習問題: 答え合わせなら「次の問題」、選択式なら最初の選択肢、牌を選ぶ問題なら手牌の真ん中
    if (!$('#screen-drill').classList.contains('hidden') && !$('#drill-quiz').classList.contains('hidden')) {
      const nx = $('#dq-fb:not(.hidden) #dq-next');
      if (nx && visible(nx)) return nx;
      const op = $('.dq-opt:not([disabled])');
      if (op && visible(op)) return op;
      const ts = [...document.querySelectorAll('#dq-hand .tile.ok')].filter(visible);
      if (ts.length) return ts[Math.floor(ts.length / 2)];
    }
    if (!$('#screen-drill').classList.contains('hidden') && !$('#drill-home').classList.contains('hidden')) {
      const dc = $('#drill-home .dcat');
      if (dc && visible(dc)) return dc;
    }
    const all = items();
    const pref = all.find((e) => e.matches('#btn-start, #hm-play, .sy-nb.go, #cfm-go, #pm-done, #pm-next, .btn.pri, .btn.start, [data-mode]')) || all[0];
    return pref || null;
  };
  P.refocus = () => {
    if (!P.on) return;
    if (P.cur && P.cur.isConnected && visible(P.cur) && inScope(P.cur)) { clearPf(P.cur); P.cur.classList.add('pf'); return; }
    if (P.cur) { P.cur.classList.remove('pf'); P.cur = null; }
    let el = P.desc ? $(P.desc) : null;
    if (!(el && visible(el) && inScope(el)) && P.idx >= 0) { // 手牌のカーソルの牌がなくなった(捨てた・変わった): 同じ位置の牌に、カーソルを残す(別の所へ、ぴょこっと飛ばない)
      const ts = [...document.querySelectorAll('.hand .tile[data-id]')].filter(visible);
      if (ts.length) el = ts[Math.min(P.idx, ts.length - 1)];
    }
    if (!(el && visible(el) && inScope(el))) el = pickDefault();
    setCur(el);
  };
  /* 対局のはじまり・自分の番のはじまり: カーソルを、手牌に置く(いちばん右の牌 = 引いた牌。おすすめがあれば、その牌) */
  P.focusHand = () => {
    if (!P.on) return;
    const U = MJ.UI;
    if (!(U && U.game && !$('#screen-game').classList.contains('hidden') && $('#overlay').classList.contains('hidden'))) return;
    if ($('.callq') && visible($('.callq'))) return; // 鳴きの確認が出ているときは、そのボタン
    const t = $('.hand .tile.rec') || $('.hand .tile.drawn:not(.ph)') || [...document.querySelectorAll('.hand .tile[data-id]')].filter(visible).pop();
    if (t && visible(t)) setCur(t);
  };

  const move = (dx, dy) => {
    const cur = P.cur && P.cur.isConnected && visible(P.cur) ? P.cur : null;
    if (!cur) { setCur(pickDefault()); return; }
    // 音量などのスライダーは、左右で値を変える
    if (cur.matches('input[type=range]') && dx) {
      const step = (+cur.step || 0.05) * dx, v = Math.max(+cur.min, Math.min(+cur.max, +cur.value + step));
      cur.value = v; cur.dispatchEvent(new Event('input', { bubbles: true })); cur.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (cur.matches('select') && dx) {
      const i = Math.max(0, Math.min(cur.options.length - 1, cur.selectedIndex + dx));
      if (i !== cur.selectedIndex) { cur.selectedIndex = i; cur.dispatchEvent(new Event('change', { bubbles: true })); }
      return;
    }
    // 手牌から「上」を押すと、押せるボタン(ツモ・リーチ・カン…)へ一気に移る(手牌→ボタンを何回も押さなくて済む)
    if (dy < 0 && cur.matches('.hand .tile[data-id]')) {
      const act = [...document.querySelectorAll('#sd-act [data-act]')].find((e) => !e.disabled && visible(e));
      if (act) { setCur(act); return; }
    }
    // ボタンの列から「左」を押すと手牌へ戻る
    if (dx < 0 && cur.closest('#sd-act, #btn-coach, #btn-tools')) {
      const t = $('.hand .tile.rec') || [...document.querySelectorAll('.hand .tile[data-id]')].filter(visible).pop();
      if (t) { setCur(t); return; }
    }
    const a = rectOf(cur), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity, same = null, sameBest = Infinity;
    items().forEach((el) => {
      if (el === cur || el.contains(cur) || cur.contains(el)) return;
      const r = rectOf(el), bx = r.left + r.width / 2, by = r.top + r.height / 2;
      const along = dx ? (bx - ax) * dx : (by - ay) * dy;
      const side = dx ? Math.abs(by - ay) : Math.abs(bx - ax);
      if (along <= 2) return;
      const s = along + side * 2.2;
      if (dx && side < a.height * 0.5 && along < sameBest) { sameBest = along; same = el; } // 同じ行にあるものを、優先する
      if (s < bs) { bs = s; best = el; }
    });
    if (same) best = same;
    if (best) setCur(best);
  };
  const press = (name) => {
    const U = MJ.UI;
    const click = (sel) => { const e = $(sel); if (e && !e.disabled && visible(e)) { e.click(); return true; } return false; };
    switch (name) {
      case 'a': if (P.cur && P.cur.isConnected) { if (U && U.sel && U.sel.type === 'self' && P.cur.matches('.hand .tile[data-id]')) U.picked = +P.cur.dataset.id; /* パッドでは、牌にカーソルを合わせてAで、すぐ捨てる */ P.cur.click(); setTimeout(() => { if (P.on && !(P.cur && visible(P.cur))) { P.cur = null; P.refocus(); } }, 150); } else setCur(pickDefault()); break;
      case 'b': {
        if (MJ.Rank && MJ.Rank.isOpen()) { MJ.Rank.back(); return; }
        // 用語・役の説明(シート/一覧)が開いているときは、まずそれだけを閉じる(下の画面は、そのまま)
        if (MJ.Gloss && $('#gloss-sheet.on')) { MJ.Gloss.closeSheet(); return; }
        if (MJ.Gloss && $('#gloss-panel.on')) { MJ.Gloss.panelBack(); setTimeout(() => { if (P.on && !(P.cur && visible(P.cur))) { P.cur = null; P.refocus(); } }, 150); return; }
        const ov = $('#overlay');
        if (ov && !ov.classList.contains('hidden')) {
          const btns = [...ov.querySelectorAll('button')].filter((b) => visible(b));
          const hit = btns.find((b) => /続ける|つづける|閉じる|キャンセル|とじる/.test(b.textContent)) || btns.find((b) => /^[◀←]?\s*(もどる|戻る)$|^OK$/.test(b.textContent.trim())) || btns.find((b) => /やめる/.test(b.textContent)) || btns.find((b) => b.id === 'pm-prev' && b.style.visibility !== 'hidden');
          if (hit) { hit.click(); setTimeout(() => { if (P.on && !(P.cur && visible(P.cur))) { P.cur = null; P.refocus(); } }, 150); }
          return;
        }
        if (!$('#sd-tools').classList.contains('hidden')) { $('#sd-tools').classList.add('hidden'); return; }
        if (document.body.classList.contains('coach-open')) { document.body.classList.remove('coach-open'); return; }
        if (!$('#screen-game').classList.contains('hidden')) {
          if (U && U.sel) {
            if (U.sel.type === 'react') return; // 鳴きの確認では、Bは何もしない(誤操作防止)
            if (U.riichiMode) { click('[data-act=riichi]'); return; }
            if (U.picked != null) { U.picked = null; U.render(U.game); return; }
          }
          click('#btn-quit'); P.lockUntil = Date.now() + 600; // 対局中の「戻る」は、中断の確認を出す
          return;
        }
        P.goBack(); return;
        // それ以外の画面(クイズ・ノートなど)では「戻る」を探す
        const back = [...document.querySelectorAll('.screen:not(.hidden) button')].find((x) => /戻る|もどる|メニューへ|タイトルへ/.test(x.textContent) && visible(x));
        if (back) back.click();
        break;
      }
      default: break;
    }
  };
  /* 画面が出たときから、最初のボタンを「選択中」にしておく(パッドを押す前でも、色で分かる)。force=true で、選び直す */
  P.setCur = (el) => setCur(el);
  P.preselect = (force) => {
    if (force) { if (P.cur) P.cur.classList.remove('pf'); P.cur = null; P.desc = null; }
    if (P.cur && P.cur.isConnected && visible(P.cur) && inScope(P.cur)) { clearPf(P.cur); P.cur.classList.add('pf'); return; }
    setCur(pickDefault());
  };
  P.saveCur = () => { P.saved = P.cur; };
  P.restoreCur = () => {
    const s = P.saved; P.saved = null;
    if (s && s.isConnected && visible(s) && inScope(s)) { clearPf(s); P.cur = s; P.desc = descOf(s); s.classList.add('pf'); } else P.preselect(true);
  };
  /* Bボタンで戻るときの確認。「つづける」が最初に選ばれ、出た直後の0.6秒は、ボタンを受け付けない(連打で、うっかり戻らないように) */
  P.confirmBack = (msg, yesLabel, onYes) => {
    const U = MJ.UI;
    U.overlay(`<div class="cf"><h2>${msg}</h2><div class="cf-btns"><button class="btn danger" id="bk-yes" type="button">${yesLabel}</button><button class="btn pri" id="bk-no" type="button">つづける</button></div></div>`);
    P.lockUntil = Date.now() + 600;
    document.querySelector('#bk-no').addEventListener('click', () => U.closeOverlay());
    document.querySelector('#bk-yes').addEventListener('click', () => { U.closeOverlay(); onYes(); });
  };
  /* 画面ごとの、Bボタン(戻る)の動き */
  P.goBack = () => {
    const shown = (id) => { const e = $(id); return e && !e.classList.contains('hidden'); };
    const A = MJ.App, ask = P.confirmBack;
    if (shown('#screen-title')) { A.confirmExit(); P.lockUntil = Date.now() + 600; return; }
    if (shown('#screen-menu')) return ask('タイトルに戻りますか?', '戻る', () => A.show('title'));
    if (shown('#screen-select')) return ask('ホームに戻りますか?<br>(選んだ相手は、消えます)', '戻る', () => { const b = $('#sel-back'); if (b) b.click(); });
    if (shown('#screen-notes')) { const b = $('#notes-back'); if (b) b.click(); return; }
    if (shown('#screen-study')) {
      const S = MJ.Study;
      if (S.lesson) { if (S.page > 0) { S.page--; S.render(); return; } return ask('勉強の一覧に戻りますか?', '戻る', () => { S.lesson = null; S.render(); }); }
      return ask('ホームに戻りますか?', '戻る', () => A.show('menu'));
    }
    if (shown('#screen-drill')) {
      const D = MJ.DrillUI;
      if (D.mode === 'eval') { // 麻雀先生の評価・特訓の結果: 確認なしで、1つ前へ
        if (D.view === 'result') return D.openEval(D.trainSrc);
        if (D.evBack === 'rank') return A.show('menu');
        return D.openAuto();
      }
      if (D.mode === 'train') return ask('特訓をやめますか?', 'やめる', () => D.openEval(D.trainSrc));
      return ask(D.backTo === 'study' ? '勉強の一覧に戻りますか?' : 'ホームに戻りますか?', '戻る', () => { const b = $('#drill-back'); if (b) b.click(); });
    }
    const back = [...document.querySelectorAll('.screen:not(.hidden) button')].find((x) => /戻る|もどる|メニューへ|タイトルへ/.test(x.textContent) && visible(x));
    if (back) back.click();
  };
  const act = (name) => {
    P.dev = 'pad';
    if (P.lockLeft() > 0) return;
    if (P.lockUntil && Date.now() < P.lockUntil) return; // 確認が出た直後は、受け付けない
    if (!P.on) {
      P.on = true; document.body.classList.add('pad-on');
      const had = P.cur && P.cur.isConnected && visible(P.cur) && inScope(P.cur); // すでに選択中のボタンがあれば、そこから動かす / 決定する
      if (!had) { setCur(pickDefault()); if (name !== 'a' && name !== 'b') return; }
    } // 最初の1回: カーソルを出す(方向キーはそれだけ。Aはそのまま決定する)
    if (P.cur && !(P.cur.isConnected && visible(P.cur) && inScope(P.cur))) { if (P.cur) P.cur.classList.remove('pf'); P.cur = null; P.desc = null; setCur(pickDefault()); }
    if (name === 'left' || name === 'right' || name === 'up' || name === 'down') {
      const cq = $('.callq');
      if (cq && visible(cq)) { // 鳴きの確認: ◀▶でボタンを切り替える。チーが複数のときは、▼で牌の選択に入り、◀▶で牌(組み合わせ)を切り替える
        const U = MJ.UI;
        if (P.tiles) {
          if (name === 'up') { P.tiles = false; cq.classList.remove('pick'); document.body.classList.remove('pick-tiles'); }
          else if (name === 'left' || name === 'right') U.setChi((U.chiIdx || 0) + (name === 'left' ? -1 : 1));
          return;
        }
        const bs = [...cq.querySelectorAll('.cq-btn')], i = bs.indexOf(P.cur);
        if (name === 'down') {
          if (P.cur && P.cur.dataset && P.cur.dataset.multi) { P.tiles = true; cq.classList.add('pick'); document.body.classList.add('pick-tiles'); }
          return;
        }
        if (name === 'up') return;
        const d = name === 'left' ? -1 : 1;
        const n = bs[Math.max(0, Math.min(bs.length - 1, (i < 0 ? 0 : i) + d))];
        if (n) setCur(n);
        return;
      }
    }
    if (name === 'left') move(-1, 0); else if (name === 'right') move(1, 0); else if (name === 'up') move(0, -1); else if (name === 'down') move(0, 1);
    else press(name);
  };

  /* キーボード / リモコン */
  const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'a', Escape: 'b', Backspace: 'b', GoBack: 'b', BrowserBack: 'b' }; // 再生/一時停止ボタンは使わない(押し間違い防止)
  G.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && /^(TEXTAREA)$/.test(t.tagName)) return;
    let n = KEYS[e.key];
    if (!n && (e.key === ' ' && P.on)) n = 'a';
    if (!n) return;
    if (!P.on && (n === 'a' || n === 'b') && /^(BUTTON|INPUT|SELECT|SUMMARY|A)$/.test((document.activeElement || {}).tagName || '')) return; // ボタンにフォーカスがあるときの Enter は、ブラウザに任せる
    e.preventDefault();
    act(n);
  }, true);
  /* マウスを動かしたら、選択中の表示も、マウスの下のボタンに移る(2か所が光らないように)。対象は、メニュー・勉強・ダイアログ・クイズのボタン */
  const HOVER_SEL = '.hm-btn, .sy-btn, .sy-nb, .sy-back, #overlay button, .dq-opt, #dq-ok, #dq-next';
  document.addEventListener('mouseover', (e) => {
    if (P.dev === 'pad' && P.on) return; // パッド操作中は、カーソルを動かさない
    const el = e.target.closest && e.target.closest(HOVER_SEL);
    if (!el || el.disabled || el === P.cur || !visible(el) || !inScope(el)) return;
    if (document.body.classList.contains('locked')) return;
    setCur(el);
  }, true);
  G.addEventListener('pointerdown', () => { P.dev = 'mouse'; if (P.on) { P.on = false; document.body.classList.remove('pad-on'); if (P.cur) P.cur.classList.remove('pf'); } }, true);

  /* ゲームパッドのボタンの割り当て。
     標準配置(Xbox型): 0=A(決定) 1=B(もどる) 12-15=十字。
     古いUSBコントローラー(スーファミ型など)は、「標準」でない並びで届く: 多くは 0=X 1=A(右) 2=B(下) 3=Y なので、A(右)=決定、B(下)=もどる にする。
     合わないときは、設定の「コントローラー」で、ボタンをおぼえさせられる */
  const PM = 'mj_padmap';
  const loadMap = () => { try { return JSON.parse(localStorage.getItem(PM) || '{}') || {}; } catch (e) { return {}; } };
  P.mapFor = (gp) => { const m = loadMap()[gp.id]; if (m && isFinite(m.a) && isFinite(m.b)) return { a: +m.a, b: +m.b, learned: true }; return gp.mapping === 'standard' ? { a: 0, b: 1, learned: false } : { a: 1, b: 2, learned: false }; };
  P.saveMap = (gp, k, idx) => { const all = loadMap(); const cur = Object.assign({}, P.mapFor(gp)); delete cur.learned; cur[k] = idx; all[gp.id] = cur; try { localStorage.setItem(PM, JSON.stringify(all)); } catch (e) { /* ignore */ } };
  P.resetMap = () => { try { localStorage.removeItem(PM); } catch (e) { /* ignore */ } };
  P.pads = () => [...((navigator.getGamepads && navigator.getGamepads()) || [])].filter((g) => g && g.connected);
  P.learn = null; // { k: 'a'|'b', cb } 割り当てを、おぼえさせている最中
  const held = {};
  let lastPoll = 0;
  const pollOnce = () => {
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    const now = performance.now();
    if (!document.hidden && lastPoll && now - lastPoll > 120 && MJ.perf) { MJ.perf.gaps.push({ at: Math.round(now / 100) / 10, gap: Math.round(now - lastPoll), ctx: MJ.perf.last }); if (MJ.perf.gaps.length > 30) MJ.perf.gaps.shift(); }
    lastPoll = now;
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const pressed = []; gp.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.6) pressed.push(i); });
      P.lastPressed = pressed.length ? { id: gp.id, idx: pressed } : P.lastPressed;
      if (P.learn) { // 割り当てのおぼえ中: 押していたボタンを離してから、次に押したボタンを、そのまま割り当てる(ふつうの操作はしない)
        if (!P.learn.ready) { if (!pressed.length) P.learn.ready = true; continue; }
        if (pressed.length) { const L = P.learn; P.learn = null; P.saveMap(gp, L.k, pressed[0]); P.settle = true; if (L.cb) L.cb(gp, pressed[0]); }
        continue;
      }
      if (P.settle) { if (!pressed.length) P.settle = false; continue; } // おぼえさせた直後: そのボタンを離すまでは、ふつうの操作として扱わない
      const pm = P.mapFor(gp);
      const MAP = { [pm.a]: 'a', [pm.b]: 'b' };
      if (gp.mapping === 'standard') Object.assign(MAP, { 12: 'up', 13: 'down', 14: 'left', 15: 'right' });
      const down = {};
      gp.buttons.forEach((b, i) => { if (MAP[i] && (b.pressed || b.value > 0.6)) down[MAP[i]] = true; });
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (gp.mapping !== 'standard' && gp.axes.length > 9 && isFinite(gp.axes[9]) && Math.abs(gp.axes[9]) < 1.2 && Math.abs(gp.axes[9]) > 0.05) { // 十字キーが、ハット(軸9)で届くコントローラー
        const h = gp.axes[9], q = [-1, -5 / 7, -3 / 7, -1 / 7, 1 / 7, 3 / 7, 5 / 7, 1].map((v) => Math.abs(h - v)); const k = q.indexOf(Math.min(...q));
        if (k === 0 || k === 1 || k === 7) down.up = true; if (k >= 1 && k <= 3) down.right = true; if (k >= 3 && k <= 5) down.down = true; if (k >= 5) down.left = true;
      }
      if (ax < -0.6) down.left = true; else if (ax > 0.6) down.right = true;
      if (ay < -0.6) down.up = true; else if (ay > 0.6) down.down = true;
      ['a', 'b', 'up', 'down', 'left', 'right'].forEach((n) => {
        const k = gp.index + n;
        if (down[n]) {
          const h = held[k];
          const dir = /^(left|right|up|down)$/.test(n);
          if (!h) { held[k] = { t: now, last: now }; act(n); }
          else if (dir && now - h.t > 380 && now - h.last > 120) { h.last = now; act(n); }
        } else delete held[k];
      });
    }
  };
  // 入力の読み取りは、画面を描くタイミングだけに頼らず、10ミリ秒ごとにも行う(画面の描画が遅れても、入力の取りこぼし・遅れを小さくする)
  const poll = () => { pollOnce(); G.requestAnimationFrame(poll); };
  if (navigator.getGamepads) { G.requestAnimationFrame(poll); setInterval(pollOnce, 10); }
  G.addEventListener('gamepadconnected', () => { if (MJ.UI && MJ.UI.toast) MJ.UI.toast('コントローラーを認識しました。十字キー=えらぶ / A=決定 / B=もどる'); });

  /* 画面が組み替わってカーソルが消えたら、近い場所に戻す */
  let tm = null;
  new MutationObserver(() => { if (!P.on) return; clearTimeout(tm); tm = setTimeout(P.refocus, 30); }).observe(document.body, { childList: true, subtree: true });

  /* Androidの戻るボタン(Capacitor) */
  P.back = () => act('b'); // Android / Fire TV の「戻る」(MainActivity から呼ばれる)
  document.addEventListener('backbutton', () => act('b'));
  G.addEventListener('load', () => {
    try { const A = G.Capacitor && G.Capacitor.Plugins && G.Capacitor.Plugins.App; if (A && A.addListener) A.addListener('backButton', () => act('b')); } catch (e) { /* ignore */ }
  });
})(typeof window !== 'undefined' ? window : globalThis);
