#!/usr/bin/env python3
"""OLED用の ずんだもん(黒髪の16表情ドット絵 tools/ui_src/zunda_pixel16.jpg)から、使う14表情を取り出して native/pi/oled_zunda.py に書く。
 ドット1つ ≒ 7.1画素の絵を、1ドットずつ読み取る(32x29前後)。 黒=1。 白髪の2枚(おこ・目がまわる)は使わない。 使い方: python3 tools/make_oled_zunda.py"""
import os
from PIL import Image
import numpy as np
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(R, 'tools/ui_src/zunda_pixel16.jpg')
XS = [28, 268, 512, 755, 995]; YS = [28, 253, 464, 676, 890]; U = 7.1
NM = ['smile', 'laugh', 'serious', 'angry', 'worry', 'shock', 'tongue', 'content', 'heart', 'star', 'surprise', 'sweat', None, None, 'thumbs', 'peace']
a = np.array(Image.open(SRC).convert('L')).astype(float)
def phase(vals):
    best = (0, -1)
    for p in np.arange(0, U, 0.25):
        sc = sum(1 for t in vals if min((t - p) % U, U - (t - p) % U) < 0.9)
        if sc > best[1]: best = (p, sc)
    return best[0]
def native(r, c):
    x0 = XS[c] + 4; x1 = XS[c + 1] - 4; y0 = YS[r] + 4; y1 = YS[r + 1] - 4
    blk = a[y0:y1, x0:x1] < 128; tx = []; ty = []
    for y in range(0, blk.shape[0], 2): tx += list(np.where(np.diff(blk[y].astype(int)) != 0)[0] + 1)
    for x in range(0, blk.shape[1], 2): ty += list(np.where(np.diff(blk[:, x].astype(int)) != 0)[0] + 1)
    px = phase(tx); py = phase(ty); nx = int((blk.shape[1] - px) // U); ny = int((blk.shape[0] - py) // U)
    out = np.zeros((ny, nx), dtype=np.uint8)
    for j in range(ny):
        for i in range(nx): out[j, i] = 1 if blk[int(py + (j + 0.5) * U), int(px + (i + 0.5) * U)] else 0
    return out
lines = ['# make_oled_zunda.py が作る(手で直さない)。 ずんだもんの表情。 黒=1 の、横32ドット × 縦28〜29行。 1行 = 32ビットの整数(左が上位ビット)\nW = 32\nZ = {']
for k, nm in enumerate(NM):
    if not nm: continue
    n = native(k // 4, k % 4)
    if k in (14, 15): n[19:24, 11:19] = 0; n[20, 13] = 1; n[20, 17] = 1; n[21, 14:17] = 1   # いいね・ピース: とぎれた口を、にっこりと同じ間隔・大きさで描き直す
    rows = []
    for r in n:
        v = 0
        for x in range(32): v = (v << 1) | (int(r[x]) if x < len(r) else 0)
        rows.append(v)
    lines.append('    %r: (%s),' % (nm, ', '.join('0x%08x' % v for v in rows)))
lines.append('}')
open(os.path.join(R, 'native/pi/oled_zunda.py'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print('wrote native/pi/oled_zunda.py', len(NM) - 2, 'faces')
