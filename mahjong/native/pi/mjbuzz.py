#!/usr/bin/env python3
"""小型スピーカー(ブザー)で 合図を鳴らす常駐プログラム。 GPIO18 の PWM で 音程を作る(使うのは 標準ライブラリだけ)。
 種類(MJBUZZ_TYPE): piezo(標準。 ムラタの圧電サウンダーなど。 4kHzごろが いちばん大きい) / coil(電磁式の スピーカー・ブザー)
 つなぎかた(piezo): GPIO18(物理12番) → 100〜470Ω → サウンダーの片方 / もう片方 → GND(物理6番)。 トランジスタは 要らない。
 つなぎかた(coil): GPIO18 → 1kΩ → トランジスタ(2SC1815 など)のベース / エミッタ → GND / コレクタ → スピーカー → 3.3V。 スピーカーに 直列で 47〜100Ω、 両端に ダイオード(1N4148)。
 config.txt に  dtoverlay=pwm,pin=18,func=2  (install_buzz.sh が 入れる)。
 鳴らす合図: 電源ON(Linuxが起きたとき 1回)=「ピポッ」 / ゲーム終了(電源を抜いてよい)=ゆっくり さがる4音 / 熱の注意=ピッピッピッ / 熱の危険=高く速い音 / 電圧が弱い=ピー・ピー。 ゲームの はじまりでは 鳴らさない。

 音の大きさ: ゲームの設定「ブザーの音」(なし・小・中・大)が いちばん優先。 ゲームが 動いていないときは MJBUZZ_VOL(1〜3)か MJBUZZ_DUTY。
 環境変数: MJBUZZ=0 で 鳴らさない / MJBUZZ_DUTY(音の大きさ 1〜50。 piezo は 50 が いちばん大きい、 標準 piezo=50 coil=20) / MJBUZZ_TYPE。
 試験: python3 mjbuzz.py --test(全部の合図を 順に鳴らす) / --dry(鳴らさず 文字で)"""
import os, sys, time

try:
    from mjoled import health, read_status
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from mjoled import health, read_status

STATUS = os.environ.get('MJOLED_FILE', '/dev/shm/mj_oled.txt')
PWM = os.environ.get('MJBUZZ_PWMCHIP', '/sys/class/pwm/pwmchip0')
CH = os.environ.get('MJBUZZ_PIN', '0')
TYPE = os.environ.get('MJBUZZ_TYPE', 'piezo').lower()
VOLS = [0, 10, 25, 50] if TYPE == 'piezo' else [0, 6, 12, 20]   # 音の大きさ: なし / 小 / 中 / 大(PWMの デューティ%。 圧電は 50%が いちばん大きい)
DUTY = max(1, min(50, int(os.environ.get('MJBUZZ_DUTY', str(VOLS[3])))))   # ゲームの設定が 届かないときの 大きさ
if 'MJBUZZ_VOL' in os.environ:   # 1〜3(小・中・大)
    try: DUTY = VOLS[max(1, min(3, int(os.environ['MJBUZZ_VOL'])))]
    except ValueError: pass
ON = os.environ.get('MJBUZZ', '1') != '0'
DRY = '--dry' in sys.argv
# 音の高さ(Hz)
C5, E5, G5, A5, C6, E6, G6 = 523, 659, 784, 880, 1047, 1319, 1568      # 電磁式(coil)向け
C7, D7, E7, G7, A7, B7, C8, D8 = 2093, 2349, 2637, 3136, 3520, 3951, 4186, 4699   # 圧電(piezo)向け: 高い音ほど 大きく鳴る
if TYPE == 'piezo':   # 圧電: 高い音ほど 大きい
    PAT = {
        'poweron': [(3951, 70), (0, 25), (2637, 130)],                                   # 電源ON: 「ピポッ」(PC-9801の起動音のように 高→低)
        'exit': [(3951, 170), (0, 20), (3136, 170), (0, 20), (2637, 170), (0, 20), (2093, 520)],   # 終了: ゆっくり さがる 4音(電源を抜いてよい)
        'warn': [(4000, 120), (0, 80), (4000, 120), (0, 80), (4000, 120)],               # 熱の注意: ピッピッピッ
        'danger': [(4400, 90), (0, 40), (3600, 90), (0, 40), (4400, 90), (0, 40), (3600, 90)],   # 危険: 高く 速く(ゆれる音)
        'lowv': [(3600, 380), (0, 120), (3600, 380)],                                    # 電圧が弱い: ピー・ピー(長い音)
        'bootfail': [(2093, 600), (0, 150), (2093, 600), (0, 150), (2093, 900)],         # 起動しっぱい: ひくい ピー・ピー・ピーー(ゲームが 立ち上がらない)
    }
else:             # 電磁式: ひくめの 音
    PAT = {
        'poweron': [(1568, 70), (0, 25), (784, 130)],
        'exit': [(1568, 170), (0, 20), (1319, 170), (0, 20), (1047, 170), (0, 20), (784, 520)],
        'warn': [(880, 120), (0, 80), (880, 120), (0, 80), (880, 120)],
        'danger': [(1319, 100), (0, 50), (1568, 100), (0, 50), (1319, 100), (0, 50), (1568, 100)],
        'lowv': [(660, 380), (0, 120), (660, 380)],
        'bootfail': [(523, 600), (0, 150), (523, 600), (0, 150), (523, 900)],
    }


class Pwm:
    duty = DUTY
    def __init__(self):
        self.d = '%s/pwm%s' % (PWM, CH)
        if not DRY:
            for _ in range(100):   # 起動の早いうちは PWM の装置が まだ できていない: 最大 10秒 まつ
                if os.path.isdir(PWM): break
                time.sleep(0.1)
            if not os.path.isdir(self.d):
                with open(PWM + '/export', 'w') as f: f.write(CH)
                for _ in range(20):
                    if os.path.isdir(self.d): break
                    time.sleep(0.05)
    def _w(self, name, v):
        with open('%s/%s' % (self.d, name), 'w') as f: f.write(str(int(v)))
    def tone(self, hz):
        if DRY: print('  tone %s' % hz, flush=True); return
        if hz <= 0: self.off(); return
        per = int(1e9 / hz)
        try: self._w('enable', 0)
        except OSError: pass
        self._w('period', per); self._w('duty_cycle', per * self.duty // 100); self._w('enable', 1)
    def off(self):
        if DRY: return
        try: self._w('enable', 0)
        except OSError: pass


def play(pwm, name):
    if not ON or getattr(pwm, 'muted', False): return
    for hz, ms in PAT[name]:
        pwm.tone(hz); time.sleep(ms / 1000.0)
    pwm.off()


def appliance():
    """「コンセントを入れるだけで遊べる」設定(ゲーム自動起動)か。 手で起動する使い方のときは 起動しっぱいの音を 鳴らさない"""
    import glob
    for f in glob.glob('/home/*/.bash_profile') + ['/root/.bash_profile']:
        try:
            if 'mahjong-autostart' in open(f, errors='ignore').read(): return True
        except OSError: pass
    return False


def main():
    pwm = Pwm()
    if '--test' in sys.argv or DRY and '--loop' not in sys.argv:
        for k in PAT: print('pattern', k, flush=True); play(pwm, k); time.sleep(0.8)
        return 0
    last_scene = None; exit_done = False; t_warn = 0; t_danger = 0
    # 電源ON: 起動して 120秒いないで、まだ 鳴らしていなければ 1回(サービスだけ 再起動したときは 鳴らさない)
    try: up = float(open('/proc/uptime').read().split()[0])
    except Exception: up = 9999
    flag = '/run/mjbuzz_boot'
    if up < 120 and not os.path.exists(flag):
        try: open(flag, 'w').close()
        except OSError: pass
        play(pwm, 'poweron')
    boot_check = up < 150 and appliance(); t_boot = time.time()
    while True:
        d, age = read_status(STATUS); now = time.time()
        if boot_check:   # 電源ON から 150秒たっても ゲームが 状態を 出さない = 起動しっぱい
            if d is not None and age < 6 and d.get('scene'): boot_check = False
            elif now - t_boot > 150 - up: boot_check = False; play(pwm, 'bootfail')
        if d is not None and age < 6 and d.get('buzz', '') in ('0', '1', '2', '3'):   # ゲームの設定「ブザーの音」(0=なし 1=小 2=中 3=大)
            lv = int(d['buzz']); pwm.duty = max(1, VOLS[lv]); pwm.muted = lv == 0
        else: pwm.muted = False
        scene = d.get('scene') if d is not None and (age < 4.0 or d.get('scene') in ('EXIT', 'MAINT')) else None
        if scene and scene != last_scene:
            if scene == 'EXIT' and not exit_done: exit_done = True; play(pwm, 'exit')
            if scene not in ('EXIT', 'MAINT'): exit_done = False
        last_scene = scene
        h = health()
        # 鳴らすのは「温度が高すぎる(82C〜)」「電力が足りない(電圧が下がりっぱなし)」の 危険のときだけ。 注意(75C〜 など)は 画面の表示だけで 鳴らさない。 くり返しは 20秒に1回
        if h['level'] >= 2 and now - t_danger > 20: t_danger = now; play(pwm, 'lowv' if h.get('why') == 'LOWV' else 'danger')
        time.sleep(0.5)


if __name__ == '__main__':
    sys.exit(main() or 0)
