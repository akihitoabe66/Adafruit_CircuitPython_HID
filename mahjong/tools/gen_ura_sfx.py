#!/usr/bin/env python3
"""裏ドラ確認アニメの効果音を作る。 ura_slide=ドラ牌が上へ出る「スッ」(ほぼ聞こえない小ささ) / ura_tap=裏ドラの牌が卓に置かれる「トンッ」(ふっくら・低め)。 出力: audio/sfx/"""
import numpy as np, wave, os
SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'audio', 'sfx')
rng = np.random.default_rng(5)
def save(name, x, peak):
    x = x / (np.max(np.abs(x)) + 1e-9) * peak
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype(np.int16).tobytes())
def lp(x, k): return np.convolve(x, np.ones(k) / k, mode='same')
def env(n, tau): t = np.arange(n) / SR; return np.exp(-t / tau)
# トンッ: 木の卓に ふっくら置く(低め・丸い)
n = int(SR * 0.26); t = np.arange(n) / SR; f = 95 + 120 * np.exp(-t / 0.025); ph = 2 * np.pi * np.cumsum(f) / SR
save('ura_tap', np.sin(ph) * env(n, 0.075) + lp(rng.standard_normal(n), 18) * env(n, 0.010) * 0.7, 0.9)
# スッ: 牌がすべる(短い・やわらかい雑音)。 音の大きさは、トンッの約-30dB
n = int(SR * 0.22); t = np.arange(n) / SR; a = np.sin(np.pi * np.clip(t / 0.22, 0, 1)) ** 1.5
save('ura_slide', lp(rng.standard_normal(n), 30) * a, 0.9 * 0.03)
print('ok')
