#!/usr/bin/env python3
"""VOICEVOX(ずんだもんなど)で、ゲームの音声を一括で作る。
  ・you  : あなたの掛け声(リーチ・ポン・チー・カン・ロン・ツモ)と「勝負!」 → audio/voice/0_*.mp3 と intro_w2.mp3
  ・yomi : 役・点数・局の読み上げ 151個(tools/gen_yomi_clips.py の台本と、同じ順番・同じ名前) → audio/yk/
  ・all  : 上の両方

使い方(VOICEVOX を起動してから。エンジンは http://127.0.0.1:50021):
  python3 tools/gen_voicevox.py --list                  # 使える声(speaker)の一覧
  python3 tools/gen_voicevox.py you                     # ずんだもん(ノーマル)で、あなたの掛け声を作る
  python3 tools/gen_voicevox.py you --speaker 1         # あまあま
  python3 tools/gen_voicevox.py yomi --prefix q:        # 読み上げのうち「q:」で始まるものだけ(クイズの正解など)
  python3 tools/gen_voicevox.py all --speed 1.1 --pitch 0.02
  python3 tools/gen_voicevox.py you --dry               # 台本だけ見る(何も作らない)
必要なもの: Python 3 と ffmpeg だけ(追加のライブラリは不要)。
クレジット表記: 「VOICEVOX:ずんだもん」(ゲームの 設定 → クレジット に入れてあります)。 VOICEVOXと各キャラクターの利用規約を確認してください。"""
import argparse, json, os, subprocess, sys, tempfile, types, urllib.error, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
VOICE_DIR = os.path.join(ROOT, 'audio', 'voice')
YK_DIR = os.path.join(ROOT, 'audio', 'yk')
YOU = {'riichi': 'リーチ!', 'pon': 'ポン!', 'chi': 'チー!', 'kan': 'カン!', 'ron': 'ロン!', 'tsumo': 'ツモ!'}
EXTRA = {'intro_w2': 'しょうぶ!'}  # 「勝負!」(audio/voice/intro_w2.mp3)
# 短い声を、頭と尾の無音を切り、音量をそろえ、プチッという音が出ないように小さく フェードする
FILTER = ('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,'
          'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse')


def req(url, data=None, headers=None, method=None):
    r = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as f:
            return f.read()
    except urllib.error.URLError as e:
        sys.exit('VOICEVOX につながりません(%s)。VOICEVOX を起動してから、もう一度 実行してください。\n  %s' % (url.split('?')[0], e))


def speakers(base):
    for sp in json.loads(req(base + '/speakers')):
        for st in sp['styles']:
            print('speaker=%-3d %s(%s)' % (st['id'], sp['name'], st['name']))


def synth(base, text, a):
    q = json.loads(req('%s/audio_query?%s' % (base, urllib.parse.urlencode({'text': text, 'speaker': a.speaker})), b'', method='POST'))
    q['speedScale'] = a.speed; q['pitchScale'] = a.pitch; q['intonationScale'] = a.intonation; q['volumeScale'] = 1.0
    q['prePhonemeLength'] = 0.0; q['postPhonemeLength'] = 0.05  # 頭の無音を つくらない
    return req('%s/synthesis?%s' % (base, urllib.parse.urlencode({'speaker': a.speaker})), json.dumps(q).encode('utf-8'), {'Content-Type': 'application/json'}, 'POST')


def to_mp3(wav, dst, a):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from join_parts import final_mp3  # 声の大きさを、ぜんぶ同じにそろえる(join_parts.py と同じ方法)
    if a.keep_wav:
        os.makedirs(a.keep_wav, exist_ok=True); open(os.path.join(a.keep_wav, os.path.basename(dst) + '.wav'), 'wb').write(wav)
    with tempfile.TemporaryDirectory() as d:
        w = os.path.join(d, 'a.wav'); open(w, 'wb').write(wav)
        raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', w, '-af', FILTER, '-ar', '24000', '-ac', '1', '-f', 's16le', '-'], capture_output=True, check=True).stdout
    final_mp3(raw, dst)


def yomi_clips():
    """読み上げの台本(キー → 読み)を、gen_yomi_clips.py から取り出す(あちらは pyopenjtalk が要るので、からのモジュールでだます)"""
    for m in ('pyopenjtalk', 'numpy'):
        if m not in sys.modules:
            try: __import__(m)
            except ImportError: sys.modules[m] = types.ModuleType(m)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import gen_yomi_clips
    return gen_yomi_clips.clips


def main():
    ap = argparse.ArgumentParser(description='VOICEVOX で、ゲームの音声を一括生成')
    ap.add_argument('what', nargs='?', choices=['you', 'yomi', 'all'])
    ap.add_argument('--url', default='http://127.0.0.1:50021', help='VOICEVOX エンジンの場所')
    ap.add_argument('--speaker', type=int, default=3, help='声の番号(ずんだもん ノーマル=3。--list で一覧)')
    ap.add_argument('--speed', type=float, default=1.0); ap.add_argument('--pitch', type=float, default=0.0); ap.add_argument('--intonation', type=float, default=1.1)
    ap.add_argument('--prefix', default='', help='yomi で、このキーで始まるものだけ作る(例: q:  y:  n:)')
    ap.add_argument('--no-extra', action='store_true', help='「勝負!」は作らない')
    ap.add_argument('--keep-wav', default='', help='元の wav を、このフォルダにも残す')
    ap.add_argument('--dry', action='store_true', help='台本を表示するだけ')
    ap.add_argument('--list', action='store_true', help='使える声の一覧')
    a = ap.parse_args()
    base = a.url.rstrip('/')
    if a.list:
        return speakers(base)
    if not a.what:
        ap.error('you / yomi / all のどれかを指定してください(--list で声の一覧)')
    jobs = []  # (台本, 出力先)
    if a.what in ('you', 'all'):
        for k, t in YOU.items(): jobs.append((t, os.path.join(VOICE_DIR, '0_%s.mp3' % k)))
        if not a.no_extra:
            for k, t in EXTRA.items(): jobs.append((t, os.path.join(VOICE_DIR, '%s.mp3' % k)))
    if a.what in ('yomi', 'all'):
        manifest = json.load(open(os.path.join(YK_DIR, 'manifest.json'), encoding='utf-8'))
        for key, text in yomi_clips().items():
            if key in manifest and key.startswith(a.prefix): jobs.append((text, os.path.join(YK_DIR, manifest[key])))
    for t, dst in jobs:
        print('%-18s → %s' % (t, os.path.relpath(dst, ROOT)))
        if not a.dry: to_mp3(synth(base, t, a), dst, a)
    print('%d 個%s' % (len(jobs), '(--dry: 何も作っていません)' if a.dry else ' 作りました'))


if __name__ == '__main__':
    main()
