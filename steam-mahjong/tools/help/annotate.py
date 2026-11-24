#!/usr/bin/env python3
"""遊び方ページ用の絵を作る: ゲームの実際の画面(832x468)に、太い矢印と番号を重ねる。
使い方: python3 tools/help/annotate.py 画面の入ったフォルダ 出力フォルダ   (画面は、gfx.snap で撮ったもの)
撮り方は tools/help/README.txt を見てください。"""
import math, os, sys
from PIL import Image, ImageDraw, ImageFont
FONT = next((p for p in ['/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'] if os.path.exists(p)), None)
RED = (232, 52, 40); WHITE = (255, 255, 255); DARK = (40, 20, 10)

def arrow(d, a, b, w=9, col=RED, head=26):
    ang = math.atan2(b[1] - a[1], b[0] - a[0]); hx, hy = b[0] - head * math.cos(ang), b[1] - head * math.sin(ang)
    for off, c in ((4, WHITE), (0, col)):   # 白いふち → 本体
        d.line([a, (hx, hy)], fill=c, width=w + off * 2)
        p = [b, (hx + (head * 0.62 + off) * math.cos(ang + math.pi / 2), hy + (head * 0.62 + off) * math.sin(ang + math.pi / 2)), (hx + (head * 0.62 + off) * math.cos(ang - math.pi / 2), hy + (head * 0.62 + off) * math.sin(ang - math.pi / 2))]
        d.polygon(p, fill=c)
def badge(d, n, c, r=19):
    x, y = c; d.ellipse((x - r - 3, y - r - 3, x + r + 3, y + r + 3), fill=WHITE); d.ellipse((x - r, y - r, x + r, y + r), fill=RED)
    f = ImageFont.truetype(FONT, 26); d.text((x, y - 1), str(n), font=f, fill=WHITE, anchor='mm')
def box(d, r, col=RED, w=5):
    d.rounded_rectangle((r[0] - 3, r[1] - 3, r[2] + 3, r[3] + 3), 8, outline=WHITE, width=w + 4); d.rounded_rectangle(r, 6, outline=col, width=w)

def make(src, dst, items):
    im = Image.open(src).convert('RGB'); d = ImageDraw.Draw(im)
    for it in items:
        k = it[0]
        if k == 'box': box(d, it[1])
        elif k == 'arrow': arrow(d, it[1], it[2])
        elif k == 'badge': badge(d, it[1], it[2])
        elif k == 'harrow': arrow(d, it[1], it[2], head=24); arrow(d, it[2], it[1], head=24)   # 左右の矢印
        elif k == 'call': a, b = it[2], it[3]; ang = math.atan2(b[1] - a[1], b[0] - a[0]); arrow(d, (a[0] + 24 * math.cos(ang), a[1] + 24 * math.sin(ang)), b, head=22); badge(d, it[1], a)   # 番号の丸から、指す先へ矢印
    im = im.resize((664, 373), Image.LANCZOS); im.save(dst, quality=88)

# ページごとの印(座標は 832x468 の画面の上)
PAGES = {
    # 名前: (画面の名前, [印])   座標は 832x468 の画面の上。 call = (番号, 丸の位置, 指す先)
    'p1': ('discard', [('harrow', (300, 366), (556, 366)), ('badge', 1, (272, 366)), ('box', (561, 380, 609, 448)), ('call', 2, (586, 300), (586, 374))]),
    'p2': ('react', [('box', (196, 330, 322, 374)), ('box', (330, 328, 462, 376)), ('call', 1, (259, 284), (259, 326)), ('call', 2, (396, 284), (396, 324))]),
    'p3': ('riichi', [('box', (183, 330, 353, 378)), ('box', (367, 330, 537, 378)), ('call', 1, (268, 284), (268, 326)), ('call', 2, (452, 284), (452, 326))]),
    'p4': ('teacher', [('box', (724, 340, 828, 388)), ('call', 1, (776, 296), (776, 336)), ('box', (561, 372, 609, 446)), ('call', 2, (640, 330), (604, 368))]),
    'p5': ('hub', [('box', (17, 63, 383, 157)), ('box', (17, 163, 383, 270)), ('box', (17, 278, 383, 369)), ('badge', 1, (34, 78)), ('badge', 2, (34, 178)), ('badge', 3, (34, 292))]),
}
if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
    for name, (scene, items) in PAGES.items():
        p = os.path.join(src, scene + '.png')
        if os.path.exists(p): make(p, os.path.join(out, name + '.webp'), items)
