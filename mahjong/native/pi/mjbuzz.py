#!/usr/bin/env python3
"""小型スピーカー(ブザー)で 合図を鳴らす常駐プログラム。 GPIO18 の PWM で 音程を作る(使うのは 標準ライブラリだけ)。
 つなぎかた: GPIO18(物理12番) → 1kΩ → トランジスタ(2SC1815 など)のベース / エミッタ → GND / コレクタ → スピーカー → 3.3V(物理1番)。 スピーカーに 直列で 47〜100Ω を入れる。 スピーカーの両端に ダイオード(1N4148)を 逆向きに(コレクタ側に 線の側)。
 config.txt に  dtoverlay=pwm,pin=18,func=2  (install_buzz.sh が 入れる)。
 鳴らす合図: 起動完了(タイトルが出た)=上がるチャイム / ゲーム終了(電源を抜いてよい)=ピン・ポン / 熱・電源の警告=ピッピッピッ。
 環境変数: MJBUZZ=0 で 鳴らさない / MJBUZZ_DUTY(音の大きさ 1〜50、 標準 20) / MJBUZZ_PIN は PWM のチャンネル(標準 0)。
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
DUTY = max(1, min(50, int(os.environ.get('MJBUZZ_DUTY', '20'))))
ON = os.environ.get('MJBUZZ', '1') != '0'
DRY = '--dry' in sys.argv
# 音の高さ(Hz)
C5, D5, E5, G5, A5, C6, E6, G6 = 523, 587, 659, 784, 880, 1047, 1319, 1568
PAT = {
    'ready': [(C5, 90), (E5, 90), (G5, 90), (C6, 220)],            # 起動完了: 上がるチャイム
    'exit': [(G5, 160), (0, 40), (C5, 380)],                       # ゲーム終了: ピン・ポン(電源を抜いてよい)
    'warn': [(A5, 120), (0, 80), (A5, 120), (0, 80), (A5, 120)],   # 注意: ピッピッピッ
    'danger': [(E6, 100), (0, 50), (G6, 100), (0, 50), (E6, 100), (0, 50), (G6, 100)],   # 危険: 高く 速く
}


class Pwm:
    def __init__(self):
        self.d = '%s/pwm%s' % (PWM, CH)
        if not DRY:
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
        self._w('period', per); self._w('duty_cycle', per * DUTY // 100); self._w('enable', 1)
    def off(self):
        if DRY: return
        try: self._w('enable', 0)
        except OSError: pass


def play(pwm, name):
    if not ON: return
    for hz, ms in PAT[name]:
        pwm.tone(hz); time.sleep(ms / 1000.0)
    pwm.off()


def main():
    pwm = Pwm()
    if '--test' in sys.argv or DRY and '--loop' not in sys.argv:
        for k in PAT: print('pattern', k, flush=True); play(pwm, k); time.sleep(0.8)
        return 0
    last_scene = None; ready_done = False; exit_done = False; t_warn = 0; t_danger = 0
    while True:
        d, age = read_status(STATUS); now = time.time()
        scene = d.get('scene') if d is not None and (age < 4.0 or d.get('scene') in ('EXIT', 'MAINT')) else None
        if scene and scene != last_scene:
            if not ready_done and scene not in ('起動中', 'EXIT', 'MAINT'): ready_done = True; play(pwm, 'ready')   # 起動中のあと はじめて 別の場面に なった
            if scene == 'EXIT' and not exit_done: exit_done = True; play(pwm, 'exit')
            if scene not in ('EXIT', 'MAINT'): exit_done = False
        last_scene = scene
        h = health()
        if h['level'] >= 2 and now - t_danger > 6: t_danger = now; play(pwm, 'danger')
        elif h['level'] == 1 and now - t_warn > 90: t_warn = now; play(pwm, 'warn')
        time.sleep(0.5)


if __name__ == '__main__':
    sys.exit(main() or 0)
