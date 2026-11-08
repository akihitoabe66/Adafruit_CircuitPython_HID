/* ネイティブ版の画面と操作(試作)。ゲームの頭脳(game.js)が呼ぶ「ui」を、SDL2の描画で作る。
   画面は 720x428。キー: left/right/up/down/ok/back */
(function () {
  const MJ = window.MJ; const W = 720, H = 428;
  const S = { mode: 'menu', game: null, dirty: true, bub: {}, banner: null, keep: 0, fly: null, deal: null, pick: null, lastD: null, saveP: null, menuP: null, slots: [], hid: [], shotN: 0, shotR: 0, self: null, react: null, result: null, end: null, menuIdx: 0, ui: null };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const dirty = () => { S.dirty = true; };
  const WIND = ['東', '南', '西', '北'];
  try { MJ.loadRules && MJ.loadRules(); } catch (e) { /* ignore */ }
  MJ.MEMO_CAP = 30000; // 計算の記憶表の上限(メモリを食いすぎないように)
  MJ.AI_BUDGET = 0.4; // Pi Zeroでは、CPUの思考の時間上限を縮める(考えている間、画面と入力が止まるため)
  if (globalThis.__cpuEnv && MJ.CPU_SPEEDS.includes(globalThis.__cpuEnv)) MJ.setCpuSpeed(globalThis.__cpuEnv); // 例: MJ_CPU=fast ./mj .


  /* ---------- セーブ(手動・最新から5件) ---------- */
  const NSLOT = 5;
  function slotRead() { // 読める(壊れていない)ものだけ、新しい順に
    const out = [];
    try { __slotlist().forEach((q) => { try { const t = __slotload(q); const v = t && JSON.parse(t); if (v && v.snap && v.snap.scores && v.snap.chars) out.push({ seq: q, v }); } catch (e) { /* 壊れたものは、とばす */ } }); } catch (e) { /* ignore */ }
    return out;
  }
  function slotWrite(snap) {
    let seq = 1; try { const l = __slotlist(); if (l.length) seq = l[0] + 1; } catch (e) { /* ignore */ }
    const ok = __slotsave(seq, JSON.stringify({ seq, snap }));
    try { __slotlist().slice(NSLOT).forEach((q) => __slotdel(q)); } catch (e) { /* ignore */ }
    return ok;
  }
  const kyokuText = (sn) => ['東', '南', '西', '北'][Math.min(3, Math.floor(sn.kyoku / 4))] + ['一', '二', '三', '四'][sn.kyoku % 4] + '局' + (sn.honba ? ' ' + sn.honba + '本場' : '');
  const speedLabel = () => 'CPUの速さ: ' + MJ.CPU_SPEED_JP[MJ.cpuSpeed()];
  const titleItems = () => (slotRead().length ? ['つづきから', '東風戦をはじめる', speedLabel(), 'おわる'] : ['東風戦をはじめる', speedLabel(), 'おわる']);
  const HIDDEN = ['up', 'up', 'down', 'down', 'left', 'right']; // 隠しコマンド(タイトル): 5件のセーブから選べる

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
    face(p, x, y, fs, fs);
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
      if (S.fly && S.fly.d === d && __now() < S.fly.t0 + S.fly.dur) return; // 飛んでいる間は、河には描かない
      const cx = x + (i % 6) * (tw + 1), cy = y + Math.floor(i / 6) * (th + 1);
      tile(d.tile.t, cx, cy, tw, th, d.tile.red, d.called);
      if (d.riichi) frame(cx, cy, tw, th, RED, 2);
      if (g.lastDiscard && g.lastDiscard.d === d) frame(cx - 1, cy - 1, tw + 2, th + 2, YEL, 2);
    });
  }
  /* ---------- 軽い動き(牌が河へ飛ぶ・配牌・札の拡大) ---------- */
  const RIVER = { 2: [306, 30], 0: [306, 212], 3: [160, 134], 1: [452, 134] };
  const HANDSRC = { 2: [330, 6], 3: [132, 150], 1: [572, 150] };
  function startFly(g, ld) {
    if (g.fast || ld.by == null) return;
    const p = g.players[ld.by], i = p.discards.indexOf(ld.d); if (i < 0) return;
    const to = [RIVER[ld.by][0] + (i % 6) * 19, RIVER[ld.by][1] + Math.floor(i / 6) * 25];
    const from = ld.by === 0 && S.pick ? S.pick : (HANDSRC[ld.by] || [360, 300]);
    S.fly = { d: ld.d, t: ld.tile.t, red: ld.tile.red, from, to, t0: __now(), dur: ld.by === 0 ? 220 : 160 }; S.pick = null;
  }
  function drawFly() {
    const f = S.fly; if (!f) return; const k = (__now() - f.t0) / f.dur; if (k >= 1) { S.fly = null; dirty(); return; }
    const e = 1 - Math.pow(1 - k, 3), x = f.from[0] + (f.to[0] - f.from[0]) * e, y = f.from[1] + (f.to[1] - f.from[1]) * e - 26 * Math.sin(Math.PI * e);
    const w = 36 + (18 - 36) * e, h = 50 + (24 - 50) * e; tile(f.t, Math.round(x), Math.round(y), Math.round(w), Math.round(h), f.red);
  }
  const dealF = () => { const d = S.deal; if (!d) return 1; const k = (__now() - d.t0) / d.dur; if (k >= 1) { S.deal = null; return 1; } return Math.max(0, k); };
  function drawTable(g) {
    gfx.clear(14, 84, 52);
    fill(150, 24, 420, 290, [10, 66, 40]);
    if (g.blank) return;
    const P = g.players;
    // 河
    drawRiver(g, P[2], 306, 30); drawRiver(g, P[0], 306, 212); drawRiver(g, P[3], 160, 134); drawRiver(g, P[1], 452, 134);
    // 伏せた手牌
    const DF = dealF(); const nHand = (p) => Math.ceil(p.hand.length * DF);
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
    drawFly();
    // 演出: 札の文字が、少し大きいところから縮んで止まる
    if (S.banner) { const k = Math.min(1, (__now() - (S.banner.t0 || 0)) / 180), sz = Math.round(56 * (1 + 0.45 * (1 - k))); fill(0, 160, W, 80, [0, 0, 0], 170); text(S.banner.text, 360, 200 - Math.round(sz * 0.55), sz, YEL, 1); }
  }
  function myTiles(p) { const hs = p.hand.filter((h) => h !== p.drawn); if (p.drawn) hs.push(p.drawn); return hs; }
  function allowed(s, h) { const p = s.p; if (p.riichi) return h === p.drawn; if (s.opts.forbid.includes(h.t)) return false; if (s.rm) return s.opts.riichi.includes(h.t); return true; }
  function drawHand(g) {
    const p = g.players[0]; const s = S.self; const hs = myTiles(p);
    const gapAt = p.drawn ? hs.length - 1 : -1; const DF = dealF(), shown = Math.ceil(hs.length * DF);
    hs.forEach((h, i) => {
      if (i >= shown) return;
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
    gfx.image('img/title_art.webp', 0, 0, W, H, 255); // タイトルの文字は、絵に入っている
    titleItems().forEach((l, i) => button(235, 268 + i * 38, 250, 32, l, S.menuIdx === i));
    
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


  function drawDialog(title, items, idx, note) {
    overlay(190); const h = 70 + items.length * 50; const y0 = Math.round((H - h) / 2);
    fill(150, y0, 420, h, [20, 60, 42]); frame(150, y0, 420, h, [240, 210, 120], 3);
    text(title, 360, y0 + 12, 22, YEL, 1);
    items.forEach((l, i) => button(190, y0 + 48 + i * 50, 340, 40, l, idx === i));
    if (note) text(note, 360, y0 + h + 6, 14, WHITE, 1);
  }
  function drawSlots() {
    gfx.clear(14, 84, 52); text('セーブデータをえらぶ', 360, 18, 28, YEL, 1);
    if (!S.slots.length) text('セーブデータがありません', 360, 180, 20, WHITE, 1);
    S.slots.forEach((q, i) => { const sn = q.v.snap, y = 62 + i * 56; fill(80, y, 560, 48, S.slotIdx === i ? YEL : WHITE, 235); frame(80, y, 560, 48, [120, 120, 120], 1);
      text((i === 0 ? '最新  ' : (i + 1) + '番目  ') + kyokuText(sn), 94, y + 6, 18, BLACK); text('持ち点 ' + sn.scores.join(' / '), 94, y + 27, 14, [60, 60, 60]); });
    text('↑↓ えらぶ   決定 ロード   もどる でタイトルへ', 360, 400, 14, WHITE, 1);
  }

  /* ---------- 入力 ---------- */
  const wrap = (i, n) => (i + n) % n;
  window.__key = function (k) {
    S.dirty = true;
    NSND.sfx(k === 'ok' ? 'click' : k === 'back' ? 'click' : 'select', 0.5);
    if (k === 'menu' && !S.menuP) { S.menuP = { idx: 0 }; return; } // スタート+セレクト長押し
    if (S.menuP) {
      const items = menuItems();
      if (k === 'up' || k === 'down') S.menuP.idx = wrap(S.menuP.idx + (k === 'up' ? -1 : 1), items.length);
      else if (k === 'back') S.menuP = null;
      else if (k === 'ok') { const it = items[S.menuP.idx]; if (it.indexOf('CPUの速さ') === 0) { MJ.cycleCpuSpeed(); return; } S.menuP = null; if (it === 'おわる(電源を切れます)') __quit(); else if (it === 'タイトルにもどる') stopGame(); }
      return;
    }
    if (S.saveP) {
      if (k === 'up' || k === 'down' || k === 'left' || k === 'right') S.saveP.idx = 1 - S.saveP.idx;
      else if (k === 'ok') { const p = S.saveP; S.saveP = null; if (p.idx === 0) { const ok = slotWrite(p.snap); S.toast = { text: ok ? 'セーブしました' : 'セーブできませんでした', until: __now() + 1400 }; setTimeout(dirty, 1500); } p.res(); }
      return;
    }
    if (S.mode === 'slots') {
      if (k === 'up' || k === 'down') { if (S.slots.length) S.slotIdx = wrap(S.slotIdx + (k === 'up' ? -1 : 1), S.slots.length); }
      else if (k === 'back') { S.mode = 'menu'; S.slots = []; S.menuIdx = 0; }
      else if (k === 'ok' && S.slots.length) { const q = S.slots[S.slotIdx]; S.slots = []; startGame(q.v.snap); } // ロードしたら、この一覧は、また見えなくなる
      return;
    }
    if (S.mode === 'menu') {
      const items = titleItems();
      S.hid.push(k); if (S.hid.length > HIDDEN.length) S.hid.shift();
      if (S.hid.join() === HIDDEN.join()) { S.hid = []; S.slots = slotRead(); S.slotIdx = 0; S.mode = 'slots'; return; }
      if (k === 'up' || k === 'down') S.menuIdx = wrap(S.menuIdx + (k === 'up' ? -1 : 1), items.length);
      else if (k === 'ok') { const it = items[S.menuIdx]; if (it.indexOf('CPUの速さ') === 0) MJ.cycleCpuSpeed(); else if (it === 'おわる') __quit(); else if (it === 'つづきから') { const l = slotRead(); startGame(l.length ? l[0].v.snap : null); } else startGame(); }
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
        if (s.row === 0) { const h = tiles[s.idx]; if (allowed(s, h)) { const gp = s.p.drawn ? tiles.length - 1 : -1; S.pick = [8 + s.idx * 38 + (s.idx === gp ? 10 : 0), 336]; S.self = null; s.res({ act: s.rm ? 'riichi' : 'discard', tile: h }); } }
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
    render(g) { S.game = g; const ld = g.lastDiscard; if (!ld) S.lastD = null; else if (ld.d !== S.lastD) { S.lastD = ld.d; try { startFly(g, ld); } catch (e) { S.fly = null; } } dirty(); },
    sfx(name) { NSND.sfx(name); },
    speak(g, p, t) { S.bub[p.seat] = { text: p.name + '「' + t + '」', until: __now() + 1900 }; dirty(); setTimeout(dirty, 2000); },
    banner(g, p, t) { S.banner = { text: t, t0: __now() }; dirty(); if (!g.fast) { NSND.call(p, t); NSND.sfx({ 'リーチ': 'riichi', 'ポン': 'call', 'チー': 'call', 'カン': 'kan', 'ロン': 'ron', 'ツモ': 'tsumo' }[t]); } return sleep(g.fast ? 0 : 750).then(() => { S.banner = null; dirty(); }); },
    handStart(g) { S.game = g; NSND.game(g); NSND.sfx('slam'); NSND.readKyoku(g); S.banner = { text: g.kyokuLabel(), t0: __now() }; S.deal = g.fast ? null : { t0: __now() + 300, dur: 700 }; dirty(); return sleep(900).then(() => { S.banner = null; dirty(); }); },
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
    askSave(g) { return new Promise((res) => { S.saveP = { idx: 0, res, snap: g.snapshot() }; dirty(); }); },
    gameEnd(g, f) { NSND.sfx('end'); return new Promise((done) => { S.end = Object.assign({ done }, f); dirty(); }); },
  };

  function pickChars() {
    const pool = MJ.CHARS.filter((c) => c.id !== 0); const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  }
  function stopGame() { // ゲームを途中でやめて、タイトルへ
    const g = S.game; if (!g) { S.mode = 'menu'; dirty(); return; }
    g.stopped = true;
    const s = S.self, r = S.react, rs = S.result, en = S.end, sp = S.saveP;
    S.self = S.react = S.result = S.end = S.saveP = null;
    if (s) s.res({ act: 'discard', tile: s.p.hand[0] }); if (r) r.res({ act: 'pass' }); if (rs) rs.done(); if (en) en.done(); if (sp) sp.res();
    dirty();
  }
  async function startGame(sn) {
    S.mode = 'game'; dirty();
    const chars = sn && sn.chars ? sn.chars.map((id) => MJ.CHARS.find((c) => c.id === id)).filter(Boolean) : [];
    const g = new MJ.Game({ chars: chars.length === 3 ? chars : pickChars(), length: sn && sn.length || 'east', ui, cpuDelay: __auto ? 40 : undefined });
    if (sn && chars.length === 3) { ['dealer', 'kyoku', 'honba', 'kyotaku', 'roundWind', 'handCount'].forEach((k) => { if (sn[k] != null) g[k] = sn[k]; }); sn.scores.forEach((sc, i) => { if (g.players[i]) g.players[i].score = sc; }); g.resumed = true; }
    S.game = g;
    try { await g.run(); } catch (e) { print('GAME ERR ' + (e && e.stack || e)); }
    S.game = null; S.mode = 'menu'; S.menuIdx = 0; NSND.home(); S.self = S.react = S.result = S.end = S.saveP = null; dirty();
    if (__auto) __quit();
  }
  const menuItems = () => ['つづける', speedLabel(), 'タイトルにもどる', 'おわる(電源を切れます)'];

  /* ---------- メインループから ---------- */
  let nextAuto = 0, lastSave = 0;
  window.__frame = function (now) {
    __runTimers(now);
    if (__auto && now > nextAuto) { nextAuto = now + 90; window.__key('ok'); }
    if (__lsDirty && now - lastSave > 1500) { lastSave = now; __lsDirty = false; try { __save(JSON.stringify(__ls)); } catch (e) { /* ignore */ } }
    /* 画面の入れかえ(ダブル/トリプルバッファ)で、古い絵が交互に出て点滅しないよう、変化のあとは3回続けて描く */
    if (S.fly || S.deal || (S.banner && now - (S.banner.t0 || 0) < 260)) S.dirty = true; // 動いている間は、描き続ける
    if (!S.dirty) return false;
    S.dirty = false; return true;
  };
  window.__draw = function () {
    if (S.mode === 'menu') drawMenu(); else if (S.mode === 'slots') drawSlots();
    else if (S.game) drawTable(S.game);
    if (S.result) { drawResult(S.result); if (__auto && globalThis.__shotDir) gfx.shot(__shotDir + '/res' + (++S.shotN) + '.bmp'); }
    if (__auto && globalThis.__shotDir && (S.react || (S.self && S.self.btns.length)) && S.shotR < 6) { gfx.shot(__shotDir + '/act' + (++S.shotR) + '.bmp'); }
    if (S.end) { drawEnd(S.end); if (__auto && globalThis.__shotDir) gfx.shot(__shotDir + '/end.bmp'); }
    if (S.saveP) drawDialog('この局が おわりました', ['セーブして次の局へ', 'セーブしないで次の局へ'], S.saveP.idx, S.saveP.snap ? kyokuText(S.saveP.snap) + ' の つづきから' : '');
    if (S.toast && S.toast.until > __now()) { fill(200, 190, 320, 44, [0, 0, 0], 200); text(S.toast.text, 360, 198, 24, YEL, 1); }
    if (S.menuP) drawDialog('メニュー', menuItems(), S.menuP.idx, '');
    return true;
  };
  NSND.home();
  print('ネイティブ版 準備できました');
})();
