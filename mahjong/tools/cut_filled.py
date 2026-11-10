#!/usr/bin/env python3
"""描き足し済みの1枚画像から、浮世絵版の顔を切り出す。 python3 tools/cut_filled.py
  tools/ukiyoe/cpu_filled.jpg (32人・8×4) → img/uk/chars/face/NN.webp と NN_f.webp(左右反転)
  tools/ukiyoe/you_filled.jpg (あなた16表情・4×4) → img/uk/zunda/NN.webp
白い境目の線を、画像から測って切り分ける(拡大縮小で、すこしずれていても大丈夫)。"""
import os
import numpy as np
from PIL import Image
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); U = os.path.join(R, 'tools', 'ukiyoe'); O = os.path.join(R, 'img', 'uk')

def cells(im, ncol, nrow):
    a = np.array(im.convert('RGB')).astype(int); white = a.min(2) > 235
    def split(v, n, size):
        runs, s = [], None
        for i, x in enumerate(v > 0.9):
            if x and s is None: s = i
            if not x and s is not None: runs.append((s, i - 1)); s = None
        runs = [r for r in runs if r[0] > 20 and r[1] < size - 20]
        assert len(runs) == n - 1, runs
        edges = [0] + [e for r in runs for e in (r[0], r[1] + 1)] + [size]
        return [(edges[2 * i], edges[2 * i + 1]) for i in range(n)]
    return split(white.mean(0), ncol, im.width), split(white.mean(1), nrow, im.height)

INSET = 3  # 境目の白い線が出ないよう、各キャラの四辺を、内側に この画素数だけ余分に切る
def cut(path, ncol, nrow, size, save):
    im = Image.open(path); xs, ys = cells(im, ncol, nrow); n = 0
    for (y0, y1) in ys:
        for (x0, x1) in xs:
            n += 1; save(n, im.crop((x0 + INSET, y0 + INSET, x1 - INSET, y1 - INSET)).resize((size, size), Image.LANCZOS))

os.makedirs(os.path.join(O, 'chars', 'face'), exist_ok=True); os.makedirs(os.path.join(O, 'zunda'), exist_ok=True)
def sc(n, t): t.save(os.path.join(O, 'chars', 'face', '%02d.webp' % n), quality=90); t.transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(O, 'chars', 'face', '%02d_f.webp' % n), quality=90)
def sy(n, t): t.save(os.path.join(O, 'zunda', '%02d.webp' % n), quality=90)
cut(os.path.join(U, 'cpu_filled.jpg'), 8, 4, 176, sc)
cut(os.path.join(U, 'you_filled.jpg'), 4, 4, 256, sy)
print('done')
