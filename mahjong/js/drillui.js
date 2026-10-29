/* 練習問題の画面 */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const $ = (s) => document.querySelector(s);
  const load = () => { try { return JSON.parse(localStorage.getItem('mj_drill') || '{}'); } catch (e) { return {}; } };
  const save = (v) => { try { localStorage.setItem('mj_drill', JSON.stringify(v)); } catch (e) { /* ignore */ } };

  const D = (MJ.DrillUI = {
    cat: null, theme: null, q: null, picked: -1, done: false, ses: { n: 0, ok: 0, streak: 0, best: 0 },

    /* 「麻雀クイズ」: 種類は選べない。苦手な種類を中心に、自動で出題する */
    openAuto() {
      MJ.App.show('drill');
      this.mode = 'auto'; this.backTo = 'menu'; this.lastCatId = null; this.theme = null;
      this.ses = { n: 0, ok: 0, streak: 0, best: 0 };
      this.layout();
      $('#drill-home').classList.add('hidden');
      $('#drill-quiz').classList.remove('hidden');
      this.next();
    },
    /* 勉強の「チャレンジ」: その内容に沿った問題だけ出す */
    openPool(catId, backTo) {
      MJ.App.show('drill');
      this.mode = 'pool'; this.backTo = backTo || 'menu'; this.theme = null;
      this.cat = MJ.DRILLS.find((d) => d.id === catId);
      this.ses = { n: 0, ok: 0, streak: 0, best: 0 };
      this.layout();
      $('#drill-home').classList.add('hidden');
      $('#drill-quiz').classList.remove('hidden');
      this.next();
    },

    open() {
      this.mode = 'free'; this.backTo = 'menu';
      MJ.App.show('drill');
      this.cat = null;
      this.layout();
      this.renderHome();
    },

    /* 直近30問の記録(評価・特訓に使う) */
    logAns(id, ok) { try { const l = JSON.parse(localStorage.getItem('mj_dlog') || '[]'); l.push([id, ok ? 1 : 0]); while (l.length > 30) l.shift(); localStorage.setItem('mj_dlog', JSON.stringify(l)); } catch (e) { /* ignore */ } },
    recent() { try { return JSON.parse(localStorage.getItem('mj_dlog') || '[]'); } catch (e) { return []; } },
    /* 麻雀先生の評価: 直近30問の種類ごとの正解率。3問以上の種類だけ判定し、苦手(正解率の低い順)を2つ選ぶ */
    evaluate() {
      const l = this.recent(), by = {};
      l.forEach(([id, ok]) => { const c = (by[id] = by[id] || { n: 0, ok: 0 }); c.n++; c.ok += ok; });
      const rows = MJ.DRILLS.filter((d) => !/^st_/.test(d.id)).map((d) => { const c = by[d.id] || { n: 0, ok: 0 }; return { d, n: c.n, ok: c.ok, rate: c.n ? c.ok / c.n : null }; });
      const judged = rows.filter((r) => r.n >= 3).sort((a, b) => a.rate - b.rate || b.n - a.n);
      const weak = judged.filter((r) => r.rate < 0.8).slice(0, 2);
      const best = judged.slice().sort((a, b) => b.rate - a.rate)[0];
      const tot = l.length, okn = l.reduce((a, x) => a + x[1], 0);
      return { rows, weak, best, tot, okn, rate: tot ? okn / tot : null };
    },
    shortName(d) { return ({ keep: '数牌と役牌どっち?', def: '安全牌を選ぼう', eff: '何を切る?', call: '鳴く?見送る?', short: '最短の役は?', ana: '穴あきクイズ', score: '点数計算' })[d.id] || d.name.replace(/\(.*\)/, ''); },
    openEval() {
      const e = this.evaluate(); this.eval = e;
      { const qm = $('#dr .ms-quiz'); if (qm) qm.remove(); }
      $('#drill-title').textContent = '🎓 麻雀先生の評価'; $('#drill-score').textContent = '';
      $('#drill-quiz').classList.add('hidden'); $('#drill-home').classList.remove('hidden'); this.view = 'eval'; this.mode = 'eval';
      const pct = (r) => (r == null ? '-' : Math.round(r * 100) + '%');
      const mood = e.tot < 5 ? 'greet' : e.rate >= 0.8 ? 'ok' : e.rate >= 0.5 ? 'advice' : 'cheer';
      const lead = e.tot < 5 ? 'まだ問題が少ないので、判定できません。まずは、いろいろ解いてみましょう。' : `直近${e.tot}問で、${e.okn}問 正解(${pct(e.rate)})。${e.best ? `${this.shortName(e.best.d)}が得意です。` : ''}${e.weak.length ? `${e.weak.map((w) => w.d.name.replace(/\(.*\)/, '')).join('と')}を、特訓しましょう。` : '苦手は、見当たりません。すばらしい!'}`;
      const bars = e.rows.map((r) => `<div class="ev-r${e.weak.some((w) => w.d.id === r.d.id) ? ' weak' : ''}"><span class="ev-n">${r.d.icon} ${this.shortName(r.d)}</span><span class="ev-b"><u style="width:${r.n >= 3 ? Math.round(r.rate * 100) : 0}%"></u></span><span class="ev-p">${r.n >= 3 ? pct(r.rate) : '—'}</span></div>`).join('');
      $('#drill-home').innerHTML = `<div class="ev"><div class="ev-top">${MJ.UI.teacherImg(mood)}<div class="ev-say">${lead}</div></div><div class="ev-bars">${bars}</div><div class="ev-act">${e.weak.length ? `<button class="btn pri big" id="ev-train" type="button" data-ev="train">🔥 苦手の特訓(10問)</button>` : ''}</div></div>`;
      this.layout();
    },

    /* 苦手の特訓: いちばん苦手な種類を6問、2番目を4問(苦手が1つなら10問) */
    startTrain() {
      const e = this.evaluate();
      if (!e.weak.length) return this.openEval();
      const w = e.weak, plan = [];
      const n1 = w.length > 1 ? 6 : 10;
      for (let i = 0; i < n1; i++) plan.push(w[0].d.id);
      for (let i = n1; i < 10; i++) plan.push(w[1].d.id);
      plan.sort(() => Math.random() - 0.5); // 同じ種類が続きすぎないように、ばらす
      this.mode = 'train'; this.backTo = 'menu'; this.view = 'quiz'; this.theme = null; this.lastCatId = null;
      this.trainPlan = plan; this.trainBefore = e; this.trainRes = {};
      this.ses = { n: 0, ok: 0, streak: 0, best: 0 };
      MJ.App.show('drill');
      this.layout();
      $('#drill-home').classList.add('hidden');
      $('#drill-quiz').classList.remove('hidden');
      this.next();
    },
    trainResult() {
      const e0 = this.trainBefore, ses = this.ses;
      const nm = (d) => this.shortName(d);
      const rows = Object.keys(this.trainRes).map((id) => {
        const d = MJ.DRILLS.find((x) => x.id === id), r = this.trainRes[id], b = e0.rows.find((x) => x.d.id === id);
        return `<div class="row"><span>${d.icon} ${nm(d)}</span><b>${r.ok}/${r.n}問 正解</b><span class="ev-d">${b && b.rate != null ? Math.round(b.rate * 100) + '%' : '—'} → ${Math.round((r.ok / r.n) * 100)}%</span></div>`;
      }).join('');
      const mood = ses.ok >= 8 ? 'ok' : ses.ok >= 5 ? 'cheer' : 'advice';
      const say = ses.ok >= 8 ? 'すばらしい! 苦手を克服してきましたね。' : ses.ok >= 5 ? 'いい調子です。もう1回やれば、もっと良くなります。' : 'だいじょうぶ。間違えたところが、いちばん伸びるところです。';
      $('#drill-title').textContent = '🔥 特訓の結果'; $('#drill-score').textContent = '';
      { const qm = $('#dr .ms-quiz'); if (qm) qm.remove(); }
      $('#drill-quiz').classList.add('hidden'); $('#drill-home').classList.remove('hidden');
      this.view = 'result'; this.mode = 'eval';
      $('#drill-home').innerHTML = `<div class="ev"><div class="ev-top">${MJ.UI.teacherImg(mood)}<div class="ev-say">${say}</div></div><div class="ev-res"><div class="big">${ses.ok} / ${ses.n}問 正解</div>${rows}<div class="ev-act"><button class="btn pri" id="ev-again" type="button" data-ev="train">🔥 もう1回</button><button class="btn" id="ev-see" type="button" data-ev="eval">🎓 評価を見る</button></div></div></div>`;
      MJ.SFX.play(ses.ok >= 8 ? 'ok' : 'select');
      this.layout();
      if (MJ.Pad) { MJ.Pad.cur = null; MJ.Pad.desc = null; MJ.Pad.refocus(); }
    },

    layout() {
      const el = $('#screen-drill');
      { const d = $('#dr'); if (d) d.dataset.mode = this.mode || ''; }
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

    start(cat, theme) {
      this.mode = 'free'; this.backTo = 'menu';
      this.cat = MJ.DRILLS.find((d) => d.id === cat);
      this.theme = theme || null;
      this.ses = { n: 0, ok: 0, streak: 0, best: 0 };
      $('#drill-home').classList.add('hidden');
      $('#drill-quiz').classList.remove('hidden');
      this.next();
    },

    /* 苦手な種類を中心に、次の問題を作っておく(待たせない) */
    makeAuto() {
      const id = MJ.pickAutoCat(load(), this.lastCatId);
      const cat = MJ.DRILLS.find((x) => x.id === id);
      let q = null;
      for (let i = 0; i < 5 && !q; i++) q = cat.gen();
      return q ? { cat, q } : null;
    },
    prefetch() {
      clearTimeout(this._pt);
      this._pt = setTimeout(() => { try { if (!this.pre) this.pre = this.makeAuto(); } catch (e) { this.pre = null; } }, 400);
    },

    next() {
      $('#dq-board').innerHTML = $('#dq-prompt').innerHTML = $('#dq-hand').innerHTML = $('#dq-opts').innerHTML = '';
      $('#dq-sit').innerHTML = '';
      $('#dq-fb').classList.add('hidden');
      $('#dq-actions').classList.add('hidden');
      if (this.mode === 'train' && this.ses.n >= this.trainPlan.length) return this.trainResult();
      const pre = this.mode === 'auto' ? this.pre : null;
      this.pre = null;
      if (pre) { // ホームにいるあいだに作っておいた問題を、すぐに出す
        this.layout();
        this.lastCatId = pre.cat.id; this.cat = pre.cat; this.q = pre.q;
        this.picked = -1; this.done = false;
        this.render();
        return;
      }
      setTimeout(() => {
        this.layout();
        if (this.mode === 'train') { this.cat = MJ.DRILLS.find((x) => x.id === this.trainPlan[this.ses.n]); } else
        if (this.mode === 'auto') { // 弱いところを中心に、種類を選ぶ
          const id = MJ.pickAutoCat(load(), this.lastCatId);
          this.lastCatId = id;
          this.cat = MJ.DRILLS.find((x) => x.id === id);
        }
        let q = null;
        for (let i = 0; i < 5 && !q; i++) q = this.theme && this.cat.id === 'def' ? MJ.Drill.genDef(this.theme) : this.cat.gen();
        if (!q) { $('#dq-sit').textContent = '問題を作れませんでした。もう一度お試しください。'; return; }
        this.q = q;
        this.picked = -1;
        this.done = false;
        this.render();
      }, 0);
    },

    scoreText() {
      const s = this.ses;
      if (this.mode === 'train') return `特訓 ${Math.min(s.n + (this.done ? 0 : 1), 10)}/10問`;
      return `今回 ${s.ok}/${s.n}問 正解${s.streak >= 2 ? ` ・ 🔥${s.streak}連続` : ''}`;
    },

    render() {
      const q = this.q;
      if (this.mode === 'auto') this.prefetch();
      $('#drill-title').textContent = `${this.cat.icon} ${q.title}`;
      $('#drill-score').textContent = this.scoreText();
      $('#dq-sit').innerHTML = q.sit;
      MJ.Gloss.decorate($('#dq-sit'));
      $('#dq-prompt').innerHTML = q.prompt;
      MJ.Gloss.decorate($('#dq-prompt'));
      // 場 (CPUの河)
      let board = '';
      if (q.g && (q.cat === 'def' || q.cat === 'push')) {
        board = '<div class="dblocks">' + [1, 2, 3].map((s) => {
          const p = q.g.players[s];
          const river = p.discards.map((d) => MJ.tileHTML(d.tile.t, d.riichi ? 'rch' : '', '', d.tile.red)).join('');
          return `<div class="blk${p.riichi ? ' rch-on' : ''}"><div class="strip">${MJ.UI.faceImg(p.char, 'dface')}<div class="meta"><div class="nm">${p.name}</div><div class="chips">${p.riichi ? '<span class="chip r">リーチ</span>' : ''}<span class="chip">${['東', '南', '西', '北'][q.g.seatWindOf(p)]}家</span></div></div></div><div class="river">${river}</div></div>`;
        }).join('') + '</div>';
      }
      $('#dq-board').innerHTML = board;
      { const old = $('#dr .mascot'); if (old) old.remove(); $('#dr').insertAdjacentHTML('beforeend', MJ.UI.mascotHTML('advice', '', 'ms-quiz')); } // 考える顔で、待つ
      $('#drill-quiz').classList.toggle('has-board', !!board);
      // ふりがなを先に付けてから、枠に収まる、いちばん大きい文字にする(ふりがなで行が高くなるぶんも含めて測る)
      if (MJ.Ruby) { MJ.Ruby.apply($('#dq-sit')); MJ.Ruby.apply($('#dq-prompt')); }
      const fitTop = () => { this.fitBox($('#dq-sit'), board ? 20 : 22, 12); this.fitBox($('#dq-prompt'), board ? 24 : 28, 13); };
      fitTop();
      setTimeout(() => { if (this.q === q) fitTop(); }, 150); // 牌の画像・文字の読み込みで高さが変わっても、収め直す
      // 手牌
      const melds = q.melds && q.melds.length ? `<div class="melds" style="justify-content:center;margin-bottom:6px">${q.melds.map((m) => MJ.UI.meldHTML(m)).join('')}</div>` : '';
      const tiles = q.hand.map((h, i) => `<div class="tile ok" data-i="${i}">${MJ.tileSVG(h.t, h.red)}</div>`).join('');
      const win = q.win ? `<div class="tile drawn hl" style="outline:3px solid var(--acc)">${MJ.tileSVG(q.win.t, q.win.red)}</div>` : '';
      $('#dq-hand').innerHTML = `${melds}<div class="hand">${tiles.replace(/ ok"/g, q.kind === 'tile' ? ' ok"' : '"')}${win}</div>`;
      // 選択肢
      if (q.kind === 'choice') {
        $('#dq-opts').innerHTML = q.options.map((o) => `<button class="btn dq-opt" data-id="${o.id}">${o.html}</button>`).join('');
        $('#dq-opts').className = 'dq-opts ' + (q.options.length <= 3 ? 'n3' : 'n4'); // 3つまでは横1列で大きく、4つ以上は2段
        $('#dq-actions').classList.add('hidden');
      } else {
        $('#dq-opts').innerHTML = '';
        const b = $('#dq-ok');
        b.disabled = true;
        b.textContent = 'この牌を切る';
        $('#dq-actions').classList.remove('hidden');
      }
      if (MJ.Ruby) MJ.Ruby.apply($('#dq-opts'));
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
      this.logAns(this.cat.id, good);
      if (this.mode === 'train') { const t = (this.trainRes[this.cat.id] = this.trainRes[this.cat.id] || { n: 0, ok: 0 }); t.n++; if (good) t.ok++; }
      MJ.SFX.play(good ? 'ok' : r.r === 'near' ? 'select' : 'ng');
      $('#drill-score').textContent = this.scoreText();
      const head = good ? '⭕ 正解!' : r.r === 'near' ? '△ おしい!' : '❌ ちがいます';
      this.showFb(head, good ? 'good' : r.r === 'near' ? 'warn' : 'bad', r.html);
    },

    /* 答え合わせ: 1画面に収め、長いときはページ送りにする(スクロールしない) */
    showFb(head, cls, html) {
      const fb = $('#dq-fb');
      fb.className = `dq-fb ${cls}`;
      fb.innerHTML = `<div class="dq-fh"><span>${head}</span><span class="pg"></span><button class="btn sm rd" data-read="drill">🔊 読み上げ</button></div><div class="dq-body" id="dq-exp"></div><div class="dq-fa">${cls === 'good' ? MJ.UI.mascotHTML('ok', '正解です!', 'ms-fb') : MJ.UI.mascotHTML('pass', 'おしい! つぎは大丈夫', 'ms-fb')}${this.mode === 'auto' ? '<button class="btn sm ev-go" data-ev="eval" type="button">🎓 評価</button>' : ''}<button class="btn pri" id="dq-next">次の問題 ▶</button></div><button class="pm-arrow l" id="dq-prev" aria-label="前へ">◀</button><button class="pm-arrow r" id="dq-nextp" aria-label="次へ">▶</button>`;
      $('#dq-actions').classList.add('hidden');
      { const qm = $('#dr .ms-quiz'); if (qm) qm.remove(); } // 答え合わせの間は、問題のときの先生は、かくれる
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
        let px = 22;
        while (!build(px) && px > 18) px -= 1;
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
      $('#dq-fb').addEventListener('click', (e) => { if (e.target.closest('.ev-go')) this.openEval(); else if (e.target.closest('#dq-next')) this.next(); else if (e.target.closest('#dq-nextp')) this.fbShow(this.fbI + 1); else if (e.target.closest('#dq-prev')) this.fbShow(this.fbI - 1); });
      $('#drill-home').addEventListener('click', (e) => { const b = e.target.closest('[data-ev]'); if (!b) return; if (b.dataset.ev === 'train') this.startTrain(); else this.openEval(); });
      $('#drill-back').addEventListener('click', () => { if (this.mode === 'eval') return MJ.App.show('menu'); if (this.backTo === 'study') MJ.Study.open(); else MJ.App.show('menu'); });
      window.addEventListener('resize', () => { if (!$('#screen-drill').classList.contains('hidden')) this.layout(); });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
