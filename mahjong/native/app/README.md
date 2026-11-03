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
