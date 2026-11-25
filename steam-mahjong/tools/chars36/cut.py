#!/usr/bin/env python3
"""キャラクター36人の顔のシート(sheet.jpg、6×6)を、1人ずつの正方形に切って、img/chars/ に書き出す。
使い方: python3 tools/chars36/cut.py  (steam-mahjong/ で実行)
  img/chars/NN.webp      … 大きい顔(256px)
  img/chars/face/NN.webp … 小さい顔(128px)
枠(金の縁)は含めない。シートが高解像度のものに変わったら、COL0・PITCH・ROWC・SIZE を合わせ直す。"""
import os, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
SHEET = os.path.join(HERE, 'sheet.jpg')
COL0, PITCH, SIZE = 47, 170, 138            # 1列めの左はし(絵の内側)、列の間隔、1人の絵の大きさ
ROWC = [100, 276, 450, 595, 750, 926]        # 各段の中心の高さ
INSET = 3                                   # 金の縁に触れないよう、内側へ
def main(out=None, preview=None):
    im = Image.open(SHEET).convert('RGB'); out = out or os.path.join(ROOT, 'img', 'chars')
    os.makedirs(os.path.join(out, 'face'), exist_ok=True); tiles = []
    for n in range(36):
        r, c = divmod(n, 6); x0 = COL0 + c * PITCH; y0 = ROWC[r] - SIZE // 2
        t = im.crop((x0 + INSET, y0 + INSET, x0 + SIZE - INSET, y0 + SIZE - INSET)); tiles.append(t)
        t.resize((256, 256), Image.LANCZOS).save(os.path.join(out, '%02d.webp' % (n + 1)), 'WEBP', quality=88)
        t.resize((128, 128), Image.LANCZOS).save(os.path.join(out, 'face', '%02d.webp' % (n + 1)), 'WEBP', quality=88)
    if preview:
        S = 96; sheet = Image.new('RGB', (6 * (S + 4), 6 * (S + 4)), (30, 30, 30))
        for n, t in enumerate(tiles): sheet.paste(t.resize((S, S)), ((n % 6) * (S + 4), (n // 6) * (S + 4)))
        sheet.save(preview)
if __name__ == '__main__': main(preview=sys.argv[1] if len(sys.argv) > 1 else None)
