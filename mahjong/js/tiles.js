/* 牌の定義・SVG描画 (牌種 0-33: 0-8=萬 9-17=筒 18-26=索 27-30=東南西北 31-33=白發中) */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});

  MJ.HONOR_CH = ['東', '南', '西', '北', '白', '發', '中'];
  MJ.isNum = (t) => t < 27;
  MJ.suitOf = (t) => (t < 27 ? (t / 9) | 0 : 3);
  MJ.isHonor = (t) => t >= 27;
  MJ.isYaochu = (t) => t >= 27 || t % 9 === 0 || t % 9 === 8;
  MJ.isTerminal = (t) => t < 27 && (t % 9 === 0 || t % 9 === 8);
  MJ.isDragon = (t) => t >= 31;
  MJ.isWind = (t) => t >= 27 && t <= 30;
  MJ.tileName = (t) => (t >= 27 ? MJ.HONOR_CH[t - 27] : (t % 9) + 1 + ['萬', '筒', '索'][(t / 9) | 0]);
  MJ.windName = (w) => ['東', '南', '西', '北'][w];
  MJ.doraOf = (ind) => {
    if (ind < 27) return ind % 9 === 8 ? ind - 8 : ind + 1;
    if (ind <= 30) return ind === 30 ? 27 : ind + 1;
    return ind === 33 ? 31 : ind + 1;
  };
  MJ.isRedId = (id) => id === 16 || id === 52 || id === 88;

  MJ.shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  MJ.buildWall = () => {
    const w = [];
    for (let id = 0; id < 136; id++) w.push({ id, t: id >> 2, red: MJ.isRedId(id) });
    return MJ.shuffle(w);
  };

  /* ---------- SVG ---------- */
  const C = { b: '#1d4f9c', g: '#1c8a3b', r: '#c8262d' };
  const cache = {};

  function pinSVG(n) {
    const L = {
      1: [[20, 28, 12, 'r']],
      2: [[20, 16, 7.5, 'g'], [20, 40, 7.5, 'b']],
      3: [[10, 12, 6.5, 'b'], [20, 28, 6.5, 'r'], [30, 44, 6.5, 'g']],
      4: [[12, 16, 7, 'g'], [28, 16, 7, 'b'], [12, 40, 7, 'b'], [28, 40, 7, 'g']],
      5: [[11, 14, 6.5, 'g'], [29, 14, 6.5, 'b'], [20, 28, 6.5, 'r'], [11, 42, 6.5, 'b'], [29, 42, 6.5, 'g']],
      6: [[12, 12, 6.2, 'g'], [28, 12, 6.2, 'g'], [12, 28, 6.2, 'r'], [28, 28, 6.2, 'r'], [12, 44, 6.2, 'r'], [28, 44, 6.2, 'r']],
      7: [[9, 9, 5, 'g'], [20, 15, 5, 'g'], [31, 21, 5, 'g'], [12, 35, 5.6, 'r'], [28, 35, 5.6, 'r'], [12, 47, 5.6, 'r'], [28, 47, 5.6, 'r']],
      8: [[12, 9, 5, 'b'], [28, 9, 5, 'b'], [12, 21, 5, 'b'], [28, 21, 5, 'b'], [12, 35, 5, 'b'], [28, 35, 5, 'b'], [12, 47, 5, 'b'], [28, 47, 5, 'b']],
      9: [[10, 11, 5, 'g'], [20, 11, 5, 'g'], [30, 11, 5, 'g'], [10, 28, 5, 'r'], [20, 28, 5, 'r'], [30, 28, 5, 'r'], [10, 45, 5, 'b'], [20, 45, 5, 'b'], [30, 45, 5, 'b']],
    }[n];
    return L.map(([x, y, r, c]) =>
      `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${C[c]}" stroke-width="${r > 9 ? 2.4 : 1.8}"/><circle cx="${x}" cy="${y}" r="${r * 0.55}" fill="${C[c]}"/>`
    ).join('');
  }

  function stick(x, y, h, c) {
    return `<rect x="${x - 3}" y="${y - h / 2}" width="6" height="${h}" rx="2.5" fill="${C[c]}"/><rect x="${x - 3}" y="${y - 0.6}" width="6" height="1.2" fill="#fff" opacity=".75"/>`;
  }
  function souSVG(n) {
    if (n === 1) {
      return `<ellipse cx="20" cy="31" rx="9" ry="12" fill="${C.g}"/><circle cx="20" cy="15" r="5.5" fill="${C.g}"/><path d="M24 14 l7 2 l-7 2z" fill="${C.r}"/><circle cx="21.5" cy="14" r="1.2" fill="#fff"/><path d="M13 36 q-6 10 3 14 q3 -6 4 -10z" fill="${C.r}"/><path d="M27 36 q6 10 -3 14 q-3 -6 -4 -10z" fill="${C.b}"/>`;
    }
    const P = {
      2: [[20, 15, 'g'], [20, 41, 'g']],
      3: [[20, 15, 'g'], [11, 41, 'g'], [29, 41, 'g']],
      4: [[11, 15, 'g'], [29, 15, 'g'], [11, 41, 'g'], [29, 41, 'g']],
      5: [[11, 15, 'g'], [29, 15, 'g'], [20, 28, 'r'], [11, 41, 'g'], [29, 41, 'g']],
      6: [[9, 15, 'g'], [20, 15, 'g'], [31, 15, 'g'], [9, 41, 'g'], [20, 41, 'g'], [31, 41, 'g']],
      7: [[20, 11, 'r', 13], [9, 29, 'g', 15], [20, 29, 'g', 15], [31, 29, 'g', 15], [9, 47, 'g', 14], [20, 47, 'g', 14], [31, 47, 'g', 14]],
      8: [[7, 15, 'g'], [15, 15, 'g'], [25, 15, 'g'], [33, 15, 'g'], [7, 41, 'g'], [15, 41, 'g'], [25, 41, 'g'], [33, 41, 'g']],
      9: [[9, 11, 'g', 14], [20, 11, 'r', 14], [31, 11, 'g', 14], [9, 28, 'b', 14], [20, 28, 'r', 14], [31, 28, 'b', 14], [9, 45, 'g', 14], [20, 45, 'r', 14], [31, 45, 'g', 14]],
    }[n];
    return P.map(([x, y, c, h]) => stick(x, y, h || 20, c)).join('');
  }

  MJ.tileSVG = (t) => `<img src="img/tiles/${t}.png" alt="${MJ.tileName(t)}" draggable="false">`;

  /* HTML文字列 (cls: 追加クラス) */
  MJ.tileHTML = (t, cls = '', attrs = '', red = false) =>
    `<div class="tile ${cls}${red ? ' aka' : ''}" data-t="${t}" ${attrs} title="${MJ.tileName(t)}">${MJ.tileSVG(t)}</div>`;
  MJ.backHTML = (cls = '') => `<div class="tile back ${cls}"></div>`;
  /* 文章中に出す小さな牌 */
  MJ.icon = (t) => `<span class="tile t-xs">${MJ.tileSVG(t)}</span>`;
})(typeof window !== 'undefined' ? window : globalThis);
