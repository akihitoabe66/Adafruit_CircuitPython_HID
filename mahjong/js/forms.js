/* 「丸暗記したい7つの形」: 手牌の中の形を見つけて名前を付け、残す/切るの理由を説明する(牌効率の学習用) */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const F = (MJ.Forms = {});
  const tn = (t) => MJ.tileName(t);
  const ic = (t) => MJ.icon(t);

  /* 7つの形の説明(例は萬子で表記) */
  F.LIST = [
    { id: 'ren4', name: '4連携', yomi: 'よんれんけい', ex: '4567m', keep: true,
      one: '連続した4枚(例: 四五六七)。', why: '「連続3枚(面子)+1枚」とも「両面ターツ×2」とも見られる、受け入れがとても広い形です。どの牌を引いても手が進みやすいので、崩さずに残します。' },
    { id: 'naka', name: '中膨れ', yomi: 'なかぶくれ', ex: '3445m', keep: true,
      one: '真ん中の牌が2枚重なった形(例: 三四四五)。', why: '両面ターツを作りながら、重なった牌が雀頭の候補にもなります。2・3・5・6のどれを引いても形が整い、待ちも良くなります。' },
    { id: 'soba', name: 'メンツのそば', yomi: 'めんつのそば', ex: '4678m', keep: true,
      one: '面子の近くに、1つ空けて孤立牌がある形(例: 四+六七八)。', why: '孤立牌も面子のそばなら、3・4・5を引いて形が進みます(例の四なら、三・四・五で両面・雀頭・順子が作れる)。単独の孤立牌より価値が高いので、すぐには切りません。' },
    { id: 'ryankan', name: 'リャンメンカンチャン', yomi: 'りゃんめんかんちゃん', ex: '568m', keep: true,
      one: '両面とカンチャンが重なった3枚(例: 五六八)。', why: '五六(両面)と六八(カンチャン)が重なっていて、四や七など複数の牌で形が進みます。見落としがちですが、とても効率の良い形です。' },
    { id: 'sand', name: 'サンドイッチ形', yomi: 'さんどいっちがた', ex: '468m', keep: false,
      one: '1つ飛ばしで並んだ3枚(例: 四六八)。', why: '真ん中を切って両端の2枚を別々に伸ばすほうが、カンチャン(待ち1種類)を作るより受け入れが広くなるのが基本です。' },
    { id: 'three', name: '3枚1ブロック打法', yomi: 'さんまいひとぶろっくだほう', ex: '4468m', keep: false,
      one: '悪い形の牌が4枚並んでいる場面(例: 四四六八)。', why: '4枚とも持つより「1枚切って3枚のブロックにする」ほうが、受け入れが最大になることが多い考え方です。どの1枚を切るかは、枚数(受け入れ)で比べます。' },
    { id: 'kanzen', name: '完全イーシャンテン', yomi: 'かんぜんいーしゃんてん', ex: '123m 456p 34s 67s 55m', keep: true,
      one: '面子2つ+両面ターツ2つ+雀頭がそろった1シャンテン。', why: '両面ターツが2つあるので、どちらが埋まっても待ちの広いテンパイになります。1シャンテンの中で最も強い形で、これを目指して打ちます。' },
  ];
  F.byId = (id) => F.LIST.find((x) => x.id === id);

  /* ---- 検出(手牌 c: 牌種ごとの枚数) ---- */
  const used = (r, sel) => sel.forEach((k) => { r[k] = true; });

  /* 数牌の1色ぶんから形を探す。戻り値: [{id, tiles:[牌種], cut?:牌種}] */
  function suitForms(a, base) {
    const out = [];
    const mark = new Array(9).fill(false); // 他の形で使った牌(重複して見つけない)
    const has = (n) => n >= 0 && n <= 8 && a[n] > 0;
    // 中膨れ(3445)
    for (let n = 0; n <= 6; n++) if (a[n] >= 1 && a[n + 1] === 2 && a[n + 2] >= 1 && !(a[n] >= 3) && !(a[n + 2] >= 3)) {
      out.push({ id: 'naka', tiles: [n, n + 1, n + 1, n + 2].map((x) => base + x) }); used(mark, [n, n + 1, n + 2]); n += 2;
    }
    // 4連携(4567)
    for (let n = 0; n <= 5; n++) if (a[n] > 0 && a[n + 1] > 0 && a[n + 2] > 0 && a[n + 3] > 0 && !mark[n] && !mark[n + 1] && !mark[n + 2] && !mark[n + 3]) {
      out.push({ id: 'ren4', tiles: [n, n + 1, n + 2, n + 3].map((x) => base + x) }); used(mark, [n, n + 1, n + 2, n + 3]); n += 3;
    }
    // メンツのそば(4+678 / 123+5)
    for (let n = 0; n <= 6; n++) {
      if (!(a[n] > 0 && a[n + 1] > 0 && a[n + 2] > 0) || mark[n] || mark[n + 1] || mark[n + 2]) continue;
      const lo = n - 2, hi = n + 4;
      if (has(lo) && !has(lo - 1) && !has(lo + 1) && a[lo] === 1 && !mark[lo]) { out.push({ id: 'soba', tiles: [lo, n, n + 1, n + 2].map((x) => base + x) }); used(mark, [lo, n, n + 1, n + 2]); continue; }
      if (has(hi) && !has(hi + 1) && !has(hi - 1) && a[hi] === 1 && !mark[hi]) { out.push({ id: 'soba', tiles: [n, n + 1, n + 2, hi].map((x) => base + x) }); used(mark, [n, n + 1, n + 2, hi]); }
    }
    // リャンメンカンチャン(568 / 578)
    for (let n = 0; n <= 5; n++) {
      if (mark[n] || mark[n + 1] || mark[n + 3] || mark[n + 2]) continue;
      if (a[n] === 1 && a[n + 1] === 1 && a[n + 2] === 0 && a[n + 3] === 1 && !has(n - 1) && !has(n + 4)) { out.push({ id: 'ryankan', tiles: [n, n + 1, n + 3].map((x) => base + x) }); used(mark, [n, n + 1, n + 3]); }
      else if (a[n] === 1 && a[n + 1] === 0 && a[n + 2] === 1 && a[n + 3] === 1 && !has(n - 1) && !has(n + 4)) { out.push({ id: 'ryankan', tiles: [n, n + 2, n + 3].map((x) => base + x) }); used(mark, [n, n + 2, n + 3]); }
    }
    // サンドイッチ(468): 真ん中を切る
    for (let n = 0; n <= 4; n++) {
      if (a[n] === 1 && a[n + 1] === 0 && a[n + 2] === 1 && a[n + 3] === 0 && a[n + 4] === 1 && !has(n - 1) && !has(n + 5) && !mark[n] && !mark[n + 2] && !mark[n + 4]) {
        out.push({ id: 'sand', tiles: [n, n + 2, n + 4].map((x) => base + x), cut: base + n + 2 }); used(mark, [n, n + 2, n + 4]);
      }
    }
    // 3枚1ブロック(5つの数字の範囲に悪い形の牌が4枚。面子はない)
    for (let n = 0; n <= 4; n++) {
      let sum = 0, free = true;
      for (let k = 0; k < 5; k++) { sum += a[n + k]; if (mark[n + k]) free = false; if (a[n + k] >= 3) free = false; }
      if (!free || sum !== 4) continue;
      let run = false;
      for (let k = 0; k < 3; k++) if (a[n + k] > 0 && a[n + k + 1] > 0 && a[n + k + 2] > 0) run = true;
      if (run) continue;
      // 両端が空いていて(孤立したかたまりであること)、他の牌とつながらない
      if (has(n - 1) || has(n + 5)) continue;
      const tiles = [];
      for (let k = 0; k < 5; k++) for (let m = 0; m < a[n + k]; m++) tiles.push(base + n + k);
      out.push({ id: 'three', tiles }); used(mark, [0, 1, 2, 3, 4].map((k) => n + k)); n += 4;
    }
    return out;
  }

  F.detect = (c) => {
    const out = [];
    for (let s = 0; s < 3; s++) out.push(...suitForms(c.slice(s * 9, s * 9 + 9), s * 9));
    return out;
  };

  /* ---- 完全イーシャンテン: 面子2+両面2+雀頭1+浮き1(13枚) ---- */
  F.isKanzen = (c13) => {
    const c = c13.slice();
    let found = false;
    const rec = (i, sets, ry, pair, left) => {
      if (found) return;
      while (i < 34 && c[i] === 0) i++;
      if (i >= 34) { if (sets === 2 && ry === 2 && pair === 1 && left === 1) found = true; return; }
      if (sets > 2 || ry > 2 || left > 1) return;
      const num = i < 27, r = i % 9;
      if (c[i] >= 3) { c[i] -= 3; rec(i, sets + 1, ry, pair, left); c[i] += 3; }
      if (num && r <= 6 && c[i + 1] > 0 && c[i + 2] > 0) { c[i]--; c[i + 1]--; c[i + 2]--; rec(i, sets + 1, ry, pair, left); c[i]++; c[i + 1]++; c[i + 2]++; }
      if (c[i] >= 2 && pair === 0) { c[i] -= 2; rec(i, sets, ry, 1, left); c[i] += 2; }
      if (num && r >= 1 && r <= 6 && c[i + 1] > 0) { c[i]--; c[i + 1]--; rec(i, sets, ry + 1, pair, left); c[i]++; c[i + 1]++; }
      c[i]--; rec(i, sets, ry, pair, left + 1); c[i]++;
    };
    rec(0, 0, 0, 0, 0);
    return found;
  };

  F.iconsOf = (tiles) => tiles.map(ic).join('');
  F.nameOf = tn;
})(typeof window !== 'undefined' ? window : globalThis);
