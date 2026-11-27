#!/usr/bin/env python3
"""地図の右下「名人の2人を倒そう」の枠で使う、顔(家康7・黄門1)と黒いシルエットを、表示する大きさ(38x40)にあらかじめ縮小して img/map/ に作る。
(実機では、大きな絵を 小さく縮めて描くと、ドットがつぶれて 荒れる。 ちょうどの大きさに、きれいに 縮めた絵を 用意して、そのまま 貼る)
使い方: python3 tools/make_tkface.py"""
import os
from PIL import Image, ImageFilter
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'img')
W, H = 38, 40
def shrink(src, dst):
    im = Image.open(src).convert('RGBA')
    # 2段階で縮める(いきなり 小さくするより なめらか)。 最後に ほんの少し くっきり
    mid = im.resize((W * 2, H * 2), Image.LANCZOS)
    out = mid.resize((W, H), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=0.8, percent=60, threshold=2))
    out.save(dst, 'WEBP', quality=95, method=6)
    print(dst, out.size, os.path.getsize(dst))
for n in ('01', '07'):
    shrink(os.path.join(R, 'uk', 'chars', 'face', n + '.webp'), os.path.join(R, 'map', 'tkface_%s.webp' % n))
    shrink(os.path.join(R, 'sil', n + '.webp'), os.path.join(R, 'map', 'tksil_%s.webp' % n))
