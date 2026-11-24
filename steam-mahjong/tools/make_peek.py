#!/usr/bin/env python3
"""対戦相手を見る画面の「次の列」用の絵(左半分はくっきり、右半分はグラデーションで透明になる)を作る。
   顔(img/uk/chars/face/NN.webp)→ img/peek/fNN.webp / シルエット(img/sil/NN.webp)→ img/peek/sNN.webp  顔の絵を変えたら、もう一度 実行する。"""
import os
from PIL import Image
import numpy as np
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
def fade(im, size=84, solid=0.5):
    im = im.convert('RGBA').resize((size, size), Image.LANCZOS)
    a = np.ones((size, size), np.float32)
    for x in range(size):
        u = x / (size - 1)
        a[:, x] = 1.0 if u <= solid else max(0.0, 1 - (u - solid) / (1 - solid))
    arr = np.asarray(im).copy(); arr[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(arr)
for n in range(1, 33):
    for pre, src in (('f', 'img/uk/chars/face/%02d.webp' % n), ('s', 'img/sil/%02d.webp' % n)):
        p = os.path.join(ROOT, src)
        if os.path.exists(p): fade(Image.open(p)).save(os.path.join(ROOT, 'img/peek/%s%02d.webp' % (pre, n)), quality=90)
print('ok')
