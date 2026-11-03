#!/bin/sh
# 麻雀を起動する(デスクトップなしのコンソールでも動く)。 Ctrl+Q で終了してターミナルに戻る。
cd "$(dirname "$0")/../.." || exit 1
# デスクトップが動いていなければ、画面に直接出す(KMSDRM)
[ -z "$DISPLAY" ] && [ -z "$WAYLAND_DISPLAY" ] && export SDL_VIDEODRIVER=${SDL_VIDEODRIVER:-kmsdrm}
./native/app/mj .
