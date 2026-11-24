#!/usr/bin/env python3
"""麻雀先生のドット絵(tools/ui_src/sensei_sheet.jpg: 6列×3行=18ポーズ)を、OLED(白黒)用の小さな絵にして、
native/pi/oled_sprites.py に書き出す。  使い方: python3 tools/make_oled_sprites.py [--preview 出力.png]
 絵の大きさは W×H(ドット)。 1ポーズ = W列 × (H/8)ページ のバイト列(SSD1306の縦8ドット=1バイトの並び)"""
import sys, os
from PIL import Image, ImageFilter
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(R, 'tools/ui_src/sensei_sheet.jpg')
W, H = 40, 48
BG = (25, 89, 63)
im = Image.open(SRC).convert('RGB'); iw, ih = im.size
CW, CH = iw / 6.0, ih / 3.0

def cell(i):
    c, r = i % 6, i // 6
    return im.crop((round(c * CW), round(r * CH), round((c + 1) * CW), round((r + 1) * CH)))

def mask_of(img):  # 背景(緑)でない所
    px = img.load(); w, h = img.size; m = Image.new('L', (w, h), 0); mp = m.load()
    for y in range(h):
        for x in range(w):
            p = px[x, y]; d = abs(p[0] - BG[0]) + abs(p[1] - BG[1]) + abs(p[2] - BG[2])
            mp[x, y] = 255 if d > 60 else 0
    return m

def one(i):
    c = cell(i)
    if i == 5:  # ポーズ6の左上に はみ出している、牌の絵を消す
        from PIL import ImageDraw
        ImageDraw.Draw(c).rectangle((0, 0, int(c.size[0] * 0.3), int(c.size[1] * 0.3)), fill=BG)
    # 右上のすみの、はぐれた牌(ポーズ5・6の外)を消す: 背景でない かたまりのうち、絵の中心から遠い小さなものは無視するため、中心の列だけ使う
    w, h = c.size; m = mask_of(c)
    # 外接する四角(中心に近い大きなかたまり)
    bb = m.getbbox() or (0, 0, w, h)
    # 絵の大きさをそろえる: 外接ではなく、セル全体を一定の倍率で縮める(ポーズで大きさが変わらないように)
    sc = min(W * 4 / w, H * 4 / h)   # 4倍の大きさで いったん作る
    big = c.resize((max(1, round(w * sc)), max(1, round(h * sc))), Image.LANCZOS)
    mm = m.resize(big.size, Image.LANCZOS).point(lambda v: 255 if v > 110 else 0)
    # 中央に置く
    can = Image.new('RGB', (W * 4, H * 4), BG); cm = Image.new('L', (W * 4, H * 4), 0)
    ox, oy = (W * 4 - big.size[0]) // 2, (H * 4 - big.size[1]) // 2
    can.paste(big, (ox, oy)); cm.paste(mm, (ox, oy))
    # 縮める(白っぽい所=点灯)
    small = can.resize((W, H), Image.LANCZOS).convert('L')
    sm = cm.resize((W, H), Image.BOX)
    sp, mp = small.load(), sm.load()
    out = [[0] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if mp[x, y] > 128 and sp[x, y] > 165: out[y][x] = 1
    # ふち(絵の輪郭)を 点灯: 絵の中で、まわりに絵でない所がある点
    ins = [[mp[x, y] > 128 for x in range(W)] for y in range(H)]
    for y in range(H):
        for x in range(W):
            if not ins[y][x]: continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if nx < 0 or ny < 0 or nx >= W or ny >= H or not ins[ny][nx]: out[y][x] = 1; break
    return out

def pack(bits):  # ページ(縦8ドット)ごと、列ごとに1バイト(下位ビット=上)
    data = []
    for pg in range(H // 8):
        for x in range(W):
            b = 0
            for k in range(8):
                if bits[pg * 8 + k][x]: b |= 1 << k
            data.append(b)
    return bytes(data)

def main():
    poses = [one(i) for i in range(18)]
    prev = None
    if '--preview' in sys.argv: prev = sys.argv[sys.argv.index('--preview') + 1]
    if prev:
        S = 5; sheet = Image.new('L', (6 * (W * S + 8), 3 * (H * S + 8)), 60)
        for i, b in enumerate(poses):
            t = Image.new('L', (W, H)); t.putdata([255 if b[y][x] else 0 for y in range(H) for x in range(W)])
            sheet.paste(t.resize((W * S, H * S), Image.NEAREST), ((i % 6) * (W * S + 8) + 4, (i // 6) * (H * S + 8) + 4))
        sheet.save(prev)
    out = os.path.join(R, 'native/pi/oled_sprites.py')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('# make_oled_sprites.py が作る(手で直さない)。 麻雀先生 18ポーズ。 W×H=%d×%d、1ポーズ=%d バイト\n' % (W, H, W * H // 8))
        f.write('W, H = %d, %d\nPOSES = [\n' % (W, H))
        for b in poses: f.write('    bytes.fromhex(%r),\n' % pack(b).hex())
        f.write(']\n')
    print('wrote', out)
main()
