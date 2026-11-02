/* 雀士列伝: これまでに対戦した相手を、顔と紹介つきで見られる画面。まだ出会っていない相手は、黒いシルエットと「？？？？」 */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const KEY = 'mj_met';
  const load = () => { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const PER = 16;
  const R = (MJ.Roster = {
    page: 0, sel: 1,
    met(id) { return load().includes(id); },
    /* 対戦した相手を、おぼえる(対局が始まるとき) */
    mark(ids) { const a = load(); let ch = false; (ids || []).forEach((i) => { if (i > 0 && !a.includes(i)) { a.push(i); ch = true; } }); if (ch) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* ignore */ } } },
    count() { return load().length; },
    detail(id) {
      const c = MJ.CHARS.find((x) => x.id === id); if (!c) return '';
      const met = R.met(id), dan = MJ.DAN_NAME ? MJ.DAN_NAME(MJ.unlockDan(id)) : '';
      const img = `<img class="rs-big${met ? '' : ' sil'}" src="${c.face}" alt="" draggable="false">`; // 顔だけ(全身の絵は、使わない)
      if (!met) return `<div class="rs-d">${img}<div class="rs-t"><b class="rs-n">？？？？</b><p>まだ、出会っていません。</p><p>${dan === '無段' ? '対戦すると、出会えます。' : `${dan}になると、登場します。`}</p></div></div>`;
      return `<div class="rs-d">${img}<div class="rs-t"><b class="rs-n">${c.name}</b><div class="rs-m">強さ ${MJ.starStr(c.level)}(${MJ.LEVEL_JP[c.level]}) ／ 打ち方 ${MJ.STYLE_JP[c.style] || ''} ／ ${dan}から登場</div><p>${c.desc}</p><p class="rs-q">「${c.lines.win ? MJ.winWords(c.lines.win, false) : ''}」</p></div></div>`;
    },
    show(id, now) {
      R.sel = id;
      document.querySelectorAll('.rs-c').forEach((b) => b.classList.toggle('cur', +b.dataset.rsid === id));
      // 説明の描き直しは、カーソルが止まってから(方向キーを続けて押しても、重くならない)
      clearTimeout(R._t);
      const go = () => { const d = document.querySelector('#rs-detail'); if (d && R.sel === id) d.innerHTML = R.detail(id); };
      if (now) go(); else R._t = setTimeout(go, 70);
    },
    open(onClose) {
      const draw = () => {
        const from = R.page * PER, list = MJ.CHARS.slice(from, from + PER), pages = Math.ceil(MJ.CHARS.length / PER);
        const cards = list.map((c) => { const met = R.met(c.id); return `<button class="rs-c" type="button" data-rsid="${c.id}"><img class="${met ? '' : 'sil'}" src="${c.face}" alt="" draggable="false"><span>${met ? c.short : '？？？？'}</span></button>`; }).join('');
        const html = `<div class="rs"><div class="rs-h"><b>雀士列伝</b><span>${R.count()} / ${MJ.CHARS.length}人と出会いました</span></div><div class="rs-grid">${cards}</div><div id="rs-detail"></div><div class="rs-f"><button class="btn" id="rs-prev" type="button"${R.page === 0 ? ' disabled' : ''}>◀ 前の人たち</button><button class="btn" id="rs-next" type="button"${R.page >= pages - 1 ? ' disabled' : ''}>次の人たち ▶</button><button class="btn pri" id="rs-close" type="button">もどる</button></div></div>`;
        MJ.UI.overlay(html, { plain: true });
        const o = document.querySelector('#overlay');
        o.querySelectorAll('.rs-c').forEach((b) => { b.addEventListener('mouseenter', () => R.show(+b.dataset.rsid)); b.addEventListener('click', () => R.show(+b.dataset.rsid)); });
        o.querySelector('#rs-prev').addEventListener('click', () => { if (R.page > 0) { R.page--; R.sel = MJ.CHARS[R.page * PER].id; draw(); } });
        o.querySelector('#rs-next').addEventListener('click', () => { if (R.page < pages - 1) { R.page++; R.sel = MJ.CHARS[R.page * PER].id; draw(); } });
        o.querySelector('#rs-close').addEventListener('click', () => { if (onClose) onClose(); else MJ.UI.closeOverlay(); });
        R.show(R.sel >= from + 1 && R.sel <= from + PER ? R.sel : MJ.CHARS[from].id, true);
        if (MJ.Pad && MJ.Pad.preselect) setTimeout(() => MJ.Pad.preselect(true), 0);
      };
      R.page = 0; R.sel = MJ.CHARS[0].id; draw();
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
