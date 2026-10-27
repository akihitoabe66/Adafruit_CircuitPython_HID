"""掛け声(audio/voice/<キャラid>_<種類>.mp3)を作る。
HTS Voice "Mei"(CC BY 3.0)を Open JTalk(pyopenjtalk)で合成し、男性役は「声の高さと、声の太さ(響き)」を下げて男性らしくする。
使い方: python3 tools/gen_voice.py   (pyopenjtalk と ffmpeg が必要)"""
import os, subprocess, tempfile
import numpy as np
import pyopenjtalk
import wave

OUT = os.path.join(os.path.dirname(__file__), '..', 'audio', 'voice')
WORDS = {'ron': 'ロン', 'pon': 'ポン', 'chi': 'チー', 'kan': 'カン', 'riichi': 'リーチ', 'tsumo': 'ツモ'}
# キャラid: (速さ, 合成の高さ(半音), 男性らしさの比率 1.0=そのまま / 小さいほど低く太い)
VOICES = {
    1: (0.92, -6, 0.82),   # 水戸黄門: 穏やかな老人
    2: (1.08, -7, 0.78),   # 遠山の金さん: 威勢のいい江戸っ子
    3: (0.98, -6, 0.8),   # 大岡越前: 落ち着いた奉行
    4: (1.12, -6, 0.84),   # ねずみ小僧: すばしこい若者
    5: (1.0, -7, 0.76),   # 織田信長: 威圧感のある声
    6: (1.12, -5, 0.86),    # 豊臣秀吉: 陽気で明るい
    7: (0.92, -7, 0.8),   # 徳川家康: どっしり
    8: (0.96, -8, 0.74),   # 武田信玄: 重い声
    9: (1.06, -7, 0.82),   # 坂本龍馬: 若々しい
    10: (0.92, -8, 0.72),  # 西郷隆盛: 大きくて太い声
    11: (1.04, -6, 0.8),  # 土方歳三: 鋭い
    12: (0.98, -6, 0.82),  # 勝海舟: 江戸っ子
    13: (0.92, 0, 1.0),   # 紫式部: 上品でゆったり
    14: (1.04, 2, 1.0),   # 静御前: 澄んだ高い声
    15: (1.0, 1, 1.0),   # 楊貴妃: 艶やか
    16: (0.96, -2, 0.95),  # クレオパトラ: 低めで気高い
}


def synth(text, speed, ht):
    x, sr = pyopenjtalk.tts(text, speed=speed, half_tone=ht)
    x = x.astype(np.float32) / 32768.0
    return x, sr


def main():
    os.makedirs(OUT, exist_ok=True)
    for vid, (spd, ht, ratio) in VOICES.items():
        for k, text in WORDS.items():
            x, sr = synth(text, spd, ht)
            with tempfile.TemporaryDirectory() as d:
                a = os.path.join(d, 'a.wav')
                with wave.open(a, 'wb') as w:
                    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
                    w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
                # 再生の速さを変えずに、声の高さと響きを下げる(asetrate で全体を低く → atempo で元の長さへ)
                f = f'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse'
                if ratio != 1.0:
                    f = f'asetrate={int(sr * ratio)},aresample={sr},atempo={1 / ratio:.4f},' + f
                f += ',loudnorm=I=-17:TP=-1.5:LRA=7,afade=t=in:d=0.005,afade=t=out:st=0.25:d=0.03'
                dst = os.path.join(OUT, f'{vid}_{k}.mp3')
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', a, '-af', f, '-ar', '44100', '-ac', '1', '-b:a', '64k', dst], check=True)
        print('voice', vid, 'done')


if __name__ == '__main__':
    main()
