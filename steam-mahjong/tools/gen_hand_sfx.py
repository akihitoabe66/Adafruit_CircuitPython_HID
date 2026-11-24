#!/usr/bin/env python3
"""CPUが上がったとき、手牌を「ダッ!」と倒す効果音(audio/sfx/hand_open.wav)を作る。 13枚ぶんの小さな「コツ」が、60msほどの間に かさなる + 卓に落ちる低い音。"""
import numpy as np, wave, os
SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'audio', 'sfx')
rng = np.random.default_rng(11)
def lp(x, k): return np.convolve(x, np.ones(k) / k, mode='same')
n = int(SR * 0.42); x = np.zeros(n)
for i in range(13):   # 牌が順に 倒れる(左から右へ、ほぼ同時)
    t0 = int(SR * (0.004 + i * 0.0045 + rng.uniform(0, 0.003)))
    m = int(SR * 0.05); t = np.arange(m) / SR
    clack = lp(rng.standard_normal(m), 5) * np.exp(-t / 0.006) * rng.uniform(0.5, 1.0)
    x[t0:t0 + m] += clack[: n - t0]
t = np.arange(n) / SR   # 卓に落ちる、丸い低音(ドンッ)
x += np.sin(2 * np.pi * (80 + 90 * np.exp(-t / 0.03)).cumsum() / SR) * np.exp(-t / 0.09) * 1.4
x = x / (np.max(np.abs(x)) + 1e-9) * 0.85
with wave.open(os.path.join(OUT, 'hand_open.wav'), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype(np.int16).tobytes())
print('ok')
