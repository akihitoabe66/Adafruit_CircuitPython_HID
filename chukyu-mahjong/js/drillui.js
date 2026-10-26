/* 練習問題の画面 */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const $ = (s) => document.querySelector(s);
  const load = () => { try { return JSON.parse(localStorage.getItem('mj_drill') || '{}'); } catch (e) { return {}; } };
  const save = (v) => { try { localStorage.setItem('mj_drill', JSON.stringify(v)); } catch (e) { /* ignore */ } };

  const D = (MJ.DrillUI = {
    cat: null, theme: null, q: null, picked: -1, done: false, ses: { n: 0, ok: 0, streak: 0, best: 0 },

    open() {
      MJ.App.show('drill');
      this.cat = null;
      this.layout();
      this.renderHome();
    },

    layout() {
      const el = $('#screen-drill');
      if (!el || el.classList.contains('hidden')) return;
      const st = MJ.UI.stageFor(el);
      const S = Math.min(st.h / 428, st.w / 832);
      $('#dr').style.transform = `translate(${Math.round((st.w - 832 * S) / 2)}px, ${Math.round((st.h - 428 * S) / 2)}px) scale(${S})`;
      el.style.setProperty('--hw', '44px');
      el.style.setProperty('--sw', '24px');
      el.style.setProperty('--sh', '32px');
    },
    /* 枠からはみ出す文は、少しずつ小さくして収める(下限12px) */
    fitBox(el, max, min) {
      if (!el) return;
      let px = max;
      el.style.fontSize = px + 'px';
      while (el.scrollHeight > el.clientHeight + 1 && px > min) { px -= 0.5; el.style.fontSize = px + 'px'; }
    },

    renderHome() {
      $('#drill-title').textContent = '📝 練習問題';
      $('#drill-quiz').classList.add('hidden');
      $('#drill-home').classList.remove('hidden');
      $('#drill-score').textContent = '';
      const st = load();
      const cards = MJ.DRILLS.map((d) => {
        const s = st[d.id] || { n: 0, ok: 0 };
        const rate = s.n ? Math.round((s.ok / s.n) * 100) : null;
        return `<button class="mode-card dcat" data-cat="${d.id}"><div class="mi">${d.icon}</div><h3>${d.name}</h3><p>${d.desc}</p><span class="badge">${d.level}</span>${s.n ? `<span class="badge" style="margin-left:6px">${s.ok}/${s.n}問 正解(${rate}%)</span>` : ''}</button>`;
      }).join('');
      const themes = Object.entries(MJ.DRILL_THEMES).map(([k, v]) => `<button class="btn sm dtheme" data-theme="${k}">${v.name}</button>`).join('');
      const short = (t) => t.split('。')[0] + '。';
      const cards2 = MJ.DRILLS.map((x) => {
        const s = st[x.id] || { n: 0, ok: 0 };
        const rate = s.n ? Math.round((s.ok / s.n) * 100) : null;
        return `<button class="mode-card dcat" data-cat="${x.id}"><div class="mi">${x.icon}</div><h3>${x.name}</h3><p>${short(x.desc)}</p><span class="badge">${x.level}${s.n ? ` ・ ${s.ok}/${s.n}問(${rate}%)` : ''}</span></button>`;
      }).join('');
      $('#drill-home').innerHTML = `<div class="dh-grid">${cards2}</div><div class="ds-theme"><b>🛡 守備のテーマ別:</b> ${themes}</div>`;
      this.layout();
      if (MJ.Pad) MJ.Pad.refocus();
    },

    /* 毎日スタンプの1問: 「何を切る?」を1問だけ出す。答えるとスタンプが押される */
    openDaily() {
      MJ.App.show('drill');
      this.layout();
      this.start('eff', null, true);
    },

    start(cat, theme, daily) {
      this.daily = !!daily;
      this.cat = MJ.DRILLS.find((d) => d.id === cat);
      this.theme = theme || null;
      this.ses = { n: 0, ok: 0, streak: 0, best: 0 };
      $('#drill-home').classList.add('hidden');
      $('#drill-quiz').classList.remove('hidden');
      this.next();
    },

    next() {
      $('#dq-sit').innerHTML = '<span class="cc-s">問題を作っています…</span>';
      $('#dq-board').innerHTML = $('#dq-prompt').innerHTML = $('#dq-hand').innerHTML = $('#dq-opts').innerHTML = '';
      $('#dq-fb').classList.add('hidden');
      $('#dq-actions').classList.add('hidden');
      setTimeout(() => {
        this.layout();
        let q = null;
        for (let i = 0; i < 5 && !q; i++) q = this.theme && this.cat.id === 'def' ? MJ.Drill.genDef(this.theme) : this.cat.gen();
        if (!q) { $('#dq-sit').textContent = '問題を作れませんでした。もう一度お試しください。'; return; }
        this.q = q;
        this.picked = -1;
        this.done = false;
        this.render();
      }, 20);
    },

    scoreText() {
      const s = this.ses;
      return `今回 ${s.ok}/${s.n}問 正解${s.streak >= 2 ? ` ・ 🔥${s.streak}連続` : ''}`;
    },

    render() {
      const q = this.q;
      $('#drill-title').textContent = `${this.cat.icon} ${q.title}`;
      $('#drill-score').textContent = this.scoreText();
      $('#dq-sit').innerHTML = q.sit;
      MJ.Gloss.decorate($('#dq-sit'));
      $('#dq-prompt').innerHTML = q.prompt;
      MJ.Gloss.decorate($('#dq-prompt'));
      this.fitBox($('#dq-sit'), 13, 11); this.fitBox($('#dq-prompt'), 15, 12);
      // 場 (CPUの河)
      let board = '';
      if (q.g && (q.cat === 'def' || q.cat === 'eff' || q.cat === 'push')) {
        board = '<div class="dblocks">' + [1, 2, 3].map((s) => {
          const p = q.g.players[s];
          const river = p.discards.map((d) => MJ.tileHTML(d.tile.t, d.riichi ? 'rch' : '', '', d.tile.red)).join('');
          return `<div class="blk${p.riichi ? ' rch-on' : ''}"><div class="strip"><img class="face" src="${p.char.img || ''}" alt=""><div class="meta"><div class="nm">${p.name}</div><div class="chips">${p.riichi ? '<span class="chip r">リーチ</span>' : ''}<span class="chip">${['東', '南', '西', '北'][q.g.seatWindOf(p)]}家</span></div></div></div><div class="river">${river}</div></div>`;
        }).join('') + '</div>';
      }
      $('#dq-board').innerHTML = board;
      $('#drill-quiz').classList.toggle('has-board', !!board);
      // 手牌
      const melds = q.melds && q.melds.length ? `<div class="melds" style="justify-content:center;margin-bottom:6px">${q.melds.map((m) => MJ.UI.meldHTML(m)).join('')}</div>` : '';
      const tiles = q.hand.map((h, i) => `<div class="tile ok" data-i="${i}">${MJ.tileSVG(h.t, h.red)}</div>`).join('');
      const win = q.win ? `<div class="tile drawn hl" style="outline:3px solid var(--acc)">${MJ.tileSVG(q.win.t, q.win.red)}</div>` : '';
      $('#dq-hand').innerHTML = `${melds}<div class="hand">${tiles.replace(/ ok"/g, q.kind === 'tile' ? ' ok"' : '"')}${win}</div>`;
      // 選択肢
      if (q.kind === 'choice') {
        $('#dq-opts').innerHTML = q.options.map((o) => `<button class="btn dq-opt" data-id="${o.id}">${o.html}</button>`).join('');
        $('#dq-actions').classList.add('hidden');
      } else {
        $('#dq-opts').innerHTML = '';
        const b = $('#dq-ok');
        b.disabled = true;
        b.textContent = 'この牌を切る';
        $('#dq-actions').classList.remove('hidden');
      }
      if (MJ.Pad) { MJ.Pad.cur = null; MJ.Pad.desc = null; MJ.Pad.refocus(); }
    },

    pickTile(i) {
      if (this.done || this.q.kind !== 'tile') return;
      if (this.picked === i) return this.answerTile();
      this.picked = i;
      MJ.SFX.play('select');
      document.querySelectorAll('#dq-hand .hand .tile').forEach((t, k) => t.classList.toggle('picked', k === i));
      const b = $('#dq-ok');
      b.disabled = false;
      b.textContent = `${MJ.tileName(this.q.hand[i].t)}を切る`;
    },

    answerTile() {
      if (this.done || this.picked < 0) return;
      const tile = this.q.hand[this.picked];
      const r = this.q.grade(tile);
      // 解説で全ての牌の目安を表示
      const marks = [];
      this.q.an.evals.forEach((e) => {
        const txt = this.q.cat === 'def' ? e.danger.tag.replace('(無スジ)', '').replace('ワンチャンス', '1チャンス') : (e.sh === this.q.an.minSh ? `有効${e.ukeire.n}` : `×${e.sh}`);
        const cls = this.q.cat === 'def' ? e.danger.cls : (e.sh === this.q.an.minSh ? (e === this.q.best ? 'safe' : 'ok') : 'danger');
        marks.push([e.t, txt, cls]);
      });
      document.querySelectorAll('#dq-hand .hand .tile').forEach((el, k) => {
        const m = marks.find((x) => x[0] === this.q.hand[k].t);
        if (m && !el.querySelector('.mk')) el.insertAdjacentHTML('beforeend', `<span class="mk ${m[2]}">${m[1]}</span>`);
        el.classList.remove('ok');
      });
      this.finish(r);
    },

    answerChoice(id) {
      if (this.done) return;
      const r = this.q.grade(id);
      document.querySelectorAll('#dq-opts .dq-opt').forEach((b) => { b.disabled = true; b.classList.toggle('chosen', b.dataset.id === id); });
      this.finish(r);
    },

    finish(r) {
      this.done = true;
      const s = this.ses;
      s.n++;
      const good = r.r === 'ok';
      if (good) { s.ok++; s.streak++; s.best = Math.max(s.best, s.streak); } else s.streak = 0;
      const st = load();
      const c = (st[this.cat.id] = st[this.cat.id] || { n: 0, ok: 0 });
      c.n++; if (good) c.ok++;
      save(st);
      MJ.SFX.play(good ? 'ok' : r.r === 'near' ? 'select' : 'ng');
      $('#drill-score').textContent = this.scoreText();
      let stampMsg = '';
      if (this.daily) {
        this.daily = false;
        if (MJ.Daily.stamp()) stampMsg = `<p class="dy-stamp">📅 <b>今日のスタンプを押しました!</b>(連続 ${MJ.Daily.streak()}日)</p>`;
      }
      const head = good ? '⭕ 正解!' : r.r === 'near' ? '△ おしい!' : '❌ ちがいます';
      this.showFb(head, good ? 'good' : r.r === 'near' ? 'warn' : 'bad', stampMsg + r.html, !!stampMsg);
    },

    /* 答え合わせ: 1画面に収め、長いときはページ送りにする(スクロールしない) */
    showFb(head, cls, html, withGame) {
      const fb = $('#dq-fb');
      fb.className = `dq-fb ${cls}`;
      fb.innerHTML = `<div class="dq-fh"><span>${head}</span><span class="pg"></span><button class="btn sm rd" data-read="drill">🔊 読み上げ</button></div><div class="dq-body" id="dq-exp"></div><div class="dq-fa">${withGame ? '<button class="btn" id="dq-game">🎴 対局へ</button>' : ''}<button class="btn pri" id="dq-next">次の問題 ▶</button></div><button class="pm-arrow l" id="dq-prev" aria-label="前へ">◀</button><button class="pm-arrow r" id="dq-nextp" aria-label="次へ">▶</button>`;
      $('#dq-actions').classList.add('hidden');
      const body = $('#dq-exp');
      // 用語の下線や読み上げボタンを先に付けてから、高さを測る(後から付けると行が高くなってはみ出す)
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      MJ.Gloss.decorate(tmp);
      MJ.UI.addReadFrom(tmp);
      html = tmp.innerHTML;
      let pages = [];
      const build = (px) => {
        body.innerHTML = '';
        body.style.fontSize = px + 'px';
        pages = [];
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        let nodes = [...wrap.children];
        if (!nodes.length) { const p = document.createElement('p'); p.innerHTML = html; nodes = [p]; }
        const newPage = () => { const pg = document.createElement('div'); pg.className = 'dqp'; body.appendChild(pg); pages.forEach((x) => x.classList.remove('on')); pg.classList.add('on'); pages.push(pg); return pg; };
        const fits = (pg) => pg.scrollHeight <= body.clientHeight + 1;
        let cur = newPage();
        let ok = true;
        const add = (n) => {
          cur.appendChild(n);
          if (fits(cur)) return;
          if (cur.children.length > 1) { cur.removeChild(n); cur = newPage(); cur.appendChild(n); if (fits(cur)) return; }
          // 1つの塊が大きすぎる: 箇条書きは項目ごとに分ける
          if (/^(UL|OL)$/.test(n.tagName) && n.children.length > 1) {
            const items = [...n.children]; n.innerHTML = '';
            items.forEach((li) => {
              n.appendChild(li);
              if (!fits(cur) && n.children.length > 1) { n.removeChild(li); cur = newPage(); const n2 = n.cloneNode(false); n2.appendChild(li); cur.appendChild(n2); n = n2; }
            });
            if (fits(cur)) return;
          }
          ok = false;
        };
        nodes.forEach(add);
        return ok;
      };
      const settle = (keep) => {
        let px = 15;
        while (!build(px) && px > 13) px -= 1;
        pages.forEach((x) => { if (x.scrollHeight > body.clientHeight + 1) x.style.overflowY = 'auto'; });
        this.fbPages = pages;
        this.fbShow(keep || 0);
      };
      settle(0);
      // 牌の絵が読み込まれて行の高さが変わっても、はみ出さないように組み直す
      let tmr = null;
      body.addEventListener('load', () => { clearTimeout(tmr); tmr = setTimeout(() => settle(this.fbI), 60); }, true);
    },
    fbShow(i) {
      const pages = this.fbPages || [];
      this.fbI = Math.max(0, Math.min(pages.length - 1, i));
      pages.forEach((p, k) => { p.classList.toggle('on', k === this.fbI); if (k === this.fbI) { p.style.maxHeight = ''; if (p.style.overflowY === 'auto') p.style.maxHeight = $('#dq-exp').clientHeight + 'px'; } });
      const pg = document.querySelector('#dq-fb .pg');
      if (pg) pg.textContent = pages.length > 1 ? `${this.fbI + 1}/${pages.length}` : '';
      const pv = $('#dq-prev'), nx = $('#dq-nextp');
      if (pv) { pv.style.display = pages.length > 1 ? '' : 'none'; pv.classList.toggle('off', this.fbI <= 0); }
      if (nx) { nx.style.display = pages.length > 1 ? '' : 'none'; nx.classList.toggle('off', this.fbI >= pages.length - 1); }
      if (MJ.Pad && MJ.Pad.on) { MJ.Pad.cur = null; MJ.Pad.desc = null; MJ.Pad.refocus(); }
    },

    init() {
      $('#drill-home').addEventListener('click', (e) => {
        const th = e.target.closest('.dtheme');
        if (th) return this.start('def', th.dataset.theme);
        const c = e.target.closest('.dcat');
        if (c) this.start(c.dataset.cat);
      });
      $('#dq-hand').addEventListener('click', (e) => {
        const t = e.target.closest('.hand .tile[data-i]');
        if (t && t.classList.contains('ok')) this.pickTile(+t.dataset.i);
      });
      $('#dq-opts').addEventListener('click', (e) => { const b = e.target.closest('.dq-opt'); if (b && !b.disabled) this.answerChoice(b.dataset.id); });
      $('#dq-ok').addEventListener('click', () => this.answerTile());
      $('#dq-fb').addEventListener('click', (e) => { if (e.target.closest('#dq-game')) MJ.App.openSelect('inter'); else if (e.target.closest('#dq-next')) this.next(); else if (e.target.closest('#dq-nextp')) this.fbShow(this.fbI + 1); else if (e.target.closest('#dq-prev')) this.fbShow(this.fbI - 1); });
      $('#drill-back').addEventListener('click', () => { if (this.cat && !$('#drill-quiz').classList.contains('hidden')) { this.cat = null; this.renderHome(); } else MJ.App.show('menu'); });
      window.addEventListener('resize', () => { if (!$('#screen-drill').classList.contains('hidden')) this.layout(); });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
