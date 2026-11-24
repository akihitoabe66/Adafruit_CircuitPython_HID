遊び方ページの絵の作り方
1. ゲームの実際の画面を撮る(tools/help/capture.js を、MJ_SCRIPT で読み込んで、ゲームを自動で進める):
     MJ_CPU=fast MJ_DATA=/tmp/x MJ_SCRIPT=tools/help/capture.js SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy MJ_WINDOWED=832x468 ./native/app/mj .
   (capture.js の __OUT__ を、出力フォルダに置きかえて使う。teacher あり/なしで、麻雀先生の画面を撮り分ける)
   撮った画面は tools/help/scenes/ に入っている(discard / react / riichi / teacher / hub)。
2. 矢印と番号を重ねる: python3 tools/help/annotate.py tools/help/scenes img/help
   (どこに何を描くかは annotate.py の PAGES に書いてある。ゲームの絵が変わったら、撮りなおして、もう一度 実行する)
