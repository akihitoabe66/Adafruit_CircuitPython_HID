/* 「この役で学ぶ」: 上がった手を題材に、役・飜・符・点数を4ページで解説する。「記録する」で、勉強の画面から読み返せる(最新30件) */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const KEY = 'mj_yakulog', MAX = 30;
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const tiles = (ts, cls = 't-m') => ts.map((t) => MJ.tileHTML(t, cls)).join('');
  const SPECIAL = ['ドラ', '赤ドラ', '裏ドラ'];

  const L = (MJ.Learn = {
    list: load,
    /* 上がり(game.js の win)から、記録用のデータを作る */
    build(game, w) {
      const r = w.res, v = w.view || { concealed: [], melds: [] };
      return {
        id: Date.now(), at: new Date().toISOString().slice(0, 10),
        who: w.winner.name, tsumo: !!w.tsumo, dealer: w.winner.seat === game.dealer, loser: w.loser ? w.loser.name : '',
        kyoku: game.kyokuLabel(), concealed: v.concealed.map((h) => h.t), melds: (v.melds || []).map((m) => ({ k: m.kind, t: m.t, ts: (m.tiles || []).map((h) => h.t) })),
        win: w.winTile ? w.winTile.t : null, dora: game.doraInd.map((d) => d.t),
        yaku: r.yaku.map((y) => ({ n: y.n, h: y.h })), han: r.han, fu: r.fu, fuD: r.fuDetails || [], basic: r.basic, limit: r.limit || '', ym: !!r.yakuman,
        pay: w.pay ? { ron: w.pay.ron, each: w.pay.each, fo: w.pay.fromOther, fd: w.pay.fromDealer } : {},
        pts: w.tsumo ? (w.winner.seat === game.dealer ? `${fmt(w.pay.each)}点オール` : `${fmt(w.pay.fromOther)}・${fmt(w.pay.fromDealer)}点`) : `${fmt(w.pay.ron)}点`,
      };
    },
    isSaved(rec) { return load().some((x) => x.id === rec.id); },
    record(rec) { const a = load().filter((x) => x.id !== rec.id); a.unshift(rec); save(a.slice(0, MAX)); },
    remove(id) { save(load().filter((x) => x.id !== id)); },

    pagesOf(rec) {
      const names = rec.yaku.filter((y) => !SPECIAL.includes(y.n));
      const gl = (n) => { const e = (MJ.Gloss && MJ.Gloss.list || []).find((x) => x.n === n || (x.a || []).includes(n) || n.startsWith(x.n)); return e ? e.d : ''; };
      const hand = `<div class="ln-hand">${tiles(rec.concealed)}${rec.melds.map((m) => `<span class="gap"></span>${tiles(m.ts)}`).join('')}${rec.win != null ? `<span class="gap"></span>${MJ.tileHTML(rec.win, 't-m hl')}` : ''}</div>`;
      const p1 = `<h3>① どんな役?</h3>${hand}${names.length ? names.map((y) => `<div class="ln-card"><b>${y.n}</b>(${rec.ym ? '役満' : y.h + '飜'})<br>${gl(y.n) || 'この手に付いた役です。'}</div>`).join('') : '<div class="ln-card">役が付いていません。</div>'}`;
      const dr = rec.yaku.filter((y) => SPECIAL.includes(y.n));
      const p2 = `<h3>② 飜(はん)を数える</h3><table class="ln-tbl">${rec.yaku.map((y) => `<tr><td>${y.n}</td><td>${rec.ym ? '役満' : y.h + '飜'}</td></tr>`).join('')}<tr class="ln-sum"><td>合計</td><td>${rec.ym ? '役満' : rec.han + '飜'}${rec.limit ? `(${rec.limit})` : ''}</td></tr></table><p class="ln-note">飜が多いほど、点数が大きくなります。${dr.length ? 'ドラは、役ではありませんが、飜に数えます。' : ''}1飜増えるごとに、点数はおよそ2倍です。</p>`;
      const p3 = rec.ym || !rec.fuD.length ? `<h3>③ 符(ふ)を数える</h3><div class="ln-card">${rec.ym ? '役満は、符を数えません。点数が決まっています。' : '符の内訳は、記録されていません。'}</div>` : `<h3>③ 符(ふ)を数える</h3><table class="ln-tbl">${rec.fuD.map((f) => `<tr><td>${f[0]}</td><td>${f[1]}符</td></tr>`).join('')}<tr class="ln-sum"><td>合計 → 10符単位に切り上げ</td><td>${rec.fu}符</td></tr></table><p class="ln-note">符は、手の形や待ちで決まります。同じ飜でも、符が高いと点数が上がります。</p>`;
      const dealer = rec.dealer;
      const mult = dealer ? 6 : 4;
      const calc = rec.ym ? `役満の基本点は 8000点 です。` : (rec.han >= 5 ? `満貫以上は、符に関係なく、基本点が決まっています(${fmt(rec.basic)}点)。` : `基本点 = 符 × 2<sup>(飜+2)</sup> = ${rec.fu} × ${Math.pow(2, rec.han + 2)} = ${fmt(rec.fu * Math.pow(2, rec.han + 2))} → ${fmt(rec.basic)}点(2000点まで)`);
      const pay = rec.tsumo ? (dealer ? `親のツモ: 子3人が、基本点×2 ずつ払います(${rec.pts})。` : `子のツモ: 親が基本点×2、子が基本点×1 を払います(${rec.pts})。`) : `${dealer ? '親' : '子'}のロン: 基本点×${mult} = ${fmt(rec.basic * mult)} → 100点単位に切り上げ → ${rec.pts}`;
      const p4 = `<h3>④ 点数のきまり</h3><div class="ln-card">${calc}</div><div class="ln-card">${pay}</div><p class="ln-note">親は、子の1.5倍もらえます。ロンは、放銃した1人が全額を払います。ツモは、みんなで分けて払います。</p>`;
      return [p1, p2, p3, p4];
    },
    /* 学ぶ画面を開く。fromResult=true なら、結果画面の上に重ねて出し、閉じたら結果に戻る */
    open(rec, fromResult) {
      const o = document.querySelector('#overlay');
      const pages = L.pagesOf(rec);
      let cur = 0;
      const html = `<div class="modal paged ln"><div class="pm-top"><span class="pm-title">この役で学ぶ</span><span class="pm-dots">${pages.map(() => '<i></i>').join('')}</span></div><div class="ln-who">${rec.kyoku} ${rec.who}の${rec.tsumo ? 'ツモ' : 'ロン'}(${rec.pts})</div><div class="pm-body">${pages.map((p) => `<div class="pm-page">${p}</div>`).join('')}</div><div class="pm-foot"><button class="btn" id="ln-close">← もどる</button><button class="btn" id="ln-prev">◀ まえ</button><button class="btn pri" id="ln-next">つぎ ▶</button><button class="btn rec" id="ln-rec"></button></div></div>`;
      let first = null, wrap;
      if (fromResult) {
        first = o.querySelector('.ovi'); if (first) first.style.display = 'none';
        wrap = document.createElement('div'); wrap.className = 'ovi'; wrap.innerHTML = html; o.appendChild(wrap);
        const S = MJ.UI.S2 || 1; wrap.style.width = o.clientWidth / S + 'px'; wrap.style.height = o.clientHeight / S + 'px'; wrap.style.transform = `scale(${S})`;
      } else { MJ.UI.overlay(html, { plain: true, raw: true }); wrap = o.querySelector('.ovi'); }
      const q = (s) => wrap.querySelector(s);
      const els = [...wrap.querySelectorAll('.pm-page')];
      const dots = [...wrap.querySelectorAll('.pm-dots i')];
      els.forEach((e) => MJ.Gloss && MJ.Gloss.decorate(e));
      if (MJ.Ruby) els.forEach((e) => MJ.Ruby.apply(e));
      const recBtn = q('#ln-rec');
      const syncRec = () => { recBtn.textContent = L.isSaved(rec) ? '🔖 記録ずみ(はずす)' : '🔖 この役を記録する'; };
      const show = (i) => { cur = Math.max(0, Math.min(pages.length - 1, i)); els.forEach((e, k) => e.classList.toggle('on', k === cur)); dots.forEach((d, k) => d.classList.toggle('on', k === cur)); q('#ln-prev').classList.toggle('off', cur === 0); q('#ln-next').classList.toggle('off', cur === pages.length - 1); q('#ln-prev').disabled = cur === 0; q('#ln-next').disabled = cur === pages.length - 1; syncRec(); if (MJ.Pad && done0) MJ.Pad.preselect(true); };
      let done0 = false; show(0); done0 = true;
      q('#ln-prev').addEventListener('click', () => show(cur - 1));
      q('#ln-next').addEventListener('click', () => show(cur + 1));
      recBtn.addEventListener('click', () => { if (L.isSaved(rec)) L.remove(rec.id); else L.record(rec); syncRec(); });
      q('#ln-close').addEventListener('click', () => {
        if (fromResult) { wrap.remove(); if (first) first.style.display = ''; if (MJ.Pad) MJ.Pad.preselect(true); } else { MJ.UI.closeOverlay(); if (MJ.Study && MJ.Study.render) MJ.Study.render(); }
      });
      const body = q('.pm-body');
      const onKey = (e) => {
        if (!document.body.contains(body)) { document.removeEventListener('keydown', onKey); return; }
        if (e.key === 'PageDown') body.scrollBy(0, 120); else if (e.key === 'PageUp') body.scrollBy(0, -120);
      };
      document.addEventListener('keydown', onKey);
      if (MJ.Pad) MJ.Pad.preselect(true);
    },
    /* 勉強の画面: 記録した役の一覧 */
    openLog() {
      const a = load();
      const rows = a.length ? a.map((r) => `<button class="btn ln-item" data-id="${r.id}"><b>${r.yaku.filter((y) => !SPECIAL.includes(y.n)).map((y) => y.n).join('・') || '役なし'}</b><span>${r.pts} ・ ${r.who} ・ ${r.at}</span></button>`).join('') : '<p class="ln-note">まだ記録がありません。上がったあとの結果画面で「この役で学ぶ」→「この役を記録する」を押すと、ここに残ります。</p>';
      MJ.UI.overlay(`<div class="modal ln"><h2>🔖 記録した役</h2><div class="ln-list">${rows}</div><div class="res-foot"><button class="btn big" id="ln-x">もどる</button></div></div>`, { plain: true });
      const o = document.querySelector('#overlay');
      if (MJ.Ruby) MJ.Ruby.apply(o);
      o.querySelector('#ln-x').addEventListener('click', () => MJ.UI.closeOverlay());
      o.querySelectorAll('.ln-item').forEach((b) => b.addEventListener('click', () => { const r = load().find((x) => String(x.id) === b.dataset.id); if (r) L.open(r, false); }));
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
