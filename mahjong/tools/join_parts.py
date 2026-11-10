#!/usr/bin/env python3
"""バラバラの短い wav(「トン」「イッ」「キョク」「ヨン」「ホン」「バ」など)をつなげて、読み上げの音声(audio/yk/)を作る。
  ・どの部品が足りないかを、まず教えてくれる:   python3 tools/join_parts.py フォルダ --check
  ・そろっているものだけ、つなげて作る:           python3 tools/join_parts.py フォルダ
  ・間(ま)の長さ:  --gap 0.03(秒)   ・出力先を変える: --out-dir 別のフォルダ

部品の名前は、ファイル名から読み取る。次のどれでも よい:
   トン.wav                             そのまま
   021_ずんだもん(ノーマル)_トン.wav     VOICEVOX の書き出しの名前(いちばん後ろの「_」のあとが読み)
   ひらがなでも よい(「いっ.wav」は「イッ」として読む)
「ヨンキョク.wav」のように、ひとことまるごとの wav があれば、それを優先して使う。
数字だけの名前(「2.wav」など)は、読みが決められないので 使えない。カタカナで名前をつけてほしい。"""
import argparse, json, os, re, subprocess, sys, tempfile, unicodedata, wave

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
YK_DIR = os.path.join(ROOT, 'audio', 'yk')

# つなぎかた(キー → 部品の並び)。キーは audio/yk/manifest.json の名前
RECIPES = {
    'x:トン': ['トン'], 'x:ナン': ['ナン'], 'x:シャー': ['シャー'], 'x:ペー': ['ペー'],
    'x:イッキョク': ['イッ', 'キョク'], 'x:ニキョク': ['ニ', 'キョク'], 'x:サンキョク': ['サン', 'キョク'], 'x:ヨンキョク': ['ヨン', 'キョク'],
    'x:イッポンバ': ['イッ', 'ポン', 'バ'], 'x:ニホンバ': ['ニ', 'ホン', 'バ'], 'x:サンボンバ': ['サン', 'ボン', 'バ'], 'x:ヨンホンバ': ['ヨン', 'ホン', 'バ'],
    'x:ゴホンバ': ['ゴ', 'ホン', 'バ'], 'x:ロッポンバ': ['ロッ', 'ポン', 'バ'], 'x:ナナホンバ': ['ナナ', 'ホン', 'バ'], 'x:ハッポンバ': ['ハッ', 'ポン', 'バ'],
    'x:キュウホンバ': ['キュウ', 'ホン', 'バ'], 'x:オーラス': ['オーラス'],
}
# ゲームで使うもの(使わない 'x:シャー' 'x:ペー' は、なくてもよい)
OPTIONAL = {'x:シャー', 'x:ペー'}
# 1語まるごとの声(クイズの答え合わせ。ゲームの音声の名前(キー)へ)
RECIPES.update({'x:ジュッポンバ': ['ジュッポンバ'], 'x:ジュウ': ['ジュウ'], 'x:りゅうきょく': ['リュウキョク'], 'x:テンパイ': ['テンパイ'], 'x:ノーテン': ['ノーテン'], 'q:正解': ['セイカイ'], 'q:不正解': ['ハズレ'], 'q:おしい': ['オシイ']})
# あなたの掛け声(audio/voice/ に置く)
VOICE = {'0_riichi.mp3': 'リーチ', '0_pon.mp3': 'ポン', '0_chi.mp3': 'チー', '0_kan.mp3': 'カン', '0_ron.mp3': 'ロン', '0_tsumo.mp3': 'ツモ', 'intro_w2.mp3': 'ショウブ'}
# ファイル名の言いかえ(漢字・数字など → 部品の名前)。数字は、麻雀の読みで
ALIAS = {'1本場': 'イッポンバ', '2本場': 'ニホンバ', '3本場': 'サンボンバ', '4本場': 'ヨンホンバ', '5本場': 'ゴホンバ', '6本場': 'ロッポンバ', '7本場': 'ナナホンバ', '8本場': 'ハッポンバ', '9本場': 'キュウホンバ', '10本場': 'ジュッポンバ', '一局': 'イッキョク', 'ニ局': 'ニキョク', '二局': 'ニキョク', '三局': 'サンキョク', '四局': 'ヨンキョク', '局': 'キョク', '勝負': 'ショウブ', '正解': 'セイカイ', '外れ': 'ハズレ', '外レ': 'ハズレ', 'ハズレ': 'ハズレ', 'ペイ': 'ペー',
         '1': 'イッ', '2': 'ニ', '3': 'サン', '4': 'ヨン', '5': 'ゴ', '6': 'ロク', '7': 'ナナ', '8': 'ハチ', '9': 'キュウ', 'ポン': 'ポン'}
# 音量(自動): 声のある部分の平均の大きさ(RMS)を、ぜんぶ同じ TARGET_DB にそろえる。
# いきなり大きく出る破裂音(ぱ・ぼ)は、やさしく押さえて(コンプレッサー)、割れないように(リミッター)する。出来上がりを測って、ずれていたら やり直す
TARGET_DB = -16.0
COMP = 'acompressor=threshold=-18dB:ratio=3:attack=4:release=60:makeup=1'
LIMIT = 'alimiter=limit=0.89:attack=2:release=40'
TAIL = 'lowpass=f=9000,afade=t=in:d=0.004,areverse,afade=t=in:d=0.03,areverse'
TRIM = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse'


def norm(s):  # ひらがな → カタカナ、全角半角をそろえ、空白・読点を消す
    s = unicodedata.normalize('NFKC', s)
    s = ''.join(chr(ord(c) + 0x60) if 'ぁ' <= c <= 'ゖ' else c for c in s)
    return re.sub(r'[\s、,。.!!?]', '', s)


def part_name(fn):
    stem = os.path.splitext(fn)[0]
    if re.match(r'^\d+_', stem):
        stem = stem.split('_', 2)[-1]          # 021_ずんだもん(ノーマル)_トン → トン
    m = re.match(r'^(.*?)[(（](.+?)[)）]$', stem)    # 本(ぽん) → ぽん / 6(ろっ) → ろっ : かっこの中が読み
    if m: stem = m.group(2)
    n = norm(stem)
    return ALIAS.get(n, n)


def load_parts(folder):
    parts, bad = {}, []
    for fn in sorted(os.listdir(folder)):
        if not fn.lower().endswith('.wav'): continue
        n = part_name(fn)
        if not n or re.fullmatch(r'[0-9A-Za-z_]+', n): bad.append(fn); continue
        parts.setdefault(n, os.path.join(folder, fn))
    return parts, bad


def pcm(path, rate=24000):  # 短い無音を切って、同じ形(24kHz・モノラル・16bit)にそろえる
    r = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-af', TRIM, '-ar', str(rate), '-ac', '1', '-f', 's16le', '-'], capture_output=True, check=True)
    return r.stdout


def rms_db(data):
    """声のある部分(いちばん大きいところの 1/10 以上)の平均の大きさ(dBFS)"""
    import array, math
    x = array.array('h'); x.frombytes(data)
    if len(x) < 480: return -90.0
    win = 480; env = [math.sqrt(sum(v * v for v in x[i:i + win]) / win) for i in range(0, len(x) - win + 1, win)]
    top = max(env) or 1.0; act = [e * e for e in env if e > top * 0.1]
    return 20 * math.log10((math.sqrt(sum(act) / max(1, len(act))) / 32768) or 1e-6)


def final_mp3(raw, dst, target_db=None, rate=24000):
    """24kHz・16bit・モノラルの音(raw)を、音量をそろえて mp3 にする。出来上がりを測って、ずれていたら やり直す"""
    target_db = TARGET_DB if target_db is None else target_db
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with tempfile.TemporaryDirectory() as d:
        w = os.path.join(d, 'a.wav'); f = wave.open(w, 'wb'); f.setnchannels(1); f.setsampwidth(2); f.setframerate(rate); f.writeframes(raw); f.close()
        comp = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', w, '-af', COMP, '-ar', str(rate), '-ac', '1', '-f', 's16le', '-'], capture_output=True, check=True).stdout
        gain = target_db - rms_db(comp)
        for _ in range(4):
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', w, '-af', '%s,volume=%.2fdB,%s,%s' % (COMP, gain, LIMIT, TAIL), '-ar', '44100', '-ac', '1', '-b:a', '96k', dst], check=True)
            got = rms_db(subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', dst, '-ar', str(rate), '-ac', '1', '-f', 's16le', '-'], capture_output=True, check=True).stdout)
            if abs(got - target_db) <= 0.6: break
            gain += target_db - got


def build(seq, parts, dst, gap):
    rate = 24000; sil = b'\x00\x00' * int(rate * gap); data = b''
    for i, p in enumerate(seq):
        if i: data += sil
        data += pcm(parts[p], rate)
    final_mp3(data, dst, TARGET_DB, rate)


def main():
    ap = argparse.ArgumentParser(description='バラバラの wav をつなげて、読み上げの音声を作る')
    ap.add_argument('folder', help='部品の wav が入っているフォルダ')
    ap.add_argument('--check', action='store_true', help='足りない部品を教えるだけ(何も作らない)')
    ap.add_argument('--gap', type=float, default=0.03, help='部品のあいだの間(秒)')
    ap.add_argument('--out-dir', default=YK_DIR, help='読み上げの出力先(ふつうは audio/yk)')
    ap.add_argument('--voice-dir', default=os.path.join(ROOT, 'audio', 'voice'), help='掛け声の出力先(ふつうは audio/voice)')
    a = ap.parse_args()
    parts, bad = load_parts(a.folder)
    manifest = json.load(open(os.path.join(YK_DIR, 'manifest.json'), encoding='utf-8'))
    print('部品 %d 個を 読み取りました: %s' % (len(parts), ' '.join(sorted(parts))))
    for fn in bad: print('  ?? 読みが決められません(カタカナの名前にしてください): %s' % fn)
    vtodo = [(f, p) for f, p in VOICE.items() if p in parts]
    for f, p in VOICE.items():
        if p not in parts: print('  (掛け声) %s に必要: %s' % (f, p))
    todo, miss = [], {}
    for key, seq in RECIPES.items():
        whole = norm(key.split(':', 1)[1])
        if whole in parts: todo.append((key, [whole])); continue            # まるごとの wav があれば それを使う
        lack = [p for p in seq if p not in parts]
        if lack:
            if key not in OPTIONAL: miss[key] = lack
        else: todo.append((key, seq))
    print('\n掛け声(audio/voice): %d 個  %s' % (len(vtodo), ' '.join(f for f, _ in vtodo)))
    print('つなげて作れるもの(audio/yk): %d 個' % len(todo))
    for key, seq in todo: print('  %-14s = %s' % (key, ' + '.join(seq)))
    need = sorted({p for lack in miss.values() for p in lack}, key=lambda x: (len(x), x))
    print('\n足りない部品: %s' % (' '.join(need) if need else 'なし(全部そろっています)'))
    for key, lack in miss.items(): print('  %-14s に必要: %s' % (key, ' '.join(lack)))
    if a.check: return
    for f, p in vtodo: build([p], parts, os.path.join(a.voice_dir, f), a.gap)
    for key, seq in todo:
        dst = os.path.join(a.out_dir, manifest.get(key, key.replace(':', '_') + '.mp3'))
        build(seq, parts, dst, a.gap)
    print('\n掛け声 %d 個・読み上げ %d 個 作りました' % (len(vtodo), len(todo)))


if __name__ == '__main__':
    main()
