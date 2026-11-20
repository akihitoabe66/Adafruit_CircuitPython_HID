# OLED(小さな画面)に、麻雀先生とゲームの状態を出す

## つなぎかた(SSD1306 または SH1106、I2C)
| OLED | Raspberry Pi |
|---|---|
| GND | 物理6番 |
| VCC | 3.3V(物理1番) |
| SCL | GPIO22(物理15番) |
| SDA | GPIO23(物理16番) |

`config.txt` に(つないだピンに合わせて):
```
dtoverlay=i2c-gpio,bus=3,i2c_gpio_sda=23,i2c_gpio_scl=22
```
(`bus=` の数字は、空いている番号。 コントローラー(GPIO2・3)は i2c-1 を使うので、別の番号にする。 再起動後 `ls /dev/i2c-*` で出る)

## 入れかた
```
cd ~/Adafruit_CircuitPython_HID/mahjong && git pull
cd native/app && sh build.sh && cd ../..            # ゲーム側(状態を書き出す)を作りなおす
sudo sh native/pi/install_oled.sh
```
- ゲームなしで確かめる: `python3 native/pi/mjoled.py --demo`(場面を4秒ごとに見せる)
- 画面の絵を文字で見る(OLEDなしで): `python3 native/pi/mjoled.py --selftest`
- 大きさが 128x32 なら `MJOLED_H=32`、SH1106 なら `MJOLED_DRV=sh1106`、上下が逆なら `MJOLED_FLIP=1`(`/etc/default/mjoled` に書く)

## 仕組み
- ゲームが 0.4秒ごとに `/tmp/mj_oled.txt`(場面・ポーズ・フレームレートなど)を書く。 `mjoled` がそれを読んで、麻雀先生を2コマでパタパタさせ、右に数字を出す。
- 出る数字: FPS(描いた回数/秒)・DRAW(1回の平均ms)・MAX(最大ms)・KEY(ボタンを押してから画面に出るまで ms)・T(CPU温度)・L(負荷)・MEM(使用メモリ)・AUDIO(BGMが止まっているときだけ)。 いちばん上は、場面と、「RON!」「REACH!」などの知らせ。
- ゲームが止まっていると「MJ OFF」と、本体の温度・負荷・メモリを出す。
- CPUへの負担を小さくするため: 変わった所だけを送る・1秒に3コマまで・いちばん低い優先度。 I2Cはソフトウェア(GPIO)で動くので、送るあいだ だけ CPU を少し使う。 気になるときは `MJOLED_FPS=1`。
- 絵(麻雀先生18ポーズ)は `tools/ui_src/sensei_sheet.jpg` から `python3 tools/make_oled_sprites.py` で作る(`native/pi/oled_sprites.py`)。 ポーズと場面の対応は、`mjoled.py` の `POSE` と、`nui.js` の `oledState`。
