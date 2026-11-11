#!/usr/bin/env python3
"""牌の絵(白い面)の色と濃淡をそろえ、シャープネスをかける。 元の絵は tools/tiles_orig/ に残してある。
使い方: python3 tools/tile_norm.py 出力フォルダ      (確認用。img/tiles に反映するときは、出力先に img/tiles を指定)
牌ごとの強さは SHARP で変える(ファイル名 → 強さ。ないものは DEFAULT)。"""
import glob, os, sys
import numpy as np, cv2
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = np.array([245, 237, 223], np.float32)   # 白い面の、そろえる色
FLAT = 0.85                                      # 面の濃淡のムラを、ならす強さ
RAD = 1.3                                        # シャープネスの半径
DEFAULT = 0.0                                    # シャープネスの強さ(0=かけない)
SHARP = {}   # 牌ごとに変えるときは、ここに書く(ファイル名 → 強さ)

def process(a, amount):
    rgb = a[:, :, :3].astype(np.float32); hsv = cv2.cvtColor(a[:, :, :3], cv2.COLOR_RGB2HSV)
    m = (a[:, :, 3] > 250) & (hsv[:, :, 2] > 170) & (hsv[:, :, 1] < 80); er = cv2.erode(m.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    med = np.median(rgb[er], axis=0); mk = er.astype(np.float32); L = np.zeros_like(rgb)
    for c in range(3): L[:, :, c] = cv2.GaussianBlur(rgb[:, :, c] * mk, (0, 0), 10) / (cv2.GaussianBlur(mk, (0, 0), 10) + 1e-4)
    Lm = np.where(mk[:, :, None] > 0, L, med[None, None, :]); ratio = med[None, None, :] / np.maximum(Lm, 1)
    dist = cv2.distanceTransform(m.astype(np.uint8), cv2.DIST_L2, 5); edge = np.clip((dist - 4) / 10, 0, 1)
    base = rgb * (1 + (ratio - 1) * (FLAT * edge)[:, :, None])
    v = hsv[:, :, 2].astype(np.float32); s = hsv[:, :, 1].astype(np.float32)
    w = np.clip((v - 140) / 50, 0, 1) * np.clip((110 - s) / 50, 0, 1); w = cv2.GaussianBlur(w, (0, 0), 0.8)
    out = base * (1 + ((TARGET / med) - 1)[None, None, :] * w[:, :, None])
    bl = cv2.GaussianBlur(out, (0, 0), RAD); out = np.clip(out + (out - bl) * amount, 0, 255)
    return np.dstack([out.astype(np.uint8), a[:, :, 3]])

if __name__ == '__main__':
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    for f in glob.glob(os.path.join(HERE, 'tiles_orig', '*.webp')):
        k = os.path.basename(f)[:-5]; a = np.array(Image.open(f).convert('RGBA'))
        Image.fromarray(process(a, SHARP.get(k, DEFAULT))).save(os.path.join(out, k + '.webp'), quality=96, method=6)
