/* ネイティブ版の画面と操作(試作)。ゲームの頭脳(game.js)が呼ぶ「ui」を、SDL2の描画で作る。
   画面は 720x428。キー: left/right/up/down/ok/back */
(function () {
  const MJ = window.MJ; const W = 720, H = 428, SW = 832, SH = 468; // W,H=卓の大きさ / SW,SH=画面全体(右に操作の列)
  const S = { mode: 'title', titleIdx: 0, setIdx: 0, confirmQ: null, game: null, dirty: true, bub: {}, banner: null, keep: 0, pressT: -9999, locked: false, lay: [], teachQ: null, homeBot: false, homeBotIdx: 0, playQ: null, intro: null, dice: null, statsPg: -1, rankScr: null, side: null, coach: null, vx: 0, vy: 0, hint: null, waitKey: '', waitInfo: null, fly: null, deal: null, pick: null, lastD: null, saveP: null, menuP: null, slots: [], hid: [], shotN: 0, shotR: 0, self: null, react: null, result: null, end: null, menuIdx: 0, ui: null };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const dirty = () => { S.dirty = true; };
  const WIND = ['東', '南', '西', '北'];
  try { MJ.loadRules && MJ.loadRules(); } catch (e) { /* ignore */ }
  MJ.MEMO_CAP = 30000; // 計算の記憶表の上限(メモリを食いすぎないように)
  if (globalThis.__teacherEnv) { try { localStorage.setItem('mj_teacher', globalThis.__teacherEnv); } catch (e) { /* ignore */ } } // 例: MJ_TEACHER=1 ./mj .
  MJ.AI_BUDGET = 0.4; // Pi Zeroでは、CPUの思考の時間上限を縮める(考えている間、画面と入力が止まるため)
  if (globalThis.__cpuEnv && MJ.CPU_SPEEDS.includes(globalThis.__cpuEnv)) MJ.setCpuSpeed(globalThis.__cpuEnv); // 例: MJ_CPU=fast ./mj .


  /* ---------- セーブ(手動・最新から5件) ---------- */
  const wrap = (i, n) => (i + n) % n;
  const pressing = () => __now() - S.pressT < 170;
  const later = (fn) => { S.pressT = __now(); S.locked = true; dirty(); setTimeout(() => { S.locked = false; fn(); dirty(); }, 170); }; // 押したボタンが光ってから、次へ
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
  function rrect(x, y, w, h, r, c, a) { // 角の丸い四角(細い線を重ねる)
    r = Math.min(r, Math.floor(h / 2), Math.floor(w / 2));
    for (let dy = 0; dy < r; dy++) { const d = r - dy - 0.5, inset = r - Math.floor(Math.sqrt(Math.max(0, r * r - d * d))); fill(x + inset, y + dy, w - 2 * inset, 1, c, a); fill(x + inset, y + h - 1 - dy, w - 2 * inset, 1, c, a); }
    fill(x, y + r, w, h - 2 * r, c, a);
  }
  function back(x, y, w, h, side) { // 裏向きの牌(Edge版と同じ: 青い面と、クリーム色の縁)
    fill(x, y, w, h, [243, 236, 212]);
    if (side === 'l') fill(x, y, Math.round(w * 0.72), h, [74, 143, 224]); else if (side === 'r') fill(x + w - Math.round(w * 0.72), y, Math.round(w * 0.72), h, [74, 143, 224]); else fill(x, y, w, Math.round(h * 0.72), [74, 143, 224]);
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
  function drawBar(g, p, x, y, w, h, rot) {
    panel(x, y, w, h, 9, BAR, [225, 225, 215], 2, 240);
    const parts = barPieces(g, p);
    if (!rot) { let cx = x + 10; parts.forEach((q) => { text(q.s, cx, y + (h - q.sz) / 2 - 2, q.sz, q.c); cx += gfx.measure(q.s, q.sz) + 12; }); return; }
    let cy = y + 10; const cxm = x + w / 2;
    parts.forEach((q) => { const tw = gfx.measure(q.s, q.sz); if (rot === 90) { gfx.textRot(q.s, Math.round(cxm), Math.round(cy + tw / 2), q.sz, q.c[0], q.c[1], q.c[2], 90); cy += tw + 12; } else { /* 270: 下から上へ */ gfx.textRot(q.s, Math.round(cxm), Math.round(y + h - 10 - (cy - y - 10) - tw / 2), q.sz, q.c[0], q.c[1], q.c[2], 270); cy += tw + 12; } });
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
        if (m.kind === 'ankan' && (i === 0 || i === 3)) back(bx, by, bw, bh);
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
    const p = g.players[0]; const hand = p.hand.filter((h) => h !== p.drawn);
    if (hand.length % 3 !== 1) return null;
    const key = hand.map((h) => h.id).join(',') + '|' + p.melds.length + '|' + g.players.map((q) => q.discards.length).join(',');
    if (key === S.waitKey) return S.waitInfo; S.waitKey = key; S.waitInfo = null;
    const c = MJ.toCounts(hand); if (MJ.shanten(c, p.melds.length) !== 0) return null;
    const ws = MJ.waits(c.slice(), p.melds.length); if (!ws.length) return null;
    const seen = Array(34).fill(0); hand.forEach((h) => seen[h.t]++); if (p.drawn) seen[p.drawn.t]++;
    g.players.forEach((q) => { q.discards.forEach((d) => { if (!d.called) seen[d.tile.t]++; }); q.melds.forEach((m) => m.tiles.forEach((h) => seen[h.t]++)); });
    g.doraInd.forEach((d) => seen[d.t]++);
    S.waitInfo = ws.slice(0, 5).map((t) => ({ t, left: Math.max(0, 4 - seen[t]) })); return S.waitInfo;
  }
  /* ---------- 右の操作の列(Edge版と同じ並び): MENU / 局 / あたり牌 / 解説 / 麻雀先生 ---------- */
  const SIDE_ORDER = [0, 3, 1, 2]; // 上から: MENU(と音) / 解説 / 麻雀先生
  function sbtn(x, y, w, h, c1, c2, lines, focus, sz) {
    if (focus) rrect(x - 3, y - 3, w + 6, h + 6, 6, [255, 255, 255]); rrect(x, y, w, h, 4, c2); rrect(x, y, w, h - 3, 4, c1);
    lines.forEach((l, i) => text(l, x + w / 2, y + (h - lines.length * (sz + 3)) / 2 + i * (sz + 3), sz, WHITE, 1));
  }
  function drawSide(g) {
    const f = S.side ? S.side.idx : -1;
    sbtn(726, 6, 64, 32, [235, 120, 30], [160, 70, 10], [''], f === 0, 13); text('MENU', 762, 14, 13, WHITE, 1); [0, 1, 2].forEach((i) => fill(731, 15 + i * 5, 10, 2, WHITE));
    sbtn(796, 6, 30, 32, [50, 90, 160], [25, 50, 100], [''], f === 3, 13); fill(803, 17, 4, 10, WHITE); fill(807, 14, 3, 16, WHITE); fill(810, 11, 3, 22, WHITE); fill(816, 17, 2, 10, WHITE);
    { const lb = g.kyokuLabel().split(' '); text(lb[0], 776, 46, 22, WHITE, 1); text((lb[1] ? lb[1] + ' ' : '') + ({ single: '一局戦', south: '東南戦' }[g.length] || '東風戦'), 776, 72, 12, GREY, 1); }
    if (teacherOn()) {
      const w = waitInfoOf(g);
      if (w) { panel(726, 94, 100, 40 + Math.ceil(w.length / 3) * 58, 10, [6, 44, 26], [255, 220, 40], 2, 235); text('あたり牌', 776, 98, 14, YEL, 1);
        w.forEach((x, i) => { const tx = 731 + (i % 3) * 32, ty = 118 + Math.floor(i / 3) * 58; tile(x.t, tx, ty, 28, 38); text('あと' + x.left, tx + 14, ty + 40, 11, WHITE, 1); }); }
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
    const h = S.hint, s = S.self; if ((!h || !s || s.row !== 0) && S.tmsg && __now() < S.tmsg.until) { panel(6, 304, 430, 46, 10, [6, 44, 26], [255, 220, 40], 2, 240); text('麻雀先生', 14, 306, 14, YEL); text(S.tmsg.text, 14, 325, 17, WHITE); return; }
    if (!h || !s || s.row !== 0) return;
    panel(6, 304, 430, 46, 10, [6, 44, 26], [255, 220, 40], 2, 240);
    text('★ おすすめ: ' + MJ.tileName(h.t) + (h.riichi ? ' を切ってリーチ' : ' を切る'), 14, 306, 17, YEL);
    text((h.sh === 0 ? 'テンパイ' : 'テンパイまであと' + h.sh + '歩') + ' 受け入れ' + h.n + '枚  ' + (h.label || ''), 14, 327, 14, WHITE);
  }

  /* ---------- 軽い動き(牌が河へ飛ぶ・配牌・札の拡大) ---------- */
  function startFly(g, ld) {
    if (g.fast || ld.by == null) return;
    const p = g.players[ld.by], i = p.discards.indexOf(ld.d); if (i < 0) return;
    const q = riverPos(ld.by, i);
    const from = ld.by === 0 && S.pick ? S.pick : ({ 2: [330, 20], 3: [10, 150], 1: [690, 150] }[ld.by] || [360, 300]);
    S.fly = { d: ld.d, t: ld.tile.t, red: ld.tile.red, from, to: [q.x, q.y], rot: q.rot, bw: q.bw, bh: q.bh, t0: __now(), dur: 190 }; S.pick = null;
  }
  function drawFly() {
    const f = S.fly; if (!f) return; const k = Math.min(1, (__now() - f.t0) / f.dur), e = 1 - (1 - k) * (1 - k);
    const x = f.from[0] + (f.to[0] - f.from[0]) * e, y = f.from[1] + (f.to[1] - f.from[1]) * e;
    const w = Math.round(HW + (RW - HW) * e), h = Math.round(HH + (RH - HH) * e); tileR(f.t, Math.round(x), Math.round(y), w, h, f.red, false, f.rot); // 置かれる向きのまま飛ぶ
  }
  /* 配牌: 4牌ずつ配られ、最後に「チャッ」と並び替わる */
  const DEAL_AT = [0.04, 0.24, 0.44, 0.64];
  function dealState() {
    const d = S.deal; if (!d) return { n: 99, sorted: true };
    const k = (__now() - d.t0) / d.dur; if (k >= 1) { S.deal = null; return { n: 99, sorted: true }; }
    let n = 0; DEAL_AT.forEach((a, i) => { if (k >= a) { n = i < 3 ? 4 * (i + 1) : 13; if (d.step < i + 1) { d.step = i + 1; NSND.sfx(i === 3 ? 'deal1' : 'deal4', 0.5); } } });
    const sorted = k >= 0.84; if (sorted && !d.sortedSfx) { d.sortedSfx = 1; NSND.sfx('sort1', 0.6); }
    return { n, sorted };
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
    const okey = [DS.n, g.live.length, g.kyotaku, g.kyokuLabel(), (g.doraInd || []).map((d) => d.id).join(','), P.map((p) => p.hand.length + ':' + p.score + ':' + (p.riichi ? 1 : 0) + ':' + p.melds.length + ':' + p.melds.map((m) => m.tiles.length).join('') + ':' + g.seatWindOf(p)).join('|')].join('#');
    cached(1, okey, () => {
    // 伏せた手牌(小さな牌)
    const nHand = (p) => Math.min(p.hand.length, DS.n);
    for (let i = 0; i < nHand(P[2]); i++) back(265 + i * 17, 23, 16, 24);
    for (let i = 0; i < nHand(P[3]); i++) back(3, 66 + i * 17, 24, 16, 'l');
    for (let i = 0; i < nHand(P[1]); i++) back(692, 66 + i * 17, 24, 16, 'r');
    // 副露
    drawMelds(P[2], 520, 34, 16, 22); drawMelds(P[3], 3, 312 - meldWH(P[3], 16, 22), 16, 22); drawMelds(P[1], 694, 312 - meldWH(P[1], 16, 22), 16, 22);
    // 名札(横長の板)
    drawBar(g, P[2], 190, 3, 322, 28, 0); drawBar(g, P[3], 35, 21, 27, 280, 90); drawBar(g, P[1], 643, 21, 27, 280, 270); drawBar(g, P[0], 501, 317, 221, 34, 0);
    // 中央の情報
    panel(218, 163, 281, 101, 14, [6, 44, 26], [90, 140, 110], 2);
    const lb = g.kyokuLabel().split(' '); text(lb[0], 234, 172, 24, WHITE); text('供託 ' + g.kyotaku + (lb[1] ? '  ' + lb[1] : ''), 234, 204, 12, GREY);
    text('残り', 234, 226, 14, WHITE); text(String(g.live.length), 262, 220, 34, YEL); text('枚', 316, 232, 14, WHITE);
    { const WX = 356, WY = 188, WS = 128 / 219; gfx.image('img/wall.webp', WX, WY, 128, Math.round(88 * WS), 255); // 王牌の絵の上に、ドラ表示牌を重ねる
      (g.doraInd || []).slice(0, 5).forEach((d, k) => { if (d) tile(d.t, WX + Math.round((3.4 + (4 - k) * 30.1) * WS), WY + Math.round(4.4 * WS), Math.round(29.2 * WS), Math.round(39.4 * WS), d.red); }); }
    });
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
      const bn = S.banner, k = Math.min(1, (__now() - bn.t0) / 160), sz = 84, col = bn.text === 'リーチ' ? [255, 91, 138] : (bn.text === 'ロン' || bn.text === 'ツモ') ? [255, 123, 90] : [196, 139, 255];
      face(bn.p, 215, 96, 108, 108); frame(214, 95, 110, 110, [240, 210, 120], 2);
      { const by = 124 - Math.round((sz - 84) / 2); text(bn.text, 345, by + 7, sz, [0, 0, 0], 0); [[-4, 0], [4, 0], [0, -4], [0, 4], [-3, -3], [3, -3], [-3, 3], [3, 3]].forEach((d) => text(bn.text, 340 + d[0], by + d[1], sz, [255, 255, 255])); }
      text(bn.text, 340, 124 - Math.round((sz - 84) / 2), sz, col);
    } else if (S.banner) { const k = Math.min(1, (__now() - (S.banner.t0 || 0)) / 180), sz = k < 0.34 ? 78 : k < 0.67 ? 66 : 56; fill(0, 200, W, 80, [0, 0, 0], 170); text(S.banner.text, 360, 240 - Math.round(sz * 0.55), sz, YEL, 1); }
  }
  function myTiles(p) { const hs = p.hand.filter((h) => h !== p.drawn); if (p.drawn) hs.push(p.drawn); return hs; }
  function allowed(s, h) { const p = s.p; if (p.riichi) return h === p.drawn; if (s.opts.forbid.includes(h.t)) return false; if (s.rm) return s.opts.riichi.includes(h.t); return true; }
  function drawHand(g) {
    const p = g.players[0]; const s = S.self; const hs = myTiles(p);
    const gapAt = p.drawn ? hs.length - 1 : -1; const DS = dealState(), shown = Math.min(hs.length, DS.n);
    let order = hs; if (!DS.sorted && S.deal && S.deal.perm) order = S.deal.perm.filter((j) => j < hs.length).map((j) => hs[j]); // 配られている間は、並び替える前の順で見せる
    order.forEach((h, i) => {
      if (i >= shown) return;
      const x = handX(i, i === gapAt); let y = HY;
      const sel = s ? (!S.side && s.row === 0 && s.idx === i) : (!S.react && !S.side && S.mode === 'game' && !S.deal && S.curIdx != null && Math.min(S.curIdx, hs.length - 1) === i);
      const dim = s ? !allowed(s, h) : false;
      if (sel) y -= 8;
      tile(h.t, x, y, HW, HH, h.red, dim);
      if (teacherOn() && S.hint && S.hint.tile && S.hint.tile.t === h.t && s && s.row === 0) text('★', x + 22, y - 20, 16, YEL, 1);
      if (sel) frame(x - 1, y - 1, HW + 2, HH + 2, YEL, 3);
    });
    drawMelds(p, 713 - meldWH(p, 31, 40), 398, 31, 40);
    if (s) {
      const bw = 92; let bx = 8;
      s.btns.forEach((b, i) => { button(bx, 354, bw, 26, b.label, s.row === 1 && s.idx === i); bx += bw + 8; });
      if (s.rm) text('リーチする牌をえらんで決定', 8 + s.btns.length * 100 + 4, 359, 14, YEL);
    }
    if (S.react) {
      const r = S.react; const ld = g.lastDiscard; const who = ld ? g.players[ld.by].name : '';
      if (ld) { tile(ld.tile.t, 8, 352, 22, 29, ld.tile.red); text(who + ' が ' + MJ.tileName(ld.tile.t), 36, 358, 15, WHITE); }
      let bx = 250; r.btns.forEach((b, i) => { button(bx, 354, b.w || 92, 26, b.label, r.idx === i); bx += (b.w || 92) + 8; });
      if (r.note) text(r.note, 8, 334, 14, YEL);
    }
  }
  function drawTitle() {
    gfx.clear(14, 84, 52);
    gfx.image('img/title_art.webp', 0, 0, SW, SH, 255); // タイトルの文字は、絵に入っている
    const f = S.titleIdx, pr = pressing();
    const sc = (i) => (i === f ? (pr ? 1.12 : 1.06) : 1); // 選んでいるボタンは、少し大きく(押すと、さらに大きく)
    const img = (path, x, y, w, h, i) => { const k = sc(i), W2 = Math.round(w * k), H2 = Math.round(h * k); gfx.image(path, Math.round(x - (W2 - w) / 2), Math.round(y - (H2 - h) / 2), W2, H2, 255); };
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
    if (sel) rrect(x - 4, y - 4, w + 8, h + 8, 14, pressing() ? [255, 246, 170] : [255, 255, 255]);
    rrect(x, y, w, h, 11, [201, 154, 61]); rrect(x + 2, y + 2, w - 4, h - 4, 9, sel ? [120, 84, 36] : [74, 52, 24]);
    text(label, x + w / 2, y + (h - (sz || 18)) / 2, sz || 18, sel ? [255, 245, 200] : [243, 227, 176], 1);
  }
  function drawHome() {
    gfx.clear(14, 84, 52);
    gfx.image('img/menu_bg.webp', 0, 0, SW, SH, 255);
    gfx.image('img/logo.webp', 52, 22, 244, 139, 255);
    rrect(21, 165, 292, 170, 16, [10, 18, 32], 150); // 左の説明: 半透明の黒い囲い(Edge版と同じ)
    const ot = (s, x, y, sz, c) => { [[-1, 1], [1, 1], [0, 2]].forEach((d) => text(s, x + d[0], y + d[1], sz, [0, 0, 0], 0)); text(s, x, y, sz, c, 0); };
    ot('メニューを', 67, 178, 38, WHITE); ot('選択', 67, 226, 42, [255, 225, 74]); { const w1 = gfx.measure('選択', 42); ot('して', 67 + w1 + 2, 229, 38, WHITE); } ot('ください。', 67, 278, 38, WHITE);
    const items = homeItems(); const IY = [58, 145, 227, 309];
    items.forEach((it, i) => { const sel = !it.off && !S.homeBot && S.menuIdx === i; if (sel) btnR(370, IY[i] - (i ? 4 : 0), 433, 67, 16, true, false, it.label, 34, true); else btnR(383, IY[i], 408, 58, 16, false, it.off, it.label, 32, false); });
    const BW = [[150, 230]];
    HOME_BOTTOM.forEach((b, i) => {
      const row = i >> 1, col = i & 1, lab = b.k === 'rank' ? '成績・' + MJ.Rank.label() : b.k === 'teacher' ? teacherLabel() : b.label, sel = S.homeBot && S.homeBotIdx === i;
      brownBtn(19 + (col ? BW[row][0] + 12 : 0), 398, BW[row][col], 46, lab, sel, 21);
    });
  }
  const swapOn = () => { try { const v = localStorage.getItem('mj_swapab'); return v === null ? true : v === '1'; } catch (e) { return true; } };
  try { __swapab(swapOn() ? 1 : 0); } catch (e) { /* ignore */ }
  const perfOn = () => { try { return localStorage.getItem('mj_perf') === '1' || !!globalThis.__perfEnv; } catch (e) { return false; } };
  const SETS = [
    { k: 'bgm', label: 'BGMの大きさ' }, { k: 'sfx', label: '効果音の大きさ' }, { k: 'voice', label: '声の大きさ' },
    { k: 'bgmon', label: 'BGM' }, { k: 'speed', label: 'CPUの速さ' }, { k: 'teacher', label: '麻雀先生' }, { k: 'swap', label: '決定ボタンの入れ替え' }, { k: 'perf', label: '速度の表示(開発用)' }, { k: 'back', label: 'もどる' },
  ];
  function drawSettings() {
    gfx.clear(14, 84, 52); gfx.image('img/menu_bg.webp', 0, 0, SW, SH, 255); fill(0, 0, SW, SH, [0, 0, 0], 120);
    text('設定', SW / 2, 8, 30, YEL, 1);
    SETS.forEach((s, i) => {
      const y = 48 + i * 46, sel = S.setIdx === i; panel(110, y, 612, 40, 10, sel ? YEL : WHITE, sel ? [160, 110, 0] : [110, 110, 110], sel ? 4 : 2);
      text(s.label, 130, y + 8, 22, BLACK);
      if (s.k === 'bgm' || s.k === 'sfx' || s.k === 'voice') { const lv = NSND.getLevel(s.k); for (let j = 0; j < 10; j++) fill(380 + j * 30, y + 9, 24, 22, j < lv ? [30, 130, 80] : [200, 200, 195]); text(String(lv), 702, y + 8, 20, BLACK, 2); }
      else if (s.k === 'bgmon') text(NSND.on ? 'オン' : 'オフ', 520, y + 8, 22, BLACK, 1);
      else if (s.k === 'speed') text(MJ.CPU_SPEED_JP[MJ.cpuSpeed()], 520, y + 8, 22, BLACK, 1);
      else if (s.k === 'teacher') text(teacherOn() ? 'あり' : 'なし', 520, y + 8, 22, BLACK, 1);
      else if (s.k === 'perf') text(perfOn() ? 'オン' : 'オフ', 520, y + 8, 22, BLACK, 1);
      else if (s.k === 'swap') text(swapOn() ? '入れ替え' : 'ふつう', 520, y + 8, 22, BLACK, 1);
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
    rrect(x - 2, y - 2, w + 4, h + 4, 14, [240, 200, 60]); rrect(x, y, w, h, 12, [14, 20, 32]);
    text(name, cx, y + 6, 21, WHITE, 1); if (lv) stars(cx, y + 40, Math.min(5, lv));
  }
  function stage() { // 緑のしずかな背景(中央が少し明るい)
    gfx.clear(16, 66, 50);
    [[0.05, 0.05, 0.9, 0.9, 14], [0.12, 0.12, 0.76, 0.76, 14], [0.2, 0.2, 0.6, 0.6, 14], [0.3, 0.3, 0.4, 0.4, 14]].forEach((r) => fill(Math.round(SW * r[0]), Math.round(SH * r[1]), Math.round(SW * r[2]), Math.round(SH * r[3]), [60, 150, 110], r[4]));
  }
  function drawIntro() {
    const it = S.intro, g = S.game, t = __now() - it.t0; stage();
    const P = g.players, st = (p) => (p.char && p.char.level ? p.char.level : 0), wf = (x, y, z) => { rrect(x - 9, y - 9, z + 18, z + 18, 4, [150, 100, 46]); rrect(x - 6, y - 6, z + 12, z + 12, 3, [205, 150, 80]); rrect(x - 3, y - 3, z + 6, z + 6, 2, [70, 110, 85]); };
    if (t > 0) { wf(360, 18, 112); face(P[2], 360, 18, 112, 112); plate(416, 140, P[2].name, st(P[2])); }
    if (t > 350) { wf(70, 150, 112); face(P[3], 70, 150, 112, 112); plate(126, 268, P[3].name, st(P[3])); }
    if (t > 700) { wf(650, 150, 112); face(P[1], 650, 150, 112, 112); plate(706, 268, P[1].name, st(P[1])); }
    if (t > 1000) { try { gfx.imageTop('img/you/' + String(MJ.youIndex()).padStart(2, '0') + '.webp', 60, 336, 92, 92); } catch (e) { /* ignore */ } plate(204, 366, 'あなた', 0); }
    if (t > 1200 && !it.v1) { it.v1 = 1; S.skipKyokuVoice = true; try { NSND.readKyoku(g); } catch (e) { /* ignore */ } }
    if (t >= 2400 && !it.v2) { it.v2 = 1; try { snd.play('audio/voice/intro_w2.mp3', 0.9); } catch (e) { /* ignore */ } }
    if (t > 1200 && t < 2400) { const k = Math.min(1, (t - 1200) / 160), sz = k < 0.5 ? 96 : 78; fill(192, 190, 448, 90, [0, 0, 0], 170); text(g.kyokuLabel().split(' ')[0], SW / 2, 235 - sz / 2, sz, YEL, 1); }
    if (t >= 2400 && t < 3500) { const k = Math.min(1, (t - 2400) / 160), sz = k < 0.5 ? 110 : 90; fill(192, 180, 448, 110, [0, 0, 0], 170); [[-3, 0], [3, 0], [0, -3], [0, 3]].forEach((d) => text('勝負!', SW / 2 + d[0], 235 - sz / 2 + d[1], sz, [255, 255, 255], 1)); text('勝負!', SW / 2, 235 - sz / 2, sz, [225, 40, 30], 1); }
    if (t > 1000) shotOnce('intro1'); if (t > 1900) shotOnce('intro2'); if (t > 2900) shotOnce('intro3');
    if (t >= 3500) { S.intro = null; it.done(); }
  }
  const PIP = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function drawDie(x, y, v, s) { // 平らなサイコロ
    s = s || 72; fill(x + 3, y + 5, s, s, [0, 0, 0], 80); fill(x, y, s, s, [250, 248, 240]); frame(x, y, s, s, [120, 120, 110], 2);
    const u = s / 3.2, pr = Math.max(3, Math.round(s / 13));
    (PIP[v] || []).forEach((i) => { const cx = x + Math.round(s / 2 + ((i % 3) - 1) * u * 0.9), cy = y + Math.round(s / 2 + (Math.floor(i / 3) - 1) * u * 0.9); fill(cx - pr, cy - pr, pr * 2, pr * 2, v === 1 ? [220, 40, 40] : [30, 30, 30]); });
  }
  const DPOS = { 2: [SW / 2 - 44, 8], 3: [66, 150], 1: [SW - 154, 150], 0: [SW / 2 - 44, 330] };
  function diceSeat(p, s, hi, wind) { // サイコロの画面の、4人の顔(大きく)と名前
    const x = DPOS[s][0], y = DPOS[s][1], fs = 88; if (hi) { rrect(x - 12, y - 12, fs + 24, fs + 24, 14, [255, 120, 40]); rrect(x - 8, y - 8, fs + 16, fs + 16, 10, [255, 230, 80]); } face(p, x, y, fs, fs); frame(x - 1, y - 1, fs + 2, fs + 2, hi ? [255, 255, 255] : [240, 210, 120], hi ? 3 : 2);
    plate(x + fs / 2, y + fs + 6, p.name, 0);
    if (wind) text(wind, x - 28, y + 28, 38, wind === '東' ? RED : YEL, 1);
  }
  function drawDice() {
    const d = S.dice, g = S.game, now = __now(); stage();
    if (!d.started && now - d.t0 > 600) { d.started = true; d.rolling = true; d.t0 = now; NSND.sfx('deal4'); }
    const total = d.a + d.b, cStart = d.t1 + 700, cStep = 380, cEnd = cStart + total * cStep;
    if (d.settled && now > cEnd + 1100 && !d.fin) { d.fin = true; const r = S.dice; S.dice = null; r.done(d.target); }
    const P = g.players, counting = d.settled && now >= cStart && now < cEnd, done = d.settled && now >= cEnd;
    const step = counting ? Math.floor((now - cStart) / cStep) + 1 : (done ? total : 0), hiSeat = d.settled && step > 0 ? (step - 1) % 4 : -1;
    if (counting && d._lastStep !== step) { d._lastStep = step; NSND.sfx('select', 0.5); }
    [2, 3, 1, 0].forEach((s) => diceSeat(P[s], s, s === hiSeat, done ? ['東', '南', '西', '北'][(s - d.target + 4) % 4] : ''));
    let va = d.started ? d.a : 1, vb = d.started ? d.b : 6; const T = [[350, 196], [446, 184]];
    const SEG = [[0.34, 0.62, 0.82, 1.0], [0.38, 0.66, 0.85, 1.0]], AMP = [[70, 34, 14, 5], [62, 30, 12, 4]];
    const sz = [72, 72], pos = [T[0].slice(), T[1].slice()];
    if (d.started && d.rolling) {
      const k = (now - d.t0) / 1500;
      if (k >= 1) { d.rolling = false; d.settled = true; d.t1 = now; NSND.sfx('slam'); }
      else {
        const f = Math.floor((now - d.t0) / 65); if (k < 0.8) { va = 1 + (f * 5 + 3) % 6; vb = 1 + (f * 3 + 1) % 6; }
        [0, 1].forEach((i) => { // 右から転がってきて、手前から奥へ(だんだん小さく)。とん、とん、とんとん
          const s = SEG[i], a = AMP[i]; let seg = 0; while (seg < 3 && k > s[seg]) seg++;
          const t0 = seg ? s[seg - 1] : 0, u = (k - t0) / (s[seg] - t0), h = a[seg] * 4 * u * (1 - u) * (seg === 0 ? 1.15 : 1);
          if (seg !== d['_lastSeg' + i]) { if (seg > 0) NSND.sfx('discard', 0.35); d['_lastSeg' + i] = seg; }
          const e = 1 - Math.pow(1 - k, 1.7);
          sz[i] = 72;
          pos[i] = [Math.round(T[i][0] + (800 - T[i][0]) * (1 - e) - (i ? 0 : 20) * (1 - e)), Math.round(T[i][1] + (i ? 60 : 90) * (1 - e) - h)];
        });
      }
    }
    pos.forEach((p, i) => drawDie(p[0], p[1], i ? vb : va, sz[i]));
    rrect(190, 290, 452, 40, 10, [0, 0, 0], 190);
    if (!d.started) text('サイコロを振ります', SW / 2, 296, 22, YEL, 1);
    else if (d.rolling) text('…', SW / 2, 296, 22, WHITE, 1);
    else if (!done) text('合計 ' + total + ' …  あなたから 左回りに 数えます', SW / 2, 298, 19, WHITE, 1);
    else text(P[d.target].name + ' が 東家(親)です', SW / 2, 296, 22, YEL, 1);
    if (d.settled && __now() - d.t1 > 100) shotOnce('dice2'); if (d.rolling && now - d.t0 > 400) shotOnce('dice1');
    if (d.settled) dirty();
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
  function drawResult(r) {
    const g = S.game; stage(); rrect(40, 12, 752, 444, 18, [240, 200, 60]); rrect(43, 15, 746, 438, 16, [10, 38, 30]);
    if (r.type === 'win') {
      const w = r.wins[0], res = w.res, v = w.view;
      face(w.winner, 58, 24, 48, 48); frame(57, 23, 50, 50, [240, 210, 120], 2);
      text(w.winner.name, 120, 28, 30, WHITE); { const nw = gfx.measure(w.winner.name, 30); rrect(120 + nw + 14, 30, 84, 34, 10, w.tsumo ? [60, 130, 200] : [210, 60, 50]); text(w.tsumo ? 'ツモ' : 'ロン', 120 + nw + 56, 35, 22, WHITE, 1); }
      if (r.wins.length > 1) text('ほか ' + r.wins.slice(1).map((x) => x.winner.name).join('・') + ' もロン', 760, 36, 15, GREY, 2);
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
      r.tenpai.forEach((t, i) => { const p = g.players[i]; rrect(150 + (i % 2) * 280, 110 + Math.floor(i / 2) * 70, 250, 56, 12, [30, 70, 56]); text(p.name, 168 + (i % 2) * 280, 118 + Math.floor(i / 2) * 70, 22, WHITE); text(t ? 'テンパイ' : 'ノーテン', 380 + (i % 2) * 280, 120 + Math.floor(i / 2) * 70, 20, t ? YEL : GREY, 2); });
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
    rrect(x - 2, y - 2, w + 4, h + 4, 14, [240, 200, 60]); rrect(x, y, w, h, 12, [22, 64, 50]);
    gfx.image('img/teacher/t14.webp', x + 24, y + 10, 98, 100, 255);
    text('麻雀先生を', x + 140, y + 24, 30, WHITE); text('つけますか?', x + 140, y + 64, 30, WHITE);
    const labs = ['つけない', '麻雀先生をつける', '◀ もどる'], bws = [120, 176, 112]; let bx = x + 12;
    labs.forEach((l, i) => { const sel = S.teachQ.idx === i; if (sel) { rrect(bx - 3, y + 128, bws[i] + 6, 50, 14, [30, 30, 30]); rrect(bx - 1, y + 130, bws[i] + 2, 46, 12, [255, 255, 255]); } rrect(bx + 1, y + 132, bws[i] - 2, 42, 10, sel ? (pressing() ? [255, 246, 170] : [253, 213, 63]) : [245, 247, 244]); text(l, bx + bws[i] / 2, y + 143, 17, BLACK, 1); bx += bws[i] + 12; });
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
    if (k === 'menu' && !S.menuP) { S.menuP = { idx: 0 }; return; } // スタート+セレクト長押し
    if (S.menuP) {
      const items = menuItems();
      if (k === 'up' || k === 'down') S.menuP.idx = wrap(S.menuP.idx + (k === 'up' ? -1 : 1), items.length);
      else if (k === 'back') S.menuP = null;
      else if (k === 'ok') { const it = items[S.menuP.idx]; if (it.indexOf('CPUの速さ') === 0) { MJ.cycleCpuSpeed(); return; } if (it.indexOf('麻雀先生') === 0) { toggleTeacher(); return; } S.menuP = null; if (it === 'おわる(電源を切れます)') __quit(); else if (it === 'タイトルにもどる') stopGame(); }
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
    if (S.intro) { if (k === 'ok' && !__auto) S.intro.t0 -= 3600; return; }
    if (S.dice) {
      const d = S.dice;
      if (k === 'ok' && d.settled) { const r = S.dice; S.dice = null; r.done(d.target); } // (自動で進む。決定ボタンで、早く進めることもできる)
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
      else if (k === 'ok') { if (S.titleIdx === 0) later(() => { S.mode = 'menu'; S.homeBot = false; S.menuIdx = firstOn(homeItems(), 0, 1); }); else if (S.titleIdx === 1) { NSND.toggle(); if (NSND.on) NSND.home(); } else S.confirmQ = { idx: 0 }; }
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
        else if (k === 'up' || k === 'down') { /* 何もしない */ }
        else if (k === 'back') S.mode = 'title';
        else if (k === 'ok') { const b = HOME_BOTTOM[S.homeBotIdx].k; later(() => { if (b === 'exit') S.confirmQ = { idx: 0 }; else if (b === 'rank') S.rankScr = { rk: null, done: () => { S.mode = 'menu'; dirty(); } }; else if (b === 'stats') { S.mode = 'stats'; S.statsPg = 0; } else toggleTeacher(); }); }
        return;
      }
      if (k === 'up') { const j = firstOn(items, S.menuIdx - 1, -1); if (j < S.menuIdx) S.menuIdx = j; }
      else if (k === 'down') { const j = firstOn(items, S.menuIdx + 1, 1); if (j > S.menuIdx) S.menuIdx = j; }
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
    if (S.end) { if (k === 'ok') { const r = S.end; S.end = null; r.done(); } return; }
    if (S.coach) { // 解説の窓
      const c = S.coach, cs = c.cards || [];
      if (k === 'left' || k === 'right') { if (cs.length) { c.tab = (c.tab + (k === 'right' ? 1 : cs.length - 1)) % cs.length; c.scroll = 0; } }
      else if (k === 'up' || k === 'down') { const cd = cs[c.tab]; if (cd && cd.lines) c.scroll = Math.max(0, Math.min(Math.max(0, cd.lines.length - 12), (c.scroll || 0) + (k === 'down' ? 6 : -6))); }
      else if (k === 'ok' || k === 'back') S.coach = null;
      return;
    }
    if (S.side) { // 右の操作の列
      if (k === 'up' || k === 'down') S.side.idx = SIDE_ORDER[wrap(SIDE_ORDER.indexOf(S.side.idx) + (k === 'up' ? -1 : 1), SIDE_ORDER.length)];
      else if (k === 'left' || k === 'back') { S.side = null; if (S.self && k === 'left' && S.self.row === 0) S.self.idx = S.self.tiles.length - 1; else if (!S.self && k === 'left' && S.game) S.curIdx = Math.max(0, myTiles(S.game.players[0]).length - 1); } // 左: いちばん右の牌へ
      else if (k === 'right') { S.side = null; S.curIdx = 0; if (S.self) { S.self.row = 0; S.self.idx = 0; } } // 右: いちばん左の牌へもどる
      else if (k === 'ok') {
        const i = S.side.idx;
        if (i === 0) S.menuP = { idx: 0 };
        else if (i === 3) { S.soundP = { idx: 0 }; MJ.paused = true; }
        else if (i === 1) S.coach = { tab: 0, scroll: 0, cards: teacherOn() ? buildCoach() : [] };
        else { toggleTeacher(); if (teacherOn() && S.self && !S.self.p.riichi && !S.game.fast) { try { S.hint = teacherAdvice(S.game, S.self.p, S.self.opts); } catch (e) { /* ignore */ } } else S.hint = null; }
      }
      return;
    }
    const s = S.self, r = S.react;
    if (S.mode === 'game' && !s && !r && S.game && (k === 'left' || k === 'right' || k === 'up' || k === 'down')) { // 相手の番でも、牌をなぞれる
      const n = myTiles(S.game.players[0]).length; if (!n) return; if (S.curIdx == null) { S.curIdx = (k === 'right' || k === 'down') ? 0 : n - 1; dirty(); return; } const c = Math.min(S.curIdx, n - 1);
      if (k === 'left') { if (c === 0) S.side = { idx: 2 }; else S.curIdx = c - 1; }
      else if (k === 'right') { if (c >= n - 1) S.side = { idx: 1 }; else S.curIdx = c + 1; }
      else S.curIdx = k === 'up' ? n - 1 : 0;
      dirty(); return;
    }
    if (k === 'left' && S.mode === 'game' && s && s.row === 0 && s.idx === 0) { S.side = { idx: 2 }; return; } // いちばん左から、さらに左へ: 麻雀先生のボタン
    if (k === 'right' && S.mode === 'game' && ((!s && !r) || (s && s.row === 0 && s.idx === s.tiles.length - 1) || (s && s.row === 1 && s.idx === s.btns.length - 1) || (r && r.idx === r.btns.length - 1))) { S.side = { idx: 1 }; return; } // いちばん右から、さらに右へ: 操作の列へ
    if (s) {
      const tiles = s.tiles;
      if (k === 'left' || k === 'right') {
        const n = s.row === 0 ? tiles.length : s.btns.length; if (!n) return; s.idx = wrap(s.idx + (k === 'left' ? -1 : 1), n);
      } else if (k === 'up') { if (s.row === 0 && s.idx !== tiles.length - 1) s.idx = tiles.length - 1; else if (s.row === 0 && s.btns.length) { s.row = 1; s.idx = 0; } } // 上: いちばん右の牌へ(そこで、もう一度上: ボタンへ)
      else if (k === 'down') { if (s.row === 1) { s.row = 0; s.idx = 0; } else s.idx = 0; } // 下: 1枚目の牌へ
      else if (k === 'back' && s.rm) { s.rm = false; }
      else if (k === 'ok') {
        if (s.row === 0) { const h = tiles[s.idx]; if (allowed(s, h)) { const gp = s.p.drawn ? tiles.length - 1 : -1; S.curIdx = s.idx; S.pick = [handX(s.idx, s.idx === gp), HY - 8]; S.self = null; s.res({ act: s.rm ? 'riichi' : 'discard', tile: h }); } }
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
    speak(g, p, t) { S.bub[p.seat] = { name: p.name, text: t, until: __now() + 2300 }; dirty(); setTimeout(dirty, 2400); },
    banner(g, p, t) { S.banner = { text: t, t0: __now(), p, call: true }; dirty(); if (!g.fast) { NSND.call(p, t); NSND.sfx({ 'リーチ': 'riichi', 'ポン': 'call', 'チー': 'call', 'カン': 'kan', 'ロン': 'ron', 'ツモ': 'tsumo' }[t]); } return sleep(g.fast ? 0 : 1150).then(() => { S.banner = null; dirty(); }); },
    handStart(g) { S.curIdx = null; if (teacherOn() && !S.tmsgShown) { S.tmsgShown = 1; S.tmsg = { text: 'おまかせください。おすすめの牌に ★ をつけます', until: __now() + 6000 }; setTimeout(dirty, 6100); } S.game = g; NSND.game(g); NSND.sfx('slam'); if (S.skipKyokuVoice) S.skipKyokuVoice = false; else NSND.readKyoku(g); S.banner = { text: g.kyokuLabel(), t0: __now() }; S.deal = g.fast ? null : { t0: __now() + 300, dur: 1500, step: 0, perm: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].sort(() => Math.random() - 0.5) }; dirty(); return sleep(900).then(() => { S.banner = null; dirty(); }); },
    padHand() {},
    dice(g, first) { if (g.fast) return Promise.resolve(null); return new Promise((done) => { const a = 1 + Math.floor(Math.random() * 6), b = 1 + Math.floor(Math.random() * 6); S.dice = { a, b, target: (a + b - 1) % 4, started: false, rolling: false, settled: false, t0: __now(), t1: 0, done }; dirty(); }); },
    askSelf(g, p, opts, st) {
      return new Promise((res) => {
        const tiles = myTiles(p); const btns = [];
        if (opts.tsumo) btns.push({ label: 'ツモ', act: 'tsumo' });
        if (opts.riichi.length && !p.riichi) btns.push({ label: 'リーチ', act: 'riichi' });
        opts.ankan.forEach((t) => btns.push({ label: 'カン ' + MJ.tileName(t), act: 'ankan', t }));
        opts.kakan.forEach((t) => btns.push({ label: '加カン ' + MJ.tileName(t), act: 'kakan', t }));
        S.side = null; S.coach = null;
        S.hint = null; if (teacherOn() && !p.riichi && !g.fast) { try { S.hint = teacherAdvice(g, p, opts); } catch (e) { print('teacher err ' + e); } }
        S.self = { p, opts, st: st || {}, res, tiles, btns, rm: false, row: opts.tsumo ? 1 : 0, idx: opts.tsumo ? 0 : (S.curIdx != null && !p.riichi ? Math.min(S.curIdx, tiles.length - 1) : tiles.length - 1) };
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
        o.chi.forEach((c) => btns.push({ label: 'チー ' + c.use.map((t) => MJ.tileName(t)).join(''), w: 130, d: { act: 'chi', use: c.use } }));
        btns.push({ label: 'パス', d: { act: 'pass' } });
        S.side = null;
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
    gameEnd(g, f) { NSND.sfx('end'); return new Promise((done) => { S.end = Object.assign({}, f, { done: () => { let rk = null; try { rk = MJ.Rank.record(g, f); } catch (e) { print('rank err ' + e); } S.rankScr = { rk, done }; dirty(); } }); }); },
  };

  function pickChars() {
    let ok = null; try { ok = MJ.Rank.unlockedIds(); } catch (e) { /* ignore */ } const pool = MJ.CHARS.filter((c) => c.id !== 0 && (!ok || !ok.length || ok.includes(c.id))); const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  }
  function stopGame() { // ゲームを途中でやめて、タイトルへ
    const g = S.game; if (!g) { S.mode = 'menu'; dirty(); return; }
    g.stopped = true; S.tmsgShown = 0; S.side = S.coach = null;
    const s = S.self, r = S.react, rs = S.result, en = S.end, sp = S.saveP; if (S.rankScr) { const q = S.rankScr; S.rankScr = null; q.done(); }
    S.self = S.react = S.result = S.end = S.saveP = null;
    if (s) s.res({ act: 'discard', tile: s.p.hand[0] }); if (r) r.res({ act: 'pass' }); if (rs) rs.done(); if (en) en.done(); if (sp) sp.res();
    dirty();
  }
  async function startGame(sn) {
    S.mode = 'game'; dirty();
    const chars = sn && sn.chars ? sn.chars.map((id) => MJ.CHARS.find((c) => c.id === id)).filter(Boolean) : [];
    const g = new MJ.Game({ chars: chars.length === 3 ? chars : pickChars(), mode: 'free', length: sn && sn.length || 'east', ui, cpuDelay: __auto ? 40 : undefined });
    if (sn && chars.length === 3) { ['dealer', 'kyoku', 'honba', 'kyotaku', 'roundWind', 'handCount'].forEach((k) => { if (sn[k] != null) g[k] = sn[k]; }); sn.scores.forEach((sc, i) => { if (g.players[i]) g.players[i].score = sc; }); g.resumed = true; }
    g.players[0].coachType = 'balance'; // 麻雀先生は、バランス型
    S.game = g;
    if (!g.resumed && !g.fast) { await new Promise((done) => { S.intro = { t0: __now(), done }; NSND.sfx('slam'); setTimeout(() => NSND.sfx('slam'), 1250); dirty(); }); }
    try { await g.run(); } catch (e) { print('GAME ERR ' + (e && e.stack || e)); }
    S.game = null; S.mode = 'menu'; S.side = S.coach = null; S.menuIdx = 0; S.homeBot = false; NSND.home(); S.self = S.react = S.result = S.end = S.saveP = null; dirty();
    if (__auto) __quit();
  }
  const menuItems = () => ['つづける', teacherLabel(), speedLabel(), 'タイトルにもどる', 'おわる(電源を切れます)'];

  /* ---------- メインループから ---------- */
  let nextAuto = 0, lastSave = 0, nextSide = 0, coachShots = 0;
  window.__frame = function (now) {
    __runTimers(now);
    if (__auto && globalThis.__teacherEnv && S.self && !S.side && !S.coach && now > nextSide) { nextSide = now + 3300; window.__key('right'); window.__key('ok'); setTimeout(() => window.__key('ok'), 1500); } // 試験用: 解説の窓を、ときどき開く
    if (__auto && now > nextAuto && !S.coach && !S.side) { nextAuto = now + 90; window.__key('ok'); }
    if (__lsDirty && now - lastSave > 1500) { lastSave = now; __lsDirty = false; try { __save(JSON.stringify(__ls)); } catch (e) { /* ignore */ } }
    /* 画面の入れかえ(ダブル/トリプルバッファ)で、古い絵が交互に出て点滅しないよう、変化のあとは3回続けて描く */
    if (pressing() || S.intro || S.dice || S.fly || S.deal || (S.banner && now - (S.banner.t0 || 0) < 260)) S.dirty = true; // 動いている間は、描き続ける
    if (!S.dirty) return false;
    S.dirty = false; return true;
  };
  const perf = { t0: 0, n: 0, ms: 0, shown: '' };
  const drawBody = function () {
    if (S.mode === 'stats') { gfx.view(0, 0); drawStats(); return true; }
    const full = S.mode === 'title' || S.mode === 'menu' || S.mode === 'settings';
    const inGame = !full && S.mode !== 'slots' && S.game && !S.result && !S.end;
    if (full || inGame || S.result) { S.vx = 0; S.vy = 0; } else { S.vx = 56; S.vy = 20; }
    gfx.view(S.vx, S.vy);
    if (S.mode === 'title') drawTitle(); else if (S.mode === 'menu') drawHome(); else if (S.mode === 'settings') drawSettings(); else if (S.mode === 'slots') { gfx.clear(14, 84, 52); drawSlots(); }
    else if (S.game) { gfx.clear(14, 84, 52); drawTable(S.game); if (inGame) { fill(720, 0, 112, 468, [28, 32, 34]); gfx.view(0, 20); drawSide(S.game); if (S.coach) drawCoach(); gfx.view(0, 0); } }
    if (S.result) { drawResult(S.result); if (__auto && globalThis.__shotDir) gfx.shot(__shotDir + '/res' + (++S.shotN) + '.bmp'); }
    if (__auto && globalThis.__shotDir && (S.react || (S.self && S.self.btns.length)) && S.shotR < 6) { gfx.shot(__shotDir + '/act' + (++S.shotR) + '.bmp'); }
    if (S.end) { drawEnd(S.end); if (__auto && globalThis.__shotDir) gfx.shot(__shotDir + '/end.bmp'); }
    if (S.coach && __auto && globalThis.__shotDir && coachShots < 6 && S.coach.cards && S.coach.cards.length) { gfx.view(0, 0); gfx.shot(__shotDir + '/coach' + (++coachShots) + '.bmp'); }
    if (S.rankScr) { drawRankScreen(); gfx.view(0, 0); return true; }
    if (S.intro && S.game) { S.vx = 0; S.vy = 0; gfx.view(0, 0); drawIntro(); return true; }
    if (S.dice && S.game) { S.vx = 0; S.vy = 0; gfx.view(0, 0); drawDice(); return true; }
    S.vx = 56; S.vy = 20; gfx.view(56, 20); // 以降の板(メニューなど)は、画面の中央に
    if (S.saveP) drawDialog('この局が おわりました', ['セーブして次の局へ', 'セーブしないで次の局へ'], S.saveP.idx, S.saveP.snap ? kyokuText(S.saveP.snap) + ' の つづきから' : '');
    if (S.toast && S.toast.until > __now()) { rrect(110, 180, 500, 54, 12, [0, 0, 0], 215); text(S.toast.text, 360, 193, 24, YEL, 1); }
    if (S.menuP) drawDialog('メニュー', menuItems(), S.menuP.idx, '');
    if (S.soundP) drawSound();
    if (S.teachQ) drawTeachQ();
    if (S.playQ) drawDialog('麻雀をはじめます', ['つづきから(' + kyokuText(S.playQ.snap) + ')', 'はじめから'], S.playQ.idx, '');
    if (S.confirmQ) drawDialog('ゲームを おわりますか?', ['もどる', 'おわる(電源を切れます)'], S.confirmQ.idx, '');
    gfx.view(0, 0);
    return true;
  };
  window.__draw = function () {
    const t0 = __now(); const r = drawBody(); const dt = __now() - t0; perf.n++; perf.ms += dt;
    if (t0 - perf.t0 >= 1000) { perf.shown = '描 ' + perf.n + '回/秒  ' + (perf.ms / Math.max(1, perf.n)).toFixed(0) + 'ms'; perf.t0 = t0; perf.n = 0; perf.ms = 0; }
    if (perfOn()) { gfx.view(0, 0); fill(0, 0, 150, 18, [0, 0, 0], 170); text(perf.shown, 4, 2, 13, [120, 255, 160]); }
    return r;
  };
  NSND.home();
  print('ネイティブ版 準備できました');
})();
