"""上がったときの「役・点数の読み上げ」用の音声(audio/yk/*.mp3 と manifest.json)を作る。
端末の音声合成(Web Speech)は、AirPlayでテレビに映していても音が手元のスマホから出てしまうため、
BGM・効果音・掛け声と同じ経路(WebAudio)で鳴らせるよう、あらかじめ録音しておく。
HTS Voice "Mei"(CC BY 3.0)を Open JTalk(pyopenjtalk)で合成する。使い方: python3 tools/gen_yomi_clips.py"""
import json, os, subprocess, tempfile, wave
import numpy as np
import pyopenjtalk

OUT = os.path.join(os.path.dirname(__file__), '..', 'audio', 'yk')
clips = {}  # key -> text

YAKU = ['ツモ', 'タンヤオ', 'ピンフ', 'イーペーコー', 'リャンペーコー', 'チートイツ', 'トイトイ', 'サンアンコー', 'サンショク', 'サンショクドウコー', 'イッツー', 'チャンタ', 'ジュンチャン', 'ホンイツ', 'チンイツ', 'ショウサンゲン', 'ダイサンゲン', 'コクシムソウ', 'スーアンコー', 'リンシャンカイホー', 'ハイテイ', 'ホーテイ', 'ホンロートー', 'チンロートー', 'スーカンツ', 'サンカンツ', 'リューイーソー', 'ツーイーソー', 'ショウスーシー', 'ダイスーシー', 'チューレンポートー', 'テンホー', 'チーホー', 'ダブルリーチ', 'リーチ', 'イッパツ', 'チャンカン', 'ヤクハイ', 'ハク', 'ハツ', 'チュン', 'トン', 'ナン', 'シャー', 'ペー', 'バフウ', 'ジフウ', 'ドラ', 'アカドラ', 'ウラドラ', 'ロン', 'ツモ']
for t in YAKU:
    clips['y:' + t] = t
NUM = ['いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう', 'じゅう', 'じゅういち', 'じゅうに', 'じゅうさん']
for i, t in enumerate(NUM, 1):
    clips[f'n:{i}'] = t
NAMES = {0: 'あなた', 1: 'ミトコーモン', 2: 'トオヤマノキンサン', 3: 'オーオカエチゼン', 4: 'ネズミコゾー', 5: 'オダノブナガ', 6: 'トヨトミヒデヨシ', 7: 'トクガワイエヤス', 8: 'タケダシンゲン', 9: 'サカモトリョーマ', 10: 'サイゴータカモリ', 11: 'ヒジカタトシゾー', 12: 'カツカイシュー', 13: 'ムラサキシキブ', 14: 'シズカゴゼン', 15: 'ヨーキヒ', 16: 'クレオパトラ', 17: 'ショートクタイシ', 18: 'タイラノキヨモリ', 19: 'ダテマサムネ'}
for i, t in NAMES.items():
    clips[f'p:{i}'] = t + 'の'
MAN = ['いちまん', 'にまん', 'さんまん', 'よんまん']
SEN = ['せん', 'にせん', 'さんぜん', 'よんせん', 'ごせん', 'ろくせん', 'ななせん', 'はっせん', 'きゅうせん']
HYAKU = ['ひゃく', 'にひゃく', 'さんびゃく', 'よんひゃく', 'ごひゃく', 'ろっぴゃく', 'ななひゃく', 'はっぴゃく', 'きゅうひゃく']
for i, t in enumerate(MAN, 1): clips[f'm:{i}'] = t
for i, t in {5: 'ごまん', 6: 'ろくまん', 7: 'ななまん', 8: 'はちまん', 9: 'きゅうまん', 10: 'じゅうまん', 11: 'じゅういちまん', 12: 'じゅうにまん', 13: 'じゅうさんまん', 14: 'じゅうよんまん', 15: 'じゅうごまん'}.items(): clips[f'm:{i}'] = t  # ダブル役満などの大きな点数
for i, t in enumerate(SEN, 1): clips[f'k:{i}'] = t
for i, t in enumerate(HYAKU, 1): clips[f'h:{i}'] = t
for k, v in {'満貫': 'まんがん', '跳満': 'はねまん', '倍満': 'ばいまん', '三倍満': 'さんばいまん', '役満': 'やくまん', '数え役満': 'かぞえやくまん', '2倍役満': 'ダブルやくまん', '3倍役満': 'トリプルやくまん'}.items(): clips['l:' + k] = v  # 満貫などの名前
clips['pt'] = 'てん'
clips['pt_all'] = 'てんオール'


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for n, (key, text) in enumerate(clips.items()):
        x, sr = pyopenjtalk.tts(text, speed=1.0, half_tone=0)
        fn = f'c{n:03d}.mp3'
        with tempfile.TemporaryDirectory() as d:
            a = os.path.join(d, 'a.wav')
            with wave.open(a, 'wb') as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(x.astype(np.int16).tobytes())
            f = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,loudnorm=I=-17:TP=-1.5:LRA=7'
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', a, '-af', f, '-ar', '44100', '-ac', '1', '-b:a', '56k', os.path.join(OUT, fn)], check=True)
        manifest[key] = fn
    with open(os.path.join(OUT, 'manifest.json'), 'w') as fp:
        json.dump(manifest, fp, ensure_ascii=False)
    print(len(manifest), 'clips')


if __name__ == '__main__':
    main()
