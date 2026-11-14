#!/usr/bin/env python3
# 地図のずんだもん(歩き4コマ)を、ゲーム画面と同じ大きさで作る(画面では 拡大しない = ぼやけない)。 白1px+こげ茶1pxのふちつき。
# 元絵: tools/map_src/zunda_walk.jpg。 出力: img/map/w{0-3}g.webp と 左向き w{0-3}fg.webp(余白 P つき)
# 使い方: python3 tools/make_map_sprites.py [高さ(既定70)]
import os, sys
import numpy as np
from PIL import Image, ImageFilter
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); SRC = os.path.join(ROOT, 'tools', 'map_src'); OUT = os.path.join(ROOT, 'img', 'map')
H = int(sys.argv[1]) if len(sys.argv) > 1 else 70; P = 4
sp = Image.open(os.path.join(SRC, 'zunda_walk.jpg')).convert('RGB'); a = np.array(sp).astype(int)
bg = np.median(a[:40, :40].reshape(-1, 3), axis=0); dist = np.abs(a - bg).sum(axis=2); fg = dist > 38
cols = np.where(fg.any(axis=0))[0]; groups = []; start = cols[0]; prev = cols[0]
for c in cols[1:]:
    if c - prev > 30: groups.append((start, prev)); start = c
    prev = c
groups.append((start, prev))
boxes = []
for x0, x1 in groups[:4]:
    rows = np.where(fg[:, x0:x1 + 1].any(axis=1))[0]; boxes.append((x0, rows[0], x1, rows[-1]))
Y0 = min(b[1] for b in boxes); Y1 = max(b[3] for b in boxes); WMAX = max(b[2] - b[0] + 1 for b in boxes); sc = H / (Y1 - Y0 + 1)
W = int(round(WMAX * sc))
def ring(im, layers):   # くっきりしたふち(外側から重ねる)
    w2, h2 = im.size[0] + 2 * P, im.size[1] + 2 * P; out = Image.new('RGBA', (w2, h2), (0, 0, 0, 0))
    a0 = Image.new('L', (w2, h2), 0); a0.paste(im.getchannel('A'), (P, P))
    for d, col in sorted(layers, key=lambda x: -x[0]):
        m = a0.filter(ImageFilter.MaxFilter(d * 2 + 1)).point(lambda v: 255 if v > 90 else 0); L = Image.new('RGBA', (w2, h2), col + (255,)); L.putalpha(m); out = Image.alpha_composite(out, L)
    body = Image.new('RGBA', (w2, h2), (0, 0, 0, 0)); body.paste(im, (P, P)); return Image.alpha_composite(out, body)
STICKER = [(2, (70, 42, 22)), (1, (255, 255, 255))]
rgba = np.dstack([a, np.zeros(a.shape[:2])]).astype(np.uint8); rgba[..., 3] = (np.clip((dist - 20) / 40, 0, 1) * 255).astype(np.uint8)
for gi, (x0, y0, x1, y1) in enumerate(boxes):
    fr = Image.new('RGBA', (WMAX, Y1 - Y0 + 1), (0, 0, 0, 0)); crop = Image.fromarray(rgba[Y0:Y1 + 1, x0:x1 + 1], 'RGBA'); fr.paste(crop, ((WMAX - crop.width) // 2, 0))
    fr = fr.resize((W, H), Image.LANCZOS)
    g = ring(fr, STICKER); g.save(os.path.join(OUT, 'w%dg.webp' % gi), 'WEBP', quality=94, method=6)
    g.transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(OUT, 'w%dfg.webp' % gi), 'WEBP', quality=94, method=6)
print('size', g.size, 'W', W, 'H', H, 'P', P)
