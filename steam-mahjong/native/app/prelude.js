/* ブラウザの代わりに、ゲームの頭脳が使う最小限の道具を用意する(タイマー・保存) */
var window = globalThis; var self = globalThis;
var __ls = {};
try { var __s = __load(); if (__s) __ls = JSON.parse(__s); } catch (e) { __ls = {}; }
var __lsDirty = false;
var localStorage = { getItem: function (k) { return (k in __ls) ? __ls[k] : null; }, setItem: function (k, v) { __ls[k] = String(v); __lsDirty = true; }, removeItem: function (k) { delete __ls[k]; __lsDirty = true; }, key: function (i) { return Object.keys(__ls)[i]; }, get length() { return Object.keys(__ls).length; } };
var document = { documentElement: { classList: { add() {}, remove() {}, contains() { return false; } } }, body: { classList: { add() {}, remove() {}, contains() { return false; } } }, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} }; }, getElementById() { return null; } };
var navigator = { userAgent: 'qjs', platform: '', maxTouchPoints: 0 };
var location = { protocol: 'file:', search: '' };
var performance = { now: function () { return __now(); } };
var console = { log: function () { print(Array.prototype.slice.call(arguments).join(' ')); }, warn() {}, error: function () { print('E:' + Array.prototype.slice.call(arguments).join(' ')); } };
var addEventListener = function () {}; var fetch = function () { return Promise.reject(new Error('nofetch')); };
/* タイマー(メインループから __frame で動かす) */
var __timers = []; var __tid = 0;
var setTimeout = function (f, ms) { var id = ++__tid; __timers.push({ id: id, at: __now() + (ms || 0), f: f }); return id; };
var clearTimeout = function (id) { __timers = __timers.filter(function (t) { return t.id !== id; }); };
var setInterval = function (f, ms) { var id = ++__tid; __timers.push({ id: id, at: __now() + ms, f: f, every: ms }); return id; };
var clearInterval = clearTimeout;
var requestAnimationFrame = function (f) { return setTimeout(f, 16); };
function __runTimers(now) {
  if (!__timers.length) return;
  var due = __timers.filter(function (t) { return t.at <= now; });
  if (!due.length) return;
  __timers = __timers.filter(function (t) { return t.at > now; });
  due.sort(function (a, b) { return a.at - b.at; });
  due.forEach(function (t) { if (t.every) { t.at = now + t.every; __timers.push(t); } try { t.f(); } catch (e) { print('timer err ' + (e && e.stack || e)); } });
}
