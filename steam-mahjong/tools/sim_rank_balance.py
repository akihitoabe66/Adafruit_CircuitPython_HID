#!/usr/bin/env python3
"""段位のつりあいを、計算で確かめる(js/rank.js の点数・相手の強さの係数・降段のきまりと、js/chars.js の解放表を、そのまま使う)。
使い方: python3 tools/sim_rank_balance.py [週に何局あそぶか=9]
前提: 東風戦(1位+15/2位+8/3位+3/4位-5)。 強さは3とおり(順位のわりあい)。 結果は「各段位に着くまでの週数(中央値)」。"""
import json, random, statistics as st, subprocess, sys, os, re
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
GPW = int(sys.argv[1]) if len(sys.argv) > 1 else 9
js = r"""const fs=require('fs'),vm=require('vm');const G={document:{querySelector:()=>null},localStorage:{getItem:()=>null,setItem(){}},console};G.window=G;G.globalThis=G;vm.createContext(G);vm.runInContext(fs.readFileSync('js/chars.js','utf8'),G);const MJ=G.MJ;console.log(JSON.stringify(MJ.CHARS.map(c=>({id:c.id,level:c.level,unlock:MJ.unlockDan(c.id)}))));"""
chars = json.loads(subprocess.run(['node', '-e', js], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
src = open(os.path.join(ROOT, 'js/rank.js'), encoding='utf-8').read()
DAN = [int(x) for x in re.findall(r"\['[^']+', (\d+)\]", re.search(r'const DAN = \[(.*?)\];', src).group(1))]
NAMES = ['無段', '初段', '二段', '三段', '四段', '五段', '六段', '七段', '八段', '九段', '名人']
FLOOR = [int(x) for x in re.search(r'MJ.EFF_FLOOR = \[([^\]]*)\]', src).group(1).split(',')]  # 段位ごとの★の最低値(無段のキャラの成長)
PT = [15, 8, 3, -5]
if os.environ.get('MJ_PT'): PT = json.loads(os.environ['MJ_PT'])  # 試し用: 点の表を かえる 例 MJ_PT='[15,8,3,-3]'
if os.environ.get('MJ_DANX'): _x = float(os.environ['MJ_DANX']); DAN = [v if i < 6 else int(DAN[5] + (v - DAN[5]) * _x) for i, v in enumerate(DAN)]  # 試し用: 六段より上の必要点を x倍(五段からの差を)
clamp = lambda v, a, b: max(a, min(b, v))
def sim(p, seed, weeks=200):
    rnd = random.Random(seed); pt = 0; dan = 0; at = {}
    for w in range(1, weeks + 1):
        for _ in range(GPW):
            pool = [c for c in chars if c['unlock'] <= dan]  # 相手: 新顔1(最近の2段の人)+おなじみ2(昔の人)。 ★は、段位の最低値まで引き上げる
            nw = [c for c in pool if c['unlock'] >= max(0, dan - 1)] or pool; a = rnd.choice(nw); rest = [c for c in pool if c is not a]; old = [c for c in rest if c['unlock'] < dan - 1]; b = rnd.sample(old if len(old) >= 2 else rest, 2) if len(rest) >= 2 else rest
            op = [a] + b; fl = FLOOR[min(dan, len(FLOOR) - 1)]
            dd = sum(max(c['level'], fl) for c in op) / len(op) - (1 + 0.8 * dan); r = rnd.choices([1, 2, 3, 4], p)[0]
            if dan >= 10 and rnd.random() < 0.2 and r == 1 and rnd.random() < 0.6: at.setdefault(11, w)  # 天下分け目(5回に1回): 1位(強い相手なので 6割にへる)で 永世名人
            mult = clamp(1 + 0.15 * dd, 0.5, 2) if r <= 2 else clamp(1 - 0.15 * dd, 0.5, 2) if r == 4 else 1
            pt = max(0, pt + round(PT[r - 1] * mult)); d = dan
            while d < len(DAN) - 1 and pt >= DAN[d + 1]: d += 1
            while d >= 3 and pt < DAN[d] - 40: d -= 1
            dan = d; at.setdefault(dan, w)
        if 11 in at: break
    return at
print('段位の表(必要な累計点):', dict(zip(NAMES, DAN[:11])), ' 週に', GPW, '局(東風戦)')
for label, p in (('弱め(1位22/2位26/3位27/4位25%)', [.22, .26, .27, .25]), ('ふつう(27/28/25/20%)', [.27, .28, .25, .20]), ('強め(33/30/22/15%)', [.33, .30, .22, .15])):
    res = {d: [sim(p, s, 400).get(d, 999) for s in range(40)] for d in (1, 3, 5, 7, 9, 10, 11)}
    print(label, {(NAMES + ['永世名人'])[d]: '%d週(%.1fか月)' % (st.median(res[d]), st.median(res[d]) / 4.33) for d in (1, 3, 5, 7, 9, 10, 11)})

# ---- 現実に近い版: プレーヤーの実力(AIの強さ1〜5に たとえる)と、相手の強さの差で、順位のわりあいを変える ----
import math
AIMAP = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]
def dist(avg):  # 平均順位 avg(2.5=ちょうど真ん中)になる、順位のわりあい
    lo, hi = -3.0, 3.0
    for _ in range(60):
        b = (lo + hi) / 2; w = [math.exp(-b * (r - 2.5)) for r in (1, 2, 3, 4)]; m = sum(r * x for r, x in zip((1, 2, 3, 4), w)) / sum(w)
        if m > avg: lo = b
        else: hi = b
    return [x / sum(w) for x in w]
def sim2(L, seed, weeks=400, slope=0.2):
    rnd = random.Random(seed); pt = 0; dan = 0; at = {}
    for w in range(1, weeks + 1):
        for _ in range(GPW):
            pool = [c for c in chars if c['unlock'] <= dan]
            nw = [c for c in pool if c['unlock'] >= max(0, dan - 1)] or pool; a = rnd.choice(nw); rest = [c for c in pool if c is not a]; old = [c for c in rest if c['unlock'] < dan - 1]; b = rnd.sample(old if len(old) >= 2 else rest, 2) if len(rest) >= 2 else rest
            op = [a] + b; fl = FLOOR[min(dan, len(FLOOR) - 1)]; lv = [max(c['level'], fl) for c in op]
            oai = sum(AIMAP[x] for x in lv) / len(lv); p = dist(clamp(2.5 + slope * (oai - L), 1.6, 3.4)); r = rnd.choices([1, 2, 3, 4], p)[0]
            dd = sum(lv) / len(lv) - (1 + 0.8 * dan); mult = clamp(1 + 0.15 * dd, 0.5, 2) if r <= 2 else clamp(1 - 0.15 * dd, 0.5, 2) if r == 4 else 1
            pt = max(0, pt + round(PT[r - 1] * mult)); d = dan
            while d < len(DAN) - 1 and pt >= DAN[d + 1]: d += 1
            while d >= 3 and pt < DAN[d] - 40: d -= 1
            dan = d; at.setdefault(dan, w)
            if dan >= 10 and rnd.random() < 0.2 and rnd.random() < dist(clamp(2.5 + slope * (5 - L), 1.6, 3.4))[0]: at.setdefault(11, w)
        if 11 in at: break
    return at
print('\n【現実に近い版】 実力L=AIの強さ相当(0.5=かなり初心者 / 1.5=初心者 / 2.5=ふつう / 3.5=得意)')
for L in (0.5, 1.5, 2.5, 3.5):
    res = {d: [sim2(L, s).get(d, 999) for s in range(30)] for d in (3, 5, 7, 9, 10, 11)}
    print('L=%.1f' % L, {(NAMES + ['永世名人'])[d]: ('%d週(%.1fか月)' % (st.median(res[d]), st.median(res[d]) / 4.33) if st.median(res[d]) < 400 else '400週超') for d in (3, 5, 7, 9, 10, 11)})
