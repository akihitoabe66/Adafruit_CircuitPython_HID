/* 対局スタート演出: 3人の顔が雀卓に登場 → 「東一局」→「勝負!」と、大きな文字が「ダン!」と出る
   演出の設定(mj_fx): big=派手(揺れ・光・火花) / normal=ふつう(揺れと光なし。標準) / off=なし。Aボタン・クリック・Enter でとばせる */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const settleThen = (host, el, fn) => { try { el.classList.add('pre'); host.appendChild(el); } catch (e) { /* ignore */ } requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { el.classList.remove('pre'); fn(); }, 380))); }; // 画面が切り替わって落ち着いてから、アニメを始める(読み込み中に始まって、とんで見えるのを防ぐ)
  const $ = (s) => document.querySelector(s);
  const KEY = 'mj_fx';
  const LABEL = { big: '派手', normal: 'ふつう', off: 'なし' };
  const get = () => { try { const v = localStorage.getItem(KEY); return LABEL[v] ? v : 'normal'; } catch (e) { return 'normal'; } };
  /* 桜吹雪: 花びらがちらちら落ちる */
  const petals = (el, n = 34) => {
    const st = el.querySelector('.in-stage'); if (!st) return;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i'); p.className = 'in-petal';
      const x = Math.random() * 100, dx = (Math.random() * 20 - 8), sz = 1.2 + Math.random() * 1.6, dur = 2.4 + Math.random() * 1.8, dl = Math.random() * 0.9, rot = Math.random() * 360;
      p.style.cssText = `left:${x}%;--dx:${dx}cqw;--sz:${sz}cqw;--r:${rot}deg;animation-duration:${dur.toFixed(2)}s;animation-delay:${dl.toFixed(2)}s`;
      st.appendChild(p);
      setTimeout(() => p.remove(), (dur + dl) * 1000 + 100);
    }
  };
  const I = (MJ.Intro = {
    mode: 'big', // いつも「派手」(設定は、なし)
    label: () => LABEL[I.mode],
    cycle() { return I.mode; },
    _cycle_old() { I.mode = I.mode === 'normal' ? 'big' : I.mode === 'big' ? 'off' : 'normal'; try { localStorage.setItem(KEY, I.mode); } catch (e) { /* ignore */ } return I.mode; },
    active: false,
    skip: null,

    play(game) {
      return new Promise((res) => {
        if (I.mode === 'off' || !game || game.resumed) return res();
        const host = $('#screen-game');
        const old = $('#intro'); if (old) old.remove();
        const el = document.createElement('div');
        el.id = 'intro'; el.className = `fx-${I.mode}`;
        const seat = (s, cls) => {
          const p = game.players[s], ch = p.char || {};
          const lv = ch.level || 0;
          return `<div class="in-seat ${cls}">${MJ.UI.faceImg(ch, '', s)}<div class="in-nm">${p.name}<small>${lv ? '★'.repeat(lv) : ''}</small></div></div>`;
        };
        const me = () => { const p = game.players[0]; return `<div class="in-seat me">${MJ.UI.faceImg(p.char)}<div class="in-nm">あなた</div></div>`; };
        const len = { east: '東風戦', south: '東南戦', single: '一局戦' }[game.length] || '東風戦';
        el.innerHTML = `<div class="in-stage"><div class="in-seats">${seat(3, 'l')}${seat(2, 't')}${seat(1, 'r')}${me()}</div>` +
          '<div class="in-burst"></div><div class="in-word" id="in-w1"><div class="inw">東一局</div><div class="ins">' + len + '</div></div><div class="in-word" id="in-w2"><div class="inw">勝負!</div></div>' +
          '<div class="in-flash"></div><div class="in-hint"><i>A</i> とばす</div></div>';
        // 顔の絵が読み込まれてから始める(顔が遅れて出て、文字のアニメだけ先に始まらないように)
        const srcs = [...el.querySelectorAll('img')].map((x) => x.getAttribute('src'));
        const ready = Promise.all(srcs.map((u) => new Promise((ok) => { const im = new Image(); im.onload = im.onerror = ok; im.src = u; if (im.complete) ok(); })));
        Promise.race([ready, new Promise((ok) => setTimeout(ok, 3000))]).then(() => settleThen(host, el, begin));
        const begin = () => {
        host.appendChild(el);
        I.active = true;
        let done = false;
        const timers = [];
        const finish = () => {
          if (done) return; done = true; I.active = false; I.skip = null;
          timers.forEach(clearTimeout);
          el.classList.add('out');
          setTimeout(() => { el.remove(); }, 260);
          res();
        };
        I.skip = finish;
        const at = (ms, f) => timers.push(setTimeout(f, ms));
        const dan = (clip, text, vol) => () => { try { MJ.SFX.don(1); if (clip) MJ.SFX.playClip(clip, text, vol); } catch (e) { /* ignore */ } };
        try { MJ.SFX.loadClip('intro_w2'); } catch (e) { /* ignore */ }
        { // 音は、文字の動きが実際に始まった時に鳴らす(画面が遅れても、音と絵がずれないように)。念のため、時間でも鳴らす
          let f1 = false, f2 = false;
          const s1 = () => { if (f1) return; f1 = true; dan(null, '', 0)(); };
          const s2 = () => { if (f2) return; f2 = true; dan(null, '', 0)(); try { MJ.SFX.playClip('intro_w2', '勝負', 1); } catch (e) { /* ignore */ } };
          const w1 = el.querySelector('#in-w1'), w2 = el.querySelector('#in-w2');
          if (w1) w1.addEventListener('animationstart', s1, { once: true });
          if (w2) w2.addEventListener('animationstart', s2, { once: true });
          at(2200, s1); at(3400, s2);
        } // 声は、文字が出る少し前に始める // 「東一局」は声なし(ドンだけ)。「勝負!」だけ声を出す
        at(2600, () => petals(el)); at(1500, () => petals(el, 14));
        at(4700, finish);
        el.addEventListener('click', finish);
        };
      });
    },
  });
  // Enter / A / Esc / B でとばす(パッドの処理より先に受け取る)
  G.addEventListener('keydown', (e) => {
    if (!I.active || !I.skip) return;
    e.preventDefault(); e.stopImmediatePropagation();
    I.skip();
  }, true);
  G.addEventListener('gamepadbutton', () => {});
})(typeof window !== 'undefined' ? window : globalThis);
