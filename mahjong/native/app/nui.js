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
  const later = (fn, ms) => { S.pressT = __now(); S.pressMs = ms || 170; S.locked = true; dirty(); setTimeout(() => { S.pressT = -9999; dirty(); setTimeout(() => { S.locked = false; fn(); dirty(); }, 40); }, S.pressMs); }; // 押している間のあと、いちど「もとの形にもどった絵」を描いてから、次の画面へ(描くのがおそい機械でも、へこんだ絵のまま、つぎの画面にならないように) // 押したボタンが光ってから、次へ
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
  const homeItems = () => [{ label: '麻雀をはじめる', act: 'play' }, { label: '麻雀クイズ', act: 'quiz' }, { label: '麻雀の勉強', act: 'study' }, { label: '設定', act: 'settings' }];
  const firstOn = (items, from, dir) => { for (let i = 0; i < items.length; i++) { const j = wrap(from + dir * i, items.length); if (!items[j].off) return j; } return from; };
  const HIDDEN = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'back', 'ok']; // 隠しコマンド(タイトル): 5件のセーブから選べる

  /* ---------- 描く道具 ---------- */
  const fill = (x, y, w, h, c, a) => gfx.fill(x, y, w, h, c[0], c[1], c[2], a == null ? 255 : a);
  const frame = (x, y, w, h, c, t) => gfx.frame(x, y, w, h, c[0], c[1], c[2], t || 1);
  const text = (s, x, y, sz, c, al) => gfx.text(String(s), x, y, sz, c[0], c[1], c[2], al || 0);
  const WHITE = [255, 255, 255], BLACK = [20, 20, 20], YEL = [255, 220, 40], GREY = [170, 190, 175], RED = [235, 70, 60];
  function tile(t, x, y, w, h, red, dim) {
    fill(x + 1, y + 1, w, h, [0, 0, 0], 70);
    if (!gfx.image(MJ.tileSrc(t, red), x, y, w, h, dim ? 100 : 255)) { fill(x, y, w, h, [240, 240, 230]); text(MJ.tileName(t), x + w / 2, y + 2, 10, BLACK, 1); }
  }
  function panel(x, y, w, h, r, c, bc, bw, a) { r = Math.max(3, Math.min(7, Math.round(r * 0.55))); rrect(x, y, w, h, r, bc, a); rrect(x + bw, y + bw, w - 2 * bw, h - 2 * bw, Math.max(1, r - bw), c, a); } // 角の丸い板(縁つき)
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
    text(label, x + w / 2, y + (h - 18) / 2 - 1, 18, BLACK, 1);
  }
  /* あなた(ずんだもん)の表情: 場面ごとに切りかわる。16枚(img/zunda/01〜16)。 */
  const ZN = { normal: 1, happy: 2, think: 3, fight: 4, call: 5, shock: 6, smug: 7, laugh: 8, focus: 9, relief: 10, grumpy: 11, what: 12, win: 13, lose: 14, dokidoki: 15, point: 16 };
  /* 絵のバージョン: ふだんは「浮世絵版」(img/uk/…)。ふだんは浮世絵版。起動のとき MJ_STYLE=old を付けると、前のバージョンの絵(img/chars, img/zunda, img/title_art.webp)に戻る */
  MJ.RankScale = true; // 実機版: ポイントに「相手の強さ」をかける(js/rank.js)
  const UKIYO = globalThis.__styleEnv !== 'old'; // ふだんは浮世絵版。MJ_STYLE=old で、前のバージョンの絵
  const skin = (p) => (UKIYO && typeof p === 'string' ? p.replace(/^img\/(chars\/face|zunda|title_art)/, 'img/uk/$1') : p);
  const YOU_OLD = globalThis.__youEnv === 'old'; // 起動のとき MJ_YOU=old を付けると、前の「あなた」の絵(img/you)に戻る。 ふだんは ずんだもん
  const youSrc = () => YOU_OLD ? 'img/you/' + String(MJ.youIndex()).padStart(2, '0') + '.webp' : skin('img/zunda/' + String(ZN[S.mood && S.moodUntil > __now() ? S.mood : 'normal']).padStart(2, '0') + '.webp');
  function setMood(m, ms) { S.mood = m; S.moodUntil = __now() + (ms || 60000); dirty(); }
  const TYADJ = 0; // 宣言の文字を、顔の中心に合わせるための微調整
  function face(p, x, y, w, h) {
    const ch = p.char; const src = skin(p.isHuman ? youSrc() : (MJ.faceSrc ? MJ.faceSrc(ch) : ch.face));
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
  function riverPos(seat, i, p) { // 河の i 番目の牌: 外枠の位置と、回す角度。リーチ宣言の牌は、その席から見て左に90度まわして横向きに置く(あとの牌は、横向きの分だけずれる)
    const c = i % 6, r = Math.floor(i / 6), ds = p && p.discards ? p.discards : [], ri = ds.findIndex((d) => d.riichi), D = RH - RW;
    const sameRow = ri >= 0 && Math.floor(ri / 6) === r, sh = sameRow && ri < i ? D : 0, me = ri === i;
    if (seat === 0) return me ? { x: 281 + c * RW, y: 268 + r * RH + D, rot: 270, bw: RH, bh: RW } : { x: 281 + c * RW + sh, y: 268 + r * RH, rot: 0, bw: RW, bh: RH };
    if (seat === 2) return me ? { x: 412 - c * RW - D, y: 127 - r * RH, rot: 90, bw: RH, bh: RW } : { x: 412 - c * RW - sh, y: 127 - r * RH, rot: 180, bw: RW, bh: RH };
    if (seat === 3) return me ? { x: 181 - r * 35, y: 157 + c * RW, rot: 0, bw: RW, bh: RH } : { x: 181 - r * 35, y: 157 + c * RW + sh, rot: 90, bw: RH, bh: RW };
    return me ? { x: 503 + r * 35 + D, y: 287 - c * RW - D, rot: 180, bw: RW, bh: RH } : { x: 503 + r * 35, y: 287 - c * RW - sh, rot: 270, bw: RH, bh: RW };
  }
  function tileR(t, x, y, w, h, red, dim, rot) {
    if (!rot) { tile(t, x, y, w, h, red, dim); return; }
    if (!gfx.imageRot(MJ.tileSrc(t, red), x, y, w, h, dim ? 100 : 255, rot)) { const bw = (rot === 90 || rot === 270) ? h : w, bh = (rot === 90 || rot === 270) ? w : h; fill(x, y, bw, bh, [240, 240, 230]); }
  }
  const BAR = [8, 26, 18];
  function barPieces(g, p) {
    const sw = g.seatWindOf(p), parts = [{ s: WIND[sw], c: sw === 0 ? [235, 90, 70] : [120, 160, 230], sz: 20 }, { s: p.name, c: WHITE, sz: 20 }, { s: String(p.score).replace(/\B(?=(\d{3})+(?!\d))/g, ','), c: p.score < 0 ? RED : YEL, sz: 22 }];
    if (p.riichi) parts.push({ s: 'リーチ中', c: [255, 96, 80], sz: 19, b: 1 });
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
    const parts = barPieces(g, p).slice(1).map((q, i) => ({ s: q.s, sz: q.sz, b: q.b, c: act ? (i === 0 ? [27, 27, 18] : i === 1 ? [120, 60, 0] : [200, 30, 30]) : q.c }));
    const off = ST + 8;
    { const avail = (rot ? h : w) - off - CH - 10 - 8, tot = parts.reduce((a, q) => a + gfx.measure(q.s, q.sz), 0) + 12 * (parts.length - 1), k = Math.min(1, avail / tot); if (k < 1) parts.forEach((q) => { q.sz = Math.max(10, Math.floor(q.sz * k)); }); } // はみ出すときは、文字を小さくして、板に収める
    if (!rot) {
      const cy0 = y + (h - CH) / 2; rrect(x + off, cy0, CH, CH, 5, bg); text(WIND[sw], x + off + CH / 2, cy0 + 2, 18, WHITE, 1);
      let cx = x + off + CH + 10; parts.forEach((q) => { const ty = y + Math.round((h - q.sz) / 2) + 1; if (q.b) { text(q.s, cx + 1, ty, q.sz, q.c); text(q.s, cx, ty + 1, q.sz, q.c); } text(q.s, cx, ty, q.sz, q.c); cx += gfx.measure(q.s, q.sz) + 12 + (q.b ? 1 : 0); }); return;
    }
    if (rot) parts.forEach((q) => { if (q.sz > 19) q.sz = 19; }); // 横向きの板(上家・下家)は、字を少し小さくして、カンマが枠からはみ出ないように
    const cxm = x + w / 2, cc = rot === 90 ? y + off + CH / 2 : y + h - off - CH / 2;
    rrect(Math.round(cxm - CH / 2), Math.round(cc - CH / 2), CH, CH, 5, bg); gfx.textRot(WIND[sw], Math.round(cxm), Math.round(cc), 18, 255, 255, 255, rot);
    let cy = y + off + CH + 10;
    parts.forEach((q) => { const tw = gfx.measure(q.s, q.sz), dx = rot === 90 ? 3 : -3, bx = q.b ? 1 : 0; // 文字の下がわ(カンマ)が出るほうと逆に、少しよせる
      if (rot === 90) { gfx.textRot(q.s, Math.round(cxm) + dx, Math.round(cy + tw / 2), q.sz, q.c[0], q.c[1], q.c[2], 90); if (bx) gfx.textRot(q.s, Math.round(cxm) + dx + 1, Math.round(cy + tw / 2), q.sz, q.c[0], q.c[1], q.c[2], 90); cy += tw + 12; } else { gfx.textRot(q.s, Math.round(cxm) + dx, Math.round(y + h - (cy - y) - tw / 2), q.sz, q.c[0], q.c[1], q.c[2], 270); if (bx) gfx.textRot(q.s, Math.round(cxm) + dx - 1, Math.round(y + h - (cy - y) - tw / 2), q.sz, q.c[0], q.c[1], q.c[2], 270); cy += tw + 12; } });
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
      const q = riverPos(p.seat, i, p);
      const isLast = g.lastDiscard && g.lastDiscard.d === d && !(g.turn === 0 && !S.react && g.lastDiscard.by !== 0); // 自分の番になったら、直前の捨て牌の枠は消す
      if (isLast) rrect(q.x - 2, q.y - 2, q.bw + 4, q.bh + 4, 3, YEL); else if (d.riichi) rrect(q.x - 1, q.y - 1, q.bw + 2, q.bh + 2, 3, RED);
      tileR(d.tile.t, q.x, q.y, RW, RH, d.tile.red, d.called, q.rot);
      if (isLast && d.riichi) frame(q.x, q.y, q.bw, q.bh, RED, 1);
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
    sbtn(726, 6, 64, 32, [235, 120, 30], [160, 70, 10], [''], f === 0, 13); text('MENU', 765, 11, 15, WHITE, 1); [0, 1, 2].forEach((i) => fill(731, 15 + i * 5, 10, 2, WHITE));
    sbtn(796, 6, 30, 32, [50, 90, 160], [25, 50, 100], [''], f === 3, 13); fill(803, 17, 4, 10, WHITE); fill(807, 14, 3, 16, WHITE); fill(810, 11, 3, 22, WHITE); fill(816, 17, 2, 10, WHITE);
    { const lb = g.kyokuLabel().split(' '); text(lb[0], 776, 44, 24, WHITE, 1); text((lb[1] ? lb[1] + ' ' : '') + ({ single: '一局戦', south: '東南戦' }[g.length] || '東風戦'), 776, 70, 16, [200, 215, 200], 1); }
    {
      const w = waitInfoOf(g);
      if (w) { // あたり牌: 4種類までは大きく(2列)、それより多いときだけ小さく(3列)
        const big = w.length <= 4, cols = big ? 2 : 3, rows = Math.ceil(w.length / cols), tw = big ? 38 : 28, th = big ? 50 : 38, pitch = big ? 46 : 32, rh = big ? 74 : 58, fs = big ? 16 : 14;
        const ph = 34 + rows * rh + (w[0].fu ? 22 : 0); panel(726, 88, 100, ph, 10, [6, 44, 26], [255, 220, 40], 2, 235); text(w[0].plan ? '待ち(予定)' : 'あたり牌', 776, 92, w[0].plan ? 17 : 18, YEL, 1);
        w.forEach((x, i) => { const tx = 731 + (i % cols) * pitch + (big ? 2 : 0), ty = 118 + Math.floor(i / cols) * rh; tile(x.t, tx, ty, tw, th); text('あと' + x.left, tx + tw / 2, ty + th + 2, fs, WHITE, 1); });
        if (w[0].fu) text('フリテン', 776, 88 + ph - 24, 16, [255, 120, 100], 1); }
    }
    sbtn(726, 322, 100, 46, [40, 90, 190], [20, 50, 120], [''], f === 1, 24); gfx.image('img/teacher/t12.webp', 730, 324, 38, 40, 255); text('解説', 792, 332, 22, WHITE, 1);
    sbtn(726, 376, 100, 56, teacherOn() ? [30, 120, 80] : [90, 90, 90], teacherOn() ? [15, 70, 45] : [50, 50, 50], ['麻雀先生', teacherOn() ? 'あり' : 'なし'], f === 2, 19);
  }
  function wrapText(s, sz, maxw) { // 文字列を、幅に収まるように、行に分ける
    const out = []; let cur = '';
    for (const ch of String(s)) { if (ch === '\n') { out.push(cur); cur = ''; continue; } if (gfx.measure(cur + ch, sz) > maxw && !'。、,.」』)）!?!?…ー'.includes(ch)) { out.push(cur); cur = ch; } else cur += ch; }
    if (cur) out.push(cur); return out;
  }
  /* Edge版の解説(coach.js が作るカード)を、文字のカードに直して使う */
  const htmlText = (h) => String(h).replace(/<span class="tile[^>]*>[\s\S]*?<\/svg><\/span>/g, '').replace(/<br\s*\/?>/g, '\n').replace(/<li>/g, '\n・').replace(/<\/li>/g, '\n').replace(/<\/div>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
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
  /* 麻雀先生の顔(Edge版と同じ表情の組み合わせ)。key が同じあいだは、同じ顔のまま */
  const TM = { ok: ['21', '22', '31', '32', '35'], pass: ['15', '25', '24', '34', '12'], advice: ['26', '36', '16', '13', '12'], aim: ['16', '13', '26', '36', '12'], warn: ['24', '34', '25', '15'], cheer: ['35', '31', '21', '32', '22'], greet: ['14', '21', '11', '36'] };
  const tPick = (mood, key) => { const c = S._tp || (S._tp = {}), k = mood + ':' + key; if (!c[k]) { const a = TM[mood] || TM.advice, last = S._tpLast || (S._tpLast = {}); let n = a[Math.floor(Math.random() * a.length)]; if (a.length > 1 && n === last[mood]) n = a[(a.indexOf(n) + 1) % a.length]; last[mood] = n; const ks = Object.keys(c); if (ks.length > 60) delete c[ks[0]]; c[k] = n; } return 'img/teacher/t' + c[k] + '.webp'; };
  const tFace = (mood, key, x, y, h) => { const w = Math.round(h * 0.95); if (h >= 48) gfx.imageTop(tPick(mood, key), x, y, w, h); else gfx.image(tPick(mood, key), x, y, w, h); return w; };
  function drawCoach() {
    panel(10, 8, 700, 412, 18, [14, 40, 32], [240, 210, 120], 3, 247);
    const c = S.coach, cards = c.cards;
    { const t0 = cards[c.tab] ? cards[c.tab].title : ''; tFace(/警戒|危/.test(t0) ? 'warn' : /おすすめ|★/.test(t0) ? 'ok' : 'advice', 'c' + c.tab + t0, 14, 9, 38); } text('麻雀先生', 58, 14, 20, YEL);
    if (!teacherOn()) { text('麻雀先生が「なし」です。右の「麻雀先生」ボタンで「あり」にしてください。', 28, 80, 18, WHITE); text('決定・もどる で とじる', 360, 392, 20, GREY, 1); return; }
    if (!cards.length) { text('あなたの番(または、ポン・チーなどの選択)のときに、開いてください。', 28, 80, 18, WHITE); text('決定・もどる で とじる', 360, 392, 20, GREY, 1); return; }
    const tw = Math.min(110, Math.floor(540 / cards.length));
    cards.forEach((cd, i) => { const on = c.tab === i; fill(150 + i * (tw + 4), 14, tw, 30, on ? YEL : [60, 90, 80]); text(shortTitle(cd.title), 150 + i * (tw + 4) + tw / 2, 16, 18, on ? BLACK : WHITE, 1); });
    const cd = cards[c.tab];
    if (!cd.fit) { // 入りきる いちばん大きな字で(スクロールさせない)。最後まで入らないときだけ、小さな字で、スクロール
      for (const sz of [26, 24, 22, 20, 18]) {
        const lines = []; wrapText(cd.title, sz + 2, 650).forEach((l) => lines.push({ t: l, h: 1 })); lines.push({ t: '', h: 0 }); wrapText(cd.text, sz, 650).forEach((l) => lines.push({ t: l, h: 0 }));
        const hh = lines.reduce((a2, l) => a2 + (l.h ? Math.round((sz + 2) * 1.4) : Math.round(sz * 1.4)), 0); cd.fit = { sz, lines, hh }; if (hh <= 322) break;
      }
    }
    const F = cd.fit, top = c.scroll || 0; let y = 54; gfx.clip(10, 50, 700, 330);
    F.lines.slice(top).forEach((l) => { text(l.t, 28, y, l.h ? F.sz + 2 : F.sz, l.h ? YEL : WHITE); y += l.h ? Math.round((F.sz + 2) * 1.4) : Math.round(F.sz * 1.4); }); gfx.clip();
    if (F.hh > 322) text((top > 0 ? '↑ ' : '') + '↓ つづき', 690, 384, 18, GREY, 2);
    text('← → カードをえらぶ   ↑ ↓ 文章をうごかす   決定・もどる とじる', 360, 392, 18, GREY, 1);
  }
  const fitSz = (str, sz, maxw, min) => { while (sz > min && gfx.measure(str, sz) > maxw) sz--; return sz; }; // 幅に入るまで、字を小さくする
  function drawTeacher(g) {
    if (!teacherOn()) return;
    const h = S.hint, s = S.self; if (s && s.rm) return; // リーチする牌をえらぶ間は、案内の文字だけ
     if ((!h || !s || s.row !== 0) && !S.react && S.tmsg && __now() < S.tmsg.until) { panel(6, 268, 566, 64, 10, [6, 44, 26], [255, 220, 40], 2, 240); tFace('advice', 'm' + S.tmsg.until, 12, 270, 60); text('麻雀先生', 80, 272, 16, YEL); text(S.tmsg.text, 80, 294, fitSz(S.tmsg.text, 21, 480, 16), WHITE); return; }
    if (!h || !s || s.row !== 0) return;
    panel(6, 268, 566, 64, 10, [6, 44, 26], [255, 220, 40], 2, 240); tFace('ok', 'h' + h.t + (h.riichi ? 'r' : ''), 12, 270, 60);
    const l1 = '★ おすすめ: ' + MJ.tileName(h.t) + (h.riichi ? ' を切ってリーチ' : ' を切る'), l2 = (h.sh === 0 ? 'テンパイ' : 'テンパイまであと' + h.sh + '歩') + ' 受け入れ' + h.n + '枚  ' + (h.label || '');
    text(l1, 80, 272, fitSz(l1, 24, 484, 18), YEL); text(l2, 80, 301, fitSz(l2, 19, 484, 14), WHITE);
  }

  /* ---------- 軽い動き(牌が河へ飛ぶ・配牌・札の拡大) ---------- */
  function startFly(g, ld) {
    if (g.fast || ld.by == null) return;
    const p = g.players[ld.by], i = p.discards.indexOf(ld.d); if (i < 0) return;
    const q = riverPos(ld.by, i, p);
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
  const FLY_MS = 140, DEAL_R = [0, 400, 800, 1200], DEAL_J = 120, DEAL_LIFT = 1900, DEAL_DROP = 2340, DEAL_END = 2720, SRT_L = 200, SRT_S = 240, SRT_D = 150;
  /* 配牌の山(2段重ねの牌が、輪になっている)。親の側から、反時計回りに、2つ(=4牌)ずつ取られていく */
  const WALL_P = 15, WALL_X0 = 232, WALL_Y0 = 62;
  function wallList(dealer) {
    const out = [], side = (sd, i) => (sd === 0 ? { x: WALL_X0 + i * WALL_P, y: WALL_Y0 + 236, w: 14, h: 18, sd: '' } : sd === 1 ? { x: WALL_X0 + 261, y: Math.round(WALL_Y0 + 20 + (16 - i) * 12.8), w: 18, h: 12, sd: 'r' } : sd === 2 ? { x: WALL_X0 + (16 - i) * WALL_P, y: WALL_Y0, w: 14, h: 18, sd: '' } : { x: WALL_X0 - 24, y: Math.round(WALL_Y0 + 20 + i * 12.8), w: 18, h: 12, sd: 'l' });
    for (let q = 0; q < 4; q++) for (let i = 0; i < 17; i++) out.push(side((dealer + q) % 4, i));
    return out;
  }
  function drawWall(sr, half, dealer) {
    wallList(dealer).forEach((p, idx) => { if (idx < sr) return; if (!(idx === sr && half)) back(p.x + 2, p.y - 2, p.w, p.h, p.sd || undefined); back(p.x, p.y, p.w, p.h, p.sd || undefined); });
  }
  /* 山から取った牌のかたまり: 2牌重ねの山を2つ(4牌)、となりあわせのまま手元へ動く。着くと、パッと手牌の位置に並ぶ */
  function drawBlock(f, tx, ty) {
    const v = f.ov === 'l' || f.ov === 'r', ns = f.cnt > 1 ? 2 : 1, w = 14, h = 18, ww = v ? 18 : 14, hh = v ? 12 : 18, ax = v ? 0 : 15, ay = v ? 12.8 : 0;
    const bw = v ? 18 : 14 + ax * (ns - 1), bh = v ? 12 + ay * (ns - 1) : 18, k = f.k, u = 1 - (1 - k) * (1 - k), lift = Math.round(Math.sin(k * Math.PI) * 10);
    const sx = f.org[0] - ww / 2, sy = f.org[1] - hh / 2, ex = tx - bw / 2, ey = ty - bh / 2;
    const x0 = Math.round(sx + (ex - sx) * u), y0 = Math.round(sy + (ey - sy) * u) - lift;
    for (let m = 0; m < ns; m++) { const x = Math.round(x0 + ax * m), y = Math.round(y0 + ay * m); if (f.cnt > 1 || m < 1) back(x + 2, y - 2, ww, hh, f.ov || undefined); back(x, y, ww, hh, f.ov || undefined); }
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
    if (d.groups < target) { const dl0 = S.game ? S.game.dealer : 0, tb = d.groups < 12 ? d.groups * 4 : 48 + (d.groups - 12), wp = wallList(dl0)[Math.min(67, tb >> 1)]; d.org[d.groups] = [wp.x + wp.w / 2, wp.y + wp.h / 2]; (d.ov || (d.ov = []))[d.groups] = wp.sd; d.gt[d.groups] = __now(); d.groups++; if (d.groups % 4 === 1) NSND.sfx(d.groups > 12 ? 'deal1' : 'deal4', 0.5); }
    // 1人ぶん(4牌)ずつ、卓の中央から飛んできて、手元に収まる。飛んでいるあいだは ns(おさまった数)に入れず、fly に入れる
    const ns = [0, 0, 0, 0], dl = S.game ? S.game.dealer : 0, fly = [[], [], [], []], nowT = __now(), dealt = [0, 0, 0, 0];
    for (let k = 0; k < d.groups; k++) { const sd = (dl + (k % 4)) % 4, cnt = k < 12 ? 4 : 1, age = nowT - d.gt[k]; if (age < FLY_MS) fly[sd].push({ from: dealt[sd], cnt, k: Math.min(1, age / FLY_MS), org: d.org[k], ov: d.ov[k] }); else ns[sd] += cnt; dealt[sd] += cnt; }
    const all = d.groups >= 16, sorted = all && t >= DEAL_LIFT; if (sorted && !d.liftSfx) { d.liftSfx = 1; NSND.sfx('sort1', 0.7); }
    if (all && t >= DEAL_DROP && !d.dropSfx) { d.dropSfx = 1; NSND.sfx('discard', 0.7); }
    const lift = 0;
    let tiles = 0; for (let k = 0; k < d.groups; k++) tiles += k < 12 ? 4 : 1;
    d.seq = S.drawSeq; d.last = { n: ns[0], ns, fly, sorted, lift, st: t - DEAL_LIFT, wall: true, sr: tiles >> 1, half: tiles & 1 };
    return d.last;
  }
  const cached = (i, key, fn) => { const c = S.lay[i]; if (!c || c.key !== key) { gfx.layerBegin(i); fn(); gfx.layerEnd(); S.lay[i] = { key }; } gfx.layer(i); };
  function drawTable(g) {
    if (!g.doraInd || !g.players[0].hand) return; // 始まる前は、まだ描くものがない
    gfx.clear(32, 74, 60);
    fill(140, 8, 440, 300, [24, 56, 46]); // 卓の中ほど
    if (g.blank) return;
    const P = g.players;
    if (S.fly && __now() >= S.fly.t0 + S.fly.dur) S.fly = null; // 着いたら、その同じコマから、河の絵に入れる(ちらつき防止)
    const DS = dealState();
    // 河(変わったときだけ描き直し、あとは1枚の絵を貼る)
    const rkey = P.map((p) => p.discards.length + ':' + p.discards.map((d) => (d.called ? 1 : 0)).join('') + ':' + p.discards.indexOf(g.lastDiscard && g.lastDiscard.d)).join('|') + (g.turn === 0 && !S.react ? 't' : 'o') + (S.fly ? 'f' : '');
    cached(0, rkey, () => P.forEach((p) => drawRiver(g, p)));
    const okey = [S.deal ? 'd' : '-', g.turn, P.map((p) => (p.flowers || []).length).join(''), g.live.length, g.kyotaku, g.kyokuLabel(), (g.doraInd || []).map((d) => d.id).join(','), P.map((p) => p.hand.length + ':' + p.score + ':' + (p.riichi ? 1 : 0) + ':' + p.melds.length + ':' + p.melds.map((m) => m.tiles.length).join('') + ':' + g.seatWindOf(p)).join('|')].join('#');
    cached(1, okey, () => {
    // 副露
    drawMelds(P[2], 520, 34, 16, 22); drawMelds(P[3], 3, 312 - meldWH(P[3], 16, 22), 16, 22); drawMelds(P[1], 694, 312 - meldWH(P[1], 16, 22), 16, 22);
    // 名札(横長の板)
    drawBar(g, P[2], 190, 3, 322, 28, 0); drawBar(g, P[3], 35, 21, 27, 280, 90); drawBar(g, P[1], 643, 21, 27, 280, 270); drawBar(g, P[0], 446, 317, 262, 34, 0);
    // 季節牌(花牌)をもっている人は、名札のそばに小さく並べる
    P.forEach((p) => { const fl = p.flowers || []; fl.forEach((f, i) => { const [fx, fy] = p.seat === 0 ? [448 - (i + 1) * 20, 324] : p.seat === 2 ? [518 + i * 20, 5] : p.seat === 3 ? [36 + i * 20, 304] : [640 + i * 20, 304]; tile(f.t, fx, fy, 16, 22, false); }); });
    if (!S.deal) { // 配牌のあいだは、中央の情報を出さない(山の輪を見せるため)
    // 中央の情報
    panel(218, 163, 281, 101, 14, [6, 44, 26], [90, 140, 110], 2);
    const lb = g.kyokuLabel().split(' '); text(lb[0], 234, 170, 28, WHITE); text('供託 ' + g.kyotaku + (lb[1] ? '  ' + lb[1] : ''), 234, 204, 17, [200, 215, 200]);
    text('残り', 234, 228, 18, WHITE); text(String(g.live.length), 280, 220, 34, YEL); text('枚', 334, 230, 18, WHITE);
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
        (DS.fly[sd] || []).forEach((f) => { const q0 = pos[sd](f.from), q1 = pos[sd](f.from + f.cnt - 1); drawBlock(f, (q0[0] + q1[0] + b[0]) / 2, (q0[1] + q1[1] + b[1]) / 2); }); // 山から、となりあわせのまま手元へ
      });
    }
    // 自分の手牌
    drawHand(g);
    // 吹き出し
    const now = __now();
    const BW = 360, BH = 110, FSZ = 94, BUB = { 0: [250, 246], 1: [336, 150], 2: [360, 40], 3: [70, 172] }; // 吹き出しは、いつも同じ大きさ(顔も、いつも同じ大きさ)
    const calling = (S.banner && S.banner.call) || S.ryu; // ポン・チー・リーチなどの宣言のあいだは、セリフを描かない(かぶらないように)
    for (const k of Object.keys(S.bub)) { const b = S.bub[k]; if (b.until < now) { delete S.bub[k]; continue; } if (calling) continue;
      const pos = BUB[k] || [300, 200], tw = BW - FSZ - 34; let bsz = 20, lines = wrapText(b.text, bsz, tw);
      for (const z of [20, 19, 18, 17, 16]) { bsz = z; lines = wrapText(b.text, z, tw); if (lines.length <= 3) break; } lines = lines.slice(0, 3);
      const lh = bsz + 5, ty0 = pos[1] + 30 + Math.round((72 - lines.length * lh) / 2) + 0; // 3行より少ないときは、まん中によせる
      rrect(pos[0] + 2, pos[1] + 3, BW, BH, 10, [0, 0, 0], 70); rrect(pos[0], pos[1], BW, BH, 10, [240, 243, 238]);
      if (b.p) { face(b.p, pos[0] + 8, pos[1] + 8, FSZ, FSZ); } // 話している人の顔
      text(b.name, pos[0] + FSZ + 20, pos[1] + 8, 17, [80, 90, 86]); lines.forEach((l, i) => text(l, pos[0] + FSZ + 20, ty0 + i * lh, bsz, [30, 34, 32])); }
    drawFly(); drawTeacher(g);
    if (S.ryu) { // 「流局」: 黒い帯に大きな白文字が、左から流れてきて止まる。少し置いて、すっと消える
      const t = __now() - S.ryu.t0, k = Math.min(1, t / 380), e = 1 - (1 - k) * (1 - k), out = t > 1600 ? Math.min(1, (t - 1600) / 350) : 0, a = Math.round(200 * (1 - out));
      for (let i = 0; i < 12; i++) fill(0, 170 + Math.round(i * 9.5), W, 10, [0, 0, 0], a); // 帯
      const cx = Math.round(W / 2 - (1 - e) * 560), sz = 96, ty = 224 - sz / 2;
      if (out < 1) { [[-4, 0], [4, 0], [0, -4], [0, 4], [3, 3]].forEach((dd) => text('流局', cx + dd[0], ty + dd[1], sz, [0, 0, 0], 1)); text('流局', cx, ty, sz, [255, 244, 207], 1); }
    }
    if (__auto && globalThis.__shotDir && !S._stbl && g.players[2].discards.length >= 4 && g.players[3].discards.length >= 4) { S._stbl = 1; gfx.shot(__shotDir + '/table.bmp'); }
    // 演出: 札の文字が、少し大きいところから縮んで止まる
    if (S.banner && S.banner.call && S.banner.p) { // ポン・チー・ロンなど: 顔と、色のついた大きな文字(Edge版と同じ)
      const bn = S.banner, k = Math.min(1, (__now() - bn.t0) / 160), sz = 84, col = bn.text === 'リーチ' ? [225, 36, 28] : (bn.text === 'ロン' || bn.text === 'ツモ') ? [230, 0, 18] : [196, 139, 255];
      // 鳴いた人の席の側に出す: 対面=中央の上 / 上家=左 / 下家=右(上家と同じ高さ) / 自分=中央の下
      const FB = 124, tw = gfx.measure(bn.text, sz), bw = FB + 16 + tw, sd = bn.p.seat, by = sd === 2 ? 36 : sd === 0 ? 252 : 144;
      const bx = sd === 3 ? 76 : sd === 1 ? 636 - bw : Math.round((W - bw) / 2);
      face(bn.p, bx, by, FB, FB);
      { const tx = bx + FB + 16, ty = by + Math.round((FB - sz) / 2) + TYADJ; text(bn.text, tx + 5, ty + 7, sz, [0, 0, 0], 0); [[-4, 0], [4, 0], [0, -4], [0, 4], [-3, -3], [3, -3], [-3, 3], [3, 3]].forEach((d) => text(bn.text, tx + d[0], ty + d[1], sz, [255, 255, 255])); text(bn.text, tx, ty, sz, col); }
    } else if (S.banner) { // 局のはじまり: 4人の顔(★つき)を席の位置に出し、まん中に「東二局 一本場」
      fill(0, 0, W, H, [26, 58, 48]); fill(30, 30, W - 60, H - 60, [34, 72, 60]); fill(90, 70, W - 180, H - 140, [40, 84, 68]); // 緑のしずかな背景(サイコロの画面と同じ)
      const P4 = g.players, FS = 84, SEATS = [{ s: 0, x: 318, y: 292, pc: 360, py: 386, cx: 284, cy: 292 }, { s: 1, x: 590, y: 128, pc: 632, py: 218, cx: 680, cy: 130 }, { s: 2, x: 318, y: 16, pc: 360, py: 106, cx: 284, cy: 18 }, { s: 3, x: 46, y: 128, pc: 88, py: 218, cx: 8, cy: 130 }];
      SEATS.forEach((o) => { const p = P4[o.s]; face(p, o.x, o.y, FS, FS); plate(o.pc, o.py, p.name, p.char && p.char.level ? p.char.level : 0);
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
    if (sub) { text(label, x + w / 2, y + 3, 20, col, 1); text(sub, x + w / 2, y + 26, 15, [90, 90, 80], 1); } else text(label, x + w / 2, y + (h - 3 - (big ? 26 : 20)) / 2, big ? 26 : 20, col, 1);
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
      let x = handX(i, i === gapAt), y = HY - (DS.lift || 0), rot = 0, fl = false;
      if (DS.sorted && S.deal && S.deal.perm && DS.st < SRT_L + SRT_S + SRT_D + 100) { // 並べかえ(案D): ふつうの牌はほとんど動かず、逆さの牌だけ高く跳ねて、回って正しい向きにもどる
        const pf = S.deal.perm.filter((j) => j < hs.length), k = pf.indexOf(i), tp = (S.deal.tp || (S.deal.tp = {}));
        if (k >= 0) {
          fl = !!(S.deal.flip && S.deal.flip[k]); const t2 = tp[k] || (tp[k] = fl ? { h: 36 + Math.random() * 16, dl: Math.random() * 90 } : { h: 3 + Math.random() * 5, dl: 0 });
          const e = DS.st - t2.dl, cl = (v) => Math.max(0, Math.min(1, v)), ez = (u) => 1 - Math.pow(1 - u, 3), u1 = cl(e / SRT_L), u2 = cl((e - SRT_L) / SRT_S), u3 = cl((e - SRT_L - SRT_S) / SRT_D);
          const fx = handX(k, k === gapAt); x = Math.round(fx + (handX(i, i === gapAt) - fx) * ez(u2)); y = HY - Math.round(t2.h * ez(u1) * (1 - ez(u3)));
          if (fl) { const p = cl((e - SRT_L * 0.3) / (SRT_L + SRT_S * 0.8)); rot = p < 0.34 ? 180 : p < 0.67 ? 90 : 0; }
        }
      }
      const sel = s ? (!S.side && s.row === 0 && s.idx === i) : (!S.react && !S.side && S.mode === 'game' && !S.deal && S.curIdx != null && S.curIdx < hs.length && S.curIdx === i) || (!S.react && !S.side && S.mode === 'game' && !S.deal && S.curIdx != null && S.curIdx >= hs.length && hs.length % 3 !== 1 && i === hs.length - 1);
      const dim = s ? !allowed(s, h) : false;
      if (sel) y -= 8;
      const hl = S.react && S._hl && S._hl[h.t] > 0 ? (S._hl[h.t]--, true) : false;
      L.push({ h, x, y, sel, dim, hl, rot, flip: !DS.sorted && !!(S.deal && S.deal.flip && S.deal.flip[i]) });
    });
    const one = (o) => {
      const { h, x, y } = o;
      if (o.sel) { rrect(x - 5, y - 5, HW + 10, HH + 10, 6, YEL, 90); rrect(x - 3, y - 3, HW + 6, HH + 6, 5, YEL); } // 選んでいる牌: 角の丸い金色の枠(Edge版ふう)
      else if (o.hl) rrect(x - 3, y - 3, HW + 6, HH + 6, 4, YEL);
      if (o.rot === 90) tileR(h.t, x + (HW - HH) / 2, y + (HH - HW) / 2, HW, HH, h.red, false, 90);
      else if (o.rot === 180 || o.flip) tileR(h.t, x, y, HW, HH, h.red, false, 180); else tile(h.t, x, y, HW, HH, h.red, o.dim && !o.hl); // 配られている間は、ときどき逆さの牌がまじる(並べかえると、そろう)
      if (teacherOn() && S.hint && S.hint.tile && S.hint.tile.t === h.t && s && s.row === 0) text('★', x + 22, y - 20, 16, YEL, 1);
    };
    (DS.fly && DS.fly[0] || []).forEach((f) => { drawBlock(f, (handX(f.from, false) + handX(f.from + f.cnt - 1, false) + HW) / 2, HY + HH / 2); }); // 山から取った牌が、となりあわせのまま飛んでくる
    if (DS.sorted && S.deal && DS.st < SRT_L + SRT_S + SRT_D + 100) L.sort((a, b) => b.y - a.y); // 高く浮いている牌ほど、あとから(上に)描く
    L.forEach((o) => { if (!o.sel && !o.hl) one(o); });
    L.forEach((o) => { if (o.sel || o.hl) one(o); }); // 枠のある牌は、あとから描く(となりの牌に、枠が隠れないように)
    if (!p.drawn && DS.sorted && hs.length % 3 === 1 && !S.result) { const px = handX(hs.length, true), onSlot = !s && !S.react && !S.side && S.mode === 'game' && !S.deal && S.curIdx != null && S.curIdx >= hs.length; if (onSlot) { rrect(px - 3, HY - 3, HW + 6, HH + 6, 5, YEL); rrect(px, HY, HW, HH, 4, [60, 70, 60]); } else rrect(px, HY, HW, HH, 4, [0, 0, 0], 95); } // 14枚目の場所(まだ引いていない)。カーソルがあれば、そこに残る // まだ引いていない14枚目の場所に、黒い半透明の影(Edge版と同じ)
    drawMelds(p, 713 - meldWH(p, 31, 40), 398, 31, 40);
    if (s) {
      const bw = b0w(s.btns), tot = s.btns.length * bw + (s.btns.length - 1) * 14; let bx = Math.round(360 - tot / 2); // 雀卓の中央、自牌のすぐ上に、大きく出す
      s.btns.forEach((b, i) => { actBtn(bx, 332, bw, 44, b.label, '', s.row === 1 && s.idx === i, false, b.act); bx += bw + 14; });
      if (s.rm) { rrect(190, 296, 340, 30, 6, [0, 0, 0], 200); text('リーチする牌をえらんで決定', 360, 300, 19, YEL, 1); }
    }
    if (S.react) {
      const r = S.react; const ld = g.lastDiscard; const who = ld ? g.players[ld.by].name : '';
      if (ld) { { const lt = who + ' の ' + MJ.tileName(ld.tile.t); panel(8, 328, 230, 46, 6, [6, 44, 26], [90, 140, 110], 2, 235); tile(ld.tile.t, 14, 335, 26, 34, ld.tile.red); text(lt, 46, 338, fitSz(lt, 21, 186, 15), WHITE); } }
      let bx = 196; r.btns.forEach((b, i) => { actBtn(bx, 332, 124, 40, b.label, b.sub || '', r.idx === i && !r.pick, b.pass); bx += 124 + 14; });
      if (r.note) text(r.note, 246, 340, 20, YEL);
      if (r.pick) { // チーの組み合わせ
        const n = r.chis.length, gw = 118, pw = 150 + n * (gw + 8) + 6; panel(8, 268, pw, 58, 6, [10, 30, 22], [90, 140, 110], 2, 240); text('チーの組み合わせ', 18, 286, 18, YEL);
        r.chis.forEach((c, i) => { const gx = 150 + i * (gw + 8), ts = c.use.concat([ld.tile.t]).sort((a, b) => a - b); panel(gx, 273, gw, 48, 5, [20, 50, 36], r.pick.idx === i ? YEL : [120, 130, 120], r.pick.idx === i ? 3 : 1);
          ts.forEach((t, k) => { const tx = gx + 6 + k * 37; if (t === ld.tile.t) rrect(tx - 2, 276, 36, 43, 3, [255, 100, 150]); tile(t, tx, 278, 32, 40, t === ld.tile.t ? ld.tile.red : false); }); });
      }
    }
  }
  function drawTitle() {
    gfx.clear(32, 74, 60);
    gfx.image(skin('img/title_art.webp'), 0, 0, SW, SH, 255); // タイトルの文字は、絵に入っている
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
    if (UKIYO) { // 浮世絵版: 藍色の板に金の細い線(和風の、シンプルなボタン)。選んでいるボタンは朱色
      const wb = (i, x, y, w, h, label, sz, badge) => {
        const k = sc(i), W2 = Math.round(w * k), H2 = Math.round(h * k), X = Math.round(x - (W2 - w) / 2), Y = Math.round(y - (H2 - h) / 2), on = i === f, GOLD = [214, 176, 84];
        const R = Math.max(6, Math.min(10, Math.round(H2 * 0.15))), base = on ? [178, 38, 28] : [22, 38, 82]; // 角を丸く
        rrect(X + 2, Y + 4, W2, H2, R, [0, 0, 0], 110);
        if (on) rrect(X - 4, Y - 4, W2 + 8, H2 + 8, R + 4, pr ? [255, 240, 170] : [255, 252, 235]);
        rrect(X, Y, W2, H2, R, GOLD); rrect(X + 2, Y + 2, W2 - 4, H2 - 4, Math.max(2, R - 2), base);
        rrect(X + 6, Y + 6, W2 - 12, H2 - 12, Math.max(2, R - 5), GOLD); rrect(X + 7, Y + 7, W2 - 14, H2 - 14, Math.max(2, R - 6), base); // 内がわの細い金の線
        const fs = Math.round(sz * k), tw = gfx.measure(label, fs), ty = Y + Math.round((H2 - fs) / 2) - 1;
        if (badge) { const r = Math.round(fs * 0.62), bx = X + Math.round((W2 - tw) / 2) - r * 2 - 8; rrect(bx, ty + Math.round((fs - 2 * r) / 2) + 1, r * 2, r * 2, r, GOLD); text(badge, bx + r, ty + Math.round((fs - 2 * r) / 2) + 1 + Math.round((r * 2 - fs * 0.8) / 2) - 1, Math.round(fs * 0.8), [22, 38, 82], 1); text(label, X + Math.round(W2 / 2) + r + 4, ty, fs, [252, 244, 220], 1); } else text(label, X + Math.round(W2 / 2), ty, fs, [252, 244, 220], 1);
      };
      wb(0, (SW - 250) / 2, SH - 132, 250, 62, 'はじめる', 34, 'A');
      wb(1, (SW - 190) / 2, SH - 58, 190, 42, 'ゲーム終了', 22); // はじめるの下に、ひとまわり小さく
    } else {
    img('img/btn_start.webp', (SW - 250) / 2, SH - 140, 250, 78, 0);
    img('img/btn_exit.webp', (SW - 170) / 2, SH - 56, 170, 40, 1);
    }
  }
  function btnR(x, y, w, h, r, sel, off, label, sz, arrow) {
    if (sel) { rrect(x - 5, y - 5, w + 10, h + 10, r + 5, [30, 30, 30]); rrect(x - 3, y - 3, w + 6, h + 6, r + 3, [255, 255, 255]); rrect(x, y, w, h, r, pressing() ? [255, 246, 170] : [253, 213, 63]); if (pressing()) rrect(x - 9, y - 9, w + 18, h + 18, r + 9, [255, 255, 255], 90); }
    else rrect(x, y, w, h, r, off ? [200, 206, 200] : [238, 242, 236], off ? 200 : 245);
    if (arrow && sel) text('▶', x + 24, y + (h - (sz - 6)) / 2, sz - 6, BLACK);
    text(label, x + (arrow ? 80 : 66), y + (h - sz) / 2, sz, off ? [150, 156, 150] : BLACK);
  }
  const HOME_BOTTOM = [{ k: 'exit', label: 'ゲーム終了' }, { k: 'rank', label: '成績・' }, { k: 'diag', label: 'あなたの診断' }];
  function brownBtn(x, y, w, h, label, sel, sz) { // Edge版と同じ、茶色の板に金の縁のボタン
    if (sel) rrect(x - 4, y - 4, w + 8, h + 8, 10, pressing() ? [255, 246, 170] : [255, 255, 255]);
    rrect(x, y, w, h, 6, [201, 154, 61]); rrect(x + 2, y + 2, w - 4, h - 4, 4, sel ? [120, 84, 36] : [74, 52, 24]);
    text(label, x + w / 2, y + (h - (sz || 18)) / 2, sz || 18, sel ? [255, 245, 200] : [243, 227, 176], 1);
  }
  function drawHome() {
    gfx.clear(32, 74, 60);
    gfx.image('img/menu_bg.webp', 0, 0, SW, SH, 255);
    if (UKIYO) gfx.image('img/uk/logo.webp', 40, 0, 262, 159, 255); else gfx.image('img/logo.webp', 52, 22, 244, 139, 255); // 浮世絵版: タイトルの絵から切り抜いた、ぼかし楕円のロゴ
    rrect(21, 165, 292, 170, 16, [10, 18, 32], 150); // 左の説明: 半透明の黒い囲い(Edge版と同じ)
    const ot = (s, x, y, sz, c) => { [[-1, 1], [1, 1], [0, 2]].forEach((d) => text(s, x + d[0], y + d[1], sz, [0, 0, 0], 0)); text(s, x, y, sz, c, 0); };
    const HELP = { play: ['麻雀をはじめる', '3人の相手と、麻雀を', 'うちます。つづきから', '始めることもできます。'], quiz: ['麻雀クイズ', '問題に答えて、腕を', 'みがきます。苦手な問題', 'は、多めに出ます。'], study: ['麻雀の勉強', '点数計算・用語じてん', '・ビデオで、順番に', '学べます。'], diag: ['あなたの診断', '遊び方やクイズの結果', 'から、いいところと、', '伸ばせるところを見ます。'], settings: ['設定', '音の大きさや、CPUの', '速さ、ボタンの入れ替', 'えを変えます。'], exit: ['ゲーム終了', '遊ぶのをやめます。', '電源を切る前の画面へ', ''], rank: ['成績', 'いまの段位と、これま', 'での成績を見ます。', '対戦成績もここから。'] };
    { const its = homeItems(), key = S.homeBot ? HOME_BOTTOM[S.homeBotIdx].k : (its[S.menuIdx] || its[0]).act, hp = HELP[key] || HELP.play;
      ot(hp[0], 38, 177, 32, [255, 225, 74]); hp.slice(1).forEach((l, i) => ot(l, 38, 232 + i * 32, 23, WHITE)); }
    const items = homeItems(); const IY = [58, 145, 227, 309];
    items.forEach((it, i) => { const sel = !it.off && !S.homeBot && S.menuIdx === i && !S.teachQ && !S.playQ && !S.confirmQ; if (sel) btnR(370, IY[i] - (i ? 4 : 0), 433, 67, 7, true, false, it.label, 34, true); else btnR(383, IY[i], 408, 58, 7, false, it.off, it.label, 32, false); });
    const BW = [[150, 230]];
    HOME_BOTTOM.forEach((b, i) => {
      const row = i >> 1, col = i & 1, lab = b.k === 'rank' ? '成績・' + MJ.Rank.label() : b.k === 'teacher' ? teacherLabel() : b.label, sel = S.homeBot && S.homeBotIdx === i && !S.teachQ && !S.playQ && !S.confirmQ;
      const bxs = [21, 170, 21], bws = [143, 143, 292], bys = [345, 345, 397]; brownBtn(bxs[i], bys[i], bws[i], 44, lab, sel, 19); // 左の説明の枠に、左右をそろえた2段(上: 終了・成績 / 下: 診断)
    });
  }
  const swapOn = () => { try { const v = localStorage.getItem('mj_swapab'); return v === null ? true : v === '1'; } catch (e) { return true; } };
  try { __swapab(swapOn() ? 1 : 0); } catch (e) { /* ignore */ }
  const perfOn = () => { try { return localStorage.getItem('mj_perf') === '1' || !!globalThis.__perfEnv; } catch (e) { return false; } };
  const SETS = [
    { k: 'bgm', label: 'BGMの大きさ' }, { k: 'sfx', label: '効果音の大きさ' }, { k: 'voice', label: '声の大きさ' },
    { k: 'bgmon', label: 'BGM' }, { k: 'speed', label: 'CPUの速さ' }, { k: 'teacher', label: '麻雀先生' }, { k: 'swap', label: '決定ボタンの入れ替え' }, { k: 'rules', label: '麻雀のルール' }, { k: 'credits', label: 'クレジット' }, { k: 'back', label: 'もどる' },
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
    gfx.clear(32, 74, 60); gfx.image('img/menu_bg.webp', 0, 0, SW, SH, 255); fill(0, 0, SW, SH, [0, 0, 0], 150);
    text('麻雀のルール', SW / 2, 6, 28, YEL, 1);
    const n = RULE_ROWS.length + 2, i0 = S.ruleIdx || 0, VIS = 9, top = Math.max(0, Math.min(n - VIS, i0 - 4));
    for (let v = 0; v < VIS; v++) {
      const i = top + v, y = 44 + v * 38, sel = i === i0; if (i >= n) break;
      panel(70, y, 692, 35, 8, sel ? YEL : WHITE, sel ? [160, 110, 0] : [110, 110, 110], sel ? 3 : 2);
      if (i < RULE_ROWS.length) {
        const r = RULE_ROWS[i], cur = r.vals.find((q) => String(q[0]) === String(MJ.RULES[r.k])) || r.vals[0], common = String(COMMON_RULES[r.k]) === String(cur[0]);
        text(r.label, 90, y + 6, 20, BLACK); text('◀', 440, y + 7, 18, [90, 90, 80], 1); text(cur[1], 580, y + 6, 20, BLACK, 1); text('▶', 724, y + 7, 18, [90, 90, 80], 1);
        if (common) { rrect(290, y + 7, 72, 22, 4, [60, 140, 90]); text('おすすめ', 326, y + 6, 16, WHITE, 1); }
      } else text(i === RULE_ROWS.length ? 'おすすめの設定に もどす' : 'もどる', SW / 2, y + 6, 20, BLACK, 1);
    }
    const cur = i0 < RULE_ROWS.length ? RULE_ROWS[i0].note : (i0 === RULE_ROWS.length ? 'すべてのルールを、おすすめ(全国的な設定・赤ドラなし)にもどします。' : '');
    panel(70, 392, 692, 40, 8, [6, 44, 26], [90, 140, 110], 2, 235); text(cur, SW / 2, 402, 18, WHITE, 1);
    text('変えたルールは、次の対局から使われます', SW / 2, 438, 19, [205, 224, 212], 1);
  }
  function drawSettings() {
    gfx.clear(32, 74, 60); gfx.image('img/menu_bg.webp', 0, 0, SW, SH, 255); fill(0, 0, SW, SH, [0, 0, 0], 120);
    text('設定', SW / 2, 8, 30, YEL, 1);
    SETS.forEach((s, i) => {
      const y = 44 + i * 42, sel = S.setIdx === i; panel(110, y, 612, 38, 10, sel ? YEL : WHITE, sel ? [160, 110, 0] : [110, 110, 110], sel ? 4 : 2);
      text(s.label, 130, y + 5, 24, BLACK);
      if (s.k === 'bgm' || s.k === 'sfx' || s.k === 'voice') { const lv = NSND.getLevel(s.k); for (let j = 0; j < 10; j++) fill(380 + j * 30, y + 9, 24, 22, j < lv ? [30, 130, 80] : [200, 200, 195]); text(String(lv), 702, y + 6, 24, BLACK, 2); }
      else if (s.k === 'bgmon') text(NSND.on ? 'オン' : 'オフ', 520, y + 6, 24, BLACK, 1);
      else if (s.k === 'speed') text(MJ.CPU_SPEED_JP[MJ.cpuSpeed()], 520, y + 6, 24, BLACK, 1);
      else if (s.k === 'teacher') text(teacherOn() ? 'あり' : 'なし', 520, y + 6, 24, BLACK, 1);
      else if (s.k === 'perf') text(perfOn() ? 'オン' : 'オフ', 520, y + 6, 24, BLACK, 1);
      else if (s.k === 'swap') text(swapOn() ? '入れ替え' : 'ふつう', 520, y + 6, 24, BLACK, 1);
      else if (s.k === 'rules' || s.k === 'credits') text('▶', 600, y + 5, 24, BLACK, 1);
    });
  }
  /* ---------- 対局のはじめの演出: 顔の登場 → 東一局 → 勝負! → サイコロ ---------- */
  const SEATPOS = { 0: [SW / 2 - 28, 372], 1: [SW - 190, 130], 2: [SW / 2 - 28, 16], 3: [110, 130] };
  function seatBox(p, s, x, y, big, wind) {
    const fs = big ? 64 : 56; face(p, x, y, fs, fs);
    text(p.name, x + fs / 2, y + fs + 4, 20, WHITE, 1);
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
    if (t > 0) { try { gfx.imageTop(youSrc(), 60, 336, 92, 92); } catch (e) { /* ignore */ } pl(P[0], 204, 366, 0); wc(P[0], 18, 340); }
    const T1 = it.t1 || 1700; // 「勝負!」を出す時刻(局の読み上げが、ながいときは、おわるまで待つ)
    if (t > 400 && !it.v1) { it.v1 = 1; S.skipKyokuVoice = true; try { const d = NSND.readKyoku(g); it.t1 = Math.max(1700, 400 + Math.round((d || 0) * 1000) + 350); } catch (e) { /* ignore */ } }
    if (t >= T1 && !it.v2) { it.v2 = 1; NSND.sfx('slam'); try { snd.play('audio/voice/intro_w2.mp3', 0.9); } catch (e) { /* ignore */ } }
    if (t > 400 && t < T1) { const k = Math.min(1, (t - 400) / 160), sz = k < 0.5 ? 96 : 78; fill(192, 190, 448, 90, [0, 0, 0], 170); text(g.kyokuLabel().split(' ')[0], SW / 2, 235 - sz / 2, sz, YEL, 1); }
    if (t >= T1 && t < T1 + 1200) { const k = Math.min(1, (t - T1) / 160), sz = k < 0.5 ? 110 : 90; fill(192, 180, 448, 110, [0, 0, 0], 170); [[-3, 0], [3, 0], [0, -3], [0, 3]].forEach((dd) => text('勝負!', SW / 2 + dd[0], 235 - sz / 2 + dd[1], sz, [255, 255, 255], 1)); text('勝負!', SW / 2, 235 - sz / 2, sz, [225, 40, 30], 1); }
    if (t > 300) shotOnce('intro1'); if (t > 1000) shotOnce('intro2'); if (t > 2200) shotOnce('intro3');
    if (t >= T1 + 1200) { S.intro = null; it.done(); }
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
      fill(x, y, fs, fs, [90, 110, 100]);
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
    if (rt > 1500 && !d.v1) { d.v1 = 1; NSND.sfx('slam'); try { const dur = NSND.readKyoku(g); d.T2 = Math.max(2900, 1500 + Math.round((dur || 0) * 1000) + 350); } catch (e) { /* ignore */ } } // 「勝負!」は、局の読み上げが おわってから
    const T2 = d.T2 || 2900;
    if (rt > T2 && !d.v2) { d.v2 = 1; NSND.sfx('slam'); try { snd.play('audio/voice/intro_w2.mp3', 0.9); } catch (e) { /* ignore */ } }
    if (rt > T2 + 1200 && !d.fin) { d.fin = true; const r = S.dice; S.dice = null; r.done(d.target); }
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
    } else if (rt < T2) { const k = Math.min(1, (rt - 1500) / 160), sz2 = k < 0.5 ? 96 : 78; fill(192, 174, 448, 122, [0, 0, 0], 200); text(g.kyokuLabel().split(' ')[0], SW / 2, 235 - sz2 / 2, sz2, YEL, 1); }
    else { const k = Math.min(1, (rt - T2) / 160), sz2 = k < 0.5 ? 110 : 90; fill(192, 174, 448, 122, [0, 0, 0], 200); [[-3, 0], [3, 0], [0, -3], [0, 3]].forEach((dd) => text('勝負!', SW / 2 + dd[0], 235 - sz2 / 2 + dd[1], sz2, [255, 255, 255], 1)); text('勝負!', SW / 2, 235 - sz2 / 2, sz2, [225, 40, 30], 1); }
    if (d.settled && __now() - d.t1 > 100) shotOnce('dice2'); if (d.rolling && now - d.t0 > 400) shotOnce('dice1');
    if (d.started || true) dirty();
  }
  /* ---------- 対戦成績の画面 ---------- */
  function drawStats() {
    const R = MJ.Rank, f = R.info(), s = f.s, pg = S.statsPg;
    gfx.clear(14, 40, 30); gfx.image('img/menu_bg.webp', 0, 0, SW, SH, 255); fill(0, 0, SW, SH, [0, 0, 0], 150);
    text('対戦成績', SW / 2, 12, 30, YEL, 1);
    const total = s.games || 0, avg = total ? ((s.ranks[0] + s.ranks[1] * 2 + s.ranks[2] * 3 + s.ranks[3] * 4) / total).toFixed(1) : '-';
    gfx.image(youSrc(), 40, 70, 150, 150, 255); text(f.name, 115, 230, 26, YEL, 1); text('平均順位 ' + avg + '位', 115, 266, 22, WHITE, 1);
    s.ranks.forEach((c, i) => { const y = 70 + i * 40; text((i + 1) + '位', 230, y + 6, 20, WHITE); text(c + '回', 330, y + 6, 20, YEL, 2); fill(345, y + 4, 200, 24, [60, 70, 66]); fill(345, y + 4, total ? Math.round(200 * c / total) : 0, 24, [230, 190, 70]); });
    text('対局数 ' + total + '    1位の割合 ' + (total ? Math.round(s.ranks[0] / total * 100) : 0) + '%', 230, 236, 18, WHITE);
    const opps = Object.keys(s.opp).map((id) => ({ c: MJ.CHARS.find((x) => x.id === +id), o: s.opp[id] })).filter((x) => x.c).sort((a, b) => b.o.n - a.o.n);
    const pages = Math.max(1, Math.ceil(opps.length / 3)), cur = opps.slice(pg * 3, pg * 3 + 3);
    if (!cur.length) text('まだ、対戦の記録がありません。', 600, 120, 18, WHITE, 1);
    cur.forEach((x, i) => { const y = 70 + i * 92; fill(560, y, 252, 84, [235, 235, 225], 235); gfx.image(skin(x.c.face), 566, y + 6, 72, 72, 255); text(x.c.short || x.c.name, 646, y + 8, 18, BLACK); text('対戦 ' + x.o.n + '回', 646, y + 34, 15, [70, 70, 70]); text('勝ち ' + x.o.w + '  勝率 ' + Math.round(x.o.w / x.o.n * 100) + '%', 646, y + 56, 15, [20, 90, 50]); });
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
      if (win.has(i)) { rrect(x + 202, y + 46, 64, 24, 4, [214, 48, 40]); text('上がり', x + 234, y + 47, 19, WHITE, 1); }
      text(String(r.after[i]), x + w - 150, y + 14, 36, YEL, 2); text((d > 0 ? '+' : '') + d, x + w - 18, y + 20, 26, d > 0 ? [120, 230, 140] : d < 0 ? [255, 120, 100] : GREY, 2);
    });
    text('決定ボタンで 次へ', SW / 2, 420, 20, [205, 224, 212], 1);
  }
  /* 流局の結果(Edge版と同じ流れ): 顔つきの4枚のカード。1人ずつ読み上げに合わせて見せる。テンパイの人は手牌と待ちを公開、ノーテンの人は選んで決定で見られる */
  function drawDrawResult(r) {
    const g = S.game, rd = r.rd, P = g.players, CW = 172, CG = 8, X0 = 60, CY = 82, CH = 166;
    text('流局', SW / 2, 16, 40, YEL, 1); text(g.kyokuLabel().split(' ')[0] + ' ／ 山の牌がなくなりました', SW / 2, 58, 18, GREY, 1);
    P.forEach((p, i) => {
      const x = X0 + i * (CW + CG), sh = i < rd.shown, ten = r.tenpai[i], d = r.delta[i];
      if (rd.sel === i && !rd.reading) rrect(x - 4, CY - 4, CW + 8, CH + 8, 10, YEL); else if (rd.now === i) rrect(x - 4, CY - 4, CW + 8, CH + 8, 10, [255, 211, 90]);
      rrect(x, CY, CW, CH, 8, sh ? [30, 70, 56] : [22, 56, 44]);
      if (rd.pop < 0) face(p, x + (CW - 64) / 2, CY + 6, 64, 64); if (!sh) fill(x + (CW - 64) / 2, CY + 6, 64, 64, [22, 56, 44], 150);
      text(p.name, x + CW / 2, CY + 74, fitSz(p.name, 20, CW - 12, 14), sh ? WHITE : GREY, 1);
      if (sh) {
        text(ten ? 'テンパイ' : 'ノーテン', x + CW / 2, CY + 96, 26, ten ? YEL : GREY, 1);
        text((d > 0 ? '+' : d < 0 ? '' : '±') + d, x + CW / 2, CY + 120, 20, d > 0 ? [120, 230, 140] : d < 0 ? RED : GREY, 1);
        text(r.after[i] + '点', x + CW / 2, CY + 143, 16, WHITE, 1);
      }
    });
    let y = CY + CH + 8; // テンパイの人: 手牌と待ち(読み上げのあとで出る)
    P.forEach((p, i) => {
      if (!r.tenpai[i] || i >= rd.shown) return;
      rrect(52, y - 2, 740, 36, 6, [30, 70, 56], 150); text(p.name, 62, y + 5, fitSz(p.name, 18, 108, 12), WHITE);
      let x = 180; const v = r.hands[i];
      v.concealed.forEach((h) => { tile(h.t, x, y, 24, 32, h.red); x += 25; });
      (v.melds || []).forEach((m) => { x += 8; m.tiles.forEach((h) => { tile(h.t, x, y, 24, 32, h.red); x += 25; }); });
      const ws = rd.waits[i] || []; if (ws.length) { text('待ち', 560, y + 6, 18, YEL); ws.slice(0, 8).forEach((t, k) => tile(t, 600 + k * 24, y, 22, 30)); }
      y += 36;
    });
    text('テンパイの人が、ノーテンの人から合計3000点を受け取ります', 60, 422, 15, GREY); if (!rd.reading) text('← → えらぶ    決定: 手牌を見る', 60, 440, 15, GREY);
    if (!rd.reading) button(600, 414, 192, 38, '次へ', rd.sel === 4);
    if (rd.pop >= 0) {
      const p = P[rd.pop], v = r.hands[rd.pop], all = v.concealed.map((h) => h).concat((v.melds || []).reduce((a, m) => a.concat(m.tiles), [])), tw = 46;
      overlay(170); panel(60, 130, 712, 210, 16, [14, 50, 38], [240, 210, 120], 3);
      text(p.name + 'の手牌(' + (r.tenpai[rd.pop] ? 'テンパイ' : 'ノーテン') + ')', SW / 2, 142, 26, YEL, 1);
      const x0 = Math.round((SW - all.length * tw) / 2); all.forEach((h, k) => tile(h.t, x0 + k * tw, 190, 42, 56, h.red));
      const ws = rd.waits[rd.pop] || []; if (ws.length) { text('待ち', 300, 266, 22, YEL); ws.slice(0, 8).forEach((t, k) => tile(t, 350 + k * 30, 260, 26, 36)); }
      text('決定・もどる で とじる', SW / 2, 312, 18, GREY, 1);
    }
  }
  function drawResult(r) {
    const g = S.game; stage(); rrect(40, 12, 752, 444, 8, [10, 38, 30]);
    if (r.type === 'win') {
      const w = r.wins[0], res = w.res, v = w.view;
      face(w.winner, 58, 24, 48, 48);
      text(w.winner.name, 120, 28, 30, WHITE); { const nw = gfx.measure(w.winner.name, 30); rrect(120 + nw + 14, 30, 84, 34, 10, w.tsumo ? [60, 130, 200] : [210, 60, 50]); text(w.tsumo ? 'ツモ' : 'ロン', 120 + nw + 56, 35, 22, WHITE, 1);
        const sw = g ? g.seatWindOf(w.winner) : 0, lab = WIND[sw] + '家' + (sw === 0 ? '(親)' : ''), lx = 120 + nw + 112, lw = gfx.measure(lab, 22) + 24;
        rrect(lx, 30, lw, 34, 10, [255, 255, 255]); rrect(lx + 2, 32, lw - 4, 30, 8, WIND_BG[sw]); text(lab, lx + lw / 2, 35, 22, WHITE, 1); }
      if (r.total > 1) text((r.idx + 1) + ' / ' + r.total + ' 人目の上がり', 760, 34, 20, GREY, 2);
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
    } else if (r.rd) { drawDrawResult(r);
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
      rrect(x, y0, 168, 54, 10, [24, 56, 46]); text(p.name, x + 10, y0 + 2, fitSz(p.name, 20, 96, 14), WHITE);
      { const bt = r.before[i] + ' → ' + r.after[i]; text(bt, x + 10, y0 + 29, fitSz(bt, 20, 150, 13), GREY); } text((d > 0 ? '+' : '') + d, x + 158, y0 + 4, 18, d > 0 ? [120, 230, 140] : d < 0 ? RED : GREY, 2);
    });
  }
  function drawEnd(f) {
    gfx.clear(32, 74, 60); fill(0, 0, 720, 428, [36, 80, 64], 255); fill(0, 0, 720, 58, [10, 58, 38]); fill(0, 58, 720, 3, [230, 190, 70]);
    text('対局終了', 360, 8, 40, YEL, 1);
    const MED = [[236, 190, 52], [190, 196, 204], [205, 133, 72], [120, 140, 130]], RH = 58, GAP = 5, Y0 = 70;
    f.results.forEach((o, i) => {
      const y = Y0 + i * (RH + GAP), me = o.p.isHuman, mc = MED[Math.min(3, o.rank - 1)];
      rrect(60, y, 600, RH, 8, [0, 0, 0], 70); rrect(58, y - 2, 600, RH, 8, me ? [255, 236, 130] : [244, 247, 240]);
      rrect(58, y - 2, 12, RH, 6, mc); rrect(64, y - 2, 6, RH, 0, me ? [255, 236, 130] : [244, 247, 240]);
      text(o.rank + '位', 80, y + 8, 38, o.rank === 1 ? [190, 130, 0] : BLACK);
      face(o.p, 170, y + 1, RH - 6, RH - 6);
      text(o.p.name, 246, y + 10, fitSz(o.p.name, 34, 250, 20), BLACK);
      text(String(o.p.score), 640, y + 8, 42, BLACK, 2);
    });
    const rk = f.rk, yb = Y0 + 4 * (RH + GAP) + 2;
    if (rk) {
      rrect(60, yb, 600, 64, 8, [10, 58, 38]);
      const d = rk.delta, col = d > 0 ? [140, 240, 150] : d < 0 ? [255, 130, 120] : WHITE;
      text('段位ポイント', 80, yb + 8, 24, WHITE); text((d > 0 ? '+' : '') + d + ' 点', 290, yb + 5, 32, col);
      text(rk.msg ? rk.msg.replace('🎉 ', '') : (rk.name + (rk.next ? '   あと ' + rk.left + ' 点で ' + rk.next : '')), 640, yb + 10, fitSz(rk.msg || rk.name, 22, 330, 14), YEL, 2);
      if (rk.avg != null) text('相手の強さ ★' + rk.avg.toFixed(1) + (Math.abs(rk.mult - 1) >= 0.05 ? '  →  ポイント ×' + rk.mult.toFixed(2) + (rk.mult > 1 ? '(強い相手ボーナス)' : '(弱い相手)') : '(ふつう)'), 80, yb + 41, 16, [200, 225, 205]);
    }
    text('決定ボタンで ホームへ', 360, 398, 24, WHITE, 1);
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
    text('0にすると、その音が消えます。対局は、とじるまで止まります。', 360, y0 + 58 + 4 * 52, 19, [190, 205, 195], 1);
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
    text('◀ ▶ で えらんで 決定ボタン', 360, 366, 20, [205, 224, 212], 1); text('えらんだあとは、自動で次へ進みます', 360, 394, 15, [150, 180, 160], 1);
  }
  function drawDialog(title, items, idx, note) {
    overlay(190); const h = 70 + items.length * 50; const y0 = Math.round((H - h) / 2);
    panel(150, y0, 420, h, 16, [20, 60, 42], [240, 210, 120], 3);
    text(title, 360, y0 + 12 + Math.round((22 - fitSz(title, 22, 396, 15)) / 2), fitSz(title, 22, 396, 15), YEL, 1);
    items.forEach((l, i) => button(190, y0 + 48 + i * 50, 340, 40, l, idx === i));
    if (note) text(note, 360, y0 + h + 6, 19, WHITE, 1);
  }

  /* ---------- 麻雀クイズ と 点数計算の勉強(学習コーナー) ---------- */
  /* 問題づくりは Edge版と同じ js/drill.js、学習の中身は native/app/learn.js */
  const mark = (h) => htmlText(h).replace(/\u{1F947}/gu, '1位').replace(/\u{1F948}/gu, '2位').replace(/\u{1F949}/gu, '3位').replace(/[\u{1F000}-\u{1FFFF}\u2600-\u27BF\uFE0F]/gu, '').replace(/\s+\n/g, '\n').trim(); // Pi には絵文字のフォントがないので、絵文字は けす
  const CREAM = [244, 241, 228], GREEN = [44, 90, 26], GREEN2 = [30, 66, 18], INK = [28, 28, 24], QRED = [226, 62, 42];
  let rubyRE = null, rubyN = -1;
  function rubyMatch() { const d = (MJ.Ruby && MJ.Ruby.dict) || {}, ks = Object.keys(d); if (ks.length !== rubyN) { rubyN = ks.length; ks.sort((a, b) => b.length - a.length); rubyRE = ks.length ? new RegExp(ks.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null; } return rubyRE; }
  const rsz = (sz) => Math.max(10, Math.round(sz * 0.5));
  function richWrap(str, sz, maxw) { // 文字・牌の絵(⟦番号⟧)・ふりがなつきの言葉を、幅に収まるように、行に分ける
    const lines = []; const tw = Math.round(sz * 0.8), dict = (MJ.Ruby && MJ.Ruby.dict) || {}, re = rubyMatch();
    String(str).split('\n').forEach((para) => {
      let cur = [], w = 0;
      const push = (tk, ww) => { if (w + ww > maxw && cur.length && !(tk.s && tk.s.length === 1 && '。、,.」』)）!?!?…ー'.includes(tk.s))) { lines.push(cur); cur = []; w = 0; } cur.push(tk); w += ww; }; // 「。」などが、行の先頭に1つだけ残らないように
      para.split(/(⟦\d+⟧)/).filter((x) => x !== '').forEach((seg) => {
        const m = /^⟦(\d+)⟧$/.exec(seg); if (m) { push({ tile: +m[1] }, tw + 2); return; }
        let last = 0; if (re) { re.lastIndex = 0; let mm; while ((mm = re.exec(seg))) { const nx = seg[mm.index + mm[0].length]; if (nx === '(' || nx === '(') continue; for (const ch of seg.slice(last, mm.index)) push({ s: ch }, gfx.measure(ch, sz)); const rd = dict[mm[0]]; push({ s: mm[0], r: rd }, Math.max(gfx.measure(mm[0], sz), gfx.measure(rd, rsz(sz)))); last = mm.index + mm[0].length; } }
        for (const ch of seg.slice(last)) push({ s: ch }, gfx.measure(ch, sz));
      });
      lines.push(cur);
    });
    return lines;
  }
  const lineRu = (ln) => ln.some((tk) => tk.r);
  const lineH = (sz, ru) => Math.round(sz * 1.28) + (ru ? rsz(sz) + 2 : 0);
  const richH = (lines, sz) => lines.reduce((a, ln) => a + lineH(sz, lineRu(ln)), 0);
  function fitRich(str, sizes, maxw, maxh) { // 入りきる いちばん大きな字で。入らなければ、いちばん小さな字(それでも入らないときだけ、はみ出す)
    let last = null; for (const sz of sizes) { const ls = richWrap(str, sz, maxw); last = { sz, lines: ls, h: richH(ls, sz) }; if (last.h <= maxh) return last; } return last;
  }
  function richDraw(lines, x, y, sz, col, lh, center) { // 行の高さは、ふりがながある行だけ ふやす
    const tw = Math.round(sz * 0.8), th = Math.round(sz * 1.12), rs = rsz(sz); let yy = y;
    lines.forEach((ln) => {
      const ru = lineRu(ln); let w = 0; ln.forEach((tk) => { w += tk.tile != null ? tw + 2 : tk.r ? Math.max(gfx.measure(tk.s, sz), gfx.measure(tk.r, rs)) : gfx.measure(tk.s, sz); });
      const rx = center ? x - Math.round(w / 2) : x, ty = yy + (ru ? rs + 2 : 0);
      let run = '', sx = rx; const flush = () => { if (run) { text(run, sx, ty, sz, col); sx += gfx.measure(run, sz); run = ''; } };
      ln.forEach((tk) => {
        if (tk.tile != null) { flush(); tile(tk.tile, sx, ty - 1, tw, th); sx += tw + 2; }
        else if (tk.r) { flush(); const ww = Math.max(gfx.measure(tk.s, sz), gfx.measure(tk.r, rs)); text(tk.r, sx + ww / 2, ty - rs - 1, rs, col, 1); text(tk.s, sx + (ww - gfx.measure(tk.s, sz)) / 2, ty, sz, col); sx += ww; }
        else run += tk.s;
      });
      flush(); yy += lineH(sz, ru);
    });
  }
  const RCATS = ['eff', 'def', 'call', 'yaku', 'wait', 'push', 'riichi', 'keep'];
  const catGen = (t) => { const D = MJ.Drill; return ({ eff: [D.genEff], def: [D.genDef], call: [D.genCall], yaku: [D.genYaku], wait: [D.genWait], push: [D.genPush], riichi: [D.genRiichi], keep: [D.genKeep] })[t] || (MJ.Learn && MJ.Learn.TAGGEN[t]); };
  function weightedGens(tags, boost) { // 苦手な種類ほど、多く出す
    const ws = MJ.Stats.weights(tags), out = [];
    tags.forEach((t, i) => { const g = catGen(t); if (!g) return; const w = ws[i] + (boost && boost.includes(t) ? 6 : 0); for (let k = 0; k < w; k++) g.forEach((f) => out.push(f)); });
    return out;
  }
  function startPractice() { // 苦手な種類を、多めに出すクイズ
    const weak = MJ.Stats.weakest(2, 3), tags = RCATS.concat(weak.filter((t) => !RCATS.includes(t)));
    startQuiz({ title: weak.length ? '苦手をねらい撃ち' : '麻雀クイズ', gens: () => weightedGens(tags, weak), n: 10 });
  }
  function startQuiz(opts) { // opts: { title, gens, n, onEnd(ok, n) }
    S.mode = 'quiz'; S.quiz = Object.assign({ n: 0, ok: 0, phase: 'gen', p: null, idx: 0, res: null, scroll: 0 }, { title: opts.title, gens: opts.gens, total: opts.n, onEnd: opts.onEnd }); quizNext(); dirty();
  }
  function quizNext() {
    const q = S.quiz; if (!q) return;
    if (q.n >= q.total) { q.phase = 'end'; dirty(); return; }
    q.phase = 'gen'; q.p = null; q.res = null; q.scroll = 0; q.idx = 0; dirty();
    setTimeout(() => {
      if (S.mode !== 'quiz' || S.quiz !== q) return;
      const gens = q.gens(); let p = null;
      for (let i = 0; i < 14 && !p; i++) { try { p = gens[Math.floor(Math.random() * gens.length)](); } catch (e) { print('quiz gen err ' + (e && e.stack || e)); } }
      if (!p) { q.phase = 'fail'; dirty(); return; }
      q.p = p; q.n++; q.phase = 'ask'; q.idx = 0;
      q.disp = (p.hand || []).slice().sort((a, b) => a.t - b.t);
      { const hs = mark(p.sit || '') + (p.sit ? '\n' : '') + mark(p.prompt || ''), f = fitRich(hs, [30, 28, 26, 24, 22, 20, 18], 770, p.kind === 'choice' ? 140 : 262); q.hsz = f.sz; q.head = f.lines; }
      q.opts = (p.options || []).slice(0, 4).map((o) => { const f = fitRich(mark(o.html), [28, 26, 24, 22, 20, 18], 290, 50); return { id: o.id, lines: f.lines, sz: f.sz, h: f.h }; });
      dirty();
    }, 60);
  }
  function quizAnswer(ans) {
    const q = S.quiz, p = q.p; let r = null;
    try { r = p.grade(ans); } catch (e) { print('quiz grade err ' + (e && e.stack || e)); r = { r: 'ng', html: '<p>採点できませんでした。</p>' }; }
    try { MJ.Stats.quiz(p, r.r === 'ok'); } catch (e) { /* ignore */ }
    q.res = r; q.phase = 'res'; q.scroll = 0; if (r.r === 'ok') q.ok++; NSND.sfx(r.r === 'ok' ? 'ok' : 'ng', 0.7); q.wrongRun = r.r === 'ng' ? (q.wrongRun || 0) + 1 : 0; r.alt = r.r === 'ng' && q.wrongRun % 2 === 0; // つづけて まちがえたとき、2回目は「ちがうよ」(同じ声ばかりにならないように)
    setTimeout(() => { try { NSND.speak(NSND.nanoda(['q:' + (r.r === 'ok' ? '正解' : r.r === 'near' ? 'おしい' : r.alt ? 'ちがうよ' : '不正解')])); } catch (e) { /* ignore */ } }, 500); // 答え合わせの声
    { // 解説は、入りきる大きさの字で出す。長いときは、おまけの説明(小さな注)と、うしろの段落を はぶいて、スクロールさせない
      const paras = mark(String(r.html).replace(/<div class="cc-s">[\s\S]*?<\/div>/g, '')).split('\n').filter((x) => x.trim() !== '');
      let f = null; while (paras.length) { f = fitRich(paras.join('\n'), [28, 26, 24, 22, 20], 730, 236); if (f.h <= 236 || paras.length <= 1) break; paras.pop(); }
      if (!f) f = fitRich('', [20], 730, 236); q.rsz = f.sz; q.rlines = f.lines; q.rh = f.h;
    } dirty();
  }
  function quizClose() { const q = S.quiz; S.quiz = null; if (q && q.onEnd) q.onEnd(q.ok, q.total, true); else { S.mode = 'menu'; } dirty(); }
  function quizKey(k) {
    const q = S.quiz; if (!q) { S.mode = 'menu'; return; }
    if (q.confirm) { // 「ホームにもどりますか?」(つづける / ホームにもどる)
      if (k === 'left' || k === 'right' || k === 'up' || k === 'down') q.confirm.idx = 1 - q.confirm.idx;
      else if (k === 'back') q.confirm = null;
      else if (k === 'ok') { const go = q.confirm.idx === 1; q.confirm = null; if (go) { const o = q.onEnd; S.quiz = null; if (o) o(q.ok, q.total, false); else S.mode = 'menu'; } }
      dirty(); return;
    }
    if (k === 'back') { if (q.phase === 'end') { quizClose(); return; } q.confirm = { idx: 0 }; dirty(); return; }
    if (q.phase === 'gen') return;
    if (q.phase === 'fail') { if (k === 'ok') quizNext(); return; }
    if (q.phase === 'end') { if (k === 'ok') quizClose(); return; }
    if (q.phase === 'ask') {
      const p = q.p;
      if (p.kind === 'tile') { const n = q.disp.length; if (k === 'left') q.idx = wrap(q.idx - 1, n); else if (k === 'right') q.idx = wrap(q.idx + 1, n); else if (k === 'ok') quizAnswer(q.disp[q.idx]); }
      else { const n = q.opts.length; if (k === 'left' || k === 'right') q.idx = wrap(q.idx + (k === 'left' ? -1 : 1), n); else if (k === 'up') q.idx = Math.max(0, q.idx - 2); else if (k === 'down') q.idx = Math.min(n - 1, q.idx + 2); else if (k === 'ok') quizAnswer(q.opts[q.idx].id); }
      dirty(); return;
    }
    if (q.phase === 'res') {
      const mx = Math.max(0, q.rlines.length - 1);
      if (k === 'up') q.scroll = Math.max(0, q.scroll - 1); else if (k === 'down') q.scroll = q.rh > 236 ? Math.min(mx, q.scroll + 1) : 0; else if (k === 'ok') quizNext();
      dirty();
    }
  }
  function quizFrame(title, left, right, hint) { // 暗い背景(ホームと同じ絵を暗くしたもの)の上に、文字を出す
    gfx.clear(14, 40, 30); gfx.image('img/menu_bg.webp', 0, 0, SW, SH, 255); fill(0, 0, SW, SH, [0, 0, 0], 165); fill(0, 48, SW, 2, [150, 190, 140], 160);
    if (left) text(left, 24, 8, 28, WHITE); if (title) { const sz = gfx.measure(title, 28) > 440 ? 22 : 28; text(title, SW / 2, sz === 28 ? 8 : 12, sz, YEL, 1); } if (right) text(right, SW - 24, 14, 18, YEL, 2);
    if (hint) { let hs = 20; while (hs > 15 && gfx.measure(hint, hs) > SW - 40) hs--; text(hint, SW / 2, SH - 29, hs, [210, 225, 205], 1); }
  }
  function drawQuiz() {
    const q = S.quiz; const p = q.p;
    if (q.phase === 'gen') { quizFrame(q.title, '', '', ''); text('問題を作っています…', SW / 2, 200, 28, WHITE, 1); return; }
    if (q.phase === 'fail') { quizFrame(q.title, '', '', ''); text('問題を作れませんでした', SW / 2, 180, 26, WHITE, 1); text('決定ボタンで もう一度', SW / 2, 230, 20, GREY, 1); return; }
    if (q.phase === 'end') {
      const pass = q.ok >= Math.ceil(q.total * 0.8);
      quizFrame(q.title, '', '', '決定ボタンで すすむ'); text('おつかれさまでした', SW / 2, 80, 34, YEL, 1); text(q.total + '問中  ' + q.ok + '問  せいかい', SW / 2, 150, 44, WHITE, 1);
      tFace(pass ? 'ok' : 'cheer', 'qe' + q.total + q.ok, SW - 240, 250, 170);
      text(q.onEnd && q.learn ? (pass ? 'ごうかく! 「おぼえた」に しました' : 'もう一度 読んで、またチャレンジしましょう') : (q.ok >= 8 ? 'すばらしい! 本格派ですね' : q.ok >= 5 ? 'よくできました' : 'またチャレンジしましょう'), SW / 2, 240, 24, [255, 190, 150], 1); return;
    }
    if (q.phase === 'res') {
      const r = q.res.r, col = r === 'ok' ? [255, 110, 90] : r === 'near' ? [255, 200, 70] : [200, 210, 200];
      quizFrame(p.title || q.title, '第 ' + q.n + ' 問', '正解 ' + q.ok, '決定ボタンで 次の問題へ');
      rrect(36, 62, 120, 44, 12, r === 'ok' ? QRED : r === 'near' ? [210, 140, 20] : [100, 110, 100]); text(r === 'ok' ? '正解' : r === 'near' ? 'おしい' : q.res.alt ? 'ちがうよ' : 'ハズレ', 96, 70, 28, WHITE, 1);
      text(r === 'ok' ? 'よくできました!' : r === 'near' ? 'あと一歩です' : '解説を読んで、覚えましょう', 176, 70, 26, col);
      tFace(r === 'ok' ? 'ok' : r === 'near' ? 'cheer' : 'pass', 'r' + q.n + (q.title || ''), SW - 118, 52, 78); // 麻雀先生
      panel(24, 132, SW - 48, 258, 14, [6, 28, 18], [140, 190, 130], 3, 235); rrect(44, 118, 86, 30, 14, [60, 130, 60]); text('解説', 87, 120, 20, WHITE, 1);
      gfx.clip(30, 138, SW - 60, 246); richDraw(q.rlines.slice(q.scroll), 48, 148, q.rsz, WHITE, 0); gfx.clip();
      if (q.rh > 236) text((q.scroll > 0 ? '▲ ' : '') + '▼ つづき', SW - 30, 398, 18, GREY, 2);
      return;
    }
    quizFrame(p.title || q.title, '第 ' + q.n + ' 問', '正解 ' + q.ok, p.kind === 'tile' ? '◀ ▶ で牌をえらんで 決定ボタン(切る牌)' : '◀ ▶ ▲ ▼ で えらんで 決定ボタン');
    tFace('advice', 'q' + q.n + (q.title || ''), SW - 196, 3, 44);
    richDraw(q.head, 30, 54, q.hsz, WHITE, 0);
    if (p.kind === 'choice') q.opts.forEach((o, i) => {
      const x = 30 + (i % 2) * 394, y = 202 + Math.floor(i / 2) * 62, sel = q.idx === i;
      panel(x, y, 378, 54, 14, sel ? YEL : WHITE, sel ? [160, 110, 0] : GREEN, sel ? 4 : 3, 255); rrect(x + 10, y + 10, 34, 34, 17, sel ? [160, 110, 0] : GREEN); text('ABCD'[i], x + 27, y + 12, 24, WHITE, 1);
      richDraw(o.lines, x + 44 + 167, y + Math.round((54 - o.h) / 2), o.sz, INK, 0, true);
    });
    const n = q.disp.length, x0 = Math.round((SW - (n * 48 + (p.win ? 62 : 0))) / 2), HYq = 342;
    q.disp.forEach((h, i) => { const sel = p.kind === 'tile' && q.idx === i, x = x0 + i * 48, y = HYq - (sel ? 12 : 0); if (sel) { rrect(x - 5, y - 5, 54, 68, 7, [160, 110, 0]); rrect(x - 3, y - 3, 50, 64, 6, YEL); } tile(h.t, x, y, 44, 58, h.red); });
    if (p.win) { const x = x0 + n * 48 + 14; text('上がり牌', x + 22, HYq - 26, 18, YEL, 1); frame(x - 2, HYq - 2, 48, 62, YEL, 2); tile(p.win.t, x, HYq, 44, 58, p.win.red); }
    if (p.melds && p.melds.length) { let mx = 30; p.melds.forEach((m) => { (m.tiles || []).forEach((tl) => { tile(tl.t, mx, 402, 20, 26, tl.red); mx += 22; }); mx += 8; }); text('鳴いている牌', mx + 4, 404, 18, GREY); }
  }
  /* ---------- 麻雀用語じてん(勉強の中から開く。データは dictdata.js = Edge版の用語辞典) ---------- */
  const DCAT = [['基本・牌', '牌の呼び方'], ['役', '役'], ['点数・符', '点数・符'], ['待ち・形', '待ちと形'], ['鳴き', '鳴き'], ['守備・押し引き', '守りと攻め'], ['局・ルール', '局とルール'], ['俗称・スラング', '俗称']];
  const KROW = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ'], KSET = 'あいうえおぁぃぅぇぉ|かきくけこがぎぐげご|さしすせそざじずぜぞ|たちつてとだぢづでど|なにぬねの|はひふへほばびぶべぼぱぴぷぺぽ|まみむめも|やゆよゃゅょ|らりるれろ|わをん'.split('|');
  const STAR = ['萬子', '筒子', '索子', '数牌', '字牌', '風牌', '三元牌', '么九牌', '順子', '刻子', '対子', '雀頭', '面子', 'ポン', 'チー', 'カン', 'リーチ', 'ロン', 'ツモ', '役牌', 'タンヤオ', 'ピンフ', '親', 'ドラ', 'テンパイ', '聴牌', '和了', '満貫', '門前', '副露', '鳴き', '赤ドラ', '一発', '場風', '自風'];
  const hira = (s) => String(s).replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const D_ = () => MJ.DictData, dRow = (e) => { const i = KSET.findIndex((t) => t.includes(hira(e.y)[0])); return i < 0 ? 0 : i; };
  let dByName = null; const dFind = (nm) => { if (!dByName) { dByName = {}; D_().list.forEach((e, i) => [e.n].concat(e.a).forEach((t) => { if (t && dByName[t] == null) dByName[t] = i; })); } return dByName[nm]; };
  const dStar = (e) => STAR.includes(e.n), DPER = 10, DM = DCAT.map((c) => c[1]).concat('五十音');
  const dIdsOf = (m, row) => { const L = D_().list, all = L.map((e, i) => i); return m < 8 ? all.filter((i) => L[i].c === DCAT[m][0]) : all.filter((i) => dRow(L[i]) === row).sort((a, b) => hira(L[a].y).localeCompare(hira(L[b].y), 'ja')); };
  const dItems = (d) => { const L = D_().list; if (d.m === 8 && d.kana == null) return KROW.map((k, i) => ({ n: k + ' の行', r: dIdsOf(8, i).length + '語', row: i })); return dIdsOf(d.m, d.kana).map((i) => ({ n: L[i].n, r: L[i].y, id: i, star: dStar(L[i]) })); };
  function startDict() { S.dict = { view: 'main', foc: 0, m: 0, kana: null, sel: 0, id: 0, rel: -1, hist: [], ids: [] }; S.mode = 'dict'; dirty(); }
  function dTiles(str) { return String(str).split(' ').map((grp) => { const m = grp.match(/^(\d+)([mpsz])$/); if (!m) return { sep: grp }; const base = { m: 0, p: 9, s: 18, z: 27 }[m[2]]; return { tiles: m[1].split('').map((c) => ({ t: base + (c === '0' ? 4 : +c - 1), red: c === '0' })) }; }); }
  function dTileRow(str, x, y, availW, maxTw) { // 幅に、きっちり入る大きさで、牌を1列に並べる
    const gs = dTiles(str), width = (tw) => gs.reduce((a, g) => a + (g.sep != null ? 18 : g.tiles.length * (tw + 1)), 0) + (gs.length - 1) * 8;
    let tw = maxTw || 44; while (tw > 12 && width(tw) > availW) tw--; const th = Math.round(tw * 1.32); let cx = x;
    gs.forEach((g, gi) => { if (gi) cx += 8; if (g.sep != null) { text(g.sep, cx + 9, y + Math.round(th / 2) - 10, 18, GREY, 1); cx += 18; return; } g.tiles.forEach((h) => { tile(h.t, cx, y, tw, th, h.red); cx += tw + 1; }); });
    return th;
  }
  function dChips(items, x, y, maxw, selK, right) { // ことばの札を、並べて、はしで折り返す。 戻り値: つぎの y
    let cx = x, cy = y; items.forEach((s, k) => { const w = gfx.measure(s, 18) + 20; if (cx + w > x + maxw && cx > x) { cx = x; cy += 32; } const on = k === selK; rrect(cx, cy, w, 28, 12, on ? [255, 214, 58] : GREEN); text(s, cx + w / 2, cy + 3, 18, on ? INK : WHITE, 1); cx += w + 6; }); return cy + 34;
  }
  function dBtn(x, y, w, h, n, r, on, star) { // 名前+ふりがなだけのボタン(文字が上下に はみ出さない余白つき)
    panel(x, y, w, h, 12, on ? YEL : WHITE, on ? [160, 110, 0] : GREEN, on ? 4 : 2, 255);
    text(r, x + w / 2, y + 5, 15, [90, 90, 80], 1); const sz = fitSz(n, 28, w - (star ? 56 : 28), 16); text(n, x + w / 2 + (star ? 12 : 0), y + 23 + Math.round((28 - sz) / 2), sz, INK, 1);
    if (star) text('★', x + w / 2 - gfx.measure(n, sz) / 2 - 10, y + 26, 20, [214, 150, 0], 1);
    if (on) { rrect(x + w - 40, y + 14, 32, 36, 8, [160, 110, 0]); text('▶', x + w - 24, y + 21, 22, WHITE, 1); } // 選んでいるボタン: 「押すと ひらく」の目印
  }
  function drawDict() {
    const d = S.dict, L = D_().list;
    if (d.view === 'main') {
      const items = dItems(d), np = Math.max(1, Math.ceil(items.length / DPER)), pg = Math.floor(d.sel / DPER);
      quizFrame('麻雀用語じてん', '', np > 1 && d.foc === 1 ? (pg + 1) + ' / ' + np + ' ページ' : '', '');
      rrect(204, 410, 594, 38, 10, d.foc === 1 ? [160, 110, 0] : [40, 90, 60]); text(d.foc === 0 ? '▶ を押すと、右の 言葉を えらべます' : '決定ボタンを押すと、くわしい説明が ひらきます', 501, 416, 22, WHITE, 1); text(d.foc === 0 ? '▲▼ 分類  戻る: 勉強へ' : '◀(左はし)で分類へ', 100, 417, 15, [210, 225, 205], 1);
      DM.forEach((c, i) => { const cur = d.m === i, f = d.foc === 0 && cur; panel(14, 56 + i * 40, 176, 36, 10, f ? YEL : cur ? [60, 130, 60] : [50, 70, 60], f ? [160, 110, 0] : cur ? [150, 200, 140] : [74, 97, 84], f ? 4 : 2, 255); text(c, 102, 56 + i * 40 + (c.length > 6 ? 9 : 7), c.length > 6 ? 17 : 20, f ? INK : cur ? WHITE : [185, 201, 189], 1); });
      items.slice(pg * DPER, pg * DPER + DPER).forEach((it, i) => dBtn(204 + (i % 2) * 302, 54 + Math.floor(i / 2) * 70, 292, 64, it.n, it.r, d.foc === 1 && pg * DPER + i === d.sel, it.star));
      if (!items.length) text('この分類は、まだありません', 500, 200, 22, GREY, 1);
      return;
    }
    const e = L[d.id], cat = DCAT.find((c) => c[0] === e.c); quizFrame(cat ? cat[1] : '', '', '', '◀ ▶ 前の語・次の語    ▲ ▼ 関連語    決定: 関連語へ    戻る');
    panel(24, 54, 784, 356, 14, CREAM, GREEN, 3, 255);
    text(e.y, 46, 58, 18, GREEN); text(e.n, 44, 80, fitSz(e.n, 46, 400, 26), INK);
    if (dStar(e)) { rrect(46, 134, 150, 24, 10, [214, 150, 0]); text('★ 先に覚える言葉', 121, 136, 16, WHITE, 1); }
    const al = e.a || []; if (al.length) { text('ほかの よびかた', 440, 62, 18, GREEN); dChips(al.slice(0, 6), 440, 86, 350, -1); }
    const rl = (e.r || []).filter((nm) => dFind(nm) != null).slice(0, 6); d.rels = rl; const ex = e.x && e.x[0], bandH = ex ? 96 : 0, relH = rl.length ? 36 : 0;
    const top = 166, limit = 404 - relH - bandH - (ex ? 6 : 0), f = fitRich(e.d, [24, 22, 20, 18], 736, limit - top); richDraw(f.lines, 44, top, f.sz, INK, 0);
    if (ex) { const by = 404 - relH - bandH; rrect(40, by, 752, bandH, 10, [226, 222, 198]); text(ex[0], 54, by + 4, 17, [70, 70, 60]); dTileRow(ex[1], 54, by + 28, 724, 46); }
    if (rl.length) { text('いっしょに 覚える', 46, 410 - relH + 2, 18, GREEN); dChips(rl, 220, 410 - relH - 1, 570, d.rel); }
  }
  function dictKey(k) {
    const d = S.dict; dirty();
    if (d.view === 'main') {
      if (d.foc === 0) {
        if (k === 'up') { d.m = (d.m + DM.length - 1) % DM.length; d.kana = null; d.sel = 0; } else if (k === 'down') { d.m = (d.m + 1) % DM.length; d.kana = null; d.sel = 0; }
        else if (k === 'right' || k === 'ok') { if (dItems(d).length) { d.foc = 1; d.sel = 0; } } else if (k === 'back') { startStudy(1); S.dict = null; }
        return;
      }
      const items = dItems(d), n = items.length;
      if (k === 'left') { if (d.sel % 2 === 0) d.foc = 0; else d.sel--; } else if (k === 'right') { if (d.sel + 1 < n && d.sel % 2 === 0) d.sel++; }
      else if (k === 'up') { if (d.sel - 2 >= 0) d.sel -= 2; } else if (k === 'down') { if (d.sel + 2 < n) d.sel += 2; else if (d.sel % 2 === 1 && d.sel + 1 < n) d.sel = n - 1; }
      else if (k === 'back') { if (d.m === 8 && d.kana != null) { d.kana = null; d.sel = 0; } else d.foc = 0; }
      else if (k === 'ok') { const it = items[d.sel]; if (!it) return; if (it.row != null) { d.kana = it.row; d.sel = 0; } else { d.ids = items.map((x) => x.id); d.id = it.id; d.rel = -1; d.hist = []; d.view = 'detail'; } }
      return;
    }
    const n = d.ids.length, at = d.ids.indexOf(d.id), rels = d.rels || [];
    if (k === 'left' || k === 'right') { if (at >= 0) { d.sel = (at + (k === 'left' ? n - 1 : 1)) % n; d.id = d.ids[d.sel]; d.rel = -1; d.hist = []; } }
    else if (k === 'up') { if (rels.length) d.rel = d.rel <= 0 ? rels.length - 1 : d.rel - 1; } else if (k === 'down') { if (rels.length) d.rel = d.rel + 1 >= rels.length ? 0 : d.rel + 1; }
    else if (k === 'ok') { if (d.rel >= 0 && rels[d.rel] != null) { d.hist.push(d.id); d.id = dFind(rels[d.rel]); d.rel = -1; } }
    else if (k === 'back') { if (d.hist.length) { d.id = d.hist.pop(); d.rel = -1; } else { d.view = 'main'; d.sel = Math.max(0, at); } }
  }
  /* ---- 学習コーナー(地図 → 読み物 → クイズ。しおりと「おぼえた」を覚えておく) ---- */
  const LKEY = 'mj_learn';
  function learnLoad() { try { const v = JSON.parse(localStorage.getItem(LKEY)); if (v && v.done) return v; } catch (e) { /* ignore */ } return { bm: { step: 0, page: 0, read: false }, done: {} }; }
  function learnSave() { try { localStorage.setItem(LKEY, JSON.stringify(S.learn.d)); } catch (e) { /* ignore */ } }
  function startLearn() { const d = learnLoad(); S.mode = 'learn'; S.learn = { d, view: 'map', sel: Math.min(d.bm.step || 0, MJ.Learn.STEPS.length - 1), sub: 0, page: 0, scroll: 0 }; dirty(); }
  const learnPages = () => { const a = [], b = []; MJ.Learn.STEPS.forEach((st, i) => (st.lv === '入門' || st.lv === '初級' ? a : b).push(i)); return [a, b]; } // 3ページ目は「用語じてん」、4ページ目は「ビデオ」の入口
  const pgOf = (pgi, sel) => Math.max(0, pgi.findIndex((p) => p.includes(sel))); // 1ページ目: 入門・初級 / 2ページ目: 中級・上級
  function learnOpen(stepIdx, page) { // 読み物を開く(しおりも、ここに更新)
    const L = S.learn, st = MJ.Learn.STEPS[stepIdx]; L.step = stepIdx; L.page = Math.max(0, Math.min(st.pages.length - 1, page || 0)); L.scroll = 0; L.view = 'read'; L.cache = null;
    L.d.bm = { step: stepIdx, page: L.page, read: true }; learnSave(); dirty();
  }
  function learnQuiz(stepIdx) {
    const st = MJ.Learn.STEPS[stepIdx];
    startQuiz({ title: 'ステップ' + (stepIdx + 1) + ' クイズ', gens: () => st.gens, n: st.n, onEnd: (ok, n, finished) => {
      S.mode = 'learn'; S.learn.view = 'map'; S.learn.sel = stepIdx;
      if (finished && ok >= Math.ceil(n * 0.8)) { S.learn.d.done[st.id] = true; S.learn.sel = Math.min(stepIdx + 1, MJ.Learn.STEPS.length - 1); S.learn.d.bm = { step: S.learn.sel, page: 0, read: false, next: true }; learnSave(); }
      dirty();
    } });
    S.quiz.learn = true;
  }
  const SUBS = ['読む', 'クイズに挑戦', '「おぼえた」にする', 'もどる'];
  function learnKey(k) {
    const L = S.learn, STEPS = MJ.Learn.STEPS;
    if (L.confirm) { // 「ホームにもどりますか?」
      if (k === 'left' || k === 'right' || k === 'up' || k === 'down') L.confirm.idx = 1 - L.confirm.idx;
      else if (k === 'back') L.confirm = null;
      else if (k === 'ok') { const go = L.confirm.idx === 1; L.confirm = null; if (go) { S.mode = 'menu'; S.learn = null; } }
      dirty(); return;
    }
    if (L.view === 'map') {
      if (k === 'back') { startStudy(0); S.learn = null; return; }
      const pgi = learnPages(), pi = pgOf(pgi, L.sel), cur = pgi[pi], at = cur.indexOf(L.sel);
      if (k === 'up') L.sel = cur[wrap(at - 1, cur.length)]; else if (k === 'down') L.sel = cur[wrap(at + 1, cur.length)];
      else if (k === 'left' || k === 'right') { const o = pgi[wrap(pi + (k === 'left' ? -1 : 1), pgi.length)]; L.sel = o[Math.min(at, o.length - 1)]; }
      else if (k === 'ok') { if (L.sel === STEPS.length) startDict(); else if (L.sel > STEPS.length) startVideo(); else { L.view = 'sub'; L.sub = 0; } }
    } else if (L.view === 'sub') {
      if (k === 'back') L.view = 'map'; else if (k === 'up') L.sub = wrap(L.sub - 1, 4); else if (k === 'down') L.sub = wrap(L.sub + 1, 4);
      else if (k === 'ok') {
        const st = STEPS[L.sel];
        if (L.sub === 0) learnOpen(L.sel, L.d.bm.step === L.sel && L.d.bm.read ? L.d.bm.page : 0);
        else if (L.sub === 1) learnQuiz(L.sel);
        else if (L.sub === 2) { if (L.d.done[st.id]) delete L.d.done[st.id]; else L.d.done[st.id] = true; learnSave(); L.view = 'map'; }
        else L.view = 'map';
      }
    } else if (L.view === 'read') {
      const st = STEPS[L.step];
      if (k === 'back') { L.view = 'map'; L.sel = L.step; }
      else if (k === 'left') { if (L.page > 0) learnOpen(L.step, L.page - 1); }
      else if (k === 'right' || k === 'ok') { if (L.page < st.pages.length - 1) learnOpen(L.step, L.page + 1); else if (k === 'ok') learnQuiz(L.step); }
      else if (k === 'up') L.scroll = Math.max(0, L.scroll - 40); else if (k === 'down') L.scroll += 40;
    }
    dirty();
  }
  function learnPage(L) { // 1ページぶんの、絵と文を並べた形(1度だけ作る)
    if (L.cache && L.cache.key === L.step + ':' + L.page) return L.cache;
    const pg = MJ.Learn.STEPS[L.step].pages[L.page]; let best = null;
    for (const sz of [30, 28, 26, 24, 22, 20]) { // 入りきる いちばん大きな字を選ぶ(スクロールさせない)
      const out = []; pg.items.forEach((it) => {
        if (!it) { out.push({ gap: 8 }); return; }
        if (typeof it === 'string') { const ls = richWrap(it, sz, 760); out.push({ lines: ls, h: richH(ls, sz) + 8 }); }
        else if (it.hand) out.push({ hand: MJ.Learn.tiles(it.hand), h: 64 });
      });
      best = { key: L.step + ':' + L.page, sz, items: out, h: out.reduce((a2, o) => a2 + (o.h || o.gap || 0), 0) }; if (best.h <= 298) break;
    }
    return (L.cache = best);
  }
  function drawLearn() {
    const L = S.learn, STEPS = MJ.Learn.STEPS, D = L.d;
    if (L.view === 'read') {
      const st = STEPS[L.step], pg = st.pages[L.page], c = learnPage(L);
      quizFrame('ステップ' + (L.step + 1) + '  ' + st.t, '', (L.page + 1) + ' / ' + st.pages.length, L.page < st.pages.length - 1 ? '◀ ▶ でページをめくる    戻る: 地図へ' : '決定ボタンで クイズに進む    ◀ 前のページ    戻る: 地図へ');
      tFace('advice', 'lr' + L.step + '_' + L.page, 10, 2, 44);
      text(pg.h, 30, 58, 28, YEL); fill(30, 94, SW - 60, 3, [140, 190, 130]);
      const my = Math.max(0, c.h - 298); L.scroll = Math.min(L.scroll, my); gfx.clip(0, 102, SW, 300);
      let y = 104 - L.scroll;
      c.items.forEach((o) => {
        if (o.gap) { y += o.gap; return; }
        if (o.lines) { richDraw(o.lines, 36, y, c.sz, WHITE, 0); y += o.h; }
        else if (o.hand) { let x = 36; o.hand.forEach((t) => { if (t < 0) { x += 14; return; } tile(t, x, y + 4, 40, 53); x += 42; }); y += o.h; }
      });
      gfx.clip();
      if (my > 0) text((L.scroll > 0 ? '▲ ' : '') + (L.scroll < my ? '▼ つづき' : ''), SW - 30, 404, 18, GREY, 2);
      return;
    }
    quizFrame('点数計算の勉強', '', '', L.view === 'sub' ? '' : '▲ ▼ でえらんで 決定ボタン    ◀ ▶ でページを かえる    戻る: もどる');
    const pgi = learnPages(), pi = pgOf(pgi, L.sel), nDone = STEPS.filter((s) => D.done[s.id]).length;
    tFace('greet', 'lm', 10, 2, 44);
    text('おぼえた ' + nDone + ' / ' + STEPS.length, SW - 24, 12, 18, WHITE, 2);
    ['入門・初級', '中級・上級'].forEach((lb, i) => { const x = 24 + i * 200, on = i === pi; rrect(x, 58, 190, 34, 10, on ? [60, 130, 60] : [50, 70, 60]); text(lb, x + 95, 62, 22, on ? WHITE : [170, 190, 170], 1); });
    text((pi + 1) + ' / 2 ページ', SW - 24, 62, 20, GREY, 2);
    if (pi === 3) { // ビデオの入口
      const sel = L.view === 'map'; panel(24, 112, SW - 48, 130, 16, sel ? YEL : WHITE, sel ? [160, 110, 0] : GREEN, sel ? 4 : 2, 255);
      text('ビデオ', 60, 126, 40, INK); text('麻雀の しくみを、動画で 見られます。', 62, 180, 22, [70, 70, 60]); text('とちゅうで止めても、つづきから 見られます。', 62, 208, 20, [140, 100, 0]);
      text('決定ボタンで ひらく', SW / 2, 270, 24, WHITE, 1); return;
    }
    if (pi === 2) { // 用語じてんの入口
      const sel = L.sel >= STEPS.length && L.view === 'map'; panel(24, 112, SW - 48, 130, 16, sel ? YEL : WHITE, sel ? [160, 110, 0] : GREEN, sel ? 4 : 2, 255);
      text('麻雀用語じてん', 60, 126, 40, INK); text('わからない言葉を しらべます。ふりがな・牌の絵つき。', 62, 180, 22, [70, 70, 60]); text('★ は、先に覚えたい言葉です。', 62, 208, 20, [140, 100, 0]);
      text('決定ボタンで ひらく', SW / 2, 270, 24, WHITE, 1); return;
    }
    pgi[pi].forEach((i, r) => {
      const st = STEPS[i], y = 100 + r * 64, sel = L.sel === i && L.view === 'map', done = !!D.done[st.id], bm = D.bm.step === i;
      panel(24, y, SW - 48, 58, 14, sel ? YEL : WHITE, sel ? [160, 110, 0] : GREEN, sel ? 4 : 2, 255);
      rrect(34, y + 9, 40, 40, 20, done ? GREEN : [160, 170, 150]); text(done ? '✔' : String(i + 1), 54, y + 13, 28, WHITE, 1);
      text(st.t, 90, y + 5, 26, INK); text(st.sum, 92, y + 36, 16, [80, 80, 70]);
      rrect(SW - 150, y + 15, 58, 28, 9, st.lv === '上級' ? [190, 70, 60] : st.lv === '中級' ? [210, 150, 40] : st.lv === '初級' ? [80, 150, 70] : [90, 130, 190]); text(st.lv, SW - 121, y + 17, 18, WHITE, 1);
      if (bm && (D.bm.read || D.bm.next)) { rrect(SW - 84, y + 14, 56, 28, 9, D.bm.read ? QRED : [80, 130, 190]); text(D.bm.read ? 'しおり' : 'つぎ', SW - 56, y + 17, 18, WHITE, 1); }
    });
    if (L.view === 'sub') {
      fill(0, 0, SW, SH, [0, 0, 0], 130); const st = STEPS[L.sel]; panel(190, 110, 452, 240, 14, WHITE, GREEN, 4, 255); text('ステップ' + (L.sel + 1) + '  ' + st.t, SW / 2, 124, 22, GREEN, 1);
      SUBS.forEach((lb, i) => { const y = 164 + i * 44, sel = L.sub === i, lab = i === 2 && D.done[st.id] ? '「おぼえた」を はずす' : i === 0 && D.bm.step === L.sel && D.bm.read ? '読む(しおりの ところから)' : lb; panel(220, y, 392, 38, 10, sel ? YEL : WHITE, sel ? [160, 110, 0] : [150, 160, 140], sel ? 4 : 2, 255); text(lab, SW / 2, y + 7, 21, INK, 1); });
    }
  }

  /* ---------- ビデオ(SDカードの ~/mjdata/video に入れた動画を、ゲームの中で見る) ---------- */
  const VTITLES = { 1: '10分で分かる麻雀ルール', 2: '麻雀役解説', 3: '役はこれだけ覚えればOK', 4: 'ポンしていい?', 5: 'ポンしたらあがれない?', 6: 'スジ、習ったのに忘れる', 7: 'どれが通る?', 8: 'どれを捨てる?', 9: '捨てた順番で読む、3から5なら?', 10: '待ちがわからない?', 11: '役なしロン、防ぐ3つのコツ', 12: 'フリテン、そのロン待った', 13: '丸暗記、重要な形5選', 14: 'あがったのに点数が言えない', 15: '7つを整理', 16: '席決め親決め' };
  const VSTEP = 10, VSTEP_HOLD = 30, VHOLD_MS = 600; // 押す: 10秒 / 長押し: 30秒(3倍)ずつ
  const vfmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };
  function vLoad() { try { const v = JSON.parse(localStorage.getItem('mj_video')); if (v && v.pos) return v; } catch (e) { /* ignore */ } return { pos: {}, done: {}, last: '' }; }
  function vSave() { try { localStorage.setItem('mj_video', JSON.stringify(S.vid.d)); } catch (e) { /* ignore */ } }
  function vScan() { // フォルダの「番号_題名.mp4」と「番号_題名.png」から、一覧を作る
    const dir = (globalThis.__dataDir || '.') + '/video', names = (typeof __readdir === 'function' && __readdir(dir)) || [], files = [], have = {};
    names.forEach((nm) => {
      const m = nm.match(/^(.*)\.(mp4|m4v|mov|mkv|webm)$/i); if (!m) return;
      const base = m[1], mm = base.match(/^(\d+)[_\-\s　]*(.*)$/), n = mm ? parseInt(mm[1], 10) : 999;
      have[n] = 1; files.push({ n, name: nm, title: (mm && mm[2]) || VTITLES[n] || base, path: dir + '/' + nm, png: VTITLES[n] ? 'img/video/' + ('0' + n).slice(-2) + '.webp' : names.includes(base + '.png') ? dir + '/' + base + '.png' : null });
    });
    Object.keys(VTITLES).forEach((k) => { if (!have[k]) files.push({ n: +k, name: 'v' + k, title: VTITLES[k], path: null, png: 'img/video/' + ('0' + k).slice(-2) + '.webp' }); }); // 動画ファイルが まだ無くても、一覧(サムネイル)には出す
    files.sort((a, b) => a.n - b.n || (a.name < b.name ? -1 : 1)); return { dir, files };
  }
  const vStatus = (f, d0) => { const d = d0 || S.vid.d; return d.done[f.name] ? 'done' : (d.pos[f.name] || 0) > 3 ? 'cont' : 'new'; };
  window.__startVideo = () => startVideo(); window.__startStudy = () => startStudy(); // 試験用
  window.__dbgBub = (seat, text) => { if (S.game) { S.bub[seat] = { name: S.game.players[seat].name, text, p: S.game.players[seat], until: __now() + 99999 }; dirty(); } }; // 試験用
  function startVideo() {
    const sc = vScan(), d = vLoad(), last = sc.files.findIndex((f) => f.name === d.last && vStatus(f, d) === 'cont');
    S.vid = { view: last >= 0 ? 'home' : 'list', files: sc.files, dir: sc.dir, d, sel: Math.max(0, last), top: 0, hs: 0, last, ask: null }; S.mode = 'video'; vFit(); dirty();
  }
  function vFit() { const V = S.vid; V.top = Math.max(0, Math.min(V.top, V.sel)); if (V.sel >= V.top + 8) V.top = V.sel - 7; }
  function vPlay(i, from) {
    const V = S.vid, f = V.files[i];
    if (!f.path || typeof __vopen !== 'function') { V.err = f.path ? 'この画面では 再生できません(実機で 見られます)' : 'この動画は まだ 入っていません(mjdata/video に入れてください)'; dirty(); return; }
    try { NSND.music(''); } catch (e) { /* ignore */ }
    const r = __vopen(f.path, from || 0); if (!r) { V.view = 'list'; V.err = 'ひらけませんでした(この機械では動画が使えないかもしれません)'; try { NSND.home(); } catch (e) { /* ignore */ } dirty(); return; }
    const now = __now(); V.sel = i; V.view = 'play'; V.p = { f, i, dur: r.dur || 0, ui: now + 2500, paused: false, end: false, hk: '', hkT: 0, step: 0, toast: '', toastT: 0, save: now, st: [from || 0, r.dur || 0, 0, 0, 0], sig: '' };
    V.d.last = f.name; vSave(); dirty();
  }
  function vStop(markEnd) { // 動画をとじて、一覧へ
    const V = S.vid, p = V.p; if (!p) return;
    const st = __vstate(); const pos = st ? st[0] : p.st[0];
    if (markEnd || (p.dur > 20 && pos >= p.dur - 15)) { V.d.done[p.f.name] = true; delete V.d.pos[p.f.name]; } else V.d.pos[p.f.name] = Math.floor(pos);
    vSave(); __vclose(); V.p = null; V.view = 'list'; V.last = V.files.findIndex((f) => f.name === V.d.last && vStatus(f) === 'cont'); vFit(); try { NSND.home(); } catch (e) { /* ignore */ } dirty();
  }
  function vTick(now) { // 動画を見ているあいだ、毎コマ呼ばれる
    const V = S.vid; if (!V || V.view !== 'play' || !V.p) return;
    const p = V.p, st = __vstate(); if (!st) return; p.st = st; p.dur = st[1] || p.dur; p.paused = !!st[2];
    if (st[3] && !p.end) { p.end = true; p.ui = now; V.d.done[p.f.name] = true; delete V.d.pos[p.f.name]; vSave(); __vpause(true); }
    if (now - p.save > 8000) { p.save = now; V.d.pos[p.f.name] = Math.floor(st[0]); vSave(); }
    const show = p.paused || p.end || now < p.ui + 3500, sig = (show ? 1 : 0) + '|' + Math.floor(st[0]) + '|' + (p.paused ? 1 : 0) + '|' + (now < p.toastT ? p.toast : '') + '|' + (st[4] ? 1 : 0);
    if (sig !== p.sig) { p.sig = sig; dirty(); }
  }
  function vSeek(sign, now) { // ◀ ▶ : 押すと10秒、長押しで30秒ずつ
    const p = S.vid.p, st = __vstate() || p.st; let step = 0;
    if (p.hk === (sign < 0 ? 'left' : 'right') && now - p.hkT < 260) { if (now - p.step >= VHOLD_MS) { step = VSTEP_HOLD; p.step = now; } } else { step = VSTEP; p.step = now; }
    p.hk = sign < 0 ? 'left' : 'right'; p.hkT = now; p.ui = now; if (!step) return;
    const to = Math.max(0, Math.min((p.dur || 1e9) - 1, st[0] + sign * step)); __vseek(to);
    if (p.end) { p.end = false; if (!p.userPaused) __vpause(false); }
    p.toast = (sign < 0 ? '◀◀ ' : '▶▶ ') + step + '秒 ' + (sign < 0 ? 'もどる' : 'すすむ'); p.toastT = now + 1100;
  }
  function videoKey(k) {
    const V = S.vid, now = __now(); dirty();
    if (V.view === 'play') {
      const p = V.p;
      if (k === 'back') { vStop(false); return; }
      if (k === 'left') vSeek(-1, now); else if (k === 'right') vSeek(1, now);
      else if (k === 'ok') {
        p.ui = now;
        if (p.end) { p.end = false; p.userPaused = false; __vseek(0); __vpause(false); delete V.d.done[p.f.name]; return; }
        p.userPaused = !p.paused; p.paused = !p.paused; __vpause(p.paused); if (!p.paused) p.ui = now - 2000;
      } else p.ui = now;
      return;
    }
    if (V.ask) { // 「つづきから / はじめから」
      if (k === 'up' || k === 'down' || k === 'left' || k === 'right') V.ask.idx = 1 - V.ask.idx; else if (k === 'back') V.ask = null;
      else if (k === 'ok') { const a = V.ask; V.ask = null; vPlay(a.i, a.idx === 0 ? (V.d.pos[V.files[a.i].name] || 0) : 0); }
      return;
    }
    if (V.view === 'home') {
      if (k === 'up' || k === 'down') V.hs = 1 - V.hs; else if (k === 'back') { startStudy(2); S.vid = null; } else if (k === 'ok') { if (V.hs === 0) vPlay(V.last, V.d.pos[V.files[V.last].name] || 0); else V.view = 'list'; }
      return;
    }
    const n = V.files.length; V.err = '';
    if (k === 'back') { if (V.last >= 0) V.view = 'home'; else { startStudy(2); S.vid = null; } }
    else if (!n) return;
    else if (k === 'up') { V.sel = (V.sel + n - 1) % n; vFit(); } else if (k === 'down') { V.sel = (V.sel + 1) % n; vFit(); }
    else if (k === 'left') { V.sel = Math.max(0, V.sel - 8); vFit(); } else if (k === 'right') { V.sel = Math.min(n - 1, V.sel + 8); vFit(); }
    else if (k === 'ok') { const f = V.files[V.sel]; if (f.path && vStatus(f) === 'cont') V.ask = { i: V.sel, idx: 0 }; else vPlay(V.sel, 0); }
  }
  function vThumb(f, x, y, w, h) { // サムネイル(無ければ、暗い板)
    rrect(x - 3, y - 3, w + 6, h + 6, 6, [150, 190, 140]);
    if (f.png) { gfx.image(f.png, x, y, w, h, 255); } else { fill(x, y, w, h, [16, 56, 42]); text('(サムネイルなし)', x + w / 2, y + h / 2 - 12, 20, GREY, 1); }
  }
  function drawVideo() {
    const V = S.vid;
    if (V.view === 'play') { drawVideoPlay(V); return; }
    quizFrame('ビデオ', '', '', V.view === 'home' ? '▲ ▼ でえらんで 決定ボタン    戻る: もどる' : '▲ ▼ でえらぶ   ◀ ▶ でページ   決定ボタンで 見る   戻る: もどる');
    if (V.view === 'home') {
      const f = V.files[V.last], pos = V.d.pos[f.name] || 0;
      panel(40, 70, SW - 80, 190, 16, V.hs === 0 ? YEL : WHITE, V.hs === 0 ? [160, 110, 0] : GREEN, V.hs === 0 ? 4 : 2, 255);
      vThumb(f, 64, 92, 240, 135); text('つづきから 見る', 330, 88, 32, INK); const sz = fitSz(f.title, 26, SW - 40 - 330 - 30, 16); text(f.title, 332, 140, sz, INK);
      text(vfmt(pos) + ' の ところから', 332, 188, 24, [140, 100, 0]);
      panel(40, 284, SW - 80, 96, 16, V.hs === 1 ? YEL : WHITE, V.hs === 1 ? [160, 110, 0] : GREEN, V.hs === 1 ? 4 : 2, 255); text('一覧から えらぶ', SW / 2, 312, 34, INK, 1);
      return;
    }
    if (!V.files.length) {
      panel(60, 90, SW - 120, 240, 16, WHITE, GREEN, 3, 255); text('ビデオが まだ ありません', SW / 2, 114, 32, INK, 1);
      text('SDカードの「mjdata」フォルダの中の「video」に、', SW / 2, 180, 22, [70, 70, 60], 1); text('動画(.mp4)と サムネイル(.png)を 入れてください。', SW / 2, 214, 22, [70, 70, 60], 1);
      text('(番号_題名.mp4 と 番号_題名.png)', SW / 2, 262, 19, [110, 110, 100], 1); return;
    }
    const n = V.files.length;
    for (let r = 0; r < 8; r++) {
      const i = V.top + r; if (i >= n) break; const f = V.files[i], y = 58 + r * 44, on = i === V.sel, ss = vStatus(f);
      panel(14, y, 350, 40, 10, on ? YEL : CREAM, on ? [160, 110, 0] : GREEN, on ? 3 : 2, 255);
      rrect(24, y + 5, 36, 30, 6, GREEN); text(('0' + f.n).slice(-2), 42, y + 8, 18, WHITE, 1);
      const bw = !f.path ? 60 : ss === 'new' ? 0 : ss === 'done' ? 96 : 66; text(f.title, 68, y + 7 + 0, fitSz(f.title, 21, 286 - bw, 14), INK);
      if (!f.path) { rrect(300, y + 8, 54, 24, 11, [140, 140, 130]); text('なし', 327, y + 10, 15, WHITE, 1); } else if (ss === 'done') { rrect(260, y + 8, 94, 24, 11, [60, 138, 60]); text('✔ 見おわり', 307, y + 10, 15, WHITE, 1); } else if (ss === 'cont') { rrect(290, y + 8, 64, 24, 11, QRED); text('つづき', 322, y + 10, 15, WHITE, 1); }
    }
    if (V.top > 0) text('▲', 189, 48, 14, YEL, 1); if (V.top + 8 < n) text('▼', 189, 412, 14, YEL, 1);
    const f = V.files[V.sel], ss = vStatus(f);
    panel(384, 58, 430, 244, 12, [16, 56, 42], [150, 190, 140], 3, 255); vThumb(f, 394, 68, 410, 230);
    panel(384, 316, 430, 100, 12, CREAM, GREEN, 3, 255); text(f.title, 599, 326, fitSz(f.title, 26, 400, 16), INK, 1);
    text(!f.path ? '(動画ファイルが まだ ありません)' : ss === 'done' ? '✔ 見おわりました' : ss === 'cont' ? 'つづき: ' + vfmt(V.d.pos[f.name]) + ' から' : 'まだ 見ていません', 599, 368, 21, ss === 'cont' ? [200, 60, 40] : [70, 100, 60], 1);
    if (V.err) { fill(0, 200, SW, 60, [0, 0, 0], 200); text(V.err, SW / 2, 214, 22, YEL, 1); }
  }
  function drawVideoPlay(V) {
    const p = V.p; gfx.clear(0, 0, 0); if (!p.st[4]) text('よみこみ中…', SW / 2, 210, 30, WHITE, 1);
    const now = __now(), show = p.paused || p.end || now < p.ui + 3500, st = p.st, T = gfx.textTop, F = (x, y, w, h, c, a) => gfx.fillTop(x, y, w, h, c[0], c[1], c[2], a == null ? 255 : a), TT = (s, x, y, sz, c, al) => T(String(s), x, y, sz, c[0], c[1], c[2], al || 0);
    if (now < p.toastT && !p.end) { F(SW / 2 - 150, 74, 300, 56, [0, 0, 0], 170); TT(p.toast, SW / 2, 84, 30, WHITE, 1); }
    if (p.end) { F(150, 130, 532, 190, [0, 0, 0], 210); TT('見おわりました', SW / 2, 150, 40, YEL, 1); TT('決定ボタン: もう一度 見る', SW / 2, 226, 26, WHITE, 1); TT('戻る: 一覧へ もどる', SW / 2, 266, 26, WHITE, 1); }
    if (!show) return;
    F(0, 0, SW, 46, [0, 0, 0], 255); TT(p.f.title, 20, 8, fitSz(p.f.title, 26, 560, 16), WHITE);
    if (p.paused && !p.end) { F(SW - 200, 6, 184, 34, [255, 220, 40], 255); TT('一時停止中', SW - 108, 9, 24, [30, 30, 20], 1); }
    F(0, 384, SW, 84, [0, 0, 0], 255); // 下の帯(動画の字幕に重ならないよう、できるだけ低く)
    const dur = p.dur || 0, fr = dur > 0 ? Math.max(0, Math.min(1, st[0] / dur)) : 0;
    F(30, 394, SW - 60, 10, [90, 100, 95]); F(30, 394, Math.round((SW - 60) * fr), 10, [255, 220, 40]); F(30 + Math.round((SW - 60) * fr) - 4, 389, 8, 20, WHITE);
    TT(vfmt(st[0]) + ' / ' + vfmt(dur), 30, 424, 26, WHITE);
    const hot = now < p.toastT ? (p.toast.indexOf('◀') === 0 ? 1 : 2) : 0, ic = (x, w, on) => F(x, 414, w, 44, on ? [255, 220, 40] : [60, 70, 66]), ink = (on) => on ? [30, 30, 20] : WHITE; // 下の帯の、ボタンの印(◀◀ / 一時停止・再生 / ▶▶)
    ic(250, 120, hot === 1); TT('◀◀', 296, 420, 28, ink(hot === 1), 1); TT('10', 346, 428, 18, ink(hot === 1), 1);
    ic(386, 60, false); if (p.paused) TT('▶', 416, 420, 28, WHITE, 1); else { F(405, 424, 8, 24, WHITE); F(419, 424, 8, 24, WHITE); }
    ic(462, 120, hot === 2); TT('10', 490, 428, 18, ink(hot === 2), 1); TT('▶▶', 538, 420, 28, ink(hot === 2), 1);
    TT('戻る: やめる', SW - 30, 428, 20, [210, 225, 205], 2);
  }

  /* ---------- 麻雀の勉強(入口): 左に「点数計算 / 用語じてん / ビデオ」、右に、えらんだものの見本と進み具合 ---------- */
  function startStudy(sel) {
    const d = learnLoad(), ST = MJ.Learn.STEPS, nDone = ST.filter((s) => d.done[s.id]).length;
    let nx = ST.findIndex((s) => !d.done[s.id]); if (nx < 0) nx = 0; if (d.bm && d.bm.read && !d.done[ST[d.bm.step] && ST[d.bm.step].id]) nx = d.bm.step;
    const sc = vScan(), vd = vLoad(); let vi = sc.files.findIndex((f) => f.name === vd.last && (vd.pos[f.name] || 0) > 3 && !vd.done[f.name]); const cont = vi >= 0; if (vi < 0) vi = Math.max(0, sc.files.findIndex((f) => f.path && !vd.done[f.name])); if (vi < 0 || !sc.files[vi]) vi = 0;
    S.study = { sel: sel || 0, nDone, total: ST.length, nx, nxStep: ST[nx], vf: sc.files[vi], cont, vpos: cont ? vd.pos[sc.files[vi].name] : 0, vn: sc.files.length, vhave: sc.files.filter((f) => f.path).length }; S.mode = 'study'; dirty();
  }
  function studyKey(k) {
    const H = S.study; dirty();
    if (k === 'up') H.sel = (H.sel + 2) % 3; else if (k === 'down') H.sel = (H.sel + 1) % 3;
    else if (k === 'back') { S.mode = 'menu'; S.study = null; }
    else if (k === 'ok') { const w = H.sel; later(() => { if (w === 0) startLearn(); else if (w === 1) startDict(); else startVideo(); }); } // ボタンが押し込まれてから、開く
  }
  function rframe(x, y, w, h, r, th, c) { // 角丸の枠(太さ th)。1行ずつ、外側と内側の角丸のあいだを塗る
    const ex = (yy, rr, hh) => { const d = yy < rr ? rr - Math.sqrt(Math.max(0, rr * rr - (rr - yy - 0.5) * (rr - yy - 0.5))) : yy >= hh - rr ? rr - Math.sqrt(Math.max(0, rr * rr - (yy - (hh - rr) + 0.5) * (yy - (hh - rr) + 0.5))) : 0; return Math.round(d); };
    for (let yy = 0; yy < h; yy++) {
      const xo = ex(yy, r, h);
      if (yy < th || yy >= h - th) { fill(x + xo, y + yy, w - 2 * xo, 1, c); continue; }
      const yi = yy - th, hi = h - 2 * th, ri = Math.max(0, r - th), xi = th + ex(yi, ri, hi);
      fill(x + xo, y + yy, Math.max(1, xi - xo), 1, c); fill(x + w - xi, y + yy, Math.max(1, xi - xo), 1, c);
    }
  }
  function drawStudy() { // 背景の絵(img/study_bg.webp)に、えらんだ枠と、進み具合の文字を重ねる
    const H = S.study; gfx.clear(14, 40, 30); gfx.image('img/study_bg.webp', 0, 0, SW, SH, 255);
    const BT = [[17, 63, 366, 94], [17, 163, 366, 107], [17, 278, 366, 91]], pr = pressing() ? 3 : 0; // ボタンの絵。押している間は、少し下へ(押し込まれる)
    BT.forEach((b, i) => { const dy = H.sel === i ? pr : 0; gfx.image('img/study_btn' + (i + 1) + '.webp', b[0], b[1] + dy + (H.sel === i && !pr ? -1 : 0), b[2], b[3], 255); });
    const e = BT[H.sel], ey = e[1] + pr, CX = 609; rframe(e[0] - 3, ey - 3, e[2] + 6, e[3] + 6, 8, 2, [40, 30, 10]); rframe(e[0] - 1, ey - 1, e[2] + 2, e[3] + 2, 7, 4, [255, 220, 40]); // えらんでいる枠(黄色・小さな角丸)
    text('おぼえた ' + H.nDone + ' / ' + H.total, 112, 122 + (H.sel === 0 ? pr : 0), 21, [70, 44, 14]); text(H.vn + '本' + (H.cont ? ' ・ つづきあり' : ''), 112, 332 + (H.sel === 2 ? pr : 0), 21, [244, 214, 176]);
    text('▲ ▼ でえらぶ    決定ボタンで ひらく    戻る: ホームへ', 420, 437, 20, [236, 222, 190], 1);
    if (H.sel === 0) {
      text('点数計算の勉強', CX, 92, 28, YEL, 1); text('役から点数まで、順番に学びます。', CX, 134, 19, WHITE, 1);
      const bw = 340, bx = 439; fill(bx, 176, bw, 16, [20, 50, 36]); fill(bx, 176, Math.round(bw * H.nDone / H.total), 16, YEL); text('おぼえた ' + H.nDone + ' / ' + H.total, CX, 200, 24, WHITE, 1);
      fill(437, 242, 344, 2, [150, 190, 140]); text(H.nDone >= H.total ? 'ぜんぶ おぼえました' : 'つぎは', CX, 252, 18, [200, 225, 200], 1);
      if (H.nDone < H.total && H.nxStep) { const t = 'ステップ' + (H.nx + 1) + '  ' + H.nxStep.t; text(t, CX, 280, fitSz(t, 24, 350, 16), WHITE, 1); text(H.nxStep.sum, CX, 318, 17, [255, 233, 160], 1); }
    } else if (H.sel === 1) {
      text('麻雀用語じてん', CX, 92, 28, YEL, 1); panel(450, 130, 318, 106, 12, [255, 251, 230], [160, 110, 0], 3, 255);
      text('たんやお', CX, 138, 15, [100, 100, 90], 1); text('★ タンヤオ', CX, 158, 38, INK, 1); text('1・9・字牌を 使わない役', CX, 205, 17, [90, 90, 80], 1);
      text('わからない言葉を しらべます。', CX, 256, 20, WHITE, 1); text('ふりがな・牌の絵つき。', CX, 284, 20, WHITE, 1); text('★ は、先に覚えたい言葉です。', CX, 318, 17, [255, 233, 160], 1);
    } else {
      const f = H.vf; if (f && f.png) gfx.image(f.png, 439, 90, 340, 191, 255); else fill(439, 90, 340, 191, [16, 56, 42]);
      const tt = f ? f.title : 'ビデオ'; text(tt, CX, 288, fitSz(tt, 24, 370, 15), WHITE, 1);
      text(H.cont ? 'つづき: ' + vfmt(H.vpos) + ' から' : H.vhave ? '動画 ' + H.vhave + '本 入っています' : '動画ファイルは まだ ありません', CX, 322, 18, H.cont ? [255, 170, 150] : [200, 225, 200], 1);
    }
  }

  /* ---------- あなたの診断(いいところ・のばせるところ・学習の記録) ---------- */
  /* ---------- あなたの診断(強さのグラフ・ポイントのグラフ・アドバイス・学習の記録) ---------- */
  function gLine(x1, y1, x2, y2, th, c, dash) { // 太さ th の線(四角をならべて描く)。 dash: 点線
    const dx = x2 - x1, dy = y2 - y1, len = Math.max(Math.abs(dx), Math.abs(dy)), h = Math.floor(th / 2), step = Math.max(1, Math.floor(th * 0.7));
    for (let i = 0; i <= len; i += step) { if (dash && Math.floor(i / 7) % 2) continue; fill(Math.round(x1 + dx * (len ? i / len : 0)) - h, Math.round(y1 + dy * (len ? i / len : 0)) - h, th, th, c); }
  }
  function gPoly(pts, c, a) { // 多角形を、横線でぬる
    let y0 = 1e9, y1 = -1e9; pts.forEach((p) => { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    for (let y = Math.ceil(y0); y <= Math.floor(y1); y++) { const xs = []; for (let i = 0; i < pts.length; i++) { const A = pts[i], B = pts[(i + 1) % pts.length]; if ((A[1] <= y + 0.5) !== (B[1] <= y + 0.5)) xs.push(A[0] + (y + 0.5 - A[1]) / (B[1] - A[1]) * (B[0] - A[0])); } xs.sort((m, n) => m - n); for (let k = 0; k + 1 < xs.length; k += 2) fill(Math.round(xs[k]), y, Math.max(1, Math.round(xs[k + 1]) - Math.round(xs[k])), 1, c, a); }
  }
  function recordDiscard(g, p, h) { // 実戦の記録: 打った牌が 最善に近いか(牌効率) / ほかの人の当たり牌を 持っていて、切らずに すんだか(洞察力)
    if (g.fast || p.riichi) return; const A = MJ.AI; let effOk = null;
    try { const an = A.analyze(g, p, { know: 2 }); if (an.evals.length && !an.opps.length) { const me = an.evals.find((e) => e.t === h.t); if (me) { const mx = Math.max.apply(null, an.evals.filter((e) => e.sh === an.minSh).map((e) => e.ukeire.n)); effOk = me.sh === an.minSh && me.ukeire.n >= mx * 0.8; } } } catch (e) { /* ignore */ }
    const safe = [];
    try { const mine = new Set(p.hand.map((x) => x.t)); g.players.forEach((q) => { if (q === p || q.hand.length % 3 !== 1) return; const c = MJ.toCounts(q.hand); if (MJ.shanten(c, q.melds.length) !== 0) return; const ws = MJ.waits(c.slice(), q.melds.length); if (ws.length && ws.some((w) => mine.has(w))) safe.push(!ws.includes(h.t)); }); } catch (e) { /* ignore */ }
    MJ.Stats.discard(effOk, safe);
  }
  function startDiag() { S.mode = 'diag'; let rk = { hist: [] }, info = null; try { rk = MJ.Rank.get(); info = MJ.Rank.info(); } catch (e) { /* ignore */ } S.diag = { pg: 0, d: MJ.Stats.diag(), sg: MJ.Stats.strength(), rk, info }; dirty(); }
  function diagKey(k) {
    const D = S.diag;
    if (k === 'back') { S.mode = 'menu'; S.diag = null; }
    else if (k === 'left') D.pg = Math.max(0, D.pg - 1); else if (k === 'right') D.pg = Math.min(3, D.pg + 1);
    else if (k === 'ok' && D.pg >= 2) { S.diag = null; startPractice(); }
    dirty();
  }
  function diagTabs(pg, hint) { // 下の、ページの札
    ['強さ', 'ポイント', 'アドバイス', '学習の記録'].forEach((t, i) => { const x = 14 + i * 130, on = i === pg; panel(x, 428, 122, 32, 9, on ? [60, 130, 60] : [50, 70, 60], on ? [150, 200, 140] : [74, 97, 84], 2, 255); text(t, x + 61, 428 + Math.round((32 - 18) / 2) - 1, 18, on ? WHITE : [185, 201, 189], 1); });
    text(hint, 806, 428 + 8, 16, [210, 225, 205], 2);
  }
  function drawDiag() {
    const D = S.diag, d = D.d, pg = D.pg, sg = D.sg;
    quizFrame('あなたの診断', '', '', '');
    if (pg === 0) { // 強さ(レーダーチャート)
      const ax = sg.ax, have = ax.filter((a) => a.v != null), cx0 = 440, cy0 = 256, R = 104, pt = (i, v, r) => { const an = -Math.PI / 2 + i * Math.PI / 3, rr = (r == null ? R : r) * v / 100; return [cx0 + Math.cos(an) * rr, cy0 + Math.sin(an) * rr]; };
      panel(22, 56, 196, 54, 12, CREAM, [160, 110, 0], 3, 255); text('総合', 36, 74, 17, INK);
      if (sg.total != null) { text(String(sg.total), 120, 64, 34, sg.total < 60 ? [190, 60, 40] : INK, 1); text('点', 160, 74, 17, INK); } else text('--', 120, 64, 34, [120, 120, 110], 1);
      ax.forEach((a, i) => { const y = 118 + i * 46; panel(22, y, 196, 38, 12, CREAM, GREEN, 2, 255); text(a.name, 38, y + 9, 20, a.v == null ? [130, 130, 120] : INK); text(a.v == null ? '--' : a.v + '点', 204, y + 9, 20, a.v == null ? [130, 130, 120] : a.v < 60 ? [190, 60, 40] : INK, 2); });
      gPoly([0, 1, 2, 3, 4, 5].map((i) => pt(i, 100)), [13, 51, 38], 255);
      [25, 50, 75, 100].forEach((lv) => { const P = [0, 1, 2, 3, 4, 5].map((i) => pt(i, lv)); for (let i = 0; i < 6; i++) gLine(P[i][0], P[i][1], P[(i + 1) % 6][0], P[(i + 1) % 6][1], 1, [102, 170, 136]); });
      for (let i = 0; i < 6; i++) { const e = pt(i, 100); gLine(cx0, cy0, e[0], e[1], 1, [102, 170, 136]); }
      { const P = [0, 1, 2, 3, 4, 5].map((i) => pt(i, 60)); for (let i = 0; i < 6; i++) gLine(P[i][0], P[i][1], P[(i + 1) % 6][0], P[(i + 1) % 6][1], 2, YEL, true); } // 60点の線(点線)
      if (have.length >= 3) { const P = ax.map((a, i) => pt(i, a.v == null ? 0 : a.v)); gPoly(P, [255, 120, 90], 120); for (let i = 0; i < 6; i++) gLine(P[i][0], P[i][1], P[(i + 1) % 6][0], P[(i + 1) % 6][1], 3, [255, 122, 90]); P.forEach((q, i) => { if (ax[i].v != null) rrect(Math.round(q[0]) - 4, Math.round(q[1]) - 4, 9, 9, 4, [255, 122, 90]); }); }
      else { fill(cx0 - 100, cy0 - 18, 200, 36, [0, 0, 0], 150); text('データを ためています', cx0, cy0 - 12, 21, WHITE, 1); }
      ax.forEach((a, i) => { const q = pt(i, 100, R + 26); text(a.name, Math.round(q[0]), Math.round(q[1]) - 11, 19, a.v == null ? [150, 165, 155] : WHITE, 1); });
      const best = have.slice().sort((x, y) => y.v - x.v)[0], worst = have.slice().sort((x, y) => x.v - y.v)[0], tip = { '攻撃力': '役づくりを 意識しましょう。', '守備力': '危ない牌を 見分けましょう。', '洞察力': '待ちや 押し引きの クイズが おすすめです。', '牌効率': '牌効率の クイズが おすすめです。', '計算力': 'クイズで 練習しましょう!', '打点力': 'ドラや 役を ねらってみましょう。' };
      const say = have.length >= 3 ? (best.name + 'が 得意です。\nいちばん のばせるのは「' + worst.name + '」。' + tip[worst.name]) : 'まだ 記録が すくないです。麻雀を遊んだり、クイズを解くと、強さが 見えてきます。';
      tFace(sg.total == null ? 'advice' : sg.total >= 80 ? 'cheer' : sg.total >= 60 ? 'ok' : 'advice', 'dg0' + (sg.total || 0), 716, 52, 72);
      const f = fitRich(say, [18, 17, 16], 186, 170), bh = f.h + 26; panel(606, 132, 212, bh, 12, CREAM, GREEN, 3, 255); richDraw(f.lines, 618, 144, f.sz, INK, 0);
      const ly = 132 + bh + 14; gLine(612, ly + 10, 636, ly + 10, 2, YEL, true); text('60点 = ふつう', 644, ly + 1, 15, [255, 233, 160]); text('80点 = じょうず(めざす線)', 612, ly + 24, 15, [255, 233, 160]);
      diagTabs(0, '◀ ▶ ページ   戻る: ホームへ'); return;
    }
    if (pg === 1) { // ポイントのうつりかわり
      const hist = (D.rk && D.rk.hist) || [], info = D.info, n = hist.length;
      text('ポイントのうつりかわり', 62, 58, 19, WHITE); text(n ? '(さいきん ' + n + '回)' : '', 270, 62, 14, [200, 220, 205]);
      if (info) { // 段位
        panel(612, 56, 206, 122, 12, CREAM, [160, 110, 0], 3, 255); text('いまの 段位', 626, 64, 15, [90, 90, 80]); text(info.name, 626, 82, 30, INK);
        fill(626, 122, 178, 12, [210, 210, 200]); fill(626, 122, Math.round(178 * Math.max(0.03, Math.min(1, info.prog))), 12, [214, 150, 0]); text(info.next ? info.next + 'まで あと ' + info.left + ' pt' : 'いちばん上です', 626, 142, 15, [90, 90, 80]);
      }
      if (!n) { text('まだ 記録が ありません。', 300, 190, 24, WHITE, 1); text('東風戦・東南戦を 最後まで 遊ぶと、ここに 出ます。', 300, 228, 18, [200, 220, 205], 1); diagTabs(1, '◀ ▶ ページ   戻る: ホームへ'); return; }
      const cum = []; let acc = 0; hist.forEach((h) => { acc += h.p; cum.push(acc); });
      const X0 = 62, Y0 = 108, W = 520, Hh = 262, all = hist.map((h) => h.p).concat(cum, 0), ymin = Math.floor(Math.min.apply(null, all) / 40) * 40, ymax = Math.max(ymin + 80, Math.ceil(Math.max.apply(null, all) / 40) * 40), Y = (v) => Math.round(Y0 + (ymax - v) / (ymax - ymin) * Hh);
      for (let v = ymin; v <= ymax; v += 40) { fill(X0, Y(v), W, v === 0 ? 2 : 1, v === 0 ? [150, 180, 170] : [58, 90, 74]); text(String(v), X0 - 6, Y(v) - 8, 13, [200, 220, 205], 2); }
      const slot = W / Math.max(n, 12), bw = Math.max(4, Math.floor(slot * 0.7));
      hist.forEach((h, i) => { const x = Math.round(X0 + i * slot + (slot - bw) / 2), y1 = Y(Math.max(h.p, 0)), y2 = Y(Math.min(h.p, 0)); fill(x, y1, bw, Math.max(1, y2 - y1), h.p >= 0 ? [72, 192, 140] : [224, 96, 94]); if (n <= 18 && h.o != null) text('★' + h.o, x + Math.round(bw / 2), h.p >= 0 ? y1 - 15 : y2 + 2, 12, [255, 233, 160], 1); });
      cum.forEach((c, i) => { const x = Math.round(X0 + i * slot + slot / 2), y = Y(c); if (i) gLine(Math.round(X0 + (i - 1) * slot + slot / 2), Y(cum[i - 1]), x, y, 3, [255, 122, 160]); });
      if (n <= 18) cum.forEach((c, i) => rrect(Math.round(X0 + i * slot + slot / 2) - 4, Y(c) - 4, 9, 9, 4, [255, 122, 160]));
      [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).forEach((i) => text((i + 1) + '回目', Math.round(X0 + i * slot + slot / 2), Y0 + Hh + 8, 14, [200, 220, 205], 1));
      fill(62, 84, 14, 10, [72, 192, 140]); text('その回の ポイント', 80, 80, 14, [200, 220, 205]); gLine(214, 89, 232, 89, 3, [255, 122, 160]); text('合計', 238, 80, 14, [200, 220, 205]); text('★ = その回の 相手の強さ', 290, 80, 14, [255, 233, 160]);
      const avgR = (a) => a.length ? a.reduce((s, h) => s + h.r, 0) / a.length : 0, renda = (a) => a.length ? a.filter((h) => h.r <= 2).length / a.length : 0, prev = hist.slice(0, -1), sgn = (v, f) => (v >= 0 ? '+' : '') + f(v);
      const blocks = [['ポイント合計', (acc >= 0 ? '+' : '') + acc, '前回より ' + sgn(hist[n - 1].p, String)], ['平均じゅんい', avgR(hist).toFixed(2) + '位', prev.length ? '前回より ' + sgn(avgR(hist) - avgR(prev), (v) => v.toFixed(2)) : ''], ['連対率(1・2位)', (renda(hist) * 100).toFixed(1) + ' %', prev.length ? '前回より ' + sgn((renda(hist) - renda(prev)) * 100, (v) => v.toFixed(1)) + '%' : '']];
      blocks.forEach((b, i) => { const y = 186 + i * 80; text(b[0], 614, y, 15, [200, 220, 205]); text(b[1], 614, y + 20, 30, WHITE); text(b[2], 614, y + 58, 14, [150, 240, 190]); });
      diagTabs(1, '◀ ▶ ページ   戻る: ホームへ'); return;
    }
    if (pg === 2) { // アドバイス
      const tot = sg.total; tFace(tot != null && tot >= 60 ? 'ok' : 'advice', 'dg2', 22, 56, 76);
      panel(112, 58, 706, 46, 12, CREAM, GREEN, 3, 255); text('あなたの 麻雀を 見ました。いいところと、のばせるところを お知らせします。', 128, 58 + Math.round((46 - 19) / 2) - 1, fitSz('あなたの 麻雀を 見ました。いいところと、のばせるところを お知らせします。', 19, 676, 14), INK);
      const sec = (y, ttl, col, items, empty, avail) => { const f = fitRich(items.length ? items.slice(0, 3).map((t) => '・' + t).join('\n') : empty, [20, 19, 18, 17, 16], 668, avail - 62), h = f.h + 62; panel(112, y, 706, h, 12, CREAM, col, 3, 255); text(ttl, 130, y + 10, 21, col); richDraw(f.lines, 130, y + 42, f.sz, INK, 0); return h; };
      const h1 = sec(112, '★ いいところ', [44, 90, 26], d.good, d.hands < 6 && d.quizN < 6 ? 'まだ、記録が すくないです。遊んだり、クイズを解くと、お知らせします。' : 'いまは、まだ 見つかっていません。', 150);
      sec(112 + h1 + 10, '▲ のばせるところ', [160, 82, 26], d.weak, 'いまのところ、大きな 苦手は 見つかっていません。すばらしい!', 416 - (112 + h1 + 10));
      diagTabs(2, '決定: 苦手を 練習   戻る: ホームへ'); return;
    }
    // 学習の記録
    {
      const bars = d.bars.slice(0, 6); bars.forEach((b, i) => {
        const y = 66 + i * 36, col = b.a >= 0.8 ? [90, 200, 120] : b.a >= 0.5 ? [240, 200, 70] : [240, 110, 90];
        text(b.name, 26, y, 21, WHITE); fill(280, y + 4, 240, 22, [40, 60, 50]); fill(280, y + 4, Math.round(240 * b.a), 22, col); text(Math.round(b.a * 100) + '%  ' + b.n + '問', 534, y, 21, WHITE);
      });
      if (!bars.length) text('クイズの記録が まだ ありません。', 26, 76, 24, WHITE);
      const L = learnLoad(), done = MJ.Learn.STEPS.filter((st) => L.done[st.id]).length, nx = MJ.Learn.STEPS.findIndex((st) => !L.done[st.id]);
      const notes = d.notes.concat(['点数計算の勉強: ' + done + ' / ' + MJ.Learn.STEPS.length + ' おぼえた' + (nx >= 0 ? '。つぎは ステップ' + (nx + 1) + '「' + MJ.Learn.STEPS[nx].t + '」が おすすめです。' : '。すべて おぼえました!')]);
      const f = fitRich(notes.join('\n'), [22, 20, 18, 16], 780, 124); richDraw(f.lines, 26, 292, f.sz, [220, 235, 215], 0);
    }
    diagTabs(3, '決定: 苦手を 練習   戻る: ホームへ');
  }

  /* ---------- クレジット(設定から) ---------- */
  const CREDITS = [
    ['開発', 'Akihito Abe'], ['SPECIAL THANKS', 'Myumi'],
    ['音声(あなたの掛け声など)', 'VOICEVOX:ずんだもん'],
    ['音声(CPUの掛け声)', 'Open JTalk(pyopenjtalk)。音響モデル: Mei (MMDAgent Example Characters) CC BY 3.0'],
    ['BGM・画像', '制作者が用意(生成)したものです。対戦相手は、歴史上の人物をモチーフにしています。'],
    ['注意', '点数・符の計算や危険度は、学習用の目安です。実際のルール(店・地域・アプリ)によって異なる場合があります。'],
  ];
  function drawCredits() {
    quizFrame('クレジット', '', '', '決定ボタン・戻る で もどる');
    let best = null;
    for (const sz of [32, 30, 28, 26, 24, 22, 20, 18]) { // 入りきる いちばん大きな字で
      const items = CREDITS.map((c) => ({ h: c[0], lines: richWrap(c[1], sz, 770) })); const hh = items.reduce((a, it) => a + Math.round((sz - 4) * 1.4) + richH(it.lines, sz) + 6, 0); best = { sz, items }; if (hh <= 352) break;
    }
    let y = 56; best.items.forEach((it) => { text(it.h, 30, y, best.sz - 4, YEL); y += Math.round((best.sz - 4) * 1.4); richDraw(it.lines, 30, y, best.sz, WHITE, 0); y += richH(it.lines, best.sz) + 6; });
  }
  function drawSlots() {
    gfx.clear(32, 74, 60); text('セーブデータをえらぶ', 360, 18, 28, YEL, 1);
    if (!S.slots.length) text('セーブデータがありません', 360, 180, 20, WHITE, 1);
    S.slots.forEach((q, i) => { const sn = q.v.snap, y = 62 + i * 56; panel(80, y, 560, 48, 10, S.slotIdx === i ? YEL : WHITE, [120, 120, 120], 1, 235);
      text((i === 0 ? '最新  ' : (i + 1) + '番目  ') + kyokuText(sn), 94, y + 3, 22, BLACK); text('持ち点 ' + sn.scores.join(' / '), 94, y + 29, 17, [60, 60, 60]); });
    text('↑↓ えらぶ   決定 ロード   もどる でタイトルへ', 360, 398, 20, WHITE, 1);
  }

  /* ---------- 入力 ---------- */
  window.__key = function (k) {
    S.dirty = true; if (S.locked) return;
    if (S.guardUntil && __now() < S.guardUntil) return; // 保存のあと、次の画面に変わった直後の押しまちがいを無視する
    NSND.sfx(k === 'ok' ? 'ok' : k === 'back' ? 'click' : 'select', 0.5);
    if (S.rankScr && S.mode !== 'stats') { const r = S.rankScr; if (k === 'left' || k === 'right') r.idx = 1 - (r.idx || 0); else if (k === 'back' || (k === 'ok' && (r.idx || 0) === 1)) { S.rankScr = null; r.done(); } else if (k === 'ok') { S.statsPrev = S.mode; S.mode = 'stats'; S.statsPg = 0; } return; }
    if (k === 'menu' && !S.menuP) { openMenu(); return; } // スタート+セレクト長押し
    if (S.menuP) {
      const items = menuItems();
      if (k === 'up' || k === 'down') S.menuP.idx = wrap(S.menuP.idx + (k === 'up' ? -1 : 1), items.length);
      else if (k === 'back') { S.menuP = null; MJ.paused = false; }
      else if (k === 'ok') { const it = items[S.menuP.idx]; S.menuP = null; MJ.paused = false; if (it === 'ホームにもどる') stopGame(); }
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
        if (p.idx !== 0) { S.guardUntil = __now() + 1500; p.res(); return; }
        S.locked = true; S.toast = { text: 'セーブ中です…  電源を切らないでください', until: __now() + 60000 }; dirty();
        setTimeout(() => { const ok = slotWrite(p.snap); S.toast = { text: ok ? 'セーブしました  自動で次へ進みます' : 'セーブできませんでした', until: __now() + 1400 }; dirty(); setTimeout(() => { S.toast = null; S.locked = false; S.guardUntil = __now() + 1500; dirty(); p.res(); }, 1600); }, 700);
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
      else if (k === 'back') S.confirmQ = null; else if (k === 'ok') { const i = S.confirmQ.idx; S.confirmQ = null; if (i === 0) __quit(); }
      return;
    }
    if (S.mode === 'quiz') { quizKey(k); return; }
    if (S.mode === 'dict') { dictKey(k); return; }
    if (S.mode === 'study') { studyKey(k); return; }
    if (S.mode === 'video') { videoKey(k); return; }
    if (S.mode === 'learn') { learnKey(k); return; }
    if (S.mode === 'diag') { diagKey(k); return; }
    if (S.mode === 'credits') { if (k === 'ok' || k === 'back') { S.mode = 'settings'; dirty(); } return; }
    if (S.mode === 'slots') {
      if (k === 'up' || k === 'down') { if (S.slots.length) S.slotIdx = wrap(S.slotIdx + (k === 'up' ? -1 : 1), S.slots.length); }
      else if (k === 'back') { S.mode = 'menu'; S.slots = []; }
      else if (k === 'ok' && S.slots.length) { const q = S.slots[S.slotIdx]; S.slots = []; startGame(q.v.snap); } // ロードしたら、この一覧は、また見えなくなる
      return;
    }
    if (S.mode === 'title') { // タイトル: はじめる / BGM / 終了
      if (k === 'left' || k === 'right' || k === 'up' || k === 'down') { S.titleIdx = 1 - S.titleIdx; }
      else if (k === 'ok') { if (S.titleIdx === 0) later(() => { S.mode = 'menu'; S.homeBot = false; S.menuIdx = firstOn(homeItems(), 0, 1); }, 120); else later(() => { S.confirmQ = { idx: 0 }; }, 120); }
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
        else if (it.k === 'credits' && k !== 'left') { S.mode = 'credits'; }
        else if (it.k === 'back' && k === 'ok') S.mode = 'menu';
      }
      return;
    }
    if (S.mode === 'menu') { // ホーム
      const items = homeItems();
      { // 隠しコマンド(↑↑↓↓←→←→ BA): 順番どおり、しかも続けて入れたときだけ(ガチャガチャでは開かない)
        const nw = __now(); if (!S.hidN || nw - (S.hidT || 0) > 2500) S.hidN = 0; S.hidT = nw;
        if (k === HIDDEN[S.hidN]) S.hidN++; else S.hidN = k === HIDDEN[0] ? 1 : 0;
        if (S.hidN >= HIDDEN.length) { S.hidN = 0; S.slots = slotRead(); S.slotIdx = 0; S.mode = 'slots'; return; }
        if (S.hidN === HIDDEN.length - 1) return; // 最後の1つ手前の「戻る」は、何も起こさない
      }
      if (S.menuIdx >= items.length) S.menuIdx = 0;
      if (S.homeBot) { // 下の段: ゲーム終了 / 成績 / 対戦成績 / 麻雀先生
        const bi = S.homeBotIdx; // 0: 終了 1: 成績(上の段) 2: 診断(下の段)
        if (k === 'left') S.homeBotIdx = bi === 1 ? 0 : bi; else if (k === 'right') { if (bi === 0) S.homeBotIdx = 1; else S.homeBot = false; } // 右はし: もとの項目へ(menuIdx は覚えている)
        else if (k === 'down') { if (bi < 2) S.homeBotIdx = 2; else { S.homeBot = false; S.menuIdx = firstOn(items, 0, 1); } } // 下: 診断へ。いちばん下から下: 「麻雀をはじめる」へ
        else if (k === 'up') { if (bi === 2) S.homeBotIdx = 0; else { S.homeBot = false; S.menuIdx = firstOn(items, 0, 1); } }
        else if (k === 'back') S.mode = 'title';
        else if (k === 'ok') { const b = HOME_BOTTOM[S.homeBotIdx].k; later(() => { if (b === 'exit') S.confirmQ = { idx: 0 }; else if (b === 'rank') S.rankScr = { rk: null, done: () => { S.mode = 'menu'; dirty(); } }; else if (b === 'stats') { S.mode = 'stats'; S.statsPg = 0; } else if (b === 'diag') startDiag(); else toggleTeacher(); }); }
        return;
      }
      if (k === 'up') { const j = firstOn(items, S.menuIdx - 1, -1); S.menuIdx = j < S.menuIdx ? j : firstOn(items, items.length - 1, -1); } // いちばん上から上: いちばん下(設定)へ
      else if (k === 'down') { const j = firstOn(items, S.menuIdx + 1, 1); S.menuIdx = j > S.menuIdx ? j : firstOn(items, 0, 1); } // いちばん下から下: いちばん上へ
      else if (k === 'left') { S.homeBot = true; S.homeBotIdx = 1; }
      else if (k === 'back') S.mode = 'title';
      else if (k === 'ok') {
        const it = items[S.menuIdx]; if (!it || it.off) return;
        if (it.act === 'play') later(() => { const l = slotRead(); if (l.length) S.playQ = { idx: 0, snap: l[0].v.snap }; else S.teachQ = { idx: teacherOn() ? 1 : 0, snap: null }; });
        else if (it.act === 'quiz') later(() => startQuiz({ title: '麻雀クイズ', gens: () => weightedGens(RCATS), n: 10 }));
        else if (it.act === 'study') later(() => startStudy());
        else if (it.act === 'settings') later(() => { S.mode = 'settings'; S.setIdx = 0; });
      }
      return;
    }
    if (S.result && S.result.rd) { // 流局の結果: 読み上げ中は、決定で全部見せる / そのあとは ← → で人を選んで 決定=手牌 / 「次へ」で つぎの画面
      const r = S.result, rd = r.rd;
      if (rd.reading) { if (k === 'ok') { rd.token++; rd.reading = false; rd.shown = 4; rd.now = -1; NSND.stopSpeak(); dirty(); } return; }
      if (rd.pop >= 0) { if (k === 'ok' || k === 'back') { rd.pop = -1; dirty(); } return; }
      if (k === 'left') rd.sel = Math.max(0, rd.sel - 1); else if (k === 'right') rd.sel = Math.min(4, rd.sel + 1);
      else if (k === 'ok') { if (rd.sel < 4) rd.pop = rd.sel; else { S.result = null; r.done(); } }
      dirty(); return;
    }
    if (S.result) { if (k === 'ok') { const r = S.result; S.result = null; r.done(); } return; }
    if (S.rankP) { if (k === 'ok') { const q = S.rankP; q.done(); dirty(); } return; }
    if (S.end) { if (k === 'ok') { const r = S.end; S.end = null; r.done(); } return; }
    if (S.coach) { // 解説の窓
      const c = S.coach, cs = c.cards || [];
      if (k === 'left' || k === 'right') { if (cs.length) { c.tab = (c.tab + (k === 'right' ? 1 : cs.length - 1)) % cs.length; c.scroll = 0; } }
      else if (k === 'up' || k === 'down') { const cd = cs[c.tab]; if (cd && cd.fit && cd.fit.hh > 322) c.scroll = Math.max(0, Math.min(Math.max(0, cd.fit.lines.length - 3), (c.scroll || 0) + (k === 'down' ? 2 : -2))); }
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
        if (s.row === 0) { const live = myTiles(s.p), h = live[s.idx] || tiles[s.idx]; if (h && allowed(s, h)) { const gp = s.p.drawn ? tiles.length - 1 : -1; S.curIdx = s.idx; S.pick = [handX(s.idx, s.idx === gp), HY - 8]; S.self = null; try { recordDiscard(S.game, s.p, h); } catch (e) { /* ignore */ } s.res({ act: s.rm ? 'riichi' : 'discard', tile: h }); } }
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
    speak(g, p, t, ms) { // セリフは、ポン・チー・リーチなどの宣言や、ほかの人のセリフが終わるまで待ってから、1人ずつ出す(かぶらないように)
      ms = ms || Math.max(2800, Math.min(4800, 1300 + String(t).length * 110)); (S.sayQ || (S.sayQ = [])).push({ g, p, t, ms, t0: __now() }); pumpSay();
    },
    banner(g, p, t) { S.banner = { text: t, t0: __now(), p, call: true }; if (p && p.isHuman) setMood({ 'リーチ': 'fight', 'ポン': 'call', 'チー': 'call', 'カン': 'call', 'ロン': 'point', 'ツモ': 'happy' }[t] || 'normal', 4000); dirty(); if (!g.fast) { NSND.call(p, t); NSND.sfx({ 'リーチ': 'riichi', 'ポン': 'call', 'チー': 'call', 'カン': 'kan', 'ロン': 'ron', 'ツモ': 'tsumo' }[t]); } return sleep(g.fast ? 0 : 1150).then(() => { S.banner = null; dirty(); }); },
    handStart(g) {
      S.curIdx = null; if (teacherOn() && !S.tmsgShown) { S.tmsgShown = 1; S.tmsg = { text: 'おまかせください。おすすめの牌に ★ をつけます', until: __now() + 6000 }; setTimeout(dirty, 6100); }
      S.game = g; NSND.game(g); NSND.sfx('slam');
      { // あなたの表情: 最終局はドキドキ。前の局で振り込んだらむすっ・上がったらくすくす。トップなら余裕・最下位ならやる気
        const me = g.players[0], rk = 1 + g.players.filter((q) => q.score > me.score).length, even = g.players.every((q) => q.score === me.score);
        setMood((g.isOras && g.isOras()) ? 'dokidoki' : S.carryMood || (even ? 'normal' : rk === 1 ? 'smug' : rk === 4 ? 'fight' : 'focus')); S.carryMood = null;
      }
      let vlen = 0; if (S.skipKyokuVoice) S.skipKyokuVoice = false; else { try { vlen = NSND.readKyoku(g) || 0; } catch (e) { /* ignore */ } }
      const sb = S.skipBanner; S.skipBanner = false;
      if (!sb) S.banner = { text: g.kyokuLabel(), t0: __now() };
      if (g.fast) { S.deal = null; dirty(); return sleep(300).then(() => { S.banner = null; dirty(); }); }
      const bms = sb ? 300 : vlen ? Math.max(2200, Math.round(vlen * 1000) + 700) : 900; // 読み上げが終わって、少し画面を見せてから、配牌
      S.deal = { t0: __now() + bms, step: 0, perm: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].sort(() => Math.random() - 0.5), flip: (() => { const f = {}; for (let n = 0; n < 4; n++) f[Math.floor(Math.random() * 13)] = 1; return f; })() };
      setTimeout(() => { S.banner = null; dirty(); }, bms); dirty();
      return sleep(bms + DEAL_END + 80);
    },
    padHand() {},
    dice(g, first) { if (g.fast) return Promise.resolve(null); return new Promise((done) => { const a = 1 + Math.floor(Math.random() * 6), b = 1 + Math.floor(Math.random() * 6); S.dice = { id: (S.diceSeq = (S.diceSeq || 0) + 1), a, b, target: (a + b - 1) % 4, started: false, rolling: false, settled: false, t0: __now(), t1: 0, done: (tg) => { g.dealer = tg; S.skipBanner = true; S.skipKyokuVoice = true; done(tg); } }; dirty(); }); },
    askSelf(g, p, opts, st) {
      (S.thT || []).forEach(clearTimeout); S.thT = []; // 悩んでいるとき: 30秒・60秒・120秒、それ以降は3分ごとに、CPUがひとこと(Edge版と同じ)
      if (!p.riichi && !g.fast && MJ.Banter) { const say = (i) => { if (S.self && S.self.p === p && S.game === g) { try { MJ.Banter.think(g, i); } catch (e) { /* ignore */ } } }; S.thT = [30, 60, 120].map((sec, i) => setTimeout(() => say(i), sec * 1000)); const loop = () => { say(3); S.thT.push(setTimeout(loop, 180000)); }; S.thT.push(setTimeout(loop, 180000)); }
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
      S.bub = {}; S.sayQ = []; S.banner = null; try { MJ.Stats.hand(g, r); } catch (e) { /* ignore */ }
      NSND.result(r.type === 'draw' ? 'draw' : r.wins.some((w) => w.winner.isHuman) ? 'win' : r.delta[0] < 0 ? 'lose' : 'calm');
      const iWon = r.type === 'win' && r.wins.some((w) => w.winner.isHuman), iLost = r.type === 'win' && !iWon && r.delta && r.delta[0] < 0;
      setMood(r.type !== 'win' ? 'relief' : iWon ? 'win' : iLost ? 'shock' : 'focus'); S.carryMood = iLost ? 'grumpy' : iWon ? 'laugh' : null;
      if (r.type !== 'win') {
        return (async () => {
          if (!g.fast && !r.abort) { await sleep(900); if (g.stopped) return; S.ryu = { t0: __now() }; NSND.sfx('slam'); setTimeout(() => { try { NSND.speak(['x:りゅうきょく']); } catch (e) { /* ignore */ } }, 450); dirty(); await sleep(1950); S.ryu = null; dirty(); if (g.stopped) return; } // 最後の牌のあと、ひと呼吸 → 「流局」が左から流れてきて止まる(Edge版と同じ)
          NSND.sfx('drawgame');
          return new Promise((done) => {
            const rd = r.abort || g.fast ? null : { shown: 0, now: -1, sel: 4, pop: -1, reading: true, token: 0, waits: [] };
            if (rd) r.hands.forEach((v, i) => { try { rd.waits[i] = r.tenpai[i] ? MJ.waits(MJ.toCounts(v.concealed), (v.melds || []).length) : []; } catch (e) { rd.waits[i] = []; } });
            if (rd && g.fast) { rd.shown = 4; rd.reading = false; }
            S.result = Object.assign({ done }, r, { rd, done: () => { NSND.stopSpeak(); done(); } }); dirty();
            if (rd) (async () => { // 「りゅうきょく」→ 1人ずつ「テンパイ」「ノーテン」
              const tk = ++rd.token, alive = () => S.result && S.result.rd === rd && rd.token === tk && !g.stopped;
              await sleep(700); if (!alive()) return;
              let d = 0.8;
              for (let i = 0; i < 4; i++) { if (!alive()) return; rd.now = i; rd.shown = i + 1; dirty(); d = 0.9; try { d = NSND.speak([r.tenpai[i] ? 'x:テンパイ' : 'x:ノーテン']) || 0.9; } catch (e) { /* ignore */ } await sleep(d * 1000 + 450); }
              if (!alive()) return; rd.now = -1; rd.reading = false; dirty();
            })();
          });
        })();
      }
      return (async () => { // 上がった人ごとに、役と点数の画面(読み上げつき)。そのあと、4人のじゅんいの画面
        const n = r.wins.length;
        for (let i = 0; i < n; i++) {
          if (g.stopped) return;
          try { NSND.readWin(g, { wins: [r.wins[i]] }); } catch (e) { /* ignore */ }
          await new Promise((done) => { S.result = Object.assign({}, r, { wins: [r.wins[i]], idx: i, total: n, done: () => { NSND.stopSpeak(); done(); } }); dirty(); });
        }
        if (g.stopped) return;
        setMood(iWon ? 'win' : iLost ? 'lose' : 'normal');
        await new Promise((done) => { S.rankP = { r, done: () => { S.rankP = null; done(); } }; dirty(); });
      })();
    },
    askSave(g) { // 局が終わるたびに、質問なしで、自動で保存する(次の局の画面が出ている間に、すみっこに小さく知らせる)
      let ok = false; try { ok = slotWrite(g.snapshot()); } catch (e) { /* ignore */ }
      S.saveNote = { text: ok ? 'セーブしました' : 'セーブできませんでした', t0: __now(), until: __now() + 4200 }; dirty(); setTimeout(dirty, 4300);
      return Promise.resolve();
    },
    gameEnd(g, f) { NSND.sfx('end'); try { const mine = f.results.find((x) => x.p.isHuman); setMood(({ 1: 'win', 2: 'laugh', 3: 'relief', 4: 'lose' })[mine ? mine.rank : 2] || 'normal'); } catch (e) { /* ignore */ } let rk = null; try { rk = MJ.Rank.record(g, f); } catch (e) { print('rank err ' + e); } return new Promise((done) => { S.end = Object.assign({}, f, { rk, done: () => { S.rankScr = { rk, done }; dirty(); } }); }); },
  };

  const AI_T = [0, 1, 2, 3, 3, 4, 4, 5, 5, 5, 5];
  function liftChars(chars) { // 段位が上がると、★の低いキャラも、最低でも その段位の「★の最低値」まで強くなる
    let dan = 0; try { dan = MJ.Rank.get().dan; } catch (e) { /* ignore */ }
    return chars.map((c) => { const L = MJ.effLevel ? MJ.effLevel(c.level, dan) : c.level; return L === c.level ? c : Object.assign({}, c, { level: L, ai: AI_T[Math.min(10, L)] }); });
  }
  function pickChars() {
    let ok = null; try { ok = MJ.Rank.unlockedIds(); } catch (e) { /* ignore */ } const pool = MJ.CHARS.filter((c) => c.id !== 0 && (!ok || !ok.length || ok.includes(c.id))); const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  }
  function stopGame() { // ゲームを途中でやめて、ホームへ
    const g = S.game; if (!g) { S.mode = 'menu'; dirty(); return; }
    g.stopped = true; MJ.paused = false; S.tmsgShown = 0; S.side = S.coach = null;
    const s = S.self, r = S.react, rs = S.result, en = S.end, sp = S.saveP; if (S.rankP) { const q = S.rankP; S.rankP = null; q.done(); } if (S.rankScr) { const q = S.rankScr; S.rankScr = null; q.done(); }
    S.self = S.react = S.result = S.end = S.saveP = null;
    if (s) s.res({ act: 'discard', tile: s.p.hand[0] }); if (r) r.res({ act: 'pass' }); if (rs) rs.done(); if (en) en.done(); if (sp) sp.res();
    dirty();
  }
  /* 親が決まったあと: 「東一局!」「勝負!」(顔・文字・声)。そのあと、すぐ配牌へ */
  const startIntro = (g) => new Promise((res) => { if (g.resumed || g.fast) { res(); return; } S.intro = { t0: __now(), done: () => { S.skipBanner = true; res(); } }; NSND.sfx('slam'); dirty(); });
  async function startGame(sn) {
    S.mode = 'game'; dirty();
    const chars = sn && sn.chars ? sn.chars.map((id) => MJ.CHARS.find((c) => c.id === id)).filter(Boolean) : [];
    const g = new MJ.Game({ chars: liftChars(chars.length === 3 ? chars : pickChars()), mode: 'free', length: sn && sn.length || MJ.RULES.length || 'east', ui, cpuDelay: __auto ? 40 : undefined });
    if (sn && chars.length === 3) { ['dealer', 'kyoku', 'honba', 'kyotaku', 'roundWind', 'handCount'].forEach((k) => { if (sn[k] != null) g[k] = sn[k]; }); sn.scores.forEach((sc, i) => { if (g.players[i]) g.players[i].score = sc; }); g.resumed = true; }
    g.players[0].coachType = 'balance'; // 麻雀先生は、バランス型
    S.game = g;
    try { await g.run(); } catch (e) { print('GAME ERR ' + (e && e.stack || e)); }
    S.game = null; S.mode = 'menu'; S.side = S.coach = null; S.menuIdx = 0; S.homeBot = false; NSND.home(); S.self = S.react = S.result = S.end = S.saveP = null; dirty();
    if (__auto) __quit();
  }
  const menuItems = () => ['つづける', 'ホームにもどる'];

  /* ---------- メインループから ---------- */
  let nextAuto = 0, lastSave = 0, nextSide = 0, coachShots = 0;
  window.__frame = function (now) {
    __runTimers(now);
    if (S.mode === 'video') vTick(now);
    if (__auto && globalThis.__teacherEnv && S.self && !S.side && !S.coach && now > nextSide) { nextSide = now + 3300; window.__key('right'); window.__key('ok'); setTimeout(() => window.__key('ok'), 1500); } // 試験用: 解説の窓を、ときどき開く
    if (__auto && now > nextAuto && !S.coach && !S.side) { nextAuto = now + 90; window.__key('ok'); }
    if (__lsDirty && now - lastSave > 1500) { lastSave = now; __lsDirty = false; try { __save(JSON.stringify(__ls)); } catch (e) { /* ignore */ } }
    /* 画面の入れかえ(ダブル/トリプルバッファ)で、古い絵が交互に出て点滅しないよう、変化のあとは3回続けて描く */
    if (pressing() || S.intro || S.dice || S.fly || (S.deal && now >= S.deal.t0 - 50) || S.ryu || (S.banner && now - (S.banner.t0 || 0) < 260)) S.dirty = true; // 動いている間は、描き続ける
    if (!S.dirty) return false;
    S.dirty = false; return true;
  };
  const perf = { t0: 0, n: 0, ms: 0, shown: '' };
  function pumpSay() {
    if (S.sayT) return;
    const q = S.sayQ || []; const now = __now();
    while (q.length && (now - q[0].t0 > 4000 || q[0].g !== S.game)) q.shift(); // 古くなったセリフは出さない
    if (!q.length) return;
    const busy = (S.banner && S.banner.call) || Object.keys(S.bub).some((k) => S.bub[k].until > now) || S.react || (S.fly && S.fly.t0 + 600 > now);
    if (busy) { S.sayT = setTimeout(() => { S.sayT = null; pumpSay(); }, 250); return; }
    const x = q.shift(); S.bub[x.p.seat] = { name: x.p.name, text: x.t, p: x.p, until: __now() + x.ms }; dirty();
    S.sayT = setTimeout(() => { S.sayT = null; dirty(); pumpSay(); }, x.ms + 120);
  }
  const drawBody = function () {
    // カーソルだけが動いたとき: 画面ぜんたいは描きなおさず、手牌のあたりだけ描く(キビキビ動かすため)
    if (S.partialKey && !(S.self && S.self.rm) && !S.full && S.mode === 'game' && S.game && S.fullDrawn && !S.result && !S.rankP && !S.end && !S.intro && !S.dice && !S.menuP && !S.soundP && !S.saveP && !(S.toast && S.toast.until > __now()) && !S.coach && !S.rankScr && !S.react && !S.banner && !S.ryu && !Object.keys(S.bub).length && !S.fly && !S.deal && !pressing() && !S.side && !perfOn()) {
      S.vx = 0; S.vy = 0; gfx.view(0, 0); gfx.clip(0, 360, 720, 108); fill(0, 360, 720, 108, [32, 74, 60]); gfx.layer(1 - 1); drawHand(S.game); gfx.clip(); S.partialKey = false; return true;
    }
    S.partialKey = false; S.full = false; S.fullDrawn = true;
    if (S.mode === 'stats') { gfx.view(0, 0); drawStats(); return true; }
    if (S.mode === 'quiz') { gfx.view(0, 0); S.vx = 0; S.vy = 0; drawQuiz(); if (S.quiz && S.quiz.confirm) { S.vx = 56; S.vy = 20; gfx.view(56, 20); drawDialog(S.quiz.learn ? 'クイズを やめますか?' : 'ホームに もどりますか?', ['つづける', S.quiz.learn ? 'やめる' : 'ホームにもどる'], S.quiz.confirm.idx, ''); gfx.view(0, 0); S.vx = 0; S.vy = 0; } return true; }
    if (S.mode === 'dict') { gfx.view(0, 0); S.vx = 0; S.vy = 0; drawDict(); return true; }
    if (S.mode === 'study') { gfx.view(0, 0); S.vx = 0; S.vy = 0; drawStudy(); return true; }
    if (S.mode === 'video') { gfx.view(0, 0); S.vx = 0; S.vy = 0; drawVideo(); if (S.vid && S.vid.ask) { const a = S.vid.ask; S.vx = 56; S.vy = 20; gfx.view(56, 20); drawDialog('つづきから 見ますか?', ['つづきから(' + vfmt(S.vid.d.pos[S.vid.files[a.i].name]) + ')', 'はじめから'], a.idx, ''); gfx.view(0, 0); S.vx = 0; S.vy = 0; } return true; }
    if (S.mode === 'learn') { gfx.view(0, 0); S.vx = 0; S.vy = 0; drawLearn(); if (S.learn && S.learn.confirm) { S.vx = 56; S.vy = 20; gfx.view(56, 20); drawDialog('ホームに もどりますか?', ['つづける', 'ホームにもどる'], S.learn.confirm.idx, ''); gfx.view(0, 0); S.vx = 0; S.vy = 0; } return true; }
    if (S.mode === 'diag') { gfx.view(0, 0); S.vx = 0; S.vy = 0; drawDiag(); return true; }
    if (S.mode === 'credits') { gfx.view(0, 0); S.vx = 0; S.vy = 0; drawCredits(); return true; }
    const full = S.mode === 'title' || S.mode === 'menu' || S.mode === 'settings' || S.mode === 'rules';
    const inGame = !full && S.mode !== 'slots' && S.game && !S.result && !S.end && !S.rankP;
    if (full || inGame || S.result || S.rankP) { S.vx = 0; S.vy = 0; } else { S.vx = 56; S.vy = 20; }
    gfx.view(S.vx, S.vy);
    if (S.mode === 'title') drawTitle(); else if (S.mode === 'menu') drawHome(); else if (S.mode === 'settings') drawSettings(); else if (S.mode === 'rules') drawRules(); else if (S.mode === 'slots') { gfx.clear(32, 74, 60); drawSlots(); }
    else if (S.game) { gfx.clear(32, 74, 60); drawTable(S.game); if (inGame) { fill(720, 0, 112, 468, [28, 32, 34]); gfx.view(0, 20); drawSide(S.game); if (S.coach) drawCoach(); gfx.view(0, 0); } }
    if (S.rankP) drawRankP();
    if (S.result) { drawResult(S.result); if (__auto && globalThis.__shotDir) gfx.shot(__shotDir + '/res' + (++S.shotN) + '.bmp'); }
    if (__auto && globalThis.__shotDir && (S.react || (S.self && S.self.btns.length)) && S.shotR < 6) { gfx.shot(__shotDir + '/act' + (++S.shotR) + '.bmp'); }
    if (S.end) { drawEnd(S.end); if (__auto && globalThis.__shotDir) gfx.shot(__shotDir + '/end.bmp'); }
    if (S.coach && __auto && globalThis.__shotDir && coachShots < 6 && S.coach.cards && S.coach.cards.length) { gfx.view(0, 0); gfx.shot(__shotDir + '/coach' + (++coachShots) + '.bmp'); }
    if (S.rankScr) { drawRankScreen(); gfx.view(0, 0); return true; }
    if (S.intro && S.game) { S.vx = 0; S.vy = 0; gfx.view(0, 0); drawIntro(); return true; }
    if (S.dice && S.game) { S.vx = 0; S.vy = 0; gfx.view(0, 0); drawDice(); return true; }
    S.vx = 56; S.vy = 20; gfx.view(56, 20); // 以降の板(メニューなど)は、画面の中央に
    if (S.saveNote && S.saveNote.until > __now() && !S.saveP) { // 自動セーブの知らせ: 画面の左下に、小さく
      gfx.view(0, 0); const w = 170, x = 8, y = SH - 26; rrect(x, y, w, 22, 5, [0, 0, 0], 170); text(S.saveNote.text, x + w / 2, y + 1, 16, S.saveNote.text === 'セーブしました' ? [190, 235, 200] : [255, 160, 140], 1); gfx.view(S.vx, S.vy);
    }
    const toastOn = S.toast && S.toast.until > __now();
    if (S.saveP || toastOn) { // 保存の質問・セーブ中は、画面全体を黒で覆って卓を見せず、画面の中心に出す
      gfx.view(0, 0); fill(0, 0, SW, SH, [0, 0, 0], 165);
      gfx.view(56, 20);
      if (S.saveP) drawSaveQ();
      if (toastOn) { rrect(110, 187, 500, 54, 8, [0, 0, 0], 225); text(S.toast.text, 360, 200, 24, YEL, 1); }
    }
    gfx.view(S.vx, S.vy);
    if (S.menuP) drawDialog('メニュー', menuItems(), S.menuP.idx, '');
    if (S.soundP) drawSound();
    if (S.teachQ) drawTeachQ();
    if (S.playQ) drawDialog('麻雀をはじめます', ['つづきから(' + kyokuText(S.playQ.snap) + ')', 'はじめから'], S.playQ.idx, '');
    if (S.confirmQ) drawDialog('このまま ゲームが 終了しますが よろしいですか?', ['OK(ゲームを おわる)', 'もどる'], S.confirmQ.idx, '');
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
