#!/usr/bin/env python3
"""Wii/NESクラシックのコントローラー(I2C)を、USBゲームパッドと同じように使えるようにする常駐プログラム。
 GPIOの I2C(SDA=物理3番 GPIO2 / SCL=物理5番 GPIO3 / 3.3V=物理1番 / GND=物理6番)でつないだコントローラー(アドレス 0x52)を
 読んで、Linuxの仮想ゲームパッド(uinput)として見せる。 ゲーム(SDL)は、USBのゲームパッドと同じに受け取る。
 ボタンの割り当て(SDLのボタン番号。 ゲームの「決定ボタンの入れ替え」は 初期のまま):
   十字キー → 軸(X・Y)       B(左) → ボタン0 = 戻る       A(右) → ボタン1 = 決定
   セレクト(-) → ボタン6      スタート(+) → ボタン7        (6+7 の長押しで、ゲームのメニュー)
 使うのは 標準ライブラリだけ(追加の部品の インストールは いりません)。
 試験用: python3 mjpad.py --selftest  /  python3 mjpad.py --dry --fake FFFF,EFFF,FFFF   (実機・uinputなしで、読みかたの確認)"""
import fcntl, os, struct, sys, time

ADDR = 0x52
I2C_SLAVE = 0x0703
PROFILE = os.environ.get('MJPAD_PROFILE', 'auto').lower()   # auto(IDで 見分ける) / wireless / wired
HZ = int(os.environ.get('MJPAD_HZ', '200'))   # 1秒に読む回数(40回=25ms)。 Pi Zero は CPU が1つだけで、ゲームと取りあうので、多くしすぎない
DEBOUNCE_MS = float(os.environ.get('MJPAD_DEBOUNCE_MS', '5'))   # 同じ値が この時間(ミリ秒)つづいたときだけ 伝える(読みまちがいよけ)
DIAG_MS = float(os.environ.get('MJPAD_DIAG_MS', '120'))   # 斜めが 出たとき 1方向に 落ちつくのを 待つ時間(ミリ秒)。 この麻雀ゲームは 斜めを 使わない
ENV_SET = {k for k in ('MJPAD_HZ', 'MJPAD_DEBOUNCE_MS', 'MJPAD_HOLD') if k in os.environ}   # 環境変数で 決めたものは、自動の切りかえより 優先   # 同じ値が この回数 つづけて読めたときだけ、ゲームに伝える(読みまちがいの 一瞬の「左」などを 通さない)
# uinput
UI_SET_EVBIT, UI_SET_KEYBIT, UI_SET_ABSBIT = 0x40045564, 0x40045565, 0x40045567
UI_DEV_SETUP, UI_ABS_SETUP, UI_DEV_CREATE, UI_DEV_DESTROY = 0x405c5503, 0x401c5504, 0x5501, 0x5502
EV_SYN, EV_KEY, EV_ABS = 0, 1, 3
ABS_X, ABS_Y = 0, 1
BTN_BASE = 0x120  # BTN_TRIGGER。 SDLは、BTN_JOYSTICK(0x120)から 小さい順に、ボタン番号 0,1,2… を ふる
# SDLのボタン番号 → 使うところ: 0=B(戻る) 1=A(決定) 2〜5=使わない(番号を うめるだけ) 6=セレクト 7=スタート
KEYS = [BTN_BASE + i for i in range(8)]
# クラシックコントローラーの ボタン(16bit。 0 = 押している)。 nutki/rpi-nintendo-classic-controller と同じ割り当て
BIT = {'start': 2, 'select': 4, 'down': 6, 'right': 7, 'up': 8, 'left': 9, 'a': 12, 'b': 14}


def profile_for(ident):
    """パッドの種類ごとの 設定(読む回数, 読みまちがいよけ, 押しをのばす秒)。 無線の受信機(クラシックコントローラーPro: IDの先頭が 01)は 押しが 20〜100msしか出ないので 速く読んで のばす。 有線は 左右を押すと 上下も一瞬まざる癖があるので、よけを強め、のばさない"""
    wireless = (PROFILE == 'wireless') or (PROFILE == 'auto' and len(ident) >= 1 and ident[0] == 0x01)
    if wireless: hz, deb, hold = 200, 5.0, 0.1   # 設定は 時間(ミリ秒)で 決める: 読む回数を かえても 効き目が かわらないように
    else: hz, deb, hold = 50, 50.0, 0.0   # 有線の互換品は 返事が遅く、速く読むと 失敗が つづく(1秒に100回で 実機で 確認)
    if 'MJPAD_HZ' in ENV_SET: hz = HZ
    if 'MJPAD_DEBOUNCE_MS' in ENV_SET: deb = DEBOUNCE_MS
    if 'MJPAD_HOLD' in ENV_SET: hold = HOLD
    return wireless, hz, max(1, int(round(deb * hz / 1000.0))), hold   # 読みまちがいよけは (時間 × 読む回数) の回数に 直して 返す


def decode(word):
    """16bitのボタンの語 → {名前: 押している?}。 読みまちがい(上下どちらかの1バイトが 0)のときは None"""
    if (word & 0xFF) == 0 or (word & 0xFF00) == 0: return None
    return {k: ((word >> b) & 1) == 0 for k, b in BIT.items()}


HOLD = float(os.environ.get('MJPAD_HOLD', '100')) / 1000.0   # 押したのを 最低 この秒数(100ms)は 押したままに する(無線の受信機は、押しても 20〜100ms しか 値が出ないことがある)


class Holder:
    """一瞬だけ読めた押しを、ゲームが 受けとれる長さ(HOLD)まで のばす。 反対の方向(左↔右、上↔下)が 押されたら、すぐに そちらへ ゆずる"""
    def __init__(self, hold=HOLD): self.hold = hold; self.until = {}
    def apply(self, b, now):
        for k, v in b.items():
            if v: self.until[k] = now + self.hold
        eff = {k: (v or self.until.get(k, 0) > now) for k, v in b.items()}
        for a, c in (('left', 'right'), ('up', 'down')):
            if b[a] and not b[c]: eff[c] = False; self.until[c] = 0
            elif b[c] and not b[a]: eff[a] = False; self.until[a] = 0
            elif eff[a] and eff[c]:   # どちらも のこっている: あとから押したほう
                loser = a if self.until.get(a, 0) < self.until.get(c, 0) else c
                eff[loser] = False; self.until[loser] = 0
        return eff


class Debounce:
    """同じ状態が n回つづけて読めたときだけ、新しい状態として 返す"""
    def __init__(self, n): self.n = n; self.cur = None; self.pend = None; self.cnt = 0
    def feed(self, st):
        if st == self.pend: self.cnt += 1
        else: self.pend = st; self.cnt = 1
        if self.cnt >= self.n and st != self.cur: self.cur = st; return st
        return None


def to_state(btn, prev=None, wait_diag=False):
    """押しているボタン → (X軸, Y軸, [8個のボタンの 0/1])"""
    if (btn['left'] and btn['right']) or (btn['up'] and btn['down']): return None   # 左右・上下が 同時は ありえない(読みまちがい)
    x = (1 if btn['right'] else 0) - (1 if btn['left'] else 0)
    y = (1 if btn['down'] else 0) - (1 if btn['up'] else 0)
    if x and y:   # 斜め: この互換品は 左右を押すと 上下も、上下を押すと 左右も 一瞬 触れてしまう(実機で確認)。 斜めは 使わないので、どちらか1つにする
        px, py = (prev[0], prev[1]) if prev else (0, 0)
        if py and not px: x = 0      # すでに 縦を押している → 縦をつづける
        elif px and not py: y = 0    # すでに 横を押している → 横をつづける
        elif wait_diag: return None  # どちらも新しい: すぐには 決めない(しばらく 様子を見て、1方向に落ちついたほうを 使う)
        else: y = 0                  # 様子を見ても 斜めのまま → 横を優先
    ks = [0] * 8
    ks[0] = 1 if btn['b'] else 0
    ks[1] = 1 if btn['a'] else 0
    ks[6] = 1 if btn['select'] else 0
    ks[7] = 1 if btn['start'] else 0
    return x, y, ks


class Pad:
    """uinput の仮想ゲームパッド"""
    def __init__(self, dry=False):
        self.dry = dry; self.fd = None; self.last = None
        if dry: return
        self.fd = os.open('/dev/uinput', os.O_WRONLY | os.O_NONBLOCK)
        fcntl.ioctl(self.fd, UI_SET_EVBIT, EV_KEY); fcntl.ioctl(self.fd, UI_SET_EVBIT, EV_ABS); fcntl.ioctl(self.fd, UI_SET_EVBIT, EV_SYN)
        for k in KEYS: fcntl.ioctl(self.fd, UI_SET_KEYBIT, k)
        for a in (ABS_X, ABS_Y):
            fcntl.ioctl(self.fd, UI_SET_ABSBIT, a)
            fcntl.ioctl(self.fd, UI_ABS_SETUP, struct.pack('<HHiiiiii', a, 0, 0, -1, 1, 0, 0, 0))  # 範囲 -1〜1(SDLが 全部たおした値に そろえる)
        fcntl.ioctl(self.fd, UI_DEV_SETUP, struct.pack('<HHHH80sI', 3, 0x1209, 0x4D4A, 1, b'Mahjong Wii Classic Pad', 0))  # バス=USB
        fcntl.ioctl(self.fd, UI_DEV_CREATE)

    def _ev(self, t, c, v):
        if self.dry: print('  event type=%d code=0x%x value=%d' % (t, c, v), flush=True); return
        os.write(self.fd, struct.pack('llHHi', int(time.time()), 0, t, c, v))

    def send(self, state):
        """変わったところだけ送る"""
        if state == self.last: return
        x, y, ks = state; lx, ly, lk = self.last if self.last else (None, None, [None] * 8)
        if x != lx: self._ev(EV_ABS, ABS_X, x)
        if y != ly: self._ev(EV_ABS, ABS_Y, y)
        for i in range(8):
            if ks[i] != lk[i]: self._ev(EV_KEY, KEYS[i], ks[i])
        self._ev(EV_SYN, 0, 0); self.last = state

    def close(self):
        if self.fd is not None:
            try: fcntl.ioctl(self.fd, UI_DEV_DESTROY)
            except OSError: pass
            os.close(self.fd)


class Bus:
    """I2Cで クラシックコントローラーを読む(/dev/i2c-1)"""
    def __init__(self, n=1):
        self.fd = os.open('/dev/i2c-%d' % n, os.O_RDWR); fcntl.ioctl(self.fd, I2C_SLAVE, ADDR)

    def w(self, *b): os.write(self.fd, bytes(b)); time.sleep(0.005)

    def init(self):
        """はじめの合図。 互換品(レプリカ)でも動くよう、ゆるく: どれかの合図が通れば よい。 ID は 記録するだけ(ちがっていても 使う)"""
        self.ident = b''
        self.w(0xF0, 0x55); self.w(0xFB, 0x00)   # 暗号なし(ふつうの Wii クラシックの合図)
        try: self.w(0xFE, 0x03)   # データの形式 3(6バイト。 ボタンは 4・5バイトめ)。 無線の受信機(クラシックコントローラーPro)は 形式 1 だと ボタンが 6・7バイトめに 移ってしまう。 互換品が 受けつけなくても 気にしない
        except OSError: pass
        os.write(self.fd, b'\xFA'); time.sleep(0.005); self.ident = os.read(self.fd, 6)   # 機器の ID(記録用)
        return len(self.ident) == 6

    def init_old(self):
        """古い形の合図(0x40 0x00)。 うえで だめなときの 2番めの試し"""
        self.w(0x40, 0x00)
        os.write(self.fd, b'\xFA'); time.sleep(0.005); self.ident = os.read(self.fd, 6)
        return len(self.ident) == 6

    CFGS = [(ptr, n, dly) for ptr in (0x04, 0x00) for n in ((2,) if ptr == 0x04 else (6, 8)) for dly in (0.001, 0.003, 0.008, 0.02)]   # n=8: 形式1(ボタンは 6・7バイトめ)の受信機も 読めるように

    def _try(self, ptr, n, dly):
        """番地 ptr を指定して、n バイト読む。 返事までの待ち dly 秒。 ボタンの語(16bit)を返す"""
        time.sleep(0.001); os.write(self.fd, bytes([ptr])); time.sleep(dly)
        d = os.read(self.fd, n)
        if len(d) != n: raise OSError('短い')
        return d[0] | (d[1] << 8) if n == 2 else d[6] | (d[7] << 8) if n == 8 else d[4] | (d[5] << 8)   # 6バイトのときは 4・5バイトめ、 8バイト(形式1)のときは 6・7バイトめが ボタン

    def read(self):
        """ボタンの語を読む。 互換品は 返事が遅いことがあるので、(番地・待ち時間)の組みあわせを 順に試して、動いたものを覚える。
        1回 失敗しても すぐには 探しなおさず、同じ読みかたを もう1回 だけ 試す(探しなおしは 時間が かかり、記録も あれるため)"""
        if getattr(self, 'cfg', None):
            try: return self._try(*self.cfg)
            except OSError:
                time.sleep(0.003)
                try: return self._try(*self.cfg)
                except OSError: self.last_cfg = self.cfg; self.cfg = None   # 2回つづけて だめ: 探しなおす
        last = None
        order = ([getattr(self, 'prefer', None)] if getattr(self, 'prefer', None) else []) + [c for c in self.CFGS if c != getattr(self, 'prefer', None)]   # 有線は、いつも うまくいく読みかたを 先に 試す
        for c in order:
            try:
                w = self._try(*c)
                if decode(w) is not None:
                    self.cfg = c
                    if c != getattr(self, 'last_cfg', None): print('mjpad: read ok ptr=0x%02x n=%d wait=%.0fms' % (c[0], c[1], c[2] * 1000), flush=True)   # 前と ちがうときだけ 記録に出す
                    self.last_cfg = c; return w
            except OSError as e: last = e
        raise last or OSError('読めない')


def selftest():
    allup = 0xFFFF
    assert decode(allup) == {k: False for k in BIT}
    assert decode(0x0000) is None and decode(0xFF00) is None   # 読みまちがい
    def press(*names):
        w = allup
        for n in names: w &= ~(1 << BIT[n])
        return w
    assert to_state(decode(press('a'))) == (0, 0, [0, 1, 0, 0, 0, 0, 0, 0])
    assert to_state(decode(press('b'))) == (0, 0, [1, 0, 0, 0, 0, 0, 0, 0])
    assert to_state(decode(press('left', 'up'))) == (-1, 0, [0] * 8)   # 斜めは 横だけ
    assert to_state(decode(press('right', 'down'))) == (1, 0, [0] * 8)
    assert to_state(decode(press('select', 'start'))) == (0, 0, [0, 0, 0, 0, 0, 0, 1, 1])
    assert to_state(decode(press('left', 'right'))) is None and to_state(decode(press('up', 'down'))) is None
    assert to_state(decode(press('left', 'up')))[:2] == (-1, 0)                       # 斜め(どちらも新しい)・様子見をしない → 横
    assert to_state(decode(press('left', 'up')), None, True) is None                  # 様子を見る間は 決めない
    assert to_state(decode(press('up', 'right')), (0, 0, [0] * 8), True) is None
    assert to_state(decode(press('left', 'up')), (-1, 0, [0] * 8))[:2] == (-1, 0)     # 左を押している途中に 上が混じる → 左のまま
    assert to_state(decode(press('left', 'up')), (0, -1, [0] * 8))[:2] == (0, -1)     # 上を押している途中に 左が混じる → 上のまま
    assert to_state(decode(press('right', 'down')), (1, 0, [0] * 8))[:2] == (1, 0)
    d = Debounce(2); A, B = (0, 0, [0] * 8), (-1, 0, [0] * 8)
    assert d.feed(A) is None and d.feed(A) == A and d.feed(A) is None   # 2回つづいて はじめて A
    assert d.feed(B) is None and d.feed(A) is None and d.feed(A) is None   # 1回だけの B(読みまちがい)は 通らない
    assert d.feed(B) is None and d.feed(B) == B   # 2回つづけば B
    h = Holder(0.1); z = {k: False for k in BIT}; r = dict(z, right=True)
    e = h.apply(r, 0.0); assert e['right']                                       # 押した
    e = h.apply(z, 0.03); assert e['right']                                      # 30ms: まだ のばして いる
    e = h.apply(z, 0.2); assert not e['right']                                   # 200ms: もう はなした
    h = Holder(0.1); h.apply(dict(z, left=True), 0.0); e = h.apply(dict(z, right=True), 0.02); assert e['right'] and not e['left']   # 反対方向は すぐ ゆずる
    print('selftest OK')


def probe():
    """調べる用(英数字だけで出す: 実機の画面の文字では 日本語が ◆ になるため)。 返事・ID・生の値を 0.5秒ごとに 出す。 ボタンを押すと 値が かわる。 (先に: sudo systemctl stop mjpad)
    出力の見かた: INIT=はじめの合図 / ID=機器の番号 / RAW6=番地0から読んだ6バイト / RAW2=番地4から読んだ2バイト(ボタン) / CHG=前から かわった / BTN=読みとれたボタン"""
    bus = Bus()
    print('mjpad probe (addr 0x52, i2c-1)', flush=True)
    for name, f in (('A(F0 55, FB 00)', bus.init), ('B(40 00)', bus.init_old)):
        try: ok = f(); print('INIT %s -> %s id=%s' % (name, 'OK' if ok else 'NO-REPLY', bus.ident.hex()), flush=True)
        except OSError as e: print('INIT %s -> ERROR %s' % (name, e), flush=True)
    try: bus.init()
    except OSError: pass
    print('--- press buttons now (20 s) ---', flush=True)
    prev = None; chg = 0; seen = set(); ok_n = 0; err_n = 0
    for i in range(40):
        line = ['%2d' % i]
        try:
            os.write(bus.fd, bytes([0x00])); time.sleep(0.003); r6 = os.read(bus.fd, 8)
            line.append('RAW8=' + r6.hex(' '))
            time.sleep(0.003); os.write(bus.fd, bytes([0x04])); time.sleep(0.003); r2 = os.read(bus.fd, 2)
            line.append('RAW2=' + r2.hex(' '))
            cur = r6 + r2
            if prev is not None and cur != prev: line.append('CHG'); chg += 1
            prev = cur; ok_n += 1
            for lo, hi in ((4, 5), (6, 7)):   # 形式3(4・5バイトめ) と 形式1(6・7バイトめ)の どちらかに ボタンがある
                if len(r6) > hi:
                    b = decode(r6[lo] | (r6[hi] << 8))
                    if b:
                        names = [k for k, v in b.items() if v]; seen.update(names); line.append('BTN@%d=%s' % (lo, ','.join(names) or '-'))
        except OSError as e:
            line.append('ERROR %s' % e); err_n += 1
        print(' '.join(line), flush=True); time.sleep(0.5)
    print('SUMMARY reads_ok=%d errors=%d changes=%d buttons_seen=%s' % (ok_n, err_n, chg, sorted(seen) or 'none'), flush=True)


def watch(secs=20):
    """調べる用(英数字で出す): ボタンの値を 100回/秒で 読み、値が 変わったときだけ 時刻つきで出す。 40ms より短く 消えた入力は SHORT と しるす。 (先に: sudo systemctl stop mjpad)"""
    bus = Bus()
    if not (bus.init() or bus.init_old()): print('no reply'); return
    print('id=%s  press and release the d-pad / A / B  (%d s). Ctrl+C = stop' % (bus.ident.hex(), secs), flush=True)
    last = None; t0 = time.time(); start = {}; total = {}; short = {}; bad = 0; errs = 0
    try:
        while time.time() - t0 < secs:
            now = time.time()
            try: w = bus.read()
            except OSError as e: errs += 1; print('%6.0fms ERROR %s' % ((now - t0) * 1000, e), flush=True); time.sleep(0.05); continue
            b = decode(w)
            if w != last:
                last = w
                if b is None: bad += 1
                names = [k for k, v in b.items() if v] if b else ['(bad-read)']
                warn = '  IMPOSSIBLE(left+right or up+down)' if b and ((b['left'] and b['right']) or (b['up'] and b['down'])) else ''
                note = ''
                if b:
                    pressed = {k for k, v in b.items() if v}
                    for k in pressed - set(start): start[k] = now; total[k] = total.get(k, 0) + 1
                    for k in set(start) - pressed:
                        d = now - start.pop(k)
                        if d < 0.04: short[k] = short.get(k, 0) + 1; note += '  SHORT %s %.0fms' % (k, d * 1000)
                print('%6.0fms  word=%04x  %s%s%s' % ((now - t0) * 1000, w, ' '.join(names) or '(none)', warn, note), flush=True)
            time.sleep(0.001)
    except KeyboardInterrupt: pass
    print('--- summary (presses / of which shorter than 40ms) ---', flush=True)
    for k in BIT: print('%-7s %3d / short %d' % (k, total.get(k, 0), short.get(k, 0)), flush=True)
    print('bad reads %d / read errors %d' % (bad, errs), flush=True)


def rawwatch(secs=20):
    """調べる用(英数字): 受信機の 8バイトを 約1msごとに 全部読み、どこか1つでも かわったら 時刻つきで 出す。 速いクリックで ボタンの語いがいに 痕跡が 出るかを 見る。 (先に: sudo systemctl stop mjpad)"""
    bus = Bus()
    if not (bus.init() or bus.init_old()): print('no reply'); return
    print('rawwatch %d s: click UP and RIGHT quickly, many times. Every change of any of the 8 bytes is printed.' % secs, flush=True)
    last = None; t0 = time.time(); n = 0; reads = 0; errs = 0
    try:
        while time.time() - t0 < secs:
            try:
                os.write(bus.fd, b'\x00'); time.sleep(0.0008); d = os.read(bus.fd, 8)
            except OSError: errs += 1; time.sleep(0.002); continue
            reads += 1
            if d != last:
                if last is not None:
                    diff = ''.join('^^ ' if d[i] != last[i] else '   ' for i in range(min(len(d), len(last))))
                    n += 1; print('%6.0fms %s\n         %s' % ((time.time() - t0) * 1000, d.hex(' '), diff), flush=True)
                else: print('start    %s' % d.hex(' '), flush=True)
                last = d
    except KeyboardInterrupt: pass
    print('rawwatch done: changes=%d reads=%d (%.0f reads/s) errors=%d' % (n, reads, reads / max(0.1, time.time() - t0), errs), flush=True)


def trace(secs=30):
    """調べる用(英数字): ふだんの動き(読む→斜めの整理→読みまちがいよけ)を 動かして、「押した回数」と「ゲームに送った回数」を ならべる。 どこで 取りこぼすかを 見る。 (先に: sudo systemctl stop mjpad)"""
    bus = Bus()
    if not (bus.init() or bus.init_old()): print('no reply'); return
    wl, hz, dn, hd = profile_for(bus.ident); deb = Debounce(dn); pad = Pad(True); pad.send = lambda st: None
    print('profile=%s hz=%d debounce=%d reads hold=%.0fms' % ('wireless' if wl else 'wired', hz, dn, hd * 1000), flush=True)
    raw = {k: 0 for k in BIT}; sent = {'left': 0, 'right': 0, 'up': 0, 'down': 0, 'a': 0, 'b': 0}
    prev = {k: False for k in BIT}; last_out = (0, 0, [0] * 8); diag_n = 0; t0 = time.time(); drop_diag = 0; reads = 0; bad = 0; hold = Holder(hd)
    print('trace %d s: press each d-pad direction 10 times, A and B too. Ctrl+C = stop' % secs, flush=True)
    try:
        while time.time() - t0 < secs:
            try: w = bus.read()
            except OSError: time.sleep(0.05); continue
            reads += 1; b = decode(w)
            if b is None: bad += 1; time.sleep(1.0 / hz); continue
            for k in BIT:
                if b[k] and not prev[k]: raw[k] += 1
            prev = dict(b); b = hold.apply(b, time.time())
            dg = b['left'] != b['right'] and b['up'] != b['down']; diag_n = diag_n + 1 if dg else 0
            st = to_state(b, last_out, wait_diag=diag_n <= DIAG_MS * hz / 1000.0)
            if dg and st is None: drop_diag += 1
            if st is not None:
                out = deb.feed(st)
                if out is not None:
                    x0, y0, k0 = last_out; x1, y1, k1 = out
                    if x1 == -1 and x0 != -1: sent['left'] += 1
                    if x1 == 1 and x0 != 1: sent['right'] += 1
                    if y1 == -1 and y0 != -1: sent['up'] += 1
                    if y1 == 1 and y0 != 1: sent['down'] += 1
                    if k1[1] and not k0[1]: sent['a'] += 1
                    if k1[0] and not k0[0]: sent['b'] += 1
                    last_out = out
            time.sleep(1.0 / hz)
    except KeyboardInterrupt: pass
    print('--- presses seen on the wire -> sent to the game ---', flush=True)
    for k in ('left', 'right', 'up', 'down', 'a', 'b'): print('%-6s raw %3d -> sent %3d' % (k, raw[k], sent[k]), flush=True)
    print('reads %d, bad %d, diag-waiting %d, HZ=%d DEBOUNCE=%d reads' % (reads, bad, drop_diag, hz, dn), flush=True)


def main():
    if '--selftest' in sys.argv: selftest(); return
    if '--probe' in sys.argv: probe(); return
    if '--rawwatch' in sys.argv:
        i = sys.argv.index('--rawwatch'); rawwatch(int(sys.argv[i + 1]) if i + 1 < len(sys.argv) and sys.argv[i + 1].isdigit() else 20); return
    if '--trace' in sys.argv:
        i = sys.argv.index('--trace'); trace(int(sys.argv[i + 1]) if i + 1 < len(sys.argv) and sys.argv[i + 1].isdigit() else 30); return
    if '--watch' in sys.argv:
        i = sys.argv.index('--watch'); watch(int(sys.argv[i + 1]) if i + 1 < len(sys.argv) and sys.argv[i + 1].isdigit() else 20); return
    dry = '--dry' in sys.argv
    fake = None
    if '--fake' in sys.argv: fake = [int(x, 16) for x in sys.argv[sys.argv.index('--fake') + 1].split(',')]
    pad = Pad(dry)
    print('mjpad: start dry=%s fake=%s' % (dry, bool(fake)), flush=True)
    if fake:   # 試験: 並べた値を 1つずつ 読んだことにする
        for w in fake:
            b = decode(w); print('word 0x%04x ->' % w, b and [k for k, v in b.items() if v], flush=True)
            if b: pad.send(to_state(b))
        pad.close(); return
    try: os.nice(-5)   # ゲームより 少し 優先(ゲームが CPU を使っていても、読む間隔が くずれないように)
    except OSError: pass
    bus = None; bad = 0; ok_once = False; was_down = False; pad_seq = 0; deb = Debounce(1); diag_n = 0; hold = Holder(); t_loop = time.time(); hz = HZ; t_cpu = time.time(); cpu0 = sum(os.times()[:2]); t_start = t_cpu
    while True:
        try:
            if bus is None:
                bus = Bus()
                if not (bus.init() or bus.init_old()): raise OSError('返事がない(コントローラーが つながっていない?)')
                wl, hz, dn, hd = profile_for(bus.ident); deb = Debounce(dn); hold = Holder(hd); t_loop = time.time()
                bus.prefer = None if wl else (0x00, 6, 0.008)   # 有線の互換品: 番地0・6バイト・返事を8ms待つ が 実機で いちばん 安定した
                print('mjpad: controller ready id=%s profile=%s hz=%d debounce=%d hold=%.0fms' % (bus.ident.hex(), 'wireless' if wl else 'wired', hz, dn, hd * 1000), flush=True); bad = 0; ok_once = True
                if was_down:   # つながっていなかったのが、つながった: ブザー(mjbuzz)に 知らせて「ピッピッ」と 鳴らす
                    pad_seq += 1
                    try: open('/dev/shm/mj_pad.txt', 'w').write('seq=%d\nid=%s\n' % (pad_seq, bus.ident.hex()))
                    except OSError: pass
                was_down = False
            w = bus.read(); b = decode(w) if w is not None else None
            if b is None:
                bad += 1
                if bad >= 20: raise OSError('読みまちがいが つづいた')
            else:
                bad = 0; b = hold.apply(b, time.time()); dg = b['left'] != b['right'] and b['up'] != b['down']   # 斜め
                diag_n = diag_n + 1 if dg else 0
                st = to_state(b, pad.last, wait_diag=diag_n <= DIAG_MS * hz / 1000.0)   # 斜めが 約0.12秒つづいたら、横を優先して 決める(時間で 数える)
                if st is not None:
                    out = deb.feed(st)
                    if out is not None: pad.send(out)
        except OSError as e:
            if ok_once or bad: print('mjpad: %s' % e, flush=True)
            ok_once = False; was_down = True
            if bus is not None:
                try: os.close(bus.fd)
                except OSError: pass
                bus = None
            pad.send((0, 0, [0] * 8))   # つながっていない間は、ボタンを すべて はなした ことにする
            time.sleep(1.0); continue
        now = time.time()
        if now - t_cpu >= 60 and now - t_start < 660:   # 起動して 10分のあいだ、1分ごとに 自分の CPU 使用率を 記録に出す(負担の確認用)
            c1 = sum(os.times()[:2]); print('mjpad: cpu %.1f%% (hz=%d)' % ((c1 - cpu0) / (now - t_cpu) * 100, hz), flush=True); t_cpu = now; cpu0 = c1
        t_loop += 1.0 / hz; dt = t_loop - time.time()   # 読むのに かかった時間を ひいて、周期を そろえる
        if dt > 0: time.sleep(dt)
        else: t_loop = time.time()


if __name__ == '__main__':
    main()
