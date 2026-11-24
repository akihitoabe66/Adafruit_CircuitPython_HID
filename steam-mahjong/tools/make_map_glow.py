#!/usr/bin/env python3
# 地図のずんだもんに、白くボケた縁どり(光)をつけた絵を作る。 出力: img/map/w{0-3}g.webp, w{0-3}fg.webp (まわりに P ピクセルの余白つき)
# 使い方: python3 tools/make_map_glow.py sticker   (いまの絵: 白1px+こげ茶1pxのふち) / python3 tools/make_map_glow.py [11〜13=くっきり白 1〜3=ぼかし)]
import os, sys
from PIL import Image, ImageFilter, ImageChops
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); OUT = os.path.join(ROOT, 'img', 'map')
P = 8
LV = {1: (1, 1.6, 0.85), 2: (2, 2.4, 1.0), 3: (3, 3.2, 1.0),   # ぼかしあり(ふくらませる幅, ぼかし, 濃さ)
      11: (1, 0.0, 1.0), 12: (2, 0.0, 1.0), 13: (3, 0.0, 1.0), 22: (2, 0.9, 1.0)}   # 11〜13=くっきり(白ぶち 1〜3px) 22=白ぶち2px+ごくわずかなぼかし
def glow(im, lv):
    dil, blur, k = LV[lv]
    W, H = im.size[0] + 2 * P, im.size[1] + 2 * P
    a = Image.new('L', (W, H), 0); a.paste(im.getchannel('A'), (P, P))
    h = a.filter(ImageFilter.MaxFilter(dil * 2 + 1))
    if blur > 0: h = h.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: min(255, int(v * 1.6 * k)))
    out = Image.new('RGBA', (W, H), (255, 255, 255, 0)); out.putalpha(h)
    body = Image.new('RGBA', (W, H), (0, 0, 0, 0)); body.paste(im, (P, P))
    return Image.alpha_composite(out, body)
def ring(im, layers):   # くっきりしたふち。 layers=[(太さpx, 色)]: 外側から重ねる(白1px+こげ茶1px = ステッカーふう)
    W, H = im.size[0] + 2 * P, im.size[1] + 2 * P
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0)); a0 = Image.new('L', (W, H), 0); a0.paste(im.getchannel('A'), (P, P))
    for d, col in sorted(layers, key=lambda x: -x[0]):
        m = a0.filter(ImageFilter.MaxFilter(d * 2 + 1)).point(lambda v: 255 if v > 100 else 0)
        L = Image.new('RGBA', (W, H), col + (255,)); L.putalpha(m); out = Image.alpha_composite(out, L)
    body = Image.new('RGBA', (W, H), (0, 0, 0, 0)); body.paste(im, (P, P)); return Image.alpha_composite(out, body)
STICKER = [(2, (70, 42, 22)), (1, (255, 255, 255))]   # 外: こげ茶1px(地図の墨の線の色) / 内: 白1px
if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'sticker':
        for i in range(4):
            for suf in ('', 'f'):
                ring(Image.open(os.path.join(OUT, 'w%d%s.webp' % (i, suf))).convert('RGBA'), STICKER).save(os.path.join(OUT, 'w%d%sg.webp' % (i, suf)), 'WEBP', quality=92, method=6)
        sys.exit(0)
    lv = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    for i in range(4):
        for suf in ('', 'f'):
            glow(Image.open(os.path.join(OUT, 'w%d%s.webp' % (i, suf))).convert('RGBA'), lv).save(os.path.join(OUT, 'w%d%sg.webp' % (i, suf)), 'WEBP', quality=92, method=6)
