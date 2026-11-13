# 自宅の実機(Raspberry Pi Zero W)でやること(出先ではできないので、メモ)
- [ ] フォントを入れる(宣言の太字を、きれいな本物の太字にするため): `sudo apt update && sudo apt install -y fonts-noto-cjk` → ゲームを起動して、文字の見た目(字の太さ・大きさ)を確認する。変えるかどうかは、確認してから決める。
- [ ] `git pull origin claude/vibrant-gates-hmjh7h` → `cd mahjong/native/app && sh build.sh`(FFmpeg の開発ファイルが要る。`sudo apt update` のあとに `sudo apt install -y libavcodec-dev libavformat-dev libswscale-dev libswresample-dev libavutil-dev`)
- [ ] 動画を軽い形に作り直して(AviUtl など。README の「動画を、ラズパイで らくに再生できる形に作り直す」)、boot の `mjdata/video` に入れる → `./mj ../.. --vtest /boot/firmware/mjdata/video/01.mp4` で、2〜3倍以上を確認する。
- [ ] カクつき(BGMが切れる)の調査: 遊んだあとに `cat ~/mjdata/stall.log` を見せる(どの場面で止まったかが分かる)。
- [ ] パッドの写真を撮って、遊び方の1ページ目(ボタンの使い方)の絵を、写真に差し替える。
- [ ] 顔の左右反転・「勝負!」の声と文字の同時性・牌の見た目を、実機で確認する。

## ゲーム中のカーソル(実機で確認)
- 牌の絵を 手牌44x58・河26x33 にあらかじめ縮小(img/t44, img/t26)。手牌を動かしたとき、前より軽いか
- 安全牌の印は 1コマ2種類ずつ計算(自分の番のはじめの引っかかりが減ったか)
- `sh native/app/build.sh` で作りなおしが必要(main.cの読みこみ一覧を変更)
- 長押しの速さを、描く速さに合わせた(95〜220ms)。ゲーム中に長押しして、牌がつかえず動くか
- build.sh を -O3(Pi Zero Wでは ARM向けフラグつき)に。QuickJSも作りなおされる(obj を消して `sh build.sh`)。動作・速さを確認
- 起動後にタイトルから起動中の画面へ戻る不具合: -O3/ARM向けを戻して(-O2)、落ちたときは ~/mjdata/crash.log に書くようにした。再現したら crash.log と stall.log を見る
- 起動後にタイトルが消える不具合の原因: ホームの先読み描き(homeWarm)が、描き先を画面でなく途中の絵に残していた→layerEndで元の描き先に戻すよう修正。要:再ビルド(main.c)。進捗バーの太さも同じビルドで反映
