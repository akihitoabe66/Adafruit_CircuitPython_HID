/* 段位・対戦成績・認定証と、自動セーブ(つづき)。
   段位: 初段から始まり、十段の先が名人。東風戦・東南戦を最後まで打った対局で点が入る(1位+30 / 2位+15 / 3位+5 / 4位+0)。下がらない。
   セーブ: 局のはじめごとに自動で保存し、「つづきから」で、その局のはじめから再開する(牌は配り直す)。 */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const $ = (s) => document.querySelector(s);
  const RK = 'mj_rank', SV = 'mj_save', AS = 'mj_autosave';
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  /* 段位の表: [名前, 必要な累計点] */
  const DAN = [['初段', 0], ['二段', 200], ['三段', 400], ['四段', 600], ['五段', 800], ['六段', 1000], ['七段', 1200], ['八段', 1400], ['九段', 1600], ['十段', 1800], ['名人', 2200]];
  const PTS = [30, 15, 5, 0];
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const base = () => ({ pt: 0, games: 0, ranks: [0, 0, 0, 0], opp: {}, day: '' });
  const idxOf = (pt) => { let k = 0; DAN.forEach((d, i) => { if (pt >= d[1]) k = i; }); return k; };

  const R = (MJ.Rank = {
    DAN, _imgs: {},
    get() { return Object.assign(base(), load(RK, {})); },
    info() {
      const s = R.get(), i = idxOf(s.pt), nxt = DAN[i + 1];
      return { s, i, base: DAN[i][1], next_pt: nxt ? nxt[1] : 0, name: DAN[i][0], next: nxt ? nxt[0] : null, left: nxt ? nxt[1] - s.pt : 0, prog: nxt ? (s.pt - DAN[i][1]) / (nxt[1] - DAN[i][1]) : 1 };
    },
    label() { return R.info().name; },
    /* 対局が最後まで終わったとき。東風戦・東南戦だけを数える。段位が上がった(または最初の認定の)ときは、その段位名を返す */
    record(game, final) {
      if (!game || game.length === 'single') return null;
      const me = final.results.find((r) => r.p.seat === 0);
      if (!me) return null;
      const s = R.get(), before = idxOf(s.pt);
      s.pt += PTS[me.rank - 1] || 0; s.games++; s.ranks[me.rank - 1]++;
      final.results.forEach((r) => {
        if (r.p.seat === 0 || !r.p.char || !r.p.char.id) return;
        const o = (s.opp[r.p.char.id] = s.opp[r.p.char.id] || { n: 0, w: 0 });
        o.n++; if (me.rank < r.rank) o.w++;
      });
      save(RK, s);
      const after = idxOf(s.pt);
      return s.games === 1 || after > before ? DAN[after][0] : null;
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
        `<div class="rk-btns">${opt.auto ? '' : '<button class="rk-b" data-rk="stats" type="button">対戦成績</button>'}${f.s.games && !opt.auto ? '<button class="rk-b" data-rk="cert" type="button">認定証</button>' : ''}<button class="rk-b main" data-rk="close" type="button">${opt.auto ? 'すすむ' : '◀ もどる'}</button></div></div>`;
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
      const name = opt.dan || R.label();
      const you = `img/you/${String(MJ.youIndex()).padStart(2, '0')}.webp`;
      p.innerHTML = `<div class="rk-st rk-cert"><div class="cert"><img src="img/cert.webp" alt="段位認定証"><span class="cd">${name}</span><span class="cn">あなた</span><div class="cph" style="background-image:url(${you})"></div></div><div class="rk-btns bot"><button class="rk-b main" data-rk="${opt.after ? 'close' : 'back'}" type="button">${opt.after ? 'つぎへ' : '◀ もどる'}</button></div></div>`;
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
    else if (k === 'eval') { R.close(); MJ.App.show('drill'); MJ.DrillUI.mode = 'eval'; MJ.DrillUI.openEval('game'); }
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
