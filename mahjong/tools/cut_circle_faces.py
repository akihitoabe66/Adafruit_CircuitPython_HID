#!/usr/bin/env python3
"""金枠の丸い顔の一覧(横8×縦4、32人)から、ゲームで使う画像を切り出す。
使い方: python3 tools/cut_circle_faces.py 一覧.jpg      (Pillow が必要)
 - img/chars/face/NN.webp(顔・丸く抜いた透明つき 176x176)、NN_f.webp(左右反転)
 - img/chars/NN.webp(立ち絵の枠 220x240 の中央に、丸い顔を置く)
 一覧の背景(ベージュ)との色の違いで、各セルの丸い枠の位置を見つける。"""
import sys, os
from PIL import Image, ImageDraw, ImageChops
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

def find_circle(im, box):
    cell = im.crop(box).convert('RGB')
    bg = cell.getpixel((2, 2))
    diff = ImageChops.difference(cell, Image.new('RGB', cell.size, bg)).convert('L').point(lambda v: 255 if v > 38 else 0)
    bb = diff.getbbox()
    x0, y0, x1, y1 = bb
    s = max(x1 - x0, y1 - y0); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return (box[0] + int(cx - s / 2), box[1] + int(cy - s / 2), box[0] + int(cx + s / 2), box[1] + int(cy + s / 2))

def main(path):
    im = Image.open(path).convert('RGB'); W, H = im.size
    cw, ch = W / 8, H / 4
    D = os.path.join(ROOT, 'img', 'chars'); os.makedirs(os.path.join(D, 'face'), exist_ok=True)
    n = 0
    for r in range(4):
        for c in range(8):
            n += 1
            box = (int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch))
            sq = find_circle(im, box)
            face = im.crop(sq).resize((176, 176), Image.LANCZOS).convert('RGBA')
            m = Image.new('L', (176 * 4, 176 * 4), 0); ImageDraw.Draw(m).ellipse((0, 0, 176 * 4 - 1, 176 * 4 - 1), fill=255)
            face.putalpha(m.resize((176, 176), Image.LANCZOS))
            nn = '%02d' % n
            face.save(os.path.join(D, 'face', nn + '.webp'), quality=88, method=6)
            face.transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(D, 'face', nn + '_f.webp'), quality=88, method=6)
            st = Image.new('RGBA', (220, 240), (0, 0, 0, 0)); big = face.resize((208, 208), Image.LANCZOS); st.paste(big, (6, 16), big)
            st.save(os.path.join(D, nn + '.webp'), quality=88, method=6)
    print('done', n)

if __name__ == '__main__': main(sys.argv[1])
