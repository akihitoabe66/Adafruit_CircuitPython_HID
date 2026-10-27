/* コントローラー・リモコン・キーボード操作(Fire TV / Bluetoothパッド / Steam想定)
   使うのは、十字キー(カーソル移動)と A(決定)と B(戻る・パス)だけ。リーチ・ポン・解説なども、枠を動かして A で押す
   最初にボタンを押すと「パッド操作」になり、カーソル(白い枠)が出る。マウスやタッチを使うと枠は消える */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const $ = (s, r = document) => r.querySelector(s);
  const FOCUSABLE = 'button, [data-act], .hand .tile[data-id], .pm-arrow, #dq-hand .hand .tile.ok[data-i], summary, input, select, a[href], .mode-card, [data-mode], .char, [data-pj], [data-pg], [data-readfrom], [data-dtab], [data-open-gloss], [data-open-credits], .gl, [tabindex]';
  const P = (MJ.Pad = { on: false, cur: null, desc: null });

  const rectOf = (el) => el.getBoundingClientRect();
  const visible = (el) => {
    if (!el.isConnected) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.disabled) return false;
    const r = rectOf(el);
    if (r.width < 4 || r.height < 4) return false;
    // スクロールする画面(メニュー・選択・ノート・ダイアログなど)は、画面の外にある項目も選べる(選ぶと自動でスクロールする)
    { const d = el.closest('details'); if (d && !d.open && !el.matches('summary')) return false; } // 閉じた設定の中は選べない
    if (el.closest('#screen-menu, #screen-select, #screen-notes, #overlay, #gloss-panel, #screen-title')) return true;
    return r.right > 0 && r.bottom > 0 && r.left < G.innerWidth && r.top < G.innerHeight;
  };
  /* いま操作できる範囲: 説明パネル > ダイアログ > ゲーム/各画面 */
  const scope = () => {
    const gl = ['#gloss-panel.on', '#gloss-sheet.on', '#gloss-panel:not(.hidden)'].map((s) => $(s)).find(Boolean);
    if (gl) return [gl];
    const ov = $('#overlay');
    if (ov && !ov.classList.contains('hidden')) return [ov];
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
  const setCur = (el) => {
    if (P.cur) P.cur.classList.remove('pf');
    P.cur = el || null;
    P.desc = descOf(el);
    if (el) {
      el.classList.add('pf');
      try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* ignore */ }
      if (el.matches('.hand .tile[data-id]') && MJ.UI && MJ.UI.showInfo) { try { MJ.UI.showInfo(+el.dataset.id); } catch (e) { /* ignore */ } }
    }
  };
  /* 最初に選ぶ場所(自分の番ならおすすめの牌、鳴けるなら最初の鳴きボタン) */
  const pickDefault = () => {
    const U = MJ.UI;
    if (U && U.game && !$('#screen-game').classList.contains('hidden') && $('#overlay').classList.contains('hidden')) {
      const cq = $('.cq-btn[data-act]:not(.b-pass)') || $('.cq-btn[data-act]');
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
    const pref = all.find((e) => e.matches('#cfm-go, #pm-done, #pm-next, .btn.pri, .btn.start, [data-mode]')) || all[0];
    return pref || null;
  };
  P.refocus = () => {
    if (!P.on) return;
    if (P.cur && P.cur.isConnected && visible(P.cur) && inScope(P.cur)) { P.cur.classList.add('pf'); return; }
    if (P.cur) { P.cur.classList.remove('pf'); P.cur = null; }
    let el = P.desc ? $(P.desc) : null;
    if (!(el && visible(el))) el = pickDefault();
    setCur(el);
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
    let best = null, bs = Infinity;
    items().forEach((el) => {
      if (el === cur || el.contains(cur) || cur.contains(el)) return;
      const r = rectOf(el), bx = r.left + r.width / 2, by = r.top + r.height / 2;
      const along = dx ? (bx - ax) * dx : (by - ay) * dy;
      const side = dx ? Math.abs(by - ay) : Math.abs(bx - ax);
      if (along <= 2) return;
      const s = along + side * 2.2;
      if (s < bs) { bs = s; best = el; }
    });
    if (best) setCur(best);
  };
  const press = (name) => {
    const U = MJ.UI;
    const click = (sel) => { const e = $(sel); if (e && !e.disabled && visible(e)) { e.click(); return true; } return false; };
    switch (name) {
      case 'a': if (P.cur && P.cur.isConnected) { P.cur.click(); setTimeout(() => { if (P.on && !(P.cur && visible(P.cur))) { P.cur = null; P.refocus(); } }, 150); } else setCur(pickDefault()); break;
      case 'b': {
        const ov = $('#overlay');
        if (ov && !ov.classList.contains('hidden')) {
          const btns = [...ov.querySelectorAll('button')].filter((b) => visible(b));
          const hit = btns.find((b) => /閉じる|キャンセル|やめる|戻る|OK|とじる|スキップ/.test(b.textContent)) || btns.find((b) => b.id === 'pm-prev' && b.style.visibility !== 'hidden');
          if (hit) { hit.click(); setTimeout(() => { if (P.on && !(P.cur && visible(P.cur))) { P.cur = null; P.refocus(); } }, 150); }
          return;
        }
        if (!$('#sd-tools').classList.contains('hidden')) { $('#sd-tools').classList.add('hidden'); return; }
        if (document.body.classList.contains('coach-open')) { document.body.classList.remove('coach-open'); return; }
        if (!$('#screen-game').classList.contains('hidden') && U && U.sel) {
          if (U.sel.type === 'react') { click('[data-act=pass]'); return; }
          if (U.riichiMode) { click('[data-act=riichi]'); return; }
          if (U.picked != null) { U.picked = null; U.render(U.game); return; }
        }
        // それ以外の画面では「戻る」「メニューへ」などを探す
        const back = [...document.querySelectorAll('.screen:not(.hidden) button')].find((b) => /戻る|もどる|メニューへ|タイトルへ/.test(b.textContent) && visible(b));
        if (back) back.click();
        break;
      }
      default: break;
    }
  };
  const act = (name) => {
    if (!P.on) { P.on = true; document.body.classList.add('pad-on'); setCur(pickDefault()); return; } // 最初の1回はカーソルを出すだけ
    if (P.cur && !(P.cur.isConnected && visible(P.cur) && inScope(P.cur))) { if (P.cur) P.cur.classList.remove('pf'); P.cur = null; P.desc = null; setCur(pickDefault()); }
    if (name === 'left') move(-1, 0); else if (name === 'right') move(1, 0); else if (name === 'up') move(0, -1); else if (name === 'down') move(0, 1);
    else press(name);
  };

  /* キーボード / リモコン */
  const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'a', Escape: 'b', Backspace: 'b', GoBack: 'b', BrowserBack: 'b', MediaPlayPause: 'a' };
  G.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && /^(TEXTAREA)$/.test(t.tagName)) return;
    let n = KEYS[e.key];
    if (!n && (e.key === ' ' && P.on)) n = 'a';
    if (!n) return;
    if (!P.on && (n === 'a' || n === 'b')) return; // マウス操作中の Enter などは普通に動かす
    e.preventDefault();
    act(n);
  }, true);
  G.addEventListener('pointerdown', () => { if (P.on) { P.on = false; document.body.classList.remove('pad-on'); if (P.cur) P.cur.classList.remove('pf'); } }, true);

  /* ゲームパッド(標準配置: 0=A 1=B 2=X 3=Y 4=LB 5=RB 8=Select 9=Start 12-15=十字) */
  const MAP = { 0: 'a', 1: 'b', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
  const held = {};
  const poll = () => {
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    const now = performance.now();
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const down = {};
      gp.buttons.forEach((b, i) => { if (MAP[i] && (b.pressed || b.value > 0.6)) down[MAP[i]] = true; });
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (ax < -0.6) down.left = true; else if (ax > 0.6) down.right = true;
      if (ay < -0.6) down.up = true; else if (ay > 0.6) down.down = true;
      Object.keys(MAP).map((k) => MAP[k]).forEach((n) => {
        const k = gp.index + n;
        if (down[n]) {
          const h = held[k];
          const dir = /^(left|right|up|down)$/.test(n);
          if (!h) { held[k] = { t: now, last: now }; act(n); }
          else if (dir && now - h.t > 380 && now - h.last > 120) { h.last = now; act(n); }
        } else delete held[k];
      });
    }
    G.requestAnimationFrame(poll);
  };
  if (navigator.getGamepads) G.requestAnimationFrame(poll);
  G.addEventListener('gamepadconnected', () => { if (MJ.UI && MJ.UI.toast) MJ.UI.toast('コントローラーを認識しました。十字キー=移動 / A=決定 / B=戻る・パス'); });

  /* 画面が組み替わってカーソルが消えたら、近い場所に戻す */
  let tm = null;
  new MutationObserver(() => { if (!P.on) return; clearTimeout(tm); tm = setTimeout(P.refocus, 30); }).observe(document.body, { childList: true, subtree: true });

  /* Androidの戻るボタン(Capacitor) */
  document.addEventListener('backbutton', () => act('b'));
  G.addEventListener('load', () => {
    try { const A = G.Capacitor && G.Capacitor.Plugins && G.Capacitor.Plugins.App; if (A && A.addListener) A.addListener('backButton', () => act('b')); } catch (e) { /* ignore */ }
  });
})(typeof window !== 'undefined' ? window : globalThis);
