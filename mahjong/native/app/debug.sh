#!/bin/sh
# デバッグ用の起動: 高速CPU+性能の数字を出し、ログを /tmp/mj.log にも残す。  使い方: sh native/app/debug.sh
cd "$(dirname "$(readlink -f "$0")")/../.." || exit 1
[ -z "$DISPLAY" ] && [ -z "$WAYLAND_DISPLAY" ] && export SDL_VIDEODRIVER=${SDL_VIDEODRIVER:-kmsdrm}
export MJ_PERF=1 MJ_CPU=${MJ_CPU:-fast}
./native/app/mj . 2>&1 | tee /tmp/mj.log
