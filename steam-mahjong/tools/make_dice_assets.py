#!/usr/bin/env python3
# サイコロの絵(img/dice)と、転がりの軌道(native/app/dicepat.js)を作る。 使い方: python3 tools/make_dice_assets.py
import os, sys, math, random, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'tools', 'dice_src')
PIPS = {1: [(.5, .5)], 2: [(.28, .28), (.72, .72)], 3: [(.26, .26), (.5, .5), (.74, .74)], 4: [(.28, .28), (.72, .28), (.28, .72), (.72, .72)],
        5: [(.27, .27), (.73, .27), (.5, .5), (.27, .73), (.73, .73)], 6: [(.3, .26), (.7, .26), (.3, .5), (.7, .5), (.3, .74), (.7, .74)]}
def load(path, crop, thr=165):
    a = np.array(Image.open(path).convert('RGB')).astype(float); alpha = np.clip((a.min(axis=2) - thr) / 35, 0, 1)
    return Image.fromarray(np.dstack([a, alpha * 255]).astype(np.uint8), 'RGBA').crop(crop), crop[:2]
def layer(n, quad3, org, size):
    S = 500; big = Image.new('L', (S * 2, S * 2), 0); d = ImageDraw.Draw(big); r = (0.12 if n == 1 else 0.085) * S * 2
    for (u, v) in PIPS[n]:
        cx, cy = u * S * 2, v * S * 2; d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    m = big.resize((S, S), Image.LANCZOS)
    (x0, y0), (x1, y1), (x3, y3) = [(p[0] - org[0], p[1] - org[1]) for p in quad3]
    A = np.array([[x1 - x0, x3 - x0, x0], [y1 - y0, y3 - y0, y0], [0, 0, 1]], float) @ np.diag([1 / S, 1 / S, 1]); Ai = np.linalg.inv(A)
    return m.transform(size, Image.AFFINE, (Ai[0, 0], Ai[0, 1], Ai[0, 2], Ai[1, 0], Ai[1, 1], Ai[1, 2]), Image.BICUBIC)
def render(base, org, faces, ns, sz):
    W, H = base.size; arr = np.array(base).astype(float); lm = np.array(base.convert('RGB')).astype(float).mean(axis=2) / 255
    for n, q in zip(ns, faces):
        m = np.array(layer(n, q, org, (W, H))).astype(float) / 255; col = np.array([205, 30, 40] if n == 1 else [28, 28, 32], float)
        c = col * np.clip(lm * 1.05, 0.55, 1)[..., None]; m3 = m[..., None] * .96; arr[..., :3] = arr[..., :3] * (1 - m3) + c * m3
    im = Image.fromarray(arr.astype(np.uint8), 'RGBA'); im = im.crop(im.getbbox()); s = max(im.size)
    cv = Image.new('RGBA', (s, s), (0, 0, 0, 0)); cv.paste(im, ((s - im.size[0]) // 2, (s - im.size[1]) // 2)); return cv.resize((sz, sz), Image.LANCZOS)
SA = os.path.join(SRC, 'dice_a.jpg'); SB = os.path.join(SRC, 'dice_b.jpg')
bA, oA = load(SA, (430, 95, 972, 668)); bB, oB = load(SB, (440, 60, 970, 680))
FA = [[(700, 112), (958, 214), (447, 214)], [(447, 226), (697, 326), (452, 546)], [(703, 326), (957, 226), (703, 652)]]
FB = [[(458, 225), (703, 78), (455, 505)], [(703, 78), (950, 225), (703, 368)], [(455, 505), (703, 368), (705, 665)]]
TRI = {1: (1, 2, 3), 2: (2, 3, 1), 3: (3, 1, 2), 4: (4, 6, 5), 5: (5, 4, 6), 6: (6, 5, 4)}
SZ = 96
def render(base, org, faces, ns, sz):
    W, H = base.size; arr = np.array(base).astype(float); lm = np.array(base.convert('RGB')).astype(float).mean(axis=2) / 255
    for n, q in zip(ns, faces):
        m = np.array(layer(n, q, org, (W, H))).astype(float) / 255; col = np.array([205, 30, 40] if n == 1 else [28, 28, 32], float)
        c = col * np.clip(lm * 1.05, 0.55, 1)[..., None]; m3 = m[..., None] * .96; arr[..., :3] = arr[..., :3] * (1 - m3) + c * m3
    im = Image.fromarray(arr.astype(np.uint8), 'RGBA'); im = im.crop(im.getbbox()); s = max(im.size)
    cv = Image.new('RGBA', (s, s), (0, 0, 0, 0)); cv.paste(im, ((s - im.size[0]) // 2, (s - im.size[1]) // 2)); return cv.resize((sz, sz), Image.LANCZOS)
import math, random
DT = 1 / 24.0; G = 1500.0; RAD = 44
def simulate(pat, W=520):
    # 地面の座標(x, z=画面のy)と高さ h。z が小さいほど奥(上)
    D = [dict(x=W + 40, z=pat['z'][0], h=60 + pat['h'][0], vx=pat['vx'][0], vz=pat['vz'][0], vh=0.0, rest=None),
         dict(x=W + 40 + pat['dx'], z=pat['z'][1], h=60 + pat['h'][1], vx=pat['vx'][1], vz=pat['vz'][1], vh=0.0, rest=None)]
    tr = [[], []]; col = None
    for f in range(160):
        for d in D:
            if d['rest'] is not None: continue
            d['vh'] -= G * DT; d['h'] += d['vh'] * DT; d['x'] += d['vx'] * DT; d['z'] += d['vz'] * DT
            if d['h'] <= 0:
                d['h'] = 0
                if abs(d['vh']) > 160: d['vh'] = -d['vh'] * 0.5
                else: d['vh'] = 0
                d['vx'] *= 0.82; d['vz'] *= 0.82
            if d['h'] == 0 and d['vh'] == 0:
                d['vx'] *= 0.90; d['vz'] *= 0.90
                if math.hypot(d['vx'], d['vz']) < 14: d['rest'] = f; d['vx'] = d['vz'] = 0
        a, b = D
        dx, dz = b['x'] - a['x'], (b['z'] - a['z']) * 1.6
        dist = math.hypot(dx, dz)
        if dist < RAD * 2 and abs(a['h'] - b['h']) < 50 and col is None or (dist < RAD * 2 and col is not None and f - col > 6 and abs(a['h'] - b['h']) < 50 and False):
            if dist < 1e-3: dist = 1e-3
            nx, nz = dx / dist, dz / dist
            va = a['vx'] * nx + a['vz'] * 1.6 * nz; vb = b['vx'] * nx + b['vz'] * 1.6 * nz
            if va - vb > 0:  # 近づいているとき
                e = 0.45; na = (va + vb - e * (va - vb)) / 2; nb = (va + vb + e * (va - vb)) / 2
                a['vx'] += (na - va) * nx; a['vz'] += (na - va) * nz / 1.6; b['vx'] += (nb - vb) * nx; b['vz'] += (nb - vb) * nz / 1.6
                a['vh'] = max(a['vh'], 200); b['vh'] = max(b['vh'], 300); a['vx'] *= .7; b['vx'] *= .7; a['vz'] *= .7; b['vz'] *= .7; a['rest'] = b['rest'] = None; col = f
            ov = RAD * 2 - dist; a['x'] -= nx * ov / 2; b['x'] += nx * ov / 2; a['z'] -= nz * ov / 3.2; b['z'] += nz * ov / 3.2
        for k in (0, 1): tr[k].append((D[k]['x'], D[k]['z'], D[k]['h'], D[k]['rest'] is not None))
        if all(d['rest'] is not None for d in D): break
    return tr, [d['rest'] for d in D], col

PATS = [
  ('3', dict(z=[238, 244], h=[0, 0], vx=[-380, -700], vz=[-100, -100], dx=230)),
  ('5', dict(z=[228, 234], h=[0, 0], vx=[-300, -700], vz=[-70, -80], dx=280)),
  ('12', dict(z=[232, 250], h=[0, 0], vx=[-380, -720], vz=[-95, -105], dx=230)),
  ('13', dict(z=[238, 244], h=[0, 0], vx=[-320, -560], vz=[-90, -90], dx=200)),
  ('16', dict(z=[222, 246], h=[0, 0], vx=[-300, -720], vz=[-50, -110], dx=280)),
  ('18', dict(z=[230, 236], h=[0, 0], vx=[-160, -720], vz=[-40, -80], dx=300)),
]
K = 0.8125  # 作図(1024幅)から、ゲームの画面(832幅)への倍率
def main():
    out = os.path.join(ROOT, 'img', 'dice'); os.makedirs(out, exist_ok=True)
    for n in range(1, 7): render(bA, oA, FA, TRI[n], SZ).save(os.path.join(out, 'a%d.webp' % n), 'WEBP', quality=90, method=6)
    random.seed(3)
    for i in range(6): render(bB, oB, FB, tuple(random.sample(range(1, 7), 3)), SZ).save(os.path.join(out, 'b%d.webp' % i), 'WEBP', quality=90, method=6)
    sh = Image.new('RGBA', (64, 24), (0, 0, 0, 0)); ImageDraw.Draw(sh).ellipse([4, 4, 59, 19], fill=(0, 0, 0, 200)); sh.filter(ImageFilter.GaussianBlur(2)).save(os.path.join(out, 'shadow.webp'), 'WEBP', quality=90)
    pats = []
    for name, pat in PATS:
        tr, rest, col = simulate(pat, 1180); n = len(tr[0])
        cx = sum(tr[k][-1][0] for k in (0, 1)) / 2; cz = sum(tr[k][-1][1] for k in (0, 1)) / 2
        d = {'n': n, 'rest': [r if r is not None else n - 1 for r in rest], 'col': col, 'p': [], 'bounce': [[], []]}
        for k in (0, 1):
            arr = []
            for f in range(n):
                x, z, h, _ = tr[k][f]
                arr.append([round((x - cx) * K, 1), round((z - cz) * 0.5 * K, 1), round(h * K, 1)])
                if f > 0 and h == 0 and tr[k][f - 1][2] > 0: d['bounce'][k].append([f, round(min(1.0, (tr[k][f - 1][2] + 20) / 120.0), 2)])  # [コマ, 強さ0..1]
            d['p'].append(arr)
        pats.append(d)
    with open(os.path.join(ROOT, 'native', 'app', 'dicepat.js'), 'w') as f:
        f.write('// 自動生成(tools/make_dice_assets.py): サイコロの転がる軌道。24コマ/秒。 p[サイコロ][コマ] = [x, 奥行き, 高さ](止まる位置の中心からの差)\n')
        f.write('globalThis.DICEPAT = ' + json.dumps(pats, separators=(',', ':')) + ';\n')
    print('ok', [p['n'] for p in pats])
if __name__ == '__main__': main()
