# ネイティブ版(Raspberry Pi 用・試作)

C → SDL2 → Linux。ゲームの頭脳(js/ のルール・CPU)は QuickJS でそのまま動かし、画面は SDL2 で描きます。

## 作り方(Pi の端末で)
    cd ~/Adafruit_CircuitPython_HID && git pull
    cd mahjong/native/app && sh build.sh        # Zero W は数分
    cd ../.. && ./native/app/mj .               # 全画面(テレビ)で起動

- 試しに窓で動かす: `MJ_WINDOWED=1 ./native/app/mj .`
- 日本語フォントがない場合: `sudo apt install fonts-ipafont-gothic`
- 操作: 矢印キー(コントローラーの十字/スティック)、決定=Enter/Space/Z/ボタン、もどる=Esc/X/ボタン1
- 自動テスト: `--auto --shots /tmp/shots`(自動で最後まで打って画面を保存)
- 成績の保存先: mahjong/save.json

## 電源を入れたら自動で起動(デスクトップなし)
    sh mahjong/native/app/autostart_on.sh && sudo reboot
- 終了: **Ctrl+Q**(ターミナルに戻る)。 手で起動し直す: `sh mahjong/native/app/start.sh`
- やめる: `sh mahjong/native/app/autostart_off.sh && sudo reboot`

## 音(BGM・効果音・声)
    sudo apt install -y libsdl2-mixer-dev
    sh build.sh        # 再ビルド
- 音はテレビ(HDMI)から出ます。出ないときは `sudo raspi-config` → System Options → Audio で HDMI を選びます。
- 効果音は `audio/sfx/*.wav`(`python3 tools/gen_sfx_wav.py` で作り直せます)。
- 音なしで動かす: `MJ_NOSOUND=1 ./native/app/mj .`
- 動きの重さを測る: `MJ_PERF=1 ./native/app/mj .`(3秒ごとに「描く」「画面に出す」の時間(ms)が出ます)
