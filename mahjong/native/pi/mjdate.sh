#!/bin/bash
# Wi-Fi につないで 時計が 合ったとき(NTP同期)に、その日付を記録する。 つながなければ 何もしない(時計がない機械なので、日付は つないだときだけ 分かる)。
#  記録: /var/lib/mjdate/dates.log (1行 = 1回: 日付 時刻 / 電源を入れてからの秒)   最後の日付: /var/lib/mjdate/last
#  使い方: sudo ./mjdate.sh install   (起動のたびに、10分だけ 時計が合うのを待って 記録する)  /  sudo ./mjdate.sh remove  /  ./mjdate.sh show
D=/var/lib/mjdate
case "$1" in
  install)
    [ "$(id -u)" = 0 ] || { echo "sudo で 実行してください"; exit 1; }
    install -m 755 "$0" /usr/local/bin/mjdate.sh; mkdir -p $D
    cat > /etc/systemd/system/mjdate.service <<'U'
[Unit]
Description=Record date when clock is synced (Wi-Fi)
After=network.target
[Service]
Type=simple
ExecStart=/usr/local/bin/mjdate.sh watch
Nice=19
[Install]
WantedBy=multi-user.target
U
    systemctl daemon-reload; systemctl enable --now mjdate.service; echo "入れました。 日付は  mjdate.sh show  で見られます" ;;
  remove) systemctl disable --now mjdate.service 2>/dev/null; rm -f /etc/systemd/system/mjdate.service /usr/local/bin/mjdate.sh; systemctl daemon-reload; echo "取り除きました(記録は $D に のこります)" ;;
  show) echo "--- 最後に 時計が合った日: $(cat $D/last 2>/dev/null || echo なし)"; tail -n 30 $D/dates.log 2>/dev/null || echo "(まだ 記録はありません。 Wi-Fi につないで 数分 まってください)" ;;
  watch)
    mkdir -p $D
    for i in $(seq 1 120); do   # 5秒おき × 120 = 10分
      if [ "$(timedatectl show -p NTPSynchronized --value 2>/dev/null)" = yes ]; then
        up=$(cut -d. -f1 /proc/uptime); d=$(date '+%Y-%m-%d %H:%M')
        echo "$d  (電源を入れて ${up}秒後)" >> $D/dates.log; echo "$d" > $D/last; sync; exit 0
      fi
      sleep 5
    done ;;
  *) echo "使い方: mjdate.sh install | remove | show"; exit 1 ;;
esac
