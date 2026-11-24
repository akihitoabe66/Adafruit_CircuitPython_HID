"""OLED の上の 16ドット(すじが入る帯)の、背景アニメーション。 s は mjoled.Screen(raw=ドットを点ける / rawclr=消す)、f は コマの番号(1秒に 6コマ)。
 場面: city(夜景)・snow(雪の夜)・sakura(桜)・fire(花火)・rain(雨と稲妻)・space(宇宙)・sea(灯台と海)・stars(星空)。
 どれも 点の細かさ(ディザ)や 細い点を使うので、横線が入っても 質感に見えて 目立たない"""
import math

W = 128
BAYER4 = ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5))
CITY = [(0, 8, 7), (8, 6, 10), (14, 8, 6), (22, 5, 12), (27, 9, 8), (36, 10, 9), (46, 8, 10), (54, 9, 11), (63, 6, 13), (69, 9, 8), (78, 7, 11), (85, 8, 7), (93, 9, 10), (102, 6, 12), (108, 7, 8), (115, 6, 11), (121, 7, 9)]


def rnd(i, salt=0):
    """決まった ばらつき(0〜65535)"""
    x = (i * 2654435761 + salt * 40503 + 12345) & 0xFFFFFFFF
    x ^= x >> 15; x = (x * 2246822519) & 0xFFFFFFFF; x ^= x >> 13
    return x & 0xFFFF


def line(s, x0, y0, x1, y1):
    n = max(abs(x1 - x0), abs(y1 - y0), 1)
    for i in range(n + 1): s.raw(round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n))


def city(s, f):
    ep = f // 18
    for y in range(16):   # 空: 上は まばら、下ほど 明るい
        dens = 8 + int(y * 0.5)
        for x in range(W):
            if BAYER4[y % 4][x % 4] < dens: s.raw(x, y)
    for x, w, h in CITY:   # ビルの シルエット(黒)
        for yy in range(16 - h, 16):
            for xx in range(x, x + w): s.rawclr(xx, yy)
    for yy in range(0, 7):   # エンパイア・ステートふうの 先
        for xx in ((40, 41) if yy >= 3 else (41,)): s.rawclr(xx, yy)
    for xx in range(39, 43): s.rawclr(xx, 6)
    for yy in range(0, 4): s.rawclr(66, yy); s.rawclr(67, yy) if yy >= 2 else None
    for x, w, h in CITY:   # 窓(白の 1x2)
        for r, wy in enumerate(range(16 - h + 2, 14, 3)):
            for c, wx in enumerate(range(x + 2, x + w - 2, 2)):
                if ((x * 7 + r * 13 + c * 29 + ep * 17) % 3) != 0: s.raw(wx, wy); s.raw(wx, wy + 1)
    for dy in range(-3, 4):   # 月
        for dx in range(-3, 4):
            if dx * dx + dy * dy <= 9: s.rawclr(100 + dx, 4 + dy)
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if dx * dx + dy * dy <= 5: s.raw(100 + dx, 4 + dy)
    if (f // 6) % 2 == 0: s.raw(41, 0); s.raw(66, 0)   # 塔の先の灯り
    px = (f // 2) % 500 - 100   # ときどき 飛行機(点滅する灯り)
    if 0 <= px < W and (f // 3) % 2 == 0: s.raw(px, 2); s.raw(px - 1, 2)


def snow(s, f):
    for k in range(8):   # 星
        if (k + f // 24) % 3: s.raw(rnd(k, 1) % W, rnd(k, 2) % 8)
    for x0, hgt in ((6, 8), (28, 6), (50, 9), (76, 7), (98, 9), (118, 6)):   # 松の木(白)
        for r in range(hgt):
            half = r * 3 // 4
            for xx in range(x0 - half, x0 + half + 1): s.raw(xx, 15 - hgt + r - 1)
        s.raw(x0, 15); s.raw(x0, 14)
    for x in range(W):
        s.raw(x, 15)
        if x % 2 == 0: s.raw(x, 14)   # 雪の地面
    for i in range(30):   # 雪(ゆっくり 横にゆれながら 降る)
        sp = 0.12 + (rnd(i, 3) % 20) / 100.0
        y = (rnd(i, 4) % 16 + f * sp) % 16
        x = (rnd(i, 5) % W + math.sin(f * 0.09 + i) * 2.0) % W
        s.raw(int(x), int(y))


def sakura(s, f):
    for dy in range(-2, 3):   # 月
        for dx in range(-2, 3):
            if dx * dx + dy * dy <= 5: s.raw(112 + dx, 4 + dy)
    for a, b in (((0, 3), (24, 6)), ((24, 6), (52, 4)), ((52, 4), (80, 9)), ((24, 6), (30, 12)), ((52, 4), (60, 0))): line(s, a[0], a[1], b[0], b[1])   # 枝
    for cx, cy in ((10, 2), (20, 6), (34, 7), (46, 3), (58, 5), (66, 8), (76, 9), (30, 10), (60, 1)):   # 花
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            if (rnd(cx * 7 + cy, f // 24) % 5) or (dx, dy) == (0, 0): s.raw(cx + dx, cy + dy)
    for i in range(16):   # 花びら(ななめに ひらひら)
        sp = 0.16 + (rnd(i, 6) % 14) / 100.0
        y = (rnd(i, 7) % 16 + f * sp) % 16
        x = (rnd(i, 8) % W + f * 0.45 + math.sin(f * 0.15 + i) * 2.5) % W
        s.raw(int(x), int(y))


def fire(s, f):
    for x, w, h in CITY:   # 手前の街の 明るいシルエット(低め)
        for yy in range(16 - h // 3 - 1, 16):
            for xx in range(x, x + w - 1): s.raw(xx, yy)
    for b in range(3):
        per = 42; ph = (f + b * 14) % per; cyc = (f + b * 14) // per
        cx = 18 + rnd(b * 11 + cyc, 9) % 92; cy = 3 + rnd(b * 5 + cyc, 10) % 4
        if ph < 10:   # のぼっていく 光
            s.raw(cx, 12 - ph)
        else:
            q = ph - 10   # 0..31
            r = min(7.0, q * 0.8)
            for k in range(12):
                ang = k * math.pi / 6
                fall = max(0, q - 8) * 0.22
                px = cx + math.cos(ang) * r; py = cy + math.sin(ang) * r * 0.8 + fall
                if q < 24 or (q + k) % 2 == 0: s.raw(int(round(px)), int(round(py)))


def rain(s, f):
    for x, w, h in CITY:   # 遠くの街(低い明るい輪郭)
        top = 16 - h // 2
        for xx in range(x, x + w): s.raw(xx, top) if xx % 2 == 0 else None
        for yy in range(top, 16): s.raw(x, yy) if yy % 2 == 0 else None
    for i in range(36):   # 雨(ななめの 3ドットの すじ)
        sp = 1.3 + (rnd(i, 11) % 10) / 10.0
        x0 = rnd(i, 12) % W
        y = (rnd(i, 13) % 16 + f * sp) % 22 - 3
        x = (x0 - f * 0.4) % W
        for k in range(3): s.raw(int(x - k * 0.6) % W, int(y + k))
    ph = f % 54
    if ph in (0, 1):   # 稲光
        cx = 20 + rnd(f // 54, 14) % 90
        px = cx
        for y in range(0, 16):
            px += (rnd(y + f // 54 * 3, 15) % 3) - 1; s.raw(int(px), y); s.raw(int(px) + 1, y)
        if ph == 0:
            for y in range(16):
                for x in range(W):
                    if BAYER4[y % 4][x % 4] < 6: s.raw(x, y)


def space(s, f):
    for layer, (n, sp) in enumerate(((14, 0.12), (10, 0.25), (6, 0.5))):   # 星が ゆっくり 左へ ながれる(奥ほど ゆっくり)
        for i in range(n):
            x = (rnd(i, 20 + layer) % W - f * sp) % W; y = rnd(i, 30 + layer) % 16
            s.raw(int(x), y)
            if layer == 2: s.raw(int(x) + 1, y)
    ph = f % 90
    if 0 <= ph < 10:   # 流れ星
        x = 100 - ph * 6; y = 1 + ph
        for k in range(5): s.raw(x + k, y - k // 2 if False else y - k // 2)
    ph = f % 300
    if 0 <= ph < 100:   # 小さなロケットが よこぎる
        x = -10 + ph * 1.4; y = 9
        for k in range(6): s.raw(int(x) + k, y); s.raw(int(x) + k, y + 1) if 1 <= k <= 4 else None
        s.raw(int(x) + 6, y); s.raw(int(x) + 2, y - 1); s.raw(int(x) + 2, y + 2)
        if f % 2 == 0:
            for k in range(1, 4): s.raw(int(x) - k, y)


def sea(s, f):
    for k in range(7):   # 星
        if (k + f // 30) % 3: s.raw(rnd(k, 40) % 96, rnd(k, 41) % 7)
    for x in range(W):   # 波(2本)
        y1 = 11 + int(round(math.sin((x + f * 0.8) * 0.28) * 1.2)); s.raw(x, y1)
        y2 = 14 + int(round(math.sin((x - f * 0.6) * 0.33) * 1.0)); s.raw(x, y2) if x % 2 == 0 else None
    for r in range(6, 16):   # 灯台(白)
        half = 1 + (r - 6) // 4
        for xx in range(110 - half, 110 + half + 1): s.raw(xx, r)
    for xx in range(108, 113): s.raw(xx, 4)
    s.raw(109, 3); s.raw(110, 3); s.raw(111, 3); s.raw(110, 2)
    ph = (f // 9) % 4   # 光のはば: 左 → 消える → 右 → 消える
    if ph == 0:
        for k in range(1, 40):
            half = k // 6
            for dy in range(-half, half + 1):
                if (k + dy) % 2 == 0: s.raw(108 - k, 3 + dy)
    elif ph == 2:
        for k in range(1, 18):
            half = k // 6
            for dy in range(-half, half + 1):
                if (k + dy) % 2 == 0: s.raw(112 + k, 3 + dy)


def stars(s, f):
    for i in range(34):   # 星が きらきら またたく
        per = 4 + rnd(i, 50) % 8
        if (f // per + i) % 3 == 0: continue
        s.raw(rnd(i, 51) % W, rnd(i, 52) % 16)
    for i in range(5):   # 明るい星(十字)が 順番に ひかる
        if (f // 8 + i) % 5 == 0:
            x = 10 + rnd(i, 53) % 108; y = 3 + rnd(i, 54) % 10
            for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)): s.raw(x + dx, y + dy)
    ph = f % 100
    if ph < 8:
        x = 120 - ph * 7; y = ph * 2 % 14
        for k in range(5): s.raw(x + k, y - k // 2)


SCENES = {'city': city, 'snow': snow, 'sakura': sakura, 'fire': fire, 'rain': rain, 'space': space, 'sea': sea, 'stars': stars}


def draw(s, kind, f):
    SCENES.get(kind, city)(s, f)
