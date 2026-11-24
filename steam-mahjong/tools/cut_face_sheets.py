#!/usr/bin/env python3
"""枠つきの顔の一覧(横8×縦4、32人)から、ゲームで使う画像を切り出す。
使い方: python3 tools/cut_face_sheets.py 通常.png 雀鬼(赤).png 覚醒(金).png   (Pillow が必要)
 - 通常: img/chars/face/NN.webp(顔・枠つき 176x176)、NN_f.webp(左右反転)、img/chars/NN.webp(立ち絵 220x240: 枠の内側を切り出し)
 - 赤・金: js/oni_faces.js(雀鬼モード・覚醒の顔。左右反転つき)
 3枚は、同じ並び・同じ大きさの画像であること。"""
import sys, os, io, json, base64
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), '..')
# 3024x1520 の一覧での、セルの位置(セルのあいだの暗い線の内側)
XS = [(9, 382), (385, 758), (761, 1134), (1137, 1510), (1513, 1886), (1889, 2262), (2265, 2638), (2641, 3014)]
YS = [(9, 382), (385, 758), (761, 1134), (1137, 1510)]
FRAME = 32  # 立ち絵: 木の枠の内側だけを使う

def cells(im):
    sx, sy = im.size[0] / 3024, im.size[1] / 1520
    for r in range(4):
        for c in range(8):
            x0, x1 = XS[c]; y0, y1 = YS[r]
            yield (int(x0 * sx), int(y0 * sy), int((x1 + 1) * sx), int((y1 + 1) * sy))

def main(n_path, r_path, g_path):
    sn, sr, sg = (Image.open(p).convert('RGB') for p in (n_path, r_path, g_path))
    D = os.path.join(ROOT, 'img', 'chars'); os.makedirs(os.path.join(D, 'face'), exist_ok=True)
    oni = {}
    boxes = list(cells(sn))
    for i, box in enumerate(boxes):
        k = '%02d' % (i + 1)
        face = sn.crop(box).resize((176, 176), Image.LANCZOS)
        face.save(os.path.join(D, 'face', k + '.webp'), quality=92, method=6)
        face.transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(D, 'face', k + '_f.webp'), quality=92, method=6)
        x0, y0, x1, y1 = box; f = FRAME; w = (x1 - x0) - 2 * f; h = (y1 - y0) - 2 * f
        cw = int(h * 220 / 240); l = x0 + f + (w - cw) // 2
        sn.crop((l, y0 + f, l + cw, y0 + f + h)).resize((220, 240), Image.LANCZOS).save(os.path.join(D, k + '.webp'), quality=90, method=6)
    for key, sh in (('r', sr), ('g', sg)):
        for i, box in enumerate(cells(sh)):
            k = '%02d' % (i + 1)
            fo = sh.crop(box).resize((176, 176), Image.LANCZOS)
            for suffix, im in (('', fo), ('_f', fo.transpose(Image.FLIP_LEFT_RIGHT))):
                b = io.BytesIO(); im.save(b, 'WEBP', quality=88, method=6)
                oni[k + suffix + '_' + key] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
    with open(os.path.join(ROOT, 'js', 'oni_faces.js'), 'w') as f:
        f.write('/* 雀鬼モード(赤)・覚醒(金)の顔画像(tools/cut_face_sheets.py で作る) */\n(window.MJ = window.MJ || {}).OniFaces = ' + json.dumps(oni) + ';\n')
    print('done', len(oni))

if __name__ == '__main__':
    main(*sys.argv[1:4])
