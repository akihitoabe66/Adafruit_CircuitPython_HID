/* 点数計算の勉強(やさしい読み物+チャレンジ)と、穴あきクイズ・最短の役クイズ */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const $ = (s) => document.querySelector(s);
  const D = () => MJ.Drill;
  const rnd = (n) => Math.floor(Math.random() * n);
  const fmt = (n) => n.toLocaleString('ja-JP');

  /* "123m 456p" → 牌の列(m=萬 p=筒 s=索 z=字) */
  const SUIT = { m: 0, p: 9, s: 18, z: 27 };
  const R = (s) => {
    let cur = [], out = '';
    for (const ch of s) {
      if (SUIT[ch] !== undefined) { out += cur.map((n) => MJ.tileHTML(SUIT[ch] + n - 1, 't-s')).join(''); cur = []; }
      else if (ch === ' ') out += '<span class="sp"></span>';
      else cur.push(+ch);
    }
    return `<div class="st-tiles">${out}</div>`;
  };

  /* ====================================================================
     穴あきクイズ(言葉を選ぶ)。tag: yaku=役 han=翻 fu=符 pt=点数 rule=ルール
     ==================================================================== */
  const ANA = [
    { tag: 'rule', q: '上がるには、「面子(3枚組)が<b>＿＿</b>つ」と「雀頭(同じ牌2枚)が1つ」が必要です。', a: '4つ', w: ['3つ', '5つ'], e: '面子4つ+雀頭1つで、14枚の形が完成します。' },
    { tag: 'rule', q: '手牌は<b>＿＿</b>枚。1枚引いて、1枚捨てながら進めます。', a: '13枚', w: ['12枚', '14枚'], e: '引いたあとは14枚になり、1枚捨てて13枚に戻ります。' },
    { tag: 'rule', q: '「テンパイ」とは、あと<b>＿＿</b>で上がれる形のことです。', a: '1枚', w: ['2枚', '3枚'], e: 'あと1枚そろえば上がり、という状態です。' },
    { tag: 'rule', q: '自分で引いた牌で上がることを<b>＿＿</b>といいます。', a: 'ツモ', w: ['ロン', 'ポン'], e: 'ほかの人の捨てた牌で上がるのは「ロン」です。' },
    { tag: 'rule', q: 'ほかの人が捨てた牌で上がることを<b>＿＿</b>といいます。', a: 'ロン', w: ['ツモ', 'チー'], e: '自分で引いて上がるのは「ツモ」です。' },
    { tag: 'rule', q: '同じ牌を3枚そろえた面子を<b>＿＿</b>といいます。', a: '刻子(コーツ)', w: ['順子(シュンツ)', '雀頭(ジャントウ)'], e: '数字が3つ続いた面子は「順子」、同じ牌2枚は「雀頭」です。' },
    { tag: 'rule', q: '同じ色で、数字が3つ続いた面子を<b>＿＿</b>といいます。', a: '順子(シュンツ)', w: ['刻子(コーツ)', '雀頭(ジャントウ)'], e: '例: 一・二・三。同じ牌3枚は「刻子」です。' },
    { tag: 'rule', q: '自分が一度捨てた牌が待ちに入っていると、<b>＿＿</b>では上がれません。', a: 'ロン', w: ['ツモ', 'リーチ'], e: 'これを「フリテン」といいます。ツモでなら上がれます。' },
    { tag: 'rule', q: '「チー」ができるのは、<b>＿＿</b>が捨てた牌だけです。', a: '左隣(上家)', w: ['向かい(対面)', '右隣(下家)'], e: 'ポンは、だれが捨てた牌でもできます。' },
    { tag: 'rule', q: '同じ牌4枚で作る面子を<b>＿＿</b>といいます。', a: 'カン', w: ['ポン', 'チー'], e: 'カンをすると、ドラが増えることがあります。' },
    { tag: 'rule', q: '牌山がなくなって、だれも上がれずに終わることを<b>＿＿</b>といいます。', a: '流局', w: ['和了', '暴牌'], e: '流局のとき、テンパイの人は点をもらえます。' },
    { tag: 'yaku', q: '<b>＿＿</b>は、1〜9のうち「2〜8」の数牌だけで作る役です。', a: 'タンヤオ', w: ['ピンフ', '七対子'], e: '1・9・字牌を使わない手です。1翻で、鳴いてもOKです。' },
    { tag: 'yaku', q: 'リーチをかけたあとの手牌は<b>＿＿</b>。', a: '変えられない(引いた牌を切るだけ)', w: ['自由に入れ替えられる', '1枚だけ入れ替えられる'], e: 'リーチは、門前(鳴いていない)でテンパイしたときだけかけられます。' },
    { tag: 'yaku', q: 'リーチは<b>＿＿</b>のときだけかけられます。', a: '鳴いていない(門前)', w: ['鳴いたあと', 'どんなときでも'], e: 'リーチをかけると1翻、さらに裏ドラのチャンスもあります。' },
    { tag: 'yaku', q: '<b>＿＿</b>は、順子4つ+雀頭で、役のつかない両面待ちで上がる役です。', a: 'ピンフ', w: ['タンヤオ', '対々和'], e: '符がつかないので、点数が計算しやすい役です。' },
    { tag: 'yaku', q: '役牌とは、白・發・中と、<b>＿＿</b>のことです。', a: '場風・自風の牌', w: ['ドラの牌', '赤い牌'], e: '役牌の刻子は、それだけで1翻になります。' },
    { tag: 'yaku', q: '<b>＿＿</b>は、対子(同じ牌2枚)を7組そろえて上がる役です。', a: '七対子', w: ['対々和', '混一色'], e: '2翻25符です。同じ牌4枚は1組にしか数えません。' },
    { tag: 'yaku', q: '<b>＿＿</b>は、刻子(同じ牌3枚)を4つそろえる役です。', a: '対々和', w: ['七対子', 'ピンフ'], e: '2翻です。ポンしながらでも作れます。' },
    { tag: 'yaku', q: '<b>＿＿</b>は、ひとつの色の数牌+字牌だけで作る役です。', a: '混一色', w: ['清一色', '三色同順'], e: '門前3翻・鳴き2翻。数牌だけだと「清一色」です。' },
    { tag: 'yaku', q: '一発とは、リーチをかけてから<b>＿＿</b>以内に上がることです。', a: '1巡(自分の次の番まで)', w: ['3巡', '5巡'], e: '1翻つきます。鳴きが入ると消えます。' },
    { tag: 'yaku', q: '国士無双は、<b>＿＿</b>を全種類そろえる役満です。', a: '1・9・字牌(13種類)', w: ['2〜8の数牌', '字牌だけ'], e: '役満は、いちばん大きい役です。' },
    { tag: 'han', q: '役やドラの数を足した数を<b>＿＿</b>といいます。', a: '翻(ハン)', w: ['符(フ)', '巡(ジュン)'], e: '翻が多いほど、点数が高くなります。' },
    { tag: 'han', q: 'ドラの牌を1枚持っていると、<b>＿＿</b>がつきます。', a: '1翻', w: ['2翻', '1符'], e: 'ドラは役ではないので、ドラだけでは上がれません。' },
    { tag: 'han', q: '5翻以上になると、<b>＿＿</b>以上になります。', a: '満貫', w: ['跳満', '役満'], e: '満貫は、子8000点・親12000点です。' },
    { tag: 'han', q: 'リーチ(1翻)+タンヤオ(1翻)+ドラ1枚は、合計<b>＿＿</b>です。', a: '3翻', w: ['2翻', '4翻'], e: '1+1+1=3翻です。' },
    { tag: 'fu', q: '手の形の細かい点を<b>＿＿</b>といいます。', a: '符(フ)', w: ['翻(ハン)', '局(キョク)'], e: '基本は20符で、ロンやツモ、刻子、待ちの形で増えます。' },
    { tag: 'fu', q: '符の基本(副底)は<b>＿＿</b>符です。', a: '20', w: ['10', '30'], e: 'ここに、門前ロン+10、ツモ+2などを足します。' },
    { tag: 'fu', q: '門前(鳴いていない)でロンすると、符が<b>＿＿</b>増えます。', a: '10符', w: ['2符', '20符'], e: 'ツモなら+2符です。' },
    { tag: 'fu', q: '符は、合計を<b>＿＿</b>の位に切り上げます。', a: '10', w: ['1', '100'], e: '例: 32符 → 40符。' },
    { tag: 'pt', q: '子の満貫の点数は<b>＿＿</b>点です(ロン)。', a: '8000', w: ['2000', '12000'], e: '親の満貫は12000点です。' },
    { tag: 'pt', q: '親の満貫の点数は<b>＿＿</b>点です(ロン)。', a: '12000', w: ['8000', '18000'], e: '親は、子の1.5倍です。' },
    { tag: 'pt', q: '点数は、<b>＿＿</b>と翻で決まります。', a: '符', w: ['巡目', '捨て牌の数'], e: '符と翻から、点数の表で調べられます。' },
    { tag: 'pt', q: '親がツモで上がると、ほかの3人が<b>＿＿</b>。', a: '同じ点数ずつ払う', w: ['払わない', '1人だけが払う'], e: '「◯◯点オール」と呼びます。' },
  ];
  const histAna = [];
  function genAna(tag) {
    const pool = ANA.filter((x) => !tag || x.tag === tag);
    let it;
    for (let i = 0; i < 8; i++) { it = pool[rnd(pool.length)]; if (!histAna.includes(it)) break; }
    histAna.push(it); if (histAna.length > 8) histAna.shift();
    const opts = MJ.shuffle([it.a].concat(it.w)).map((t) => ({ id: t, html: t }));
    return {
      cat: tag ? 'st_' + tag : 'ana', kind: 'choice', title: '穴あきクイズ', hand: [], g: D().mock({ hand: [], doraInd: [] }),
      sit: '空いているところに、入る言葉を選びましょう。', prompt: it.q,
      options: opts,
      grade(id) { return { r: id === it.a ? 'ok' : 'ng', html: `<p>正解は <b>${it.a}</b>。</p><p>${it.e}</p>` }; },
    };
  }

  /* 最短の役クイズ: 手牌から、いちばん早く作れそうな役を選ぶ */
  function genShort() {
    const q = D().genYaku();
    if (!q) return null;
    q.cat = 'short';
    q.title = '最短の役は?';
    q.sit = '13枚の手牌です。まだテンパイしていません。';
    q.prompt = 'この手牌から、<b>いちばん早く作れそうな役</b>はどれですか?';
    return q;
  }
  /* 勉強のチャレンジ用: 点数計算ドリルのうち、飜・符・点数のどれかだけ出す */
  const scoreQ = (kind, cat) => () => { const q = D().genScore(kind); if (q) q.cat = cat; return q; };
  const mixQ = (cat, ...fs) => () => { for (let i = 0; i < 6; i++) { const q = fs[rnd(fs.length)](); if (q) { q.cat = cat; return q; } } return null; };

  /* クイズの種類(MJ.DRILLS に足す)。auto=「麻雀クイズ」で自動に出題されるもの */
  const EXTRA = [
    { id: 'ana', icon: '✏️', name: '穴あきクイズ', level: '入門', desc: '', gen: () => genAna(null), auto: true },
    { id: 'short', icon: '⚡', name: '最短の役を考えろ', level: '入門', desc: '', gen: genShort, auto: true },
    { id: 'st_yaku', icon: '', name: '役のチャレンジ', level: '', desc: '', gen: mixQ('st_yaku', () => genAna('yaku'), () => genAna('yaku'), () => D().genYaku()) },
    { id: 'st_han', icon: '', name: '翻のチャレンジ', level: '', desc: '', gen: mixQ('st_han', scoreQ('han', 'st_han'), scoreQ('han', 'st_han'), () => genAna('han')) },
    { id: 'st_fu', icon: '', name: '符のチャレンジ', level: '', desc: '', gen: mixQ('st_fu', scoreQ('fu', 'st_fu'), scoreQ('fu', 'st_fu'), () => genAna('fu')) },
    { id: 'st_pt', icon: '', name: '点数のチャレンジ', level: '', desc: '', gen: mixQ('st_pt', scoreQ('points', 'st_pt'), scoreQ('points', 'st_pt'), () => genAna('pt')) },
  ];
  MJ.DRILLS.push(...EXTRA);
  /* 「麻雀クイズ」に自動で出す種類(入門〜やさしめ中級) */
  MJ.AUTO_QUIZ = ['eff', 'wait', 'short', 'ana', 'call', 'def'];
  /* 苦手なところを多めに出す: 正解率が低い(または、まだ少ない)種類ほど選ばれやすい。直前と同じ種類は出にくい */
  MJ.pickAutoCat = (stats, lastId) => {
    const ws = MJ.AUTO_QUIZ.map((id) => {
      const s = stats[id] || { n: 0, ok: 0 };
      const err = (s.n - s.ok + 1) / (s.n + 2);
      let w = 0.6 + err * 3 + (s.n < 3 ? 0.8 : 0);
      if (id === lastId) w *= 0.25;
      return w;
    });
    let r = Math.random() * ws.reduce((a, b) => a + b, 0), i = 0;
    for (; i < ws.length - 1; i++) { r -= ws[i]; if (r <= 0) break; }
    return MJ.AUTO_QUIZ[i];
  };

  /* ====================================================================
     点数計算の勉強
     ==================================================================== */
  const T30 = (h) => MJ.scoreTable(30, h);
  const LESSONS = [
    {
      id: 'yaku', title: '役(やく)ってなに?', cat: 'st_yaku',
      pages: [
        `<p>上がるには、<b>役(やく)</b>が1つ必要です。</p><p>形がそろっていても、役がないと上がれません。</p><p>いちばん簡単な役は <b>リーチ</b> です。</p>`,
        `<p><b>よく使う役</b>(どれも1翻)</p><p><b>タンヤオ</b>: 2〜8だけで作る</p>${R('234m 567p 345s 678s 44p')}<p><b>役牌</b>: 白・發・中を3枚</p>${R('666z')}`,
        `<p><b>ピンフ</b>: 順子だけで作る(1翻)</p>${R('123m 456p 234s 789s 55m')}<p><b>七対子</b>: 同じ牌2枚を7組(2翻)</p><p><b>対々和</b>: 同じ牌3枚を4組(2翻)</p>`,
      ],
    },
    {
      id: 'han', title: '翻(はん)ってなに?', cat: 'st_han',
      pages: [
        `<p><b>翻(はん)</b>は、手の大きさです。</p><p>役ごとに、翻が決まっています。</p><p>翻が多いほど、点数が高くなります。</p>`,
        `<p><b>翻の数え方</b>は、足し算です。</p><p>リーチ <b>1</b> + タンヤオ <b>1</b> + ドラ1枚 <b>1</b></p><p>= 合計 <b>3翻</b></p><p>ドラは、持っている枚数だけ翻が増えます。</p>`,
        `<p><b>5翻以上</b>は、点数が決まっています。</p><p>満貫(5翻): 子 <b>8000点</b>・親 12000点</p><p>跳満(6〜7翻): 子 <b>12000点</b></p><p>倍満(8〜10翻): 子 <b>16000点</b></p>`,
      ],
    },
    {
      id: 'fu', title: '符(ふ)ってなに?', cat: 'st_fu',
      pages: [
        `<p><b>符(ふ)</b>は、手の形の細かい点です。</p><p>基本は <b>20符</b>。</p><p>ここに、いろいろ足していきます。</p>`,
        `<p><b>足す符</b></p><p>門前(鳴いていない)でロン: <b>+10</b></p><p>ツモ: <b>+2</b></p><p>同じ牌3枚(隠した): 2〜8は <b>+4</b>、1・9・字牌は <b>+8</b></p>`,
        `<p>最後に、<b>10の位に切り上げ</b>ます。</p><p>例: 20+10=30符 / 32符→40符</p><p>よく出るのは <b>30符</b> です。</p><p>七対子は、いつも <b>25符</b> です。</p>`,
      ],
    },
    {
      id: 'pt', title: '点数のきほん', cat: 'st_pt',
      pages: [
        `<p>点数は、<b>符</b>と<b>翻</b>で決まります。</p><p>表を見れば、すぐに分かります。</p><p>まずは、よく出る <b>30符</b> から覚えましょう。</p>`,
        `<p><b>30符</b>の子のロン</p><p>1翻: <b>${fmt(T30(1).childRon)}</b>点 / 2翻: <b>${fmt(T30(2).childRon)}</b>点</p><p>3翻: <b>${fmt(T30(3).childRon)}</b>点 / 4翻: <b>${fmt(T30(4).childRon)}</b>点</p><p>親は、子の約1.5倍です。</p>`,
        `<p><b>ツモ</b>のときは、ほかの3人で分けて払います。</p><p>親がツモ: 3人が同じ点数 →「◯◯点オール」</p><p>子がツモ: 親が多く、子が少なく払います。</p>`,
      ],
    },
  ];

  const S = (MJ.Study = {
    lesson: null, page: 0,
    layout() {
      const el = $('#screen-study');
      if (!el || el.classList.contains('hidden')) return;
      const st = MJ.UI.stageFor(el);
      const sc = Math.min(st.h / 428, st.w / 832);
      $('#sy').style.transform = `translate(${Math.round((st.w - 832 * sc) / 2)}px, ${Math.round((st.h - 428 * sc) / 2)}px) scale(${sc})`;
      el.style.setProperty('--sw', '30px'); el.style.setProperty('--sh', '40px');
    },
    open() { this.lesson = null; MJ.App.show('study'); this.render(); },
    openLesson(i) { this.lesson = LESSONS[i]; this.page = 0; this.render(); },
    render() {
      const root = $('#sy');
      const L = this.lesson;
      if (!L) {
        root.innerHTML = `<div class="sy-side"><div class="t2">点数計算<br>の勉強</div><div class="cap">4つのお話を、順番に読みます</div></div>${LESSONS.map((l, i) => `<button class="sy-btn" data-lesson="${i}" type="button"><b>${i + 1}</b>${l.title}</button>`).join('')}<button class="sy-btn sy-log" id="sy-log" type="button"><b>🔖</b>記録した役</button><div class="hm-hint"><span><i>▲▼</i> えらぶ</span><span><i>A</i> きめる</span><span><i>B</i> もどる</span></div><button class="sy-back list" id="sy-home" type="button">← もどる</button>`;
      } else {
        const last = this.page === L.pages.length - 1;
        root.innerHTML = `<div class="sy-head">${L.title}<span class="sy-ref"><button class="sy-rb" type="button" data-open-yaku>役一覧</button><button class="sy-rb" type="button" data-open-gloss>用語辞典</button></span><span class="sy-pg">${this.page + 1} / ${L.pages.length}</span></div><div class="sy-body">${L.pages[this.page]}</div><div class="sy-nav"><button class="sy-nb" id="sy-list" type="button">もどる</button><button class="sy-nb" id="sy-prev" type="button"${this.page === 0 ? ' disabled' : ''}>◀ まえ</button>${last ? '<button class="sy-nb go" id="sy-chal" type="button">チャレンジ</button>' : '<button class="sy-nb go" id="sy-next" type="button">つぎ ▶</button>'}</div><div class="hm-hint"><span><i>◀▶</i> えらぶ</span><span><i>A</i> きめる</span><span><i>B</i> もどる</span></div>`;
      }
      this.layout();
      if (MJ.Ruby) MJ.Ruby.apply(root);
      if (MJ.Pad) MJ.Pad.preselect(true);
    },
    back() { if (this.lesson) { this.lesson = null; this.render(); } else MJ.App.show('menu'); },
    init() {
      $('#sy').addEventListener('click', (e) => {
        const l = e.target.closest('[data-lesson]');
        if (l) return this.openLesson(+l.dataset.lesson);
        const id = (e.target.closest('button') || {}).id;
        if (id === 'sy-home') MJ.App.show('menu');
        else if (id === 'sy-log') MJ.Learn.openLog();
        else if (id === 'sy-list') { this.lesson = null; this.render(); }
        else if (id === 'sy-prev' && this.page > 0) { this.page--; this.render(); }
        else if (id === 'sy-next') { this.page++; this.render(); }
        else if (id === 'sy-chal') MJ.DrillUI.openPool(this.lesson.cat, 'study');
      });
      window.addEventListener('resize', () => this.layout());
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
