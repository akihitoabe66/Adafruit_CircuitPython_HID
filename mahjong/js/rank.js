/* 段位・対戦成績・認定証と、自動セーブ(つづき)。
   段位: 無段から始まり、初段〜九段、その先(10段め)が名人、さらに上が永世名人。東南戦は 1位+30 / 2位+15 / 3位+5 / 4位-10、東風戦はその半分。麻雀クイズ10問正解で+2点(1日+6点まで)、点数計算の勉強は、各カテゴリの最初のチャレンジ正解で+3点。
   降段: 三段以上は、その段の入口から40点下回ると1つ下がる(初段・二段は下がらない。初段になったあとは、無段に戻らない)。
   セーブ: 局のはじめごとに自動で保存し、「つづきから」で、その局のはじめから再開する(牌は配り直す)。 */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const $ = (s) => document.querySelector(s);
  const RK = 'mj_rank', SV = 'mj_save', AS = 'mj_autosave';
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  /* 段位の表: [名前, 必要な累計点]。無段(0点)から始まる */
  const DAN = [['無段', 0], ['初段', 100], ['二段', 250], ['三段', 450], ['四段', 700], ['五段', 1000], ['六段', 1350], ['七段', 1750], ['八段', 2150], ['九段', 2550], ['名人', 2950], ['永世名人', 99999]]; // 永世名人: 点では 上がれない(名人のあと、徳川家康と水戸黄門が そろう「天下分け目」の対局で 1位になったとき)
  const PTS = { south: [30, 15, 5, -10], east: [15, 8, 3, -5] }; // 東風戦は、東南戦の半分
  const DEMOTE_FROM = 3, DEMOTE_GAP = 40; // 三段以上は、入口から40点下回ると降段
  /* 実機版(MJ.RankScale = true のとき): ポイントに「相手の強さ」をかける。 基準の強さ=1+0.8×段位。 相手3人の★の平均が高いほど、勝ち(1・2位)は増え、負け(4位)は減りかたが小さい。
     段位が上がると、★の低いキャラも、最低でも FLOOR(段位) まで強くなる(MJ.effLevel) */
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  MJ.effFloor = (dan) => Math.min(6, 1 + Math.floor(dan / 2));
  MJ.effLevel = (lv, dan) => Math.max(lv, MJ.effFloor(dan));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const base = () => ({ hist: [], pt: 0, games: 0, ranks: [0, 0, 0, 0], opp: {}, day: '', dan: 0, maxdan: 0, v: 2, qc: 0, qday: '', qpt: 0, st: {} });
  const idxOf = (pt) => { let k = 0; DAN.forEach((d, i) => { if (pt >= d[1]) k = i; }); return k; };
  /* 点を足して、昇段・降段を決める。{ before, after } は段位の番号 */
  const addPt = (s, delta) => {
    const before = s.dan;
    s.pt = Math.max(0, s.pt + delta);
    if (before >= DAN.length - 1) return { before, after: before }; // 永世名人は、降段しない
    let d = s.dan;
    while (d < DAN.length - 1 && s.pt >= DAN[d + 1][1]) d++;
    while (d >= DEMOTE_FROM && s.pt < DAN[d][1] - DEMOTE_GAP) d--;
    s.dan = d; if (d > (s.maxdan || 0)) s.maxdan = d;
    return { before, after: d };
  };
  const msgOf = (r) => (r.after > r.before ? `🎉 ${DAN[r.after][0]}に昇段しました!` : r.after < r.before ? `${DAN[r.after][0]}に降段しました。` : '');

  MJ.DAN_NAME = (i) => DAN[i] ? DAN[i][0] : '';
  const R = (MJ.Rank = {
    DAN, _imgs: {},
    get() {
      const raw = load(RK, {}), s = Object.assign(base(), raw);
      if (raw.v !== 2) { s.dan = Math.max(s.games ? 1 : 0, idxOf(s.pt)); s.v = 2; save(RK, s); } // 前の版のデータ: 初段以上は、そのまま引き継ぐ
      if (s.dan > DAN.length - 1) s.dan = DAN.length - 1; if (s.maxdan > DAN.length - 1) s.maxdan = DAN.length - 1; // 十段をなくした(10段め=名人)ので、前の記録が 名人の外に出ないように
      if (!(s.maxdan >= s.dan)) s.maxdan = s.dan;
      return s;
    },
    info() {
      const s = R.get(), i = s.dan, nxt = DAN[i + 1];
      return { s, i, base: DAN[i][1], next_pt: nxt ? nxt[1] : 0, name: DAN[i][0], next: nxt ? nxt[0] : null, left: nxt ? Math.max(0, nxt[1] - s.pt) : 0, prog: nxt ? Math.max(0, Math.min(1, (s.pt - DAN[i][1]) / (nxt[1] - DAN[i][1]))) : 1 };
    },
    label() { return R.info().name; },
    /* 対局が最後まで終わったとき。東風戦・東南戦だけを数える。結果(もらった点・段位の変わり方)を返す。数えない対局は null */
    record(game, final) {
      if (!game || game.length === 'single' || (game.handCount || 0) < 4) return null; // 一局だけの対局と、4局に満たないうちに終わった対局(飛びなど)は、記録しない
      const me = final.results.find((r) => r.p.seat === 0);
      if (!me) return null;
      const s = R.get(), tbl = PTS[game.length === 'east' ? 'east' : 'south']; let delta = tbl[me.rank - 1] || 0, avg = null, mult = 1;
      if (MJ.RankScale === true) {
        const lv = final.results.filter((r) => r.p.seat !== 0 && r.p.char).map((r) => r.p.char.level || 1); avg = lv.length ? lv.reduce((a, b) => a + b, 0) / lv.length : null;
        if (avg != null) { const d = avg - (1 + 0.8 * s.dan); mult = me.rank <= 2 ? clampN(1 + 0.15 * d, 0.5, 2) : me.rank === 4 ? clampN(1 - 0.15 * d, 0.5, 2) : 1; delta = Math.round(delta * mult); }
      }
      s.hist = (s.hist || []).concat({ p: delta, r: me.rank, o: avg == null ? null : Math.round(avg * 10) / 10 }).slice(-30);
      const ch = addPt(s, delta); s.games++; s.ranks[me.rank - 1]++;
      if (game.tenka && me.rank === 1 && ch.after === DAN.length - 2) { s.dan = DAN.length - 1; s.maxdan = DAN.length - 1; ch.after = DAN.length - 1; } // 天下分け目(名人+徳川家康+水戸黄門)で 1位 → 永世名人
      final.results.forEach((r) => {
        if (r.p.seat === 0 || !r.p.char || !r.p.char.id) return;
        const o = (s.opp[r.p.char.id] = s.opp[r.p.char.id] || { n: 0, w: 0 });
        o.n++; if (me.rank < r.rank) o.w++;
      });
      save(RK, s);
      const f = R.info();
      return { delta, avg, mult, pt: s.pt, name: f.name, next: f.next, left: f.left, from: ch.before, to: ch.after, promoted: ch.after > ch.before, demoted: ch.after < ch.before, msg: msgOf(ch), dan: ch.after > ch.before ? DAN[ch.after][0] : null };
    },
    /* 相手の解放: これまでに到達した最高の段位までの人が使える(降段しても、出てきた人は使えたまま) */
    unlocked(id) { return MJ.unlockDan(id) <= R.get().maxdan; },
    unlockedIds() { const m = R.get().maxdan; return MJ.CHARS.filter((c) => MJ.unlockDan(c.id) <= m).map((c) => c.id); },
    /* 段位が from→to に上がったとき、新しく使える人 */
    newIds(from, to) { const out = []; for (let i = from + 1; i <= to; i++) (MJ.UNLOCK[i] || []).forEach((id) => out.push(id)); return out; },
    /* 登場の画面: 暗くなり、黒いシルエットがせり上がり、明るくなって「ドン!」NEW! → 名札 → ひとこと。1人ずつ */
    reveal(ids, done) {
      const list = ids.map((id) => MJ.CHARS.find((c) => c.id === id)).filter(Boolean);
      let i = 0;
      const layer = () => { let l = $('#ncl'); if (!l) { l = document.createElement('div'); l.id = 'ncl'; document.body.appendChild(l); } return l; };
      const next = () => {
        const l = layer();
        if (i >= list.length) { l.remove(); if (MJ.Pad && MJ.Pad.restoreCur) MJ.Pad.restoreCur(); if (done) done(); return; }
        const c = list[i++], last = i >= list.length, B = MJ.Banter && MJ.Banter.lines[c.id], hello = (B && B.start && B.start[0]) || '';
        const dn = MJ.unlockDan(c.id);
        l.innerHTML = `<div class="nc"><div class="nc-dim"></div><div class="nc-who"><img src="${c.img}" alt=""></div><div class="nc-new">NEW!</div><div class="nc-plate"><small>${MJ.starStr(c.level)}</small>${c.short}</div><div class="nc-say">「${hello}」</div><div class="nc-cap">${dn ? MJ.DAN_NAME(dn) + 'で登場' : ''}　${i}/${list.length}</div><button class="btn pri nc-btn" id="nc-next" type="button">${last ? 'とじる' : 'つぎへ'}</button></div>`;
        setTimeout(() => { try { MJ.SFX.play('slam'); } catch (e) { /* ignore */ } }, 1000);
        const b = $('#nc-next'); if (b) b.addEventListener('click', next);
        if (MJ.Pad && MJ.Pad.on && MJ.Pad.preselect) MJ.Pad.preselect(true);
      };
      if (MJ.Pad && MJ.Pad.saveCur) MJ.Pad.saveCur();
      next();
    },
    revealIfNew(from, to) { const ids = R.newIds(from, to); if (ids.length) setTimeout(() => R.reveal(ids), 300); },
    /* 「+15点 初段まであと85点」の1行(対局終了の画面に出す) */
    gainLine(r) {
      if (!r) return '';
      const sign = r.delta >= 0 ? '+' : '';
      return `<div class="rk-gain"><b>${sign}${r.delta}点</b> ${r.next ? `${r.next}まであと${r.left}点` : 'いちばん上の段位です'}${r.msg ? `<div class="rk-up">${r.msg}</div>` : ''}</div>`;
    },
    /* 麻雀クイズに正解したとき: 10問正解ごとに+2点(1日+6点まで) */
    quizOk() {
      const s = R.get(); s.qc = (s.qc || 0) + 1; let note = null;
      if (s.qc >= 10) {
        s.qc = 0;
        const t = today(); if (s.qday !== t) { s.qday = t; s.qpt = 0; }
        if (s.qpt < 6) { s.qpt += 2; const ch = addPt(s, 2); note = { pt: 2, why: 'クイズ10問正解', ch }; }
      }
      save(RK, s); if (note) R.notify(note);
    },
    /* 点数計算の勉強のチャレンジに正解したとき: 各カテゴリの最初の1回だけ+3点 */
    studyOk(cat) {
      const s = R.get(); if (!cat || s.st[cat]) return;
      s.st[cat] = 1; const ch = addPt(s, 3); save(RK, s);
      R.notify({ pt: 3, why: '点数計算の勉強', ch });
    },
    /* ポイントが入った理由を、短く出す。段位が変わったときは、認定証(昇段)を出す */
    notify(n) {
      const f = R.info();
      if (MJ.UI && MJ.UI.toast) MJ.UI.toast(`+${n.pt}点 ${n.why}${f.next ? `(${f.next}まであと${f.left}点)` : ''}${msgOf(n.ch) ? ' ' + msgOf(n.ch) : ''}`);
      R.syncMenu();
      if (n.ch.after > n.ch.before) setTimeout(() => R.open('cert', { dan: DAN[n.ch.after][0], after: true, done: () => R.revealIfNew(n.ch.before, n.ch.after) }), 1800);
    },
    syncMenu() { const b = $('#hm-rec'); if (b) b.innerHTML = `<span>🏅</span> 成績・<b>${R.label()}</b>`; },

    /* ---------- 画面(パネル) ---------- */
    panel() { let p = $('#rk-panel'); if (!p) { p = document.createElement('div'); p.id = 'rk-panel'; document.body.appendChild(p); } return p; },
    isOpen() { const p = $('#rk-panel'); return !!(p && p.classList.contains('on')); },
    close() { const p = $('#rk-panel'); if (p) { p.classList.remove('on'); p.innerHTML = ''; } clearTimeout(R._t); const cb = R._cb; R._cb = null; if (MJ.Pad && MJ.Pad.restoreCur) MJ.Pad.restoreCur(); if (cb) cb(); },
    open(view, opt = {}) {
      const p = R.panel();
      if (!p.classList.contains('on') && MJ.Pad && MJ.Pad.saveCur) MJ.Pad.saveCur();
      p.classList.add('on'); R._view = view; R._opt = opt; clearTimeout(R._t);
      if (opt.done) R._cb = opt.done;
      const draw = () => { if (R._view !== view) return; if (view === 'rank') R.drawRank(p, opt); else if (view === 'stats') R.drawStats(p, opt); else R.drawCert(p, opt); if (MJ.Pad && MJ.Pad.preselect) MJ.Pad.preselect(true); };
      const art = view === 'rank' ? 'img/rank_bg.webp' : view === 'cert' ? 'img/cert.webp' : null;
      if (!art) draw();
      else { p.innerHTML = ''; const im = R._imgs[art] || (R._imgs[art] = new Image()); if (im.complete && im.naturalWidth) draw(); else { let d = false; const go = () => { if (!d) { d = true; draw(); } }; im.onload = im.onerror = go; im.src = art; setTimeout(go, 3000); } }
    },
    back() { // Bボタン: 開いている画面を1つ戻る
      if (R._view !== 'rank' && R._opt && R._opt.from === 'rank') return R.open('rank', { from: 'menu' });
      R.close();
    },
    /* 「あなたの段位」の画面(ご用意の背景に、文字を重ねる) */
    drawRank(p, opt) {
      const f = R.info();
      // 背景の絵(1404×768)の、空いている枠の位置に合わせて、文字を置く(座標は、絵のピクセル)
      const px = (x, y, fs, html, cls = '') => `<span class="rk-t ${cls}" style="left:${(x / 14.04).toFixed(2)}%;top:${(y / 7.68).toFixed(2)}%;font-size:${(fs / 14.04).toFixed(2)}cqw">${html}</span>`;
      p.innerHTML = `<div class="rk-st rk-bg"><img class="rk-bgi" src="img/rank_bg.webp" alt="">` +
        px(355, 445, f.name.length > 2 ? 52 : 70, f.name) + px(705, 349, 40, f.name, 'dk') +
        (f.next ? px(1068, 358, 28, f.next) + px(1093, 446, f.left >= 1000 ? 40 : 48, String(f.left), 'num') : px(1090, 446, 34, 'いちばん上')) +
        `<div class="rk-bar" style="left:${(531 / 14.04).toFixed(2)}%;top:${(506 / 7.68).toFixed(2)}%;width:${(350 / 14.04).toFixed(2)}%;height:${(46 / 7.68).toFixed(2)}%"><i style="width:${Math.max(f.prog > 0 ? 4 : 0, Math.round(f.prog * 100))}%"></i></div>` + (f.next ? px(706, 529, 26, `${f.s.pt - f.base} / ${f.next_pt - f.base} 点`, 'num') : '') + px(1037, 563, f.name.length > 2 ? 24 : 31, f.name.split('').join('<br>'), 'v') + px(705, 622, 24, `${f.s.games} 戦 打ちました`) +
        `<div class="rk-btns">${opt.auto ? '' : '<button class="rk-b" data-rk="stats" type="button">対戦成績</button>'}${f.i >= 1 && !opt.auto ? '<button class="rk-b" data-rk="cert" type="button">認定証</button>' : ''}<button class="rk-b main" data-rk="close" type="button">${opt.auto ? 'すすむ' : '◀ もどる'}</button></div></div>`;
      p.querySelector('.rk-st').style.setProperty('--w', '1');
      if (opt.auto) R._t = setTimeout(R.close, 3200);
    },
    /* 対戦成績: あなたの顔・順位の回数・対戦相手ごとの勝率 */
    drawStats(p, opt) {
      const f = R.info(), s = f.s, pg = opt.page || 0;
      const total = s.games || 0, avg = total ? ((s.ranks[0] * 1 + s.ranks[1] * 2 + s.ranks[2] * 3 + s.ranks[3] * 4) / total).toFixed(1) : '-';
      const opps = Object.keys(s.opp).map((id) => ({ c: MJ.CHARS.find((x) => x.id === +id), o: s.opp[id] })).filter((x) => x.c).sort((a, b) => b.o.n - a.o.n);
      const pages = Math.max(1, Math.ceil(opps.length / 3));
      const cur = opps.slice(pg * 3, pg * 3 + 3);
      const you = `img/you/${String(MJ.youIndex()).padStart(2, '0')}.webp`;
      const bars = s.ranks.map((n, i) => `<div><span>${i + 1}位</span><b>${n}回</b><div class="b2"><u style="width:${total ? Math.round(n / total * 100) : 0}%"></u></div></div>`).join('');
      const rows = cur.map((x) => `<div class="cpu"><img src="${x.c.face}" alt=""><div class="n">${x.c.short}<small>対戦 ${x.o.n}回</small></div><div class="w">あなたの勝ち ${x.o.w}<small>勝率 ${Math.round(x.o.w / x.o.n * 100)}%</small></div></div>`).join('') || '<div class="cpu none">まだ、対戦の記録がありません</div>';
      p.innerHTML = `<div class="rk-st rk-stats"><div class="rk-ttl">📊 対戦成績</div><div class="me"><img src="${you}" alt=""><div class="dan">${f.name}</div><div class="sm">平均順位 ${avg}位</div></div>
        <div class="rk4">${bars}</div><div class="cpus">${rows}</div>
        <div class="num"><div>対局数<b>${total}</b></div><div>1位の割合<b>${total ? Math.round(s.ranks[0] / total * 100) : 0}%</b></div></div>
        <div class="rk-btns bot"><button class="rk-b" data-rk="prev" type="button"${pg === 0 ? ' disabled' : ''}>◀ まえ</button><button class="rk-b" data-rk="next" type="button"${pg >= pages - 1 ? ' disabled' : ''}>つぎ ▶</button><button class="rk-b main" data-rk="back" type="button">◀ もどる</button><button class="rk-b" data-rk="eval" type="button">🎓 評価</button></div></div>`;
    },
    /* 認定証: 「あなた 殿」と、あなたの絵が入る */
    drawCert(p, opt) {
      if (opt.after) setTimeout(() => { try { MJ.SFX.play('slam'); } catch (e) { /* ignore */ } }, 1100); // ハンコが「バンッ!」と押される音(紙に当たる瞬間)
      const name = opt.dan || R.label();
      const you = `img/you/${String(MJ.youIndex()).padStart(2, '0')}.webp`;
      p.innerHTML = `<div class="rk-st rk-cert"><div class="cert${opt.after ? ' stamping' : ''}"><img src="img/cert.webp" alt="段位認定証"><span class="cd">${name}</span><span class="cn">あなた</span><div class="cph" style="background-image:url(${you})"></div>${opt.after ? '<div class="cring"></div><div class="cstamp"><img src="img/cert_stamp.webp" alt="角印" draggable="false"></div>' : ''}</div><div class="rk-btns bot"><button class="rk-b main" data-rk="${opt.after ? 'close' : 'back'}" type="button">${opt.after ? 'つぎへ' : '◀ もどる'}</button></div></div>`;
    },
    /* 1日の最初の1回だけ、「あなたの段位」を見せる(まだ1戦も打っていないときは出さない) */
    daily() {
      const s = R.get(), t = today();
      if (!s.games || s.day === t) return;
      s.day = t; save(RK, s);
      R.open('rank', { auto: true });
    },

    /* ---------- 自動セーブ ---------- */
    saveOn() { return load(AS, true) !== false; },
    setSaveOn(v) { save(AS, !!v); if (!v) R.clearSave(); },
    clearSave() { try { localStorage.removeItem(SV); } catch (e) { /* ignore */ } },
    hasSave() { const v = R.saveOn() ? load(SV, null) : null; return v && v.cfg && v.players ? v : null; },
    write(game) {
      if (!R.saveOn() || !game || game.fast || game.stopped || !MJ.App || !MJ.App.lastCfg) return;
      save(SV, { cfg: MJ.App.lastCfg, dealer: game.dealer, kyoku: game.kyoku, honba: game.honba, kyotaku: game.kyotaku, roundWind: game.roundWind, handCount: game.handCount, players: game.players.map((p) => p.score), label: game.kyokuLabel(), at: Date.now() });
    },
    apply(game, sv) {
      ['dealer', 'kyoku', 'honba', 'kyotaku', 'roundWind', 'handCount'].forEach((k) => { if (sv[k] != null) game[k] = sv[k]; });
      sv.players.forEach((sc, i) => { if (game.players[i]) game.players[i].score = sc; });
      game.resumed = true;
    },
  });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('#rk-panel .rk-b'); if (!b || b.disabled) return;
    const k = b.dataset.rk, o = R._opt || {};
    if (k === 'close') R.close();
    else if (k === 'stats') R.open('stats', { from: 'rank' });
    else if (k === 'eval') { R.close(); MJ.App.show('drill'); MJ.DrillUI.mode = 'eval'; MJ.DrillUI.evBack = 'rank'; MJ.DrillUI.openEval('game'); }
    else if (k === 'cert') R.open('cert', { from: 'rank' });
    else if (k === 'back') R.back();
    else if (k === 'prev') R.open('stats', { from: o.from, page: Math.max(0, (o.page || 0) - 1) });
    else if (k === 'next') R.open('stats', { from: o.from, page: (o.page || 0) + 1 });
  });
  document.addEventListener('keydown', (e) => {
    if (!R.isOpen() || R._opt.auto !== true) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); R.close(); }
  }, true);
})(typeof window !== 'undefined' ? window : globalThis);
