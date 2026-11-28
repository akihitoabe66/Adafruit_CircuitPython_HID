#!/usr/bin/env python3
"""OLED(SSD1306 / SH1106、I2C)に、麻雀先生のパタパタアニメと、ゲームの状態(フレームレートなど)を出す常駐プログラム。
 つなぎ方: GND=物理6番 / VCC=3.3V=物理1番 / SCL=GPIO22(物理15番) / SDA=GPIO23(物理16番)
   config.txt に  dtoverlay=i2c-gpio,bus=3,i2c_gpio_sda=23,i2c_gpio_scl=22   (bus番号は 空いている数字。 自動で さがします)
 ゲーム(mj)が /dev/shm/mj_oled.txt に書く「状態」を読んで、表示する。 ゲームが動いていないときは、本体の温度・負荷を出す。
 使うのは 標準ライブラリだけ。 CPUは ほとんど使わない(変わった所だけを送る・1秒に3コマまで・いちばん低い優先度)。
 環境変数: MJOLED_BUS(i2cの番号。 なければ自動) MJOLED_ADDR(0x3C) MJOLED_H(64 か 32) MJOLED_DRV(ssd1306 か sh1106)
           MJOLED_FLIP=1(上下左右を逆に) MJOLED_FPS(3) MJOLED_FILE(/dev/shm/mj_oled.txt)
 試験用: python3 mjoled.py --selftest(画面の絵を文字で出す) / --demo(ゲームなしで、場面を順に見せる) / --dry(I2Cなし)"""
import math
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
PSTAGE, PLAB, PLINES, PSEAS, PSEA, PJOBS, PCOS, PF1, PF2 = [], {}, {}, [], {}, [], (), {}, {}
PET_LOADED = [False]
def load_pet():
    """ペットの絵(約200KB)は、最初の画面を出したあとで読みこむ(電源を入れてすぐ、OLEDに「起動中」を出すため)"""
    global PSTAGE, PLAB, PLINES, PSEAS, PSEA, PJOBS, PCOS, PF1, PF2
    PET_LOADED[0] = True
    try:
        try: import oled_pet as P
        except ImportError:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import oled_pet as P
        PSTAGE, PLAB, PLINES, PSEAS, PSEA, PJOBS, PCOS, PF1, PF2 = P.STAGE, P.LAB, P.LINES, P.SEASONS, P.SEA, P.JOBS, P.COS, P.FORM1, P.FORM2
    except Exception as e: print('mjoled: ペットの絵を読めません(%s)' % e, flush=True)
GAME_SCENES = ('対局', '結果', '対局終了', '昇段')
WHO = {'v': 'zunda'}   # いま出している人: sensei(麻雀先生) か zunda(ずんだもん)
I2C_SLAVE = 0x0703
ADDR = int(os.environ.get('MJOLED_ADDR', '0x3C'), 0)
HEIGHT = int(os.environ.get('MJOLED_H', '64'))
DRV = os.environ.get('MJOLED_DRV', 'ssd1306').lower()
FLIP = os.environ.get('MJOLED_FLIP', '') not in ('', '0')
FPS = max(1.0, float(os.environ.get('MJOLED_FPS', '6')))   # 1秒に 描く回数。 上の帯(背景)の動きに 使う。 ふつうの画面の時間(tick)は 1秒に 3 のまま
SUB = max(1, int(round(FPS / 3.0)))   # 背景の 何コマで ふつうの画面の 1コマ(tick)にするか
STATUS = os.environ.get('MJOLED_FILE', '/dev/shm/mj_oled.txt')
WIDTH = 128
PAGES = HEIGHT // 8
HEALTH = os.environ.get('MJHEALTH_FILE', '/dev/shm/mj_health.txt')
T_WARN = float(os.environ.get('MJ_TEMP_WARN', '75')); T_DANGER = float(os.environ.get('MJ_TEMP_DANGER', '82'))   # 温度(C): 注意 / 危険(Pi は 80C で 自分で 遅くなり、85C で 強く 遅くなる)
INA_BUS = int(os.environ.get('MJINA_BUS', '1')); INA_ADDR = int(os.environ.get('MJINA_ADDR', '0x40'), 0)   # 電圧・電流計(INA219 のモジュール)をつけたとき
CONTRAST = int(os.environ.get('MJOLED_CONTRAST', '0xCF'), 0)   # 明るさ(0x00〜0xFF)。 すじが出るとき 下げてみる(例 0x7F)
CLKDIV = int(os.environ.get('MJOLED_CLK', '0x80'), 0)   # 画面の駆動の速さ(0x80=ふつう。 0xF0 / 0x50 などを試す)
PRECH = int(os.environ.get('MJOLED_PRECH', '0xF1'), 0)   # 充電の時間(0xF1=ふつう。 0x22 を試す)
OY = int(os.environ.get('MJOLED_TOP', '16'))   # 画面の上の何ドットを 使わないか(上の16ドットに すじが入る画面のため。 0 にすると 上まで使う)
HU = HEIGHT - OY   # 使える高さ(ふつう 48)
BK = 1.5   # 大きな絵(顔・姿)の倍率: 高さが 48ドットに おさまるように 1.5倍
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
    'celebrate': (16, 13), 'pray': (11, 17), 'sleep': (7, 17), 'err': (10, 0), 'unplug': (3, 6),   # unplug: 左右の手を かわりばんこに ふる(「抜いてね」)
}
TEXT_X = SW_ + 4

class Screen:
    """画面の絵(縦8ドット=1バイトの並び)"""
    def __init__(self): self.buf = [bytearray(WIDTH) for _ in range(PAGES)]
    def clear(self):
        for p in self.buf:
            for i in range(WIDTH): p[i] = 0
    def sprite(self, idx, x0, y0):   # 麻雀先生の絵(40x48)。 縦8ドットずつの並び
        data = POSES[idx]
        for pg in range(SH_ // 8):
            for x in range(SW_):
                v = data[pg * SW_ + x]
                for bit in range(8):
                    if (v >> bit) & 1: self._set(x0 + x, y0 + pg * 8 + bit, 1)
    def raw(self, x, y):   # 上の使わない帯(すじが入る所)に 飾りを描くとき: オフセットなしで 1ドット
        if 0 <= x < WIDTH and 0 <= y < HEIGHT: self.buf[y // 8][x] |= 1 << (y % 8)
    def rawclr(self, x, y):
        if 0 <= x < WIDTH and 0 <= y < HEIGHT: self.buf[y // 8][x] &= ~(1 << (y % 8))
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
    def zface(self, name, x0, y0, k=None):
        """ずんだもんの顔(32x28前後)を 1.5倍(48x42)で描く(上の16ドットは 使わないので、2倍だと 入らない)"""
        rows = ZU.get(name) or ZU.get('smile')
        if rows: self.bitmap(32, len(rows), rows, x0, y0, BK if k is None else k)
    def bitmap(self, w, h, rows, x0, y0, k=1, clip=None):
        """行ごとの整数(左が上位ビット)の絵を、k倍で描く(k は 1・2・3 などの整数か、1.5 など)。 clip=(左, 右) の外は描かない"""
        if k != int(k):   # 小数倍: いちばん近い点を 取る
            ow, oh = int(w * k + 0.5), int(h * k + 0.5)
            for j in range(oh):
                v = rows[min(h - 1, int(j / k))]
                for i in range(ow):
                    if (v >> (w - 1 - min(w - 1, int(i / k)))) & 1:
                        x = x0 + i
                        if clip is None or clip[0] <= x < clip[1]: self._set(x, y0 + j, 1)
            return
        k = int(k)
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
    def invert(self): self.buf = [(bytearray(x ^ 0xFF for x in b) if i >= OY // 8 else b) for i, b in enumerate(self.buf)]   # 上の使わない帯は そのまま   # 白黒を ぎゃくに(警告のとき ちかちかさせる)
    def box(self, x, y, w, h, on=1):
        for yy in range(y, y + h):
            for xx in range(x, x + w): self._set(xx, yy, on)
    def _set(self, x, y, on):
        y += OY
        if x < 0 or y < OY or x >= WIDTH or y >= HEIGHT: return
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
    scr.sprite(a if (tick % 2 == 0) else b, 0, 0)
    scr.text16('危険!', TEXT_X, 0, inv=True)
    if h['why'] == 'LOWV': scr.text16('電圧が', TEXT_X, 16); scr.text16('たりない', TEXT_X, 32)
    else: scr.text16('熱すぎ!', TEXT_X, 16); scr.text16('切って!', TEXT_X, 32)
    if tick % 2 == 1: scr.invert()
    return scr

def pad_sleeping():   # mjpad が 書く: 無線コントローラーが 5分 押されていない(ゲームが 動いていなくても 出す)
    try:
        with open('/dev/shm/mj_padsleep.txt') as f: return f.read().strip() == '1'
    except OSError: return False

def pad_screen(scr, tick):
    """無線コントローラーが 切れたとき: 「無線コントローラーが 切れた」で 3回点滅 → 「スタートボタンを 2回 押してね」で 3回点滅、を くりかえす。
    (1回目の スタートは 無線を 起こすだけなので 2回。) 点滅 = 画面ぜんたいの 白黒が かわる(1回 約1.3秒)。 tick は 1秒に 3回"""
    k = tick % 24                      # 12コマ(約4秒)で 3回点滅 → つぎの文
    if k < 12:
        scr.text16('無線', 0, 0); scr.text16('コントローラーが', 0, 16); scr.text16('切れた', 0, 32)
    else:
        scr.text16('スタートボタンを', 0, 0); scr.text16('２回押してね', 0, 16)
    if k % 4 >= 2: scr.invert()
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
ZMSG = {'正解!': 'laugh', 'おしい': 'worry', 'ちがう': 'sweat', 'リーチ中': 'laugh', '警戒!': 'worry', 'リーチ!': 'serious'}   # 出来事のことば ごとの表情(ポーズより優先)
ZSCENE = {'新雀士': 'heart', '地図': 'peace', 'ビデオ': 'content'}   # 場面ごとの表情(ポーズより優先)
def zpwr(h):
    t = ('T%dC' % round(h['temp'])) if h['temp'] is not None else 'T--'
    if h['volt'] is not None: return '%s %.1fV' % (t[:-1], h['volt'])
    return t + (' LOW-V' if h['low'] else ' OK')

ZST = {'scene': None, 't': 0}
def boot_screen(scr, tick, X, up):
    """起動中: ずんだもんが「もうすぐ はじまるよ！」と パタパタ(口を あけしめ・左右に ゆれる・見出しが 白黒反転・ことばが 流れる)"""
    t2 = tick // 2   # 2コマの動きは ゆっくり(0.67秒ごと)
    scr.zface('laugh' if t2 % 2 == 0 else 'smile', 2 if t2 % 2 else 0, 3)
    scr.text16('起動中', X, 0, inv=(t2 % 2 == 0))
    scr.marquee('もうすぐ はじまるよ！ ちょっと まってね', X, 17, 60, tick); scr.text('WAIT %dS' % int(up), X, 39)
    return scr

def compose_zunda(scr, d, age, tick, ever_alive):
    """ずんだもんの画面: 左に大きな顔(64x58)、右に 見出しと数字5行。 危険のときは ちかちか白黒"""
    h = health(); scr.clear(); X = 68
    final = d is not None and d.get('scene') in ('EXIT', 'MAINT', 'SAVING')
    alive = d is not None and (age < 4.0 or final or (d.get('scene') == '起動中' and age < 20))
    up = uptime(); booting = (not alive) and (not ever_alive) and up < 150
    scene = d.get('scene', '') if d else ''; msg = d.get('msg', '') if d else ''
    pose = d.get('pose', 'watch') if alive else ('hello' if booting else 'err' if ever_alive else 'sleep')
    expr = ZEXPR.get(pose, 'smile')
    if scene in ZSCENE: expr = ZSCENE[scene]
    if msg in ZMSG: expr = ZMSG[msg]
    if scene == '昇段': expr = 'thumbs' if msg else 'peace'
    def rows(y0, L):
        for i, r in enumerate(L[:3]): scr.text(r[:10], X, y0 + i * 9)
    if h['level'] >= 2:
        scr.zface('shock' if tick % 2 == 0 else 'sweat', 0, 3)
        scr.text16('危険!', X, 0, inv=True); scr.text16('電圧が' if h['why'] == 'LOWV' else '熱すぎ!', X, 16); scr.text16('切って!', X, 32)
        if tick % 2 == 1: scr.invert()
        return scr
    now = time.time()
    if ZST['scene'] != scene: ZST['scene'] = scene; ZST['t'] = now
    since = now - ZST['t']
    if alive and not final and h['level'] == 0 and PSTAGE and d and 'plays' in d:
        r = None
        if scene == '昇段' and since >= 3 and PCOS:
            j = pet_int(d, 'dan') % len(PCOS); cw, ch, crows = PCOS[j]; scr.clear(); by = 0 if tick % 2 == 0 else 1
            scr.bitmap(cw, ch, crows, 8, by + (HU - ch) // 2, 1); scr.line_marquee('c:' + PJOBS[j], 66, 16, 60, tick)
            return scr
        if scene in ('結果', '対局終了') and since >= 8: r = compose_pet(scr, d, age, tick, ever_alive, h)   # 結果の反応のあとは、ハートと 節目の言葉
        elif scene in ('クイズ', '勉強') and not msg and (tick // 3) % 4 == 3: scr.clear(); pet_gauge_page(scr, d, pet_int(d, 'plays'), tick); r = scr   # 答えるあいだに ときどき 3つの目盛り
        if r is not None: return r
    if not alive and not booting: expr = 'worry' if ever_alive else 'smile'   # ゲームが まだ動いていない待機: 寝顔ではなく 笑顔
    if (booting or (alive and not final and scene in ('ホーム', 'タイトル', '起動中') and h['level'] == 0)):
        r = compose_pet(scr, d, age, tick, ever_alive, h)
        if r is not None: return r
    if booting or (alive and scene == '起動中'): return boot_screen(scr, tick, X, up)   # 起動中は「もうすぐ はじまるよ！」
    if alive and final and scene == 'EXIT': scr.zface('laugh' if tick % 2 == 0 else 'smile', 2 if tick % 2 else 0, 3)   # 抜いてね: ずんだもんが ひょこひょこ(口を あけたり とじたり、左右に ゆれる)
    else: scr.zface(expr, 0, 3)
    if booting: scr.text16('起動中' + '.' * (tick % 4), X, 0); rows(24, ['WAIT %dS' % int(up)])
    elif alive and final:
        if scene == 'EXIT': scr.text16('終了', X, 0, inv=True); scr.text16('電源を', X, 16, inv=(tick % 2 == 0)); scr.text16('抜いて', X, 32, inv=(tick % 2 == 1))   # 白黒を かわりばんこに 反転(パタパタ): 目立つように
        else: scr.text16('保守', X, 0, inv=True); rows(20, ['CTRL+Q', 'READY', zpwr(h)])
    elif alive:
        if h['level'] == 1 and tick % 2 == 0: scr.text16('高温' if h['why'] == 'HOT' else '電圧', X, 0, inv=True)
        elif msg: scr.text16(msg[:3], X, 0, inv=True)
        elif scene == '対局' and since < 6 and PLAB: scr.marquee('いくのだ！', X, 0, 60, tick)
        elif scene == 'タイトル': scr.text('TITLE', X, 5)
        else: scr.text16(scene[:3], X, 0)
        pr = zpwr(h)
        rows(19, ['SPD %s D%s' % (num(d, 'spd'), num(d, 'draw')), 'MX%s KY%s' % (num(d, 'max'), num(d, 'key')), pr])
        if d.get('audio') not in (None, '', 'ok'): rows(19, ['AUDIO STOP'])
    else:
        scr.text16('停止!' if ever_alive else '待機中', X, 0, inv=bool(ever_alive)); rows(24, [zpwr(h), 'LOAD ' + sysinfo()[1]])
    return scr

# ---------- ずんだもんペット(たまごっち風) ----------
LINE_ROWS = {}
PJOBS_DAN = ['無段', '初段', '二段', '三段', '四段', '五段', '六段', '七段', '八段', '九段', '名人', '永世名人']
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
    return 'はじめまして' if plays < 1 else 'ツン' if plays < 55 else 'ツンデレ' if plays < 150 else 'ちょいデレ' if plays < 250 else 'なかよし' if plays < 350 else 'しんゆう'
def pet_line_key(plays):
    k = None
    for m in sorted(x for x in PLINES if isinstance(x, int)):
        if isinstance(m, int) and m <= plays: k = m
    return k
def pet_form(d):
    """いまの姿: (名前の前の部分, 倍率, 幅, 高さ, 行) か None(たまご〜げんきずんだ)。 f1 = 100回めの姿、 f2 = 300回めの最終の姿(0=かちぐせ 1=まけぐせ)"""
    f1 = d.get('f1', '') if d else ''
    if not f1 or f1 not in PF1: return None
    f2 = pet_int(d, 'f2') if d and d.get('f2', '-1') not in ('', '-1') else -1
    if f2 in (0, 1) and f1 in PF2: return PF2[f1][f2]
    return PF1[f1]
def pet_cp(d):
    """この周の、遊んだ回数(ゲームが cp= で知らせる。 なければ 累計)"""
    return pet_int(d, 'cp') if d and 'cp' in d else pet_int(d, 'plays')
def pet_next(cp):
    """つぎの進化までの回数(100回めの姿 → 300回めの最終の姿 → 350回めで たまごにもどる)"""
    return (100 - cp) if cp < 100 else (300 - cp) if cp < 300 else max(0, 350 - cp)
def pet_num(scr, n, x, y):
    for ch in str(max(0, n)):
        lab = PLAB.get(ch)
        if lab: scr.bitmap(lab[0], lab[1], lab[2], x, y); x += lab[0]
    return x
def pet_place(scr, w, h, rows, k, by=0):
    """左の 62x48 の中に、姿を まん中におく。 k=2 の絵は 1.5倍、k=1 は そのまま(衣装の絵は 45x47)"""
    kk = BK if k == 2 else k
    ow, oh = int(w * kk + 0.5), int(h * kk + 0.5)
    scr.bitmap(w, h, rows, max(0, (62 - ow) // 2), max(0, (HU - oh) // 2 + by), kk)
def pet_big(scr, d, lines, ys=(0, 16, 32), spr=None):
    """左に姿、右の 66ドットに 4文字までの見出しを 3つ(LAB の名前)"""
    f = spr or pet_form(d)
    if f is None:
        st = pet_stage(pet_cp(d)); w, h, rows, k = st[1], st[2], st[3], 2
    else: _, k, w, h, rows = f
    pet_place(scr, w, h, rows, k)
    for t, y in zip(lines, ys):
        if t and t in PLAB: scr.bitmap(PLAB[t][0], PLAB[t][1], PLAB[t][2], 64, y)
def pet_name_lines(d):
    f = pet_form(d)
    if f is None:
        n = {0: 'たまご', 5: 'ちびずんだ', 30: 'げんきずんだ'}[pet_stage(pet_cp(d))[0]]
        return [n] if n == 'たまご' else [n.replace('ずんだ', ''), 'ずんだ']
    return [f[0], 'ずんだ']
def pet_hearts_dummy(): pass
EVO = {'key': None, 't': 0, 'kind': None}
def evolve_event(d):
    """進化した(100回め・300回め)とき、たまごにもどった(350回め)ときの 8秒間の画面。 'evo' / 'egg' / None。 起動したときの状態は、出来事にしない"""
    if not d or 'cyc' not in d: return None
    key = (d.get('cyc'), d.get('f1', ''), d.get('f2', ''))
    now = time.time()
    if EVO['key'] is None: EVO['key'] = key
    elif key != EVO['key']:
        EVO['kind'] = 'egg' if key[1] == '' else 'evo'; EVO['t'] = now; EVO['key'] = key
    if EVO['kind'] and now - EVO['t'] < 8: return EVO['kind']
    return None
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
        elif i == full and half:   # 半分のハート: ふちの上に、左半分だけ 黒く
            scr.bitmap(7, 7, HEART[1], hx, y); scr.bitmap(4, 7, tuple(v >> 3 for v in HEART[0]), hx, y)
        else: scr.box(hx + 3, y + 3, 1, 1, 1)   # まだ もらえていない場所は、小さな点だけ(ハートに見せない)
    prev = 0; nxt = MILES[-1]
    for m in MILES:
        if m > plays: nxt = m; break
        prev = m
    frac = 1.0 if plays >= MILES[-1] else (plays - prev) / float(nxt - prev)
    wbar = 47
    scr.box(x, y + 9, wbar, 3, 0); scr.box(x, y + 9, wbar, 1, 1); scr.box(x, y + 11, wbar, 1, 1); scr.box(x, y + 10, 1, 1, 1); scr.box(x + wbar - 1, y + 10, 1, 1, 1)
    scr.box(x + 1, y + 10, int((wbar - 2) * frac), 1, 1)
def pet_bar(scr, x, y, w, h, fr):
    scr.box(x, y, w, h, 1); scr.box(x + 1, y + 1, w - 2, h - 2, 0); scr.box(x + 1, y + 1, int((w - 2) * fr), h - 2, 1)
def pet_gauge_page(scr, d, plays, tick):
    """3つの目盛り(1段 16ドット): あそんだ(対局の数 / 500で満タン)、クイズ(いまの級)、だんい(無段〜永世名人)"""
    qc = pet_int(d, 'qc'); dan = max(0, min(11, pet_int(d, 'dan')))
    for i, nm in enumerate(('あそんだ', 'クイズ', 'だんい')):
        y = i * 16
        if nm in PLAB: scr.bitmap(PLAB[nm][0], PLAB[nm][1], PLAB[nm][2], 0, y)
        if nm == 'あそんだ':
            scr.text(str(plays), 68, y); pet_bar(scr, 68, y + 9, 60, 6, min(1.0, plays / 500.0))
        elif nm == 'クイズ':
            ql = pet_int(d, 'ql') if d.get('ql', '') != '' else 0; x = 68
            if ql >= 11 and '師範' in PLAB: scr.bitmap(PLAB['師範'][0], PLAB['師範'][1], PLAB['師範'][2], x, y)
            elif 1 <= ql <= 10 and '級' in PLAB: x = pet_num(scr, 11 - ql, x, y); scr.bitmap(PLAB['級'][0], PLAB['級'][1], PLAB['級'][2], x, y)
            else: scr.text(str(qc), x, y + 4)
            pet_bar(scr, 104, y + 5, 24, 6, min(1.0, qc / 100.0))
        else:
            dn = PJOBS_DAN[dan]
            if dn in PLAB: scr.bitmap(PLAB[dn][0], PLAB[dn][1], PLAB[dn][2], 68, y)
def text_big(scr, s, x, y, k=2):
    """5x7 の英数字を k倍の大きさで(温度などを 大きく 見せる)"""
    for ch in s.upper():
        g = F.get(ch, F['?'])
        for c in range(5):
            col = g[c]
            for r in range(7):
                if (col >> r) & 1: scr.box(x + c * k, y + r * k, k, k, 1)
        x += 6 * k
def pet_sys_page(scr, d, h, frm, stg):
    """本体の状態の画面(数秒おきに 出る): CPU温度を 大きく、空きメモリ・負荷を 小さく"""
    f = frm if frm else (0, 2, stg[1], stg[2], stg[3]); pet_place(scr, f[2], f[3], f[4], f[1])
    t, la, mem, sw, psi, gm = sysinfo(); X = 66
    scr.text('CPU TEMP', X, 0)
    text_big(scr, t, X, 10, 2)
    state = 'OK' if h['level'] == 0 else 'HOT' if h['why'] == 'HOT' else 'POWER'
    scr.text(state + ('' if h['volt'] is None else ' %.1fV' % h['volt']), X, 28)
    scr.text('FREE %sM' % mem, X, 37); scr.text('LOAD %s' % la, X, 46)
def compose_pet(scr, d, age, tick, ever_alive, h):
    """ホーム・起動中の、ペットの画面。 戻り値が None なら ふつうの画面にもどる"""
    if not PSTAGE or not (d is None or d.get('scene') == '起動中' or 'plays' in d): return None
    scr.clear(); plays = pet_int(d, 'plays') if d else 0
    X = 66
    if d is None or d.get('scene') == '起動中':   # 起動中: ずんだもんが「もうすぐ はじまるよ！」と パタパタ(口を あけしめ・左右に ゆれる・見出しが 白黒反転)
        return boot_screen(scr, tick, X, uptime())
    stg = pet_stage(pet_cp(d)); frm = pet_form(d)
    sleepy = pet_int(d, 'idle') >= 180
    by = 1 if (not sleepy and tick % 2) else 0   # ぴょこぴょこ(ねむいときは 動かない)
    cos = pet_costume(d, plays)
    if sleepy:   # 3分 ボタンなし: 目を閉じた顔で ねむる
        scr.zface('content', 0, 3)
        scr.marquee('ねむいのだ…', X, 14, 60, tick); scr.text('ZZZ' + '.' * (tick % 4), X, 33); scr.text('PLAY %d' % plays, X, 41)
    elif evolve_event(d) is not None:
        ev = evolve_event(d)
        pet_big(scr, d, ['うまれた', 'のだ', ''] if ev == 'egg' else ['しんか', 'したのだ', ''], (0, 16, 32))
    elif (tick // 3) % 24 in (12, 13):
        pet_gauge_page(scr, d, plays, tick)
    elif (tick // 3) % 24 in (14, 15):
        nm = pet_name_lines(d); pet_big(scr, d, nm + ([''] if len(nm) < 2 else []), (0, 16, 32))
        if 'あと' in PLAB: scr.bitmap(PLAB['あと'][0], PLAB['あと'][1], PLAB['あと'][2], 64, 32); pet_num(scr, pet_next(pet_cp(d)), 64 + PLAB['あと'][0], 32)
    elif (tick // 3) % 24 in (16, 17):
        pet_big(scr, d, ['あそぶと', 'すがたが', 'かわるぞ'], (0, 16, 32))
    elif (tick // 3) % 24 in (20, 21):
        pet_sys_page(scr, d, h, frm, stg)
    elif (tick // 3) % 24 in (18, 19) and d.get('lean') in ('riichi', 'ron', 'tsumo', 'naki', 'mamori', 'study', 'view', 'win', 'lose'):
        f = frm if frm else (0, 2, stg[1], stg[2], stg[3]); pet_place(scr, f[2], f[3], f[4], f[1])
        scr.line_marquee('h:' + d['lean'], X, 16, 60, tick)
    else:
        if cos is not None and (tick // 3) % 24 < 12:
            cw, ch, crows = cos[0]; pet_place(scr, cw, ch, crows, 1, by)   # 衣装は、そのままの大きさ(45x47前後)
        elif frm is not None: pet_place(scr, frm[2], frm[3], frm[4], frm[1], by)   # 進化した姿
        else: pet_place(scr, stg[1], stg[2], stg[3], 2, by)
        pet_hearts(scr, plays, X, 0)
        g = pet_line_key(plays)
        hello = ZST.get('home_t')
        if hello is None: hello = ZST['home_t'] = time.time()
        if cos is not None and time.time() - hello < 15: scr.line_marquee(cos[1], X, 14, 60, tick)   # 起動して15秒は、着ているものの あいさつ
        elif g is None: scr.marquee('はじめまして', X, 14, 60, tick)
        else: scr.line_marquee(g, X, 14, 60, tick)
        scr.text('PLAY %d' % plays, X, 33); scr.text('WIN %d B%d' % (pet_int(d, 'wins'), pet_int(d, 'boots')), X, 41)
    return scr

ROW_Y = 18   # 数字の行の はじまり(上の16ドットは 日本語の見出し)
def sensei_now(d, age):
    """いま 麻雀先生を出すか: 対局の場面で、ゲームの設定「麻雀先生」がオンのとき(環境変数 MJOLED_CHAR=sensei で いつも先生、 zunda で いつもずんだもん)"""
    ch = os.environ.get('MJOLED_CHAR', '').lower()
    if ch == 'zunda' or WHO['v'] == 'zunda' and '--zunda' in sys.argv: return False
    if ch == 'sensei': return True
    if d is None or age >= 4.0: return False
    sc = d.get('scene', '')
    return sc == '勉強' or (sc in GAME_SCENES and d.get('teacher') == '1')   # 麻雀の勉強の階層は 麻雀先生。 クイズは ずんだもん(正解で喜ぶ)
try:
    import oled_bg as BG
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try: import oled_bg as BG
    except ImportError: BG = None
def bg_kind(d, age):
    """いまの場面に合う 背景(上の16ドット): リーチ中=星空 / 相手のリーチ=雨と稲妻 / 上がり・勝ち・昇段=花火 / クイズ・勉強=宇宙 / 3分放置=灯台と海 / ふだん=夜景(季節で 雪・桜)"""
    if d is None or age >= 4.0: return 'city'
    sc = d.get('scene', ''); msg = d.get('msg', ''); pose = d.get('pose', '')
    if msg in ('リーチ中', 'リーチ!'): return 'stars'
    if msg == '警戒!': return 'rain'
    if msg in ('ロン!', 'ツモ!', '勝ち!', '昇段!', '逆転!', '必殺!', '正解!') or sc == '昇段' or (sc in ('結果', '対局終了') and pose in ('win', 'celebrate')): return 'fire'
    if sc in ('クイズ', '勉強'): return 'space'
    if pet_int(d, 'idle') >= 180: return 'sea'
    si = ((max(1, pet_int(d, 'boots')) - 1) // 3 // 2) % 6   # 電源を入れた回数で 季節(お正月・春・夏・ハロウィン・秋・クリスマス)
    return 'snow' if si in (0, 5) else 'sakura' if si == 1 else 'city'
def decor(scr, f, kind='city'):
    """上の使わない帯(16ドット)の背景アニメーション(oled_bg.py)"""
    if OY < 16 or BG is None: return
    BG.draw(scr, kind, f)
def compose(scr, d, age, tick, ever_alive=False):
    scr = compose0(scr, d, age, tick, ever_alive)
    if '--nodecor' not in sys.argv and os.environ.get('MJOLED_DECOR', '1') != '0': decor(scr, tick * SUB, bg_kind(d, age))
    return scr
def saving_screen(scr, tick):
    """終了のあと、SDカードへ 書きこんでいる最中(まだ 抜かないで): ずんだもんが 目を閉じて まっている。 「終了中」が 反転でゆっくり点滅、下に 英語の注意"""
    t2 = tick // 2
    scr.zface('content' if t2 % 2 == 0 else 'worry', 0, 3)
    scr.text16('終了中', 66, 0, inv=(t2 % 2 == 0))
    scr.text('SAVING' + '.' * (t2 % 4), 66, 20)
    scr.text('DO NOT', 66, 30); scr.text('UNPLUG!', 66, 39)
    return scr

def exit_plug(scr, tick):
    """終了の画面(これだけを出す): 電源プラグが コンセントから 抜き差しされる絵。 コンセントは 白い板に 黒い窓と2つの穴。
    刺さっているとき: にこ顔 / 抜けているとき: ウインク(+ 文字が 白黒反転、矢印)。 2コマの動きは ゆっくり(0.67秒ごと)"""
    t2 = tick // 2
    pulled = t2 % 2 == 1
    scr.zface('tongue' if pulled else 'smile', 0, 19 - (t2 % 2) * 2, 1)   # ずんだもん(小さく): 抜けたとき ウインク(oled_zunda の 'tongue' は ウインクの顔)
    scr.text16('電源を抜いて!', 0, 0, inv=pulled)   # 1行 全体を 白黒反転でパタパタ
    # コンセント(右): 白い板(角を丸く) + 黒い窓 + 縦長の穴2つ
    x0, y0, w, h = 100, 17, 28, 30
    scr.box(x0, y0, w, h, 1)
    for cx, cy in ((x0, y0), (x0 + w - 1, y0), (x0, y0 + h - 1), (x0 + w - 1, y0 + h - 1)): scr._set(cx, cy, 0)
    scr.box(x0 + 6, y0 + 8, 16, 12, 0)
    for sx in (x0 + 10, x0 + 16): scr.box(sx, y0 + 11, 2, 6, 1)
    # プラグ: D形の本体 + 横向きの2本の刃。 抜けているときは 16ドット はなれる
    px = 62 if pulled else 78
    scr.box(px, 26, 14, 15, 1)
    for cx, cy in ((px, 26), (px, 40)): scr._set(cx, cy, 0)
    scr.box(px - 1, 28, 1, 11, 1)
    for yy in (28, 36): scr.box(px + 14, yy, 8, 3, 1)
    # コード: ずんだもんから プラグまで S字に うねる
    L = max(1, px - 32)
    for x in range(32, px):
        y = 33 + int(round(4 * math.sin((x - 32) / L * 2 * math.pi + t2 * 0.8)))
        scr.box(x, y, 1, 2, 1)
    # 抜けているときは 左向きの矢印(字の「<」は 小さい字に ないので 点で描く)
    if pulled:
        for ax in (px + 4, px + 14):
            for k in range(4): scr._set(ax + 3 - k, 17 + k, 1); scr._set(ax + 3 - k, 23 - k, 1)
    return scr

def compose0(scr, d, age, tick, ever_alive=False):
    """状態 d(ゲームが書いたもの。 None ならゲームは動いていない)から、1コマぶんの画面を作る。
    起動してすぐ(まだゲームが始まっていない間)は「ゲーム起動中」、ゲームが終わったあとは「抜いてね」を出す"""
    if d is not None and d.get('scene') == 'SAVING': scr.clear(); return saving_screen(scr, tick)   # 保存中: まだ 抜かない
    if d is not None and d.get('scene') == 'EXIT':   # 終了のあと(コンソール): 無線が 切れているときは「抜いてね」と 無線の案内を 4秒ずつ かわりばんこ
        scr.clear()
        if pad_sleeping() and tick % 48 >= 24: return pad_screen(scr, tick % 48 - 24)   # 「電源を抜いて」約8秒 → 無線の案内(2つの文を 1回ずつ)約8秒
        return exit_plug(scr, tick)   # 終了: プラグが抜き差しされる絵だけを出す
    if (d is not None and age < 4.0 and d.get('padguide') == '1') or pad_sleeping(): scr.clear(); return pad_screen(scr, tick)   # 無線コントローラーが 切れた案内(ゲームの画面と 同じタイミング)
    if ZU and not sensei_now(d, age): return compose_zunda(scr, d, age, tick, ever_alive)   # 対局のあいだ(麻雀先生がオンなら)と 勉強の階層は 先生。 ほかは ずんだもんのペット
    h = health()
    if h['level'] >= 2: return compose_danger(scr, h, tick)
    scr.clear()
    scene = d.get('scene', '') if d else ''
    final = d is not None and d.get('scene') in ('EXIT', 'MAINT', 'SAVING')   # ゲームが 終わった印(時間がたっても そのまま出す)
    alive = d is not None and (age < 4.0 or final or (d.get('scene') == '起動中' and age < 20))
    up = uptime()
    booting = (not alive) and (not ever_alive) and up < 150
    if alive: pose = 'unplug' if d.get('scene') == 'EXIT' else d.get('pose', 'watch')   # 終了: 手を ふって 「抜いてね」
    elif booting: pose = 'hello'
    elif ever_alive: pose = 'err'
    else: pose = 'sleep'
    a, b = POSE.get(pose, POSE['watch'])
    scr.sprite(a if (tick % 2 == 0) else b, 0, 0)
    t, la, mem, sw, psi, gm = sysinfo()
    def rows_at(y0, rows, step=9):
        for i, r in enumerate(rows):
            yy = y0 + i * step
            if r and yy + 7 <= HU: scr.text(r[:14], TEXT_X, yy)
    if booting:
        scr.text16('麻雀先生', TEXT_X, 0); scr.text16('ゲーム', TEXT_X, 16); scr.text16('起動中' + '.' * (tick % 4), TEXT_X, 32)
    elif alive and final:
        if d.get('scene') == 'EXIT': scr.text16('終了', TEXT_X, 0, inv=True); scr.text16('電源を', TEXT_X, 16, inv=(tick % 2 == 0)); scr.text16('抜いてね', TEXT_X, 32, inv=(tick % 2 == 1))
        else: scr.text16('保守', TEXT_X, 0, inv=True); rows_at(20, ['CTRL+Q', 'READY', pwr_row(h)])
    elif alive:
        msg = d.get('msg', '')
        if h['level'] == 1 and tick % 2 == 0: scr.text16('高温' if h['why'] == 'HOT' else '電圧' if h['why'] == 'LOWV' else '注意!', TEXT_X, 0, inv=True)   # 注意: 見出しが ときどき 警告に かわる
        elif msg: scr.text16(msg[:5], TEXT_X, 0, inv=True)
        else: scr.text16(scene[:5], TEXT_X, 0)
        rows = ['SPD %s D%s' % (num(d, 'spd'), num(d, 'draw')), 'MX%s KY%s' % (num(d, 'max'), num(d, 'key')), pwr_row(h)]
        if d.get('audio') not in (None, '', 'ok'): rows[1] = 'AUDIO STOP'
        rows_at(19, rows, 10)
    else:
        if ever_alive: scr.text16('停止!', TEXT_X, 0, inv=True)
        else: scr.text16('待機中', TEXT_X, 0)
        rows_at(20, [pwr_row(h), 'LOAD ' + la, 'FREE ' + mem], 10)
    return scr

# ---------- I2C ----------
class Oled:
    def __init__(self, bus, addr):
        self.fd = os.open('/dev/i2c-%d' % bus, os.O_RDWR); fcntl.ioctl(self.fd, I2C_SLAVE, addr); self.bus = bus
        self.last = [None] * PAGES
    def cmd(self, *c): os.write(self.fd, bytes([0x00]) + bytes(c))
    def data(self, b): os.write(self.fd, bytes([0x40]) + bytes(b))
    def init(self):
        c = [0xAE, 0xD5, CLKDIV, 0xA8, HEIGHT - 1, 0xD3, 0x00, 0x40, 0x8D, 0x14, 0x20, 0x02,
             0xA0 if FLIP else 0xA1, 0xC0 if FLIP else 0xC8, 0xDA, 0x12 if HEIGHT == 64 else 0x02, 0x81, CONTRAST, 0xD9, PRECH, 0xDB, 0x40, 0xA4, 0xA6, 0xAF]
        for x in c: self.cmd(x)
        self.last = [None] * PAGES; self.rr = 0; self.t_cfg = time.time()
    def refresh_cfg(self):
        """表示の設定(明るさ・電荷ポンプなど)を 送りなおす(画面は消さない)。 I2Cの乱れで 設定が ずれても、直るように"""
        for x in (0x8D, 0x14, 0x20, 0x02, 0xDB, 0x40, 0xD9, PRECH, 0x81, CONTRAST, 0xA4, 0xA6): self.cmd(x)
        self.t_cfg = time.time()
    def show(self, scr):
        """変わったページの、変わった列の範囲だけを送る(I2Cはゆっくりなので、CPUを使いすぎないように)。
        ただし、I2Cの送りまちがい(CPUが忙しいとき、ソフトで動かすI2Cは 乱れることがある)が 残らないよう、1コマごとに 1ページずつ 全部を送りなおす"""
        if time.time() - self.t_cfg > 20: self.refresh_cfg()
        self.last[self.rr % PAGES] = None; self.rr += 1   # 順番に 1ページずつ「まだ送っていない」にして、全体を 約 PAGES コマで 送りなおす
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
        load_pet()
        scr = Screen()
        d = {'scene': '対局', 'pose': 'think', 'spd': '30', 'draw': '33', 'max': '57', 'key': '12', 'msg': 'ロン!'}
        if '--zunda' in sys.argv: WHO['v'] = 'zunda'
        print(compose(scr, d, 0.1, 0).ascii()); return 0
    if '--fill' in sys.argv or '--grid' in sys.argv:   # 画面の点検: 全部を白(--fill)、または 1ドットおきの格子(--grid)を 20秒 出す。 先に: sudo systemctl stop mjoled
        bus = find_bus()
        if bus is None: print('OLED が見つかりません'); return 1
        o = Oled(bus, ADDR); o.init(); scr = Screen()
        for y in range(HEIGHT):
            for x in range(WIDTH):
                if '--fill' in sys.argv or (x + y) % 2 == 0: scr._set(x, y, 1)
        for _ in range(60): o.show(scr); time.sleep(0.33)
        print('点検おわり。 sudo systemctl start mjoled で もどります'); return 0
    low_prio = [False]   # 起動して 60秒たつまでは ふつうの優先度で動く(起動のときに 負荷が高くても、OLEDを すぐ出すため)。 そのあと、いちばん低い優先度に
    import random
    WHO['v'] = 'zunda'
    was_alive = False; need_repick = False
    oled = None; tick = 0; fr = 0; base = None; demo_i = 0; t_demo = 0; next_try = 0; ever_alive = False
    while True:
        t0 = time.time()
        if not low_prio[0] and uptime() > 60:
            low_prio[0] = True
            try: os.nice(19)
            except OSError: pass
            try: os.sched_setscheduler(0, os.SCHED_IDLE, os.sched_param(0))
            except Exception: pass
        if oled is None and not dry and t0 >= next_try:
            bus = find_bus()
            if bus is None:
                print('mjoled: OLED が見つかりません(config.txt の i2c-gpio と、つなぎかたを確認)。 もう一度さがします', flush=True); next_try = t0 + (0.3 if uptime() < 90 else 10)  # 起動の直後は、1秒ごとに さがす(装置が できるのを待つ)
            else:
                try: oled = Oled(bus, ADDR); oled.init(); print('mjoled: i2c-%d の 0x%02X に つなぎました(%s %dx%d)' % (bus, ADDR, DRV, WIDTH, HEIGHT), flush=True)
                except OSError as e: print('mjoled: 初期化に失敗: %s' % e, flush=True); oled = None; next_try = t0 + 10
        if '--demo' in sys.argv:
            if t0 - t_demo > 4: t_demo = t0; demo_i = (demo_i + 1) % len(DEMO)
            p, sc, sub = DEMO[demo_i]
            d, age = {'scene': sc, 'pose': p, 'spd': '30', 'draw': '33', 'max': '57', 'key': '12', 'msg': sub}, 0
        else:
            d, age = read_status(STATUS)
        alive_now = d is not None and age < 4.0 and d.get('scene') not in ('EXIT', 'MAINT', 'SAVING')
        if '--zunda' in sys.argv: WHO['v'] = 'zunda'
        was_alive = alive_now
        if alive_now: ever_alive = True
        if base is None or fr % SUB == 0:   # ふつうの画面は 1秒に 3回だけ作る(CPUを つかいすぎない)。 背景は 毎コマ 動かす
            base = compose0(Screen(), d, age, tick, ever_alive); tick += 1
        scr = Screen(); scr.buf = [bytearray(b) for b in base.buf]
        if '--nodecor' not in sys.argv and os.environ.get('MJOLED_DECOR', '1') != '0': decor(scr, fr, bg_kind(d, age))
        fr += 1
        if oled is not None:
            try: oled.show(scr)
            except OSError as e:
                print('mjoled: 送信に失敗: %s(つなぎなおします)' % e, flush=True)
                try: os.close(oled.fd)
                except Exception: pass
                oled = None; next_try = time.time() + 3
        if not PET_LOADED[0] and (oled is not None or dry or tick > 3): load_pet()   # 最初の画面(起動中)を出した あとで、ペットの絵を読む
        dt = time.time() - t0
        time.sleep(max(0.05, 1.0 / FPS - dt))

if __name__ == '__main__':
    sys.exit(main() or 0)
