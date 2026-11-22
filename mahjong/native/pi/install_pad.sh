#!/bin/sh
# Wii/NESクラシックのコントローラー(GPIOのI2Cにつないだもの)を、USBゲームパッドと同じに使えるようにする。
#   使い方: sudo sh install_pad.sh          (コントローラーの読みまちがいが多いときだけ: sudo sh install_pad.sh --slow)
# つなぎかた: 3.3V=物理1番 / SDA=物理3番(GPIO2) / SCL=物理5番(GPIO3) / GND=物理6番
set -e
[ "$(id -u)" = 0 ] || { echo "sudo を付けて実行してください: sudo sh install_pad.sh"; exit 1; }
cd "$(dirname "$0")"
CFG=/boot/config.txt; [ -f /boot/firmware/config.txt ] && CFG=/boot/firmware/config.txt
# I2C を使えるようにする
if command -v raspi-config >/dev/null 2>&1; then raspi-config nonint do_i2c 0 || true; fi
grep -q '^dtparam=i2c_arm=on' "$CFG" || echo 'dtparam=i2c_arm=on' >> "$CFG"
if [ "$1" = "--slow" ]; then
  sed -i '/^dtparam=i2c_arm_baudrate=/d' "$CFG"; echo 'dtparam=i2c_arm_baudrate=50000' >> "$CFG"   # 通信を少しゆっくりに(読みまちがい対策)
fi
# 必要な部品(カーネルのモジュール)を、起動のときに読みこむ
printf 'i2c-dev\nuinput\n' > /etc/modules-load.d/mjpad.conf
modprobe i2c-dev || true; modprobe uinput || true
install -m 755 mjpad.py /usr/local/bin/mjpad.py
cat > /etc/systemd/system/mjpad.service <<'UNIT'
[Unit]
Description=Mahjong Wii Classic pad (I2C to gamepad)
After=local-fs.target
[Service]
ExecStart=/usr/bin/python3 /usr/local/bin/mjpad.py
Nice=-5
Restart=always
RestartSec=2
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable mjpad.service
systemctl restart mjpad.service
sleep 1
systemctl --no-pager status mjpad.service | head -8
echo
echo "入れました。 I2C の設定を変えたので、再起動すると確実です:  sudo reboot"
echo "確認: sudo apt install -y i2c-tools evtest  のあと、  i2cdetect -y 1  で 52 と出れば、コントローラーが見えています。"
echo "      sudo evtest  で 'Mahjong Wii Classic Pad' を選ぶと、ボタンを押した様子が見えます。"
