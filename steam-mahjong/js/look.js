/* 「新しい見た目」(ホロライブ超高速麻雀などの、いまの標準的な麻雀ゲームの要素を取り入れた版)。
   いつでも、設定の「見た目」(または ?look=old)で「いまの見た目」に戻せる。 body.look-new が付いているときだけ働く。
   ・各席の顔(名札のそば)  ・「テンパイまで N」  ・「待ち牌表示」ボタン
   ・上がった人だけの全画面カットイン(ロン・ツモ)  ・当たり牌のキラキラ  ・結果画面の大きなキャラ */
(function () {
  const MJ = window.MJ;
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
  const q = (() => { try { return new URLSearchParams(location.search).get('look'); } catch (e) { return null; } })();
  if (q === 'old' || q === 'new') put('mj_look', q);
  const on = () => get('mj_look') !== 'old';
  const apply = () => document.body.classList.toggle('look-new', on());
  const L = MJ.Look = {
    on,
    set(v) { put('mj_look', v ? 'new' : 'old'); apply(); if (MJ.UI && MJ.UI.game) { L.update(MJ.UI.game); } else document.querySelectorAll('#lk').forEach((e) => e.remove()); },
  };
  apply();
  const $ = (s) => document.querySelector(s);
  const FACE_POS = [[472, 318], [638, -4], [146, -4], [34, -4]]; // 席0(自分)・1(右)・2(向かい)・3(左) の顔の位置(設計座標 720×428)
  let sig = '';
  L.update = function (game) {
    const sc = $('#sc'); if (!sc) return;
    let lk = $('#lk');
    if (!on() || !game) { if (lk) lk.remove(); return; }
    if (!lk) { lk = document.createElement('div'); lk.id = 'lk'; sc.appendChild(lk); sig = ''; }
    const U = MJ.UI;
    const p0 = game.players[0];
    // 席の顔
    const faces = game.players.map((p, s) => {
      const f = U.faceImg(p.char, 'lk-f', s);
      return `<div class="lk-face lf${s}${game.turn === s ? ' act' : ''}${p.riichi ? ' rch' : ''}" style="left:${FACE_POS[s][0]}px;top:${FACE_POS[s][1]}px">${f}</div>`;
    }).join('');
    // テンパイまで N
    let sh = '', cls = '';
    try {
      if (p0 && p0.hand && p0.hand.length % 3 !== 0) {
        const n = MJ.shanten(MJ.toCounts(p0.hand), p0.melds.length);
        if (n < 0) { sh = '上がり!'; cls = 'ok'; } else if (n === 0) { sh = 'テンパイ!'; cls = 'ok'; } else sh = `テンパイまで<b>${n}</b>`;
      }
    } catch (e) { /* ignore */ }
    const html = `${faces}<div class="lk-sh ${cls}">${sh}</div><button class="lk-wait" type="button">待ち牌表示</button><div class="lk-wp hidden"></div>`;
    const key = html + (lk.querySelector('.lk-wp') && !lk.querySelector('.lk-wp').classList.contains('hidden') ? 'o' : 'c');
    if (key === sig) return;
    const open = lk.querySelector('.lk-wp') && !lk.querySelector('.lk-wp').classList.contains('hidden');
    sig = key;
    lk.innerHTML = html;
    const wp = lk.querySelector('.lk-wp');
    const fill = () => { const h = U.waitPanel(game); wp.innerHTML = h || '<div class="wait wait-h"><h5>待ち牌</h5><div class="wt-hint">まだ テンパイ<br>していません</div></div>'; };
    if (open) { fill(); wp.classList.remove('hidden'); }
    lk.querySelector('.lk-wait').addEventListener('click', () => { if (wp.classList.contains('hidden')) { fill(); wp.classList.remove('hidden'); } else wp.classList.add('hidden'); });
  };
  const R = MJ.UI && MJ.UI.render;
  if (R) MJ.UI.render = function (game) { const r = R.apply(this, arguments); try { L.update(game); } catch (e) { /* ignore */ } return r; };

  /* 上がった人だけの全画面カットイン(ロン・ツモ)。 当たり牌がキラキラ → 全画面で、その人が大きく出て、はねて喜ぶ */
  L.winCut = function (U, game, p, text, opt, tg) {
    const all = opt && opt.all && opt.all.length > 1 ? opt.all : [p];
    const word = (all.length > 1 ? (all.length >= 3 ? 'トリプルロン' : 'ダブロン') : text) + '!';
    const sc = $('#sc');
    const hitEl = () => (text === 'ロン' ? $('#table .tile.hl') : $('#mine .hand .tile.drawn'));
    const nm = (q2) => (q2.isHuman ? 'あなた' : q2.name);
    const quote = (q2) => { const raw = q2 && q2.char && q2.char.lines && q2.char.lines.win; if (!raw) return ''; const t = MJ.winWords(raw, text === 'ツモ'); const m = /^[^。!!…]*[。!!…]+\s*(.+)$/.exec(t); return m ? m[1].slice(0, 22) : ''; };
    // 1) 当たり牌のキラキラ(卓の上)
    const spk = document.createElement('div'); spk.className = 'lk-spk'; spk.style.left = tg.x + 'px'; spk.style.top = tg.y + 'px';
    spk.innerHTML = Array.from({ length: 8 }, (_, i) => `<i style="--a:${i * 45}deg;--d:${(i % 3) * 60}ms">✦</i>`).join('');
    if (sc) sc.appendChild(spk);
    // 2) 全画面カットイン
    const fx = document.createElement('div');
    fx.className = 'lk-cut' + (all.length > 1 ? ' multi' : '');
    fx.innerHTML = `<div class="lc-bg"></div><div class="lc-rays"></div>${all.map((a, i) => `<div class="lc-who w${i}">${U.faceImg(a.char, 'lc-face', a.seat)}<div class="lc-name">${nm(a)}</div>${quote(a) ? `<div class="lc-q">${quote(a)}</div>` : ''}</div>`).join('')}<div class="lc-word">${word}</div>${Array.from({ length: 14 }, (_, i) => `<i class="lc-s" style="--x:${(i * 73) % 100}%;--y:${(i * 41 + 17) % 100}%;--d:${(i % 5) * 180}ms">✦</i>`).join('')}`;
    return new Promise((resolve) => {
      const T = []; let done = false;
      const hit = (v) => { const e = hitEl(); if (e) e.classList.toggle('wf-hit', v); };
      const finish = () => { if (done) return; done = true; T.forEach(clearTimeout); hit(false); spk.remove(); fx.remove(); document.removeEventListener('keydown', onKey, true); resolve(); };
      const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); } };
      fx.addEventListener('click', finish); document.addEventListener('keydown', onKey, true);
      T.push(setTimeout(() => hit(true), 0));
      T.push(setTimeout(() => { document.body.appendChild(fx); MJ.SFX.don(0.9); MJ.SFX.voice(text, all[0]); MJ.SFX.play(text === 'ロン' ? 'ron' : 'tsumo'); }, 650));
      if (all.length > 1) T.push(setTimeout(() => MJ.SFX.voice(text, all[1]), 1200));
      T.push(setTimeout(finish, 3200));
    });
  };
})();
