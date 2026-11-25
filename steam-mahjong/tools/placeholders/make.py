#!/usr/bin/env python3
"""テストプレイ用の「仮の画像」を作る(本物の絵ができるまでの、つなぎ)。 steam-mahjong/ で実行: python3 tools/placeholders/make.py
作るもの: img/wall.webp(牌の裏) / img/you/01〜18.webp(あなたの顔) / img/teacher/t11〜t36.webp(先生の顔) /
          タイトル・ロゴ・ボタン・背景など(img/*.webp)。
すでにあるファイルは上書きしない(本物の絵を入れたら、そちらが使われる)。 -f で、すべて作り直す。"""
import os, sys
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); IMG = os.path.join(ROOT, 'img')
FORCE = '-f' in sys.argv
FONT = next((p for p in ['/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf', '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf'] if os.path.exists(p)), None)
def font(sz): return ImageFont.truetype(FONT, sz) if FONT else ImageFont.load_default()
def save(im, rel):
    p = os.path.join(IMG, rel)
    if os.path.exists(p) and not FORCE: return 0
    os.makedirs(os.path.dirname(p), exist_ok=True); im.convert('RGBA').save(p, 'WEBP', quality=85); return 1
def text_c(d, xy, s, sz, fill):
    f = font(sz); b = d.textbbox((0, 0), s, font=f); d.text((xy[0] - (b[2] - b[0]) / 2 - b[0], xy[1] - (b[3] - b[1]) / 2 - b[1]), s, font=f, fill=fill)
n = 0
# 牌の裏(ドラ表示の裏・伏せ牌)
im = Image.new('RGBA', (104, 138), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
d.rounded_rectangle((2, 2, 101, 135), 12, fill=(47, 77, 156), outline=(28, 47, 107), width=4); d.rounded_rectangle((12, 12, 91, 125), 8, outline=(120, 150, 230), width=3); n += save(im, 'wall.webp')
# あなたの顔(18枚。色ちがい)・先生の顔(18枚)
for i in range(18):
    h = (i * 20) % 360; col = Image.new('HSV', (1, 1), (int(h / 360 * 255), 120, 200)).convert('RGB').getpixel((0, 0))
    im = Image.new('RGB', (256, 256), col); d = ImageDraw.Draw(im); d.ellipse((78, 40, 178, 140), fill=(250, 235, 215)); d.pieslice((28, 150, 228, 330), 180, 360, fill=(250, 235, 215))
    text_c(d, (128, 226), 'あなた(仮)', 26, (40, 30, 20)); n += save(im, 'you/%02d.webp' % (i + 1))
for a in (1, 2, 3):
    for b in range(1, 7):
        col = {1: (70, 150, 90), 2: (70, 120, 190), 3: (190, 120, 60)}[a]
        im = Image.new('RGB', (240, 240), col); d = ImageDraw.Draw(im); d.ellipse((70, 36, 170, 136), fill=(250, 235, 215)); d.pieslice((30, 140, 210, 320), 180, 360, fill=(255, 255, 255))
        text_c(d, (120, 216), '先生(仮)%d%d' % (a, b), 24, (255, 255, 255)); n += save(im, 'teacher/t%d%d.webp' % (a, b))
# タイトル・メニュー・ボタンなど
def bg(name, label, size=(1920, 1080)):
    im = Image.new('RGB', size, (20, 90, 60)); d = ImageDraw.Draw(im)
    for y in range(size[1]): d.line((0, y, size[0], y), fill=(int(20 + 30 * y / size[1]), int(90 + 40 * y / size[1]), int(60 + 20 * y / size[1])))
    text_c(d, (size[0] - 360, size[1] - 50), label, 34, (200, 230, 210)); return save(im, name)  # 文字は、ボタンと重ならない右下の隅に小さく
def btn(name, label, size=(520, 150), col=(240, 180, 40)):
    im = Image.new('RGBA', size, (0, 0, 0, 0)); d = ImageDraw.Draw(im); d.rounded_rectangle((3, 3, size[0] - 4, size[1] - 4), 36, fill=col, outline=(255, 255, 255), width=6); text_c(d, (size[0] // 2, size[1] // 2), label, 60, (40, 25, 5)); return save(im, name)
n += bg('title_art.webp', '(タイトルの絵・仮)'); n += bg('menu_bg.webp', '(メニューの背景・仮)'); n += bg('rank_bg.webp', '(段位の背景・仮)')
n += btn('btn_start.webp', 'はじめる'); n += btn('btn_exit.webp', 'ゲーム終了', col=(200, 200, 200)); n += btn('bgm_on.webp', 'BGM ON', (260, 90), (120, 200, 140)); n += btn('bgm_off.webp', 'BGM OFF', (260, 90), (180, 180, 180))
im = Image.new('RGBA', (900, 300), (0, 0, 0, 0)); d = ImageDraw.Draw(im); text_c(d, (450, 150), '(ロゴ・仮)', 110, (255, 255, 255)); n += save(im, 'logo.webp')
n += bg('cert.webp', '(認定証・仮)', (1280, 900)); im = Image.new('RGBA', (300, 300), (0, 0, 0, 0)); d = ImageDraw.Draw(im); d.ellipse((10, 10, 290, 290), outline=(200, 30, 30), width=12); text_c(d, (150, 150), '認', 120, (200, 30, 30)); n += save(im, 'cert_stamp.webp')
# 点棒(リーチ棒など)。 100/1000/5000/10000 と、卓の中央に置く向き違い(c0 / c90 / c180)
def stick(name, label, col, vertical=False):
    w, h = (240, 36) if not vertical else (36, 240); im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((1, 1, w - 2, h - 2), 8, fill=(250, 250, 245), outline=(120, 120, 110), width=3)
    r = 9
    for cx, cy in ([(w // 2, h // 2)] if label == '1000' else [(w // 2 - 40, h // 2), (w // 2 + 40, h // 2)] if not vertical else [(w // 2, h // 2 - 40), (w // 2, h // 2 + 40)]):
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=col)
    return save(im, name)
n += stick('tenbo_100.webp', '100', (40, 40, 40)); n += stick('tenbo_1000.webp', '1000', (200, 30, 30)); n += stick('tenbo_5000.webp', '5000', (200, 130, 20)); n += stick('tenbo_10000.webp', '10000', (30, 90, 200))
n += stick('tenbo_c0.webp', '1000', (200, 30, 30)); n += stick('tenbo_c180.webp', '1000', (200, 30, 30)); n += stick('tenbo_c90.webp', '1000', (200, 30, 30), True)
print('作った仮の画像:', n, '枚')
