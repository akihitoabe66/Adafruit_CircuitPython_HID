/* 成績・設定の保存を、SDカード(ボリューム名 mahjong)にも写して残す。
   Windows版(ファイルとして開いたとき)で、savesrv.ps1(保存の窓口)が動いているときだけ働く。ブラウザ版・スマホ版では、何もしない。
   ・起動の最初に、SDカードの保存を、localStorage へ戻す(Cドライブの書き込み保護で、Edgeの保存が消えていても、成績が戻る)
   ・localStorage に mj_ で始まるものを書くたびに、少しまとめて、窓口へ送る(2世代・確認つきで、SDカードに書く) */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const BASE = 'http://127.0.0.1:8777';
  const SKIP = /^mj_(perfrec|boot|volmig1)$/;
  const mine = (k) => typeof k === 'string' && k.indexOf('mj_') === 0 && !SKIP.test(k);
  MJ.sd = { on: false, dir: '', ok: false, err: '', saved: 0 };
  if (G.location.protocol !== 'file:') return; // ブラウザ版・スマホ版では使わない
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
  /* 2. 書くたびに、窓口へ送る(1.5秒まとめて) */
  let t = 0, dirty = false, last = '';
  const send = (sync) => {
    t = 0; const s = snapshot(); if (s === last && !dirty) return; dirty = false;
    try {
      if (sync && navigator.sendBeacon) { navigator.sendBeacon(BASE + '/save', new Blob([s], { type: 'text/plain' })); last = s; return; }
      fetch(BASE + '/save', { method: 'POST', body: s, headers: { 'Content-Type': 'text/plain' } }).then((r) => r.json()).then((j) => { if (j && j.ok) { last = s; MJ.sd.saved = Date.now(); MJ.sd.err = ''; } else { dirty = true; MJ.sd.err = (j && j.err) || 'save failed'; schedule(5000); } }).catch((e) => { dirty = true; MJ.sd.err = String(e && e.message || e); schedule(5000); });
    } catch (e) { dirty = true; }
  };
  const schedule = (ms) => { if (t) return; t = setTimeout(() => send(false), ms || 1500); };
  const si = Storage.prototype.setItem, ri = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (k, v) { si.call(this, k, v); if (this === G.localStorage && mine(k)) { dirty = true; schedule(); } };
  Storage.prototype.removeItem = function (k) { ri.call(this, k); if (this === G.localStorage && mine(k)) { dirty = true; schedule(); } };
  G.addEventListener('pagehide', () => { if (dirty || t) send(true); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && (dirty || t)) send(true); });
  // 窓口は、しばらく連絡がないと、自分で終わる。開いている間は、30秒ごとに知らせる
  setInterval(() => { try { fetch(BASE + '/ping', { mode: 'no-cors' }).catch(() => {}); } catch (e) { /* ignore */ } }, 30000);
  // SDカードが空(はじめて)なら、いまの成績を、まず写す
  if (remoteEmpty) { dirty = true; schedule(800); }
})(typeof window !== 'undefined' ? window : globalThis);
