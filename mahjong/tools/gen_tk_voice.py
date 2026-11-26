"""天下分け目の決戦のひとこと(水戸黄門 tk_koumon / 徳川家康 tk_ieyasu)を、掛け声と同じ作りかた(Open JTalk の Mei を 男性らしく低く)で 作る。
使い方: python3 tools/gen_tk_voice.py   (pyopenjtalk と ffmpeg が必要。できた wav は tools/quiz_src/ に置き、tools/add_quiz_voice.py で 取り込む)
自分で録音した声に 差しかえるときは、同じ名前の wav を tools/quiz_src/ に置いて、add_quiz_voice.py を 実行する。"""
import os, subprocess, tempfile, wave
import numpy as np
import pyopenjtalk
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
# 名前: (文1, 文2, 速さ, 合成の高さ(半音), 男性らしさの比率。gen_voice.py の 水戸黄門(1)・徳川家康(7)と 同じ)
LINES = {
    'tk_koumon': ('いざ、尋常に勝負じゃ!', '天下分け目の一戦、手加減は無用じゃぞ。', 1.08, -6, 0.82),
    'tk_ieyasu': ('相手にとって不足なし!', '鳴くまで待とう、勝負の時を。', 1.06, -7, 0.80),
}
for name, (a, b, spd, ht, ratio) in LINES.items():
    parts = []
    for t in (a, b):
        x, sr = pyopenjtalk.tts(t, speed=spd, half_tone=ht)
        parts.append(x.astype(np.float32) / 32768.0); parts.append(np.zeros(int(sr * 0.35), dtype=np.float32))   # 文のあいだに 少し 間
    x = np.concatenate(parts[:-1])
    with tempfile.TemporaryDirectory() as d:
        w0 = os.path.join(d, 'a.wav')
        with wave.open(w0, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
        f = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse'
        if ratio != 1.0: f = 'asetrate=%d,aresample=%d,atempo=%.4f,' % (int(sr * ratio), sr, 1 / ratio) + f
        dst = os.path.join(R, 'tools', 'quiz_src', name + '.wav')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', w0, '-af', f + ',loudnorm=I=-17:TP=-1.5:LRA=7', '-ar', '44100', '-ac', '1', dst], check=True)
    print(name, 'ok')
