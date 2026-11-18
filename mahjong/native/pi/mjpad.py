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
HZ = int(os.environ.get('MJPAD_HZ', '40'))   # 1秒に読む回数(40回=25ms)。 Pi Zero は CPU が1つだけで、ゲームと取りあうので、多くしすぎない
DEBOUNCE = int(os.environ.get('MJPAD_DEBOUNCE', '2'))   # 同じ値が この回数 つづけて読めたときだけ、ゲームに伝える(読みまちがいの 一瞬の「左」などを 通さない)
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


def decode(word):
    """16bitのボタンの語 → {名前: 押している?}。 読みまちがい(上下どちらかの1バイトが 0)のときは None"""
    if (word & 0xFF) == 0 or (word & 0xFF00) == 0: return None
    return {k: ((word >> b) & 1) == 0 for k, b in BIT.items()}


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
        try: self.w(0xFE, 0x01)   # ふつうの形式。 互換品が 受けつけなくても 気にしない
        except OSError: pass
        os.write(self.fd, b'\xFA'); time.sleep(0.005); self.ident = os.read(self.fd, 6)   # 機器の ID(記録用)
        return len(self.ident) == 6

    def init_old(self):
        """古い形の合図(0x40 0x00)。 うえで だめなときの 2番めの試し"""
        self.w(0x40, 0x00)
        os.write(self.fd, b'\xFA'); time.sleep(0.005); self.ident = os.read(self.fd, 6)
        return len(self.ident) == 6

    CFGS = [(ptr, n, dly) for ptr in (0x04, 0x00) for n in ((2,) if ptr == 0x04 else (6,)) for dly in (0.001, 0.003, 0.008, 0.02)]

    def _try(self, ptr, n, dly):
        """番地 ptr を指定して、n バイト読む。 返事までの待ち dly 秒。 ボタンの語(16bit)を返す"""
        time.sleep(0.001); os.write(self.fd, bytes([ptr])); time.sleep(dly)
        d = os.read(self.fd, n)
        if len(d) != n: raise OSError('短い')
        return d[0] | (d[1] << 8) if n == 2 else d[4] | (d[5] << 8)   # 6バイトのときは、4・5バイトめが ボタン

    def read(self):
        """ボタンの語を読む。 互換品は 返事が遅いことがあるので、(番地・待ち時間)の組みあわせを 順に試して、動いたものを覚える"""
        if getattr(self, 'cfg', None):
            try: return self._try(*self.cfg)
            except OSError: self.cfg = None   # 動かなくなった: 探しなおす
        last = None
        for c in self.CFGS:
            try:
                w = self._try(*c)
                if decode(w) is not None: self.cfg = c; print('mjpad: read ok ptr=0x%02x n=%d wait=%.0fms' % (c[0], c[1], c[2] * 1000), flush=True); return w
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
    print('selftest OK')


def probe():
    """調べる用: 返事・ID・生の値を 0.5秒ごとに 出す。 ボタンを押すと 値が かわる。 (先に: sudo systemctl stop mjpad)"""
    bus = Bus()
    for name, f in (('合図A(0xF0 0x55 ...)', bus.init), ('合図B(0x40 0x00)', bus.init_old)):
        try: ok = f(); print('%s -> %s  id=%s' % (name, '返事あり' if ok else '返事なし', bus.ident.hex()), flush=True)
        except OSError as e: print('%s -> エラー %s' % (name, e), flush=True)
    print('--- 読みかた(番地・待ち時間)ごとの結果 ---', flush=True)
    for c in Bus.CFGS:
        try: w = bus._try(*c); b = decode(w); print('番地0x%02x %dバイト 待ち%3.0fms -> %04x %s' % (c[0], c[1], c[2] * 1000, w, [k for k, v in b.items() if v] if b else '(読みまちがい)'), flush=True)
        except OSError as e: print('番地0x%02x %dバイト 待ち%3.0fms -> エラー %s' % (c[0], c[1], c[2] * 1000, e), flush=True)
    print('--- ボタンを押して、値が かわるか(20秒) ---', flush=True)
    for _ in range(40):
        try:
            w = bus.read(); b = decode(w) if w is not None else None
            print('ボタン語=%04x  押している=%s' % (w, [k for k, v in b.items() if v] if b else '(読みまちがい)'), flush=True)
        except OSError as e: print('エラー %s' % e, flush=True)
        time.sleep(0.5)


def watch(secs=20):
    """調べる用: ボタンの値を 100回/秒で 読み、値が 変わったときだけ、時刻(ミリ秒)つきで 出す。 十字キーを 押して 離して みて、一瞬 ちがう方向が 混じらないか 見る。
    40ミリ秒より 短く 消えた入力は 「←一瞬だけ」と しるし、おわりに ボタンごとの 回数を まとめる。 (先に: sudo systemctl stop mjpad / あとで: sudo systemctl start mjpad)"""
    bus = Bus()
    if not (bus.init() or bus.init_old()): print('返事がない'); return
    print('id=%s  十字キー・A・B を 押して 離してください(%d秒)。 Ctrl+C で とちゅう終了' % (bus.ident.hex(), secs), flush=True)
    last = None; t0 = time.time(); start = {}; total = {}; short = {}; bad = 0; errs = 0
    try:
        while time.time() - t0 < secs:
            now = time.time()
            try: w = bus.read()
            except OSError as e: errs += 1; print('%6.0fms エラー %s' % ((now - t0) * 1000, e), flush=True); time.sleep(0.05); continue
            b = decode(w)
            if w != last:
                last = w
                if b is None: bad += 1
                names = [k for k, v in b.items() if v] if b else ['(読みまちがい)']
                warn = '  ←あり得ない(左右か上下が同時)' if b and ((b['left'] and b['right']) or (b['up'] and b['down'])) else ''
                note = ''
                if b:
                    pressed = {k for k, v in b.items() if v}
                    for k in pressed - set(start): start[k] = now; total[k] = total.get(k, 0) + 1
                    for k in set(start) - pressed:
                        d = now - start.pop(k)
                        if d < 0.04: short[k] = short.get(k, 0) + 1; note += '  ←%s が 一瞬だけ(%.0fms)' % (k, d * 1000)
                print('%6.0fms  語=%04x  %s%s%s' % ((now - t0) * 1000, w, ' '.join(names) or '(なにも押していない)', warn, note), flush=True)
            time.sleep(0.01)
    except KeyboardInterrupt: pass
    print('--- まとめ(押した回数 / うち 40ms未満の一瞬だけ) ---', flush=True)
    for k in BIT: print('%-7s %3d回 / 一瞬だけ %d回' % (k, total.get(k, 0), short.get(k, 0)), flush=True)
    print('読みまちがい %d回 / 読みエラー %d回' % (bad, errs), flush=True)


def main():
    if '--selftest' in sys.argv: selftest(); return
    if '--probe' in sys.argv: probe(); return
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
    bus = None; bad = 0; ok_once = False; deb = Debounce(DEBOUNCE); diag_n = 0
    while True:
        try:
            if bus is None:
                bus = Bus()
                if not (bus.init() or bus.init_old()): raise OSError('返事がない(コントローラーが つながっていない?)')
                print('mjpad: controller ready id=%s' % bus.ident.hex(), flush=True); bad = 0; ok_once = True
            w = bus.read(); b = decode(w) if w is not None else None
            if b is None:
                bad += 1
                if bad >= 20: raise OSError('読みまちがいが つづいた')
            else:
                bad = 0; dg = b['left'] != b['right'] and b['up'] != b['down']   # 斜め
                diag_n = diag_n + 1 if dg else 0
                st = to_state(b, pad.last, wait_diag=diag_n <= 4)   # 斜めが 5回(約0.12秒)つづいたら、横を優先して 決める
                if st is not None:
                    out = deb.feed(st)
                    if out is not None: pad.send(out)
        except OSError as e:
            if ok_once or bad: print('mjpad: %s' % e, flush=True)
            ok_once = False
            if bus is not None:
                try: os.close(bus.fd)
                except OSError: pass
                bus = None
            pad.send((0, 0, [0] * 8))   # つながっていない間は、ボタンを すべて はなした ことにする
            time.sleep(1.0); continue
        time.sleep(1.0 / HZ)


if __name__ == '__main__':
    main()
