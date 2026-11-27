#!/usr/bin/env python3
"""地図の右下「名人の2人を倒そう」の枠で使う、顔(家康7・黄門1)と黒いシルエットを、表示する大きさ(38x40)にあらかじめ縮小して img/map/ に作る。
(実機では、大きな絵を 小さく縮めて描くと、ドットがつぶれて 荒れる。 ちょうどの大きさに、きれいに 縮めた絵を 用意して、そのまま 貼る)
縮めかた(E案): 2段階の Lanczos で 縮めて、輪郭(目・まゆ・ひげ)を 強めに くっきり させる。
顔の元の絵は tools/tkface_src/tk01_src.jpg(黄門)・tk07_src.jpg(家康)。 差しかえるときは、同じ名前で 置いて この道具を 実行する。
使い方: python3 tools/make_tkface.py"""
import os
from PIL import Image, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.join(HERE, '..', 'img')
W, H = 38, 40
def fit_crop(im, top=0.25):
    """38:40 の 縦横比に、上下を 少し 切って そろえる(顔が ゆがまない。 切るのは 肩のほうを 多めに)"""
    w, h = im.size; th = round(w * H / W)
    if th >= h: return im.resize((W * 2, H * 2), Image.LANCZOS) if False else im
    cut = h - th; t = round(cut * top); return im.crop((0, t, w, t + th))
def shrink(im, dst):
    im = im.convert('RGB')
    mid = im.resize((W * 2, H * 2), Image.LANCZOS)
    out = mid.resize((W, H), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.0, percent=150, threshold=2))
    out.save(dst, 'WEBP', quality=95, method=6); print(os.path.basename(dst), out.size, os.path.getsize(dst))
for n in ('01', '07'):
    shrink(fit_crop(Image.open(os.path.join(HERE, 'tkface_src', 'tk%s_src.jpg' % n))), os.path.join(R, 'map', 'tkface_%s.webp' % n))
    shrink(Image.open(os.path.join(R, 'sil', n + '.webp')), os.path.join(R, 'map', 'tksil_%s.webp' % n))   # シルエットは、元が 正方形: そのまま 縮める
