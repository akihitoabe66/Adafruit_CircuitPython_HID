#!/usr/bin/env python3
"""サイコロの効果音を作る。 dice_hit=床に跳ねる「ドッ」 / dice_clack=サイコロどうしがぶつかる「チャ」。 出力: audio/sfx/*.wav"""
import numpy as np, wave, os
SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'audio', 'sfx')
rng = np.random.default_rng(11)
def save(name, x):
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.85
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype(np.int16).tobytes())
def lowpass(x, k):
    return np.convolve(x, np.ones(k) / k, mode='same')
# ドッ: 低い丸い音(木や布の上に落ちる感じ) + ちいさな ノイズ
n = int(SR * 0.22); t = np.arange(n) / SR
f = 70 + 130 * np.exp(-t / 0.03); ph = 2 * np.pi * np.cumsum(f) / SR
body = np.sin(ph) * np.exp(-t / 0.055)
nz = lowpass(rng.standard_normal(n), 14) * np.exp(-t / 0.012) * 1.2
save('dice_hit', body + nz * 0.6)
# チャ: かたい軽い音(サイコロ どうし)。 高いノイズ + 2つの共鳴
n = int(SR * 0.16); t = np.arange(n) / SR
hi = np.diff(rng.standard_normal(n + 1)) * np.exp(-t / 0.018)
ring = np.sin(2 * np.pi * 2350 * t) * np.exp(-t / 0.035) * 0.5 + np.sin(2 * np.pi * 3320 * t) * np.exp(-t / 0.025) * 0.35 + np.sin(2 * np.pi * 1480 * t) * np.exp(-t / 0.05) * 0.3
save('dice_clack', hi * 0.5 + ring)
print('ok')
