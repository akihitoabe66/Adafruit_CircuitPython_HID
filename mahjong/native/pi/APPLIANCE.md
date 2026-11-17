# コンセントを入れるだけで遊べる設計(シニア向け)

目標: 電源を入れる → 「ゲーム起動中」だけが見える → ゲーム。 急にコンセントを抜いても壊れない。 終了すると「終了の準備中」→「コンセントを抜いてください」。 コマンドの文字は 一切見せない。

## しくみ
- **文字を隠す**: `cmdline.txt` に `quiet loglevel=0 console=tty3 ...`、`config.txt` に `disable_splash=1`。 OSが立ち上がってすぐ、`mj-splash.service`(fbi)が「ゲーム起動中」の絵(`native/pi/splash/booting.png`)を出す。
- **自動起動**: ログイン直後に `native/pi/kiosk.sh`(`exec` なので、ゲームが終わってもコマンドの画面には戻らない)。
- **急に抜いても大丈夫**: OSを読みとり専用(overlayfs)にする。 セーブ(`save.json`・`save_*.json`・`stall.log` など)は、SDカードの boot の `mjdata`(Windowsからも見える所)に書く(環境変数 `MJ_DATA` を kiosk.sh が設定)。 書くときは「別名に書いてから名前を変える」+ 世代つき(save_N.json)。 boot は `flush` つきでマウント。
- **終了**: ゲームの「終了」→ `終了の準備中です`(sync・boot を書きこみ禁止にする)→ `コンセントを抜いてください`。 そこで止まる(コマンドには戻らない)。 そのあと抜けば、いつでも安全。
- 普段は終了しなくても、急に抜いて大丈夫(OSは読みとり専用、セーブは別名書き→置きかえ)。 ただし ゲームの途中の局は、セーブされた所までしか 戻らない。

## 手順(ラズパイで)
```
cd ~/Adafruit_CircuitPython_HID/mahjong && git pull
cd native/app && sh build.sh && cd ../..          # main.c を変えたので、ビルドが必要
sh native/pi/appliance_on.sh                      # 第1段階
sudo reboot
```
再起動して、文字が出ずに「ゲーム起動中」→ゲームになり、終了すると「抜いてください」になるのを確かめる。 よければ第2段階:
```
sh native/pi/readonly_on.sh
sudo reboot
```
## ゲームを更新したい(読みとり専用のままでOK)
1. ゲーム中に **Ctrl+Q**(キーボード)→ 「更新・保守用の画面」(コマンド画面)になる。 メニューの「終了」は、抜く画面になる(区別されます)。
2. `sh ~/Adafruit_CircuitPython_HID/mahjong/native/pi/update.sh` → 読みとり専用の元のディスクを いっとき書きこみ可にして `git pull` → 自動で再起動(5秒後)。
   (読みとり専用でないときは、ふつうの `git pull` をして再起動)
- main.c を変えた更新のときは、ビルドも要る: 先に `sh native/pi/readonly_off.sh && sudo reboot` で読みとり専用をやめて、`cd native/app && sh build.sh`、そのあと `sh native/pi/readonly_on.sh && sudo reboot`。
- 常にコマンド画面にしておきたいとき(開発): `touch /boot/firmware/mjdata/DEV`

## 元に戻す
```
sh native/pi/readonly_off.sh && sudo reboot
sh native/pi/appliance_off.sh && sudo reboot
```
