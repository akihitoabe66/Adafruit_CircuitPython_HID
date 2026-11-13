#!/bin/sh
# 外付けLEDを「電源ランプ兼アクセスランプ」にする(config.txt を書きかえる)。
# 使い方:  sudo sh native/pi/led_power.sh [GPIO番号(はじめは17=ピン11)]
#         元にもどす:  sudo sh native/pi/led_power.sh off
# 動き: ファームウェア起動(通電の約1〜2秒後)から点灯 → OS起動後も点灯のまま → SDカードにアクセスがあると消えて点滅
# 配線: GPIO番号のピン → 抵抗(330Ω〜1kΩ) → LED → GND(LEDの向きは、プラスがGPIO側)
set -e
[ "$(id -u)" = 0 ] || { echo "sudo をつけて 実行してください"; exit 1; }
CF=/boot/firmware/config.txt; [ -f "$CF" ] || CF=/boot/config.txt
[ -f "$CF" ] || { echo "config.txt が見つかりません"; exit 1; }
B='# >>> mj-led'; E='# <<< mj-led'
cp -n "$CF" "$CF.mj-led.bak" 2>/dev/null || true
# 前に書いた分があれば、消す
sed -i "/^$B/,/^$E/d" "$CF"
if [ "$1" = off ]; then echo "もとにもどしました($CF)"; exit 0; fi
N=${1:-17}
cat >> "$CF" <<EOT
$B
gpio=$N=op,dh
dtparam=act_led_gpio=$N
dtparam=act_led_activelow=on
dtparam=act_led_trigger=mmc0
$E
EOT
echo "GPIO$N を 電源+アクセスランプにしました($CF)。 再起動すると 有効になります。 バックアップ: $CF.mj-led.bak"
