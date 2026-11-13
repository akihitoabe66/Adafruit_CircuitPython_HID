# 牌の絵を、実機で使う大きさ(手牌44x58・河26x33)にあらかじめ縮小(毎フレームの拡大縮小をなくす)
import os
from PIL import Image
R = os.path.join(os.path.dirname(__file__), '..', 'img')
for name, sz in (('t44', (44, 58)), ('t26', (26, 33))):
    d = os.path.join(R, name); os.makedirs(d, exist_ok=True)
    for f in os.listdir(os.path.join(R, 'tiles')):
        if f.endswith('.webp'):
            Image.open(os.path.join(R, 'tiles', f)).convert('RGBA').resize(sz, Image.LANCZOS).save(os.path.join(d, f), 'WEBP', quality=92, method=6)
