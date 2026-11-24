#!/usr/bin/env python3
"""キャラクター一覧の画像(32人・横8×縦4)から、立ち絵・顔・雀鬼(赤)・覚醒(金)の画像を切り出す。
使い方: python3 tools/cut_char_sheets.py 通常.jpg 赤.jpg 金.jpg   (Pillow と numpy が必要)
 - 通常の一覧で、枠の内側の位置を決める。赤・金の一覧は、そこからのずれ(拡大のわずかな違い)を、絵の輪郭から測って合わせる。
 - 枠の角の丸みの外側は、切り出さない(茶色の枠で塗る)ので、切り口に、元の枠が残らない。"""
import sys, os, io, json, base64
import numpy as np
from PIL import Image, ImageDraw

GX = [(11, 164), (180, 332), (348, 501), (519, 670), (687, 839), (856, 1009), (1027, 1177), (1195, 1334)]  # 通常の一覧: 枠の内側(左右)
GY = [(4, 160), (197, 360), (395, 557), (593, 753)]                                                      # 枠の内側(上下)。1段目の上は画像のふちで切れている
import collections
ROOT = os.path.join(os.path.dirname(__file__), '..')
COL = {'r': (0.85, 0.07, 0.10), 'g': (0.98, 0.72, 0.10)}

def bg_mask(a):
    h, w, _ = a.shape
    mx = a.max(2); mn = a.min(2); d = mx - mn + 1e-9
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    sat = d / (mx + 1e-9)
    green = (hue > 70) & (hue < 180) & (sat > 0.18) & (mx > 0.10)
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
    # 輪郭の緑のにじみも、背景として塗る(緑っぽいところだけ、2ピクセルぶん広げる)
    soft = (hue > 60) & (hue < 190) & (sat > 0.12) & (mx > 0.08)
    for _ in range(2):
        grow = np.zeros_like(seen)
        grow[1:, :] |= seen[:-1, :]; grow[:-1, :] |= seen[1:, :]; grow[:, 1:] |= seen[:, :-1]; grow[:, :-1] |= seen[:, 1:]
        seen = seen | (grow & soft)
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



def gray(im): return np.asarray(im.convert('L')).astype(float)
def grad(a): return np.abs(np.diff(a, axis=1))[:-1, :] + np.abs(np.diff(a, axis=0))[:, :-1]

def shifts(base, other, R=22):
    A, B = grad(gray(base)), grad(gray(other)); res = []
    for r in range(4):
        for c in range(8):
            x0, x1 = GX[c]; y0, y1 = GY[r]; cx0, cx1, cy0, cy1 = x0 + 22, x1 - 22, max(y0, 0) + 22, y1 - 22
            ref = A[cy0:cy1, cx0:cx1]; best = None
            for dy in range(-R, R + 1):
                for dx in range(-R, R + 1):
                    if cy0 + dy < 0 or cx0 + dx < 0: continue
                    t = B[cy0 + dy:cy1 + dy, cx0 + dx:cx1 + dx]
                    if t.shape != ref.shape: continue
                    s = np.abs(ref - t).mean()
                    if best is None or s < best[0]: best = (s, dx, dy)
            res.append((best[1], best[2]))
    return res

def rounded_fill(im, rad):
    """角の丸みの外側を、角の内側の色で埋める"""
    w, h = im.size; a = np.asarray(im.convert('RGB')).copy()
    m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], rad, fill=255); m = np.asarray(m) > 0
    for (sx, sy, px, py) in [(0, 0, rad, rad), (w - rad, 0, w - rad - 1, rad), (0, h - rad, rad, h - rad - 1), (w - rad, h - rad, w - rad - 1, h - rad - 1)]:
        col = a[py, px]; sub = a[sy:sy + rad, sx:sx + rad]; mk = m[sy:sy + rad, sx:sx + rad]; sub[~mk] = col
    return Image.fromarray(a)

def framed(face):
    s = face.size[0]; m = Image.new('L', (s, s), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, s - 1, s - 1], 9, fill=255)
    out = Image.new('RGB', (s, s), (90, 58, 30)); out.paste(face, (0, 0), m)
    d = ImageDraw.Draw(out)
    for i in range(4): d.rounded_rectangle([i, i, s - 1 - i, s - 1 - i], max(1, 9 - i), outline=(90, 58, 30))
    d.rounded_rectangle([4, 4, s - 5, s - 5], 5, outline=(173, 170, 119))
    return out

def cell(sheet, sh, i, kind):
    r, c = divmod(i, 8); x0, x1 = GX[c]; y0, y1 = GY[r]; dx, dy = sh
    x0 += dx; x1 += dx; y0 += dy; y1 += dy
    w = x1 - x0 + 1; top = max(0, y0)
    if kind == 'face':
        s = min(w, y1 - top + 1); l = x0 + (w - s) // 2
        return framed(sheet.crop((l, top, l + s, top + s)).resize((176, 176), Image.LANCZOS))
    cw = int((y1 - top + 1) * 220 / 240); l = x0 + max(0, (w - cw) // 2)
    c = sheet.crop((l, top, l + min(cw, w), y1 + 1)); return rounded_fill(c, 7).resize((220, 240), Image.LANCZOS)

def main(n_path, r_path, g_path):
    sn, sr, sg = (Image.open(p).convert('RGB') for p in (n_path, r_path, g_path))
    sh = {'n': [(0, 0)] * 32, 'r': shifts(sn, sr), 'g': shifts(sn, sg)}
    D = os.path.join(ROOT, 'img', 'chars'); os.makedirs(os.path.join(D, 'face'), exist_ok=True)
    oni = {}
    for i in range(32):
        k = '%02d' % (i + 1)
        cell(sn, sh['n'][i], i, 'full').save(os.path.join(D, k + '.webp'), quality=88, method=6)
        f = cell(sn, sh['n'][i], i, 'face'); f.save(os.path.join(D, 'face', k + '.webp'), quality=90, method=6)
        f.transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(D, 'face', k + '_f.webp'), quality=90, method=6)
        for key in ('r', 'g'):
            sheet = {'r': sr, 'g': sg}[key]; r_, c_ = divmod(i, 8)
            if GX[c_][1] + sh[key][i][0] > sheet.size[0] - 3: fo = recolor(f, key)  # 一覧の右はしで絵が切れている所は、通常の顔の背景色を変えて作る
            else: fo = cell(sheet, sh[key][i], i, 'face')
            for suffix, im in (('', fo), ('_f', fo.transpose(Image.FLIP_LEFT_RIGHT))):
                b = io.BytesIO(); im.save(b, 'WEBP', quality=86, method=6)
                oni[k + suffix + '_' + key] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
    with open(os.path.join(ROOT, 'js', 'oni_faces.js'), 'w') as f:
        f.write('/* 雀鬼モード(赤)・覚醒(金)の顔画像(tools/cut_char_sheets.py で作る) */\n(window.MJ = window.MJ || {}).OniFaces = ' + json.dumps(oni) + ';\n')
    print('done', len(oni))

if __name__ == '__main__':
    main(*sys.argv[1:4])
