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
      this.renderHome();
    },

    layout() {
      const el = $('#screen-drill');
      const W = el.clientWidth || window.innerWidth;
      const wide = window.innerWidth >= 700;
      const hw = Math.max(20, Math.min(62, Math.floor((W - 12) / 14.4)));
      const bw = wide ? (W - 24) / 3 : W - 12;
      const sw = Math.max(18, Math.min(34, Math.floor((bw - 22) / 9.2)));
      el.style.setProperty('--hw', hw + 'px');
      el.style.setProperty('--sw', sw + 'px');
      el.style.setProperty('--sh', Math.round(sw * 1.32) + 'px');
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
      $('#drill-home').innerHTML = `<p class="sub">問題は毎回ランダムに作られるので、何度でも違うパターンで練習できます。答え合わせでは、理由と考え方をその場で解説します。</p><div class="modes">${cards}</div><div class="ds-theme"><b>🛡 守備のテーマを選んで練習:</b> ${themes}<span class="cc-s">(選ぶと、そのテーマの問題だけが出ます)</span></div>`;
    },

    start(cat, theme) {
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
      $('#dq-prompt').innerHTML = q.prompt;
      MJ.Gloss.decorate($('#dq-prompt'));
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
      // 手牌
      const melds = q.melds && q.melds.length ? `<div class="melds" style="justify-content:center;margin-bottom:6px">${q.melds.map((m) => MJ.UI.meldHTML(m)).join('')}</div>` : '';
      const tiles = q.hand.map((h, i) => `<div class="tile ok" data-i="${i}">${MJ.tileSVG(h.t)}</div>`).join('');
      const win = q.win ? `<div class="tile drawn hl" style="outline:3px solid var(--acc)">${MJ.tileSVG(q.win.t)}</div>` : '';
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
      const head = good ? '⭕ 正解!' : r.r === 'near' ? '△ おしい!' : '❌ ちがいます';
      const fb = $('#dq-fb');
      fb.className = `dq-fb ${good ? 'good' : r.r === 'near' ? 'warn' : 'bad'}`;
      fb.innerHTML = `<div class="dq-fh">${head}</div><div id="dq-exp">${r.html}</div><div class="dq-fa"><button class="btn sm rd" data-read="drill">🔊 読み上げ</button><button class="btn pri" id="dq-next">次の問題 ▶</button></div>`;
      MJ.Gloss.decorate(fb);
      $('#dq-actions').classList.add('hidden');
      fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
      $('#dq-fb').addEventListener('click', (e) => { if (e.target.closest('#dq-next')) this.next(); });
      $('#drill-back').addEventListener('click', () => { if (this.cat && !$('#drill-quiz').classList.contains('hidden')) { this.cat = null; this.renderHome(); } else MJ.App.show('menu'); });
      window.addEventListener('resize', () => { if (!$('#screen-drill').classList.contains('hidden')) this.layout(); });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
