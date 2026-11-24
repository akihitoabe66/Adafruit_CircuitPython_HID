# 白いサイコロの素材(img)に、目を入れて 1〜6 の絵を作る。 使い方: python3 tools/make_dice.py <素材.jpg> <出力フォルダ> [大きさ=96]
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
src, out = sys.argv[1], sys.argv[2]; SZ = int(sys.argv[3]) if len(sys.argv) > 3 else 96
os.makedirs(out, exist_ok=True)
im = Image.open(src).convert('RGB'); a = np.array(im).astype(float)
lum = a.min(axis=2)
alpha = np.clip((lum - 165) / 35, 0, 1)
# 切り抜き: 白い塊だけ(背景のグレーと、足もとの影を落とす)
base = Image.fromarray(np.dstack([a, alpha * 255]).astype(np.uint8), 'RGBA').crop((430, 95, 972, 668))
W, H = base.size  # 542 x 573
ox, oy = 430, 95
# 面の四角(素材の座標): 上・左・右
FACES = {
  'top':   [(700, 112), (958, 214), (700, 312), (447, 214)],
  'left':  [(447, 226), (697, 326), (697, 652), (452, 546)],
  'right': [(703, 326), (957, 226), (952, 546), (703, 652)],
}
PIPS = {1: [(.5, .5)], 2: [(.28, .28), (.72, .72)], 3: [(.26, .26), (.5, .5), (.74, .74)], 4: [(.28, .28), (.72, .28), (.28, .72), (.72, .72)],
        5: [(.27, .27), (.73, .27), (.5, .5), (.27, .73), (.73, .73)], 6: [(.3, .26), (.7, .26), (.3, .5), (.7, .5), (.3, .74), (.7, .74)]}
TRIPLE = {1: (1, 2, 3), 2: (2, 3, 1), 3: (3, 1, 2), 4: (4, 6, 5), 5: (5, 4, 6), 6: (6, 5, 4)}  # 上・左・右
def face_layer(n, quad):
    S = 600; big = Image.new('L', (S * 2, S * 2), 0); d = ImageDraw.Draw(big)
    r = (0.12 if n == 1 else 0.085) * S * 2
    for (u, v) in PIPS[n]:
        cx, cy = u * S * 2, v * S * 2; d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    m = big.resize((S, S), Image.LANCZOS)
    # 単位正方形 (0,0)(S,0)(S,S)(0,S) -> quad: アフィン(平行四辺形で近似)
    (x0, y0), (x1, y1), (_, _), (x3, y3) = [(p[0] - ox, p[1] - oy) for p in quad]
    A = np.array([[x1 - x0, x3 - x0, x0], [y1 - y0, y3 - y0, y0], [0, 0, 1]], float) @ np.diag([1 / S, 1 / S, 1])
    Ai = np.linalg.inv(A)
    return m.transform((W, H), Image.AFFINE, (Ai[0, 0], Ai[0, 1], Ai[0, 2], Ai[1, 0], Ai[1, 1], Ai[1, 2]), Image.BICUBIC)
def render(top):
    t, l, r = TRIPLE[top]; img = base.copy(); arr = np.array(img).astype(float); lm = (np.array(base.convert('RGB')).astype(float).mean(axis=2) / 255.0)
    for n, nm in ((t, 'top'), (l, 'left'), (r, 'right')):
        m = np.array(face_layer(n, FACES[nm])).astype(float) / 255.0
        col = np.array([205, 30, 40] if n == 1 else [28, 28, 32], float)
        shade = np.clip(lm * 1.05, 0.55, 1.0)[..., None]
        c = col * shade
        m3 = m[..., None] * 0.96
        arr[..., :3] = arr[..., :3] * (1 - m3) + c * m3
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')
for n in range(1, 7):
    full = render(n)
    full = full.crop(full.getbbox())
    # 正方形の中に収めて縮小
    s = max(full.size); canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0)); canvas.paste(full, ((s - full.size[0]) // 2, (s - full.size[1]) // 2))
    canvas.resize((SZ, SZ), Image.LANCZOS).save(os.path.join(out, f'd{n}.png'))
print('ok')
