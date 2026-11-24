#!/usr/bin/env python3
# 起動画面(img/boot.webp)の緑の背景を、なめらかなグラデーションに作り直す。 文字・ロゴ・牌は、そのまま残す。
# 方法: 絵から「緑のなめらかな地」を、まわりの色で求め直し(前景をのぞいた、正規化つきのぼかし)、
#       前景(文字・ロゴ・牌の線)との差が大きいところだけ、元の絵を残す。 地の部分は、計算したグラデ+ごく弱い粒(帯が出ないように)。
# 使い方: python3 tools/make_boot_bg.py   (元の絵は tools/boot_src/boot_before.webp)
import os, sys
import numpy as np, cv2
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
src = cv2.imread(os.path.join(ROOT, 'tools/boot_src/boot_before.png')) if os.path.exists(os.path.join(ROOT, 'tools/boot_src/boot_before.png')) else None
if src is None:
    from PIL import Image
    src = cv2.cvtColor(np.array(Image.open(os.path.join(ROOT, 'tools/boot_src/boot_before.webp')).convert('RGB')), cv2.COLOR_RGB2BGR)
h, w = src.shape[:2]; f = src.astype(np.float32)
# 1) 前景のあたりをつける: ぼかした地との差が大きい・明るい・緑でない
g = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY).astype(np.float32)
hsv = cv2.cvtColor(src, cv2.COLOR_BGR2HSV).astype(np.float32)
base = cv2.GaussianBlur(f, (0, 0), 40)
d0 = np.abs(f - base).sum(axis=2)
fg0 = ((d0 > 30) | (hsv[..., 2] > 120)).astype(np.uint8) * 255
fg0 = cv2.dilate(fg0, np.ones((9, 9), np.uint8))
# 2) 地だけを使って、なめらかな面を作る(正規化つきぼかし = 前景を飛ばして まわりから補う)
wgt = (fg0 == 0).astype(np.float32)
def smooth(sig):
    num = cv2.GaussianBlur(f * wgt[..., None], (0, 0), sig); den = cv2.GaussianBlur(wgt, (0, 0), sig)[..., None]
    return num / np.maximum(den, 1e-3), den[..., 0]
bg = None
for sig in (30, 60, 120):
    s, den = smooth(sig); bg = s if bg is None else np.where(den[..., None] > 0.04, bg, s)
bg = cv2.GaussianBlur(bg, (0, 0), 12)
# 3) 前景との差で、ふわっとしたマスク(0=地 1=前景)。 圧縮のムラ(小さい差)は、地にする
d = np.abs(f - bg).sum(axis=2); d = cv2.GaussianBlur(d, (0, 0), 0.8)
alpha = np.clip((d - 15) / 14, 0, 1)
alpha = np.maximum(alpha, cv2.GaussianBlur(((hsv[..., 2] > 125)).astype(np.float32), (0, 0), 0.8))   # 金の文字・牌の白は、かならず残す
alpha = cv2.GaussianBlur(alpha, (0, 0), 0.7)[..., None]
# 4) 地には、粒(ディザ)を、ごく弱く足す(8bitの帯を目立たなくする)
rng = np.random.default_rng(7); noise = (rng.random((h, w, 1)).astype(np.float32) - 0.5) * 1.6
out = f * alpha + (bg + noise) * (1 - alpha)
out = np.clip(out + 0.5, 0, 255).astype(np.uint8)
cv2.imwrite(os.path.join(ROOT, 'tools/boot_src/boot_after.png'), out)
from PIL import Image
Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB)).save(os.path.join(ROOT, 'img/boot.webp'), 'WEBP', quality=94, method=6)
print('ok', os.path.getsize(os.path.join(ROOT, 'img/boot.webp')))
