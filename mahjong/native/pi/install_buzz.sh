#!/bin/sh
# 小型スピーカー(ブザー)の合図を入れる。  使い方: sudo sh install_buzz.sh   (つなぎかたは mjbuzz.py の 先頭)
set -e
[ "$(id -u)" = 0 ] || { echo "sudo を付けて実行してください: sudo sh install_buzz.sh"; exit 1; }
cd "$(dirname "$0")"
CFG=/boot/config.txt; [ -f /boot/firmware/config.txt ] && CFG=/boot/firmware/config.txt
if [ "$1" = "remove" ]; then
  systemctl disable --now mjbuzz.service 2>/dev/null || true
  rm -f /etc/systemd/system/mjbuzz.service /usr/local/bin/mjbuzz.py; sed -i '/^dtoverlay=pwm,pin=18/d' "$CFG"
  systemctl daemon-reload; echo "取り除きました(再起動すると 完全に もどります)"; exit 0
fi
grep -q '^dtoverlay=pwm,pin=18' "$CFG" || echo 'dtoverlay=pwm,pin=18,func=2' >> "$CFG"   # GPIO18 を PWM に
install -m 755 mjbuzz.py /usr/local/bin/mjbuzz.py
install -m 755 mjoled.py /usr/local/bin/mjoled.py   # 熱・電源の判定(health)を 同じ部品から 使う
[ -f /etc/default/mjbuzz ] || printf '# 合図の設定(必要なものだけ、行頭の # を外す)\n#MJBUZZ=0\n#MJBUZZ_TYPE=piezo   # 圧電=piezo(標準) / 電磁式=coil\n#MJBUZZ_DUTY=50\n' > /etc/default/mjbuzz
cat > /etc/systemd/system/mjbuzz.service <<'UNIT'
[Unit]
Description=Mahjong buzzer signals
After=local-fs.target
[Service]
EnvironmentFile=-/etc/default/mjbuzz
ExecStart=/usr/bin/python3 /usr/local/bin/mjbuzz.py
Restart=always
RestartSec=3
Nice=10
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload; systemctl enable mjbuzz.service
echo "入れました。 config.txt に PWM の設定を足したので、再起動してください:  sudo reboot"
echo "確認(再起動のあと): sudo systemctl stop mjbuzz; sudo python3 /usr/local/bin/mjbuzz.py --test   (全部の合図が 鳴ります)"
