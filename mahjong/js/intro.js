/* 対局スタート演出: 3人の顔が雀卓に登場 → 「東一局」→「勝負!」と、大きな文字が「ダン!」と出る
   演出の設定(mj_fx): big=派手(揺れ・光・火花) / normal=ふつう(揺れと光なし。標準) / off=なし。Aボタン・クリック・Enter でとばせる */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const $ = (s) => document.querySelector(s);
  const KEY = 'mj_fx';
  const LABEL = { big: '派手', normal: 'ふつう', off: 'なし' };
  const get = () => { try { const v = localStorage.getItem(KEY); return LABEL[v] ? v : 'normal'; } catch (e) { return 'normal'; } };
  const I = (MJ.Intro = {
    mode: get(),
    label: () => LABEL[I.mode],
    cycle() { I.mode = I.mode === 'normal' ? 'big' : I.mode === 'big' ? 'off' : 'normal'; try { localStorage.setItem(KEY, I.mode); } catch (e) { /* ignore */ } return I.mode; },
    active: false,
    skip: null,

    play(game) {
      return new Promise((res) => {
        if (I.mode === 'off' || !game) return res();
        const host = $('#screen-game');
        const old = $('#intro'); if (old) old.remove();
        const el = document.createElement('div');
        el.id = 'intro'; el.className = `fx-${I.mode}`;
        const seat = (s, cls) => {
          const p = game.players[s], ch = p.char || {};
          const lv = ch.level || 0;
          return `<div class="in-seat ${cls}">${MJ.UI.faceImg(ch)}<div class="in-nm">${p.name}<small>${lv ? '★'.repeat(lv) + ' ' + (MJ.LEVEL_JP[lv] || '') : ''}</small></div></div>`;
        };
        const len = { east: '東風戦', south: '東南戦', single: '1局戦' }[game.length] || '東風戦';
        el.innerHTML = `<div class="in-stage"><div class="in-seats">${seat(3, 'l')}${seat(2, 't')}${seat(1, 'r')}</div>` +
          '<div class="in-burst"></div><div class="in-word" id="in-w1"><div class="inw">東一局</div><div class="ins">' + len + '</div></div><div class="in-word" id="in-w2"><div class="inw">勝負!</div></div>' +
          '<div class="in-flash"></div><div class="in-hint"><i>A</i> とばす</div></div>';
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
        const dan = () => { try { MJ.SFX.play('start'); } catch (e) { /* ignore */ } };
        at(1500, dan); at(2600, dan);
        at(4700, finish);
        el.addEventListener('click', finish);
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
