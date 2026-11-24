#!/usr/bin/env python3
"""録音(音声)のある地図のセリフを、かってに変えていないか調べる。 使い方: python3 tools/check_voiced_lines.py
基準: tools/voiced_lines_snapshot.json(録音をつくった文章)。 録音をとりなおして文章を変えるときだけ、この基準も書きかえる。"""
import json, os, re, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
s = open(os.path.join(ROOT, 'native/app/nui.js'), encoding='utf-8').read(); st = "const MAP_SAY_BASE = ["
i = s.index(st); j = s.index("];", i); body = re.sub(r'//[^\n]*', '', s[i + len(st):j])
cur = re.findall(r"'((?:[^'\\]|\\.)*)'", body); ref = json.load(open(os.path.join(ROOT, 'tools/voiced_lines_snapshot.json'), encoding='utf-8'))
bad = [(k, a, b) for k, (a, b) in enumerate(zip(ref, cur)) if a != b]
if len(ref) != len(cur): bad.append(('件数', len(ref), len(cur)))
for b in bad: print('ちがう:', b)
print('OK(録音のある文章は、基準のとおり)' if not bad else '→ 録音のある文章が、変わっています')
sys.exit(1 if bad else 0)
