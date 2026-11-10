#!/usr/bin/env python3
"""浮世絵版の画像を切り出す。 python3 tools/cut_ukiyoe.py
  tools/ukiyoe/sheet_cpu.png (32人・横8×縦4) → img/uk/chars/face/NN.webp と NN_f.webp(左右反転)  ※縦長なので、上の正方形(バストアップ)だけ使う
  tools/ukiyoe/sheet_you.png (あなた16表情・4×4) → img/uk/zunda/01〜16.webp
  tools/ukiyoe/title.jpg → img/uk/title_art.webp
起動のとき MJ_STYLE=old を付けると、前のバージョン(img/chars, img/zunda, img/title_art.webp)に戻る。"""
import os
from PIL import Image, ImageFilter
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); U = os.path.join(R, 'tools', 'ukiyoe'); O = os.path.join(R, 'img', 'uk')
os.makedirs(os.path.join(O, 'chars', 'face'), exist_ok=True); os.makedirs(os.path.join(O, 'zunda'), exist_ok=True)
# 枠線の内側(絵のあるところ)。AI生成の一覧は少しずつずれているので、実測した値
CL, CR = [8, 199, 392, 584, 775, 968, 1159, 1351], [183, 374, 567, 759, 951, 1142, 1334, 1526]
CT, CB = [12, 269, 515, 752], [254, 500, 738, 993]
M = 2  # 枠線のきわ(左右は、枠線ギリギリ)
# 目の高さ(各パネルの上から、画素)。 切り出す正方形の中で、目の線が EYE_T(0〜1)の高さに来るよう、上下の位置を決める。 あなた(ずんだもん)の目の線は 0.55 くらい
EYE_T = 0.55
EYE = [88, 93, 90, 95, 98, 95, 90, 93,   100, 105, 100, 100, 100, 108, 100, 90,   100, 92, 95, 85, 100, 100, 105, 95,   90, 85, 95, 85, 85, 90, 98, 90]
import numpy as np
SCALE = 0.748  # 顔の大きさ(1=パネルの横幅いっぱい)。小さくすると、まわりを足して、顔が小さく見える
# 1人ずつの調整(番号は 1〜32)。 SIZE: 顔の大きさを、全体(SCALE)の何倍にするか / UP: 顔を上にあげる量(窓の高さに対する割合。0.05 = 5%)
SIZE = {1: 0.90, 4: 0.95, 6: 0.95, 9: 0.95, 12: 1.05, 13: 0.95, 14: 1.05, 17: 1.05, 26: 1.05}
UP = {1: 0.05, 2: 0.10, 3: 0.05, 4: 0.05, 5: 0.10, 6: 0.10, 7: 0.05, 8: 0.05, 12: 0.05, 17: 0.05, 20: 0.05, 26: 0.10, 28: 0.05}
P = 60        # まわりを足す幅(鏡のように折り返す)
im = Image.open(os.path.join(U, 'sheet_cpu.png')).convert('RGB')
n = 0
for r in range(4):
    for c in range(8):
        n += 1; x0, x1, y0, y1 = CL[c] + M, CR[c] - M, CT[r] + M, CB[r] - M; w = x1 - x0; h = y1 - y0
        src = im.crop((x0, y0, x1, y1)); pad = np.pad(np.array(src), ((P, P), (P, P), (0, 0)), mode='reflect')
        # 足したところは、折り返しを強くぼかして、ぼんやりした背景にする(模様が、ぎらぎらしないように)
        pim = Image.fromarray(pad); blur = pim.filter(ImageFilter.GaussianBlur(9)); mask = Image.new('L', pim.size, 0); mask.paste(255, (P, P, P + w, P + h)); mask = mask.filter(ImageFilter.GaussianBlur(1.5))
        pad = np.array(Image.composite(pim, blur, mask))
        Wd = round(w / (SCALE * SIZE.get(n, 1))); left = P + (w - Wd) // 2                       # 窓の大きさ(正方形)と、左のはし(中央そろえ)
        top = P + round(EYE[n - 1] - (EYE_T - UP.get(n, 0)) * Wd); top = max(0, min(h + 2 * P - Wd, top))  # 目の線が、窓の EYE_T の高さに来るように
        sq = Image.fromarray(pad[top:top + Wd, left:left + Wd]).resize((176, 176), Image.LANCZOS)
        sq.save(os.path.join(O, 'chars', 'face', '%02d.webp' % n), quality=90); sq.transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(O, 'chars', 'face', '%02d_f.webp' % n), quality=90)
YL, YR = [12, 322, 634, 946], [307, 617, 930, 1243]; YT, YB = [12, 324, 635, 944], [309, 619, 930, 1244]
im = Image.open(os.path.join(U, 'sheet_you.png')).convert('RGB'); n = 0
for r in range(4):
    for c in range(4):
        n += 1; im.crop((YL[c] + M, YT[r] + M, YR[c] - M, YB[r] - M)).resize((256, 256), Image.LANCZOS).save(os.path.join(O, 'zunda', '%02d.webp' % n), quality=90)
Image.open(os.path.join(U, 'title.jpg')).convert('RGB').resize((1362, 768), Image.LANCZOS).save(os.path.join(O, 'title_art.webp'), quality=88)
os.makedirs(os.path.join(R, 'native', 'img', 'uk'), exist_ok=True)
Image.open(os.path.join(U, 'title.jpg')).convert('RGB').resize((832, 469), Image.LANCZOS).save(os.path.join(R, 'native', 'img', 'uk', 'title_art.webp'), quality=88) # 実機用(小さい)
print('done')
