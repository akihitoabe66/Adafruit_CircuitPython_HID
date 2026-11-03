"""雀鬼モード(赤)・覚醒(金)用の顔画像を作る。顔の画像(img/chars/face/NN.webp, NN_f.webp)の、緑の背景だけを、赤・金に置き換える。
ファイルを128個も増やさないよう、js/oni_faces.js(data URI)1つにまとめる。使い方: python3 tools/gen_oni_faces.py   (Pillow と numpy が必要)"""
import base64, io, json
import os, glob, collections
import numpy as np
from PIL import Image

D = os.path.join(os.path.dirname(__file__), '..', 'img', 'chars', 'face')
COL = {'r': (0.85, 0.07, 0.10), 'g': (0.98, 0.72, 0.10)}

def bg_mask(a):
    h, w, _ = a.shape
    mx = a.max(2); mn = a.min(2); d = mx - mn + 1e-9
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    sat = d / (mx + 1e-9)
    green = (hue > 75) & (hue < 175) & (sat > 0.30) & (mx > 0.25)
    seen = np.zeros((h, w), bool); q = collections.deque()
    for (x, y) in [(10, 10), (w - 11, 10), (10, h - 11), (w - 11, h - 11), (w // 2, 8), (8, h // 2), (w - 9, h // 2)]:
        if green[y, x] and not seen[y, x]:
            seen[y, x] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and green[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True; q.append((nx, ny))
    return seen, mx

def recolor(im, key):
    a = np.asarray(im.convert('RGB')).astype(float) / 255
    seen, mx = bg_mask(a)
    out = a.copy()
    ref = mx[seen].mean() if seen.any() else 1
    lum = np.clip(mx / ref, 0.6, 1.25)  # 背景の陰影は、残す
    for c in range(3):
        out[..., c] = np.where(seen, np.clip(COL[key][c] * lum, 0, 1), a[..., c])
    return Image.fromarray((out * 255).astype('uint8'))

out = {}
for p in sorted(glob.glob(os.path.join(D, '*.webp'))):
    n = os.path.basename(p)[:-5]
    im = Image.open(p)
    for key in ('r', 'g'):
        buf = io.BytesIO()
        recolor(im, key).save(buf, 'WEBP', quality=86, method=6)
        out[n + '_' + key] = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()
dst = os.path.join(os.path.dirname(__file__), '..', 'js', 'oni_faces.js')
with open(dst, 'w') as f:
    f.write('/* 雀鬼モード(赤)・覚醒(金)の顔画像(tools/gen_oni_faces.py で作る) */\n(window.MJ = window.MJ || {}).OniFaces = ' + json.dumps(out) + ';\n')
print('done', len(out), os.path.getsize(dst) // 1024, 'KB')
