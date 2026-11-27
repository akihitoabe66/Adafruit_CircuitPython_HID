#!/usr/bin/env python3
"""地図の右下「名人の2人を倒そう」の枠で使う、顔(家康7・黄門1)と黒いシルエットを、表示する大きさ(38x40)にあらかじめ縮小して img/map/ に作る。
(実機では、大きな絵を 小さく縮めて描くと、ドットがつぶれて 荒れる。 ちょうどの大きさに、きれいに 縮めた絵を 用意して、そのまま 貼る)
縮めかた(E案): 2段階の Lanczos で 縮めて、輪郭(目・まゆ・ひげ)を 強めに くっきり させる。
顔の元の絵は tools/tkface_src/tk01_src.jpg(黄門)・tk07_src.jpg(家康)。 シルエットは、顔と 同じ範囲を 切りとって 縮める(人物の大きさを そろえる)。\n別の絵に 差しかえるときは、REG(位置合わせの値)を 調べなおす 必要が ある。
使い方: python3 tools/make_tkface.py"""
import os
from PIL import Image, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.join(HERE, '..', 'img')
W, H = 38, 40
# 元の顔の絵(img/uk/chars/face/NN.webp, 176x176)が、ご用意の絵(tkface_src)の どこに あたるか(位置合わせで 調べた値。 倍率, 左右のずれ, 上下のずれ)
REG = {'07': (1.80, -33, -13), '01': (1.78, -34, -24)}
TOP = 0.25   # 上下を切るとき、上を 切る割合(のこりは 下: 肩のほうを 多めに 切る)
def crop_box(size):
    w, h = size; th = round(w * H / W)
    if th >= h: return (0, 0, w, h)
    cut = h - th; t = round(cut * TOP); return (0, t, w, t + th)
def shrink(im, dst, box=None):
    im = im.convert('RGB')
    mid = im.resize((W * 2, H * 2), Image.LANCZOS, box=box)
    out = mid.resize((W, H), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.0, percent=150, threshold=2))
    out.save(dst, 'WEBP', quality=95, method=6); print(os.path.basename(dst), out.size, os.path.getsize(dst))
for n in ('01', '07'):
    U = Image.open(os.path.join(HERE, 'tkface_src', 'tk%s_src.jpg' % n)).convert('RGB'); cb = crop_box(U.size)
    shrink(U, os.path.join(R, 'map', 'tkface_%s.webp' % n), cb)
    # シルエットも、顔と 同じ範囲(人物の大きさ・位置が そろう)を 切りとって 縮める
    k, ox, oy = REG[n]; fb = tuple(float(v) for v in ((cb[0] - ox) / k, (cb[1] - oy) / k, (cb[2] - ox) / k, (cb[3] - oy) / k))
    shrink(Image.open(os.path.join(R, 'sil', n + '.webp')), os.path.join(R, 'map', 'tksil_%s.webp' % n), fb)
