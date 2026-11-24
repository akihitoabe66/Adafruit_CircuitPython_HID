/* 成績・設定の保存を、SDカード(ボリューム名 mahjong)にも写して残す。
   Windows版(ファイルとして開いたとき)で、savesrv.ps1(保存の窓口)が動いているときだけ働く。ブラウザ版・スマホ版では、何もしない。
   ・起動の最初に、SDカードの保存を、localStorage へ戻す(Cドライブの書き込み保護で、Edgeの保存が消えていても、成績が戻る)
   ・SDカードへ書くのは、区切りのとき(1局終了・対局終了・ゲームを閉じるとき)だけ。ふだんの保存は、Edge(localStorage)に */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const BASE = 'http://127.0.0.1:8777';
  const SKIP = /^mj_(perfrec|boot|volmig1)$/;
  const mine = (k) => typeof k === 'string' && k.indexOf('mj_') === 0 && !SKIP.test(k);
  MJ.sd = { on: false, dir: '', ok: false, err: '', saved: 0 };
  if (G.location.protocol !== 'file:' || /[?&](safe|nosd)=1/.test(G.location.search)) return; // 安全モード(start_safe.bat)では使わない。ブラウザ版・スマホ版でも使わない // ブラウザ版・スマホ版では使わない
  const snapshot = () => { const o = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (mine(k)) o[k] = localStorage.getItem(k); } } catch (e) { /* ignore */ } return JSON.stringify(o); };
  /* 1. 起動の最初: SDカードの保存を戻す(同期で読む。ほかの部品が、保存を読む前に済ませる) */
  let remoteEmpty = true;
  try {
    const x = new XMLHttpRequest(); x.open('GET', BASE + '/load', false); x.send();
    if (x.status === 200) {
      const r = JSON.parse(x.responseText);
      MJ.sd.ok = true; MJ.sd.on = !!r.onSD; MJ.sd.dir = r.dir || ''; remoteEmpty = !!r.empty;
      if (!r.empty && r.data) {
        const d = JSON.parse(r.data);
        // SDカードの内容を正とする(Edge側にだけある古い mj_ は消す)
        try { const del = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (mine(k) && !(k in d)) del.push(k); } del.forEach((k) => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
        Object.keys(d).forEach((k) => { if (mine(k)) { try { localStorage.setItem(k, d[k]); } catch (e) { /* ignore */ } } });
      }
    }
  } catch (e) { MJ.sd.err = String(e && e.message || e); }
  if (!MJ.sd.ok) return; // 窓口がいないときは、ふつうに(Edgeの保存だけで)動く
  /* 2. SDカードへ書くのは、区切りのときだけ(SDカードの書き込み回数を減らすため)。ふだんの保存は、Edge(localStorage)に。
        区切り: 1局が終わるとき・対局(半荘)が終わるとき・ゲームを閉じるとき。そのほか、変更が残っていて10分たったとき */
  let t = 0, tAt = 0, dirty = false, last = '', lastAt = 0;
  const send = (sync) => {
    if (t) { clearTimeout(t); t = 0; tAt = 0; }
    const s = snapshot(); if (s === last) { dirty = false; return; } // 変わっていなければ、書かない
    try {
      if (sync && navigator.sendBeacon) { navigator.sendBeacon(BASE + '/save', new Blob([s], { type: 'text/plain' })); last = s; dirty = false; lastAt = Date.now(); return; }
      lastAt = Date.now();
      fetch(BASE + '/save', { method: 'POST', body: s, headers: { 'Content-Type': 'text/plain' } }).then((r) => r.json()).then((j) => { if (j && j.ok) { last = s; dirty = false; MJ.sd.saved = Date.now(); MJ.sd.err = ''; } else { MJ.sd.err = (j && j.err) || 'save failed'; later(60000); } }).catch((e) => { MJ.sd.err = String(e && e.message || e); later(60000); });
    } catch (e) { later(60000); }
  };
  const later = (ms) => { const at = Date.now() + ms; if (t && tAt <= at) return; if (t) clearTimeout(t); tAt = at; t = setTimeout(() => { t = 0; tAt = 0; send(false); }, ms); }; // 予定は、早いほうを残す
  /* 区切りの合図(ゲームから呼ぶ)。続けて呼ばれても、20秒に1回まで */
  MJ.sdFlush = () => { if (!dirty) return; const wait = 20000 - (Date.now() - lastAt); if (wait > 0) later(wait); else send(false); };
  const si = Storage.prototype.setItem, ri = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (k, v) { si.call(this, k, v); if (this === G.localStorage && mine(k)) { dirty = true; later(600000); } };
  Storage.prototype.removeItem = function (k) { ri.call(this, k); if (this === G.localStorage && mine(k)) { dirty = true; later(600000); } };
  G.addEventListener('pagehide', () => { if (dirty) send(true); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) send(true); });
  // 窓口は、しばらく連絡がないと、自分で終わる。開いている間は、30秒ごとに知らせる
  setInterval(() => { try { fetch(BASE + '/ping', { mode: 'no-cors' }).catch(() => {}); } catch (e) { /* ignore */ } }, 30000);
  // SDカードが空(はじめて)なら、いまの成績を、まず写す
  if (remoteEmpty) { dirty = true; later(800); }
})(typeof window !== 'undefined' ? window : globalThis);
