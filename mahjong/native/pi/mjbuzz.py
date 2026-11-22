#!/usr/bin/env python3
"""小型スピーカー(ブザー)で 合図を鳴らす常駐プログラム。 GPIO18 の PWM で 音程を作る(使うのは 標準ライブラリだけ)。
 種類(MJBUZZ_TYPE): piezo(標準。 ムラタの圧電サウンダーなど。 4kHzごろが いちばん大きい) / coil(電磁式の スピーカー・ブザー)
 つなぎかた(piezo): GPIO18(物理12番) → 100〜470Ω → サウンダーの片方 / もう片方 → GND(物理6番)。 トランジスタは 要らない。
 つなぎかた(coil): GPIO18 → 1kΩ → トランジスタ(2SC1815 など)のベース / エミッタ → GND / コレクタ → スピーカー → 3.3V。 スピーカーに 直列で 47〜100Ω、 両端に ダイオード(1N4148)。
 config.txt に  dtoverlay=pwm,pin=18,func=2  (install_buzz.sh が 入れる)。
 ペットの出来事(進化・たまご・ハート・節目の言葉・クイズの級・昇段・ねむい・おきた)も 鳴らす(OLED のたまごっち機能と 連動。 ゲームの状態ファイルの変化を見る)。
 鳴らす合図: 電源ON(Linuxが起きたとき 1回)=「ピポッ」 / ゲーム終了(電源を抜いてよい)=ゆっくり さがる4音 / 熱の注意=ピッピッピッ / 熱の危険=高く速い音 / 電圧が弱い=ピー・ピー。 ゲームの はじまりでは 鳴らさない。

 音の大きさ: ゲームの設定「ブザーの音」(なし・小・中・大)が いちばん優先。 ゲームが 動いていないときは MJBUZZ_VOL(1〜3)か MJBUZZ_DUTY。
 環境変数: MJBUZZ=0 で 鳴らさない / MJBUZZ_DUTY(音の大きさ 1〜50。 piezo は 50 が いちばん大きい、 標準 piezo=50 coil=20) / MJBUZZ_TYPE。
 試験: python3 mjbuzz.py --test(全部の合図を 順に鳴らす) / --dry(鳴らさず 文字で)"""
import os, sys, time

try:
    from mjoled import health, read_status, MILES
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from mjoled import health, read_status, MILES

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
        # ずんだもん(ペット)の出来事
        'evolve1': [(2093, 80), (2637, 80), (3136, 80), (3951, 80), (4699, 260)],        # 進化: きらきら 上がる5音
        'evolve2': [(2093, 90), (2637, 90), (3136, 90), (0, 40), (3136, 90), (3951, 90), (4699, 90), (0, 60), (3951, 120), (4699, 520)],   # 最終の姿: ファンファーレ
        'egg': [(3951, 70), (0, 40), (4699, 70), (0, 160), (3951, 70), (0, 40), (4699, 70), (0, 160), (3136, 140), (3951, 200)],   # たまごにもどる: ピヨピヨ
        'heart': [(4699, 70), (0, 30), (5588, 140)],                                     # ハート: チリン
        'milestone': [(3136, 90), (0, 20), (3951, 200)],                                 # 節目の言葉: ポン
        'qlv': [(2637, 90), (3136, 90), (3951, 260)],                                    # クイズの級が上がった
        'qshi': [(2637, 90), (3136, 90), (3951, 90), (4699, 360)],                       # 師範
        'dan': [(2093, 90), (2637, 90), (3136, 90), (3951, 90), (4699, 400)],            # 昇段
        'sleepy': [(3136, 180), (0, 30), (2637, 180), (0, 30), (2093, 360)],             # ねむい
        'wake': [(2637, 120), (0, 20), (2093, 120), (0, 20), (3136, 260)],               # おきた: ふぁ〜
    }
else:             # 電磁式: ひくめの 音
    PAT = {
        'poweron': [(1568, 70), (0, 25), (784, 130)],
        'exit': [(1568, 170), (0, 20), (1319, 170), (0, 20), (1047, 170), (0, 20), (784, 520)],
        'warn': [(880, 120), (0, 80), (880, 120), (0, 80), (880, 120)],
        'danger': [(1319, 100), (0, 50), (1568, 100), (0, 50), (1319, 100), (0, 50), (1568, 100)],
        'lowv': [(660, 380), (0, 120), (660, 380)],
        'evolve1': [(1047, 80), (1319, 80), (1568, 80), (1976, 80), (2349, 260)], 'evolve2': [(1047, 90), (1319, 90), (1568, 90), (0, 40), (1568, 90), (1976, 90), (2349, 90), (0, 60), (1976, 120), (2349, 520)],
        'egg': [(1976, 70), (0, 40), (2349, 70), (0, 160), (1976, 70), (0, 40), (2349, 70), (0, 160), (1568, 140), (1976, 200)], 'heart': [(2349, 70), (0, 30), (2794, 140)],
        'milestone': [(1568, 90), (0, 20), (1976, 200)], 'qlv': [(1319, 90), (1568, 90), (1976, 260)], 'qshi': [(1319, 90), (1568, 90), (1976, 90), (2349, 360)],
        'dan': [(1047, 90), (1319, 90), (1568, 90), (1976, 90), (2349, 400)], 'sleepy': [(1568, 180), (0, 30), (1319, 180), (0, 30), (1047, 360)], 'wake': [(1319, 120), (0, 20), (1047, 120), (0, 20), (1568, 260)],
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


def _i(v):
    try: return int(v)
    except (ValueError, TypeError): return 0
def pet_event(prev, d):
    """前の状態と くらべて、ペットの出来事(いちばん大きいもの1つ)を 返す。 なければ None"""
    if prev is None: return None
    if _i(d.get('cyc')) != _i(prev.get('cyc')) or (_i(d.get('cp')) < _i(prev.get('cp')) and _i(prev.get('cp')) >= 300): return 'egg'
    f1o, f1n = prev.get('f1', ''), d.get('f1', ''); f2o, f2n = prev.get('f2', ''), d.get('f2', '')
    if f2n in ('0', '1') and f2o not in ('0', '1'): return 'evolve2'
    if f1n and not f1o: return 'evolve1'
    qo, qn = _i(prev.get('ql')), _i(d.get('ql'))
    if qn > qo: return 'qshi' if qn >= 11 else 'qlv'
    if _i(d.get('dan')) > _i(prev.get('dan')): return 'dan'
    po, pn = _i(prev.get('plays')), _i(d.get('plays'))
    if pn // 50 > po // 50 and pn // 50 > 0: return 'heart'
    if max([m for m in MILES if m <= pn] or [0]) > max([m for m in MILES if m <= po] or [0]): return 'milestone'
    io, i_n = _i(prev.get('idle')), _i(d.get('idle'))
    if io < 180 <= i_n: return 'sleepy'
    if io >= 180 > i_n: return 'wake'
    return None
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
    prev = None   # 前の状態(ペットの出来事を 見つけるため)。 はじめの1回は 音を鳴らさず 覚えるだけ
    while True:
        d, age = read_status(STATUS); now = time.time()
        if d is not None and age < 6 and d.get('buzz', '') in ('0', '1', '2', '3'):   # ゲームの設定「ブザーの音」(0=なし 1=小 2=中 3=大)
            lv = int(d['buzz']); pwm.duty = max(1, VOLS[lv]); pwm.muted = lv == 0
        else: pwm.muted = False
        scene = d.get('scene') if d is not None and (age < 4.0 or d.get('scene') in ('EXIT', 'MAINT')) else None
        if scene and scene != last_scene:
            if scene == 'EXIT' and not exit_done: exit_done = True; play(pwm, 'exit')
            if scene not in ('EXIT', 'MAINT'): exit_done = False
        last_scene = scene
        if d is not None and age < 6 and 'plays' in d:
            ev = pet_event(prev, d)
            if ev and prev is not None and not (health()['level'] >= 1): play(pwm, ev)
            prev = {k: d.get(k, '') for k in ('plays', 'cp', 'cyc', 'f1', 'f2', 'ql', 'dan', 'idle', 'scene')}
        h = health()
        if h['level'] >= 2 and now - t_danger > 6: t_danger = now; play(pwm, 'lowv' if h.get('why') == 'LOWV' else 'danger')
        elif h['level'] == 1 and now - t_warn > 90: t_warn = now; play(pwm, 'lowv' if h.get('why') == 'LOWV' else 'warn')
        time.sleep(0.5)


if __name__ == '__main__':
    sys.exit(main() or 0)
