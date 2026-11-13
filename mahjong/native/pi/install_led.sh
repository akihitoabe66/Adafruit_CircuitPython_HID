#!/bin/sh
# LED(GPIO16)とファン(GPIO17)の制御を入れる。  使い方: sudo sh install_led.sh        (ファンも使うとき: sudo sh install_led.sh --fan)
set -e
[ "$(id -u)" = 0 ] || { echo "sudo を付けて実行してください: sudo sh install_led.sh"; exit 1; }
cd "$(dirname "$0")"
FAN=""; [ "$1" = "--fan" ] && FAN="--fan"
CFG=/boot/config.txt; [ -f /boot/firmware/config.txt ] && CFG=/boot/firmware/config.txt
# 前に入れた設定(カーネルがGPIO16を使ってしまい、この制御と衝突する)を取り除く。元のファイルは .bak_led に残す
cp "$CFG" "$CFG.bak_led"
sed -i '/^dtparam=act_led_/d;/^gpio=16=/d;/^dtoverlay=gpio-led/d;/^dtoverlay=gpio-fan/d' "$CFG"
install -m 755 mjled.py /usr/local/bin/mjled.py
# 通電してすぐ(ファームウェアの段階=約1〜2秒後)から GPIO16 のLEDを点灯させる。OSが起動して mjled が動くまで、点灯のまま
echo 'gpio=16=op,dh' >> "$CFG"
cat > /etc/systemd/system/mjled.service <<EOF
[Unit]
Description=Mahjong LED and fan
After=local-fs.target
[Service]
ExecStart=/usr/bin/python3 /usr/local/bin/mjled.py $FAN
Restart=always
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable mjled.service
systemctl restart mjled.service
sleep 1
systemctl --no-pager status mjled.service | head -8
echo
echo "設定を変えました(config.txtの古い行を削除)。再起動すると確実です:  sudo reboot"
