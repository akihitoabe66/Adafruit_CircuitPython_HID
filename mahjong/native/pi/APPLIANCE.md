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

## コントローラーの設定(mjpad)
- パッドの種類は、ID で見分ける(無線の受信機=クラシックコントローラーPro は ID の先頭が `01`)。 無線: 1秒に200回読み、読みまちがいよけ 約5ms、押しを100msのばす。 有線: 1秒に50回、よけ 約50ms、のばさない。 斜めは(この麻雀ゲームは使わないので)約120ms 様子を見て、横か縦の1方向に落とす(どちらのパッドでも)。 設定は 時間(ミリ秒)で決めるので、読む回数を変えても 効き目は変わらない。 差しかえるたびに ID を見て 切りかわる。
- 強制するとき: `MJPAD_PROFILE=wireless|wired`、 個別に `MJPAD_HZ` `MJPAD_DEBOUNCE_MS` `MJPAD_DIAG_MS` `MJPAD_HOLD`(ms)。 `sudo systemctl edit mjpad` の `[Service]` に `Environment=...` を書く。
- 起動して10分のあいだ、1分ごとに `journalctl -u mjpad` に `cpu x.x%` が出る(負担の確認)。

## 小型スピーカー(ブザー)の合図(任意)
- `native/pi/install_buzz.sh` で入れる(つなぎかたは `mjbuzz.py` の先頭): GPIO18 → 1kΩ → トランジスタのベース、エミッタ=GND、コレクタ → スピーカー(直列に 47〜100Ω)→ 3.3V。 スピーカーの両端に ダイオード(1N4148)。 先に テスターで スピーカーの抵抗を 測る(数Ω〜数十Ω なら 電磁式、 ほぼ無限大なら ピエゾ)。
- 合図: 起動完了(タイトルが出た)=上がるチャイム / ゲーム終了=ピン・ポン(電源を抜いてよい) / 熱・電源の注意=ピッピッピッ(90秒おき) / 危険=高く速い音(6秒おき)。 `/etc/default/mjbuzz` で `MJBUZZ=0`(鳴らさない)、 `MJBUZZ_DUTY`(音の大きさ 1〜50)。
