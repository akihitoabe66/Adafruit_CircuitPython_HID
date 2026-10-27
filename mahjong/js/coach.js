/* 学習用コーチ: 手牌を一緒に見ながらアドバイスを生成 */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const A = MJ.AI;
  const tn = MJ.tileName;
  const ic = MJ.icon;
  const icons = (arr, max = 8) => arr.slice(0, max).map(ic).join('') + (arr.length > max ? '…' : '');
  const card = (title, body, cls = '') => `<div class="cc ${cls}"><div class="cc-h">${title}</div><div class="cc-b">${body}</div></div>`;
  const ul = (items) => '<ul>' + items.map((x) => `<li>${x}</li>`).join('') + '</ul>';

  const C = (MJ.Coach = {});

  C.MODES = {
    free: { name: 'フリー対戦', short: 'フリー', desc: '好きな相手と自由に対戦。ヒントはいつでもON/OFFできます。' },
    beginner: { name: '入門: 役づくり講座', short: '入門', desc: '手牌を一緒に見ながら、役の作り方・鳴き・ロンされない打ち方を教えます。' },
    defense: { name: '捨て牌特訓: 守備', short: '守備', desc: '現物・スジ・カベなど、安全な牌の選び方に特化。牌ごとの危険度を表示します。' },
    drill: { name: '練習問題', short: '練習', desc: '毎回ランダムな問題で、何切る・役・守備・鳴き・待ち・点数計算を練習します。' },
    inter: { name: '中級のコツ', short: '中級', desc: '押し引き・打点・待ちの良し悪し・リーチかダマかなど、勝つための判断を学びます。' },
  };

  const TAG_HELP = {
    '現物': '<b>現物(げんぶつ)</b>=その相手が自分で捨てた牌と同じ牌。相手は同じ牌でロンできない(フリテン)ので<b>100%安全</b>。リーチ後に他家が通した牌も現物扱いです。',
    'スジ': '<b>スジ</b>=数牌の「3つ離れ」の関係(1-4-7 / 2-5-8 / 3-6-9)。相手が4を捨てていれば1と7はスジ。両面待ち(例:23で1・4待ち)には当たらないので<b>比較的安全</b>。ただしカンチャンやシャンポンには当たります。',
    '半スジ': '<b>半スジ</b>=4・5・6のように両側にスジがある牌で、片側だけスジ(例:4が、1だけ捨てられている)。両面の片側しか消えないので<b>少しだけ安全</b>です。',
    'カベ': '<b>カベ(壁)</b>=同じ牌が4枚見えている状態。例:5が4枚見えると、4・5や5・6を使った両面待ちは作れず、3・6・4・7が当たりにくくなります。',
    'ワンチャンス': '<b>ワンチャンス</b>=隣接する牌が3枚見えている状態。残りは1枚しかないので、その形の待ちは作りにくい。カベほどではないが安全寄り。',
    '字牌': '<b>字牌</b>は両面待ちがなく、シャンポン/タンキだけ。場に2枚以上見えていればかなり安全。ただし役牌(白發中・場風・相手の自風)は相手が持っていることがあります。',
    '無スジ': '<b>無スジ</b>=手がかりのない数牌。特に4・5・6の真ん中は両面待ちに最も当たりやすい危険牌です。',
  };

  const SHORT = { '端牌(無スジ)': '無スジ', 'ワンチャンス': '1チャンス', '字牌(残1)': '字牌①', 'カベ(片側)': 'カベ半', 'スジ・カベ': 'スジ壁' };
  const sh = (t) => SHORT[t] || t;
  const dorasInHand = (game, p) => {
    const c = MJ.toCounts(p.hand);
    let n = 0;
    for (const d of game.doraInd) n += c[MJ.doraOf(d.t)];
    for (const m of p.melds) for (const h of m.tiles) for (const d of game.doraInd) if (h.t === MJ.doraOf(d.t)) n++;
    for (const h of p.hand) if (h.red) n++;
    for (const m of p.melds) for (const h of m.tiles) if (h.red) n++;
    return n;
  };

  /* ---------- 「なぜ★の牌で、こちらではないのか」の比較 ---------- */
  function tileNotes(game, p, c, t) {
    const n = [];
    if (game.doraInd.some((d) => MJ.doraOf(d.t) === t)) n.push('ドラ(1枚で+1飜)');
    if (p.hand.some((h) => h.t === t && h.red)) n.push('赤ドラ(+1飜)');
    if (c[t] >= 2 && A.isYakuhaiFor(game, p, t)) n.push('役牌の対子(ポンで役になる)');
    if (t >= 27 && c[t] === 1 && !A.isYakuhaiFor(game, p, t)) n.push('孤立した字牌(使い道が少ない)');
    if (MJ.isTerminal(t) && c[t] === 1) n.push('端牌(順子を作りにくい)');
    return n;
  }
  /* 手牌の下に出す短い比較(詳しい版は右の解説パネル) */
  function diffShort(game, p, an, best, e) {
    const bits = [];
    if (e.sh > best.sh) bits.push('シャンテンが戻る');
    else {
      const d = best.ukeire.n - e.ukeire.n;
      if (d > 0) bits.push(`有効牌が${d}枚少ない`);
      else if (d < 0) bits.push(`有効牌は${-d}枚多い`);
      else bits.push('有効牌は同数');
    }
    const nb = tileNotes(game, p, an.c, best.t), ne = tileNotes(game, p, an.c, e.t);
    if (ne.length && !nb.length) bits.push(`${tn(e.t)}は${ne[0]}`);
    else if (nb.length && !ne.length) bits.push(`${tn(best.t)}は${nb[0]}`);
    return bits.join(' / ');
  }

  function diffWhy(game, p, an, best, e) {
    const parts = [];
    const nm = (x) => `${ic(x.t)}${tn(x.t)}`;
    const lab = (x) => (x.sh === 0 ? '待ち' : '有効牌');
    if (e.sh > best.sh) {
      parts.push(`${nm(e)}を切ると<b>シャンテンが戻って</b>(${best.sh === 0 ? 'テンパイ' : best.sh + 'シャンテン'}→${e.sh}シャンテン)、上がりが遠のきます`);
    } else {
      const d = best.ukeire.n - e.ukeire.n;
      if (d > 0) parts.push(`${lab(best)}の比較: ${nm(best)}を切ると<b>${best.ukeire.n}枚</b>(${icons(best.ukeire.tiles, 6)}) / ${nm(e)}を切ると${e.ukeire.n}枚(${icons(e.ukeire.tiles, 6)})。<b>${d}枚多い</b>ほうが上がりやすい`);
      else if (d < 0) parts.push(`${lab(e)}は${nm(e)}のほうが${-d}枚多いが、ほかの条件(下記)で★を優先`);
      else parts.push(`${lab(best)}の<b>枚数は同じ</b>(${best.ukeire.n}枚)。ここは枚数では差がつきません`);
      if (best.sh === 0 && e.sh === 0) {
        const val = (x) => { const c13 = an.c.slice(); c13[x.t]--; const tv = A.tenpaiValue(game, p, c13, an.f, false); return tv; };
        const vb = val(best), ve = val(e);
        const hb = vb && vb.best ? vb.best.res.han : 0, he = ve && ve.best ? ve.best.res.han : 0;
        if (hb !== he) parts.push(`ダマテンの打点は ${nm(best)}を切る→${hb ? hb + '飜' : '役なし'} / ${nm(e)}を切る→${he ? he + '飜' : '役なし'}`);
      }
    }
    const nb = tileNotes(game, p, an.c, best.t), ne = tileNotes(game, p, an.c, e.t);
    if (ne.length && !nb.length) parts.push(`${nm(e)}は<b>${ne.join('・')}</b>なので、手に残しておく価値があります`);
    else if (nb.length && !ne.length) parts.push(`${nm(best)}は${nb.join('・')}なので、先に切る候補です`);
    if (an.opps.length && best.danger && e.danger) {
      const ds = Math.round(e.danger.score - best.danger.score);
      if (Math.abs(ds) >= 2) parts.push(`安全度は ${nm(best)}=${best.danger.tag}(約${Math.round(best.danger.score)}%) / ${nm(e)}=${e.danger.tag}(約${Math.round(e.danger.score)}%)`);
    }
    if (best.sh === e.sh && best.ukeire.n === e.ukeire.n && !nb.length && !ne.length) parts.push('どちらを切ってもほぼ互角です。迷ったら、残り枚数が多く残る(見えていない牌が多い)ほうを引きやすく、<b>真ん中に近い牌</b>は残したほうが形に柔軟性があります');
    return parts;
  }

  /* ---------- 「なぜその牌を切るのか」の考え方 ---------- */
  function whyCard(game, p, an, e, eff) {
    const c = an.c, t = e.t, li = [];
    const left = (x) => Math.max(0, 4 - (an.vis[x] || 0));
    const pairs = c.reduce((n, v, i) => n + (v === 2 ? 1 : 0), 0);
    const sh = an.minSh;
    li.push(`<b>ゴール</b>: 上がりは「<b>面子</b>(3枚1組)を4つ+<b>雀頭</b>(同じ牌2枚)を1つ」。いまは<b>${sh === 0 ? 'テンパイ' : sh + 'シャンテン'}</b>。${sh > 0 ? `完成に近づく牌を引ける形ほど良い形です。` : ''}`);
    if (t >= 27) {
      if (c[t] === 1) li.push(`<b>なぜ${tn(t)}?</b> 字牌は<b>順子(連続する3枚)が作れず</b>、使うには同じ牌をあと2枚そろえて刻子にするしかありません(まだ見えていない残りは${left(t)}枚)。他の牌とつながらない孤立牌なので、手を進める力が小さいのです。`);
      else li.push(`<b>なぜ${tn(t)}?</b> 対子を崩しますが、他に切れる牌より有効牌が多く残るためです。`);
    } else if (c[t] === 2) {
      li.push(`<b>なぜ対子を1枚減らす?</b> 雀頭は<b>1組</b>あれば足ります。いま対子が<b>${pairs}組</b>${pairs >= 3 ? 'あり、余りが出ています' : ''}。対子から面子にするには<b>同じ牌をもう1枚</b>引く必要があり、${tn(t)}のまだ見えていない残りは最大${left(t)}枚だけ。`);
      li.push(`一方、連続する牌(例: 4と5)は<b>両側</b>(3と6)のどちらを引いても順子になるので、<b>最大8枚</b>が味方します。だから「ペアを増やす」より「つながる形に広げる」ほうが早く完成します。`);
    } else if (c[t] >= 3) {
      li.push(`<b>なぜ刻子を崩す?</b> 通常は完成した面子は崩しません。それでも崩すのは、ほかに切れる牌がほとんど無く、これで有効牌が最も多く残るためです。`);
    } else {
      const near = [-2, -1, 1, 2].filter((d) => Math.floor((t + d) / 9) === Math.floor(t / 9) && t + d >= 0 && c[t + d] > 0).length;
      if (!near) li.push(`<b>なぜ${tn(t)}?</b> 前後2つ以内(${tn(t)}の隣と1つ飛ばし)に牌が無い<b>孤立牌</b>。順子を作るには、あと2枚を自力で引かなければならず、完成までがとても遠いからです。`);
      else if (MJ.isTerminal(t)) li.push(`<b>なぜ${tn(t)}?</b> 1・9の端の牌は、順子を作れる形が<b>1通りだけ</b>(1なら123、9なら789)。真ん中の牌は最大3通り作れるので、端のほうが価値が低いのです。`);
      else li.push(`<b>なぜ${tn(t)}?</b> ほかの牌と比べて、この牌を残してもつながりが少なく、切ったあとの<b>有効牌が多く残る</b>からです。`);
    }
    const others = eff.filter((x) => x !== e).slice(0, 2);
    others.forEach((x) => { const df = diffWhy(game, p, an, e, x); if (df.length) li.push(`<b>${ic(e.t)}${tn(e.t)} と ${ic(x.t)}${tn(x.t)} の違い</b><br><span class="cc-s">${df.join('。<br>')}。</span>`); });
    if (e.ukeire.n && sh > 0) li.push(`<b>この後</b>: ${icons(e.ukeire.tiles, 6)}のどれかを引くと<b>${sh - 1}シャンテン</b>に進みます。`);
    const yao = c.reduce((n, v, i) => n + (MJ.isYaochu(i) ? v : 0), 0);
    if (MJ.isYaochu(t) && yao <= 5) li.push(`<b>おまけ</b>: 1・9・字牌を減らすと「<b>タンヤオ</b>(1飜)」が付けやすくなります。`);
    return card('🧠 どうして?(考え方)', `<ul class="cc-ul">${li.slice(0, 6).map((x) => `<li>${x}</li>`).join('')}</ul>`, 'rec');
  }

  /* ---------- 打牌の理由 ---------- */
  function reasonFor(game, p, an, e) {
    const c = an.c, t = e.t, parts = [];
    const yh = A.isYakuhaiFor(game, p, t);
    if (t >= 27) {
      if (c[t] === 1) parts.push(yh ? '役牌ですが1枚だけ。ポンの期待は薄め' : '他の牌とつながらない字牌の孤立牌は、真っ先に切る候補');
      else parts.push('字牌の対子を崩すことになります');
    } else {
      const near = [-2, -1, 1, 2].some((d) => Math.floor((t + d) / 9) === Math.floor(t / 9) && t + d >= 0 && c[t + d] > 0);
      if (c[t] === 1 && !near) parts.push('周りに連なる牌がない孤立牌。ここから面子はできにくい');
      else if (c[t] >= 3) parts.push('刻子を崩しています');
      else if (c[t] === 2) parts.push('対子を1枚減らします');
      else if (MJ.isTerminal(t)) parts.push('端の牌(1・9)は順子を作れる形が少ない');
      else parts.push('形が余っている部分です');
    }
    if (e.ukeire.n) parts.push(`切った後の有効牌は<b>${e.ukeire.n}枚</b>(${icons(e.ukeire.tiles)})`);
    return parts.join('。');
  }

  /* ---------- 狙える役 ---------- */
  C.yakuHints = function (game, p) {
    const c = MJ.toCounts(p.hand);
    const all = c.slice();
    for (const m of p.melds) for (const h of m.tiles) all[h.t]++;
    const total = all.reduce((a, b) => a + b, 0);
    const menzen = game.menzen(p);
    const out = [];
    for (let t = 27; t < 34; t++) {
      if (!A.isYakuhaiFor(game, p, t)) continue;
      if (p.melds.some((m) => m.kind !== 'chi' && m.t === t)) out.push({ pri: 9, n: '役牌', t: `${ic(t)}のポン済み。<b>役が確定</b>しています(1飜)。` });
      else if (c[t] >= 3) out.push({ pri: 8, n: '役牌', t: `${ic(t)}が3枚(刻子)。そのまま<b>役(1飜)</b>になります。` });
      else if (c[t] === 2) out.push({ pri: 7, n: '役牌', t: `${ic(t)}が対子。3枚目が出たら<b>ポン</b>で役(1飜)がつきます。` });
    }
    let yao = 0;
    for (let t = 0; t < 34; t++) if (MJ.isYaochu(t)) yao += all[t];
    if (yao === 0) out.push({ pri: 9, n: 'タンヤオ', t: '手牌がすべて2〜8の数牌。<b>タンヤオ(1飜)</b>の形です。' });
    else if (yao <= 3 && !p.melds.some((m) => (m.kind === 'chi' ? m.t % 9 === 0 || m.t % 9 === 6 : MJ.isYaochu(m.t))))
      out.push({ pri: 6, n: 'タンヤオ', t: `1・9・字牌が<b>あと${yao}枚</b>。これを切っていけば<b>タンヤオ(1飜)</b>。鳴いても成立するので初心者向けの狙い目です。` });
    const pairs = c.filter((n) => n >= 2).length;
    if (menzen && pairs >= 4) out.push({ pri: 6, n: '七対子', t: `対子が<b>${pairs}組</b>。あと${Math.max(0, 7 - pairs)}組で七対子(2飜・25符)のテンパイ。同じ牌4枚は2組に数えられません。` });
    for (let s = 0; s < 3; s++) {
      let cnt = 0;
      for (let r = 0; r < 9; r++) cnt += all[s * 9 + r];
      let hon = 0;
      for (let t = 27; t < 34; t++) hon += all[t];
      const sn = ['萬子', '筒子', '索子'][s];
      if (cnt >= total - 2 && total > 8) out.push({ pri: 5, n: '清一色', t: `${sn}が${cnt}枚。<b>清一色(6飜)</b>が狙えます。他の色の牌を切っていきましょう。` });
      else if (cnt + hon >= total - 3 && cnt >= 6 && hon > 0) out.push({ pri: 5, n: '混一色', t: `${sn}と字牌で<b>${cnt + hon}枚</b>。<b>混一色(門前3飜/鳴き2飜)</b>が狙えます。字牌のポンで進めやすい。` });
    }
    // 三色・一気通貫
    for (let r = 0; r < 7; r++) {
      let have = 0;
      for (let s = 0; s < 3; s++) {
        let k = 0;
        for (let d = 0; d < 3; d++) if (c[s * 9 + r + d] > 0) k++;
        if (k >= 2) have++;
      }
      if (have === 3) { out.push({ pri: 4, n: '三色同順', t: `${r + 1}-${r + 2}-${r + 3}の順子が3色そろいそう。<b>三色同順(2飜)</b>の可能性。` }); break; }
    }
    for (let s = 0; s < 3; s++) {
      const grp = [0, 3, 6].map((o) => [0, 1, 2].reduce((a, d) => a + (c[s * 9 + o + d] > 0 ? 1 : 0), 0));
      if (grp.every((x) => x >= 2)) { out.push({ pri: 4, n: '一気通貫', t: `${['萬子', '筒子', '索子'][s]}で123・456・789がそろいそう。<b>一気通貫(2飜)</b>の可能性。` }); break; }
    }
    const trip = c.filter((n) => n >= 3).length + p.melds.filter((m) => m.kind !== 'chi').length;
    if (trip + pairs >= 4 && trip >= 2) out.push({ pri: 4, n: '対々和', t: '刻子・対子が多い手。ポンで進めて<b>対々和(2飜)</b>が狙えます。' });
    if (menzen) {
      // 一盃口: 同じ順子を2組
      for (let t = 0; t < 27; t++) if (t % 9 <= 6 && c[t] >= 2 && c[t + 1] >= 2 && c[t + 2] >= 2) { out.push({ pri: 5, n: '一盃口', t: `${ic(t)}${ic(t + 1)}${ic(t + 2)}が2組。門前でテンパイすれば<b>一盃口(1飜)</b>がつきます(鳴くと消えるので門前で進める)。` }); break; }
      // 平和: 刻子がなく、字牌も少なく、順子とターツ中心
      let trips = 0, honorsN = 0;
      for (let t = 0; t < 34; t++) { if (c[t] >= 3) trips++; if (t >= 27) honorsN += c[t]; }
      const yakuhaiPair = [27, 28, 29, 30, 31, 32, 33].some((t) => c[t] === 2 && A.isYakuhaiFor(game, p, t));
      if (!trips && honorsN <= 2 && !yakuhaiPair && !(pairs >= 5)) out.push({ pri: 2, n: '平和', t: '刻子がなく、順子とターツ(連続や飛び石の2枚)が中心の手です。役牌でない雀頭と<b>両面待ち</b>でテンパイすれば<b>平和(1飜)</b>(リーチと重ねやすい)。' });
    }
    if (menzen) out.push({ pri: 1, n: 'リーチ', t: '門前(鳴かない)でテンパイすれば<b>リーチ(1飜)</b>。役が無くてもリーチなら上がれる、いちばん基本の役です。' });
    const d = dorasInHand(game, p);
    if (d) out.push({ pri: 3, n: 'ドラ', t: `ドラ/赤ドラが<b>${d}枚</b>。1枚ごとに+1飜(ただし役がないと上がれません)。` });
    out.sort((a, b) => b.pri - a.pri);
    return out;
  };

  /* ---------- 手の価値 ---------- */
  function valueText(game, p, c13, f) {
    const info = A.tenpaiValue(game, p, c13, f, false);
    if (!info) return null;
    const dealer = p.seat === game.dealer;
    const line = (flag) => {
      const inf = A.tenpaiValue(game, p, c13, f, flag);
      if (!inf || !inf.best) return null;
      const r = inf.best.res;
      const ron = MJ.payments(r, dealer, false, 0).ron;
      return { r, ron, left: inf.left, inf };
    };
    return { dama: line(false), riichi: game.menzen(p) ? line(true) : null, info };
  }

  const waitKind = (an, c13, f) => {
    const ws = MJ.waits(c13, f);
    return ws;
  };

  /* 「丸暗記したい7つの形」: 手牌の中の形に名前を付けて、残す/切るの理由を説明する(入門・中級) */
  function formsCard(game, p, an, best, eff, recId) {
    const F = MJ.Forms;
    if (!F || !best) return null;
    const found = F.detect(an.c).slice(0, 3);
    const recT = recId ? (p.hand.find((h) => h.id === recId) || {}).t : best.t;
    const c13 = an.c.slice();
    if (recT != null) c13[recT]--;
    const items = [];
    for (const d of found) {
      const info = F.byId(d.id);
      let act;
      if (d.id === 'sand') act = `真ん中の${ic(d.cut)}${tn(d.cut)}を切る形です${recT === d.cut ? '(★の判断と同じ)' : ''}。`;
      else if (d.id === 'three') {
        const cand = [...new Set(d.tiles)].map((t) => eff.find((e) => e.t === t)).filter(Boolean).sort((a, b) => A.effScore(b) - A.effScore(a))[0];
        act = cand ? `1枚切って3枚にします。受け入れが多くなるのは${ic(cand.t)}${tn(cand.t)}を切る形です${recT === cand.t ? '(★の判断と同じ)' : ''}。` : '1枚切って3枚にします。';
      } else act = 'この形は<b>崩さず残す</b>のが基本です。';
      items.push(`<li><b>${info.name}</b> ${F.iconsOf(d.tiles)}<br>${info.one}${act}<div class="cc-s">${info.why}</div></li>`);
    }
    if (an.minSh <= 1 && p.melds.length === 0 && recT != null && F.isKanzen(c13)) {
      const info = F.byId('kanzen');
      items.push(`<li><b>${info.name}</b>(★を切ったあと)<br>${info.one}<div class="cc-s">${info.why}</div></li>`);
    }
    if (!items.length) return null;
    return card('🧩 手牌の中の「形の名前」', `<ul class="cc-ul">${items.join('')}</ul><div class="cc-s">形を名前で覚えると、迷ったときの判断が速くなります(麻雀ノート「丸暗記したい7つの形」)。</div>`);
  }

  /* ---------- 自分の手番のアドバイス ---------- */
  C.selfAdvice = function (game, p, opts, st) {
    const mode = game.mode;
    const an = A.analyze(game, p, { know: 2, deep: true, deepN: 6, budget: 250 });
    const marks = {};
    const cards = [];
    const eff = A.byEff(an.evals);
    let best = eff[0];
    // 先生のおすすめは、リーチをかけた人がいるとき、強いCPUと同じ読み(降りる・回す・押す)で選ぶ
    if (an.opps.length && an.evals.length && (mode === 'free' || mode === 'beginner')) {
      const minSh = an.minSh;
      let fold = false;
      if (minSh >= 2) fold = true;
      if (minSh === 1 && an.opps.length >= 2) fold = true;
      const kk = minSh === 0 ? 0.35 : 1;
      let top = null, ts = -1e9;
      for (const e of an.evals) {
        const dn = e.danger ? e.danger.score : 0;
        const s = fold ? -dn * 10 - e.sh * 3 + e.ukeire.n * 0.2 : -e.sh * 100 + (e.eff2 !== undefined ? (e.ukeire.n + e.eff2) * 0.75 : e.ukeire.n) * 1.5 + e.adj - dn * 1.6 * kk * 1.5;
        if (s > ts) { ts = s; top = e; }
      }
      if (top) best = top;
    }
    let recId = best ? best.tile.id : null;

    // ツモ・役なし
    if (opts.tsumo) {
      cards.push(card('🎉 ツモ和了!', `完成形です。<b>「ツモ」</b>ボタンで上がれます。役: ${opts.tsumo.yaku.map((y) => `${y.n}(${y.h})`).join('、')}${mode !== 'free' ? '<br>上がった後に点数計算を丁寧に解説します。' : ''}`, 'good'));
      return { html: cards.join(''), marks, recId: null, info: {}, summary: '🎉 ツモ和了できます!' };
    }
    if (opts.tsumoNoYaku) cards.push(card('⚠ 形はできているのに…', '手牌は完成形ですが<b>役がありません</b>。麻雀は「役」が1つ以上ないと上がれません。リーチ(門前の場合)・役牌・タンヤオなど、役を付けてから上がりましょう。', 'warn'));

    // 鳴き後
    if (st.afterCall) {
      cards.push(card('鳴いた後の打牌', `鳴いたあとは手牌から<b>1枚切る</b>だけです。★の牌がおすすめ。<br>※<b>食い替え禁止</b>: 鳴いた牌と同じ牌(チーなら反対側の端の牌も)は切れません(暗くなっている牌)。`));
    }

    // ---- モード別 ----
    const shText = () => {
      const sd = MJ.shantenDetail(an.c, an.f);
      let t = an.minSh === 0 ? '<b>テンパイ</b>(あと1枚で上がり)の形です。' : `<b>${an.minSh}シャンテン</b>。テンパイまであと${an.minSh}歩です。`;
      if (an.f === 0 && sd.chiitoi < sd.std && sd.chiitoi <= an.minSh + 1) t += `<br>(七対子なら${sd.chiitoi}シャンテン)`;
      return t + '<div class="cc-s">シャンテン数=テンパイまでに必要な「あと何歩」。0がテンパイ、小さいほど上がりに近い。</div>';
    };

    const bestCard = () => {
      if (!best) return '';
      const top = eff.slice(0, 3).map((e, i) => `<li>${i === 0 ? '★' : ''}${ic(e.t)} ${tn(e.t)} → ${e.sh === an.minSh ? `有効牌 ${e.ukeire.n}枚` : `シャンテンが戻る(${e.sh}シャンテン)`}</li>`).join('');
      return card('★ おすすめの捨て牌', `<b>${ic(best.t)} ${tn(best.t)}</b> を切る。<br>${reasonFor(game, p, an, best)}。<ul class="cc-ul">${top}</ul><div class="cc-s">「有効牌」=引くとシャンテンが進む牌の残り枚数。多いほど手が進みやすい。</div>`, 'rec') + whyCard(game, p, an, best, eff);
    };

    const defenseWarn = () => {
      if (!an.opps.length) return null;
      const names = an.opps.map((q) => q.name).join('・');
      const safe = A.bySafety(an.evals)[0];
      let body = `<b>${names}</b>がリーチ中です。放銃(ロンされること)に注意。<br>`;
      if (best.danger && best.danger.score >= 8) body += `おすすめの${ic(best.t)}は<b>${best.danger.tag}</b>で危険度が高め(約${Math.round(best.danger.score)}%)。<br>`;
      body += `いちばん安全なのは<b>${ic(safe.t)} ${tn(safe.t)}</b>(${safe.danger.tag})。<br><span class="cc-s">${safe.danger.why}</span>`;
      return card('🛡 リーチへの警戒', body, best.danger && best.danger.score >= 8 ? 'warn' : '');
    };

    const riichiCard = () => {
      if (!opts.riichi.length) return null;
      const info = (() => {
        const bestR = eff.find((e) => opts.riichi.includes(e.t));
        if (!bestR) return null;
        const c13 = an.c.slice(); c13[bestR.t]--;
        return { e: bestR, v: valueText(game, p, c13, an.f), c13 };
      })();
      if (!info) return null;
      let body = `テンパイです! 門前なので<b>リーチ</b>できます。リーチする牌を選んで「リーチ」を押します(切れる牌は明るく表示)。`;
      if (info.v) {
        const w = info.v.info.waits;
        body += `<br>待ち: ${w.map((x) => `${ic(x.t)}(残${x.left})`).join(' ')}`;
        if (info.v.dama) body += `<br>ダマ(リーチなし)でも<b>役あり</b>: ${info.v.dama.r.han}飜${info.v.dama.r.fu}符 ≒ ${info.v.dama.ron}点`;
        else body += '<br>今は<b>役がない</b>ので、ダマテンだとロン上がりできません(ツモは可)。リーチをかけて役をつけるのが基本です。';
        if (info.v.riichi) body += `<br>リーチすると: ${info.v.riichi.r.han}飜${info.v.riichi.r.fu}符 ≒ ${info.v.riichi.ron}点(裏ドラ・一発は別)`;
      }
      body += '<div class="cc-s">リーチ: 1000点を払い、以後は手牌を変えられない(上がり牌以外はツモ切り)。代わりに1飜+一発・裏ドラのチャンス。</div>';
      return card('リーチのチャンス', body, 'good');
    };

    if (mode === 'beginner' || mode === 'free') {
      cards.push(card('いまの手牌', shText()));
      cards.push(bestCard());
      const rc = riichiCard();
      if (rc) cards.push(rc);
      {
        const hints = C.yakuHints(game, p).filter((h) => h.n !== 'ドラ').slice(0, 2);
        const body = hints.length ? ul(hints.map((h) => `<b>${h.n}</b>: ${h.t.split('。')[0]}。`)) : '<b>まだ決まっていません。</b>迷ったら<b>タンヤオ</b>(2〜8だけで作る)か<b>役牌</b>(白・發・中)のポンが作りやすい役です。';
        cards.push(card('🎯 目指す役', `${body}`));
      }
      const dw = defenseWarn();
      if (dw) cards.push(dw);
      else if (mode === 'beginner') cards.push(card('ロンされないために', '今はリーチ者がいません。ただし<b>捨てる牌が他の人の待ちかも</b>と意識する習慣を。数牌の真ん中(4・5・6)や、ドラ・役牌のダブりは特に狙われやすい牌です。'));
    } else if (mode === 'defense') {
      cards.push(...defenseCards(game, p, an, opts, marks, best, eff));
      const rc = riichiCard();
      if (rc) cards.push(rc);
      recId = an.opps.length ? A.bySafety(an.evals)[0].tile.id : (best ? best.tile.id : null);
    } else if (mode === 'inter') {
      cards.push(...interCards(game, p, an, opts, best, eff, valueText, riichiCard, defenseWarn));
    }

    // リーチ者がいて、手が遠い/危険な牌しか効率に合わない場合は、★を安全牌(オリ)に切り替える(★と助言が食い違わないように)
    if (mode !== 'defense' && an.opps.length && best && best.danger && an.minSh > 0) {
      const safe = A.bySafety(an.evals)[0];
      const dn = best.danger.score;
      const fold = safe && safe.t !== best.t && dn >= 8 && (an.minSh >= 2 || dorasInHand(game, p) < 2);
      if (fold) {
        recId = safe.tile.id;
        const names = an.opps.map((q) => q.name).join('・');
        const fcard = card('★ 今はオリ(安全牌)がおすすめ', `<b>${names}</b>がリーチ中で、手は${an.minSh}シャンテン。効率なら${ic(best.t)}ですが<b>${best.danger.tag}</b>(放銃の危険 約${Math.round(dn)}%)。<br>★は<b>${ic(safe.t)} ${tn(safe.t)}</b>(${safe.danger.tag}・約${Math.round(safe.danger.score)}%)にしました。<br><span class="cc-s">${safe.danger.why}</span>`, 'rec');
        cards.unshift(fcard);
        for (let i = 1; i < cards.length; i++) if (typeof cards[i] === 'string') cards[i] = cards[i].replace('★ おすすめの捨て牌', '参考: 効率だけで選ぶなら').replace('★ 効率のおすすめ', '参考: 効率だけで選ぶなら');
      }
    }

    // フリテン警告
    if (an.minSh === 0 && mode !== 'defense' && best) {
      const bt = eff.find((e) => e.sh === 0);
      if (bt) {
        const c13 = an.c.slice(); c13[bt.t]--;
        const ws = MJ.waits(c13, an.f);
        const fw = ws.filter((w) => p.discardTypes.has(w) || w === bt.t);
        if (fw.length) cards.push(card('🚫 フリテンに注意', `${ic(bt.t)}を切ってテンパイした場合の待ち ${icons(ws)} のうち、${icons(fw)}は<b>自分が捨てた(または今捨てる)牌</b>です。待ちの中に自分の捨て牌があると<b>フリテン</b>になり、<b>ロン上がりできません</b>(ツモ上がりのみ)。${fw.length === ws.length ? 'すべての待ちがフリテンです。切る牌を変えられないか考えてみましょう。' : ''}`, 'warn'));
      }
    }
    // 共通マーク
    if (mode === 'defense') { /* defenseCardsで設定 */ }
    else if (mode === 'inter' || mode === 'beginner' || mode === 'free') {
      if (an.opps.length) for (const e of an.evals) for (const h of p.hand) if (h.t === e.t) marks[h.id] = { txt: sh(e.danger.tag), cls: e.danger.cls };
    }
    if (opts.riichi.length) for (const h of p.hand) if (opts.riichi.includes(h.t)) marks[h.id] = Object.assign({}, marks[h.id], { riichi: true });
    const info = {}, infoLong = {};
    for (const e of an.evals) {
      const txt = `<b>${ic(e.t)} ${tn(e.t)}</b> を切ると: ${e.sh === an.minSh ? '<span class="good">シャンテン維持</span>' : '<span class="bad">シャンテンが戻る</span>'}(${e.sh === 0 ? 'テンパイ' : e.sh + 'シャンテン'}) / 有効牌 ${e.ukeire.n}枚${e.danger ? `<br>危険度: <b>${e.danger.tag}</b>(約${Math.round(e.danger.score)}%) ${e.danger.why}` : e.genCount ? `<br>${e.genCount}人の現物` : ''}`;
      const cmp = best && e !== best && recId === best.tile.id && !an.opps.length ? diffWhy(game, p, an, best, e) : [];
      const txt2 = cmp.length ? `${txt}<br><span class="cmp">★${tn(best.t)}ではなくこちらを切らない理由: ${cmp.slice(0, 2).join('。')}</span>` : txt;
      const txtS = cmp.length ? `${txt}<br><span class="cmp">★${tn(best.t)}との差: ${diffShort(game, p, an, best, e)}</span>` : txt;
      for (const h of p.hand) if (h.t === e.t) { info[h.id] = txtS; infoLong[h.id] = txt2; }
    }
    let summary = '';
    const rec = recId ? p.hand.find((h) => h.id === recId) : null;
    if (rec) {
      const re = an.evals.find((x) => x.t === rec.t);
      summary = `${an.minSh === 0 ? 'テンパイ' : an.minSh + 'シャンテン'} ★${tn(rec.t)}を切る`;
      if (an.opps.length && re && re.danger) summary += `(${re.danger.tag})`;
      const sf = an.opps.length ? A.bySafety(an.evals)[0] : null;
      if (sf && sf.t !== rec.t) summary += ` / 🛡安全:${tn(sf.t)}(${sf.danger.tag})`;
    }
    if (opts.riichi.length) summary = '✨リーチできます! ' + summary;
    if ((mode === 'beginner' || mode === 'inter') && !opts.tsumo) {
      const fc = formsCard(game, p, an, best, eff, recId);
      if (fc) cards.push(fc);
    }
    return { html: cards.filter(Boolean).join(''), marks, recId, info, infoLong, summary };
  };

  /* ---------- 守備モード ---------- */
  function defenseCards(game, p, an, opts, marks, best, eff) {
    const cards = [];
    const safe = A.bySafety(an.evals);
    if (an.opps.length) {
      for (const e of an.evals) for (const h of p.hand) if (h.t === e.t) marks[h.id] = { txt: sh(e.danger.tag), cls: e.danger.cls };
      const names = an.opps.map((q) => q.name).join('・');
      cards.push(card('🚨 リーチ者の捨て牌(=現物)', an.opps.map((q) => `<b>${q.name}</b>: ${icons([...A.safeSet(game, q)].sort((a, b) => a - b), 14) || 'なし'}`).join('<br>') + '<div class="cc-s">これらの牌は、その相手には絶対に当たりません。</div>'));
      const rank = safe.slice(0, 4).map((e, i) => `<li>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''}${ic(e.t)} <b>${tn(e.t)}</b> … ${e.danger.tag}(危険度 約${Math.round(e.danger.score)}%)</li>`).join('');
      cards.push(card('🛡 安全な牌ランキング', `<ul class="cc-ul">${rank}</ul><div class="cc-s">${safe[0].danger.why}</div>`, 'rec'));
      let adv;
      if (an.minSh === 0) adv = `テンパイしています。<b>押して勝負</b>する価値があります。ただし最後の最後まで当たり牌は避けましょう。おすすめ打牌は ${ic(best.t)}(${best.danger.tag})。`;
      else if (an.minSh === 1) adv = `1シャンテン。${best.danger.score >= 8 ? `おすすめの${ic(best.t)}は<b>${best.danger.tag}</b>で危険。安い手ならここは安全牌を切って<b>回す(まわす)</b>のが無難です。` : `おすすめの${ic(best.t)}は${best.danger.tag}で比較的安全。攻めても大丈夫そうです。`}`;
      else adv = `${an.minSh}シャンテンで遠い手です。リーチ者に向かうのは損。<b>オリ(降り)</b>て、安全牌(現物)を切りましょう。`;
      cards.push(card('⚖ 押す?それとも引く?', adv));
      // 状況に応じた講義
      const tags = new Set(an.evals.map((e) => e.danger.tag));
      const lesson = ['現物', 'スジ', 'カベ', 'ワンチャンス', '字牌', '無スジ', '半スジ'].filter((k) => [...tags].some((t) => t === k || t.startsWith(k) || (k === 'カベ' && t.includes('カベ')) || (k === '字牌' && t.startsWith('字牌')) || (k === 'スジ' && t === 'スジ・カベ')));
      if (lesson.length) {
        const pickLesson = lesson[(game.handCount + game.seq) % lesson.length];
        cards.push(card(`📘 いまの手牌で学ぶ: ${pickLesson}`, TAG_HELP[pickLesson]));
      }
      const ex = safe.find((e) => e.danger.tag === 'スジ' || e.danger.tag === 'スジ・カベ');
      if (ex) cards.push(card('スジの実例', `${ic(ex.t)}${tn(ex.t)}は、${ex.danger.why}`));
    } else {
      // リーチ無し
      for (const e of an.evals) for (const h of p.hand) if (h.t === e.t) {
        marks[h.id] = e.genCount === 3 ? { txt: "全現", cls: 'safe' } : e.genCount > 0 ? { txt: `現${e.genCount}`, cls: 'ok' } : { txt: '', cls: '' };
      }
      const gens = an.evals.filter((e) => e.genCount === 3).map((e) => e.t);
      cards.push(card('🛡 いまはリーチなし', `まだ誰もリーチしていません。基本は<b>牌効率</b>で攻めてOK。ただし、あとでリーチが入ったときのために<b>安全牌を1〜2枚キープ</b>しておくのがコツです。<br>全員の現物(最も安全)の牌: ${gens.length ? icons(gens) : 'なし'}<div class="cc-s">手牌の上のマークは「何人の現物か」。×3なら誰にでも通る牌です。</div>`));
      cards.push(bestCardLite(game, p, an, best, eff));
      const ks = Object.keys(TAG_HELP);
      const k = ks[(game.handCount * 2 + (game.seq >> 3)) % ks.length];
      cards.push(card(`📘 守備のコツ: ${k}`, TAG_HELP[k]));
      // 河のスジ観察
      const o = an.others.find((q) => [...q.discardTypes].some((t) => t < 27 && t % 9 >= 3 && t % 9 <= 5));
      if (o) {
        const t = [...o.discardTypes].find((x) => x < 27 && x % 9 >= 3 && x % 9 <= 5);
        const lo = t - 3, hi = t + 3;
        cards.push(card('🔍 河を観察しよう', `${o.name}が${ic(t)}${tn(t)}を捨てています。もし${o.name}がリーチしたら、<b>${ic(lo)}${tn(lo)}</b>と${t % 9 + 3 <= 8 ? `<b>${ic(hi)}${tn(hi)}</b>` : ''}は<b>スジ</b>になります(中スジの4・5・6は両側が必要)。`));
      }
    }
    return cards;
  }
  function bestCardLite(game, p, an, best, eff) {
    return card('★ 効率のおすすめ', `${ic(best.t)} <b>${tn(best.t)}</b> を切る(${best.sh === 0 ? 'テンパイ' : best.sh + 'シャンテン'} / 有効牌${best.ukeire.n}枚)。<br>${reasonFor(game, p, an, best)}。`, 'rec') + whyCard(game, p, an, best, eff);
  }

  /* ---------- 中級モード ---------- */
  function interCards(game, p, an, opts, best, eff, valueText, riichiCard, defenseWarn) {
    const cards = [];
    const dealer = p.seat === game.dealer;
    const dora = dorasInHand(game, p);
    // 状況
    const sorted = game.players.slice().sort((a, b) => b.score - a.score);
    const rank = sorted.indexOf(p) + 1;
    const top = sorted[0];
    let sit = `現在<b>${rank}位</b>(${p.score}点)。`;
    if (rank > 1) sit += `トップの${top.name}と${top.score - p.score}点差。`;
    sit += dealer ? '親番なので、連荘のためにも積極的に。' : '子番です。親に高い手を打たないよう注意。';
    if (game.length === 'east' && game.kyoku === 3) sit += '<br><b>オーラス(最終局)</b>。順位が上がらない上がりは意味が薄い、逆に今の順位を守る打ち方も大切。';
    cards.push(card('📊 状況', sit));

    // 押し引き
    let go;
    if (an.opps.length) {
      const dn = best.danger.score;
      if (an.minSh === 0) go = `<b>テンパイ → 基本は押し</b>。待ちが悪い/安い手なら、危険度が高い牌(${Math.round(dn)}%)は無理せず現物に逃げる手もあります。`;
      else if (an.minSh === 1 && dn < 8) go = '1シャンテンで、切る牌も比較的安全。<b>押してOK</b>。';
      else if (an.minSh === 1) go = `1シャンテンだけど切る牌の危険度が高い(約${Math.round(dn)}%)。<b>手が安いなら回し打ち/オリ</b>。ドラ・役牌が多く高い手なら押す価値あり。`;
      else go = `${an.minSh}シャンテンで遠い。<b>オリ推奨</b>。放銃(約5,200点前後の失点)より、1局の失点を小さく抑える方が得です。`;
    } else go = an.minSh <= 1 ? 'リーチ者はいません。<b>速度重視</b>で一直線に進めましょう。' : '誰も攻めてきていません。<b>牌効率</b>(受け入れ最大)で進めればOK。';
    cards.push(card('⚖ 押し引き判断', go + '<div class="cc-s">目安: 「テンパイ or 高打点なら押す/2シャンテン以下の安手はオリ」。自分が親、または相手が子なら押しやすい。</div>', an.opps.length ? 'warn' : ''));

    // 打点
    const rc = riichiCard();
    if (an.minSh === 0) {
      const bestT = eff.find((e) => e.sh === 0);
      const c13 = an.c.slice(); c13[bestT.t]--;
      const v = valueText(game, p, c13, an.f);
      const ws = MJ.waits(c13, an.f);
      let left = 0;
      for (const w of ws) left += Math.max(0, 4 - an.vis[w]);
      let wq = left >= 6 ? '良形(残りが多い)' : left >= 3 ? '普通' : '<b>悪形</b>(残りが少ない)';
      cards.push(card('🎯 テンパイ時の打点と待ち', `${ic(bestT.t)}を切ると待ちは ${icons(ws)}(残り<b>${left}枚</b> → ${wq})。${v && v.dama ? `<br>ダマで ${v.dama.r.han}飜${v.dama.r.fu}符 ≒ <b>${v.dama.ron}点</b>(${v.dama.r.yaku.map((y) => y.n).join('・')})` : '<br>いまは<b>役なし</b>。リーチでしかロンできません。'}${v && v.riichi ? `<br>リーチなら ${v.riichi.r.han}飜${v.riichi.r.fu}符 ≒ <b>${v.riichi.ron}点</b>` : ''}<div class="cc-s">コツ: 待ちが多くて役がある手は「ダマ」で警戒されず上がれる。待ちが悪い・役なしなら「リーチ」で打点を上げる。</div>`, 'rec'));
    } else {
      const hints = C.yakuHints(game, p).filter((h) => h.pri >= 3).slice(0, 3);
      cards.push(card('🎯 打点を意識する', `ドラ(赤含む)は<b>${dora}枚</b>。${hints.length ? ul(hints.map((h) => `<b>${h.n}</b>: ${h.t}`)) : '役が決まっていません。役牌・タンヤオ・リーチのどれで上がるか早めに決めましょう。'}<div class="cc-s">1飜上がると約2倍(例: 30符 2飜2000点 → 3飜3900点)。ドラは手の価値を上げるので、安易に切らない。</div>`));
    }
    if (rc) cards.push(rc);
    cards.push(bestCardLite(game, p, an, best, eff));
    if (an.opps.length) { const dw = defenseWarn(); if (dw) cards.push(dw); }
    const tipsI = [
      '【ドラ】ドラ表示牌の「次の牌」がドラ。表示牌が4萬ならドラは5萬。',
      '【受け入れ】迷ったら「有効牌が多くなる方」を残す。両面(23や45)の方がカンチャン(24)より受け入れが多い。',
      '【ブロック】4面子1雀頭が理想。面子候補(ターツ)は5ブロックまで持ち、多すぎたら弱い形から外す。',
      '【ダブ東・ダブ南】自風と場風が重なる牌は2飜。ポンできるチャンスは逃さない。',
      '【親番】親は点数が1.5倍。連荘で稼げるので、親番の上がりは価値が大きい。',
      '【ベタオリ】リーチに対して無理は禁物。放銃は大きな失点。手が遠いと感じたら早めに安全牌へ。',
    ];
    cards.push(card('💡 中級のコツ', tipsI[(game.handCount + game.seq) % tipsI.length]));
    return cards;
  }

  /* ---------- 鳴き・ロン時のアドバイス ---------- */
  /* 先生の「目指す手」: いまの手牌から、狙えそうな役を1つ、短く教える。なければ null */
  C.aimHint = function (game, p) {
    const hs = C.yakuHints(game, p).filter((h) => h.pri >= 4 && h.pri < 9);
    if (!hs.length) return null;
    const h = hs[0];
    const plain = h.t.replace(/<[^>]+>/g, '');
    const first = plain.split(/[。]/)[0];
    return { name: h.n, text: `${h.n}を目指そう!${first.length > 14 ? first.slice(0, 14) + '…' : first}` };
  };
  C.reactAdvice = function (game, p, o) {
    const t = o.tile.t;
    const cards = [];
    const mode = game.mode;
    if (o.ron) {
      const r = o.ron;
      cards.push(card('🎉 ロンできます!', `${ic(t)}で和了。役: ${r.yaku.map((y) => `${y.n}(${y.h}飜)`).join('、')}<br>${r.han}飜${r.fu}符 ≒ <b>${MJ.payments(r, p.seat === game.dealer, false, 0).ron}点</b>`, 'good'));
    }
    if (o.ronBlock === 'furiten') cards.push(card('🚫 フリテン', `この${ic(t)}で完成形ですが、<b>フリテン</b>(自分の待ち牌を過去に捨てている)のため<b>ロンできません</b>。ツモ上がりのみ可能です。<div class="cc-s">フリテンの待ち: 自分が過去に切った牌が待ちに含まれると、ロンはできない(ツモはOK)。同巡内で見逃した場合も一時的にフリテン。</div>`, 'warn'));
    if (o.ronBlock === 'noyaku') cards.push(card('🚫 役がありません', `この${ic(t)}で形は完成しますが、<b>役が1つもない</b>のでロンできません。次はリーチをかける/役牌を揃えるなど、役を作りましょう。`, 'warn'));
    const an = A.analyze(game, p, { know: 2 });
    const ev = (kind, use) => A.callEval(game, p, kind, t, use);
    const verdict = (e, kind) => {
      const lines = [];
      lines.push(`シャンテン: ${e.before} → <b>${e.after}</b>${e.after < e.before ? '(1歩前進!)' : '(進まない)'}`);
      lines.push(e.yaku.ok ? `<span class="good">役: ${e.yaku.why}</span>` : `<span class="bad">${e.yaku.why}</span>`);
      if (e.menzen) lines.push('鳴くと<b>門前</b>でなくなり、リーチ・ピンフ・メンゼンツモ・一盃口が使えなくなります。点数が下がり、守りも弱くなります。');
      let rec;
      if (!e.yaku.ok) rec = '見送り(ノー)がおすすめ';
      else if (e.after < e.before) rec = e.before === 0 ? 'すでにテンパイなので見送りがおすすめ' : '鳴いてOK(スピードアップ)';
      else rec = '進まないので見送りがおすすめ';
      return `<ul class="cc-ul">${lines.map((x) => `<li>${x}</li>`).join('')}</ul><b>→ ${rec}</b>`;
    };
    if (o.pon) cards.push(card(`ポン(${ic(t)}${ic(t)}${ic(t)})`, verdict(ev('pon'), 'pon') + '<div class="cc-s">ポン=同じ牌3枚の刻子を、他家の捨て牌をもらって作る。順番が飛びます。</div>', 'rec'));
    for (const c of o.chi) cards.push(card(`チー(${ic(c.use[0])}${ic(c.use[1])} + ${ic(t)})`, verdict(ev('chi', c.use), 'chi') + '<div class="cc-s">チー=左隣の人の捨て牌で順子を作る。鳴いた後は食い替え禁止の牌が切れません。</div>'));
    if (o.kan) cards.push(card('カン(大明槓)', '同じ牌4枚で槓子にする。<b>ドラが増える</b>が、相手のドラも増える・手牌が減る・失敗しやすい。初心者は基本的に<b>おすすめしません</b>。(嶺上牌を1枚引いて、そのあと切ります)'));
    if (mode === 'defense' && an.opps.length) cards.push(card('🛡 守備の目線', '鳴くと手牌が減り、安全牌を持ちにくくなります。リーチ者がいる時の鳴きは、テンパイに直結する時だけにしましょう。'));
    return cards.join('');
  };

  /* 鳴きの確認用の、短いアドバイス(先生のひとこと)。rec: 'call'=鳴いてOK / 'pass'=見送り */
  C.reactBrief = function (game, p, o) {
    const t = o.tile.t;
    if (o.ron) return { rec: 'ron', text: 'ロンできます! 上がりましょう!' };
    const evs = [];
    if (o.pon) evs.push({ kind: 'ポン', e: A.callEval(game, p, 'pon', t) });
    o.chi.forEach((ch, i) => evs.push({ kind: 'チー', idx: i, e: A.callEval(game, p, 'chi', t, ch.use) }));
    if (!evs.length) {
      if (o.kan) return { rec: 'pass', text: 'カンは、おすすめしません。見送りましょう。' };
      return null;
    }
    const before = evs[0].e.before;
    const riichiOthers = game.players.some((q) => q !== p && q.riichi);
    if (before === 0) return { rec: 'pass', text: 'もうテンパイです。鳴かずに、見送りましょう。' };
    // 鳴いたあとに切る牌まで読んで、ほんとうに得かを調べる
    const ok = [];
    let why = null;
    for (const x of evs) {
      const pl = x.e.plan;
      if (!pl) continue;
      if (pl.yaku.level === 'none') { why = why || '役がつかなくなるので、見送りましょう。'; continue; }
      if (pl.furiten) { why = '鳴くとフリテンで、上がれなくなります。見送りましょう。'; continue; }
      // 役牌のポンは、手が同じ速さでも、役が確定する分だけ得(まだ遠い手のとき)
      const yakuhaiOk = x.kind === 'ポン' && pl.yaku.level === 'sure' && pl.sh <= before && before >= 2;
      if (pl.sh >= before && !yakuhaiOk) { why = why || '鳴いても、手が進みません。見送りましょう。'; continue; }
      if (riichiOthers && before >= 2) { why = 'リーチの人がいます。鳴いて進めるより、安全に打ちましょう。'; continue; }
      // 1シャンテンの形なら、鳴かずにリーチ・高い手を狙う方がよい(役牌の確定やテンパイ直結の鳴きは別)
      const sure = pl.yaku.level === 'sure';
      if (before === 1 && pl.sh > 0 && !(x.kind === 'ポン' && sure)) { why = why || '鳴かなくても、あと少しでテンパイ。メンゼンで進めましょう。'; continue; }
      if (pl.yaku.level === 'maybe' && pl.sh > 0) { why = why || '役がまだ決まっていません。見送りましょう。'; continue; }
      ok.push(x);
    }
    if (ok.length) {
      ok.sort((a, b) => b.e.plan.score - a.e.plan.score);
      const g = ok[0], pl = g.e.plan;
      const state = pl.sh === 0 ? `テンパイ(待ち${pl.wl}枚)` : '手が進みます';
      const kk = g.kind;
      return { rec: 'call', kind: kk, idx: g.idx, text: `${kk}してOK! ${pl.yaku.why.replace('鳴くと役がありません', '')}、${state}。` };
    }
    return { rec: 'pass', text: why || '手が進まないので、見送りましょう。' };
  };

  /* ---------- 局の開始ヒント ---------- */
  const START_TIPS = {
    beginner: [
      '【役づくりの基本】まず「リーチ」「タンヤオ」「役牌」の3つを覚えよう。メンゼン(鳴かない)でテンパイ→リーチが基本形です。',
      '【牌の捨て方】孤立した字牌→端牌(1・9)→数牌の端寄りの順に切るのが基本。真ん中(4〜6)ほど価値が高い。',
      '【ポンとチー】役がつかない鳴きは禁物。役牌のポン・タンヤオを狙った鳴きはOKです。',
      '【ロンされないために】リーチがかかったら「現物」(その人が捨てた牌)を切れば絶対安全です。',
      '【フリテン】自分が捨てた牌に待ちが含まれるとロンできません。待ちと河を確認しよう。',
    ],
    defense: [
      '【現物】リーチした人が過去に切った牌と同じ牌は、その人には100%通ります。',
      '【スジ】4を切った人には1と7が通りやすい。1-4-7 / 2-5-8 / 3-6-9 の「3つ離れ」がスジです。',
      '【カベ】同じ牌が4枚見えたら、その隣の牌は両面待ちに当たりにくい。',
      '【字牌】場に2枚以上出た字牌はかなり安全。最後まで1枚残しておくと守備に使えます。',
      '【回し打ち】リーチに対して、完全に降りなくても「安全な牌を切りながら形を整える」技術が大事。',
    ],
    inter: [
      '【押し引き】テンパイ・高打点は押す、2シャンテン以下の安手は降りる。自分が親なら押し寄り。',
      '【リーチかダマ】待ちが良くて役ありはダマ、悪形や役なしはリーチ。',
      '【点数計算】符×2^(飜+2)が基本点。子のロンは×4、親のロンは×6(100点単位で切り上げ)。',
      '【ドラの価値】ドラ1枚=1飜。手の点数を大きく左右するので、他家のドラ切りにも注目。',
      '【鳴き判断】スピード(シャンテン前進)と打点・守備のバランスで決める。役なし鳴きは厳禁。',
    ],
    free: ['ヒントボタンでいつでもアドバイスを表示できます。まずは自由に打ってみましょう。'],
  };
  C.startTip = (game) => {
    const l = START_TIPS[game.mode] || START_TIPS.free;
    return l[game.handCount % l.length];
  };

  /* ---------- 点数計算の解説 ---------- */
  C.explainScore = function (win, game) {
    const r = win.res;
    const dealer = win.winner.seat === game.dealer;
    const lines = [];
    lines.push(`<b>① 役を数える</b>: ${r.yaku.map((y) => `${y.n}${r.yakuman ? '' : `(${y.h})`}`).join(' + ')}`);
    if (r.yakuman) {
      lines.push(`<b>② 役満</b>: 基本点 8000 ${r.yakuman.length > 1 ? '×' + r.yakuman.length : ''} = <b>${r.basic}</b>`);
    } else {
      lines.push(`<b>② 飜数</b>: 合計 <b>${r.han}飜</b>${r.limit ? `(${r.limit})` : ''}`);
      if (r.fuDetails.length) lines.push(`<b>③ 符を数える</b>: ${r.fuDetails.map(([n, v]) => `${n} ${v}`).join(' / ')} → 切り上げて <b>${r.fu}符</b>`);
      if (r.han >= 5) lines.push(`<b>④ 満貫以上</b>は符に関係なく固定: <b>基本点 ${r.basic}</b>(5飜=満貫2000、6-7飜=跳満3000、8-10飜=倍満4000、11-12飜=三倍満6000、13飜〜=役満8000)`);
      else lines.push(`<b>④ 基本点</b> = 符 × 2<sup>(飜+2)</sup> = ${r.fu} × ${Math.pow(2, r.han + 2)} = ${r.fu * Math.pow(2, r.han + 2)}${r.fu * Math.pow(2, r.han + 2) > 2000 ? ' → 満貫(2000)で頭打ち' : ''} → <b>${r.basic}</b>`);
    }
    const p = win.pay;
    const hon = win.honba ? `+本場${win.honba}×(ロン300/ツモ各100)` : '';
    if (!win.tsumo) lines.push(`<b>⑤ 支払い</b>: ${dealer ? '親のロン' : '子のロン'}=基本点×${dealer ? 6 : 4} = ${r.basic * (dealer ? 6 : 4)} → 100点単位で切り上げ ${hon} = <b>${p.ron}点</b>`);
    else if (dealer) lines.push(`<b>⑤ 支払い</b>: 親のツモ=子3人が基本点×2 ずつ = <b>${p.each}点オール</b>(100点単位切り上げ${hon ? '・' + hon : ''})`);
    else lines.push(`<b>⑤ 支払い</b>: 子のツモ=親が基本点×2 (<b>${p.fromDealer}点</b>)、子が基本点×1 (<b>${p.fromOther}点</b>)(100点単位切り上げ${hon ? '・' + hon : ''})`);
    return lines;
  };

  C.reviewText = function (review) {
    if (!review) return '';
    const sf = review.safer.length ? `手牌には<b>${review.safer.map((s) => `${ic(s.t)}${tn(s.t)}(${s.tag})`).join('、')}</b>というより安全な牌がありました。` : '';
    return `<div class="cc bad"><div class="cc-h">🔎 放銃の振り返り</div><div class="cc-b">あなたが切った${ic(review.t)}${tn(review.t)}は<b>${review.danger.tag}</b>(危険度 約${Math.round(review.danger.score)}%)でした。${sf}<div class="cc-s">${review.danger.why}</div>リーチ者がいる時は「現物 → スジ → 字牌」の順に安全な牌を探す習慣をつけましょう。</div></div>`;
  };

  /* ---------- 危険度の見える化: 記号(◎○△✕)・星・色 ---------- */
  C.rate = function (score) {
    const sc = score || 0;
    const r = sc <= 1 ? { sym: '◎', cls: 'safe', n: 5 } : sc < 4 ? { sym: '○', cls: 'ok', n: 4 } : sc < 8 ? { sym: '△', cls: 'warn', n: 3 } : sc < 13 ? { sym: '✕', cls: 'danger', n: 2 } : { sym: '✕', cls: 'danger', n: 1 };
    r.stars = '★'.repeat(r.n) + '☆'.repeat(5 - r.n);
    return r;
  };
  /* 自分の切り牌タイムライン。full=false: 対局中に分かる情報(リーチ)だけ / full=true: 振り返り用(ダマテンも含む) */
  C.timeline = function (log, opt = {}) {
    const full = !!opt.full;
    if (!log || !log.length) return '<p class="cc-s">まだ切り牌の記録がありません。</p>';
    let prev = '';
    const cells = log.map((e) => {
      const info = full ? (e.threats && e.threats.length ? { score: e.score, tag: e.tag, names: e.threats.map((x) => `${x.name}${x.riichi ? '(リーチ)' : '(ダマテン)'}`) } : null) : (e.pub ? { score: e.pub.score, tag: e.pub.tag, names: e.pub.opps.map((n) => `${n}(リーチ)`) } : null);
      const key = info ? info.names.join('、') : '';
      let mark = '';
      if (key !== prev) { mark = key ? `<div class="tl-mark">▶ ${key}</div>` : '<div class="tl-mark off">▶ 脅威なし</div>'; prev = key; }
      const r = info ? C.rate(info.score) : null;
      return `${mark}<div class="tl-c${r ? ' tl-' + r.cls : ''}${opt.lastHit && e === log[log.length - 1] ? ' tl-hit' : ''}"><div class="tl-n">${e.turn}</div>${ic(e.t)}<div class="tl-s">${r ? r.sym : '—'}</div><div class="tl-st">${r ? r.stars : ''}</div><div class="tl-t">${r ? info.tag.replace(/\(.*\)/, '') : '安全圏'}</div>${e.worse ? '<div class="tl-w" title="この牌で手が後退">↓</div>' : ''}</div>`;
    }).join('');
    return `<div class="tl">${cells}</div><div class="tl-legend">◎=ほぼ安全 ○=比較的安全 △=注意 ✕=危険 ／ ★が多いほど安全 ／ ↓=その牌で手が後退</div>`;
  };

  /* ---------- 放銃(ロンされた)の詳しい振り返り ---------- */
  const WAITN = { ryanmen: '両面', kanchan: 'カンチャン(嵌張)', penchan: 'ペンチャン(辺張)', shanpon: 'シャンポン(双碰)', tanki: 'タンキ(単騎)' };
  C.loseReview = function (game, res) {
    const lr = res.loseReview;
    if (!lr) return C.reviewText(res.review);
    const t = lr.t, W = lr.winners[0];
    const many = lr.winners.length > 1 ? `(ほか${lr.winners.length - 1}人も同時にロン)` : '';
    const wn = W.kind === 'chiitoi' ? '七対子のタンキ(単騎)' : W.kind === 'kokushi' || (W.yaku || []).some((y) => /国士/.test(y)) ? '国士無双' : (WAITN[W.wait] || '').replace(/\(.*\)/, '');
    const dg = lr.danger || {};
    const tag = (dg.tag || '').replace(/\(.*\)/, '');
    const sec = [];
    // 1. 何が起きたか
    sec.push(`<div class="rv-h">① 何が起きたか</div><p><b>放銃(ほうじゅう)</b>=あなたが切った牌で、他の人に<b>ロン</b>されること。今回は<b>${W.name}</b>${many}に、あなたが切った${ic(t)}<b>${tn(t)}</b>で上がられました。</p><p>${W.name}は${W.riichi ? '<b>リーチ</b>をかけていて' : '<b>リーチなし(ダマテン=黙ってテンパイ)</b>で'}${W.melds.length ? `、${W.melds.length}回鳴いて(ポン・チー・カン)` : ''}、${wn ? `<b>${wn}</b>待ち` : ''}で${ic(t)}を待っていました。${W.dealer ? '(親だったので点数が1.5倍です)' : ''}</p>`);
    // 2. なぜ当たったか
    const why = [];
    if (dg.tag) why.push(`${W.name}に対する、切る前の危険度: <b>${dg.tag}</b>(約${Math.round(dg.score || 0)}%)。${dg.why || ''}`);
    if (tag === 'スジ' || tag === 'スジ・カベ') {
      if (W.wait && W.wait !== 'ryanmen') why.push(`<b>スジは「両面待ち」にしか効きません。</b>今回は${WAITN[W.wait] || ''}待ちだったので、スジでも当たってしまいました。スジは「安全」ではなく「比較的安全」です。`);
    } else if (/字牌/.test(tag)) {
      why.push('字牌は両面待ちがありませんが、<b>シャンポン・タンキ待ち</b>には当たります。場に出ている枚数が少ない字牌ほど危険です。');
    } else if (/無スジ|半スジ/.test(tag)) {
      why.push('手がかりのない牌(<b>無スジ</b>)でした。特に<b>4・5・6</b>の真ん中の数牌は、両面待ちに一番当たりやすい牌です。');
    }
    if (lr.dora) why.push('<b>ドラ</b>でした。ドラは相手が持っていると高い手になるので、切るときは特に慎重に。');
    else if (lr.red) why.push('<b>赤ドラ</b>でした。持っている人は手が高いので、手放すときは慎重に。');
    if (W.yakuhai) why.push(`${tn(t)}は${W.name}の<b>役牌</b>でした。役牌は持たれていることが多いので、相手が鳴いているときは特に注意。`);
    if (W.melds.length) why.push(`${W.name}は<b>鳴いていました</b>。鳴いた人は手が進んでいるサインです。何を鳴いたか(同じ色ばかり=染め手、役牌)を見て警戒しましょう。`);
    if (!W.riichi && !W.melds.length) why.push('リーチも鳴きもない<b>ダマテン</b>は、外から見えません。河(捨て牌)が急に変わったり、ドラや真ん中の牌が切られなくなったときは要注意です。');
    sec.push(`<div class="rv-h">② なぜ当たったのか</div><ul class="cc-ul">${why.map((x) => `<li>${x}</li>`).join('')}</ul>`);
    // 3. 途中経過(相手がリーチ/ダマテンしていた時期のあなたの切り牌。あとから分かった情報で記録)
    const rel = lr.log.filter((e) => e.threats && e.threats.length).slice(-5);
    if (rel.length) {
      const alt = rel.filter((e) => e.safest && e.safest.t !== e.t && e.score >= 4).slice(-3).map((e) => `${e.turn}回目に${ic(e.t)}${tn(e.t)}を切った場面では、<b>${ic(e.safest.t)}${tn(e.safest.t)}(${e.safest.tag})</b>のほうが安全でした`);
      const wor = rel.filter((e) => e.worse).map((e) => `${e.turn}回目(${ic(e.t)}${tn(e.t)})で手が後退`);
      sec.push(`<div class="rv-h">③ 途中経過: 相手がテンパイしていた間のあなたの切り牌</div><p class="cc-s">(相手の手は対局中は見えません。終わってから分かった情報で記録しています)</p>${C.timeline(rel, { full: true, lastHit: true })}${alt.length ? `<ul class="cc-ul">${alt.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}${wor.length ? `<p class="cc-s">⚠ ${wor.join(' / ')}</p>` : ''}`);
    } else {
      sec.push('<div class="rv-h">③ 途中経過</div><p class="cc-s">ロンされる直前までテンパイの形が整っていなかったか、直前にテンパイしたようです。こういうときは、<b>終盤(山が少ない)や、鳴きの後</b>に特に気をつけましょう。</p>');
    }
    // 4. 次はこうしよう
    const tips = [];
    const last = lr.log[lr.log.length - 1];
    if (last && last.t === t && last.safest && last.safest.t !== t) tips.push(`今回は<b>${ic(last.safest.t)}${tn(last.safest.t)}(${last.safest.tag})</b>を切れば、当たりませんでした。相手のリーチ・鳴き・ダマテンの気配があるときは、まず<b>安全な牌を探してから</b>切りましょう。`);
    else if (lr.safer && lr.safer.length) tips.push(`手牌には<b>${lr.safer.map((s) => `${ic(s.t)}${tn(s.t)}(${s.tag})`).join('、')}</b>というより安全な牌がありました。`);
    if (W.riichi) tips.push('リーチを受けたときの探し方: <b>①現物(その人が捨てた牌)→ ②スジ → ③場に多く出た字牌</b> の順。どれも無いときは、手が良くなければ安全牌を持っておく(オリる)のが基本です。');
    else tips.push('リーチがなくても、<b>鳴いた人</b>・<b>ドラを大事に持っている人</b>・<b>同じ色ばかり切る人</b>には警戒。切る前に、その牌が相手の河の「スジ」や「現物」に近いか見る習慣をつけましょう。');
    tips.push('どうしても押すなら、<b>自分がテンパイ(またはイーシャンテン)で、打点が高い</b>ときだけ。そうでなければ守るほうが失点を防げます。');
    sec.push(`<div class="rv-h">④ 次はこうしよう</div><ul class="cc-ul">${tips.map((x) => `<li>${x}</li>`).join('')}</ul>`);
    return `<div class="cc bad rv"><div class="cc-h">🔎 振り返り: なぜロンされたのか(放銃)</div><div class="cc-b">${sec.join('')}</div></div>`;
  };

  /* ---------- 流局の振り返り(終盤: 山が残り16枚=あと4回引けるころからの記録) ---------- */
  C.drawReview = function (game, res) {
    const dr = res.drawReview;
    if (!dr) return '';
    const names = dr.names;
    const sec = [];
    const myTp = dr.tenpai[0];
    const others = names.map((n, i) => ({ n, i })).filter((x) => x.i !== 0 && dr.tenpai[x.i]);
    const d0 = res.delta[0];
    sec.push(`<div class="rv-h">① 流局の結果</div><p>山の牌がなくなって<b>流局</b>しました。あなたは<b>${myTp ? 'テンパイ' : 'ノーテン'}</b>${others.length ? `、テンパイしていたのは${others.map((x) => `<b>${x.n}</b>(待ち${icons(dr.waits[x.i], 6)})`).join('、')}` : '、ほかにテンパイの人はいませんでした'}。</p><p class="cc-s"><b>ノーテン罰符</b>=流局のとき、テンパイの人がノーテンの人から合計3000点を受け取るルール。あなたは<b>${d0 > 0 ? '+' : ''}${d0}点</b>でした。</p>`);
    const late = dr.log.filter((e) => e.live <= 16).slice(-5);
    if (late.length) {
      const rows = late.map((e) => {
        const thr = e.threats.length ? e.threats.map((x) => `${x.name}(${x.riichi ? 'リーチ中' : '<b>ダマテン中</b>'}・待ち${icons(x.waits, 6) || '?'})`).join('、') : '誰もテンパイしていない(ように見えた)';
        const hit = e.threats.some((x) => x.hit);
        return `<li>残り${e.live}枚: ${ic(e.t)}<b>${tn(e.t)}</b>${e.tag ? `(${e.tag}・危険度 約${e.score}%)` : ''}${hit ? ' <b class="bad">⚠ 実は相手の当たり牌でした(ロンされませんでしたが、運が良かっただけ)</b>' : ''}<br><span class="cc-s">　相手の状況: ${thr}</span>${e.safest && e.safest.t !== e.t && e.score >= 6 ? `<br><span class="cc-s">　安全だった牌: ${ic(e.safest.t)}${tn(e.safest.t)}(${e.safest.tag}・約${e.safest.score}%)</span>` : ''}${e.worse ? `<br><span class="cc-s">　⚠ この牌で手が後退(${e.shBest}→${e.shAfter}シャンテン)</span>` : ''}</li>`;
      }).join('');
      sec.push(`<div class="rv-h">② 終盤のあなたの切り牌(山が残り16枚=あと4回引けるころから)</div>${C.timeline(late, { full: true })}<ul class="cc-ul">${rows}</ul>`);
    }
    const worse = dr.log.filter((e) => e.worse).slice(-3);
    if (worse.length) sec.push(`<div class="rv-h">③ 手が崩れた場面</div><ul class="cc-ul">${worse.map((e) => `<li>${e.turn}回目に ${ic(e.t)}<b>${tn(e.t)}</b>を切って、<b>${e.shBest}シャンテン→${e.shAfter}シャンテン</b>に戻りました。形を残す(または役につながる)牌を切るほうが、テンパイに近づけました。</li>`).join('')}</ul>`);
    const tips = [];
    if (!myTp) tips.push('ノーテンだと流局で点を失います。<b>終盤は「テンパイを取る」</b>ことを意識して、受け入れの広い形(両面)を残しましょう。');
    if (late.some((e) => e.threats.some((x) => x.hit))) tips.push('当たり牌を切ってしまった場面がありました。終盤は<b>相手の河・鳴き・リーチ</b>を見て、スジ・現物から切るのが基本です。');
    if (late.some((e) => e.safest && e.safest.t !== e.t && e.score >= 6)) tips.push('相手がテンパイ気配のとき、<b>安全な牌があるのに危ない牌を切った</b>場面がありました。上の「安全だった牌」を次は選びましょう。');
    if (worse.length) tips.push('<b>役を作るとき</b>は、切った牌で形が崩れないか(シャンテン数が戻らないか)を、切る前に確認しましょう。');
    tips.push('流局間際は、<b>自分がテンパイできるか</b>と<b>相手がテンパイしていそうか</b>を天秤にかけて、押すか守るかを決めます。');
    sec.push(`<div class="rv-h">④ 次はこうしよう</div><ul class="cc-ul">${tips.map((x) => `<li>${x}</li>`).join('')}</ul>`);
    return `<div class="cc rec rv"><div class="cc-h">🔎 流局の振り返り</div><div class="cc-b">${sec.join('')}</div></div>`;
  };

  C.TAG_HELP = TAG_HELP;
  C.reasonFor = reasonFor;
})(typeof window !== 'undefined' ? window : globalThis);
