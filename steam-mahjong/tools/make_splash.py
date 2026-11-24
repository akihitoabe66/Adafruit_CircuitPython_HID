#!/usr/bin/env python3
"""電源を入れたとき・終了するときの 全画面の絵(native/pi/splash/*.png)を、img/boot.webp から作る。
  booting.png ... 「ゲーム起動中 お待ちください」(そのまま)   shutting.png ... 「終了の準備中です」   unplug.png ... 「コンセントを抜いてください」
使い方: python3 tools/make_splash.py"""
import os
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
S = 2
src = Image.open(os.path.join(ROOT, 'img/boot.webp')).convert('RGB')
W, H = src.size
big = src.resize((W * S, H * S), Image.LANCZOS)
FONT = next(p for p in ['/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'] if os.path.exists(p))
def blank_line(im):  # 「ゲーム起動中 お待ちください」の文字を、上と下の なにもない緑の地から なめらかに補って消す(ふちは ぼかして なじませる)
    px = im.load(); ya, yb, x0, x1, fe = 232 * S, 294 * S, 140 * S, 692 * S, 24 * S
    for y in range(ya + 2 * S, yb - 2 * S):
        t = (y - ya) / (yb - ya)
        for x in range(x0, x1):
            u = px[x, ya]; v = px[x, yb]; n = tuple(u[i] * (1 - t) + v[i] * t for i in range(3))
            k = min(1.0, (x - x0) / fe, (x1 - x) / fe, (y - ya) / (3 * S), (yb - y) / (3 * S)); o = px[x, y]
            px[x, y] = tuple(int(o[i] * (1 - k) + n[i] * k) for i in range(3))
    return im
def gold_text(im, text, cy, size):
    f = ImageFont.truetype(FONT, size * S); d = ImageDraw.Draw(im); w = d.textlength(text, font=f)
    mask = Image.new('L', im.size, 0); ImageDraw.Draw(mask).text(((im.width - w) / 2, cy * S), text, font=f, fill=255)
    grad = Image.new('RGB', im.size); gd = ImageDraw.Draw(grad)
    for y in range(im.height): t = min(1, max(0, (y - cy * S) / (size * S * 1.3))); gd.line([(0, y), (im.width, y)], fill=(int(246 - 40 * t), int(214 - 52 * t), int(120 - 50 * t)))
    shadow = Image.new('RGB', im.size, (6, 28, 20)); sm = mask.copy().resize((im.width, im.height)); 
    im.paste(shadow, (S, S), mask); im.paste(grad, (0, 0), mask)
    return im
out = os.path.join(ROOT, 'native/pi/splash'); os.makedirs(out, exist_ok=True)
big.save(os.path.join(out, 'booting.png'))
a = blank_line(big.copy()); gold_text(a, '終了の準備中です', 236, 30); gold_text(a, 'そのまま しばらく お待ちください', 288, 22); a.save(os.path.join(out, 'shutting.png'))
b = blank_line(big.copy()); gold_text(b, 'コンセントを抜いてください', 236, 30); gold_text(b, 'もう 電源を切って 大丈夫です', 288, 22); b.save(os.path.join(out, 'unplug.png'))
print('ok', os.listdir(out))
