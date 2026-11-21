#!/bin/sh
# OLED(SSD1306/SH1106)に、麻雀先生とゲームの状態を出す常駐プログラム(mjoled)を入れる。  使い方: sudo sh install_oled.sh
#   つなぎかた・設定は native/pi/OLED.md。  元に戻す: sudo sh install_oled.sh --remove
set -e
[ "$(id -u)" = 0 ] || { echo "sudo を付けて実行してください: sudo sh install_oled.sh"; exit 1; }
cd "$(dirname "$0")"
if [ "$1" = "--remove" ]; then
  systemctl disable --now mjoled.service 2>/dev/null || true
  rm -f /etc/systemd/system/mjoled.service /usr/local/bin/mjoled.py /usr/local/bin/oled_sprites.py /usr/local/bin/oled_jp.py /usr/local/bin/oled_zunda.py /usr/local/bin/oled_pet.py
  systemctl daemon-reload; echo "取り除きました"; exit 0
fi
install -m 755 mjoled.py /usr/local/bin/mjoled.py
install -m 644 oled_sprites.py /usr/local/bin/oled_sprites.py
install -m 644 oled_jp.py /usr/local/bin/oled_jp.py
install -m 644 oled_zunda.py /usr/local/bin/oled_zunda.py
install -m 644 oled_pet.py /usr/local/bin/oled_pet.py
[ -f /etc/default/mjoled ] || printf '# OLEDの設定(必要なものだけ、行頭の # を外す)\n#MJOLED_BUS=3\n#MJOLED_ADDR=0x3C\n#MJOLED_H=64\n#MJOLED_DRV=ssd1306\n#MJOLED_FLIP=1\n#MJOLED_FPS=3\n' > /etc/default/mjoled
cat > /etc/systemd/system/mjoled.service <<'UNIT'
[Unit]
Description=Mahjong OLED (sensei and game status)
DefaultDependencies=no
After=systemd-modules-load.service systemd-udevd.service local-fs.target
Before=basic.target
Conflicts=shutdown.target
[Service]
EnvironmentFile=-/etc/default/mjoled
ExecStart=/usr/bin/python3 /usr/local/bin/mjoled.py
Restart=always
RestartSec=3
Nice=19
CPUSchedulingPolicy=idle
[Install]
WantedBy=sysinit.target
UNIT
systemctl daemon-reload
systemctl disable mjoled.service 2>/dev/null || true
systemctl enable mjoled.service
systemctl restart mjoled.service
sleep 2
systemctl --no-pager status mjoled.service | head -8
echo
echo "表示が出ないとき: journalctl -u mjoled -n 20   /   ls /dev/i2c-*   /   上下左右が逆なら /etc/default/mjoled の MJOLED_FLIP=1"
