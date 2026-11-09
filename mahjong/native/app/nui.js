/* ネイティブ版の画面と操作(試作)。ゲームの頭脳(game.js)が呼ぶ「ui」を、SDL2の描画で作る。
   画面は 720x428。キー: left/right/up/down/ok/back */
(function () {
  const MJ = window.MJ; const W = 720, H = 428, SW = 832, SH = 468; // W,H=卓の大きさ / SW,SH=画面全体(右に操作の列)
  const S = { mode: 'title', titleIdx: 0, setIdx: 0, confirmQ: null, game: null, dirty: true, bub: {}, banner: null, keep: 0, pressT: -9999, locked: false, lay: [], teachQ: null, homeBot: false, homeBotIdx: 0, playQ: null, intro: null, dice: null, statsPg: -1, rankScr: null, side: null, coach: null, vx: 0, vy: 0, hint: null, waitKey: '', waitInfo: null, fly: null, deal: null, pick: null, lastD: null, saveP: null, menuP: null, slots: [], hid: [], shotN: 0, shotR: 0, self: null, react: null, result: null, end: null, menuIdx: 0, ui: null };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const dirty = () => { S.dirty = true; S.full = true; }; // full: 画面ぜんたいを描きなおす(カーソルだけのときは、手牌のところだけ描く)
  const openMenu = () => { S.menuP = { idx: 0 }; MJ.paused = true; dirty(); }; // ゲーム中のメニュー(対局を止める)
  const WIND = ['東', '南', '西', '北'];
  try { MJ.loadRules && MJ.loadRules(); } catch (e) { /* ignore */ }
  MJ.MEMO_CAP = 30000; // 計算の記憶表の上限(メモリを食いすぎないように)
  if (globalThis.__teacherEnv) { try { localStorage.setItem('mj_teacher', globalThis.__teacherEnv); } catch (e) { /* ignore */ } } // 例: MJ_TEACHER=1 ./mj .
  MJ.AI_BUDGET = 0.4; // Pi Zeroでは、CPUの思考の時間上限を縮める(考えている間、画面と入力が止まるため)
  if (globalThis.__cpuEnv && MJ.CPU_SPEEDS.includes(globalThis.__cpuEnv)) MJ.setCpuSpeed(globalThis.__cpuEnv); // 例: MJ_CPU=fast ./mj .


  /* ---------- セーブ(手動・最新から5件) ---------- */
  const wrap = (i, n) => (i + n) % n;
  const pressing = () => __now() - S.pressT < (S.pressMs || 170);
  const later = (fn, ms) => { S.pressT = __now(); S.pressMs = ms || 170; S.locked = true; dirty(); setTimeout(() => { S.locked = false; fn(); dirty(); }, S.pressMs); }; // 押したボタンが光ってから、次へ
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
  const teacherOn = () => { try { return localStorage.getItem('mj_teacher') === '1'; } catch (e) { return false; } };
  const teacherLabel = () => '麻雀先生: ' + (teacherOn() ? 'あり' : 'なし');
  const toggleTeacher = () => { try { localStorage.setItem('mj_teacher', teacherOn() ? '0' : '1'); } catch (e) { /* ignore */ } S.hint = null; S.waitKey = ''; };
  const speedLabel = () => 'CPUの速さ: ' + MJ.CPU_SPEED_JP[MJ.cpuSpeed()];
  const COMMON_RULES = { length: 'east', kuitan: true, aka: 0, ippatsu: true, ura: true, tobi: true, doubleRon: true, sanchahou: true, kuikae: false, kazoe: true, flower: false, start: 25000 }; // 全国的な(一般的な)ルール。ただし赤ドラは、はじめはなし
  try { if (localStorage.getItem('mj_rules_ver') !== '3') { Object.assign(MJ.RULES, COMMON_RULES); MJ.saveRules(); localStorage.setItem('mj_rules_ver', '3'); } } catch (e) { /* ignore */ } // はじめの設定(版が替わったときも、一度だけ入れなおす)
  const homeItems = () => [{ label: '麻雀をはじめる', act: 'play' }, { label: '麻雀クイズ', act: 'quiz', off: true }, { label: '点数計算の勉強', act: 'study', off: true }, { label: '設定', act: 'settings' }];
  const firstOn = (items, from, dir) => { for (let i = 0; i < items.length; i++) { const j = wrap(from + dir * i, items.length); if (!items[j].off) return j; } return from; };
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
  function panel(x, y, w, h, r, c, bc, bw, a) { r = Math.max(2, Math.min(5, Math.round(r * 0.35))); rrect(x, y, w, h, r, bc, a); rrect(x + bw, y + bw, w - 2 * bw, h - 2 * bw, Math.max(1, r - bw), c, a); } // 角の丸い板(縁つき)
  function rrect(x, y, w, h, r, c, a) { // 角の丸い四角(縁をなめらかに。左右・上下で同じ形)
    r = Math.min(r, Math.floor(h / 2), Math.floor(w / 2)); if (a === undefined) a = 255;
    for (let dy = 0; dy < r; dy++) {
      const d = r - dy - 0.5, xo = r - Math.sqrt(Math.max(0, r * r - d * d)), xi = Math.ceil(xo - 1e-6), cov = xi - xo;
      fill(x + xi, y + dy, w - 2 * xi, 1, c, a); fill(x + xi, y + h - 1 - dy, w - 2 * xi, 1, c, a);
      if (cov > 0.04 && xi >= 1) { const aa = Math.round(a * cov); fill(x + xi - 1, y + dy, 1, 1, c, aa); fill(x + w - xi, y + dy, 1, 1, c, aa); fill(x + xi - 1, y + h - 1 - dy, 1, 1, c, aa); fill(x + w - xi, y + h - 1 - dy, 1, 1, c, aa); }
    }
    fill(x, y + r, w, h - 2 * r, c, a);
  }
  function back(x, y, w, h, side) { // 裏向きの牌(Edge版と同じ: 青い面と、クリーム色の縁)
    fill(x, y, w, h, [243, 236, 212]);
    // クリーム色の縁(牌の上の面)は、卓の外がわ。青い背は、卓の中がわ
    if (side === 'l') fill(x + w - Math.round(w * 0.72), y, Math.round(w * 0.72), h, [74, 143, 224]); else if (side === 'r') fill(x, y, Math.round(w * 0.72), h, [74, 143, 224]); else if (side === 'self') fill(x, y, w, Math.round(h * 0.72), [74, 143, 224]); else fill(x, y + h - Math.round(h * 0.72), w, Math.round(h * 0.72), [74, 143, 224]);
    frame(x, y, w, h, [138, 150, 168], 1);
  }
  function button(x, y, w, h, label, sel) {
    panel(x, y, w, h, 7, sel ? YEL : WHITE, sel ? [160, 110, 0] : [120, 120, 120], sel ? 3 : 1);
    text(label, x + w / 2, y + (h - 16) / 2 - 1, 15, BLACK, 1);
  }
  function face(p, x, y, w, h) {
    const ch = p.char; const src = p.isHuman ? ch.face : (MJ.faceSrc ? MJ.faceSrc(ch) : ch.face);
    if (w >= 48) { fill(x, y, w, h, [90, 110, 100]); gfx.imageTop(src, x, y, w, h); return; } // 大きな顔は、窓の解像度でくっきり描く(縦横の比は、切り取って合わせる)
    if (!gfx.image(src, x, y, w, h)) fill(x, y, w, h, [90, 110, 100]);
  }
  function star(cx, cy, r, c) { // 星(横線で塗る)
    const P = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r; P.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r * 0.82); y++) { const xs = []; for (let i = 0; i < 10; i++) { const a = P[i], b = P[(i + 1) % 10]; if ((a[1] <= y + 0.5) !== (b[1] <= y + 0.5)) xs.push(a[0] + (y + 0.5 - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); } xs.sort((m, n) => m - n); for (let k = 0; k + 1 < xs.length; k += 2) fill(Math.round(xs[k]), y, Math.max(1, Math.round(xs[k + 1]) - Math.round(xs[k])), 1, c); }
  }
  function stars(cx, y, lv) { for (let i = 0; i < 5; i++) { const x = cx + (i - 2) * 22; star(x, y, 10, [240, 190, 40]); if (i >= lv) star(x, y, 7.2, [14, 20, 32]); } }
  const rel = (s) => s; // 自分は seat 0
  const posOf = { 0: 'bottom', 1: 'right', 2: 'top', 3: 'left' };

  /* ---------- 卓の描画 ---------- */
  /* Edge版の卓と同じ配置(座標は、画面 832x468 の中) */
  const HX0 = 17, HPITCH = 45.5, HY = 387, HW = 44, HH = 58, RW = 26, RH = 33;
  const handX = (i, gap) => Math.round(HX0 + i * HPITCH + (gap ? 15 : 0));
  function riverPos(seat, i) { // 河の i 番目の牌: 外枠の位置と、回す角度
    const c = i % 6, r = Math.floor(i / 6);
    if (seat === 0) return { x: 281 + c * RW, y: 268 + r * RH, rot: 0, bw: RW, bh: RH };
    if (seat === 2) return { x: 412 - c * RW, y: 127 - r * RH, rot: 180, bw: RW, bh: RH };
    if (seat === 3) return { x: 181 - r * 35, y: 157 + c * RW, rot: 90, bw: RH, bh: RW };
    return { x: 503 + r * 35, y: 287 - c * RW, rot: 270, bw: RH, bh: RW };
  }
  function tileR(t, x, y, w, h, red, dim, rot) {
    if (!rot) { tile(t, x, y, w, h, red, dim); return; }
    if (!gfx.imageRot(MJ.tileSrc(t, red), x, y, w, h, dim ? 100 : 255, rot)) { const bw = (rot === 90 || rot === 270) ? h : w, bh = (rot === 90 || rot === 270) ? w : h; fill(x, y, bw, bh, [240, 240, 230]); }
  }
  const BAR = [8, 26, 18];
  function barPieces(g, p) {
    const sw = g.seatWindOf(p), parts = [{ s: WIND[sw], c: sw === 0 ? [235, 90, 70] : [120, 160, 230], sz: 18 }, { s: p.name, c: WHITE, sz: 16 }, { s: String(p.score).replace(/\B(?=(\d{3})+(?!\d))/g, ','), c: p.score < 0 ? RED : YEL, sz: 18 }];
    if (p.riichi) parts.push({ s: 'リーチ中', c: [255, 120, 100], sz: 15 });
    return parts;
  }
  const WIND_BG = [[214, 64, 52], [36, 150, 92], [52, 110, 210], [138, 92, 206]]; // 東・南・西・北の色(Edge版と同じく、家ごとに色を分ける)
  const SEAT_C = [[229, 57, 53], [58, 138, 238], [47, 191, 106], [165, 107, 255]]; // 家ごとの色(あなた=赤・下家=青・対面=緑・上家=紫。Edge版と同じ)
  function drawBar(g, p, x, y, w, h, rot) {
    const act = g.turn === p.seat, sw = g.seatWindOf(p), CH = 24, ST = 8, bg = WIND_BG[sw], sc = SEAT_C[p.seat];
    if (act) { rrect(x - 8, y - 8, w + 16, h + 16, 11, [255, 210, 60], 80); rrect(x - 4, y - 4, w + 8, h + 8, 9, [255, 255, 255]); panel(x, y, w, h, 7, [255, 214, 58], [255, 255, 255], 2); } // いま番の人: 黄色い板に白い縁・金色の光(Edge版と同じ)
    else panel(x, y, w, h, 7, BAR, [190, 190, 182], 2, 215);
    // 家の色の帯(板のはしの太い線)
    if (!rot) rrect(x + 2, y + 2, ST, h - 4, 3, sc); else if (rot === 90) rrect(x + 2, y + 2, w - 4, ST, 3, sc); else rrect(x + 2, y + h - 2 - ST, w - 4, ST, 3, sc);
    const parts = barPieces(g, p).slice(1).map((q, i) => ({ s: q.s, sz: q.sz, c: act ? (i === 0 ? [27, 27, 18] : i === 1 ? [120, 60, 0] : [200, 30, 30]) : q.c }));
    const off = ST + 8;
    { const avail = (rot ? h : w) - off - CH - 10 - 8, tot = parts.reduce((a, q) => a + gfx.measure(q.s, q.sz), 0) + 12 * (parts.length - 1), k = Math.min(1, avail / tot); if (k < 1) parts.forEach((q) => { q.sz = Math.max(10, Math.floor(q.sz * k)); }); } // はみ出すときは、文字を小さくして、板に収める
    if (!rot) {
      const cy0 = y + (h - CH) / 2; rrect(x + off, cy0, CH, CH, 5, bg); text(WIND[sw], x + off + CH / 2, cy0 + 2, 18, WHITE, 1);
      let cx = x + off + CH + 10; parts.forEach((q) => { text(q.s, cx, y + (h - q.sz) / 2 - 2, q.sz, q.c); cx += gfx.measure(q.s, q.sz) + 12; }); return;
    }
    const cxm = x + w / 2, cc = rot === 90 ? y + off + CH / 2 : y + h - off - CH / 2;
    rrect(Math.round(cxm - CH / 2), Math.round(cc - CH / 2), CH, CH, 5, bg); gfx.textRot(WIND[sw], Math.round(cxm), Math.round(cc), 18, 255, 255, 255, rot);
    let cy = y + off + CH + 10;
    parts.forEach((q) => { const tw = gfx.measure(q.s, q.sz); if (rot === 90) { gfx.textRot(q.s, Math.round(cxm), Math.round(cy + tw / 2), q.sz, q.c[0], q.c[1], q.c[2], 90); cy += tw + 12; } else { gfx.textRot(q.s, Math.round(cxm), Math.round(y + h - (cy - y) - tw / 2), q.sz, q.c[0], q.c[1], q.c[2], 270); cy += tw + 12; } });
  }
  /* 副露: 席ごとの向きで並べ、鳴いた牌は90度回して、鳴かれた相手の側に置く */
  function meldWH(p, w, h) { let L = 0; for (const m of p.melds) { const n = m.tiles.length, ci = calledIdx(p, m); for (let i = 0; i < n; i++) L += (i === ci ? h : w) + 1; L += 6; } return L; }
  function calledIdx(p, m) { if (!m.from && m.from !== 0) return -1; if (m.from < 0 || m.from === p.seat) return -1; const n = m.tiles.length, rel = (m.from - p.seat + 4) % 4; return rel === 3 ? 0 : rel === 1 ? n - 1 : Math.min(1, n - 1); }
  function drawMelds(p, ax, ay, w, h) { // (ax,ay): 副露の置き場の左上。長さは meldWH
    const seat = p.seat, rot0 = [0, 270, 180, 90][seat], horiz = seat === 0 || seat === 2, total = meldWH(p, w, h);
    let pos = 0;
    for (const m of p.melds) {
      const n = m.tiles.length, ci = calledIdx(p, m);
      for (let i = 0; i < n; i++) {
        const side = i === ci, len = side ? h : w, tl = m.tiles[i];
        const off = (seat === 0 || seat === 3) ? pos : total - pos - len; // 席の左から右へ並べた位置 → 画面の位置
        let bx, by, bw, bh, rot;
        if (horiz) { bx = ax + off; bw = side ? h : w; bh = side ? w : h; by = seat === 0 ? ay + h - bh : ay; }
        else { by = ay + off; bw = side ? w : h; bh = side ? h : w; bx = seat === 3 ? ax : ax + h - bw; }
        rot = side ? (rot0 + 90) % 360 : rot0;
        if (m.kind === 'ankan' && (i === 0 || i === 3)) back(bx, by, bw, bh, seat === 0 ? 'self' : seat === 3 ? 'l' : seat === 1 ? 'r' : undefined);
        else tileR(tl.t, bx, by, w, h, tl.red, false, rot);
        pos += len + 1;
      }
      pos += 6;
    }
  }
  function drawRiver(g, p) {
    p.discards.forEach((d, i) => {
      if (S.fly && S.fly.d === d && __now() < S.fly.t0 + S.fly.dur) return; // 飛んでいる間は、河には描かない
      const q = riverPos(p.seat, i);
      tileR(d.tile.t, q.x, q.y, RW, RH, d.tile.red, d.called, q.rot);
      if (d.riichi) frame(q.x, q.y, q.bw, q.bh, RED, 2);
      if (g.lastDiscard && g.lastDiscard.d === d) frame(q.x - 1, q.y - 1, q.bw + 2, q.bh + 2, YEL, 2);
    });
  }
  /* ---------- 麻雀先生(バランス型) ---------- */
  function teacherAdvice(g, p, opts) {
    const A = MJ.AI; const an = A.analyze(g, p, { know: 2, deep: true, deepN: 6, budget: 60 });
    if (!an.evals.length) return null;
    const stc = an.opps.length ? A.stance(g, p, an, 'balance') : null;
    const pick = stc && stc.pick ? stc.pick : A.byEff(an.evals)[0];
    const rch = opts.riichi.includes(pick.t) && pick.sh === 0 && (stc ? (stc.kind === 'push' && A.wantRiichi(g, p, pick, an)) : A.wantRiichi(g, p, pick, an));
    return { tile: pick.tile, t: pick.t, sh: pick.sh, n: pick.ukeire ? pick.ukeire.n : 0, label: stc ? stc.label : '', why: stc ? stc.why : '', riichi: rch, minSh: an.minSh };
  }
  function waitInfoOf(g) { // いまの手牌がテンパイなら、あたり牌と、見えていない残りの枚数
    const p = g.players[0]; let hand = p.hand.filter((h) => h !== p.drawn), plan = false;
    if (S.self && S.self.rm) { // リーチする牌を選んでいる間は、その牌を切ったあとの待ち(予定)を出す
      const h = myTiles(p)[S.self.idx]; if (!h) return null; hand = p.hand.filter((x) => x !== h); plan = true;
    }
    if (hand.length % 3 !== 1) return null;
    const key = (plan ? 'P' : '') + hand.map((h) => h.id).join(',') + '|' + p.melds.length + '|' + g.players.map((q) => q.discards.length).join(',');
    if (key === S.waitKey) return S.waitInfo; S.waitKey = key; S.waitInfo = null;
    const c = MJ.toCounts(hand); if (MJ.shanten(c, p.melds.length) !== 0) return null;
    const ws = MJ.waits(c.slice(), p.melds.length); if (!ws.length) return null;
    const seen = Array(34).fill(0); hand.forEach((h) => seen[h.t]++); if (p.drawn && hand.indexOf(p.drawn) < 0 && !plan) seen[p.drawn.t]++;
    g.players.forEach((q) => { q.discards.forEach((d) => { if (!d.called) seen[d.tile.t]++; }); q.melds.forEach((m) => m.tiles.forEach((h) => seen[h.t]++)); });
    g.doraInd.forEach((d) => seen[d.t]++);
    S.waitInfo = ws.slice(0, 5).map((t) => ({ t, left: Math.max(0, 4 - seen[t]), plan, fu: !!(p.tempFuriten || p.riichiFuriten || ws.some((w) => p.discardTypes.has(w))) })); return S.waitInfo;
  }
  /* ---------- 右の操作の列(Edge版と同じ並び): MENU / 局 / あたり牌 / 解説 / 麻雀先生 ---------- */
  const SIDE_ORDER = [0, 3, 1, 2]; // 上から: MENU(と音) / 解説 / 麻雀先生
  function sbtn(x, y, w, h, c1, c2, lines, focus, sz) {
    if (focus) rrect(x - 3, y - 3, w + 6, h + 6, 7, [255, 255, 255]); rrect(x, y, w, h, 4, c2); rrect(x, y, w, h - 3, 4, c1);
    lines.forEach((l, i) => text(l, x + w / 2, y + (h - lines.length * (sz + 3)) / 2 + i * (sz + 3), sz, WHITE, 1));
  }
  function drawSide(g) {
    const f = S.side ? S.side.idx : -1;
    sbtn(726, 6, 64, 32, [235, 120, 30], [160, 70, 10], [''], f === 0, 13); text('MENU', 762, 14, 13, WHITE, 1); [0, 1, 2].forEach((i) => fill(731, 15 + i * 5, 10, 2, WHITE));
    sbtn(796, 6, 30, 32, [50, 90, 160], [25, 50, 100], [''], f === 3, 13); fill(803, 17, 4, 10, WHITE); fill(807, 14, 3, 16, WHITE); fill(810, 11, 3, 22, WHITE); fill(816, 17, 2, 10, WHITE);
    { const lb = g.kyokuLabel().split(' '); text(lb[0], 776, 46, 22, WHITE, 1); text((lb[1] ? lb[1] + ' ' : '') + ({ single: '一局戦', south: '東南戦' }[g.length] || '東風戦'), 776, 72, 12, GREY, 1); }
    {
      const w = waitInfoOf(g);
      if (w) { const ph = 40 + Math.ceil(w.length / 3) * 58 + (w[0].fu ? 18 : 0); panel(726, 94, 100, ph, 10, [6, 44, 26], [255, 220, 40], 2, 235); text(w[0].plan ? '待ち(予定)' : 'あたり牌', 776, 98, 14, YEL, 1);
        w.forEach((x, i) => { const tx = 731 + (i % 3) * 32, ty = 118 + Math.floor(i / 3) * 58; tile(x.t, tx, ty, 28, 38); text('あと' + x.left, tx + 14, ty + 40, 11, WHITE, 1); });
        if (w[0].fu) text('フリテン', 776, 94 + ph - 22, 13, [255, 120, 100], 1); }
    }
    sbtn(726, 330, 100, 40, [40, 90, 190], [20, 50, 120], ['解説'], f === 1, 20);
    sbtn(726, 378, 100, 44, teacherOn() ? [30, 120, 80] : [90, 90, 90], teacherOn() ? [15, 70, 45] : [50, 50, 50], ['麻雀先生', teacherOn() ? 'あり' : 'なし'], f === 2, 15);
  }
  function wrapText(s, sz, maxw) { // 文字列を、幅に収まるように、行に分ける
    const out = []; let cur = '';
    for (const ch of String(s)) { if (ch === '\n') { out.push(cur); cur = ''; continue; } if (gfx.measure(cur + ch, sz) > maxw) { out.push(cur); cur = ch; } else cur += ch; }
    if (cur) out.push(cur); return out;
  }
  /* Edge版の解説(coach.js が作るカード)を、文字のカードに直して使う */
  const htmlText = (h) => String(h).replace(/<span class="tile[^>]*>[\s\S]*?<\/svg><\/span>/g, '').replace(/<br\s*\/?>/g, '\n').replace(/<li>/g, '・').replace(/<\/li>/g, '\n').replace(/<\/div>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
  function parseCards(html) {
    const out = [], re = /<div class="cc(?: [^"]*)?"><div class="cc-h">([\s\S]*?)<\/div><div class="cc-b">([\s\S]*?)<\/div><\/div>(?=<div class="cc|\s*$)/g; let m;
    while ((m = re.exec(html))) out.push({ title: htmlText(m[1]), text: htmlText(m[2]) });
    return out;
  }
  function buildCoach() {
    const g = S.game; if (!g) return [];
    try {
      if (S.self) { const a = MJ.Coach.selfAdvice(g, S.self.p, S.self.opts, S.self.st || {}); return parseCards(a.html); }
      if (S.react && S.reactArgs) return parseCards(MJ.Coach.reactAdvice(g, S.reactArgs.q, S.reactArgs.o));
    } catch (e) { print('coach err ' + (e && e.stack || e)); }
    return [];
  }
  const shortTitle = (t) => /おすすめ|★/.test(t) ? 'おすすめ' : /どうして/.test(t) ? 'どうして?' : /役/.test(t) ? '目指す役' : /警戒|危/.test(t) ? '警戒' : /手牌/.test(t) ? '手牌' : (t.replace(/^[^\u3040-\u9fff]+/, '').slice(0, 4) || t.slice(0, 4));
  function drawCoach() {
    panel(10, 8, 700, 412, 18, [14, 40, 32], [240, 210, 120], 3, 247);
    text('麻雀先生', 24, 14, 22, YEL);
    const c = S.coach, cards = c.cards;
    if (!teacherOn()) { text('麻雀先生が「なし」です。右の「麻雀先生」ボタンで「あり」にしてください。', 28, 80, 18, WHITE); text('決定・もどる で とじる', 360, 396, 14, GREY, 1); return; }
    if (!cards.length) { text('あなたの番(または、ポン・チーなどの選択)のときに、開いてください。', 28, 80, 18, WHITE); text('決定・もどる で とじる', 360, 396, 14, GREY, 1); return; }
    const tw = Math.min(110, Math.floor(540 / cards.length));
    cards.forEach((cd, i) => { const on = c.tab === i; fill(150 + i * (tw + 4), 14, tw, 30, on ? YEL : [60, 90, 80]); text(shortTitle(cd.title), 150 + i * (tw + 4) + tw / 2, 18, 15, on ? BLACK : WHITE, 1); });
    const cd = cards[c.tab]; if (!cd.lines) { cd.lines = []; wrapText(cd.title, 21, 650).forEach((l) => cd.lines.push({ t: l, h: 1 })); cd.lines.push({ t: '', h: 0 }); wrapText(cd.text, 18, 650).forEach((l) => cd.lines.push({ t: l, h: 0 })); }
    const per = 12, top = c.scroll || 0; let y = 56;
    cd.lines.slice(top, top + per).forEach((l) => { text(l.t, 28, y, l.h ? 21 : 18, l.h ? YEL : WHITE); y += l.h ? 30 : 27; });
    if (cd.lines.length > per) text((top > 0 ? '↑ ' : '') + ((top + per) < cd.lines.length ? '↓ つづき' : ''), 690, 380, 13, GREY, 2);
    text('← → カードをえらぶ   ↑ ↓ 文章をうごかす   決定・もどる とじる', 360, 396, 14, GREY, 1);
  }
  function drawTeacher(g) {
    if (!teacherOn()) return;
    const h = S.hint, s = S.self; if (s && s.rm) return; // リーチする牌をえらぶ間は、案内の文字だけ
     if ((!h || !s || s.row !== 0) && !S.react && S.tmsg && __now() < S.tmsg.until) { panel(6, 280, 430, 46, 10, [6, 44, 26], [255, 220, 40], 2, 240); text('麻雀先生', 14, 282, 14, YEL); text(S.tmsg.text, 14, 301, 17, WHITE); return; }
    if (!h || !s || s.row !== 0) return;
    panel(6, 280, 430, 46, 10, [6, 44, 26], [255, 220, 40], 2, 240);
    text('★ おすすめ: ' + MJ.tileName(h.t) + (h.riichi ? ' を切ってリーチ' : ' を切る'), 14, 282, 17, YEL);
    text((h.sh === 0 ? 'テンパイ' : 'テンパイまであと' + h.sh + '歩') + ' 受け入れ' + h.n + '枚  ' + (h.label || ''), 14, 303, 14, WHITE);
  }

  /* ---------- 軽い動き(牌が河へ飛ぶ・配牌・札の拡大) ---------- */
  function startFly(g, ld) {
    if (g.fast || ld.by == null) return;
    const p = g.players[ld.by], i = p.discards.indexOf(ld.d); if (i < 0) return;
    const q = riverPos(ld.by, i);
    const from = ld.by === 0 && S.pick ? S.pick : ({ 2: [330, 20], 3: [10, 150], 1: [690, 150] }[ld.by] || [360, 300]);
    S.fly = { d: ld.d, t: ld.tile.t, red: ld.tile.red, from, to: [q.x, q.y], rot: q.rot, bw: q.bw, bh: q.bh, t0: __now(), dur: FLY_END }; S.pick = null;
  }
  /* 捨て牌: 3コマ(案B)。「ひょい」少し浮く → 「ぴゅっ」河の手前へ → 「タン!」河に置いて、白い枠が一瞬光る。途中をつながない */
  const FLY_F = [[0, 0.05, 1.12], [45, 0.78, 1.2], [95, 1, 1]], FLY_END = 165;
  function drawFly() {
    const f = S.fly; if (!f) return; const e = __now() - f.t0; let fr = FLY_F[0]; for (const q of FLY_F) if (e >= q[0]) fr = q;
    const k = fr[1], sc = fr[2], x = f.from[0] + (f.to[0] - f.from[0]) * k, y = f.from[1] + (f.to[1] - f.from[1]) * k;
    const w0 = Math.round(HW + (RW - HW) * k), h0 = Math.round(HH + (RH - HH) * k), w = Math.round(w0 * sc), h = Math.round(h0 * sc);
    const bw0 = (f.rot === 90 || f.rot === 270) ? h0 : w0, bh0 = (f.rot === 90 || f.rot === 270) ? w0 : h0, bw = (f.rot === 90 || f.rot === 270) ? h : w, bh = (f.rot === 90 || f.rot === 270) ? w : h;
    tileR(f.t, Math.round(x - (bw - bw0) / 2), Math.round(y - (bh - bh0) / 2), w, h, f.red, false, f.rot); // 置かれる向きのまま飛ぶ
    if (k === 1) frame(f.to[0] - 3, f.to[1] - 3, f.bw + 6, f.bh + 6, [255, 255, 255], 2); // タン!
  }
  /* 配牌: 4牌ずつ配られ、最後に「チャッ」と並び替わる */
  /* 配牌: 親から反時計回りに、4牌ずつ(12牌)→ 1牌ずつ。配り終わると「チャ!」と牌が少し上がって並びかわり、「タンッ!」と手牌の位置にそろう */
  const FLY_MS = 140, DEAL_R = [0, 400, 800, 1200], DEAL_J = 120, DEAL_LIFT = 1900, DEAL_DROP = 2270, DEAL_END = 2440, LIFT_PX = 24;
  /* 配牌の山(2段重ねの牌が、輪になっている)。親の側から、反時計回りに、2つ(=4牌)ずつ取られていく */
  const WALL_P = 15, WALL_X0 = 232, WALL_Y0 = 86;
  function wallList(dealer) {
    const out = [], side = (sd, i) => (sd === 0 ? { x: WALL_X0 + i * WALL_P, y: WALL_Y0 + 236, w: 14, h: 18, sd: '' } : sd === 1 ? { x: WALL_X0 + 261, y: Math.round(WALL_Y0 + 20 + (16 - i) * 12.8), w: 18, h: 12, sd: 'r' } : sd === 2 ? { x: WALL_X0 + (16 - i) * WALL_P, y: WALL_Y0, w: 14, h: 18, sd: '' } : { x: WALL_X0 - 24, y: Math.round(WALL_Y0 + 20 + i * 12.8), w: 18, h: 12, sd: 'l' });
    for (let q = 0; q < 4; q++) for (let i = 0; i < 17; i++) out.push(side((dealer + q) % 4, i));
    return out;
  }
  function drawWall(sr, half, dealer) {
    wallList(dealer).forEach((p, idx) => { if (idx < sr) return; if (!(idx === sr && half)) back(p.x + 2, p.y - 2, p.w, p.h, p.sd || undefined); back(p.x, p.y, p.w, p.h, p.sd || undefined); });
  }
  function dealState() {
    const d = S.deal, ALL = { n: 99, ns: [99, 99, 99, 99], fly: [[], [], [], []], sorted: true, lift: 0, wall: false }; if (!d) return ALL;
    if (d.seq === S.drawSeq && d.last) return d.last; // 1コマの中で、何度よばれても同じ答え
    const t = __now() - d.t0; if (t >= DEAL_END && d.groups >= 16 && __now() - d.gt[15] > FLY_MS) { S.deal = null; return ALL; }
    // 配った回数(親から反時計回りに、1人ぶん=1回): 時間で決まる目標まで、1コマに1回ずつ進める(遅い機械でも、1人ずつ見える)
    let target = 0; for (let r = 0; r < 4; r++) for (let j = 0; j < 4; j++) if (t >= DEAL_R[r] + j * DEAL_J) target++;
    if (d.groups == null) d.groups = 0;
    if (!d.gt) d.gt = [];
    if (!d.org) d.org = [];
    if (d.groups < target) { const dl0 = S.game ? S.game.dealer : 0, tb = d.groups < 12 ? d.groups * 4 : 48 + (d.groups - 12), wp = wallList(dl0)[Math.min(67, tb >> 1)]; d.org[d.groups] = [wp.x + wp.w / 2, wp.y + wp.h / 2]; d.gt[d.groups] = __now(); d.groups++; if (d.groups % 4 === 1) NSND.sfx(d.groups > 12 ? 'deal1' : 'deal4', 0.5); }
    // 1人ぶん(4牌)ずつ、卓の中央から飛んできて、手元に収まる。飛んでいるあいだは ns(おさまった数)に入れず、fly に入れる
    const ns = [0, 0, 0, 0], dl = S.game ? S.game.dealer : 0, fly = [[], [], [], []], nowT = __now(), dealt = [0, 0, 0, 0];
    for (let k = 0; k < d.groups; k++) { const sd = (dl + (k % 4)) % 4, cnt = k < 12 ? 4 : 1, age = nowT - d.gt[k]; if (age < FLY_MS) fly[sd].push({ from: dealt[sd], cnt, k: Math.min(1, age / FLY_MS), org: d.org[k] }); else ns[sd] += cnt; dealt[sd] += cnt; }
    const all = d.groups >= 16, sorted = all && t >= DEAL_LIFT; if (sorted && !d.liftSfx) { d.liftSfx = 1; NSND.sfx('sort1', 0.7); }
    if (all && t >= DEAL_DROP && !d.dropSfx) { d.dropSfx = 1; NSND.sfx('discard', 0.7); }
    const lift = !sorted ? 0 : t < DEAL_DROP ? LIFT_PX : Math.round(LIFT_PX * Math.max(0, 1 - (t - DEAL_DROP) / 130));
    let tiles = 0; for (let k = 0; k < d.groups; k++) tiles += k < 12 ? 4 : 1;
    d.seq = S.drawSeq; d.last = { n: ns[0], ns, fly, sorted, lift, wall: true, sr: tiles >> 1, half: tiles & 1 };
    return d.last;
  }
  const cached = (i, key, fn) => { const c = S.lay[i]; if (!c || c.key !== key) { gfx.layerBegin(i); fn(); gfx.layerEnd(); S.lay[i] = { key }; } gfx.layer(i); };
  function drawTable(g) {
    if (!g.doraInd || !g.players[0].hand) return; // 始まる前は、まだ描くものがない
    gfx.clear(14, 84, 52);
    fill(140, 8, 440, 300, [10, 66, 40]); // 卓の中ほど
    if (g.blank) return;
    const P = g.players;
    if (S.fly && __now() >= S.fly.t0 + S.fly.dur) S.fly = null; // 着いたら、その同じコマから、河の絵に入れる(ちらつき防止)
    const DS = dealState();
    // 河(変わったときだけ描き直し、あとは1枚の絵を貼る)
    const rkey = P.map((p) => p.discards.length + ':' + p.discards.map((d) => (d.called ? 1 : 0)).join('') + ':' + p.discards.indexOf(g.lastDiscard && g.lastDiscard.d)).join('|') + (S.fly ? 'f' : '');
    cached(0, rkey, () => P.forEach((p) => drawRiver(g, p)));
    const okey = [S.deal ? 'd' : '-', g.turn, P.map((p) => (p.flowers || []).length).join(''), g.live.length, g.kyotaku, g.kyokuLabel(), (g.doraInd || []).map((d) => d.id).join(','), P.map((p) => p.hand.length + ':' + p.score + ':' + (p.riichi ? 1 : 0) + ':' + p.melds.length + ':' + p.melds.map((m) => m.tiles.length).join('') + ':' + g.seatWindOf(p)).join('|')].join('#');
    cached(1, okey, () => {
    // 副露
    drawMelds(P[2], 520, 34, 16, 22); drawMelds(P[3], 3, 312 - meldWH(P[3], 16, 22), 16, 22); drawMelds(P[1], 694, 312 - meldWH(P[1], 16, 22), 16, 22);
    // 名札(横長の板)
    drawBar(g, P[2], 190, 3, 322, 28, 0); drawBar(g, P[3], 35, 21, 27, 280, 90); drawBar(g, P[1], 643, 21, 27, 280, 270); drawBar(g, P[0], 452, 317, 270, 34, 0);
    // 季節牌(花牌)をもっている人は、名札のそばに小さく並べる
    P.forEach((p) => { const fl = p.flowers || []; fl.forEach((f, i) => { const [fx, fy] = p.seat === 0 ? [448 - (i + 1) * 20, 324] : p.seat === 2 ? [518 + i * 20, 5] : p.seat === 3 ? [36 + i * 20, 304] : [640 + i * 20, 304]; tile(f.t, fx, fy, 16, 22, false); }); });
    if (!S.deal) { // 配牌のあいだは、中央の情報を出さない(山の輪を見せるため)
    // 中央の情報
    panel(218, 163, 281, 101, 14, [6, 44, 26], [90, 140, 110], 2);
    const lb = g.kyokuLabel().split(' '); text(lb[0], 234, 172, 24, WHITE); text('供託 ' + g.kyotaku + (lb[1] ? '  ' + lb[1] : ''), 234, 204, 12, GREY);
    text('残り', 234, 226, 14, WHITE); text(String(g.live.length), 262, 220, 34, YEL); text('枚', 316, 232, 14, WHITE);
    { const WX = 356, WY = 188, WS = 128 / 219; gfx.image('img/wall.webp', WX, WY, 128, Math.round(88 * WS), 255); // 王牌の絵の上に、ドラ表示牌を重ねる
      (g.doraInd || []).slice(0, 5).forEach((d, k) => { if (d) tile(d.t, WX + Math.round((3.4 + (4 - k) * 30.1) * WS), WY + Math.round(4.4 * WS), Math.round(29.2 * WS), Math.round(39.4 * WS), d.red); }); }
    }
    });
    if (DS.wall) cached(3, 'w' + g.dealer + ':' + DS.sr + ':' + DS.half, () => drawWall(DS.sr, DS.half, g.dealer)); // 配牌の山
    { // 伏せた手牌(小さな牌): 配牌のあいだは1人ずつ増えるので、層の外で毎回描く
      const nHand = (p) => Math.min(p.hand.length, DS.ns[p.seat]);
      const pos = { 2: (i) => [265 + i * 17, 32], 3: (i) => [3, 66 + i * 17], 1: (i) => [692, 66 + i * 17] }, bk = { 2: [16, 24, undefined], 3: [24, 16, 'l'], 1: [24, 16, 'r'] };
      [2, 3, 1].forEach((sd) => {
        const b = bk[sd]; for (let i = 0; i < nHand(P[sd]); i++) { const q = pos[sd](i); back(q[0], q[1], b[0], b[1], b[2]); }
        (DS.fly[sd] || []).forEach((f) => { for (let c = 0; c < f.cnt; c++) { const q = pos[sd](f.from + c), u = 0.3 + 0.7 * f.k, x = Math.round(f.org[0] + (q[0] - f.org[0]) * u), y = Math.round(f.org[1] + (q[1] - f.org[1]) * u); back(x, y, b[0], b[1], b[2]); } }); // 中央から、手元へ
      });
    }
    // 自分の手牌
    drawHand(g);
    // 吹き出し
    const now = __now();
    const BUB = { 0: [250, 282], 1: [520, 172], 2: [440, 40], 3: [74, 172] };
    for (const k of Object.keys(S.bub)) { const b = S.bub[k]; if (b.until < now) { delete S.bub[k]; continue; }
      const pos = BUB[k] || [300, 200], lines = wrapText(b.text, 15, 164).slice(0, 4), h = 30 + lines.length * 20;
      rrect(pos[0] + 2, pos[1] + 3, 188, h, 10, [0, 0, 0], 70); rrect(pos[0], pos[1], 188, h, 10, [240, 243, 238]);
      text(b.name, pos[0] + 12, pos[1] + 6, 12, [90, 100, 96]); lines.forEach((l, i) => text(l, pos[0] + 12, pos[1] + 24 + i * 20, 15, [30, 34, 32])); }
    drawFly(); drawTeacher(g);
    if (__auto && globalThis.__shotDir && !S._stbl && g.players[2].discards.length >= 4 && g.players[3].discards.length >= 4) { S._stbl = 1; gfx.shot(__shotDir + '/table.bmp'); }
    // 演出: 札の文字が、少し大きいところから縮んで止まる
    if (S.banner && S.banner.call && S.banner.p) { // ポン・チー・ロンなど: 顔と、色のついた大きな文字(Edge版と同じ)
      const bn = S.banner, k = Math.min(1, (__now() - bn.t0) / 160), sz = 84, col = bn.text === 'リーチ' ? [225, 36, 28] : (bn.text === 'ロン' || bn.text === 'ツモ') ? [255, 123, 90] : [196, 139, 255];
      // 鳴いた人の席の側に出す: 対面=中央の上 / 上家=左 / 下家=右(上家と同じ高さ) / 自分=中央の下
      const tw = gfx.measure(bn.text, sz), bw = 108 + 16 + tw, sd = bn.p.seat, by = sd === 2 ? 46 : sd === 0 ? 256 : 160;
      const bx = sd === 3 ? 76 : sd === 1 ? 636 - bw : Math.round((W - bw) / 2);
      face(bn.p, bx, by, 108, 108); frame(bx - 1, by - 1, 110, 110, [240, 210, 120], 2);
      { const tx = bx + 124, ty = by + 28; text(bn.text, tx + 5, ty + 7, sz, [0, 0, 0], 0); [[-4, 0], [4, 0], [0, -4], [0, 4], [-3, -3], [3, -3], [-3, 3], [3, 3]].forEach((d) => text(bn.text, tx + d[0], ty + d[1], sz, [255, 255, 255])); text(bn.text, tx, ty, sz, col); }
    } else if (S.banner) { // 局のはじまり: 4人の顔(★つき)を席の位置に出し、まん中に「東二局 一本場」
      fill(0, 0, W, H, [16, 66, 50]); fill(30, 30, W - 60, H - 60, [22, 84, 62]); fill(90, 70, W - 180, H - 140, [28, 100, 72]); // 緑のしずかな背景(サイコロの画面と同じ)
      const P4 = g.players, FS = 84, SEATS = [{ s: 0, x: 318, y: 292, pc: 360, py: 386, cx: 284, cy: 292 }, { s: 1, x: 590, y: 128, pc: 632, py: 218, cx: 680, cy: 130 }, { s: 2, x: 318, y: 16, pc: 360, py: 106, cx: 284, cy: 18 }, { s: 3, x: 46, y: 128, pc: 88, py: 218, cx: 8, cy: 130 }];
      SEATS.forEach((o) => { const p = P4[o.s]; rrect(o.x - 7, o.y - 7, FS + 14, FS + 14, 4, [150, 100, 46]); rrect(o.x - 4, o.y - 4, FS + 8, FS + 8, 3, [205, 150, 80]); rrect(o.x - 2, o.y - 2, FS + 4, FS + 4, 2, [70, 110, 85]); face(p, o.x, o.y, FS, FS); plate(o.pc, o.py, p.name, p.char && p.char.level ? p.char.level : 0);
        const sw = g.seatWindOf(p); rrect(o.cx, o.cy, 28, 28, 5, [255, 255, 255]); rrect(o.cx + 2, o.cy + 2, 24, 24, 4, WIND_BG[sw]); text(WIND[sw], o.cx + 14, o.cy + 3, 20, WHITE, 1); });
      const lb = String(S.banner.text).split(' '), my = lb[1] ? 0 : 20; rrect(236, 170, 248, 108, 6, [4, 18, 12], 240);
      text(lb[0], 363, 176 + my, 66, [0, 0, 0], 1); text(lb[0], 360, 173 + my, 66, YEL, 1); if (lb[1]) { text(lb[1], 362, 243, 32, [0, 0, 0], 1); text(lb[1], 360, 241, 32, WHITE, 1); } }
  }
  function myTiles(p) { const hs = p.hand.filter((h) => h !== p.drawn); if (p.drawn) hs.push(p.drawn); return hs; }
  function allowed(s, h) { const p = s.p; if (p.riichi) return h === p.drawn; if (s.opts.forbid.includes(h.t)) return false; if (s.rm) return s.opts.riichi.includes(h.t); return true; }
  const b0w = (btns) => (btns.length >= 3 ? 150 : 170);
  function actBtn(x, y, w, h, label, sub, sel, pass, kind) { // 操作ボタン: 選んでいるものは黄色、ほかは白。リーチ・ツモは、色つきで目立たせる
    const kc = null; // リーチ・ツモも、ほかのボタンと同じ(選んでいる = 黄色 / ほか = 白)
    if (kc) rrect(x - 6, y - 6, w + 12, h + 12, 10, kc[1], 90);
    if (sel) rrect(x - 4, y - 4, w + 8, h + 8, 10, [30, 30, 30]); if (sel) rrect(x - 2, y - 2, w + 4, h + 4, 8, [255, 255, 255]);
    rrect(x + 1, y + 3, w, h, 6, [0, 0, 0], 90);
    rrect(x, y, w, h, 6, sel ? [196, 150, 20] : kc ? kc[0] : [150, 156, 150]); rrect(x, y, w, h - 3, 6, sel ? (pressing() ? [255, 246, 170] : [253, 213, 63]) : kc ? kc[1] : [245, 247, 244]);
    const col = [26, 26, 20], big = !sub;
    if (sub) { text(label, x + w / 2, y + 4, 17, col, 1); text(sub, x + w / 2, y + 23, 12, [90, 90, 80], 1); } else text(label, x + w / 2, y + (h - 3 - (big ? 26 : 20)) / 2, big ? 26 : 20, col, 1);
  }
  function reactHL(r, g) { // 副露に使う牌(手牌の中で、金の枠をつける)
    const b = r.btns[r.idx]; if (!b || !b.d) return null; const ld = g.lastDiscard; const need = {};
    const add = (t) => { need[t] = (need[t] || 0) + 1; };
    if (r.pick) r.chis[r.pick.idx].use.forEach(add);
    else if (b.d.act === 'pon') { add(ld.tile.t); add(ld.tile.t); } else if (b.d.act === 'kan') { add(ld.tile.t); add(ld.tile.t); add(ld.tile.t); }
    else if (b.d.act === 'chi') (b.d.use || [].concat(...r.chis.map((c) => c.use))).forEach((t, i, a) => { if (b.d.use) add(t); else if (!need[t]) add(t); });
    return need;
  }
  function drawHand(g) {
    const p = g.players[0]; const s = S.self; const hs = myTiles(p);
    const gapAt = p.drawn ? hs.length - 1 : -1; const DS = dealState(), shown = Math.min(hs.length, DS.n);
    let order = hs; if (!DS.sorted && S.deal && S.deal.perm) order = S.deal.perm.filter((j) => j < hs.length).map((j) => hs[j]); // 配られている間は、並び替える前の順で見せる
    S._hl = S.react ? reactHL(S.react, g) : null;
    const L = [];
    order.forEach((h, i) => {
      if (i >= shown) return;
      const x = handX(i, i === gapAt); let y = HY - (DS.lift || 0);
      const sel = s ? (!S.side && s.row === 0 && s.idx === i) : (!S.react && !S.side && S.mode === 'game' && !S.deal && S.curIdx != null && S.curIdx < hs.length && S.curIdx === i) || (!S.react && !S.side && S.mode === 'game' && !S.deal && S.curIdx != null && S.curIdx >= hs.length && hs.length % 3 !== 1 && i === hs.length - 1);
      const dim = s ? !allowed(s, h) : false;
      if (sel) y -= 8;
      const hl = S.react && S._hl && S._hl[h.t] > 0 ? (S._hl[h.t]--, true) : false;
      L.push({ h, x, y, sel, dim, hl });
    });
    const one = (o) => {
      const { h, x, y } = o;
      if (o.sel) { rrect(x - 5, y - 5, HW + 10, HH + 10, 6, YEL, 90); rrect(x - 3, y - 3, HW + 6, HH + 6, 5, YEL); } // 選んでいる牌: 角の丸い金色の枠(Edge版ふう)
      else if (o.hl) rrect(x - 3, y - 3, HW + 6, HH + 6, 4, YEL);
      tile(h.t, x, y, HW, HH, h.red, o.dim && !o.hl);
      if (teacherOn() && S.hint && S.hint.tile && S.hint.tile.t === h.t && s && s.row === 0) text('★', x + 22, y - 20, 16, YEL, 1);
    };
    (DS.fly && DS.fly[0] || []).forEach((f) => { for (let c = 0; c < f.cnt; c++) { const i = f.from + c, h = order[i]; if (!h) continue; const u = 0.3 + 0.7 * f.k, fx = handX(i, false); tile(h.t, Math.round(f.org[0] + (fx - f.org[0]) * u), Math.round(f.org[1] + (HY - f.org[1]) * u), HW, HH, h.red, false); } }); // 配られる牌が、中央から飛んでくる
    L.forEach((o) => { if (!o.sel && !o.hl) one(o); });
    L.forEach((o) => { if (o.sel || o.hl) one(o); }); // 枠のある牌は、あとから描く(となりの牌に、枠が隠れないように)
    if (!p.drawn && DS.sorted && hs.length % 3 === 1 && !S.result) { const px = handX(hs.length, true), onSlot = !s && !S.react && !S.side && S.mode === 'game' && !S.deal && S.curIdx != null && S.curIdx >= hs.length; if (onSlot) { rrect(px - 5, HY - 13, HW + 10, HH + 10, 6, YEL, 90); rrect(px - 3, HY - 11, HW + 6, HH + 6, 5, YEL); rrect(px, HY - 8, HW, HH, 4, [60, 70, 60]); } else rrect(px, HY, HW, HH, 4, [0, 0, 0], 95); } // 14枚目の場所(まだ引いていない)。カーソルがあれば、そこに残る // まだ引いていない14枚目の場所に、黒い半透明の影(Edge版と同じ)
    drawMelds(p, 713 - meldWH(p, 31, 40), 398, 31, 40);
    if (s) {
      const bw = b0w(s.btns), tot = s.btns.length * bw + (s.btns.length - 1) * 14; let bx = Math.round(360 - tot / 2); // 雀卓の中央、自牌のすぐ上に、大きく出す
      s.btns.forEach((b, i) => { actBtn(bx, 332, bw, 44, b.label, '', s.row === 1 && s.idx === i, false, b.act); bx += bw + 14; });
      if (s.rm) { rrect(190, 296, 340, 30, 6, [0, 0, 0], 200); text('リーチする牌をえらんで決定', 360, 300, 19, YEL, 1); }
    }
    if (S.react) {
      const r = S.react; const ld = g.lastDiscard; const who = ld ? g.players[ld.by].name : '';
      if (ld) { panel(8, 332, 170, 40, 6, [6, 44, 26], [90, 140, 110], 2, 235); tile(ld.tile.t, 14, 336, 22, 29, ld.tile.red); text(who + ' の ' + MJ.tileName(ld.tile.t), 42, 342, 15, WHITE); }
      let bx = 196; r.btns.forEach((b, i) => { actBtn(bx, 332, 124, 40, b.label, b.sub || '', r.idx === i && !r.pick, b.pass); bx += 124 + 14; });
      if (r.note) text(r.note, 196, 312, 14, YEL);
      if (r.pick) { // チーの組み合わせ
        const n = r.chis.length, gw = 118, pw = 150 + n * (gw + 8) + 6; panel(8, 268, pw, 58, 6, [10, 30, 22], [90, 140, 110], 2, 240); text('チーの組み合わせ', 18, 288, 14, YEL);
        r.chis.forEach((c, i) => { const gx = 150 + i * (gw + 8), ts = c.use.concat([ld.tile.t]).sort((a, b) => a - b); panel(gx, 273, gw, 48, 5, [20, 50, 36], r.pick.idx === i ? YEL : [120, 130, 120], r.pick.idx === i ? 3 : 1);
          ts.forEach((t, k) => { const tx = gx + 6 + k * 37; if (t === ld.tile.t) rrect(tx - 2, 276, 36, 43, 3, [255, 100, 150]); tile(t, tx, 278, 32, 40, t === ld.tile.t ? ld.tile.red : false); }); });
      }
    }
  }
  function drawTitle() {
    gfx.clear(14, 84, 52);
    gfx.image('img/title_art.webp', 0, 0, SW, SH, 255); // タイトルの文字は、絵に入っている
    const f = S.titleIdx, pr = pressing();
    const sc = (i) => { // 選んでいるボタンは少し大きく。押すと「ぎゅっと縮んで、ぽんと跳ねる」
      if (i !== f) return 1; if (!pr) return 1.06; const k = (__now() - S.pressT) / (S.pressMs || 170);
      return k < 0.3 ? 1.06 - (k / 0.3) * 0.22 : k < 0.65 ? 0.84 + ((k - 0.3) / 0.35) * 0.36 : 1.2 - ((k - 0.65) / 0.35) * 0.14; };
    const img = (path, x, y, w, h, i) => {
      const k = sc(i), W2 = Math.round(w * k), H2 = Math.round(h * k), X2 = Math.round(x - (W2 - w) / 2), Y2 = Math.round(y - (H2 - h) / 2);
      if (i === f && gfx.imageSil) { // 選んでいるボタン: ボタンの形(透明なところは除く)にそって、黄色く光る縁
        const ring = (r, al) => { for (let q = 0; q < 12; q++) { const an = q * Math.PI / 6; gfx.imageSil(path, X2 + Math.round(Math.cos(an) * r), Y2 + Math.round(Math.sin(an) * r), W2, H2, al); } };
        ring(7, 60); ring(5, 110); ring(3, 255);
      }
      gfx.image(path, X2, Y2, W2, H2, 255);
    };
    img('img/btn_start.webp', (SW - 250) / 2, SH - 100, 250, 78, 0);
    img(NSND.on ? 'img/bgm_on.webp' : 'img/bgm_off.webp', SW - 120, 10, 108, 37, 1);
    img('img/btn_exit.webp', SW - 130, SH - 60, 108, 37, 2);
  }
  function btnR(x, y, w, h, r, sel, off, label, sz, arrow) {
    if (sel) { rrect(x - 5, y - 5, w + 10, h + 10, r + 5, [30, 30, 30]); rrect(x - 3, y - 3, w + 6, h + 6, r + 3, [255, 255, 255]); rrect(x, y, w, h, r, pressing() ? [255, 246, 170] : [253, 213, 63]); if (pressing()) rrect(x - 9, y - 9, w + 18, h + 18, r + 9, [255, 255, 255], 90); }
    else rrect(x, y, w, h, r, off ? [200, 206, 200] : [238, 242, 236], off ? 200 : 245);
    if (arrow && sel) text('▶', x + 24, y + (h - (sz - 6)) / 2, sz - 6, BLACK);
    text(label, x + (arrow ? 80 : 66), y + (h - sz) / 2, sz, off ? [150, 156, 150] : BLACK);
  }
  const HOME_BOTTOM = [{ k: 'exit', label: 'ゲーム終了' }, { k: 'rank', label: '成績・' }];
  function brownBtn(x, y, w, h, label, sel, sz) { // Edge版と同じ、茶色の板に金の縁のボタン
    if (sel) rrect(x - 4, y - 4, w + 8, h + 8, 10, pressing() ? [255, 246, 170] : [255, 255, 255]);
    rrect(x, y, w, h, 6, [201, 154, 61]); rrect(x + 2, y + 2, w - 4, h - 4, 4, sel ? [120, 84, 36] : [74, 52, 24]);
    text(label, x + w / 2, y + (h - (sz || 18)) / 2, sz || 18, sel ? [255, 245, 200] : [243, 227, 176], 1);
  }
  function drawHome() {
    gfx.clear(14, 84, 52);
    gfx.image('img/menu_bg.webp', 0, 0, SW, SH, 255);
    gfx.image('img/logo.webp', 52, 22, 244, 139, 255);
    rrect(21, 165, 292, 170, 16, [10, 18, 32], 150); // 左の説明: 半透明の黒い囲い(Edge版と同じ)
    const ot = (s, x, y, sz, c) => { [[-1, 1], [1, 1], [0, 2]].forEach((d) => text(s, x + d[0], y + d[1], sz, [0, 0, 0], 0)); text(s, x, y, sz, c, 0); };
    const HELP = { play: ['麻雀をはじめる', '3人の相手と、麻雀を', 'うちます。つづきから', '始めることもできます。'], quiz: ['麻雀クイズ', '問題に答えて、腕を', 'みがきます。', '(じゅんびちゅう)'], study: ['点数計算の勉強', '上がったときの点数の', '数え方を学びます。', '(じゅんびちゅう)'], settings: ['設定', '音の大きさや、CPUの', '速さ、ボタンの入れ替', 'えを変えます。'], exit: ['ゲーム終了', '遊ぶのをやめます。', '電源を切る前の画面へ', ''], rank: ['成績', 'いまの段位と、これま', 'での成績を見ます。', '対戦成績もここから。'] };
    { const its = homeItems(), key = S.homeBot ? HOME_BOTTOM[S.homeBotIdx].k : (its[S.menuIdx] || its[0]).act, hp = HELP[key] || HELP.play;
      ot(hp[0], 38, 177, hp[0].length > 6 ? 32 : 38, [255, 225, 74]); hp.slice(1).forEach((l, i) => ot(l, 38, 232 + i * 32, 23, WHITE)); }
    const items = homeItems(); const IY = [58, 145, 227, 309];
    items.forEach((it, i) => { const sel = !it.off && !S.homeBot && S.menuIdx === i && !S.teachQ && !S.playQ && !S.confirmQ; if (sel) btnR(370, IY[i] - (i ? 4 : 0), 433, 67, 7, true, false, it.label, 34, true); else btnR(383, IY[i], 408, 58, 7, false, it.off, it.label, 32, false); });
    const BW = [[150, 230]];
    HOME_BOTTOM.forEach((b, i) => {
      const row = i >> 1, col = i & 1, lab = b.k === 'rank' ? '成績・' + MJ.Rank.label() : b.k === 'teacher' ? teacherLabel() : b.label, sel = S.homeBot && S.homeBotIdx === i && !S.teachQ && !S.playQ && !S.confirmQ;
      brownBtn(19 + (col ? BW[row][0] + 12 : 0), 398, BW[row][col], 46, lab, sel, 21);
    });
  }
  const swapOn = () => { try { const v = localStorage.getItem('mj_swapab'); return v === null ? true : v === '1'; } catch (e) { return true; } };
  try { __swapab(swapOn() ? 1 : 0); } catch (e) { /* ignore */ }
  const perfOn = () => { try { return localStorage.getItem('mj_perf') === '1' || !!globalThis.__perfEnv; } catch (e) { return false; } };
  const SETS = [
    { k: 'bgm', label: 'BGMの大きさ' }, { k: 'sfx', label: '効果音の大きさ' }, { k: 'voice', label: '声の大きさ' },
    { k: 'bgmon', label: 'BGM' }, { k: 'speed', label: 'CPUの速さ' }, { k: 'teacher', label: '麻雀先生' }, { k: 'swap', label: '決定ボタンの入れ替え' }, { k: 'rules', label: '麻雀のルール' }, { k: 'perf', label: '速度の表示(開発用)' }, { k: 'back', label: 'もどる' },
  ];
  /* 麻雀のルール(一般的な設定が、はじめの値)。変えると、次の対局から使われる */
  const RULE_ROWS = [
    { k: 'length', label: '対局の長さ', vals: [['east', '東風戦(東1〜4局)'], ['south', '東南戦(東1〜南4局)'], ['single', '一局だけ']], note: '一局だけは、練習向きです。' },
    { k: 'kuitan', label: '喰いタン', vals: [[true, 'あり'], [false, 'なし']], note: 'ありだと、鳴いた手でも、2〜8だけの手(タンヤオ)で上がれます。' },
    { k: 'aka', label: '赤ドラ', vals: [[3, 'あり(赤5を3枚)'], [0, 'なし']], note: '赤い5は、持っているだけで1飜(点が増えます)。' },
    { k: 'ippatsu', label: '一発', vals: [[true, 'あり'], [false, 'なし']], note: 'リーチして1巡以内に上がると、1飜ふえます。' },
    { k: 'ura', label: '裏ドラ', vals: [[true, 'あり'], [false, 'なし']], note: 'リーチして上がると、裏のドラ表示牌をめくります。' },
    { k: 'tobi', label: '飛び(0点より下)', vals: [[true, '終了する'], [false, '続ける']], note: '持ち点が0点より下になったら、ゲームを終わりにするか。' },
    { k: 'doubleRon', label: 'ダブロン', vals: [[true, 'あり'], [false, 'なし(頭ハネ)']], note: '同じ牌で2人が上がれるとき、2人とも上がりにするか。' },
    { k: 'sanchahou', label: '三家和(3人ロン)', vals: [[true, '流局にする'], [false, '3人とも上がる']], note: '3人が同時にロンしたとき、その局を流局にするか。' },
    { k: 'kuikae', label: '喰い替え', vals: [[false, '禁止'], [true, '許可']], note: '鳴いた直後に、同じ(近い)牌を切ること。ふつうは禁止です。' },
    { k: 'kazoe', label: '数え役満', vals: [[true, 'あり'], [false, 'なし(三倍満まで)']], note: '13飜以上を、役満として数えるか。' },
    { k: 'flower', label: '季節牌(花牌)', vals: [[false, 'なし'], [true, 'あり']], note: '春夏秋冬の4枚を山に入れます。持つと1飜。' },
    { k: 'start', label: '持ち点', vals: [[25000, '25,000点'], [30000, '30,000点'], [35000, '35,000点']], note: 'はじめの持ち点です。' },
  ];
  function drawRules() {
    gfx.clear(14, 84, 52); gfx.image('img/menu_bg.webp', 0, 0, SW, SH, 255); fill(0, 0, SW, SH, [0, 0, 0], 150);
    text('麻雀のルール', SW / 2, 6, 28, YEL, 1);
    const n = RULE_ROWS.length + 2, i0 = S.ruleIdx || 0, VIS = 9, top = Math.max(0, Math.min(n - VIS, i0 - 4));
    for (let v = 0; v < VIS; v++) {
      const i = top + v, y = 44 + v * 38, sel = i === i0; if (i >= n) break;
      panel(70, y, 692, 35, 8, sel ? YEL : WHITE, sel ? [160, 110, 0] : [110, 110, 110], sel ? 3 : 2);
      if (i < RULE_ROWS.length) {
        const r = RULE_ROWS[i], cur = r.vals.find((q) => String(q[0]) === String(MJ.RULES[r.k])) || r.vals[0], common = String(COMMON_RULES[r.k]) === String(cur[0]);
        text(r.label, 90, y + 6, 20, BLACK); text('◀', 440, y + 7, 18, [90, 90, 80], 1); text(cur[1], 580, y + 6, 20, BLACK, 1); text('▶', 724, y + 7, 18, [90, 90, 80], 1);
        if (common) { rrect(290, y + 7, 72, 22, 4, [60, 140, 90]); text('おすすめ', 326, y + 9, 14, WHITE, 1); }
      } else text(i === RULE_ROWS.length ? 'おすすめの設定に もどす' : 'もどる', SW / 2, y + 6, 20, BLACK, 1);
    }
    const cur = i0 < RULE_ROWS.length ? RULE_ROWS[i0].note : (i0 === RULE_ROWS.length ? 'すべてのルールを、おすすめ(全国的な設定・赤ドラなし)にもどします。' : '');
    panel(70, 392, 692, 40, 8, [6, 44, 26], [90, 140, 110], 2, 235); text(cur, SW / 2, 402, 18, WHITE, 1);
    text('変えたルールは、次の対局から使われます', SW / 2, 440, 15, [205, 224, 212], 1);
  }
  function drawSettings() {
    gfx.clear(14, 84, 52); gfx.image('img/menu_bg.webp', 0, 0, SW, SH, 255); fill(0, 0, SW, SH, [0, 0, 0], 120);
    text('設定', SW / 2, 8, 30, YEL, 1);
    SETS.forEach((s, i) => {
      const y = 44 + i * 42, sel = S.setIdx === i; panel(110, y, 612, 38, 10, sel ? YEL : WHITE, sel ? [160, 110, 0] : [110, 110, 110], sel ? 4 : 2);
      text(s.label, 130, y + 7, 21, BLACK);
      if (s.k === 'bgm' || s.k === 'sfx' || s.k === 'voice') { const lv = NSND.getLevel(s.k); for (let j = 0; j < 10; j++) fill(380 + j * 30, y + 9, 24, 22, j < lv ? [30, 130, 80] : [200, 200, 195]); text(String(lv), 702, y + 8, 20, BLACK, 2); }
      else if (s.k === 'bgmon') text(NSND.on ? 'オン' : 'オフ', 520, y + 8, 22, BLACK, 1);
      else if (s.k === 'speed') text(MJ.CPU_SPEED_JP[MJ.cpuSpeed()], 520, y + 8, 22, BLACK, 1);
      else if (s.k === 'teacher') text(teacherOn() ? 'あり' : 'なし', 520, y + 8, 22, BLACK, 1);
      else if (s.k === 'perf') text(perfOn() ? 'オン' : 'オフ', 520, y + 8, 22, BLACK, 1);
      else if (s.k === 'swap') text(swapOn() ? '入れ替え' : 'ふつう', 520, y + 8, 22, BLACK, 1);
      else if (s.k === 'rules') text(MJ.rulesSummary ? '▶' : '▶', 600, y + 7, 22, BLACK, 1);
    });
  }
  /* ---------- 対局のはじめの演出: 顔の登場 → 東一局 → 勝負! → サイコロ ---------- */
  const SEATPOS = { 0: [SW / 2 - 28, 372], 1: [SW - 190, 130], 2: [SW / 2 - 28, 16], 3: [110, 130] };
  function seatBox(p, s, x, y, big, wind) {
    const fs = big ? 64 : 56; face(p, x, y, fs, fs); frame(x - 1, y - 1, fs + 2, fs + 2, [240, 210, 120], 2);
    text(p.name, x + fs / 2, y + fs + 4, 17, WHITE, 1);
    if (wind) text(wind, x - 14, y + 18, 26, wind === '東' ? RED : YEL, 1);
  }
  const shotOnce = (nm) => { if (__auto && globalThis.__shotDir && !S['_s' + nm]) { S['_s' + nm] = 1; gfx.view(0, 0); gfx.shot(__shotDir + '/' + nm + '.bmp'); gfx.view(S.vx, S.vy); } };
  function plate(cx, y, name, lv) { // 名前の板(角の丸い、黒地に金の縁)
    const w = Math.max(lv ? 128 : 100, gfx.measure(name, 21) + 34), x = Math.round(cx - w / 2), h = lv ? 56 : 38;
    rrect(x - 2, y - 2, w + 4, h + 4, 7, [240, 200, 60]); rrect(x, y, w, h, 5, [14, 20, 32]);
    text(name, cx, y + 6, 21, WHITE, 1); if (lv) stars(cx, y + 40, Math.min(5, lv));
  }
  function stage() { // 緑のしずかな背景(中央が少し明るい)
    gfx.clear(16, 66, 50);
    [[0.05, 0.05, 0.9, 0.9, 14], [0.12, 0.12, 0.76, 0.76, 14], [0.2, 0.2, 0.6, 0.6, 14], [0.3, 0.3, 0.4, 0.4, 14]].forEach((r) => fill(Math.round(SW * r[0]), Math.round(SH * r[1]), Math.round(SW * r[2]), Math.round(SH * r[3]), [60, 150, 110], r[4]));
  }
  function drawIntro() {
    const it = S.intro, g = S.game, t = __now() - it.t0; stage();
    const P = g.players, st = (p) => (p.char && p.char.level ? p.char.level : 0), wf = (x, y, z) => { rrect(x - 9, y - 9, z + 18, z + 18, 4, [150, 100, 46]); rrect(x - 6, y - 6, z + 12, z + 12, 3, [205, 150, 80]); rrect(x - 3, y - 3, z + 6, z + 6, 2, [70, 110, 85]); };
    const pl = (p, cx, y, lv) => (g.dealer === p.seat ? dealerPlate(cx, y, p.name, t) : plate(cx, y, p.name, lv)); // 親は、金色の「親」の名札
    const wc = (p, x, y) => { const sw = g.seatWindOf(p); rrect(x, y, 36, 36, 6, [255, 255, 255]); rrect(x + 2, y + 2, 32, 32, 5, WIND_BG[sw]); text(WIND[sw], x + 18, y + 4, 26, WHITE, 1); }; // 東南西北のチップ
    if (t > 0) { wf(360, 18, 112); face(P[2], 360, 18, 112, 112); pl(P[2], 416, 140, st(P[2])); wc(P[2], 306, 22); }
    if (t > 0) { wf(70, 150, 112); face(P[3], 70, 150, 112, 112); pl(P[3], 126, 268, st(P[3])); wc(P[3], 22, 154); }
    if (t > 0) { wf(650, 150, 112); face(P[1], 650, 150, 112, 112); pl(P[1], 706, 268, st(P[1])); wc(P[1], 774, 154); }
    if (t > 0) { try { gfx.imageTop('img/you/' + String(MJ.youIndex()).padStart(2, '0') + '.webp', 60, 336, 92, 92); } catch (e) { /* ignore */ } pl(P[0], 204, 366, 0); wc(P[0], 18, 340); }
    if (t > 400 && !it.v1) { it.v1 = 1; S.skipKyokuVoice = true; try { NSND.readKyoku(g); } catch (e) { /* ignore */ } }
    if (t >= 1700 && !it.v2) { it.v2 = 1; try { snd.play('audio/voice/intro_w2.mp3', 0.9); } catch (e) { /* ignore */ } }
    if (t > 400 && t < 1700) { const k = Math.min(1, (t - 400) / 160), sz = k < 0.5 ? 96 : 78; fill(192, 190, 448, 90, [0, 0, 0], 170); text(g.kyokuLabel().split(' ')[0], SW / 2, 235 - sz / 2, sz, YEL, 1); }
    if (t >= 1700 && t < 2900) { const k = Math.min(1, (t - 1700) / 160), sz = k < 0.5 ? 110 : 90; fill(192, 180, 448, 110, [0, 0, 0], 170); [[-3, 0], [3, 0], [0, -3], [0, 3]].forEach((dd) => text('勝負!', SW / 2 + dd[0], 235 - sz / 2 + dd[1], sz, [255, 255, 255], 1)); text('勝負!', SW / 2, 235 - sz / 2, sz, [225, 40, 30], 1); }
    if (t > 300) shotOnce('intro1'); if (t > 1000) shotOnce('intro2'); if (t > 2200) shotOnce('intro3');
    if (t >= 2900) { S.intro = null; it.done(); }
    dirty();
  }
  const PIP = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function drawDie(x, y, v, s) { // 平らなサイコロ。顔の絵(最後に描く)より上に重なるよう、fillTop で描く
    s = s || 72; const F = (xx, yy, w, h, c, a) => gfx.fillTop(xx, yy, w, h, c[0], c[1], c[2], a == null ? 255 : a);
    F(x + 3, y + 5, s, s, [0, 0, 0], 80); F(x, y, s, s, [120, 120, 110]); F(x + 2, y + 2, s - 4, s - 4, [250, 248, 240]);
    const u = s / 3.2, pr = Math.max(3, Math.round(s / 13));
    (PIP[v] || []).forEach((i) => { const cx = x + Math.round(s / 2 + ((i % 3) - 1) * u * 0.9), cy = y + Math.round(s / 2 + (Math.floor(i / 3) - 1) * u * 0.9); F(cx - pr, cy - pr, pr * 2, pr * 2, v === 1 ? [220, 40, 40] : [30, 30, 30]); });
  }
  const DPOS = { 2: [SW / 2 - 40, 30], 3: [70, 150], 1: [SW - 150, 150], 0: [SW / 2 - 40, 330] };
  function dealerPlate(cx, y, name, rv) { // 親の名札: 金色の板に、左端に赤い「親」の札(脈打つ光つき)
    const TW = 40, w = Math.max(150, gfx.measure(name, 21) + 34 + TW), x = Math.round(cx - w / 2), h = 38, pu = 0.5 + 0.5 * Math.sin(rv / 140);
    rrect(x - 8, y - 8, w + 16, h + 16, 8, [255, 190, 30], Math.round(60 + 100 * pu));
    rrect(x - 3, y - 3, w + 6, h + 6, 7, [255, 255, 255]); rrect(x, y, w, h, 5, [255, 214, 58]); rrect(x, y + 17, w, h - 17, 5, [244, 190, 20]); rrect(x, y, w, 26, 5, [255, 226, 110]);
    rrect(x, y, TW, h, 5, [214, 48, 40]); rrect(x + TW - 6, y, 6, h, 0, [214, 48, 40]);
    text('親', x + TW / 2, y + 7, 24, WHITE, 1); text(name, x + TW + (w - TW) / 2, y + 7, 21, [35, 26, 0], 1);
  }
  function diceSeat(p, s, hi, wind, rv, part) { // サイコロの画面の、4人の顔(大きく)と名前。rv: 親が決まったあとの経過ミリ秒(親だけ、跳ねて、光る)。part: 'static'(板・光・風) / 'face'(顔の絵)
    let x = DPOS[s][0], y = DPOS[s][1], fs = 80, dealer = rv != null;
    if (dealer) { const k = Math.min(1, rv / 380), ex = k < 0.6 ? 80 + (k / 0.6) * 36 : 116 - ((k - 0.6) / 0.4) * 14; fs = Math.round(ex); x -= Math.round((fs - 80) / 2); y -= Math.round((fs - 80) / 2); }
    if (part !== 'face') {
      if (dealer) { const pu = 0.5 + 0.5 * Math.sin(rv / 140); rrect(x - 16, y - 16, fs + 32, fs + 32, 12, [255, 190, 30], Math.round(70 + 110 * pu)); rrect(x - 10, y - 10, fs + 20, fs + 20, 9, [255, 230, 90], Math.round(150 + 105 * pu)); rrect(x - 4, y - 4, fs + 8, fs + 8, 6, [255, 255, 255]); }
      else if (hi) { rrect(x - 8, y - 8, fs + 16, fs + 16, 8, [255, 120, 40]); rrect(x - 5, y - 5, fs + 10, fs + 10, 6, [255, 230, 80]); }
      fill(x, y, fs, fs, [90, 110, 100]); if (!dealer) frame(x - 1, y - 1, fs + 2, fs + 2, hi ? [255, 255, 255] : [240, 210, 120], hi ? 3 : 2);
      if (dealer) dealerPlate(DPOS[s][0] + 40, DPOS[s][1] + 100, p.name, rv); else plate(DPOS[s][0] + 40, DPOS[s][1] + 96, p.name, p.char && p.char.level ? p.char.level : 0);
      if (wind) { const wi = ['東', '南', '西', '北'].indexOf(wind); rrect(x - 46, y + 6, 38, 38, 6, [255, 255, 255]); rrect(x - 44, y + 8, 34, 34, 5, WIND_BG[wi]); text(wind, x - 27, y + 11, 28, WHITE, 1); }
    } else face(p, x, y, fs, fs);
  }
  function drawDice() {
    const d = S.dice, g = S.game, now = __now();
    if (!d.started && now - d.t0 > 600) { d.started = true; d.rolling = true; d.t0 = now; NSND.sfx('deal4'); }
    const total = d.a + d.b, cStart = d.t1 + 700, cStep = 380, revealAt = cStart + (total - 1) * cStep; // 最後の1つで、その席が止まった瞬間に、親が決まる(止まってから光り直さない)
    const P = g.players, counting = d.settled && now >= cStart && now < revealAt, done = d.settled && now >= revealAt;
    if (done && !d.revealT) { d.revealT = now; NSND.sfx('start', 0.8); NSND.sfx('slam', 0.8); }
    const rt = d.revealT ? now - d.revealT : -1; // 親が決まってからの経過(ミリ秒): 〜1500 親を見せる / 〜2900「東一局」/ 〜4100「勝負!」
    if (rt > 1500 && !d.v1) { d.v1 = 1; NSND.sfx('slam'); try { NSND.readKyoku(g); } catch (e) { /* ignore */ } }
    if (rt > 2900 && !d.v2) { d.v2 = 1; NSND.sfx('slam'); try { snd.play('audio/voice/intro_w2.mp3', 0.9); } catch (e) { /* ignore */ } }
    if (rt > 4100 && !d.fin) { d.fin = true; const r = S.dice; S.dice = null; r.done(d.target); }
    const step = counting ? Math.floor((now - cStart) / cStep) + 1 : 0, hiSeat = counting ? (step - 1) % 4 : -1;
    if (counting && d._lastStep !== step) { d._lastStep = step; NSND.sfx('select', 0.5); }
    const winds = (sd) => (done ? ['東', '南', '西', '北'][(sd - d.target + 4) % 4] : '');
    const seatsStatic = () => { stage(); [2, 3, 1, 0].forEach((sd) => diceSeat(P[sd], sd, sd === hiSeat, winds(sd), done && sd === d.target ? now - d.revealT : null, 'static')); };
    if (done) seatsStatic(); else cached(2, 'd' + (d.id || 0) + ':' + hiSeat, seatsStatic); // 動かない部分は、1枚の絵にして貼る(サイコロのアニメを、カクつかせないため)
    [2, 3, 1, 0].forEach((sd) => diceSeat(P[sd], sd, false, '', done && sd === d.target ? now - d.revealT : null, 'face'));
    let va = d.started ? d.a : 1, vb = d.started ? d.b : 6; const T = [[350, 186], [446, 184]];
    const SEG = [[0.34, 0.62, 0.82, 1.0], [0.38, 0.66, 0.85, 1.0]], AMP = [[70, 34, 14, 5], [62, 30, 12, 4]];
    const sz = [72, 72], pos = [T[0].slice(), T[1].slice()];
    if (d.started && d.rolling) {
      const k = (now - d.t0) / 1500;
      if (k >= 1) { d.rolling = false; d.settled = true; d.t1 = now; NSND.sfx('slam'); }
      else {
        const f = Math.floor((now - d.t0) / 65); if (k < 0.8) { va = 1 + (f * 5 + 3) % 6; vb = 1 + (f * 3 + 1) % 6; }
        [0, 1].forEach((i) => { // 右から転がってきて、手前から奥へ(だんだん小さく)。とん、とん、とんとん
          const sg = SEG[i], a = AMP[i]; let seg = 0; while (seg < 3 && k > sg[seg]) seg++;
          const t0 = seg ? sg[seg - 1] : 0, u = (k - t0) / (sg[seg] - t0), h = a[seg] * 4 * u * (1 - u) * (seg === 0 ? 1.15 : 1);
          if (seg !== d['_lastSeg' + i]) { if (seg > 0) NSND.sfx('discard', 0.35); d['_lastSeg' + i] = seg; }
          const e = 1 - Math.pow(1 - k, 1.7);
          pos[i] = [Math.round(T[i][0] + (800 - T[i][0]) * (1 - e) - (i ? 0 : 20) * (1 - e)), Math.round(T[i][1] + (i ? 60 : 90) * (1 - e) - h)];
        });
      }
    }
    const big = rt > 1500; // 「東一局」「勝負!」のあいだは、サイコロと案内の帯を消して、そのまま中央に大きく出す(画面は切り替えない)
    if (!big) {
      gfx.fillTop(190, 262, 452, 32, 0, 0, 0, 190); const T2 = (str, y, sz2, c) => gfx.textTop(str, SW / 2, y, sz2, c[0], c[1], c[2], 1);
      if (!d.started) T2('サイコロを振ります  (Aボタンで スキップ)', 267, 20, YEL);
      else if (d.rolling) T2('…', 267, 22, WHITE);
      else if (!done) T2('合計 ' + total + ' …  あなたから 左回りに 数えます', 268, 19, WHITE);
      else T2(P[d.target].name + ' が 親です', 265, 24, YEL);
      pos.forEach((p, i) => drawDie(p[0], p[1], i ? vb : va, sz[i])); // サイコロは、黒い帯より上を通る(最後に描く)
    } else if (rt < 2900) { const k = Math.min(1, (rt - 1500) / 160), sz2 = k < 0.5 ? 96 : 78; fill(192, 174, 448, 122, [0, 0, 0], 200); text(g.kyokuLabel().split(' ')[0], SW / 2, 235 - sz2 / 2, sz2, YEL, 1); }
    else { const k = Math.min(1, (rt - 2900) / 160), sz2 = k < 0.5 ? 110 : 90; fill(192, 174, 448, 122, [0, 0, 0], 200); [[-3, 0], [3, 0], [0, -3], [0, 3]].forEach((dd) => text('勝負!', SW / 2 + dd[0], 235 - sz2 / 2 + dd[1], sz2, [255, 255, 255], 1)); text('勝負!', SW / 2, 235 - sz2 / 2, sz2, [225, 40, 30], 1); }
    if (d.settled && __now() - d.t1 > 100) shotOnce('dice2'); if (d.rolling && now - d.t0 > 400) shotOnce('dice1');
    if (d.started || true) dirty();
  }
  /* ---------- 対戦成績の画面 ---------- */
  function drawStats() {
    const R = MJ.Rank, f = R.info(), s = f.s, pg = S.statsPg;
    gfx.clear(14, 40, 30); gfx.image('img/menu_bg.webp', 0, 0, SW, SH, 255); fill(0, 0, SW, SH, [0, 0, 0], 150);
    text('対戦成績', SW / 2, 12, 30, YEL, 1);
    const total = s.games || 0, avg = total ? ((s.ranks[0] + s.ranks[1] * 2 + s.ranks[2] * 3 + s.ranks[3] * 4) / total).toFixed(1) : '-';
    gfx.image('img/you/' + String(MJ.youIndex()).padStart(2, '0') + '.webp', 40, 70, 150, 150, 255); text(f.name, 115, 230, 26, YEL, 1); text('平均順位 ' + avg + '位', 115, 266, 17, WHITE, 1);
    s.ranks.forEach((c, i) => { const y = 70 + i * 40; text((i + 1) + '位', 230, y + 6, 20, WHITE); text(c + '回', 330, y + 6, 20, YEL, 2); fill(345, y + 4, 200, 24, [60, 70, 66]); fill(345, y + 4, total ? Math.round(200 * c / total) : 0, 24, [230, 190, 70]); });
    text('対局数 ' + total + '    1位の割合 ' + (total ? Math.round(s.ranks[0] / total * 100) : 0) + '%', 230, 236, 18, WHITE);
    const opps = Object.keys(s.opp).map((id) => ({ c: MJ.CHARS.find((x) => x.id === +id), o: s.opp[id] })).filter((x) => x.c).sort((a, b) => b.o.n - a.o.n);
    const pages = Math.max(1, Math.ceil(opps.length / 3)), cur = opps.slice(pg * 3, pg * 3 + 3);
    if (!cur.length) text('まだ、対戦の記録がありません。', 600, 120, 18, WHITE, 1);
    cur.forEach((x, i) => { const y = 70 + i * 92; fill(560, y, 252, 84, [235, 235, 225], 235); gfx.image(x.c.face, 566, y + 6, 72, 72, 255); text(x.c.short || x.c.name, 646, y + 8, 18, BLACK); text('対戦 ' + x.o.n + '回', 646, y + 34, 15, [70, 70, 70]); text('勝ち ' + x.o.w + '  勝率 ' + Math.round(x.o.w / x.o.n * 100) + '%', 646, y + 56, 15, [20, 90, 50]); });
    text('◀ ' + (pg + 1) + ' / ' + pages + ' ▶', 686, 352, 16, WHITE, 1);
  }
  /* ---------- 段位の画面(背景の絵の座標は、絵のピクセル 1404x768) ---------- */
  function drawRankScreen() {
    const R = MJ.Rank, f = R.info(), K = SW / 1404, rk = S.rankScr.rk;
    gfx.clear(10, 30, 22); gfx.view(0, 0); gfx.image('img/rank_bg.webp', 0, 6, SW, Math.round(768 * K), 255);
    const at = (x, y, fs, s, c) => { const sz = Math.round(fs * K); text(s, Math.round(x * K), Math.round(y * K) + 6 - Math.round(sz / 2), sz, c, 1); };
    const GOLD = [246, 220, 148], DK = [58, 34, 10], CR = [255, 243, 196];
    at(355, 445, f.name.length > 2 ? 52 : 70, f.name, GOLD); at(705, 349, 40, f.name, DK);
    if (f.next) { at(1068, 358, 28, f.next, GOLD); at(1093, 446, f.left >= 1000 ? 40 : 48, String(f.left), CR); } else at(1090, 446, 34, 'いちばん上', GOLD);
    const bx = Math.round(531 * K), by = Math.round(506 * K) + 6, bw = Math.round(350 * K), bh = Math.round(46 * K);
    fill(bx, by, bw, bh, [26, 18, 10]); fill(bx, by, Math.round(bw * Math.max(f.prog > 0 ? 0.04 : 0, f.prog)), bh, [235, 200, 110]);
    if (f.next) at(706, 529, 26, (f.s.pt - f.base) + ' / ' + (f.next_pt - f.base), DK);
    { const bl = ['対戦成績', '◀ もどる'], bwid = [150, 150]; let bx2 = SW / 2 - 160; const idx = S.rankScr.idx || 0; bl.forEach((l, i) => { brownBtn(bx2, SH - 52, bwid[i], 38, l, idx === i, 18); bx2 += bwid[i] + 20; }); }
    if (rk) at(702, 625, 28, (rk.delta > 0 ? '+' : '') + rk.delta + '点' + (rk.msg ? '  ' + rk.msg : ''), CR);
    if (__auto && globalThis.__shotDir && !S._rkShot) { S._rkShot = 1; gfx.shot(__shotDir + '/rank.bmp'); }
  }
  function overlay(a) { gfx.view(0, 0); fill(0, 0, SW, SH, [0, 0, 0], a == null ? 200 : a); gfx.view(S.vx, S.vy); }
  function drawRankP(){ // 局のあとの、4人のじゅんい(点数と増減)
    const r = S.rankP.r, g = S.game; stage(); text('この局の結果', SW / 2, 14, 34, YEL, 1);
    const win = new Set(r.wins.map((w) => w.winner.seat)), order = g.players.map((p, i) => i).sort((a, b) => (r.after[b] - r.after[a]) || (a - b));
    order.forEach((i, k) => {
      const p = g.players[i], y = 66 + k * 86, x = 96, w = 640, h = 78, d = r.delta[i], me = p.isHuman;
      rrect(x - 3, y - 3, w + 6, h + 6, 6, k === 0 ? [240, 200, 60] : [30, 70, 56]); rrect(x, y, w, h, 5, me ? [58, 100, 50] : [22, 56, 44]);
      text((k + 1) + '位', x + 22, y + 20, 38, k === 0 ? YEL : WHITE);
      face(p, x + 118, y + 7, 64, 64);
      text(p.name, x + 202, y + 12, 28, WHITE);
      if (win.has(i)) { rrect(x + 202, y + 46, 64, 24, 4, [214, 48, 40]); text('上がり', x + 234, y + 49, 17, WHITE, 1); }
      text(String(r.after[i]), x + w - 150, y + 14, 36, YEL, 2); text((d > 0 ? '+' : '') + d, x + w - 18, y + 20, 26, d > 0 ? [120, 230, 140] : d < 0 ? [255, 120, 100] : GREY, 2);
    });
    text('決定ボタンで 次へ', SW / 2, 420, 20, [205, 224, 212], 1);
  }
  function drawResult(r) {
    const g = S.game; stage(); rrect(40, 12, 752, 444, 8, [10, 38, 30]);
    if (r.type === 'win') {
      const w = r.wins[0], res = w.res, v = w.view;
      face(w.winner, 58, 24, 48, 48); frame(57, 23, 50, 50, [240, 210, 120], 2);
      text(w.winner.name, 120, 28, 30, WHITE); { const nw = gfx.measure(w.winner.name, 30); rrect(120 + nw + 14, 30, 84, 34, 10, w.tsumo ? [60, 130, 200] : [210, 60, 50]); text(w.tsumo ? 'ツモ' : 'ロン', 120 + nw + 56, 35, 22, WHITE, 1);
        const sw = g ? g.seatWindOf(w.winner) : 0, lab = WIND[sw] + '家' + (sw === 0 ? '(親)' : ''), lx = 120 + nw + 112, lw = gfx.measure(lab, 22) + 24;
        rrect(lx, 30, lw, 34, 10, [255, 255, 255]); rrect(lx + 2, 32, lw - 4, 30, 8, WIND_BG[sw]); text(lab, lx + lw / 2, 35, 22, WHITE, 1); }
      if (r.total > 1) text((r.idx + 1) + ' / ' + r.total + ' 人目の上がり', 760, 36, 16, GREY, 2);
      if (res.limit) text(res.limit, 760, 62, 30, [255, 120, 90], 2);
      // 手牌(大きく、中央ぞろえ)
      const tw = 36, th = 48, gap = 14, melds = v.melds.reduce((a, m) => a + m.tiles.length * 30 + 10, 0), total = v.concealed.length * (tw + 1) + gap + (w.winTile ? tw : 0) + (melds ? 16 + melds : 0);
      let x = Math.round((SW - total) / 2); const y0 = 78;
      v.concealed.forEach((h) => { tile(h.t, x, y0, tw, th, h.red); x += tw + 1; });
      x += gap; if (w.winTile) { tile(w.winTile.t, x, y0, tw, th, w.winTile.red); frame(x - 1, y0 - 1, tw + 2, th + 2, YEL, 3); x += tw + 16; }
      v.melds.forEach((m) => { m.tiles.forEach((h) => { tile(h.t, x, y0 + 10, 28, 38, h.red); x += 30; }); x += 10; });
      // 役
      const ys = res.yaku; const col = ys.length > 6 ? 2 : 1, cw = col === 2 ? 340 : 480, x0 = col === 2 ? 70 : 160;
      ys.slice(0, 12).forEach((yk, i) => { const cx = x0 + Math.floor(i / 6) * (cw + 20), cy = 148 + (i % 6) * 32; fill(cx, cy + 28, cw, 1, [60, 90, 80]); text(yk.n, cx + 6, cy, 22, WHITE); text((yk.h || yk.han || '') + (res.yakuman ? '' : '飜'), cx + cw - 6, cy, 22, YEL, 2); });
      const pay = w.pay; const pts = pay.ron != null ? pay.ron + '点' : (pay.each != null ? pay.each + '点オール' : pay.fromOther + ' / ' + pay.fromDealer + '点');
      rrect(70, 336, 692, 48, 12, [30, 70, 56]); text((res.yakuman ? '役満' : res.han + '飜 ' + res.fu + '符'), 90, 354, 28, YEL); text(pts, 742, 342, 32, WHITE, 2);
      scoreCards(r, 396);
    } else {
      text('流局', SW / 2, 30, 42, YEL, 1);
      if (r.abort) { text(r.abort + '(3人が同時にロン)', SW / 2, 110, 28, WHITE, 1); text('点数の動きは ありません。親は そのまま続けます。', SW / 2, 160, 20, GREY, 1); }
      else r.tenpai.forEach((t, i) => { const p = g.players[i]; rrect(150 + (i % 2) * 280, 110 + Math.floor(i / 2) * 70, 250, 56, 12, [30, 70, 56]); text(p.name, 168 + (i % 2) * 280, 118 + Math.floor(i / 2) * 70, 22, WHITE); text(t ? 'テンパイ' : 'ノーテン', 380 + (i % 2) * 280, 120 + Math.floor(i / 2) * 70, 20, t ? YEL : GREY, 2); });
      scoreCards(r, 330);
    }
  }
  function scoreCards(r, y0) { // 4人の点数(前 → 後、増減)を、4枚のカードで
    const g = S.game;
    g.players.forEach((p, i) => {
      const x = 62 + i * 178, d = r.delta[i];
      rrect(x, y0, 168, 54, 10, [24, 56, 46]); text(p.name, x + 10, y0 + 4, 16, WHITE);
      text(r.before[i] + ' → ' + r.after[i], x + 10, y0 + 28, 15, GREY); text((d > 0 ? '+' : '') + d, x + 158, y0 + 4, 18, d > 0 ? [120, 230, 140] : d < 0 ? RED : GREY, 2);
    });
  }
  function drawEnd(f) {
    gfx.clear(14, 84, 52); text('対局終了', 360, 20, 32, YEL, 1);
    f.results.forEach((o, i) => {
      const y = 90 + i * 66; fill(120, y, 480, 58, o.p.isHuman ? [255, 240, 150] : [255, 255, 255], 235);
      text(o.rank + '位', 130, y + 14, 28, BLACK); face(o.p, 210, y + 4, 46, 50); text(o.p.name, 270, y + 18, 22, BLACK); text(o.p.score, 590, y + 16, 26, BLACK, 2);
    });
    text('決定ボタンで タイトルへ', 360, 380, 16, WHITE, 1);
  }


  function drawTeachQ() { // Edge版と同じ: 麻雀先生をつけますか?
    overlay(150); const x = 132, y = 118, w = 456, h = 190;
    rrect(x - 2, y - 2, w + 4, h + 4, 8, [240, 200, 60]); rrect(x, y, w, h, 6, [22, 64, 50]);
    gfx.image('img/teacher/t14.webp', x + 24, y + 10, 98, 100, 255);
    text('麻雀先生を', x + 140, y + 24, 30, WHITE); text('つけますか?', x + 140, y + 64, 30, WHITE);
    const labs = ['つけない', '麻雀先生をつける', '◀ もどる'], bws = [120, 176, 112]; let bx = x + 12;
    labs.forEach((l, i) => { const sel = S.teachQ.idx === i; if (sel) { rrect(bx - 3, y + 128, bws[i] + 6, 50, 8, [30, 30, 30]); rrect(bx - 1, y + 130, bws[i] + 2, 46, 6, [255, 255, 255]); } rrect(bx + 1, y + 132, bws[i] - 2, 42, 4, sel ? (pressing() ? [255, 246, 170] : [253, 213, 63]) : [245, 247, 244]); text(l, bx + bws[i] / 2, y + 143, 17, BLACK, 1); bx += bws[i] + 12; });
    shotOnce('teach');
  }
  function tri(cx, cy, r, dir) { for (let i = -r; i <= r; i++) { const w = Math.round(r * 1.6 * (1 - Math.abs(i) / r)) + 1; fill(dir < 0 ? cx + r * 0.8 - w : cx - r * 0.8, cy + i, w, 1, [20, 20, 20]); } }
  function drawSound() {
    overlay(190); const x0 = 60, w = 600, h = 352, y0 = Math.round((H - h) / 2);
    rrect(x0 - 3, y0 - 3, w + 6, h + 6, 8, [240, 210, 100]); rrect(x0, y0, w, h, 6, [36, 74, 58]);
    text('音のせってい', 360, y0 + 12, 26, WHITE, 1); fill(236, y0 + 20, 5, 10, WHITE); fill(241, y0 + 17, 4, 16, WHITE); fill(245, y0 + 14, 4, 22, WHITE);
    const sp = S.soundP, names = ['BGM', '効果音', '読み上げ'], K = ['bgm', 'sfx', 'voice'];
    for (let i = 0; i < 4; i++) {
      const ry = y0 + 58 + i * 52, sel = sp.idx === i; if (sel) rrect(x0 + 8, ry - 4, w - 16, 52, 6, [70, 120, 92]);
      text(names[i] || 'CPU', x0 + 24, ry + 8, i === 2 ? 20 : 24, WHITE);
      if (i < 3) {
        const lv = NSND.getLevel(K[i]);
        rrect(x0 + 130, ry, 52, 44, 5, [232, 238, 228]); tri(x0 + 156, ry + 22, 11, -1);
        rrect(x0 + 192, ry + 10, 270, 24, 12, [24, 46, 36]); if (lv) rrect(x0 + 192, ry + 10, Math.max(24, Math.round(270 * lv / 10)), 24, 12, [240, 200, 80]);
        rrect(x0 + 472, ry, 52, 44, 5, [232, 238, 228]); tri(x0 + 498, ry + 22, 11, 1);
        text(String(lv), x0 + 560, ry + 4, 30, YEL, 1);
      } else { rrect(x0 + 130, ry, 394, 44, 5, [232, 238, 228]); text('速さ: ' + MJ.CPU_SPEED_JP[MJ.cpuSpeed()], x0 + 327, ry + 8, 24, BLACK, 1); }
    }
    text('0にすると、その音が消えます。対局は、とじるまで止まります。', 360, y0 + 58 + 4 * 52 + 2, 15, [190, 205, 195], 1);
    const cy = y0 + h - 56; if (sp.idx === 4) rrect(300, cy - 4, 120, 52, 7, [255, 255, 255]); rrect(304, cy, 112, 44, 6, [248, 208, 80]); text('とじる', 360, cy + 9, 22, BLACK, 1);
  }
  function drawSaveQ() { // 局のあとの保存: 左右の大きな2つ(左: ここまでを保存する / 右: 保存しない)。押すと、そのまま次へ進む
    const q = S.saveP, g = S.game, ink = [26, 26, 20];
    text('この局は 終わりました', 360, 52, 42, [0, 0, 0], 1); text('この局は 終わりました', 360, 49, 42, YEL, 1);
    text(g ? g.kyokuLabel() : '', 360, 112, 26, WHITE, 1);
    const B = [{ x: 36, l: 'ここまでを保存する', s: '続きから遊べます' }, { x: 384, l: '保存しない', s: 'そのまま次へ' }], y = 168, w = 300, h = 160;
    B.forEach((b, i) => {
      const sel = q.idx === i, bx = b.x;
      if (sel) { rrect(bx - 7, y - 7, w + 14, h + 14, 10, [26, 26, 20]); rrect(bx - 4, y - 4, w + 8, h + 8, 8, [255, 255, 255]); }
      rrect(bx + 2, y + 6, w, h, 6, [0, 0, 0], 90);
      rrect(bx, y, w, h, 6, sel ? [196, 150, 20] : [150, 156, 150]); rrect(bx, y, w, h - 4, 6, sel ? (pressing() ? [255, 246, 170] : [253, 213, 63]) : [245, 247, 244]);
      const cx = bx + w / 2, iy = y + 22;
      if (i === 0) { rrect(cx - 17, iy, 34, 34, 4, ink); fill(cx - 10, iy + 3, 18, 11, [215, 218, 212]); fill(cx + 3, iy + 5, 4, 7, ink); fill(cx - 11, iy + 19, 22, 12, [245, 245, 238]); }
      else { for (let k = 0; k < 30; k++) { fill(cx - 15 + k, iy + 2 + k, 5, 5, [90, 90, 84]); fill(cx + 11 - k, iy + 2 + k, 5, 5, [90, 90, 84]); } }
      text(b.l, cx, y + 70, b.l.length > 6 ? 31 : 36, ink, 1); text(b.s, cx, y + 118, 18, [90, 90, 80], 1);
    });
    text('◀ ▶ で えらんで 決定ボタン', 360, 372, 20, [205, 224, 212], 1);
  }
  function drawDialog(title, items, idx, note) {
    overlay(190); const h = 70 + items.length * 50; const y0 = Math.round((H - h) / 2);
    panel(150, y0, 420, h, 16, [20, 60, 42], [240, 210, 120], 3);
    text(title, 360, y0 + 12, 22, YEL, 1);
    items.forEach((l, i) => button(190, y0 + 48 + i * 50, 340, 40, l, idx === i));
    if (note) text(note, 360, y0 + h + 6, 14, WHITE, 1);
  }
  function drawSlots() {
    gfx.clear(14, 84, 52); text('セーブデータをえらぶ', 360, 18, 28, YEL, 1);
    if (!S.slots.length) text('セーブデータがありません', 360, 180, 20, WHITE, 1);
    S.slots.forEach((q, i) => { const sn = q.v.snap, y = 62 + i * 56; panel(80, y, 560, 48, 10, S.slotIdx === i ? YEL : WHITE, [120, 120, 120], 1, 235);
      text((i === 0 ? '最新  ' : (i + 1) + '番目  ') + kyokuText(sn), 94, y + 6, 18, BLACK); text('持ち点 ' + sn.scores.join(' / '), 94, y + 27, 14, [60, 60, 60]); });
    text('↑↓ えらぶ   決定 ロード   もどる でタイトルへ', 360, 400, 14, WHITE, 1);
  }

  /* ---------- 入力 ---------- */
  window.__key = function (k) {
    S.dirty = true; if (S.locked) return;
    NSND.sfx(k === 'ok' ? 'ok' : k === 'back' ? 'click' : 'select', 0.5);
    if (S.rankScr && S.mode !== 'stats') { const r = S.rankScr; if (k === 'left' || k === 'right') r.idx = 1 - (r.idx || 0); else if (k === 'back' || (k === 'ok' && (r.idx || 0) === 1)) { S.rankScr = null; r.done(); } else if (k === 'ok') { S.statsPrev = S.mode; S.mode = 'stats'; S.statsPg = 0; } return; }
    if (k === 'menu' && !S.menuP) { openMenu(); return; } // スタート+セレクト長押し
    if (S.menuP) {
      const items = menuItems();
      if (k === 'up' || k === 'down') S.menuP.idx = wrap(S.menuP.idx + (k === 'up' ? -1 : 1), items.length);
      else if (k === 'back') { S.menuP = null; MJ.paused = false; }
      else if (k === 'ok') { const it = items[S.menuP.idx]; S.menuP = null; MJ.paused = false; if (it === 'タイトルにもどる') stopGame(); }
      return;
    }
    if (S.soundP) { // 音のせってい
      const sp = S.soundP, K = ['bgm', 'sfx', 'voice'];
      if (k === 'up' || k === 'down') sp.idx = wrap(sp.idx + (k === 'up' ? -1 : 1), 5);
      else if (k === 'left' || k === 'right') { const d = k === 'left' ? -1 : 1; if (sp.idx < 3) { NSND.setLevel(K[sp.idx], NSND.getLevel(K[sp.idx]) + d); if (sp.idx === 1) NSND.sfx('discard'); } else if (sp.idx === 3) MJ.cycleCpuSpeed(); }
      else if (k === 'back' || (k === 'ok' && sp.idx === 4)) { S.soundP = null; MJ.paused = false; }
      else if (k === 'ok' && sp.idx === 3) MJ.cycleCpuSpeed();
      return;
    }
    if (S.saveP) {
      if (k === 'up' || k === 'down' || k === 'left' || k === 'right') S.saveP.idx = 1 - S.saveP.idx;
      else if (k === 'ok') {
        const p = S.saveP; S.saveP = null;
        if (p.idx !== 0) { p.res(); return; }
        S.locked = true; S.toast = { text: 'セーブ中です…  電源を切らないでください', until: __now() + 60000 }; dirty();
        setTimeout(() => { const ok = slotWrite(p.snap); S.toast = { text: ok ? 'セーブしました' : 'セーブできませんでした', until: __now() + 1400 }; dirty(); setTimeout(() => { S.toast = null; S.locked = false; dirty(); p.res(); }, 1600); }, 700);
      }
      return;
    }
    if (S.intro) { if (k === 'ok' && !__auto) S.intro.t0 -= 3000; return; }
    if (S.dice) {
      const d = S.dice;
      if (k === 'ok') { const now = __now(), total = d.a + d.b; if (!d.revealT) { d.started = true; d.rolling = false; d.settled = true; d.t1 = now - 700 - (total - 1) * 380 - 1; } else if (now - d.revealT > 700 && !d.fin) { d.fin = true; const r = S.dice; S.dice = null; r.done(d.target); } } // Aボタン: サイコロを飛ばして、親が決まった画面へ。そこでもう一度で、先へ
      return;
    }
    if (S.mode === 'stats') {
      if (k === 'back' || k === 'ok') S.mode = S.statsPrev || 'menu'; else if (k === 'left' || k === 'right') { const o = Object.keys(MJ.Rank.get().opp).length, pages = Math.max(1, Math.ceil(o / 3)); S.statsPg = wrap(S.statsPg + (k === 'right' ? 1 : -1), pages); }
      return;
    }
    if (S.teachQ) { // 麻雀先生をつけますか?  つけない / つける / もどる
      const q = S.teachQ;
      if (k === 'left') q.idx = wrap(q.idx - 1, 3); else if (k === 'right' || k === 'up' || k === 'down') q.idx = wrap(q.idx + 1, 3);
      else if (k === 'back') S.teachQ = null;
      else if (k === 'ok') { if (q.idx === 2) { S.teachQ = null; return; } later(() => { S.teachQ = null; try { localStorage.setItem('mj_teacher', q.idx === 1 ? '1' : '0'); } catch (e) { /* ignore */ } S.hint = null; S.waitKey = ''; startGame(q.snap); }); }
      return;
    }
    if (S.playQ) { // 麻雀をはじめる: つづきから / はじめから
      if (k === 'up' || k === 'down') S.playQ.idx = 1 - S.playQ.idx; else if (k === 'back') S.playQ = null;
      else if (k === 'ok') { const q = S.playQ; S.playQ = null; S.teachQ = { idx: teacherOn() ? 1 : 0, snap: q.idx === 0 ? q.snap : null }; }
      return;
    }
    if (S.confirmQ) {
      if (k === 'left' || k === 'right' || k === 'up' || k === 'down') S.confirmQ.idx = 1 - S.confirmQ.idx;
      else if (k === 'back') S.confirmQ = null; else if (k === 'ok') { const i = S.confirmQ.idx; S.confirmQ = null; if (i === 1) __quit(); }
      return;
    }
    if (S.mode === 'slots') {
      if (k === 'up' || k === 'down') { if (S.slots.length) S.slotIdx = wrap(S.slotIdx + (k === 'up' ? -1 : 1), S.slots.length); }
      else if (k === 'back') { S.mode = 'menu'; S.slots = []; }
      else if (k === 'ok' && S.slots.length) { const q = S.slots[S.slotIdx]; S.slots = []; startGame(q.v.snap); } // ロードしたら、この一覧は、また見えなくなる
      return;
    }
    if (S.mode === 'title') { // タイトル: はじめる / BGM / 終了
      if (k === 'left' || k === 'right' || k === 'up' || k === 'down') { const m = { 0: { up: 1, left: 1, right: 2, down: 2 }, 1: { down: 0, left: 0, right: 2, up: 2 }, 2: { up: 1, right: 1, left: 0, down: 0 } }; S.titleIdx = m[S.titleIdx][k]; }
      else if (k === 'ok') { if (S.titleIdx === 0) later(() => { S.mode = 'menu'; S.homeBot = false; S.menuIdx = firstOn(homeItems(), 0, 1); }, 320); else if (S.titleIdx === 1) { S.pressT = __now(); S.pressMs = 320; NSND.toggle(); if (NSND.on) NSND.home(); dirty(); } else later(() => { S.confirmQ = { idx: 0 }; }, 320); }
      return;
    }
    if (S.mode === 'rules') { // 麻雀のルール
      const n = RULE_ROWS.length + 2, i = S.ruleIdx || 0;
      if (k === 'up' || k === 'down') S.ruleIdx = wrap(i + (k === 'up' ? -1 : 1), n);
      else if (k === 'back') S.mode = 'settings';
      else if (i < RULE_ROWS.length && (k === 'left' || k === 'right' || k === 'ok')) {
        const row = RULE_ROWS[i], cur = row.vals.findIndex((v) => String(v[0]) === String(MJ.RULES[row.k])), nx = row.vals[wrap(cur + (k === 'left' ? -1 : 1), row.vals.length)];
        MJ.RULES[row.k] = nx[0]; MJ.saveRules(); NSND.sfx('select', 0.5);
      }
      else if (k === 'ok' && i === RULE_ROWS.length) { Object.assign(MJ.RULES, MJ.RULE_DEFAULTS, COMMON_RULES); MJ.saveRules(); }
      else if (k === 'ok') S.mode = 'settings';
      return;
    }
    if (S.mode === 'settings') {
      const it = SETS[S.setIdx];
      if (k === 'up' || k === 'down') S.setIdx = wrap(S.setIdx + (k === 'up' ? -1 : 1), SETS.length);
      else if (k === 'back') { S.mode = 'menu'; }
      else if (k === 'left' || k === 'right' || k === 'ok') {
        const d = k === 'left' ? -1 : 1;
        if (it.k === 'bgm' || it.k === 'sfx' || it.k === 'voice') { if (k !== 'ok') NSND.setLevel(it.k, NSND.getLevel(it.k) + d); if (it.k === 'sfx') NSND.sfx('discard'); }
        else if (it.k === 'bgmon') { NSND.toggle(); if (NSND.on) NSND.home(); }
        else if (it.k === 'speed') MJ.cycleCpuSpeed();
        else if (it.k === 'teacher') toggleTeacher();
        else if (it.k === 'swap') { try { localStorage.setItem('mj_swapab', swapOn() ? '0' : '1'); } catch (e) { /* ignore */ } __swapab(swapOn() ? 1 : 0); }
        else if (it.k === 'perf') { try { localStorage.setItem('mj_perf', perfOn() ? '0' : '1'); } catch (e) { /* ignore */ } }
        else if (it.k === 'rules' && k !== 'left') { S.mode = 'rules'; S.ruleIdx = 0; }
        else if (it.k === 'back' && k === 'ok') S.mode = 'menu';
      }
      return;
    }
    if (S.mode === 'menu') { // ホーム
      const items = homeItems();
      S.hid.push(k); if (S.hid.length > HIDDEN.length) S.hid.shift();
      if (S.hid.join() === HIDDEN.join()) { S.hid = []; S.slots = slotRead(); S.slotIdx = 0; S.mode = 'slots'; return; }
      if (S.menuIdx >= items.length) S.menuIdx = 0;
      if (S.homeBot) { // 下の段: ゲーム終了 / 成績 / 対戦成績 / 麻雀先生
        if (k === 'left') S.homeBotIdx = 0; else if (k === 'right') { if (S.homeBotIdx === 0) S.homeBotIdx = 1; else S.homeBot = false; } // 右: もとの項目へ(menuIdx は覚えている)
        else if (k === 'up' || k === 'down') { S.homeBot = false; S.menuIdx = firstOn(items, 0, 1); } // 上でも下でも: 「麻雀をはじめる」へ
        else if (k === 'back') S.mode = 'title';
        else if (k === 'ok') { const b = HOME_BOTTOM[S.homeBotIdx].k; later(() => { if (b === 'exit') S.confirmQ = { idx: 0 }; else if (b === 'rank') S.rankScr = { rk: null, done: () => { S.mode = 'menu'; dirty(); } }; else if (b === 'stats') { S.mode = 'stats'; S.statsPg = 0; } else toggleTeacher(); }); }
        return;
      }
      if (k === 'up') { const j = firstOn(items, S.menuIdx - 1, -1); S.menuIdx = j < S.menuIdx ? j : firstOn(items, items.length - 1, -1); } // いちばん上から上: いちばん下(設定)へ
      else if (k === 'down') { const j = firstOn(items, S.menuIdx + 1, 1); S.menuIdx = j > S.menuIdx ? j : firstOn(items, 0, 1); } // いちばん下から下: いちばん上へ
      else if (k === 'left') { S.homeBot = true; S.homeBotIdx = 1; }
      else if (k === 'back') S.mode = 'title';
      else if (k === 'ok') {
        const it = items[S.menuIdx]; if (!it || it.off) return;
        if (it.act === 'play') later(() => { const l = slotRead(); if (l.length) S.playQ = { idx: 0, snap: l[0].v.snap }; else S.teachQ = { idx: teacherOn() ? 1 : 0, snap: null }; });
        else if (it.act === 'settings') later(() => { S.mode = 'settings'; S.setIdx = 0; });
      }
      return;
    }
    if (S.result) { if (k === 'ok') { const r = S.result; S.result = null; r.done(); } return; }
    if (S.rankP) { if (k === 'ok') { const q = S.rankP; q.done(); dirty(); } return; }
    if (S.end) { if (k === 'ok') { const r = S.end; S.end = null; r.done(); } return; }
    if (S.coach) { // 解説の窓
      const c = S.coach, cs = c.cards || [];
      if (k === 'left' || k === 'right') { if (cs.length) { c.tab = (c.tab + (k === 'right' ? 1 : cs.length - 1)) % cs.length; c.scroll = 0; } }
      else if (k === 'up' || k === 'down') { const cd = cs[c.tab]; if (cd && cd.lines) c.scroll = Math.max(0, Math.min(Math.max(0, cd.lines.length - 12), (c.scroll || 0) + (k === 'down' ? 6 : -6))); }
      else if (k === 'ok' || k === 'back') S.coach = null;
      return;
    }
    if (S.side) { // 右の操作の列
      if (k === 'up' || k === 'down') S.side.idx = (k === 'up' ? { 0: 2, 3: 2, 1: 0, 2: 1 } : { 0: 1, 3: 1, 1: 2, 2: 0 })[S.side.idx]; // 上: 解説→MENU / MENU・音→麻雀先生 / 麻雀先生→解説。下: MENU・音→解説 / 解説→麻雀先生 / 麻雀先生→MENU
      else if (k === 'left' && S.side.idx === 3) S.side.idx = 0; // スピーカーから左: MENUへ
      else if (k === 'right' && S.side.idx === 0) S.side.idx = 3; // MENUから右: スピーカーへ
      else if (k === 'left' || k === 'back') { S.side = null; if (S.self && k === 'left' && S.self.row === 0) S.self.idx = S.self.tiles.length - 1; else if (!S.self && k === 'left' && S.game) S.curIdx = Math.max(0, myTiles(S.game.players[0]).length - 1); } // 左: いちばん右の牌へ
      else if (k === 'right') { S.side = null; S.curIdx = 0; if (S.self) { S.self.row = 0; S.self.idx = 0; } } // 右: いちばん左の牌へもどる
      else if (k === 'ok') {
        const i = S.side.idx;
        if (i === 0) openMenu();
        else if (i === 3) { S.soundP = { idx: 0 }; MJ.paused = true; }
        else if (i === 1) S.coach = { tab: 0, scroll: 0, cards: teacherOn() ? buildCoach() : [] };
        else { toggleTeacher(); if (teacherOn() && S.self && !S.self.p.riichi && !S.game.fast) { try { S.hint = teacherAdvice(S.game, S.self.p, S.self.opts); } catch (e) { /* ignore */ } } else S.hint = null; }
      }
      return;
    }
    const s = S.self, r = S.react;
    if (r && __now() - r.t0 < 600) return; // 確認が出た直後は、キーを受け付けない(連打で押してしまうのを防ぐ。Edge版と同じ)
    if (r && k === 'back' && !r.pick) return; // 確認の間は、戻るは何もしない(誤操作防止)
    if (S.mode === 'game' && !s && !r && S.game && k === 'back') { openMenu(); return; } // 戻るボタン: メニュー(対局を止める)
    if (S.mode === 'game' && !s && !r && S.game && (k === 'left' || k === 'right' || k === 'up' || k === 'down')) { // 相手の番でも、牌をなぞれる
      const n = myTiles(S.game.players[0]).length; if (!n) return; if (S.curIdx == null) { S.curIdx = (k === 'right' || k === 'up') ? 0 : n - 1; S.dirty = true; S.partialKey = true; return; } const slot = S.curIdx >= n && n % 3 === 1, c = Math.min(S.curIdx, n - 1); // slot: 14枚目の場所にカーソルがある
      if (k === 'left') { if (slot) S.curIdx = n - 1; else if (c === 0) S.side = { idx: 2 }; else S.curIdx = c - 1; }
      else if (k === 'right') { if (slot || c >= n - 1) S.side = { idx: 1 }; else S.curIdx = c + 1; }
      else S.curIdx = k === 'up' ? 0 : n - 1;
      S.dirty = true; S.partialKey = !S.side; return;
    }
    if (k === 'left' && S.mode === 'game' && s && s.row === 0 && s.idx === 0) { S.side = { idx: 2 }; return; } // いちばん左から、さらに左へ: 麻雀先生のボタン
    if (k === 'right' && S.mode === 'game' && ((!s && !r) || (s && s.row === 0 && s.idx === s.tiles.length - 1) || (s && s.row === 1 && s.idx === s.btns.length - 1) )) { S.side = { idx: 1 }; return; } // いちばん右から、さらに右へ: 操作の列へ
    if (s) {
      const tiles = s.tiles;
      if (k === 'left' || k === 'right') {
        const n = s.row === 0 ? tiles.length : s.btns.length; if (!n) return; s.idx = wrap(s.idx + (k === 'left' ? -1 : 1), n); if (s.row === 0) S.partialKey = true;
      } else if (k === 'up') { // ボタンがあるとき: どの牌からでも、上でボタン(リーチなど)へ。ないとき: 1枚目の牌へ
        if (s.row === 0 && s.btns.length) { s.back = s.idx; s.row = 1; const ri = s.btns.findIndex((b) => b.act === 'riichi'); s.idx = ri >= 0 ? ri : 0; }
        else if (s.row === 0) { s.idx = 0; S.partialKey = true; }
      }
      else if (k === 'down') { if (s.row === 1) { s.row = 0; s.idx = Math.min(s.back != null ? s.back : tiles.length - 1, tiles.length - 1); } else { s.idx = tiles.length - 1; S.partialKey = true; } } // 下: ボタンからは、もといた牌へ。牌の上では、いちばん右の牌(14枚目。まだ引いていなければ13枚目)へ
      else if (k === 'back' && s.row === 1) { s.row = 0; s.idx = Math.min(s.back != null ? s.back : tiles.length - 1, tiles.length - 1); } // 戻る: もといた牌へ
      else if (k === 'back' && s.rm) { s.rm = false; }
      else if (k === 'back' && s.row === 0) { openMenu(); }
      else if (k === 'ok') {
        if (s.row === 0) { const live = myTiles(s.p), h = live[s.idx] || tiles[s.idx]; if (h && allowed(s, h)) { const gp = s.p.drawn ? tiles.length - 1 : -1; S.curIdx = s.idx; S.pick = [handX(s.idx, s.idx === gp), HY - 8]; S.self = null; s.res({ act: s.rm ? 'riichi' : 'discard', tile: h }); } }
        else {
          const b = s.btns[s.idx];
          if (b.act === 'riichi') { s.rm = !s.rm; s.row = 0; const okI = tiles.findIndex((h) => allowed(s, h)); if (s.rm) { const d = tiles.indexOf(s.p.drawn); s.idx = d >= 0 && allowed(s, tiles[d]) ? d : Math.max(0, okI); } else s.idx = tiles.length - 1; }
          else { S.self = null; s.res(b.act === 'tsumo' ? { act: 'tsumo' } : { act: b.act, t: b.t }); }
        }
      }
    } else if (r) {
      if (r.pick) { // チーの組み合わせをえらぶ
        if (k === 'left' || k === 'right') r.pick.idx = wrap(r.pick.idx + (k === 'left' ? -1 : 1), r.chis.length);
        else if (k === 'back' || k === 'up') r.pick = null;
        else if (k === 'ok') { const c = r.chis[r.pick.idx]; S.react = null; r.res({ act: 'chi', use: c.use }); }
      }
      else if (k === 'left' || k === 'right') r.idx = Math.max(0, Math.min(r.btns.length - 1, r.idx + (k === 'left' ? -1 : 1))); // はしで止まる(右の列へは行かない。Edge版と同じ)
      else if (k === 'down') { if (r.btns[r.idx].pick) r.pick = { idx: 0 }; } // ▼ で、チーの牌えらびへ
      else if (k === 'ok') { const b = r.btns[r.idx]; if (b.pick) r.pick = { idx: 0 }; else { S.react = null; r.res(b.d); } }
    }
  };

  /* ---------- ゲームの頭脳から呼ばれる「ui」 ---------- */
  const ui = {
    render(g) { S.game = g; const ld = g.lastDiscard; if (!ld) S.lastD = null; else if (ld.d !== S.lastD) { S.lastD = ld.d; try { startFly(g, ld); } catch (e) { S.fly = null; } } dirty(); },
    sfx(name) { NSND.sfx(name); },
    speak(g, p, t) { S.bub[p.seat] = { name: p.name, text: t, until: __now() + 2300 }; dirty(); setTimeout(dirty, 2400); },
    banner(g, p, t) { S.banner = { text: t, t0: __now(), p, call: true }; dirty(); if (!g.fast) { NSND.call(p, t); NSND.sfx({ 'リーチ': 'riichi', 'ポン': 'call', 'チー': 'call', 'カン': 'kan', 'ロン': 'ron', 'ツモ': 'tsumo' }[t]); } return sleep(g.fast ? 0 : 1150).then(() => { S.banner = null; dirty(); }); },
    handStart(g) {
      S.curIdx = null; if (teacherOn() && !S.tmsgShown) { S.tmsgShown = 1; S.tmsg = { text: 'おまかせください。おすすめの牌に ★ をつけます', until: __now() + 6000 }; setTimeout(dirty, 6100); }
      S.game = g; NSND.game(g); NSND.sfx('slam');
      let vlen = 0; if (S.skipKyokuVoice) S.skipKyokuVoice = false; else { try { vlen = NSND.readKyoku(g) || 0; } catch (e) { /* ignore */ } }
      const sb = S.skipBanner; S.skipBanner = false;
      if (!sb) S.banner = { text: g.kyokuLabel(), t0: __now() };
      if (g.fast) { S.deal = null; dirty(); return sleep(300).then(() => { S.banner = null; dirty(); }); }
      const bms = sb ? 300 : vlen ? Math.max(2200, Math.round(vlen * 1000) + 700) : 900; // 読み上げが終わって、少し画面を見せてから、配牌
      S.deal = { t0: __now() + bms, step: 0, perm: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].sort(() => Math.random() - 0.5) };
      setTimeout(() => { S.banner = null; dirty(); }, bms); dirty();
      return sleep(bms + DEAL_END + 80);
    },
    padHand() {},
    dice(g, first) { if (g.fast) return Promise.resolve(null); return new Promise((done) => { const a = 1 + Math.floor(Math.random() * 6), b = 1 + Math.floor(Math.random() * 6); S.dice = { id: (S.diceSeq = (S.diceSeq || 0) + 1), a, b, target: (a + b - 1) % 4, started: false, rolling: false, settled: false, t0: __now(), t1: 0, done: (tg) => { g.dealer = tg; S.skipBanner = true; S.skipKyokuVoice = true; done(tg); } }; dirty(); }); },
    askSelf(g, p, opts, st) {
      return new Promise((res) => {
        const tiles = myTiles(p); const btns = [];
        if (opts.tsumo) btns.push({ label: 'ツモ', act: 'tsumo' });
        if (opts.riichi.length && !p.riichi) btns.push({ label: 'リーチ', act: 'riichi' });
        opts.ankan.forEach((t) => btns.push({ label: 'カン ' + MJ.tileName(t), act: 'ankan', t }));
        opts.kakan.forEach((t) => btns.push({ label: '加カン ' + MJ.tileName(t), act: 'kakan', t }));
        S.side = null; S.coach = null;
        S.hint = null; if (teacherOn() && !p.riichi && !g.fast) { try { S.hint = teacherAdvice(g, p, opts); } catch (e) { print('teacher err ' + e); } }
        S.self = { p, opts, st: st || {}, res, tiles, btns, rm: false, back: (S.curIdx != null && !p.riichi ? Math.min(S.curIdx, tiles.length - 1) : tiles.length - 1), row: (opts.tsumo || btns.some((b) => b.act === 'riichi')) ? 1 : 0, idx: opts.tsumo ? 0 : btns.some((b) => b.act === 'riichi') ? btns.findIndex((b) => b.act === 'riichi') : (S.curIdx != null && !p.riichi ? Math.min(S.curIdx, tiles.length - 1) : tiles.length - 1) };
        dirty();
      });
    },
    askReact(g, q, o) {
      S.reactArgs = { q, o };
      return new Promise((res) => {
        const btns = [];
        if (o.ron) btns.push({ label: 'ロン', d: { act: 'ron' } });
        if (o.kan) btns.push({ label: 'カン', d: { act: 'kan' } });
        if (o.pon) btns.push({ label: 'ポン', d: { act: 'pon' } });
        if (o.chi.length === 1) btns.push({ label: 'チー', d: { act: 'chi', use: o.chi[0].use } });
        else if (o.chi.length > 1) btns.push({ label: 'チー', sub: '▼ 牌をえらぶ', pick: true, d: { act: 'chi' } });
        btns.push({ label: '見送る', pass: true, d: { act: 'pass' } });
        S.side = null;
        S.react = { t0: __now(), res, btns, chis: o.chi, pick: null, idx: o.ron ? 0 : btns.length - 1, note: o.ronBlock ? 'フリテンです(ロンできません)' : '' };
        dirty();
      });
    },
    showResult(g, r) {
      S.bub = {}; S.banner = null;
      NSND.result(r.type === 'draw' ? 'draw' : r.wins.some((w) => w.winner.isHuman) ? 'win' : r.delta[0] < 0 ? 'lose' : 'calm');
      if (r.type !== 'win') { NSND.sfx('drawgame'); return new Promise((done) => { S.result = Object.assign({ done }, r, { done: () => { NSND.stopSpeak(); done(); } }); dirty(); }); }
      return (async () => { // 上がった人ごとに、役と点数の画面(読み上げつき)。そのあと、4人のじゅんいの画面
        const n = r.wins.length;
        for (let i = 0; i < n; i++) {
          if (g.stopped) return;
          try { NSND.readWin(g, { wins: [r.wins[i]] }); } catch (e) { /* ignore */ }
          await new Promise((done) => { S.result = Object.assign({}, r, { wins: [r.wins[i]], idx: i, total: n, done: () => { NSND.stopSpeak(); done(); } }); dirty(); });
        }
        if (g.stopped) return;
        await new Promise((done) => { S.rankP = { r, done: () => { S.rankP = null; done(); } }; dirty(); });
      })();
    },
    askSave(g) { return new Promise((res) => { S.saveP = { idx: 0, res, snap: g.snapshot() }; dirty(); }); },
    gameEnd(g, f) { NSND.sfx('end'); return new Promise((done) => { S.end = Object.assign({}, f, { done: () => { let rk = null; try { rk = MJ.Rank.record(g, f); } catch (e) { print('rank err ' + e); } S.rankScr = { rk, done }; dirty(); } }); }); },
  };

  function pickChars() {
    let ok = null; try { ok = MJ.Rank.unlockedIds(); } catch (e) { /* ignore */ } const pool = MJ.CHARS.filter((c) => c.id !== 0 && (!ok || !ok.length || ok.includes(c.id))); const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  }
  function stopGame() { // ゲームを途中でやめて、タイトルへ
    const g = S.game; if (!g) { S.mode = 'menu'; dirty(); return; }
    g.stopped = true; MJ.paused = false; S.tmsgShown = 0; S.side = S.coach = null;
    const s = S.self, r = S.react, rs = S.result, en = S.end, sp = S.saveP; if (S.rankP) { const q = S.rankP; S.rankP = null; q.done(); } if (S.rankScr) { const q = S.rankScr; S.rankScr = null; q.done(); }
    S.self = S.react = S.result = S.end = S.saveP = null;
    if (s) s.res({ act: 'discard', tile: s.p.hand[0] }); if (r) r.res({ act: 'pass' }); if (rs) rs.done(); if (en) en.done(); if (sp) sp.res();
    dirty();
  }
  /* 親が決まったあと: 「東一局!」「勝負!」(顔・文字・声)。そのあと、すぐ配牌へ */
  const startIntro = (g) => new Promise((res) => { if (g.resumed || g.fast) { res(); return; } S.intro = { t0: __now(), done: () => { S.skipBanner = true; res(); } }; NSND.sfx('slam'); setTimeout(() => NSND.sfx('slam'), 1700); dirty(); });
  async function startGame(sn) {
    S.mode = 'game'; dirty();
    const chars = sn && sn.chars ? sn.chars.map((id) => MJ.CHARS.find((c) => c.id === id)).filter(Boolean) : [];
    const g = new MJ.Game({ chars: chars.length === 3 ? chars : pickChars(), mode: 'free', length: sn && sn.length || MJ.RULES.length || 'east', ui, cpuDelay: __auto ? 40 : undefined });
    if (sn && chars.length === 3) { ['dealer', 'kyoku', 'honba', 'kyotaku', 'roundWind', 'handCount'].forEach((k) => { if (sn[k] != null) g[k] = sn[k]; }); sn.scores.forEach((sc, i) => { if (g.players[i]) g.players[i].score = sc; }); g.resumed = true; }
    g.players[0].coachType = 'balance'; // 麻雀先生は、バランス型
    S.game = g;
    try { await g.run(); } catch (e) { print('GAME ERR ' + (e && e.stack || e)); }
    S.game = null; S.mode = 'menu'; S.side = S.coach = null; S.menuIdx = 0; S.homeBot = false; NSND.home(); S.self = S.react = S.result = S.end = S.saveP = null; dirty();
    if (__auto) __quit();
  }
  const menuItems = () => ['つづける', 'タイトルにもどる'];

  /* ---------- メインループから ---------- */
  let nextAuto = 0, lastSave = 0, nextSide = 0, coachShots = 0;
  window.__frame = function (now) {
    __runTimers(now);
    if (__auto && globalThis.__teacherEnv && S.self && !S.side && !S.coach && now > nextSide) { nextSide = now + 3300; window.__key('right'); window.__key('ok'); setTimeout(() => window.__key('ok'), 1500); } // 試験用: 解説の窓を、ときどき開く
    if (__auto && now > nextAuto && !S.coach && !S.side) { nextAuto = now + 90; window.__key('ok'); }
    if (__lsDirty && now - lastSave > 1500) { lastSave = now; __lsDirty = false; try { __save(JSON.stringify(__ls)); } catch (e) { /* ignore */ } }
    /* 画面の入れかえ(ダブル/トリプルバッファ)で、古い絵が交互に出て点滅しないよう、変化のあとは3回続けて描く */
    if (pressing() || S.intro || S.dice || S.fly || (S.deal && now >= S.deal.t0 - 50) || (S.banner && now - (S.banner.t0 || 0) < 260)) S.dirty = true; // 動いている間は、描き続ける
    if (!S.dirty) return false;
    S.dirty = false; return true;
  };
  const perf = { t0: 0, n: 0, ms: 0, shown: '' };
  const drawBody = function () {
    // カーソルだけが動いたとき: 画面ぜんたいは描きなおさず、手牌のあたりだけ描く(キビキビ動かすため)
    if (S.partialKey && !(S.self && S.self.rm) && !S.full && S.mode === 'game' && S.game && S.fullDrawn && !S.result && !S.rankP && !S.end && !S.intro && !S.dice && !S.menuP && !S.soundP && !S.saveP && !(S.toast && S.toast.until > __now()) && !S.coach && !S.rankScr && !S.react && !S.banner && !S.fly && !S.deal && !pressing() && !S.side && !perfOn()) {
      S.vx = 0; S.vy = 0; gfx.view(0, 0); gfx.clip(0, 360, 720, 108); fill(0, 360, 720, 108, [14, 84, 52]); gfx.layer(1 - 1); drawHand(S.game); gfx.clip(); S.partialKey = false; return true;
    }
    S.partialKey = false; S.full = false; S.fullDrawn = true;
    if (S.mode === 'stats') { gfx.view(0, 0); drawStats(); return true; }
    const full = S.mode === 'title' || S.mode === 'menu' || S.mode === 'settings' || S.mode === 'rules';
    const inGame = !full && S.mode !== 'slots' && S.game && !S.result && !S.end && !S.rankP;
    if (full || inGame || S.result || S.rankP) { S.vx = 0; S.vy = 0; } else { S.vx = 56; S.vy = 20; }
    gfx.view(S.vx, S.vy);
    if (S.mode === 'title') drawTitle(); else if (S.mode === 'menu') drawHome(); else if (S.mode === 'settings') drawSettings(); else if (S.mode === 'rules') drawRules(); else if (S.mode === 'slots') { gfx.clear(14, 84, 52); drawSlots(); }
    else if (S.game) { gfx.clear(14, 84, 52); drawTable(S.game); if (inGame) { fill(720, 0, 112, 468, [28, 32, 34]); gfx.view(0, 20); drawSide(S.game); if (S.coach) drawCoach(); gfx.view(0, 0); } }
    if (S.rankP) drawRankP();
    if (S.result) { drawResult(S.result); if (__auto && globalThis.__shotDir) gfx.shot(__shotDir + '/res' + (++S.shotN) + '.bmp'); }
    if (__auto && globalThis.__shotDir && (S.react || (S.self && S.self.btns.length)) && S.shotR < 6) { gfx.shot(__shotDir + '/act' + (++S.shotR) + '.bmp'); }
    if (S.end) { drawEnd(S.end); if (__auto && globalThis.__shotDir) gfx.shot(__shotDir + '/end.bmp'); }
    if (S.coach && __auto && globalThis.__shotDir && coachShots < 6 && S.coach.cards && S.coach.cards.length) { gfx.view(0, 0); gfx.shot(__shotDir + '/coach' + (++coachShots) + '.bmp'); }
    if (S.rankScr) { drawRankScreen(); gfx.view(0, 0); return true; }
    if (S.intro && S.game) { S.vx = 0; S.vy = 0; gfx.view(0, 0); drawIntro(); return true; }
    if (S.dice && S.game) { S.vx = 0; S.vy = 0; gfx.view(0, 0); drawDice(); return true; }
    S.vx = 56; S.vy = 20; gfx.view(56, 20); // 以降の板(メニューなど)は、画面の中央に
    const toastOn = S.toast && S.toast.until > __now();
    if (S.saveP || toastOn) { // 保存の質問・セーブ中は、画面全体を黒で覆って卓を見せず、画面の中心に出す
      gfx.view(0, 0); fill(0, 0, SW, SH, [0, 0, 0], 245);
      gfx.view(56, 20);
      if (S.saveP) drawSaveQ();
      if (toastOn) { rrect(110, 187, 500, 54, 8, [0, 0, 0], 225); text(S.toast.text, 360, 200, 24, YEL, 1); }
    }
    gfx.view(S.vx, S.vy);
    if (S.menuP) drawDialog('メニュー', menuItems(), S.menuP.idx, '');
    if (S.soundP) drawSound();
    if (S.teachQ) drawTeachQ();
    if (S.playQ) drawDialog('麻雀をはじめます', ['つづきから(' + kyokuText(S.playQ.snap) + ')', 'はじめから'], S.playQ.idx, '');
    if (S.confirmQ) drawDialog('ゲームを おわりますか?', ['もどる', 'おわる(電源を切れます)'], S.confirmQ.idx, '');
    gfx.view(0, 0);
    return true;
  };
  window.__draw = function () {
    S.drawSeq = (S.drawSeq || 0) + 1;
    const t0 = __now(); const r = drawBody(); const dt = __now() - t0; perf.n++; perf.ms += dt;
    if (t0 - perf.t0 >= 1000) { perf.shown = '描 ' + perf.n + '回/秒  ' + (perf.ms / Math.max(1, perf.n)).toFixed(0) + 'ms'; perf.t0 = t0; perf.n = 0; perf.ms = 0; }
    if (perfOn()) { gfx.view(0, 0); fill(0, 0, 150, 18, [0, 0, 0], 170); text(perf.shown, 4, 2, 13, [120, 255, 160]); }
    return r;
  };
  NSND.home();
  print('ネイティブ版 準備できました');
})();
