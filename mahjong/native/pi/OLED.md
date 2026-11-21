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
- ゲームが 0.4秒ごとに `/dev/shm/mj_oled.txt`(場面・ポーズ・フレームレートなど)を書く。 `mjoled` がそれを読んで、麻雀先生を2コマでパタパタさせ、右に数字を出す。
- 出る数字: SPD(ゲームの速さ=1コマを描く時間から出した、描ける速さ。 画面が動かない間は 前の値のまま)・DRAW(1回の平均ms)・MAX(最大ms)・KEY(ボタンを押してから画面に出るまで ms)・T(CPU温度)・FREE(まだ使える空きメモリMB。 小さいほど あぶない)・SW(使っているスワップMB。 0 が正常)・GAME(ゲーム本体のメモリMB)・P(メモリの混みぐあい%。 0に近いのが正常)・AUDIO STOP(BGMが止まっているときだけ)。
- いちばん上(16ドット、日本語)は、場面(対局・結果・クイズ…)と、「ロン!」「リーチ!」「勝ち!」「負け」などの知らせ。 日本語は Unifont の16x16で、`python3 tools/make_oled_font.py` で作る(`native/pi/oled_jp.py`)。 出す日本語は `nui.js` の `OLED-JP-BEGIN` の中。
- ゲームが止まっていると「MJ OFF」と、本体の温度・負荷・メモリを出す。
- CPUへの負担を小さくするため: 変わった所だけを送る・1秒に3コマまで・いちばん低い優先度。 I2Cはソフトウェア(GPIO)で動くので、送るあいだ だけ CPU を少し使う。 気になるときは `MJOLED_FPS=1`。
- 絵(麻雀先生18ポーズ)は `tools/ui_src/sensei_sheet.jpg` から `python3 tools/make_oled_sprites.py` で作る(`native/pi/oled_sprites.py`)。 ポーズと場面の対応は、`mjoled.py` の `POSE` と、`nui.js` の `oledState`。

## 温度と電源の見はり(常に出る)
- 画面の4行目に、いつも「T58C PWR OK」(温度と、電源の状態)が出る。 電圧が低くなると「LOW-V!」。
- **注意**(見出しが「高温」「電圧」に ときどき かわる): 温度 75C 以上 / Pi が温度や電圧で遅くなっている / 電圧が 4.63V より低い。
- **危険**(画面が白黒に ちかちか入れかわり、麻雀先生が「電源を 切って!」): 温度 82C 以上 / 電圧が低い状態が 8秒つづく(電圧計があれば 4.6V未満が 3秒)。 すぐに ゲームを止めて 電源を切り、ようすを見る。
- 温度の目安: Pi は 80C で自分で遅くなり、85C で強く遅くなる。 ヒートシンクつきで ふつうは 50〜65C。 変えるとき: `/etc/default/mjoled` に `MJ_TEMP_WARN=70` `MJ_TEMP_DANGER=80`。
- 電圧の判定は、Pi 本体の「電圧低下」の印(vcgencmd get_throttled の bit0)を読んでいる。 **Zero 2 W には 電流を測る部品がない**ので、電流(A)・実際の電圧(V)は、下の電圧電流計(INA219)をつけたときだけ出る。
- 他のプログラムのために、状態を `/dev/shm/mj_health.txt`(level=0/1/2, temp, volt, amp, thr, why)にも書く。

## 電圧・電流計(INA219 のモジュール。 つけなくても動く)
- 電源の線(5V)の途中に入れる: 電源 +5V → モジュールの VIN+ / VIN- → Pi の 5V(物理2番か4番)。 GND は つなぎなおし。
- I2C: VCC → 3.3V(物理17番) / GND → 物理9番 / SDA → GPIO2(物理3番) / SCL → GPIO3(物理5番)。 (NES コントローラーと同じ i2c-1 を 共有。 アドレスは 0x40)
- つなぐと「T58 5.1V 0.82A」と出る。 電圧 4.75V 未満・電流 2A 超で「注意」、4.6V 未満が 3秒つづくと「危険」。
- 別の番号なら `MJINA_BUS=1` `MJINA_ADDR=0x40`(`/etc/default/mjoled`)。

## 麻雀先生とずんだもん(毎回ランダム)
- 電源を入れるたびに、OLED に出る人が、ランダムで決まる: 麻雀先生(小さい顔+数字を多め) または ずんだもん(大きい顔 64×58+数字5行)。 決まったら、そのゲームが終わるまで ずっと同じ人(起動中の画面から ゲーム中まで 同じ)。
- ゲームを終えて、もう一度はじめたとき(ホームにもどらず、アプリをやりなおしたとき)に、えらびなおす。
- 固定したいとき: `/etc/default/mjoled` に `MJOLED_CHAR=sensei`(先生だけ) / `MJOLED_CHAR=zunda`(ずんだもんだけ)。 試験: `python3 native/pi/mjoled.py --demo --zunda`
- ずんだもんの絵: `tools/ui_src/zunda_pixel16.jpg`(黒髪の16表情のうち14)から `python3 tools/make_oled_zunda.py` で作る(`native/pi/oled_zunda.py`)。 場面ごとの表情は `mjoled.py` の `ZEXPR` / `ZSCENE`。
