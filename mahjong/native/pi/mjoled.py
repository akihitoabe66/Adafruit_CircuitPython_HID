#!/usr/bin/env python3
"""OLED(SSD1306 / SH1106、I2C)に、麻雀先生のパタパタアニメと、ゲームの状態(フレームレートなど)を出す常駐プログラム。
 つなぎ方: GND=物理6番 / VCC=3.3V=物理1番 / SCL=GPIO22(物理15番) / SDA=GPIO23(物理16番)
   config.txt に  dtoverlay=i2c-gpio,bus=3,i2c_gpio_sda=23,i2c_gpio_scl=22   (bus番号は 空いている数字。 自動で さがします)
 ゲーム(mj)が /dev/shm/mj_oled.txt に書く「状態」を読んで、表示する。 ゲームが動いていないときは、本体の温度・負荷を出す。
 使うのは 標準ライブラリだけ。 CPUは ほとんど使わない(変わった所だけを送る・1秒に3コマまで・いちばん低い優先度)。
 環境変数: MJOLED_BUS(i2cの番号。 なければ自動) MJOLED_ADDR(0x3C) MJOLED_H(64 か 32) MJOLED_DRV(ssd1306 か sh1106)
           MJOLED_FLIP=1(上下左右を逆に) MJOLED_FPS(3) MJOLED_FILE(/dev/shm/mj_oled.txt)
 試験用: python3 mjoled.py --selftest(画面の絵を文字で出す) / --demo(ゲームなしで、場面を順に見せる) / --dry(I2Cなし)"""
import fcntl, glob, os, subprocess, sys, time

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
try:
    from oled_zunda import Z as ZU
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try: from oled_zunda import Z as ZU
    except ImportError: ZU = {}
try:
    from oled_pet import STAGE as PSTAGE, LAB as PLAB, LINES as PLINES, SEASONS as PSEAS, SEA as PSEA, JOBS as PJOBS, COS as PCOS
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try: from oled_pet import STAGE as PSTAGE, LAB as PLAB, LINES as PLINES, SEASONS as PSEAS, SEA as PSEA, JOBS as PJOBS, COS as PCOS
    except ImportError: PSTAGE, PLAB, PLINES, PSEAS, PSEA, PJOBS, PCOS = [], {}, {}, [], {}, [], ()
CHARFILE = os.environ.get('MJOLED_CHARFILE', '/var/lib/mjoled_char')   # 設定(ゲームの「OLEDのキャラ」)を おぼえておく場所。 電源を入れた直後の画面でも 同じ人が出る
WHO = {'v': 'sensei'}   # いま出している人: sensei(麻雀先生) か zunda(ずんだもん)
I2C_SLAVE = 0x0703
ADDR = int(os.environ.get('MJOLED_ADDR', '0x3C'), 0)
HEIGHT = int(os.environ.get('MJOLED_H', '64'))
DRV = os.environ.get('MJOLED_DRV', 'ssd1306').lower()
FLIP = os.environ.get('MJOLED_FLIP', '') not in ('', '0')
FPS = max(1.0, float(os.environ.get('MJOLED_FPS', '3')))
STATUS = os.environ.get('MJOLED_FILE', '/dev/shm/mj_oled.txt')
WIDTH = 128
PAGES = HEIGHT // 8
HEALTH = os.environ.get('MJHEALTH_FILE', '/dev/shm/mj_health.txt')
T_WARN = float(os.environ.get('MJ_TEMP_WARN', '75')); T_DANGER = float(os.environ.get('MJ_TEMP_DANGER', '82'))   # 温度(C): 注意 / 危険(Pi は 80C で 自分で 遅くなり、85C で 強く 遅くなる)
INA_BUS = int(os.environ.get('MJINA_BUS', '1')); INA_ADDR = int(os.environ.get('MJINA_ADDR', '0x40'), 0)   # 電圧・電流計(INA219 のモジュール)をつけたとき
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
    def zface(self, name, x0, y0):
        """ずんだもんの顔(32x28前後)を、ぴったり2倍(64x58)で描く"""
        rows = ZU.get(name) or ZU.get('smile')
        if not rows: return
        for j, v in enumerate(rows):
            for i in range(32):
                if (v >> (31 - i)) & 1:
                    x = x0 + 2 * i; y = y0 + 2 * j
                    self._set(x, y, 1); self._set(x + 1, y, 1); self._set(x, y + 1, 1); self._set(x + 1, y + 1, 1)
    def bitmap(self, w, h, rows, x0, y0, k=1, clip=None):
        """行ごとの整数(左が上位ビット)の絵を、k倍で描く。 clip=(左, 右) の外は描かない"""
        for j, v in enumerate(rows):
            for i in range(w):
                if (v >> (w - 1 - i)) & 1:
                    for a in range(k):
                        for b in range(k):
                            x = x0 + i * k + a
                            if clip is None or clip[0] <= x < clip[1]: self._set(x, y0 + j * k + b, 1)
    def marquee(self, name, x, y, w, tick):
        """日本語の見出し(PLAB)を、幅 w のなかで 見せる。 はみ出すときは 左へ流す"""
        lab = PLAB.get(name)
        if not lab: return
        lw, lh, rows = lab
        if lw <= w: self.bitmap(lw, lh, rows, x, y)
        else:
            span = lw + 16; off = (tick * 2) % span
            self.bitmap(lw, lh, rows, x - off, y, clip=(x, x + w))
            self.bitmap(lw, lh, rows, x - off + span, y, clip=(x, x + w))
    def line_marquee(self, g, x, y, w, tick):
        """節目の言葉(幅の広い絵)を、幅 w のなかで 左へ ゆっくり流す(16行 = 16進数の文字列)"""
        e = PLINES.get(g)
        if not e: return
        lw, hx = e; per = (lw + 3) // 4
        cache = LINE_ROWS.get(g)
        if cache is None:
            LINE_ROWS.clear(); cache = LINE_ROWS[g] = tuple(int(hx[r * per:(r + 1) * per], 16) >> (per * 4 - lw) for r in range(16))
        off = (tick * 4) % (lw + 24)
        self.bitmap(lw, 16, cache, x - off, y, clip=(x, x + w))
        if off > lw - w: self.bitmap(lw, 16, cache, x - off + lw + 24, y, clip=(x, x + w))
    def invert(self): self.buf = [bytearray(x ^ 0xFF for x in b) for b in self.buf]   # 白黒を ぎゃくに(警告のとき ちかちかさせる)
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


# ---------- 温度・電源の見はり ----------
_ina = {'fd': None, 'next': 0.0}
def ina_read():
    """(電圧V, 電流A)。 INA219 がつながっていなければ (None, None)。 モジュールの シャント抵抗 0.1Ω が前提"""
    now = time.time()
    try:
        if _ina['fd'] is None:
            if now < _ina['next']: return None, None
            _ina['next'] = now + 30
            fd = os.open('/dev/i2c-%d' % INA_BUS, os.O_RDWR); fcntl.ioctl(fd, I2C_SLAVE, INA_ADDR)
            os.write(fd, bytes([0x00]) + bytes([0x39, 0x9F]))   # 設定: 32V・±320mV・12bit(ふつうの値)
            _ina['fd'] = fd
        fd = _ina['fd']
        def rd(reg):
            os.write(fd, bytes([reg])); b = os.read(fd, 2); return (b[0] << 8) | b[1]
        sh = rd(0x01); bv = rd(0x02)
        if sh & 0x8000: sh -= 0x10000
        return ((bv >> 3) * 0.004), abs(sh) * 0.0001   # 1目盛 = 10uV → 0.1Ω で 0.1mA
    except Exception:
        if _ina['fd'] is not None:
            try: os.close(_ina['fd'])
            except Exception: pass
            _ina['fd'] = None
        return None, None

_hc = {'t': 0, 'v': None, 'thr': 0, 'thr_t': 0}
_hs = {'lowv_since': None, 'lowina_since': None}
def throttled():
    """vcgencmd get_throttled と同じ値。 bit0=いま電圧が低い bit1=周波数を制限 bit2=いま遅くしている bit3=温度で制限 / bit16〜19=それまでに起きた"""
    now = time.time()
    if now - _hc['thr_t'] < 3.0: return _hc['thr']
    _hc['thr_t'] = now; v = None
    for pth in ('/sys/devices/platform/soc/soc:firmware/get_throttled', '/sys/devices/platform/soc/soc:firmware/raspberrypi-hwmon/hwmon0/in0_lcrit_alarm'):
        try:
            with open(pth) as f: v = int(f.read().strip(), 0); break
        except Exception: pass
    if v is None:
        try: v = int(subprocess.check_output(['vcgencmd', 'get_throttled'], timeout=1.5).decode().split('=')[1], 16)
        except Exception: v = _hc['thr']
    _hc['thr'] = v; return v

def health():
    """{'level': 0(ふつう)/1(注意)/2(危険), 'temp': C, 'volt': V か None, 'amp': A か None, 'low': 電圧低下, 'why': 理由}。 2秒に1回だけ 読む"""
    now = time.time()
    if _hc['v'] is not None and now - _hc['t'] < 2.0: return _hc['v']
    temp = None
    try:
        with open('/sys/class/thermal/thermal_zone0/temp') as f: temp = int(f.read()) / 1000.0
    except Exception: pass
    thr = throttled(); volt, amp = ina_read()
    low = bool(thr & 0x1)   # いま、電源の電圧が 4.63V より低い
    if low:
        if _hs['lowv_since'] is None: _hs['lowv_since'] = now
    else: _hs['lowv_since'] = None
    if volt is not None and volt < 4.6:
        if _hs['lowina_since'] is None: _hs['lowina_since'] = now
    else: _hs['lowina_since'] = None
    level, why = 0, ''
    if temp is not None and temp >= T_WARN: level, why = 1, 'HOT'
    if thr & 0x8 or thr & 0x4: level, why = max(level, 1), why or 'SLOW'
    if low or (volt is not None and volt < 4.75): level, why = max(level, 1), 'LOWV'
    if amp is not None and amp > 2.0: level, why = max(level, 1), why or 'AMP'
    if temp is not None and temp >= T_DANGER: level, why = 2, 'HOT'
    if _hs['lowv_since'] is not None and now - _hs['lowv_since'] >= 8: level, why = 2, 'LOWV'    # 電圧低下が 8秒つづく
    if _hs['lowina_since'] is not None and now - _hs['lowina_since'] >= 3: level, why = 2, 'LOWV'
    h = {'level': level, 'temp': temp, 'volt': volt, 'amp': amp, 'low': low, 'thr': thr, 'why': why}
    _hc['v'] = h; _hc['t'] = now
    try:   # ゲームなど ほかのプログラムが 読めるように
        tmp = HEALTH + '.tmp'
        with open(tmp, 'w') as f: f.write('level=%d\ntemp=%s\nvolt=%s\namp=%s\nthr=%d\nwhy=%s\n' % (level, '%.1f' % temp if temp is not None else '', '%.2f' % volt if volt is not None else '', '%.2f' % amp if amp is not None else '', thr, why))
        os.replace(tmp, HEALTH)
    except Exception: pass
    return h

def pwr_row(h):
    """温度と電源の1行(14文字まで)"""
    t = ('T%dC' % round(h['temp'])) if h['temp'] is not None else 'T--'
    if h['volt'] is not None and h['amp'] is not None: return ('%s %.1fV %.2fA' % (t[:-1], h['volt'], h['amp']))[:14]
    return t + (' LOW-V!' if h['low'] else ' PWR OK')

def compose_danger(scr, h, tick):
    """危険の画面: ちかちか白黒が入れかわる。 麻雀先生が「電源を切って!」"""
    scr.clear()
    a, b = POSE['err'] if tick % 2 == 0 else POSE['angry']
    scr.sprite(a if (tick % 2 == 0) else b, 0, 8 if PAGES >= 7 else 0)
    scr.text16('危険!', TEXT_X, 0, inv=True)
    if h['why'] == 'LOWV': scr.text16('電圧が', TEXT_X, 18); scr.text16('たりない', TEXT_X, 34)
    else: scr.text16('熱すぎ!', TEXT_X, 18); scr.text16('切って!', TEXT_X, 34)
    scr.text(pwr_row(h)[:14], TEXT_X, 54)
    if tick % 2 == 1: scr.invert()
    return scr

def uptime():
    try:
        with open('/proc/uptime') as f: return float(f.read().split()[0])
    except Exception: return 0.0

def num(d, k, suffix='', default='--'):
    v = d.get(k, '')
    return (v + suffix) if v not in ('', None) else default


# ---------- ずんだもん(大きい顔)の画面 ----------
ZEXPR = {'hello': 'smile', 'home': 'content', 'teach': 'serious', 'think': 'serious', 'think2': 'serious', 'watch': 'smile', 'call': 'tongue', 'win': 'star', 'sad': 'sweat',
         'angry': 'serious', 'calm': 'content', 'celebrate': 'thumbs', 'pray': 'content', 'power': 'laugh', 'err': 'worry', 'sleep': 'content'}
ZSCENE = {'新雀士': 'heart', '地図': 'peace', 'ビデオ': 'content'}   # 場面ごとの表情(ポーズより優先)
def zpwr(h):
    t = ('T%dC' % round(h['temp'])) if h['temp'] is not None else 'T--'
    if h['volt'] is not None: return '%s %.1fV' % (t[:-1], h['volt'])
    return t + (' LOW-V' if h['low'] else ' OK')

ZST = {'scene': None, 't': 0}
def compose_zunda(scr, d, age, tick, ever_alive):
    """ずんだもんの画面: 左に大きな顔(64x58)、右に 見出しと数字5行。 危険のときは ちかちか白黒"""
    h = health(); scr.clear(); X = 68
    final = d is not None and d.get('scene') in ('EXIT', 'MAINT')
    alive = d is not None and (age < 4.0 or final)
    up = uptime(); booting = (not alive) and (not ever_alive) and up < 150
    scene = d.get('scene', '') if d else ''; msg = d.get('msg', '') if d else ''
    pose = d.get('pose', 'watch') if alive else ('hello' if booting else 'err' if ever_alive else 'sleep')
    expr = ZEXPR.get(pose, 'smile')
    if scene in ZSCENE: expr = ZSCENE[scene]
    if scene == '昇段': expr = 'thumbs' if msg else 'peace'
    def rows(y0, L):
        for i, r in enumerate(L): scr.text(r[:10], X, y0 + i * 9)
    if h['level'] >= 2:
        scr.zface('shock' if tick % 2 == 0 else 'sweat', 0, 3)
        scr.text16('危険!', X, 0, inv=True); scr.text16('電圧が' if h['why'] == 'LOWV' else '熱すぎ!', X, 18); scr.text16('切って!', X, 34); scr.text(zpwr(h), X, 54)
        if tick % 2 == 1: scr.invert()
        return scr
    now = time.time()
    if ZST['scene'] != scene: ZST['scene'] = scene; ZST['t'] = now
    since = now - ZST['t']
    if alive and not final and h['level'] == 0 and PSTAGE and d and 'plays' in d:
        r = None
        if scene == '昇段' and since >= 3 and PCOS:
            j = pet_int(d, 'dan') % len(PCOS); cw, ch, crows = PCOS[j]; scr.clear(); by = 2 + (0 if tick % 2 == 0 else -2)
            scr.bitmap(cw, ch, crows, 8, by + (64 - ch) // 2 - 2, 1); scr.line_marquee('c:' + PJOBS[j], 66, 20, 60, tick)
            return scr
        if scene in ('結果', '対局終了') and since >= 8: r = compose_pet(scr, d, age, tick, ever_alive, h)   # 結果の反応のあとは、ハートと 節目の言葉
        elif scene in ('クイズ', '勉強') and (tick // 3) % 4 == 3: scr.clear(); pet_gauge_page(scr, d, pet_int(d, 'plays'), tick); r = scr   # 答えるあいだに ときどき 3つの目盛り
        if r is not None: return r
    if not alive and not booting: expr = 'worry' if ever_alive else 'content'
    if (booting or (alive and not final and scene in ('ホーム', 'タイトル') and h['level'] == 0)):
        r = compose_pet(scr, d, age, tick, ever_alive, h)
        if r is not None: return r
    scr.zface(expr, 0, 3)
    if booting: scr.text16('起動中' + '.' * (tick % 4), X, 0); rows(24, ['WAIT %dS' % int(up)])
    elif alive and final:
        if scene == 'EXIT': scr.text16('終了', X, 0, inv=True); scr.text16('電源を', X, 18); scr.text16('抜いて', X, 34)
        else: scr.text16('保守', X, 0, inv=True); rows(24, ['CTRL+Q', 'READY'])
        rows(54, [zpwr(h)])
    elif alive:
        if h['level'] == 1 and tick % 2 == 0: scr.text16('高温' if h['why'] == 'HOT' else '電圧', X, 0, inv=True)
        elif msg: scr.text16(msg[:3], X, 0, inv=True)
        elif scene == '対局' and since < 6 and PLAB: scr.marquee('いくのだ！', X, 0, 60, tick)
        elif scene == 'タイトル': scr.text('TITLE', X, 5)
        else: scr.text16(scene[:3], X, 0)
        pr = zpwr(h)
        rows(18, ['SPD ' + num(d, 'spd'), 'DRAW ' + num(d, 'draw'), 'MAX ' + num(d, 'max'), 'KEY ' + num(d, 'key'), pr])
        if d.get('audio') not in (None, '', 'ok'): rows(18, ['AUDIO STOP'])
    else:
        scr.text16('停止!' if ever_alive else '待機中', X, 0, inv=bool(ever_alive)); rows(24, [zpwr(h), 'LOAD ' + sysinfo()[1]])
    return scr

# ---------- ずんだもんペット(たまごっち風) ----------
LINE_ROWS = {}
HEART = ((0x36, 0x7f, 0x7f, 0x7f, 0x3e, 0x1c, 0x08), (0x36, 0x49, 0x41, 0x41, 0x22, 0x14, 0x08))   # 7x7: 中まで黒 / ふちだけ
MILES = [1, 3, 5, 10, 15, 20, 25] + list(range(30, 505, 5))   # 言葉が かわる回数
def pet_int(d, k):
    try: return int(d.get(k, 0))
    except (ValueError, TypeError): return 0
def pet_stage(plays):
    st = PSTAGE[0]
    for e in PSTAGE:
        if plays >= e[0]: st = e
    return st
def pet_tier(plays):
    return 'はじめまして' if plays < 1 else 'ツン' if plays < 30 else 'ツンデレ' if plays < 100 else 'ちょいデレ' if plays < 200 else 'しんゆう' if plays >= 350 else 'なかよし'
def pet_line_key(plays):
    k = None
    for m in sorted(x for x in PLINES if isinstance(x, int)):
        if isinstance(m, int) and m <= plays: k = m
    return k
def pet_costume(d, plays):
    """着ているもの: (絵, あいさつの言葉の名前) か None(ふつうの姿)。 時計がないので、電源を入れた回数で決める:
    おまかせ = 3回ごとに 季節 と 職業(15回あそぶごとに ひとつ ふえる)が かわりばんこ。 季節は お正月→春→夏→ハロウィン→秋→クリスマス の順"""
    mode = d.get('cos', 'auto'); boots = max(1, pet_int(d, 'boots')); blk = (boots - 1) // 3
    jobs = min(len(PCOS), plays // 15)
    if mode == 'none' or not PSEAS: return None
    def season(n):
        nm, idx = PSEAS[n % len(PSEAS)]; return PSEA[idx[(boots - 1) % len(idx)]], 's:' + nm
    def job(n):
        if jobs <= 0: return None
        j = n % jobs; return PCOS[j], 'c:' + PJOBS[j]
    if mode == 'season': return season(blk)
    if mode == 'job': return job(boots - 1)
    return season(blk // 2) if blk % 2 == 0 else job(blk // 2)
def pet_hearts(scr, plays, x, y):
    """ハート5つ(1つ = 100回、半分 = 50回)。 そのすぐ下の細いバーは、つぎの言葉までの進み"""
    full = min(5, plays // 100); half = plays % 100 >= 50 and full < 5
    for i in range(5):
        hx = x + i * 10
        if i < full: scr.bitmap(7, 7, HEART[0], hx, y)
        else:
            scr.bitmap(7, 7, HEART[1], hx, y)
            if i == full and half:
                scr.bitmap(4, 7, tuple(v >> 3 for v in HEART[0]), hx, y)
    prev = 0; nxt = MILES[-1]
    for m in MILES:
        if m > plays: nxt = m; break
        prev = m
    frac = 1.0 if plays >= MILES[-1] else (plays - prev) / float(nxt - prev)
    wbar = 47
    scr.box(x, y + 9, wbar, 3, 0); scr.box(x, y + 9, wbar, 1, 1); scr.box(x, y + 11, wbar, 1, 1); scr.box(x, y + 10, 1, 1, 1); scr.box(x + wbar - 1, y + 10, 1, 1, 1)
    scr.box(x + 1, y + 10, int((wbar - 2) * frac), 1, 1)
def pet_gauge_page(scr, d, plays, tick):
    qc = pet_int(d, 'qc'); dan = pet_int(d, 'dan')
    for i, (nm, val, fr) in enumerate((('なかよし', plays, min(1.0, plays / 500.0)), ('かしこさ', qc, min(1.0, qc / 100.0)), ('つよさ', dan, min(1.0, dan / 20.0)))):
        y = i * 21
        scr.bitmap(*PLAB[nm][:2], PLAB[nm][2], 0, y) if nm in PLAB else None
        scr.text(str(val), 70, y + 4)
        scr.box(0, y + 17, 128, 3, 0); scr.box(0, y + 17, 128, 1, 1); scr.box(0, y + 19, 128, 1, 1)
        scr.box(0, y + 18, 1, 1, 1); scr.box(127, y + 18, 1, 1, 1); scr.box(1, y + 18, int(126 * fr), 1, 1)
def compose_pet(scr, d, age, tick, ever_alive, h):
    """ホーム・起動中の、ペットの画面。 戻り値が None なら ふつうの画面にもどる"""
    if not PSTAGE or 'plays' not in (d or {}) and not (not ever_alive and uptime() < 150 and d is None): return None
    scr.clear(); plays = pet_int(d, 'plays') if d else 0
    stg = pet_stage(plays); sw, sh, srows = stg[1], stg[2], stg[3]
    sleepy = d is not None and pet_int(d, 'idle') >= 180
    by = 2 + (0 if sleepy or tick % 2 == 0 else -2)   # ぴょこぴょこ(ねむいときは 動かない)
    cos = pet_costume(d, plays) if d else None
    if cos is not None and not sleepy and (tick // 3) % 10 < 7:
        cw, ch, crows = cos[0]; scr.bitmap(cw, ch, crows, max(0, (62 - cw) // 2), by + (64 - ch) // 2 - 2, 1)   # 衣装は、そのままの大きさ(45x47前後)
    else: scr.bitmap(sw, sh, srows, max(0, (62 - sw * 2) // 2), by + (62 - sh * 2) // 2 - 2, 2)
    X = 66
    if d is None or d.get('scene') == '起動中':
        scr.marquee('おきるのだ…', X, 18, 60, tick); scr.text('WAIT %dS' % int(uptime()), X, 40)
    elif sleepy:
        scr.marquee('ねむいのだ…', X, 18, 60, tick); scr.text('ZZZ' + '.' * (tick % 4), X, 40); scr.text('PLAY %d' % plays, X, 54)
    elif (tick // 3) % 10 >= 7:
        scr.clear(); pet_gauge_page(scr, d, plays, tick)
    else:
        pet_hearts(scr, plays, X, 2)
        g = pet_line_key(plays)
        hello = ZST.get('home_t')
        if hello is None: hello = ZST['home_t'] = time.time()
        if cos is not None and time.time() - hello < 15: scr.line_marquee(cos[1], X, 17, 60, tick)   # 起動して15秒は、着ているものの あいさつ
        elif g is None: scr.marquee('はじめまして', X, 17, 60, tick)
        else: scr.line_marquee(g, X, 17, 60, tick)
        scr.text('PLAY %d' % plays, X, 37); scr.text('WIN %d' % pet_int(d, 'wins'), X, 46); scr.text('BOOT %d' % pet_int(d, 'boots'), X, 55)
    return scr

ROW_Y = 18   # 数字の行の はじまり(上の16ドットは 日本語の見出し)
def compose(scr, d, age, tick, ever_alive=False):
    """状態 d(ゲームが書いたもの。 None ならゲームは動いていない)から、1コマぶんの画面を作る。
    起動してすぐ(まだゲームが始まっていない間)は「ゲーム起動中」、ゲームが終わったあとは「抜いてね」を出す"""
    if WHO['v'] == 'zunda' and ZU: return compose_zunda(scr, d, age, tick, ever_alive)
    h = health()
    if h['level'] >= 2: return compose_danger(scr, h, tick)
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
        rows_at(54, [pwr_row(h)])
    elif alive:
        msg = d.get('msg', '')
        if h['level'] == 1 and tick % 2 == 0: scr.text16('高温' if h['why'] == 'HOT' else '電圧' if h['why'] == 'LOWV' else '注意!', TEXT_X, 0, inv=True)   # 注意: 見出しが ときどき 警告に かわる
        elif msg: scr.text16(msg[:5], TEXT_X, 0, inv=True)
        else: scr.text16(scene[:5], TEXT_X, 0)
        rows = ['SPD ' + num(d, 'spd', 'FPS'), 'DRAW ' + num(d, 'draw') + ' MAX ' + num(d, 'max'), 'KEY ' + num(d, 'key', 'MS'),
                pwr_row(h), 'FREE ' + mem + ' SW ' + sw + 'M']
        if d.get('audio') not in (None, '', 'ok'): rows[2] = 'AUDIO STOP'
        rows_at(ROW_Y, rows)
    else:
        if ever_alive: scr.text16('停止!', TEXT_X, 0, inv=True)
        else: scr.text16('待機中', TEXT_X, 0)
        rows_at(ROW_Y + 4, [pwr_row(h), 'LOAD ' + la, 'FREE ' + mem + ' SW ' + sw + 'M'])
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
        if '--zunda' in sys.argv: WHO['v'] = 'zunda'
        print(compose(scr, d, 0.1, 0).ascii()); return 0
    try: os.nice(19)
    except OSError: pass
    import random
    mode = {'v': os.environ.get('MJOLED_CHAR', 'random').lower()}   # random / sensei / zunda
    try:
        with open(CHARFILE) as f: mv = f.read().strip()
        if mv in ('random', 'sensei', 'zunda'): mode['v'] = mv   # ゲームの設定が あれば、そちらが優先
    except Exception: pass
    def pick():
        c = mode['v']
        return c if c in ('sensei', 'zunda') else random.choice(['sensei', 'zunda'])
    WHO['v'] = 'zunda' if '--zunda' in sys.argv else pick(); print('mjoled: 表示は %s' % ('ずんだもん' if WHO['v'] == 'zunda' else '麻雀先生'), flush=True)
    was_alive = False; need_repick = False
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
        if d is not None and age < 4.0 and d.get('char') in ('random', 'sensei', 'zunda') and d.get('char') != mode['v'] and '--demo' not in sys.argv and '--zunda' not in sys.argv:   # ゲームの設定が かわった: すぐ反映して、おぼえる
            mode['v'] = d.get('char'); WHO['v'] = pick(); print('mjoled: 設定が かわった: %s' % mode['v'], flush=True)
            try:
                with open(CHARFILE, 'w') as f: f.write(mode['v'])
            except Exception as e: print('mjoled: 設定を書けません(%s)' % e, flush=True)
        alive_now = d is not None and age < 4.0 and d.get('scene') not in ('EXIT', 'MAINT')
        if alive_now and not was_alive and need_repick and '--demo' not in sys.argv and '--zunda' not in sys.argv: WHO['v'] = pick(); need_repick = False; print('mjoled: ゲームが はじまった。 表示は %s' % ('ずんだもん' if WHO['v'] == 'zunda' else '麻雀先生'), flush=True)   # ゲームが 終わって、また はじまったときだけ えらびなおす(1回のゲームのあいだは ずっと同じ)
        if was_alive and not alive_now: need_repick = True
        was_alive = alive_now
        if alive_now: ever_alive = True
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
