# 牌の絵を、実機で使う大きさ(手牌44x58・河26x33・王牌15x20・結果の右上20x27・結果の手牌36x48)にあらかじめ縮小(毎フレームの拡大縮小をなくす。小さい牌は、きれいに縮める)
import os
from PIL import Image, ImageFilter
R = os.path.join(os.path.dirname(__file__), '..', 'img')
for name, sz in (('t44', (44, 58)), ('t26', (26, 33)), ('t15', (15, 20)), ('t20', (20, 27)), ('t36', (36, 48))):
    d = os.path.join(R, name); os.makedirs(d, exist_ok=True)
    for f in os.listdir(os.path.join(R, 'tiles')):
        if f.endswith('.webp'):
            im = Image.open(os.path.join(R, 'tiles', f)).convert('RGBA').resize(sz, Image.LANCZOS)
            small = name in ('t15', 't20', 't36')
            if small: im = im.filter(ImageFilter.UnsharpMask(radius=0.7, percent=70, threshold=2))  # 小さい牌は、模様(竹・筒)がつぶれないよう、少しくっきりさせる
            im.save(os.path.join(d, f), 'WEBP', quality=94 if small else 92, method=6)
