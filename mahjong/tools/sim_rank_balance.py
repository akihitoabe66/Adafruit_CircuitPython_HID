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
PT = [15, 8, 3, -5]
clamp = lambda v, a, b: max(a, min(b, v))
def sim(p, seed, weeks=200):
    rnd = random.Random(seed); pt = 0; dan = 0; at = {}
    for w in range(1, weeks + 1):
        for _ in range(GPW):
            pool = [c for c in chars if c['unlock'] <= dan]; op = rnd.sample(pool, 3) if len(pool) >= 3 else pool
            dd = sum(c['level'] for c in op) / len(op) - (1 + 0.8 * dan); r = rnd.choices([1, 2, 3, 4], p)[0]
            mult = clamp(1 + 0.15 * dd, 0.5, 2) if r <= 2 else clamp(1 - 0.15 * dd, 0.5, 2) if r == 4 else 1
            pt = max(0, pt + round(PT[r - 1] * mult)); d = dan
            while d < len(DAN) - 1 and pt >= DAN[d + 1]: d += 1
            while d >= 3 and pt < DAN[d] - 40: d -= 1
            dan = d; at.setdefault(dan, w)
        if dan >= 10: break
    return at
print('段位の表(必要な累計点):', dict(zip(NAMES, DAN[:11])), ' 週に', GPW, '局(東風戦)')
for label, p in (('弱め(1位22/2位26/3位27/4位25%)', [.22, .26, .27, .25]), ('ふつう(27/28/25/20%)', [.27, .28, .25, .20]), ('強め(33/30/22/15%)', [.33, .30, .22, .15])):
    res = {d: [sim(p, s).get(d, 999) for s in range(40)] for d in range(1, 11)}
    print(label, {NAMES[d]: int(st.median(res[d])) for d in (1, 3, 5, 7, 9, 10)})
