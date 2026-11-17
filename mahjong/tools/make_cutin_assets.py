#!/usr/bin/env python3
"""決めゼリフのカットインの背景(放射状の線)を作る: img/cutin_ron.webp(オレンジ)・img/cutin_tsumo.webp(水色)。 832x468、透明つき。
使い方: python3 tools/make_cutin_assets.py"""
import math, os
from PIL import Image, ImageDraw, ImageFilter
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
W, H, SS = 832, 468, 2
def rays(color, name):
    im = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(im); cx, cy, R = W * SS / 2, H * SS / 2, 1400 * SS
    n = 26
    for i in range(n):
        a0 = math.radians(i * 360 / n); a1 = a0 + math.radians(360 / n * 0.16)
        d.polygon([(cx, cy), (cx + R * math.cos(a0), cy + R * math.sin(a0)), (cx + R * math.cos(a1), cy + R * math.sin(a1))], fill=color + (150,))
    im = im.resize((W, H), Image.LANCZOS)
    im.save(os.path.join(ROOT, 'img', name), 'WEBP', quality=90, method=6, exact=True)
rays((255, 150, 70), 'cutin_ron.webp'); rays((120, 224, 255), 'cutin_tsumo.webp'); print('ok')
