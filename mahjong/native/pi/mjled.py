#!/usr/bin/env python3
"""麻雀ゲーム機の LED とファンの制御(常駐プログラム)。
 - GPIO16 の LED: 電源が入って、これが起動したら点灯。SDカードにアクセスするたびに、一瞬消える(まばたき)。
 - GPIO17 のファン(--fan を付けたときだけ): CPU温度が高いと回り、下がると止まる(スイッチ基板を経由してつなぐこと)。
 Linux の sysfs(/sys/class/gpio)だけを使う。追加の部品は不要。"""
import os, sys, time, glob

ROOT = os.environ.get('MJLED_ROOT', '')          # 試験用: 偽の /sys の場所
LED, FAN = 16, 17
FAN_ON, FAN_OFF = 55000, 48000                   # 温度(ミリ度): この温度以上で回り、以下で止まる
USE_FAN = '--fan' in sys.argv
G = ROOT + '/sys/class/gpio'

def w(path, val):
    with open(path, 'w') as f: f.write(str(val))

def r(path, default=''):
    try:
        with open(path) as f: return f.read().strip()
    except Exception: return default

def base():
    for c in sorted(glob.glob(G + '/gpiochip*')):
        if 'bcm2835' in r(c + '/label') or 'pinctrl' in r(c + '/label'): return int(r(c + '/base', '0'))
    return 0

B = base()

def setup(pin, value):
    n = B + pin; d = '%s/gpio%d' % (G, n)
    if not os.path.isdir(d):
        try: w(G + '/export', n)
        except OSError as e:
            print('export gpio%d failed: %s (カーネル側が使っているかも。config.txt の act_led / gpio-led の行を消してください)' % (pin, e), flush=True); return None
        for _ in range(50):
            if os.path.isdir(d): break
            time.sleep(0.02)
    try: w(d + '/direction', 'out'); w(d + '/value', value)
    except OSError as e: print('setup gpio%d failed: %s' % (pin, e), flush=True); return None
    return d + '/value'

def put(path, v):
    if path:
        try: w(path, v)
        except OSError: pass

def disk_count():
    s = r(ROOT + '/sys/block/mmcblk0/stat').split()
    return (int(s[0]) + int(s[4])) if len(s) > 4 else 0   # 読んだ回数 + 書いた回数

def temp():
    try: return int(r(ROOT + '/sys/class/thermal/thermal_zone0/temp', '0'))
    except ValueError: return 0

led = setup(LED, 1)
fan = setup(FAN, 0) if USE_FAN else None
print('mjled: start base=%d led=%s fan=%s' % (B, bool(led), bool(fan)), flush=True)
last, fan_on, tick = disk_count(), False, 0
while True:
    time.sleep(0.03)
    n = disk_count()
    if n != last:                       # SDカードにアクセスがあった
        last = n
        put(led, 0); time.sleep(0.06); put(led, 1)
        last = disk_count()             # この間のアクセスは、数えない
    tick += 1
    if fan and tick % 100 == 0:         # 3秒ごとに温度を見る
        t = temp()
        if not fan_on and t >= FAN_ON: fan_on = True; put(fan, 1)
        elif fan_on and t <= FAN_OFF: fan_on = False; put(fan, 0)
