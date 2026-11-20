#!/usr/bin/env python3
"""OLED(SSD1306 / SH1106、I2C)に、麻雀先生のパタパタアニメと、ゲームの状態(フレームレートなど)を出す常駐プログラム。
 つなぎ方: GND=物理6番 / VCC=3.3V=物理1番 / SCL=GPIO22(物理15番) / SDA=GPIO23(物理16番)
   config.txt に  dtoverlay=i2c-gpio,bus=3,i2c_gpio_sda=23,i2c_gpio_scl=22   (bus番号は 空いている数字。 自動で さがします)
 ゲーム(mj)が /tmp/mj_oled.txt に書く「状態」を読んで、表示する。 ゲームが動いていないときは、本体の温度・負荷を出す。
 使うのは 標準ライブラリだけ。 CPUは ほとんど使わない(変わった所だけを送る・1秒に3コマまで・いちばん低い優先度)。
 環境変数: MJOLED_BUS(i2cの番号。 なければ自動) MJOLED_ADDR(0x3C) MJOLED_H(64 か 32) MJOLED_DRV(ssd1306 か sh1106)
           MJOLED_FLIP=1(上下左右を逆に) MJOLED_FPS(3) MJOLED_FILE(/tmp/mj_oled.txt)
 試験用: python3 mjoled.py --selftest(画面の絵を文字で出す) / --demo(ゲームなしで、場面を順に見せる) / --dry(I2Cなし)"""
import fcntl, glob, os, sys, time

try:
    from oled_sprites import W as SW_, H as SH_, POSES
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from oled_sprites import W as SW_, H as SH_, POSES

try:
    from oled_jp import G as JP
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try: from oled_jp import G as JP
    except ImportError: JP = {}
JPB = {c: [int(v[i:i + 4], 16) for i in range(0, 64, 4)] for c, v in JP.items()}   # 16x16の文字: 16行ぶん
I2C_SLAVE = 0x0703
ADDR = int(os.environ.get('MJOLED_ADDR', '0x3C'), 0)
HEIGHT = int(os.environ.get('MJOLED_H', '64'))
DRV = os.environ.get('MJOLED_DRV', 'ssd1306').lower()
FLIP = os.environ.get('MJOLED_FLIP', '') not in ('', '0')
FPS = max(1.0, float(os.environ.get('MJOLED_FPS', '3')))
STATUS = os.environ.get('MJOLED_FILE', '/tmp/mj_oled.txt')
WIDTH = 128
PAGES = HEIGHT // 8
COLOFF = 2 if DRV == 'sh1106' else 0   # SH1106 は 132列のうち、左の2列が 見えない

# ---- 5x7 の文字(1文字 = 縦の5列。 下位ビットが上) ----
F = {
 ' ': (0x00, 0x00, 0x00, 0x00, 0x00), '!': (0x00, 0x00, 0x5F, 0x00, 0x00), '%': (0x23, 0x13, 0x08, 0x64, 0x62),
 '+': (0x08, 0x08, 0x3E, 0x08, 0x08), '-': (0x08, 0x08, 0x08, 0x08, 0x08), '.': (0x00, 0x60, 0x60, 0x00, 0x00),
 '/': (0x20, 0x10, 0x08, 0x04, 0x02), ':': (0x00, 0x36, 0x36, 0x00, 0x00), '=': (0x14, 0x14, 0x14, 0x14, 0x14),
 '?': (0x02, 0x01, 0x51, 0x09, 0x06), '(': (0x00, 0x1C, 0x22, 0x41, 0x00), ')': (0x00, 0x41, 0x22, 0x1C, 0x00),
 '0': (0x3E, 0x51, 0x49, 0x45, 0x3E), '1': (0x00, 0x42, 0x7F, 0x40, 0x00), '2': (0x42, 0x61, 0x51, 0x49, 0x46),
 '3': (0x21, 0x41, 0x45, 0x4B, 0x31), '4': (0x18, 0x14, 0x12, 0x7F, 0x10), '5': (0x27, 0x45, 0x45, 0x45, 0x39),
 '6': (0x3C, 0x4A, 0x49, 0x49, 0x30), '7': (0x01, 0x71, 0x09, 0x05, 0x03), '8': (0x36, 0x49, 0x49, 0x49, 0x36),
 '9': (0x06, 0x49, 0x49, 0x29, 0x1E),
 'A': (0x7E, 0x11, 0x11, 0x11, 0x7E), 'B': (0x7F, 0x49, 0x49, 0x49, 0x36), 'C': (0x3E, 0x41, 0x41, 0x41, 0x22),
 'D': (0x7F, 0x41, 0x41, 0x22, 0x1C), 'E': (0x7F, 0x49, 0x49, 0x49, 0x41), 'F': (0x7F, 0x09, 0x09, 0x09, 0x01),
 'G': (0x3E, 0x41, 0x49, 0x49, 0x7A), 'H': (0x7F, 0x08, 0x08, 0x08, 0x7F), 'I': (0x00, 0x41, 0x7F, 0x41, 0x00),
 'J': (0x20, 0x40, 0x41, 0x3F, 0x01), 'K': (0x7F, 0x08, 0x14, 0x22, 0x41), 'L': (0x7F, 0x40, 0x40, 0x40, 0x40),
 'M': (0x7F, 0x02, 0x0C, 0x02, 0x7F), 'N': (0x7F, 0x04, 0x08, 0x10, 0x7F), 'O': (0x3E, 0x41, 0x41, 0x41, 0x3E),
 'P': (0x7F, 0x09, 0x09, 0x09, 0x06), 'Q': (0x3E, 0x41, 0x51, 0x21, 0x5E), 'R': (0x7F, 0x09, 0x19, 0x29, 0x46),
 'S': (0x46, 0x49, 0x49, 0x49, 0x31), 'T': (0x01, 0x01, 0x7F, 0x01, 0x01), 'U': (0x3F, 0x40, 0x40, 0x40, 0x3F),
 'V': (0x1F, 0x20, 0x40, 0x20, 0x1F), 'W': (0x3F, 0x40, 0x38, 0x40, 0x3F), 'X': (0x63, 0x14, 0x08, 0x14, 0x63),
 'Y': (0x07, 0x08, 0x70, 0x08, 0x07), 'Z': (0x61, 0x51, 0x49, 0x45, 0x43),
}

# ---- 場面 → 麻雀先生の2つのポーズ(パタパタ。 番号は oled_sprites.POSES の 0〜17) ----
POSE = {
    'hello': (7, 1), 'home': (6, 7), 'teach': (0, 3), 'think': (4, 5), 'think2': (2, 4), 'watch': (1, 7),
    'call': (8, 14), 'win': (12, 13), 'power': (16, 12), 'sad': (10, 4), 'angry': (9, 15), 'calm': (7, 17),
    'celebrate': (16, 13), 'pray': (11, 17), 'sleep': (7, 17), 'err': (10, 0),
}
TEXT_X = SW_ + 4

class Screen:
    """画面の絵(縦8ドット=1バイトの並び)"""
    def __init__(self): self.buf = [bytearray(WIDTH) for _ in range(PAGES)]
    def clear(self):
        for p in self.buf:
            for i in range(WIDTH): p[i] = 0
    def sprite(self, idx, x0, y0):   # y0 は 8の倍数
        data = POSES[idx]; pg0 = y0 // 8
        for pg in range(SH_ // 8):
            if pg0 + pg >= PAGES: break
            row = self.buf[pg0 + pg]
            for x in range(SW_):
                if x0 + x < WIDTH: row[x0 + x] = data[pg * SW_ + x]
    def pixel_on(self, x, y):
        return (self.buf[y // 8][x] >> (y % 8)) & 1
    def text(self, s, x, y, inv=False):   # y は どこでもよい(ページをまたぐ)。 inv=True は 白地に黒文字の帯
        if inv: y += 1; self.box(x - 1, y - 1, 6 * len(s) + 1, 9, 1)   # 帯が 画面の上にはみ出さないように 1ドット下げる
        for ch in s.upper():
            g = F.get(ch, F['?'])
            for c in range(5):
                col = g[c]
                for r in range(7):
                    if (col >> r) & 1: self._set(x + c, y + r, 0 if inv else 1)
            x += 6
    def text16(self, s, x, y, inv=False):
        """日本語まじりの文字(漢字・かなは16x16、英数字は5x7)。 inv=True は 白地に黒文字の帯(高さ16)"""
        w = sum(16 if ch in JPB else 6 for ch in s)
        if inv: self.box(x - 1, y, w + 1, 16, 1)
        for ch in s:
            if ch in JPB:
                rows = JPB[ch]
                for r in range(16):
                    v = rows[r]
                    for c in range(16):
                        if (v >> (15 - c)) & 1: self._set(x + c, y + r, 0 if inv else 1)
                x += 16
            else:
                g = F.get(ch.upper(), F['?'])
                for c in range(5):
                    col = g[c]
                    for r in range(7):
                        if (col >> r) & 1: self._set(x + c, y + 4 + r, 0 if inv else 1)
                x += 6
    def box(self, x, y, w, h, on=1):
        for yy in range(y, y + h):
            for xx in range(x, x + w): self._set(xx, yy, on)
    def _set(self, x, y, on):
        if x < 0 or y < 0 or x >= WIDTH or y >= HEIGHT: return
        if on: self.buf[y // 8][x] |= 1 << (y % 8)
        else: self.buf[y // 8][x] &= ~(1 << (y % 8))
    def ascii(self):
        return '\n'.join(''.join('#' if self.pixel_on(x, y) else '.' for x in range(WIDTH)) for y in range(HEIGHT))

def read_status(path):
    try:
        st = os.stat(path)
        with open(path, 'r', encoding='utf-8', errors='ignore') as f: txt = f.read()
    except OSError:
        return None, 1e9
    d = {}
    for line in txt.splitlines():
        if '=' in line:
            k, v = line.split('=', 1); d[k.strip()] = v.strip()
    return d, time.time() - st.st_mtime

_cache = {'t': 0, 'v': None}
def sysinfo():
    """(CPU温度, 負荷, 使用メモリMB, スワップMB, メモリの混みぐあい%, ゲームのメモリMB)。 重くならないよう 2秒に1回だけ読む"""
    now = time.time()
    if _cache['v'] is not None and now - _cache['t'] < 2.0: return _cache['v']
    t = '--'
    try:
        with open('/sys/class/thermal/thermal_zone0/temp') as f: t = '%dC' % (int(f.read()) // 1000)
    except Exception: pass
    la = '--'
    try:
        with open('/proc/loadavg') as f: la = f.read().split()[0]
    except Exception: pass
    mem = sw = '--'
    try:
        m = {}
        with open('/proc/meminfo') as f:
            for line in f:
                k, v = line.split(':', 1); m[k] = int(v.split()[0])
        mem = '%d' % (m.get('MemAvailable', 0) // 1024); sw = '%d' % ((m.get('SwapTotal', 0) - m.get('SwapFree', 0)) // 1024)   # mem = まだ使える空き(MB)。 小さいほど あぶない
    except Exception: pass
    psi = '--'
    try:
        with open('/proc/pressure/memory') as f:
            for line in f:
                if line.startswith('some'): psi = '%d' % float(line.split('avg10=')[1].split()[0])
    except Exception: pass
    gm = '--'
    try:
        for d in os.listdir('/proc'):
            if d.isdigit():
                try:
                    with open('/proc/%s/comm' % d) as f: nm = f.read().strip()
                except Exception: continue
                if nm == 'mj':
                    with open('/proc/%s/status' % d) as f:
                        for line in f:
                            if line.startswith('VmRSS:'): gm = '%d' % (int(line.split()[1]) // 1024)
                    break
    except Exception: pass
    _cache['v'] = (t, la, mem, sw, psi, gm); _cache['t'] = now
    return _cache['v']

def uptime():
    try:
        with open('/proc/uptime') as f: return float(f.read().split()[0])
    except Exception: return 0.0

def num(d, k, suffix='', default='--'):
    v = d.get(k, '')
    return (v + suffix) if v not in ('', None) else default

ROW_Y = 18   # 数字の行の はじまり(上の16ドットは 日本語の見出し)
def compose(scr, d, age, tick, ever_alive=False):
    """状態 d(ゲームが書いたもの。 None ならゲームは動いていない)から、1コマぶんの画面を作る。
    起動してすぐ(まだゲームが始まっていない間)は「ゲーム起動中」、ゲームが終わったあとは「抜いてね」を出す"""
    scr.clear()
    scene = d.get('scene', '') if d else ''
    final = d is not None and d.get('scene') in ('EXIT', 'MAINT')   # ゲームが 終わった印(時間がたっても そのまま出す)
    alive = d is not None and (age < 4.0 or final)
    up = uptime()
    booting = (not alive) and (not ever_alive) and up < 150
    if alive: pose = d.get('pose', 'watch')
    elif booting: pose = 'hello'
    elif ever_alive: pose = 'err'
    else: pose = 'sleep'
    a, b = POSE.get(pose, POSE['watch'])
    scr.sprite(a if (tick % 2 == 0) else b, 0, 8 if PAGES >= 7 else 0)
    t, la, mem, sw, psi, gm = sysinfo()
    def rows_at(y0, rows, step=9):
        for i, r in enumerate(rows):
            yy = y0 + i * step
            if r and yy + 7 <= HEIGHT: scr.text(r[:14], TEXT_X, yy)
    if booting:
        scr.text16('麻雀先生', TEXT_X, 0); scr.text16('ゲーム', TEXT_X, 18); scr.text16('起動中' + '.' * (tick % 4), TEXT_X, 34)
        rows_at(54, ['WAIT %dS' % int(up)])
    elif alive and final:
        if d.get('scene') == 'EXIT': scr.text16('終了', TEXT_X, 0, inv=True); scr.text16('電源を', TEXT_X, 18); scr.text16('抜いてね', TEXT_X, 34)
        else: scr.text16('保守', TEXT_X, 0, inv=True); rows_at(24, ['CTRL+Q', 'READY'])
        rows_at(54, ['T' + t + ' F' + mem])
    elif alive:
        msg = d.get('msg', '')
        if msg: scr.text16(msg[:5], TEXT_X, 0, inv=True)
        else: scr.text16(scene[:5], TEXT_X, 0)
        rows = ['SPD ' + num(d, 'spd', 'FPS'), 'DRAW ' + num(d, 'draw') + ' MAX ' + num(d, 'max'), 'KEY ' + num(d, 'key', 'MS') + ' T' + t,
                'FREE ' + mem + ' SW ' + sw + 'M', 'GAME ' + gm + 'M P' + psi + '%']
        if d.get('audio') not in (None, '', 'ok'): rows[4] = 'AUDIO STOP'
        rows_at(ROW_Y, rows)
    else:
        if ever_alive: scr.text16('停止!', TEXT_X, 0, inv=True)
        else: scr.text16('待機中', TEXT_X, 0)
        rows_at(ROW_Y + 4, ['TEMP ' + t, 'LOAD ' + la, 'FREE ' + mem + ' SW ' + sw + 'M'])
    return scr

# ---------- I2C ----------
class Oled:
    def __init__(self, bus, addr):
        self.fd = os.open('/dev/i2c-%d' % bus, os.O_RDWR); fcntl.ioctl(self.fd, I2C_SLAVE, addr); self.bus = bus
        self.last = [None] * PAGES
    def cmd(self, *c): os.write(self.fd, bytes([0x00]) + bytes(c))
    def data(self, b): os.write(self.fd, bytes([0x40]) + bytes(b))
    def init(self):
        c = [0xAE, 0xD5, 0x80, 0xA8, HEIGHT - 1, 0xD3, 0x00, 0x40, 0x8D, 0x14, 0x20, 0x02,
             0xA0 if FLIP else 0xA1, 0xC0 if FLIP else 0xC8, 0xDA, 0x12 if HEIGHT == 64 else 0x02, 0x81, 0xCF, 0xD9, 0xF1, 0xDB, 0x40, 0xA4, 0xA6, 0xAF]
        for x in c: self.cmd(x)
        self.last = [None] * PAGES
    def show(self, scr):
        """変わったページの、変わった列の範囲だけを送る(I2Cはゆっくりなので、CPUを使いすぎないように)"""
        for p in range(PAGES):
            row = bytes(scr.buf[p]); old = self.last[p]
            if old == row: continue
            if old is None: lo, hi = 0, WIDTH - 1
            else:
                lo = next(i for i in range(WIDTH) if row[i] != old[i]); hi = max(i for i in range(WIDTH) if row[i] != old[i])
            col = lo + COLOFF
            self.cmd(0xB0 + p, col & 0x0F, 0x10 | (col >> 4))
            self.data(row[lo:hi + 1]); self.last[p] = row

def find_bus():
    env = os.environ.get('MJOLED_BUS')
    if env: return int(env)
    for dev in sorted(glob.glob('/dev/i2c-*'), key=lambda s: int(s.rsplit('-', 1)[1])):
        n = int(dev.rsplit('-', 1)[1])
        try:
            fd = os.open(dev, os.O_RDWR); fcntl.ioctl(fd, I2C_SLAVE, ADDR); os.write(fd, bytes([0x00, 0xAE])); os.close(fd)
            return n
        except OSError:
            try: os.close(fd)
            except Exception: pass
    return None

DEMO = [('hello', 'タイトル', ''), ('home', 'ホーム', ''), ('think', '対局', ''), ('watch', '対局', ''), ('call', '対局', 'ポン!'),
        ('win', '結果', '勝ち!'), ('sad', '結果', '負け'), ('teach', 'クイズ', ''), ('pray', '昇段', '昇段!'), ('celebrate', '地図', '')]

def main():
    dry = '--dry' in sys.argv
    if '--selftest' in sys.argv:
        scr = Screen()
        d = {'scene': '対局', 'pose': 'think', 'spd': '30', 'draw': '33', 'max': '57', 'key': '12', 'msg': 'ロン!'}
        print(compose(scr, d, 0.1, 0).ascii()); return 0
    try: os.nice(19)
    except OSError: pass
    oled = None; tick = 0; demo_i = 0; t_demo = 0; next_try = 0; ever_alive = False
    while True:
        t0 = time.time()
        if oled is None and not dry and t0 >= next_try:
            bus = find_bus()
            if bus is None:
                print('mjoled: OLED が見つかりません(config.txt の i2c-gpio と、つなぎかたを確認)。 もう一度さがします', flush=True); next_try = t0 + (1 if uptime() < 90 else 10)  # 起動の直後は、1秒ごとに さがす(装置が できるのを待つ)
            else:
                try: oled = Oled(bus, ADDR); oled.init(); print('mjoled: i2c-%d の 0x%02X に つなぎました(%s %dx%d)' % (bus, ADDR, DRV, WIDTH, HEIGHT), flush=True)
                except OSError as e: print('mjoled: 初期化に失敗: %s' % e, flush=True); oled = None; next_try = t0 + 10
        if '--demo' in sys.argv:
            if t0 - t_demo > 4: t_demo = t0; demo_i = (demo_i + 1) % len(DEMO)
            p, sc, sub = DEMO[demo_i]
            d, age = {'scene': sc, 'pose': p, 'spd': '30', 'draw': '33', 'max': '57', 'key': '12', 'msg': sub}, 0
        else:
            d, age = read_status(STATUS)
        if d is not None and age < 4.0 and d.get('scene') not in ('EXIT', 'MAINT'): ever_alive = True
        scr = compose(Screen(), d, age, tick, ever_alive); tick += 1
        if oled is not None:
            try: oled.show(scr)
            except OSError as e:
                print('mjoled: 送信に失敗: %s(つなぎなおします)' % e, flush=True)
                try: os.close(oled.fd)
                except Exception: pass
                oled = None; next_try = time.time() + 3
        dt = time.time() - t0
        time.sleep(max(0.05, 1.0 / FPS - dt))

if __name__ == '__main__':
    sys.exit(main() or 0)
