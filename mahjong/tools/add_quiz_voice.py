#!/usr/bin/env python3
# クイズの出題の声(分野: eff def call ...)と、天下分け目の決戦のひとこと(tk_koumon / tk_ieyasu)を追加する: python3 tools/add_quiz_voice.py <wav> <分野の英字(eff def call yaku wait score push riichi keep)>
# 音量をそろえ、先頭に0.3秒の無音を入れて、audio/yk/q_<分野>.mp3 にし、manifest に v:q_<分野> で登録する
import sys, subprocess, json, re, os
w, en = sys.argv[1:3]; R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
r = subprocess.run(['ffmpeg', '-v', 'info', '-i', w, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
mv = float(re.search(r'mean_volume: (-?[\d.]+)', r).group(1))
subprocess.run(['ffmpeg', '-y', '-v', '0', '-i', w, '-af', 'volume=%sdB,alimiter=limit=0.9,adelay=300:all=1' % (-16.5 - mv), '-ar', '44100', '-ac', '1', '-b:a', '96k', os.path.join(R, 'audio/yk/%s.mp3' % (en if en.startswith('tk_') else 'q_' + en))], check=True)
mp = os.path.join(R, 'audio/yk/manifest.json'); m = json.load(open(mp)); m[('v:' + en) if en.startswith('tk_') else ('v:q_' + en)] = ('%s.mp3' % en) if en.startswith('tk_') else ('q_%s.mp3' % en); json.dump(m, open(mp, 'w'), ensure_ascii=False)
print('ok', en)
