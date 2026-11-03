/* ネイティブ版の画面と操作(試作)。ゲームの頭脳(game.js)が呼ぶ「ui」を、SDL2の描画で作る。
   画面は 720x428。キー: left/right/up/down/ok/back */
(function () {
  const MJ = window.MJ; const W = 720, H = 428;
  const S = { mode: 'menu', game: null, dirty: true, bub: {}, banner: null, keep: 0, shotN: 0, shotR: 0, self: null, react: null, result: null, end: null, menuIdx: 0, ui: null };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const dirty = () => { S.dirty = true; };
  const WIND = ['東', '南', '西', '北'];
  try { MJ.loadRules && MJ.loadRules(); } catch (e) { /* ignore */ }

  /* ---------- 描く道具 ---------- */
  const fill = (x, y, w, h, c, a) => gfx.fill(x, y, w, h, c[0], c[1], c[2], a == null ? 255 : a);
  const frame = (x, y, w, h, c, t) => gfx.frame(x, y, w, h, c[0], c[1], c[2], t || 1);
  const text = (s, x, y, sz, c, al) => gfx.text(String(s), x, y, sz, c[0], c[1], c[2], al || 0);
  const WHITE = [255, 255, 255], BLACK = [20, 20, 20], YEL = [255, 220, 40], GREY = [170, 190, 175], RED = [235, 70, 60];
  function tile(t, x, y, w, h, red, dim) {
    fill(x + 1, y + 1, w, h, [0, 0, 0], 70);
    if (!gfx.image(MJ.tileSrc(t, red), x, y, w, h, dim ? 100 : 255)) { fill(x, y, w, h, [240, 240, 230]); text(MJ.tileName(t), x + w / 2, y + 2, 10, BLACK, 1); }
  }
  function back(x, y, w, h) { fill(x, y, w, h, [34, 78, 160]); frame(x, y, w, h, [200, 210, 235], 1); }
  function button(x, y, w, h, label, sel) {
    fill(x, y, w, h, sel ? YEL : WHITE); frame(x, y, w, h, sel ? [160, 110, 0] : [120, 120, 120], sel ? 3 : 1);
    text(label, x + w / 2, y + (h - 16) / 2 - 1, 15, BLACK, 1);
  }
  function face(p, x, y, w, h) {
    const ch = p.char; const src = p.isHuman ? ch.face : (MJ.faceSrc ? MJ.faceSrc(ch) : ch.face);
    if (!gfx.image(src, x, y, w, h)) fill(x, y, w, h, [90, 110, 100]);
  }
  const rel = (s) => s; // 自分は seat 0
  const posOf = { 0: 'bottom', 1: 'right', 2: 'top', 3: 'left' };

  /* ---------- 卓の描画 ---------- */
  function drawPlate(g, p, x, y, mini) {
    const fs = mini ? 26 : 44;
    face(p, x, y, fs, mini ? 28 : 48);
    const tx = mini ? x + 30 : x + 50;
    text(p.name, tx, y, 13, WHITE);
    text(p.score, tx, y + (mini ? 15 : 17), 16, p.score < 0 ? RED : YEL);
    const sw = g.seatWindOf(p);
    text((p.seat === g.dealer ? '親 ' : '') + WIND[sw], tx, y + (mini ? 34 : 37), 12, p.seat === g.dealer ? [255, 150, 120] : GREY);
    if (p.riichi) text('リーチ', tx, y + (mini ? 48 : 51), 12, RED);
  }
  function drawMelds(p, x, y, w, h, dir) {
    let cx = x, cy = y;
    for (const m of p.melds) {
      const n = m.tiles.length;
      for (let i = 0; i < n; i++) {
        const tl = m.tiles[i];
        if (m.kind === 'ankan' && (i === 0 || i === 3)) back(cx, cy, w, h); else tile(tl.t, cx, cy, w, h, tl.red);
        if (dir === 'row') cx += w + 1; else cy += h + 1;
      }
      if (dir === 'row') cx += 6; else cy += 5;
    }
  }
  function drawRiver(g, p, x, y) {
    const tw = 18, th = 24;
    p.discards.forEach((d, i) => {
      const cx = x + (i % 6) * (tw + 1), cy = y + Math.floor(i / 6) * (th + 1);
      tile(d.tile.t, cx, cy, tw, th, d.tile.red, d.called);
      if (d.riichi) frame(cx, cy, tw, th, RED, 2);
      if (g.lastDiscard && g.lastDiscard.d === d) frame(cx - 1, cy - 1, tw + 2, th + 2, YEL, 2);
    });
  }
  function drawTable(g) {
    gfx.clear(14, 84, 52);
    fill(150, 24, 420, 290, [10, 66, 40]);
    if (g.blank) return;
    const P = g.players;
    // 河
    drawRiver(g, P[2], 306, 30); drawRiver(g, P[0], 306, 212); drawRiver(g, P[3], 160, 134); drawRiver(g, P[1], 452, 134);
    // 伏せた手牌
    const nHand = (p) => p.hand.length;
    for (let i = 0; i < nHand(P[2]); i++) back(258 + i * 15, 4, 13, 19);
    for (let i = 0; i < nHand(P[3]); i++) back(130, 100 + i * 12, 20, 10);
    for (let i = 0; i < nHand(P[1]); i++) back(570, 100 + i * 12, 20, 10);
    // 名札・副露
    drawPlate(g, P[2], 470, 2, true); drawMelds(P[2], 470, 38, 14, 19, 'row');
    drawPlate(g, P[3], 4, 100, false); drawMelds(P[3], 4, 168, 14, 19, 'row');
    drawPlate(g, P[1], 604, 100, false); drawMelds(P[1], 604, 168, 14, 19, 'row');
    drawPlate(g, P[0], 566, 318, false);
    // 中央の情報
    fill(282, 134, 156, 72, [6, 44, 26]); frame(282, 134, 156, 72, [90, 140, 110], 1);
    text(g.kyokuLabel(), 360, 137, 16, WHITE, 1);
    for (let i = 0; i < 5; i++) { const x = 296 + i * 26, y = 158; if (g.doraInd[i]) tile(g.doraInd[i].t, x, y, 22, 29, g.doraInd[i].red); else back(x, y, 22, 29); }
    text('残り ' + g.live.length + '牌   供託 ' + g.kyotaku, 360, 190, 12, GREY, 1);
    // 自分の手牌
    drawHand(g);
    // 吹き出し
    const now = __now();
    for (const k of Object.keys(S.bub)) { const b = S.bub[k]; if (b.until < now) { delete S.bub[k]; continue; }
      const w = Math.min(380, gfx.measure(b.text, 14) + 20); const bx = 360 - w / 2, by = 244 + (k * 1 === 2 ? -150 : k * 1 === 1 || k * 1 === 3 ? -70 : 0);
      fill(bx, by, w, 28, WHITE); frame(bx, by, w, 28, [90, 90, 90], 1); text(b.text.slice(0, 26), 360, by + 5, 14, BLACK, 1); }
    // 演出
    if (S.banner) { fill(0, 160, W, 80, [0, 0, 0], 170); text(S.banner.text, 360, 168, 56, YEL, 1); }
  }
  function myTiles(p) { const hs = p.hand.filter((h) => h !== p.drawn); if (p.drawn) hs.push(p.drawn); return hs; }
  function allowed(s, h) { const p = s.p; if (p.riichi) return h === p.drawn; if (s.opts.forbid.includes(h.t)) return false; if (s.rm) return s.opts.riichi.includes(h.t); return true; }
  function drawHand(g) {
    const p = g.players[0]; const s = S.self; const hs = myTiles(p);
    const gapAt = p.drawn ? hs.length - 1 : -1;
    hs.forEach((h, i) => {
      const x = 8 + i * 38 + (i === gapAt ? 10 : 0); let y = 346;
      const sel = s && s.row === 0 && s.idx === i;
      const dim = s ? !allowed(s, h) : false;
      if (sel) y -= 10;
      tile(h.t, x, y, 36, 50, h.red, dim);
      if (sel) frame(x - 1, y - 1, 38, 52, YEL, 3);
    });
    drawMelds(p, 4, 404, 16, 22, 'row');
    if (s) {
      const bw = 92; let bx = 8;
      s.btns.forEach((b, i) => { button(bx, 312, bw, 28, b.label, s.row === 1 && s.idx === i); bx += bw + 8; });
      if (s.rm) text('リーチする牌をえらんで決定', 8 + s.btns.length * 100 + 4, 318, 13, YEL);
    }
    if (S.react) {
      const r = S.react; const ld = g.lastDiscard; const who = ld ? g.players[ld.by].name : '';
      if (ld) { tile(ld.tile.t, 8, 306, 22, 29, ld.tile.red); text(who + ' が ' + MJ.tileName(ld.tile.t), 36, 314, 14, WHITE); }
      let bx = 230; r.btns.forEach((b, i) => { button(bx, 312, b.w || 92, 28, b.label, r.idx === i); bx += (b.w || 92) + 8; });
      if (r.note) text(r.note, 8, 290, 13, YEL);
    }
    if (!s && !S.react) text('', 0, 0, 12, WHITE);
    else text(S.self && S.self.row === 0 ? '←→ えらぶ  決定 きる  ↑ ボタン' : '←→ えらぶ  決定 おす  ↓ 牌へ', 712, 408, 12, GREY, 2);
  }

  /* ---------- 画面: メニュー・結果・終了 ---------- */
  function drawMenu() {
    gfx.clear(14, 84, 52);
    gfx.image('img/title_art.webp', 0, 0, W, H, 150);
    fill(0, 0, W, H, [0, 0, 0], 90);
    text('操作シンプル', 360, 50, 28, WHITE, 1); text('本格麻雀', 360, 84, 56, YEL, 1);
    ['東風戦をはじめる', 'おわる'].forEach((l, i) => button(260, 220 + i * 52, 200, 40, l, S.menuIdx === i));
    text('↑↓ えらぶ   決定ボタンで すすむ', 360, 380, 14, WHITE, 1);
  }
  function overlay(a) { fill(0, 0, W, H, [0, 0, 0], a == null ? 200 : a); }
  function drawResult(r) {
    const g = S.game; gfx.clear(10, 50, 35);
    if (r.type === 'win') {
      let y = 8;
      r.wins.forEach((w) => {
        text(w.winner.name + '  ' + (w.tsumo ? 'ツモ' : 'ロン') + '   ' + (w.res.limit || ''), 12, y, 20, YEL); y += 28;
        const v = w.view; let x = 12;
        v.concealed.forEach((h) => { tile(h.t, x, y, 24, 33, h.red); x += 25; });
        x += 8; if (w.winTile) { tile(w.winTile.t, x, y, 24, 33, w.winTile.red); frame(x, y, 24, 33, YEL, 2); x += 33; }
        v.melds.forEach((m) => { m.tiles.forEach((h) => { tile(h.t, x, y, 20, 27, h.red); x += 21; }); x += 5; });
        y += 38;
        const ys = w.res.yaku; const col = ys.length > 6 ? 2 : 1;
        ys.forEach((yk, i) => { text(yk.n, 16 + Math.floor(i / 6) * 220, y + (i % 6) * 18, 15, WHITE); text((yk.h || yk.han || '') + (w.res.yakuman ? '' : '飜'), 190 + Math.floor(i / 6) * 220, y + (i % 6) * 18, 15, GREY, 2); });
        y += Math.min(6, ys.length) * 18 + 4;
        const pay = w.pay; const pts = pay.ron != null ? pay.ron + '点' : (pay.each != null ? pay.each + '点オール' : pay.fromOther + ' / ' + pay.fromDealer + '点');
        text((w.res.yakuman ? '役満' : w.res.han + '飜 ' + w.res.fu + '符') + '   ' + pts, 12, y, 18, YEL); y += 30;
      });
      scoreTable(r, 300);
    } else {
      text('流局', 360, 30, 40, YEL, 1);
      r.tenpai.forEach((t, i) => { const p = g.players[i]; text(p.name, 160, 100 + i * 28, 18, WHITE); text(t ? 'テンパイ' : 'ノーテン', 360, 100 + i * 28, 18, t ? YEL : GREY); });
      scoreTable(r, 230);
    }
    text('決定ボタンで つぎへ', 360, 404, 15, WHITE, 1);
  }
  function scoreTable(r, y0) {
    const g = S.game;
    g.players.forEach((p, i) => {
      const y = y0 + i * 24; text(p.name, 140, y, 17, WHITE); text(r.before[i], 400, y, 17, GREY, 2); text('→', 430, y, 17, GREY, 1);
      text(r.after[i], 520, y, 17, YEL, 2); const d = r.delta[i]; text((d > 0 ? '+' : '') + d, 610, y, 17, d > 0 ? [120, 230, 140] : d < 0 ? RED : GREY, 2);
    });
  }
  function drawEnd(f) {
    gfx.clear(14, 84, 52); text('対局しゅうりょう', 360, 20, 32, YEL, 1);
    f.results.forEach((o, i) => {
      const y = 90 + i * 66; fill(120, y, 480, 58, o.p.isHuman ? [255, 240, 150] : [255, 255, 255], 235);
      text(o.rank + '位', 130, y + 14, 28, BLACK); face(o.p, 210, y + 4, 46, 50); text(o.p.name, 270, y + 18, 22, BLACK); text(o.p.score, 590, y + 16, 26, BLACK, 2);
    });
    text('決定ボタンで タイトルへ', 360, 380, 16, WHITE, 1);
  }

  /* ---------- 入力 ---------- */
  const wrap = (i, n) => (i + n) % n;
  window.__key = function (k) {
    S.dirty = true;
    NSND.sfx(k === 'ok' ? 'click' : k === 'back' ? 'click' : 'select', 0.5);
    if (S.mode === 'menu') {
      if (k === 'up' || k === 'down') S.menuIdx = 1 - S.menuIdx;
      else if (k === 'ok') { if (S.menuIdx === 1) __quit(); else startGame(); }
      return;
    }
    if (S.result) { if (k === 'ok') { const r = S.result; S.result = null; r.done(); } return; }
    if (S.end) { if (k === 'ok') { const r = S.end; S.end = null; r.done(); } return; }
    const s = S.self, r = S.react;
    if (s) {
      const tiles = s.tiles;
      if (k === 'left' || k === 'right') {
        const n = s.row === 0 ? tiles.length : s.btns.length; if (!n) return; s.idx = wrap(s.idx + (k === 'left' ? -1 : 1), n);
      } else if (k === 'up' && s.row === 0 && s.btns.length) { s.row = 1; s.idx = 0; }
      else if (k === 'down' && s.row === 1) { s.row = 0; s.idx = tiles.length - 1; }
      else if (k === 'back' && s.rm) { s.rm = false; }
      else if (k === 'ok') {
        if (s.row === 0) { const h = tiles[s.idx]; if (allowed(s, h)) { S.self = null; s.res({ act: s.rm ? 'riichi' : 'discard', tile: h }); } }
        else {
          const b = s.btns[s.idx];
          if (b.act === 'riichi') { s.rm = !s.rm; s.row = 0; const okI = tiles.findIndex((h) => allowed(s, h)); if (s.rm) { const d = tiles.indexOf(s.p.drawn); s.idx = d >= 0 && allowed(s, tiles[d]) ? d : Math.max(0, okI); } else s.idx = tiles.length - 1; }
          else { S.self = null; s.res(b.act === 'tsumo' ? { act: 'tsumo' } : { act: b.act, t: b.t }); }
        }
      }
    } else if (r) {
      if (k === 'left' || k === 'right') r.idx = wrap(r.idx + (k === 'left' ? -1 : 1), r.btns.length);
      else if (k === 'ok') { S.react = null; r.res(r.btns[r.idx].d); }
    }
  };

  /* ---------- ゲームの頭脳から呼ばれる「ui」 ---------- */
  const ui = {
    render(g) { S.game = g; dirty(); },
    sfx(name) { NSND.sfx(name); },
    speak(g, p, t) { S.bub[p.seat] = { text: p.name + '「' + t + '」', until: __now() + 1900 }; dirty(); setTimeout(dirty, 2000); },
    banner(g, p, t) { S.banner = { text: t }; dirty(); if (!g.fast) { NSND.call(p, t); NSND.sfx({ 'リーチ': 'riichi', 'ポン': 'call', 'チー': 'call', 'カン': 'kan', 'ロン': 'ron', 'ツモ': 'tsumo' }[t]); } return sleep(g.fast ? 0 : 750).then(() => { S.banner = null; dirty(); }); },
    handStart(g) { S.game = g; NSND.game(g); NSND.sfx('slam'); NSND.readKyoku(g); S.banner = { text: g.kyokuLabel() }; dirty(); return sleep(900).then(() => { S.banner = null; dirty(); }); },
    padHand() {},
    askSelf(g, p, opts) {
      return new Promise((res) => {
        const tiles = myTiles(p); const btns = [];
        if (opts.tsumo) btns.push({ label: 'ツモ', act: 'tsumo' });
        if (opts.riichi.length && !p.riichi) btns.push({ label: 'リーチ', act: 'riichi' });
        opts.ankan.forEach((t) => btns.push({ label: 'カン ' + MJ.tileName(t), act: 'ankan', t }));
        opts.kakan.forEach((t) => btns.push({ label: '加カン ' + MJ.tileName(t), act: 'kakan', t }));
        S.self = { p, opts, res, tiles, btns, rm: false, row: opts.tsumo ? 1 : 0, idx: opts.tsumo ? 0 : tiles.length - 1 };
        dirty();
      });
    },
    askReact(g, q, o) {
      return new Promise((res) => {
        const btns = [];
        if (o.ron) btns.push({ label: 'ロン', d: { act: 'ron' } });
        if (o.kan) btns.push({ label: 'カン', d: { act: 'kan' } });
        if (o.pon) btns.push({ label: 'ポン', d: { act: 'pon' } });
        o.chi.forEach((c) => btns.push({ label: 'チー ' + c.use.map((t) => MJ.tileName(t)).join(''), w: 130, d: { act: 'chi', use: c.use } }));
        btns.push({ label: 'パス', d: { act: 'pass' } });
        S.react = { res, btns, idx: o.ron ? 0 : btns.length - 1, note: o.ronBlock ? 'フリテンです(ロンできません)' : '' };
        dirty();
      });
    },
    showResult(g, r) {
      S.bub = {}; S.banner = null;
      NSND.result(r.type === 'draw' ? 'draw' : r.wins.some((w) => w.winner.isHuman) ? 'win' : r.delta[0] < 0 ? 'lose' : 'calm');
      if (r.type === 'win') NSND.readWin(g, r); else NSND.sfx('drawgame');
      return new Promise((done) => { S.result = Object.assign({ done }, r, { done: () => { NSND.stopSpeak(); done(); } }); dirty(); });
    },
    gameEnd(g, f) { NSND.sfx('end'); return new Promise((done) => { S.end = Object.assign({ done }, f); dirty(); }); },
  };

  function pickChars() {
    const pool = MJ.CHARS.filter((c) => c.id !== 0); const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  }
  async function startGame() {
    S.mode = 'game'; dirty();
    const g = new MJ.Game({ chars: pickChars(), length: 'east', ui, cpuDelay: __auto ? 40 : undefined });
    S.game = g;
    try { await g.run(); } catch (e) { print('GAME ERR ' + (e && e.stack || e)); }
    S.game = null; S.mode = 'menu'; NSND.home(); S.self = S.react = S.result = S.end = null; dirty();
    if (__auto) __quit();
  }

  /* ---------- メインループから ---------- */
  let nextAuto = 0, lastSave = 0;
  window.__frame = function (now) {
    __runTimers(now);
    if (__auto && now > nextAuto) { nextAuto = now + 90; window.__key('ok'); }
    if (__lsDirty && now - lastSave > 1500) { lastSave = now; __lsDirty = false; try { __save(JSON.stringify(__ls)); } catch (e) { /* ignore */ } }
    /* 画面の入れかえ(ダブル/トリプルバッファ)で、古い絵が交互に出て点滅しないよう、変化のあとは3回続けて描く */
    if (!S.dirty) return false;
    S.dirty = false; return true;
  };
  window.__draw = function () {
    if (S.mode === 'menu') drawMenu();
    else if (S.game) drawTable(S.game);
    if (S.result) { drawResult(S.result); if (__auto && globalThis.__shotDir) gfx.shot(__shotDir + '/res' + (++S.shotN) + '.bmp'); }
    if (__auto && globalThis.__shotDir && (S.react || (S.self && S.self.btns.length)) && S.shotR < 6) { gfx.shot(__shotDir + '/act' + (++S.shotR) + '.bmp'); }
    if (S.end) { drawEnd(S.end); if (__auto && globalThis.__shotDir) gfx.shot(__shotDir + '/end.bmp'); }
    return true;
  };
  NSND.home();
  print('ネイティブ版 準備できました');
})();
