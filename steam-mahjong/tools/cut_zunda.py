#!/usr/bin/env python3
"""あなた(ずんだもん)の表情 4×4 の絵(背景なし・tools/zunda_sheet3.webp)を、16枚に切って、背景のグラデーションを重ねて
img/zunda/01〜16.webp にする。 木の枠(tools/zunda_frame.png)を重ねて、CPUの顔と同じ見た目にする。 使い方: python3 tools/cut_zunda.py [--top R,G,B] [--bottom R,G,B]   (Pillow と numpy が必要)
いまの背景は「おひさま」(上: 黄色 → 下: 白に近いクリーム色)。 別の色にするときは --top / --bottom で。
番号(左上から右へ・下へ): 1 にっこり 2 大喜び 3 考え中 4 やる気 5 牌を見せる 6 びっくり 7 余裕 8 くすくす
                           9 集中 10 ほっ 11 むすっ 12 ? 13 WIN 14 負け 15 ドキドキ 16 ドヤ"""
import argparse, os
import numpy as np
from PIL import Image, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..')
XS = [(22, 258), (282, 518), (542, 778), (802, 1038)]   # 赤い枠の内側(左右)
YS = [(28, 264), (288, 524), (548, 784), (810, 1047)]   # 赤い枠の内側(上下)


def clean(c):
    """白っぽい縁を消す: 透明に近い縁の色を、すぐ内側の色にぬりかえ、縁を1ピクセル食い込ませて なめらかにする"""
    a = np.array(c).astype(float); al = a[:, :, 3] / 255.0; solid = (al > 0.97).astype(float)
    blur = lambda arr, r: np.array(Image.fromarray((arr * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(r))).astype(float) / 255.0
    num = np.stack([blur(a[:, :, i] / 255.0 * solid, 2.2) for i in range(3)], axis=2); den = blur(solid, 2.2)[:, :, None]
    bleed = np.where(den > 0.04, num / np.maximum(den, 1e-3), a[:, :, :3] / 255.0)
    rgb = np.where((al < 0.97)[:, :, None], bleed, a[:, :, :3] / 255.0)
    m = Image.fromarray((al * 255).astype('uint8')).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    out = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype('uint8'), 'RGB').convert('RGBA'); out.putalpha(m); return out


def grad(top, bot, size=256):
    t = np.array(top, float); b = np.array(bot, float); ys = np.linspace(0, 1, size)[:, None]
    return Image.fromarray(np.repeat((t + (b - t) * ys)[:, None, :], size, axis=1).astype('uint8'), 'RGB')


def main():
    ap = argparse.ArgumentParser(); rgb = lambda s: tuple(int(x) for x in s.split(','))
    ap.add_argument('--top', type=rgb, default=(255, 222, 110)); ap.add_argument('--bottom', type=rgb, default=(255, 250, 224)); a = ap.parse_args()
    sheet = Image.open(os.path.join(HERE, 'zunda_sheet3.webp')).convert('RGBA'); bg = grad(a.top, a.bottom)
    fr = Image.open(os.path.join(HERE, 'zunda_frame.png')).convert('RGBA').convert('RGBa').resize((256, 256), Image.LANCZOS).convert('RGBA')   # 木の枠(まん中が あいている)
    HOLE = 225  # 枠の穴(いちばん内側)よりも少し大きく絵を入れて、枠の下にもぐらせる
    out = os.path.join(ROOT, 'img', 'zunda'); os.makedirs(out, exist_ok=True)
    for j, (y0, y1) in enumerate(YS):
        for i, (x0, x1) in enumerate(XS):
            c = sheet.crop((x0, y0, x1, y1)); s = min(c.size); ox, oy = (c.size[0] - s) // 2, (c.size[1] - s) // 2
            c = clean(c.crop((ox, oy, ox + s, oy + s)).resize((HOLE, HOLE), Image.LANCZOS))
            im = bg.copy().convert('RGBA'); im.alpha_composite(c, ((256 - HOLE) // 2, (256 - HOLE) // 2)); im.alpha_composite(fr)
            im.convert('RGB').save(os.path.join(out, '%02d.webp' % (j * 4 + i + 1)), 'WEBP', quality=88, method=6)
    print('16枚 →', os.path.relpath(out, ROOT))


if __name__ == '__main__':
    main()
