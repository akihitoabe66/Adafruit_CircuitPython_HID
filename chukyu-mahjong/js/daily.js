/* 毎日スタンプ帳: 起動したら「最初に何を切る?」を1問。答えるとスタンプ(ラジオ体操の出席カード風) */
(function () {
  const MJ = window.MJ;
  const $ = (s) => document.querySelector(s);
  const KEY = 'mj_daily';
  const load = () => { try { return Object.assign({ stamps: {}, never: false }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { stamps: {}, never: false }; } };
  const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const drillStats = () => { try { return JSON.parse(localStorage.getItem('mj_drill') || '{}'); } catch (e) { return {}; } };

  /* 「中級」の目安: 分野ごとに、一定数以上の問題で正解率がこの値を超えたら「わかった」 */
  const MIN_N = 10, GOAL = 0.7;
  const SKILLS = [
    { id: 'eff', name: '牌効率(何を切る)', tip: '手牌から、テンパイに近づく牌を選べる' },
    { id: 'yaku', name: '役づくり', tip: '今の手から狙える役がわかる' },
    { id: 'def', name: '守備(安全牌)', tip: '現物・スジ・カベで安全な牌を選べる' },
    { id: 'call', name: '鳴き判断', tip: 'ポン・チーして良いかを判断できる' },
    { id: 'score', name: '点数計算', tip: '飜・符から点数を数えられる' },
    { id: 'push', name: '押し引き', tip: 'リーチに押すか降りるかを判断できる' },
  ];

  const Daily = (MJ.Daily = {
    data: load(),
    asked: false,
    today() { return ymd(new Date()); },
    stamped(day) { return !!this.data.stamps[day || this.today()]; },
    streak() {
      let n = 0;
      const d = new Date();
      if (!this.stamped(ymd(d))) d.setDate(d.getDate() - 1); // 今日まだなら、昨日までの連続を数える
      while (this.stamped(ymd(d))) { n++; d.setDate(d.getDate() - 1); }
      return n;
    },
    total() { return Object.keys(this.data.stamps).length; },

    /* 今日の1問に答えたらスタンプ(1日1回) */
    stamp() {
      const t = this.today();
      if (this.data.stamps[t]) return false;
      this.data.stamps[t] = 1;
      save(this.data);
      return true;
    },

    /* メニューに入ったとき: 「表示しない」でなく、今日まだ押していなければ出す(起動ごとに1回だけ) */
    autoShow() {
      if (this.asked || this.data.never || this.stamped()) return;
      this.asked = true;
      this.open();
    },

    calendarHTML() {
      const now = new Date(), y = now.getFullYear(), m = now.getMonth();
      const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < first; i++) cells += '<i class="e"></i>';
      for (let d = 1; d <= days; d++) {
        const key = `${y}-${pad(m + 1)}-${pad(d)}`;
        cells += `<i class="${this.data.stamps[key] ? 'st' : ''}${d === now.getDate() ? ' td' : ''}">${this.data.stamps[key] ? '<b>済</b>' : d}</i>`;
      }
      const wk = ['日', '月', '火', '水', '木', '金', '土'].map((w) => `<u>${w}</u>`).join('');
      return `<div class="dy-cal"><div class="dy-m">${y}年${m + 1}月</div><div class="dy-g">${wk}${cells}</div></div>`;
    },

    skillsDone() { const st = drillStats(); return SKILLS.filter((k) => { const x = st[k.id] || { n: 0, ok: 0 }; return x.n >= MIN_N && x.ok / x.n >= GOAL; }).length; },
    skillsTotal() { return SKILLS.length; },

    skillsHTML() {
      const st = drillStats();
      const rows = SKILLS.map((s) => {
        const x = st[s.id] || { n: 0, ok: 0 };
        const rate = x.n ? x.ok / x.n : 0;
        const done = x.n >= MIN_N && rate >= GOAL;
        const note = done ? 'わかった!' : x.n < MIN_N ? `あと${MIN_N - x.n}問` : `正解率${Math.round(rate * 100)}%`;
        return `<li class="${done ? 'ok' : ''}" title="${s.tip}"><span class="ck">${done ? '✔' : '○'}</span>${s.name}<small>${note}</small></li>`;
      }).join('');
      const n = SKILLS.filter((s) => { const x = st[s.id] || { n: 0, ok: 0 }; return x.n >= MIN_N && x.ok / x.n >= GOAL; }).length;
      return `<div class="dy-sk"><div class="dy-m">🎓 中級の目安 ${n}/${SKILLS.length}</div><ul>${rows}</ul><div class="dy-n">各分野で${MIN_N}問以上解いて、正解率${GOAL * 100}%以上で「わかった」。全部そろえば中級です。</div></div>`;
    },

    open() {
      const done = this.stamped();
      const s = this.streak();
      const head = done ? '今日のスタンプは押しました!' : '今日の1問に答えて、スタンプをもらおう';
      const mn = MJ.Mistakes ? MJ.Mistakes.count() : 0;
      const go = done ? '' : `<button class="btn pri big" id="dy-go">✂️ 今日の1問${mn ? '(前の対局の場面)' : '(最初に何を切る?)'}</button>`;
      MJ.UI.overlay(
        `<div class="dy"><h2>📅 毎日スタンプ</h2><p class="dy-h">${head}</p>
        <div class="dy-body">${this.calendarHTML()}${this.skillsHTML()}</div>
        <div class="dy-info">連続 <b>${s}</b>日 ・ 合計 <b>${this.total()}</b>日${mn ? ` ・ 📝 間違えた場面 <b>${mn}</b>件が出題待ち` : ''}</div>
        <div class="dy-foot"><label><input type="checkbox" id="dy-never"${this.data.never ? ' checked' : ''}> 明日以降、起動時に表示しない</label>
        <span class="sp"></span><button class="btn" id="dy-skip">${done ? '閉じる' : 'スキップ'}</button>${go}</div></div>`,
        { plain: true });
      const finish = () => { this.data.never = $('#dy-never').checked; save(this.data); MJ.UI.closeOverlay(); if (MJ.Pad) MJ.Pad.refocus(); };
      $('#dy-skip').addEventListener('click', finish);
      const g = $('#dy-go');
      if (g) g.addEventListener('click', () => { finish(); MJ.DrillUI.openDaily(); });
      if (MJ.Pad) { MJ.Pad.cur = null; MJ.Pad.desc = null; MJ.Pad.refocus(); }
    },
  });
})();
