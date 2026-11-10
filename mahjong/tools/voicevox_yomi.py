#!/usr/bin/env python3
"""VOICEVOX の「画面の操作」だけで、役名・飜・点数の読み上げ(audio/yk/)を ずんだもんにする。
VOICEVOX を動かすPCには Python も ffmpeg も要らない。(つなげて mp3 にする作業は、このスクリプトを動かせるPCでやる)

【1】台本を作る(1回だけ)         python3 tools/voicevox_yomi.py txt      → tools/voicevox_yomi.txt ができる
【2】VOICEVOX で、台本を読み込んで、音声を書き出す(下の「VOICEVOXでの操作」)
【3】書き出した wav のフォルダを、取りこむ  python3 tools/voicevox_yomi.py import wavのフォルダ
      (そろっているか確かめて、音量をそろえ、audio/yk/ に mp3 として置く。--check で、確かめるだけ)

VOICEVOXでの操作:
  ① 新しいプロジェクトにする(中身を空にする。書き出しの番号が 001 から始まるように)
  ② 声(ずんだもん・ノーマルなど)を選ぶ
  ③ メニュー「ファイル」→「テキスト読み込み」で、voicevox_yomi.txt を選ぶ(1行が1つの音声になる)
  ④ 「ファイル」→「音声書き出し」(すべて)で、フォルダに書き出す。  ※ ファイル名の先頭の番号(001, 002…)が、台本の行の番号
  ⑤ その wav を入れたフォルダ(または ZIP)を、取りこむ"""
import argparse, os, re, sys, tempfile, types, wave, zipfile, json, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
YK_DIR = os.path.join(ROOT, 'audio', 'yk')
SKIP = ('x:', 'q:', 'p:')   # x:(局・本場・流局)と q:(クイズの答え)は、自分で録った声を守る。p:(勝った人の名前)は Edge版だけ


def script():
    """台本 [(キー, 読み)] を、いつも同じ順番で返す"""
    for m in ('pyopenjtalk', 'numpy'):
        if m not in sys.modules:
            try: __import__(m)
            except ImportError: sys.modules[m] = types.ModuleType(m)
    sys.path.insert(0, HERE)
    import gen_yomi_clips
    man = json.load(open(os.path.join(YK_DIR, 'manifest.json'), encoding='utf-8'))
    return [(k, t) for k, t in gen_yomi_clips.clips.items() if k in man and not k.startswith(SKIP)], man


def norm(s):
    import unicodedata
    s = unicodedata.normalize('NFKC', s)
    s = ''.join(chr(ord(c) + 0x60) if 'ぁ' <= c <= 'ゖ' else c for c in s)
    return re.sub(r'[\s、,。.!!?]', '', s)


def cmd_txt(a):
    sc, _ = script()
    out = os.path.join(HERE, 'voicevox_yomi.txt')
    open(out, 'w', encoding='utf-8').write('\n'.join(t for _, t in sc) + '\n')
    print('台本 %d 行 → %s' % (len(sc), os.path.relpath(out, ROOT)))


def wavs_in(src, tmp):
    if src.lower().endswith('.zip'):
        zipfile.ZipFile(src).extractall(tmp); src = tmp
    out = {}
    for dp, _, fs in os.walk(src):
        for f in fs:
            m = re.match(r'^(\d+)_(.*)\.wav$', f, re.I)
            if m: out[int(m.group(1))] = (os.path.join(dp, f), m.group(2))
    return out


def cmd_import(a):
    sys.path.insert(0, HERE)
    import join_parts as jp
    sc, man = script()
    with tempfile.TemporaryDirectory() as tmp:
        files = wavs_in(a.src, tmp)
        ok, bad, miss = [], [], []
        for n, (key, text) in enumerate(sc, 1):
            if n not in files: miss.append((n, key, text)); continue
            path, name = files[n]
            said = name.split('_', 1)[-1]                         # ずんだもん(ノーマル)_読み → 読み
            if norm(said) != norm(text)[:len(norm(said))] and norm(text) != norm(said): bad.append((n, key, text, said)); continue
            ok.append((n, key, text, path))
        for n, key, text in miss: print('  ✗ %03d %-14s ない(台本: %s)' % (n, key, text))
        for n, key, text, said in bad: print('  ✗ %03d %-14s 台本と ちがう(台本: %s / ファイル: %s)' % (n, key, text, said))
        print('そろっている: %d / %d' % (len(ok), len(sc)))
        if a.check: return
        os.makedirs(a.out_dir, exist_ok=True)
        for n, key, text, path in ok:
            raw = jp.pcm(path)
            jp.final_mp3(raw, os.path.join(a.out_dir, man[key]))
        print('%d 個を %s に置きました' % (len(ok), os.path.relpath(os.path.abspath(a.out_dir), ROOT)))


def main():
    ap = argparse.ArgumentParser(description='VOICEVOX の画面操作だけで、読み上げを ずんだもんにする')
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('txt', help='VOICEVOX に読み込ませる台本(txt)を作る').set_defaults(f=cmd_txt)
    p = sub.add_parser('import', help='書き出した wav を取りこむ'); p.set_defaults(f=cmd_import)
    p.add_argument('src', help='wav のフォルダ(または ZIP)'); p.add_argument('--check', action='store_true'); p.add_argument('--out-dir', default=YK_DIR)
    a = ap.parse_args(); a.f(a)


if __name__ == '__main__':
    main()
