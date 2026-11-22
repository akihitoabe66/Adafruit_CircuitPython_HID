#!/bin/bash
# 起動を速くする(使わないサービスを止める)。 いつも電源の抜き差しで 使い、Wi-Fi は 更新のときだけ という使い方向け。
#  止めるもの: ネット接続の待ち(NetworkManager-wait-online) / モデム(ModemManager) / 自動更新(apt-daily) / ファイルの点検(e2scrub_reap) / Bluetooth(パッドは I2C なので 使わない)
#  のこすもの: Wi-Fi(NetworkManager・wpa_supplicant) / ssh / avahi(mahjongpi.local) / 時計合わせ
#  使い方: sudo ./boot_slim.sh on  /  sudo ./boot_slim.sh off(もとにもどす)  /  ./boot_slim.sh show(いまの状態)
S_SVC="NetworkManager-wait-online.service ModemManager.service e2scrub_reap.service bluetooth.service"
S_TMR="apt-daily.timer apt-daily-upgrade.timer"
case "$1" in
  on)  [ "$(id -u)" = 0 ] || { echo "sudo で 実行してください"; exit 1; }
       for u in $S_SVC $S_TMR; do systemctl disable --now "$u" 2>/dev/null && echo "止めました: $u"; done
       systemctl mask apt-daily.service apt-daily-upgrade.service 2>/dev/null
       echo "つぎの起動から 速くなります。 もとにもどすとき: sudo $0 off" ;;
  off) [ "$(id -u)" = 0 ] || { echo "sudo で 実行してください"; exit 1; }
       systemctl unmask apt-daily.service apt-daily-upgrade.service 2>/dev/null
       for u in $S_SVC $S_TMR; do systemctl enable "$u" 2>/dev/null && echo "もどしました: $u"; done
       echo "つぎの起動から もとにもどります" ;;
  show) for u in $S_SVC $S_TMR; do printf '%-45s %s\n' "$u" "$(systemctl is-enabled "$u" 2>/dev/null || echo -)"; done; systemd-analyze 2>/dev/null ;;
  *) echo "使い方: sudo $0 on | off | show"; exit 1 ;;
esac
