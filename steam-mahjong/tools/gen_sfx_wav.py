#!/usr/bin/env python3
"""js/sfx.js の効果音(WebAudioで合成)を、同じ作りでWAVに書き出す(ネイティブ版用)。 出力: audio/sfx/<名前>.wav"""
import numpy as np, wave, os, math
SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'audio', 'sfx')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)

def osc(kind, f0, to, dur, n):
    t = np.arange(n) / SR
    if to:
        # 周波数は指数で変化 → 位相は積分
        k = math.log(to / f0) / dur
        ph = 2 * np.pi * f0 * (np.exp(k * np.minimum(t, dur)) - 1) / k + 2 * np.pi * to * np.maximum(t - dur, 0)
    else:
        ph = 2 * np.pi * f0 * t
    if kind == 'sine': return np.sin(ph)
    if kind == 'square': return np.sign(np.sin(ph))
    if kind == 'sawtooth': return 2 * ((ph / (2 * np.pi)) % 1.0) - 1
    if kind == 'triangle': return 2 * np.abs(2 * ((ph / (2 * np.pi)) % 1.0) - 1) - 1
    return np.sin(ph)

def expramp(a, b, t0, t1, t):
    out = np.full_like(t, np.nan)
    m = (t >= t0) & (t <= t1)
    out[m] = a * (b / a) ** ((t[m] - t0) / (t1 - t0))
    return out

def biquad(x, typ, f, q):
    w0 = 2 * math.pi * f / SR; al = math.sin(w0) / (2 * q); c = math.cos(w0)
    if typ == 'lowpass': b0, b1, b2 = (1 - c) / 2, 1 - c, (1 - c) / 2
    elif typ == 'highpass': b0, b1, b2 = (1 + c) / 2, -(1 + c), (1 + c) / 2
    else: b0, b1, b2 = al, 0, -al  # bandpass(定ゲイン)
    a0, a1, a2 = 1 + al, -2 * c, 1 - al
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
    y = np.zeros_like(x); x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1 = x1, x[i]; y2, y1 = y1, v; y[i] = v
    return y

class Mix:
    def __init__(s): s.buf = np.zeros(int(SR * 2.5))
    def add(s, sig, at):
        i = int(at * SR); n = min(len(sig), len(s.buf) - i)
        if n > 0: s.buf[i:i + n] += sig[:n]
    def tone(s, f, dur, typ='sine', vol=0.3, to=None, at=0):
        n = int((dur + 0.02) * SR); t = np.arange(n) / SR
        g = np.where(t < 0.008, expramp(0.0001, vol, 0, 0.008, t), expramp(vol, 0.0001, 0.008, dur, t))
        g = np.nan_to_num(g, nan=0.0001); g[t > dur] = 0
        s.add(osc(typ, f, to, dur, n) * g, at)
    def noise(s, dur, freq, vol=0.3, q=1, at=0, typ='bandpass'):
        n = max(1, int(SR * dur)); d = (rng.random(n) * 2 - 1) * (1 - np.arange(n) / n)
        d = biquad(d, typ, freq, q); t = np.arange(n) / SR
        g = expramp(vol, 0.0001, 0, dur, t); g = np.nan_to_num(g, nan=0.0001)
        s.add(d * g, at)
    def clack(s, vol=0.5, at=0, pitch=1):
        s.noise(0.05, 2200 * pitch, vol, 2.5, at); s.tone(170 * pitch, 0.07, 'triangle', vol * 0.8, 70 * pitch, at)
    def save(s, name):
        end = int(np.max(np.nonzero(np.abs(s.buf) > 1e-4)[0]) + SR * 0.05) if np.any(np.abs(s.buf) > 1e-4) else SR // 10
        x = s.buf[:end]; pk = np.max(np.abs(x)); x = x * (0.9 / pk) if pk > 0.9 else x
        with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype('<i2').tobytes())

def make(name):
    m = Mix(); T, N = m.tone, m.noise
    if name == 'click': T(1100, 0.05, 'sine', 0.22, 700)
    elif name == 'select': T(760, 0.05, 'triangle', 0.2, 980)
    elif name == 'draw': N(0.04, 1500, 0.22, 1.5); T(300, 0.04, 'triangle', 0.12)
    elif name == 'deal4': m.clack(0.7, 0, 1); m.clack(0.35, 0.014, 1.12)
    elif name == 'deal1': m.clack(0.5, 0, 1)
    elif name == 'sort1': m.clack(0.6, 0, 1)
    elif name == 'sort2': m.clack(0.75, 0, 1.08)
    elif name == 'deal':
        for i in range(13): m.clack(0.22 + (0.08 if i % 4 == 3 else 0), 0.14 + i * 0.055, 0.95 + (i % 3) * 0.06)
    elif name == 'discard': m.clack(0.55)
    elif name == 'call': m.clack(0.5); m.clack(0.5, 0.09, 1.1); T(880, 0.22, 'triangle', 0.22, 1320, 0.14)
    elif name == 'kan': m.clack(0.5); m.clack(0.5, 0.08, 1.1); m.clack(0.5, 0.16, 1.2); T(520, 0.35, 'sawtooth', 0.15, 260, 0.2)
    elif name == 'riichi': N(0.3, 3000, 0.25, 0.7, 0); T(420, 0.35, 'sawtooth', 0.14, 1300); T(1760, 0.25, 'sine', 0.22, None, 0.28); m.clack(0.4, 0.3)
    elif name == 'ron': N(0.45, 500, 0.5, 0.5); T(140, 0.5, 'sawtooth', 0.4, 45); T(660, 0.4, 'square', 0.14, None, 0.08); T(990, 0.4, 'square', 0.12, None, 0.08); T(1320, 0.5, 'triangle', 0.16, None, 0.12)
    elif name == 'tsumo':
        for i, f in enumerate([523, 659, 784, 1047, 1319]): T(f, 0.28, 'triangle', 0.22, None, i * 0.07)
        N(0.3, 6000, 0.12, 0.8, 0.3, 'highpass')
    elif name == 'win':
        for i, f in enumerate([523, 659, 784, 1047]): T(f, 0.3, 'triangle', 0.26, None, i * 0.12)
        T(1047, 0.7, 'sine', 0.2, None, 0.5); T(784, 0.7, 'sine', 0.16, None, 0.5)
    elif name == 'lose':
        for i, f in enumerate([392, 349, 294, 220]): T(f, 0.32, 'sine', 0.24, None, i * 0.16)
    elif name == 'drawgame': T(330, 0.3, 'sine', 0.2); T(294, 0.5, 'sine', 0.2, None, 0.22)
    elif name == 'slam': T(150, 0.22, 'sine', 0.9, 38); N(0.25, 2400, 0.5, 0.7, 0, 'lowpass'); T(90, 0.18, 'triangle', 0.55, 45)
    elif name == 'start': T(196, 1.2, 'sine', 0.3, 190); T(392, 1.0, 'sine', 0.16); T(588, 0.8, 'sine', 0.1); N(0.12, 4000, 0.2, 1, 0, 'highpass')
    elif name == 'end':
        for i, f in enumerate([392, 523, 659, 784, 1047]): T(f, 0.34, 'square', 0.12, None, i * 0.12)
        T(1047, 0.9, 'triangle', 0.22, None, 0.6)
    elif name == 'ok': T(660, 0.12, 'triangle', 0.25); T(990, 0.28, 'triangle', 0.25, None, 0.1)
    elif name == 'ng': T(220, 0.28, 'sawtooth', 0.18, 140)
    elif name == 'error': T(200, 0.12, 'square', 0.15)
    m.save(name)

NAMES = ['click', 'select', 'draw', 'deal4', 'deal1', 'sort1', 'sort2', 'deal', 'discard', 'call', 'kan', 'riichi', 'ron', 'tsumo', 'win', 'lose', 'drawgame', 'slam', 'start', 'end', 'ok', 'ng', 'error']
for n in NAMES: make(n)
print('ok', len(NAMES))
