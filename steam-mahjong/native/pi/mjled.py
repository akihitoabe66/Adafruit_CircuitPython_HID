#!/usr/bin/env python3
"""麻雀ゲーム機の LED とファンの制御(常駐プログラム)。
 - GPIO16 の LED: 電源が入って、これが起動したら点灯。SDカードにアクセスするたびに、一瞬消える(まばたき)。
 - GPIO17 のファン(スイッチ基板を経由してつなぐこと):
     --fan       : CPU温度が高いと回り、下がると止まる。
     --fan-game  : 麻雀(mj)が動いている間だけ回り、終わると止まる。 (温度が非常に高いときは、動いていなくても回す)
 Linux の sysfs(/sys/class/gpio)だけを使う。追加の部品は不要。"""
import os, sys, time, glob

ROOT = os.environ.get('MJLED_ROOT', '')          # 試験用: 偽の /sys の場所
LED, FAN = 16, 17
FAN_ON, FAN_OFF = 55000, 48000                   # 温度(ミリ度): この温度以上で回り、以下で止まる
GAME_FAN = '--fan-game' in sys.argv
USE_FAN = '--fan' in sys.argv or GAME_FAN
FAN_HOT = 70000                                  # --fan-game のとき、これ以上は 動いていなくても回す(ミリ度)
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

def game_running():
    try:
        for d in os.listdir(ROOT + '/proc'):
            if d.isdigit() and r('%s/proc/%s/comm' % (ROOT, d)) == 'mj': return True
    except OSError: pass
    return False

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
    if fan and GAME_FAN and tick % 33 == 0:    # 1秒ごとに、麻雀が動いているか見る(動いている間だけ回る。 温度が非常に高いときは 回す)
        want = game_running() or temp() >= FAN_HOT
        if want != fan_on: fan_on = want; put(fan, 1 if want else 0)
    elif fan and tick % 100 == 0:       # 3秒ごとに温度を見る
        t = temp()
        if not fan_on and t >= FAN_ON: fan_on = True; put(fan, 1)
        elif fan_on and t <= FAN_OFF: fan_on = False; put(fan, 0)
