#!/usr/bin/env python3
# 「Congratulations!」の金色の文字の絵(img/map/congrats.webp)。 使い方: python3 tools/make_congrats.py
import os
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
fp = next(c for c in ['/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf', '/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf'] if os.path.exists(c))
F = ImageFont.truetype(fp, 170); txt = 'Congratulations!'
im = Image.new('RGBA', (1700, 300), (0, 0, 0, 0)); d = ImageDraw.Draw(im); bb = d.textbbox((0, 0), txt, font=F); w, h = bb[2] - bb[0], bb[3] - bb[1]; x, y = (1700 - w) // 2 - bb[0], (300 - h) // 2 - bb[1]
for dx in range(-8, 9):
    for dy in range(-8, 9):
        if dx * dx + dy * dy <= 64: d.text((x + dx, y + dy), txt, font=F, fill=(90, 20, 10, 255))
mask = Image.new('L', im.size, 0); ImageDraw.Draw(mask).text((x, y), txt, font=F, fill=255)
grad = Image.new('RGBA', im.size); gp = grad.load()
for yy in range(im.size[1]):
    t = min(1, max(0, (yy - y) / max(1, h))); c = (255, int(238 - 80 * t), int(130 - 100 * t), 255)
    for xx in range(im.size[0]): gp[xx, yy] = c
im.paste(grad, (0, 0), mask); im = im.crop(im.getbbox()); im.save(os.path.join(ROOT, 'img', 'map', 'congrats.webp'), 'WEBP', quality=92, method=6); print(im.size)
