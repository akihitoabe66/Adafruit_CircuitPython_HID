#!/usr/bin/env python3
# 昇段の地図(巻物・2枚め): 青い背景を透明にした巻物の絵、水面の絵(波うたせる用の 横長の帯)、歩く道すじ(赤い線から読み取った)を作る。
# 入力: tools/map_src/scroll2.jpg(巻物) / water.jpg(水面) / scroll2_route.png(赤い点と線)。 出力: img/map/scroll2.webp, img/map/wa0..13.webp, native/app/map2data.js
import os, json, heapq
import numpy as np, cv2
from PIL import Image, ImageFilter
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); SRC = os.path.join(ROOT, 'tools', 'map_src'); OUT = os.path.join(ROOT, 'img', 'map')
# ---- 巻物: 青い背景(74,126,163)を 透明に
im = Image.open(os.path.join(SRC, 'scroll2.jpg')).convert('RGB'); a = np.array(im).astype(float)
dist = np.sqrt(((a - np.array([74, 126, 163])) ** 2).sum(axis=2)); alpha = np.clip((dist - 22) / 30, 0, 1)
alpha = cv2.GaussianBlur(alpha.astype(np.float32), (0, 0), 0.8)
ys, xs = np.where(alpha > 0.5); bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
rgba = np.dstack([a, alpha * 255]).astype(np.uint8)[by0:by1, bx0:bx1]
AW = 1040; sc = AW / (bx1 - bx0); AH = int(round((by1 - by0) * sc))
Image.fromarray(rgba, 'RGBA').resize((AW, AH), Image.LANCZOS).save(os.path.join(OUT, 'scroll2.webp'), 'WEBP', quality=88, method=6)
# ---- 水面: 960x504 に して 14本の帯に(横にずらして 波うたせる)
wt = Image.open(os.path.join(SRC, 'water.jpg')).convert('RGB').resize((960, 504), Image.LANCZOS)
wt = Image.eval(wt, lambda v: min(255, int(v * 1.12 + 6)))
for i in range(14): wt.crop((0, i * 36, 960, i * 36 + 36)).save(os.path.join(OUT, 'wa%d.webp' % i), 'WEBP', quality=80, method=6)
# ---- 道すじ: 赤い点と線(1375x768の座標)を たどる
r = np.array(Image.open(os.path.join(SRC, 'scroll2_route.png')).convert('RGB')).astype(int)
red = ((r[..., 0] > 200) & (r[..., 1] < 70) & (r[..., 2] < 70)).astype(np.uint8); H, W = red.shape
dt = cv2.distanceTransform(red, cv2.DIST_L2, 5); cost = np.where(red > 0, 1.0 / (dt + 0.5), 1e9)
nodes = {'A': (228, 613), 'B': (192, 490), 'C': (521, 480), 'D': (418, 391), 'E': (771, 417), 'F': (860, 319), 'G': (1015, 327), 'H': (986, 428), 'I': (1201, 387), 'J': (1216, 217)}
def snap(p):
    x, y = p; best = None
    for dy in range(-25, 26):
        for dx in range(-25, 26):
            xx, yy = x + dx, y + dy
            if 0 <= xx < W and 0 <= yy < H and red[yy, xx] and (best is None or dt[yy, xx] > dt[best[1], best[0]]): best = (xx, yy)
    return best
nodes = {k: snap(v) for k, v in nodes.items()}
def dijk(s, t):
    dd = {s: 0}; prev = {}; pq = [(0, s)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == t: break
        if d > dd.get(u, 1e18): continue
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx == 0 and dy == 0: continue
                v = (u[0] + dx, u[1] + dy)
                if 0 <= v[0] < W and 0 <= v[1] < H and red[v[1], v[0]]:
                    nd = d + cost[v[1], v[0]] * (1.414 if dx and dy else 1)
                    if nd < dd.get(v, 1e18): dd[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
    p = [t]
    while p[-1] != s: p.append(prev[p[-1]])
    return p[::-1]
def trace(a, b): return cv2.approxPolyDP(np.array(dijk(nodes[a], nodes[b]), np.int32).reshape(-1, 1, 2), 4.0, False).reshape(-1, 2).tolist()
E_ = {k: trace(k[0], k[1]) for k in ['AB', 'BC', 'CD', 'DE', 'EF', 'FG', 'GH', 'HI', 'GJ']}
def cut(poly, i, j): return poly[i:j + 1]
# 段位ごとの 区間(1段ぶん)。 legs[i] = 段位 i → i+1 の道。 行き止まりの枝は、分かれ道まで 戻ってから 次へ
de = E_['DE']; fg = E_['FG']; gh = E_['GH']; hi = E_['HI']; gj = E_['GJ']
top = int(np.argmin(np.array(fg)[:, 1]))                          # 越後: 北の海ぞいの、いちばん高いところ
ise = [list(nodes['E']), [768, 445], [766, 474]]                  # 伊勢: 大坂のあたりから 南へ のびる 寄り道(行き止まり)
def join(*ps):
    out = []
    for p in ps:
        for q in p:
            if not out or out[-1] != q: out.append(q)
    return out
rev = lambda p: p[::-1]
#  A: 描いてもらった赤い線どおり。 0熊本 1福岡 2四国 3中国 4山城(京) 5摂津(大阪) 6信濃 7越後 8駿河 9奥州 10江戸 11(江戸で天下統一)
legsA = [E_['AB'], E_['BC'], E_['CD'], de[:7], de[6:], E_['EF'], fg[:top + 1], join(fg[top:], gh[1:]), join(rev(gh), gj[1:]), join(rev(gj), gh[1:], hi[1:]), [list(nodes['I']), [nodes['I'][0] + 1, nodes['I'][1]]]]
#  B: おすすめ(伊勢あり)。 6伊勢(寄り道) 7信濃 8駿河 9奥州 10江戸 11(江戸で天下統一)。 越後は 通りすぎるだけ
legsB = [E_['AB'], E_['BC'], E_['CD'], de[:7], de[6:], ise, join(rev(ise), E_['EF']), join(fg, gh[1:]), join(rev(gh), gj[1:]), join(rev(gj), gh[1:], hi[1:]), [list(nodes['I']), [nodes['I'][0] + 1, nodes['I'][1]]]]
for L in (legsA, legsB):
    for i in range(1, len(L)): L[i] = [L[i - 1][-1]] + L[i][1:]
data = {'ox': int(bx0), 'oy': int(by0), 'bw': int(bx1 - bx0), 'bh': int(by1 - by0), 'sets': [{'name': '赤い線どおり', 'legs': legsA}, {'name': 'おすすめ(伊勢あり)', 'legs': legsB}]}
with open(os.path.join(ROOT, 'native', 'app', 'map2data.js'), 'w') as f:
    f.write('// 自動生成(tools/make_map2_assets.py): 昇段の地図の道すじ(元の絵 1375x768 の座標)。 sets[n].legs[i] = 段位 i→i+1 の道\nglobalThis.MAP2 = ' + json.dumps(data, separators=(',', ':')) + ';\n')
# ---- ずんだもんの 左右反転(左へ歩くとき)
for gi in range(4):
    Image.open(os.path.join(OUT, 'w%d.webp' % gi)).transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(OUT, 'w%df.webp' % gi), 'WEBP', quality=92, method=6)
print('scroll bbox', bx0, by0, bx1, by1, 'asset', AW, AH, 'legsA', [len(l) for l in legsA], 'legsB', [len(l) for l in legsB])
