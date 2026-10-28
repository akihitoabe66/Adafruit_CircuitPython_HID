/* サイコロ演出: 対局のはじめは「あなた」が振って東家(最初の親)を決める。そのあとは局のはじめに、親が振る。
   2つのサイコロが落ちてはずみ、合計を、あなたから反時計まわりに数える。Aボタン・クリック・Enter で振る/すすむ */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const $ = (s) => document.querySelector(s);
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const FIN = { 1: [0, 0], 2: [90, 0], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 6: [180, 0] }; // 上の面を v にする回転(X, Z)
  const WINDS = ['東', '南', '西', '北'];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const face = (n) => `<div class="dc-f dc-f${n}">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (PIPS[n].indexOf(i) >= 0 ? `<span class="dc-p${n === 1 ? ' r' : ''}"></span>` : '<span></span>')).join('')}</div>`;
  const die = (id, x, y) => `<div class="dc-die" style="left:calc(var(--u)*${x});top:calc(var(--u)*${y})"><div class="dc-dx" id="dcx${id}"><div class="dc-sh" id="dcs${id}"></div><div class="dc-dy" id="dcy${id}"><div class="dc-cam"><div class="dc-cube" id="dcc${id}">${[1, 2, 3, 4, 5, 6].map(face).join('')}</div></div></div></div></div>`;
  const tick = (vol, at) => { try { MJ.SFX.noise(0.05, 2600, 0.5 * vol, 1.2, at, 'bandpass'); MJ.SFX.tone(420, 0.07, 'square', 0.1 * vol, 200, at); } catch (e) { /* ignore */ } };

  const D = (MJ.Dice = {
    active: false,
    skip: null,
    /* first=true: 最初の東家決め(あなたが振る) / false: 局のはじめに親が振る。決まった親の席(0〜3)を返す */
    play(game, first) {
      return new Promise((res) => {
        if (!game || game.fast) return res(null);
        const host = $('#screen-game');
        if (!host) return res(null);
        const old = $('#dice'); if (old) old.remove();
        const roller = first ? 0 : game.dealer;
        const a = 1 + Math.floor(Math.random() * 6), b = 1 + Math.floor(Math.random() * 6), total = a + b;
        const target = (total - 1) % 4; // あなたから反時計まわりに数えた席
        const dealer = first ? target : game.dealer;
        const el = document.createElement('div');
        el.id = 'dice';
        const pc = (s, cls) => {
          const p = game.players[s];
          return `<div class="dc-pc ${cls}" data-i="${s}">${s === 0 ? `<div class="dc-you">${MJ.UI.faceImg(p.char)}</div>` : MJ.UI.faceImg(p.char, '', s)}<div class="dc-nm"><span class="dc-w"></span>${s === 0 ? 'あなた' : p.name}</div></div>`;
        };
        el.innerHTML = `<div class="dc-stage"><div class="dc-in">${pc(2, 't')}${pc(3, 'l')}${pc(1, 'r')}${pc(0, 'b')}<div class="dc-cap" id="dc-cap"></div>` +
          `<div class="dc-tray"><div class="dc-slot">${die(0, 48, 30)}${die(1, 160, 18)}</div></div><div class="dc-hint"><i>A</i> すすむ</div></div></div>`;
        const srcs = [...el.querySelectorAll('img')].map((x) => x.getAttribute('src'));
        const ready = Promise.all(srcs.map((u) => new Promise((ok) => { const im = new Image(); im.onload = im.onerror = ok; im.src = u; if (im.complete) ok(); })));
        Promise.race([ready, wait(3000)]).then(() => begin());

        const begin = () => {
          host.appendChild(el);
          D.active = true;
          let done = false, go = null;
          const finish = () => {
            if (done) return; done = true; D.active = false; D.skip = null;
            el.classList.add('out');
            setTimeout(() => el.remove(), 260);
            if (go) go();
            res(dealer);
          };
          const seats = (f) => el.querySelectorAll('.dc-pc').forEach((e) => f(e, +e.dataset.i));
          const cap = (h) => { const c = $('#dc-cap'); if (!c) return; c.innerHTML = !h ? '' : h.indexOf('<span') === 0 ? h : '<span>' + h + '</span>'; c.classList.remove('in'); void c.offsetWidth; c.classList.add('in'); };
          const winds = (d) => seats((e, i) => { const w = e.querySelector('.dc-w'); const k = (i - d + 4) % 4; w.textContent = WINDS[k]; w.classList.toggle('east', k === 0); });
          const toss = (i, v) => {
            const cu = $('#dcc' + i), dx = $('#dcx' + i), dy = $('#dcy' + i), sh = $('#dcs' + i);
            if (!cu) return;
            [dx, dy, sh].forEach((e) => { e.classList.remove('go'); void e.offsetWidth; });
            dx.style.setProperty('--sxn', i ? 330 : 420);
            cu.style.transition = 'none'; cu.style.transform = 'rotateY(0deg) rotateX(0deg) rotateZ(0deg)'; void cu.offsetWidth;
            const f = FIN[v], yaw = Math.floor(Math.random() * 4) * 90 + 720 + i * 360;
            cu.style.transition = '';
            cu.style.transform = `rotateY(${yaw}deg) rotateX(${f[0] + 720 + i * 360}deg) rotateZ(${f[1] + 360}deg)`;
            [dx, dy, sh].forEach((e) => e.classList.add('go'));
          };
          // 置いてあるサイコロは、はじめは 1 と 1
          [0, 1].forEach((i) => { const cu = $('#dcc' + i); cu.style.transition = 'none'; cu.style.transform = 'rotateY(0deg) rotateX(0deg) rotateZ(0deg)'; });

          D.skip = finish;
          el.addEventListener('click', () => { if (go) go(); else finish(); });
          const label = first ? '' : game.kyokuLabel() + '　';
          seats((e) => e.classList.add('dim'));
          if (!first) { winds(dealer); seats((e, i) => e.classList.toggle('hit', i === dealer)); seats((e) => e.classList.remove('dim')); }

          (async () => {
            const who = roller === 0 ? 'あなた' : game.players[roller].name;
            if (roller === 0) {
              cap(first ? '<span><em>東家(親)</em>を決めます</span>' : `<span>${label}<em>あなた</em>が親　サイコロをふります</span>`);
              await wait(1300); // Aボタンを押さなくても、自動で振る
            } else {
              cap(`<span>${label}<em>${who}</em>が親　サイコロをふります</span>`);
              await wait(1100);
            }
            if (done) return;
            cap('');
            try { MJ.SFX.unlock(); } catch (e) { /* ignore */ }
            toss(0, a); await wait(160); toss(1, b);
            [0, 0.44, 0.6, 0.76, 0.86].forEach((p, k) => tick(k ? 0.8 : 1, 0.16 + 1.55 * p));
            await wait(1900); if (done) return;
            try { MJ.SFX.noise(0.12, 3500, 0.5, 1, 0, 'bandpass'); MJ.SFX.tone(880, 0.25, 'triangle', 0.18, 0); } catch (e) { /* ignore */ }
            if (first) cap('あなたから 数えます');
            if (first) {
              seats((e) => e.classList.remove('dim'));
              await wait(700); if (done) return;
              for (let k = 0; k < total; k++) {
                const idx = k % 4;
                seats((e, i) => e.classList.toggle('hit', i === idx));
                cap(`<span>${idx === 0 ? 'あなた' : game.players[idx].name}</span>`);
                tick(0.7, 0);
                await wait(360); if (done) return;
              }
              await wait(300); if (done) return;
              winds(dealer);
              seats((e, i) => e.classList.toggle('hit', i === dealer));
              try { MJ.SFX.don(0.7); } catch (e) { /* ignore */ }
              cap(`<span><em>${dealer === 0 ? 'あなた' : game.players[dealer].name}</em>が東家(親)</span>`);
              await wait(2600); if (done) return; // 東家が決まったら、Aボタンを押さなくても自動で始まる
              finish();
            } else {
              await wait(1100);
              finish();
            }
          })();
        };
      });
    },
  });
  // Enter / A / Esc / B で すすむ(パッドの処理より先に受け取る)
  G.addEventListener('keydown', (e) => {
    if (!D.active || !D.skip) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const el = $('#dice');
    if (el) el.click();
  }, true);
})(typeof window !== 'undefined' ? window : globalThis);
