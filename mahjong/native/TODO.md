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
- 結果→次の局の3秒待ち: BGMを開く処理(ファイル読み・1秒ぶんの解読)が本体を止めていた→別スレッドで開くよう変更(要再ビルド)。次の局への切りかわりが速いか。BGMが鳴らないときは ~/mjdata/stall.log の bgm-stream-fail を確認
- 配牌アニメーション中は、新しいBGMの読み込みを待つ(終わってから約0.3秒後に開始、最長12秒)。配牌がコマ落ちしないか確認
- 相手の番のあいだは、手牌のカーソルを出さず、方向キーも受け付けない(捨てたらカーソルは消え、自分の番はツモ牌から始まる)。違和感がないか
- CPUの思考の上限時間を3倍に(AI_BUDGET 0.4→3。自分の番の解説は0.4のまま)。CPUの番の引っかかり・待ち時間が気にならないか。長すぎるときは nui.js の MJ.AI_BUDGET を下げる
- サイコロ: 新しい転がり(img/dice の絵6+6枚・影、native/app/dicepat.js の軌道6種からランダム、跳ねる「ドッ」・ぶつかる「チャ」の音 audio/sfx/dice_hit.wav, dice_clack.wav)。再ビルド必要(main.c: imageRotTop・読み込み一覧)。実機で、コマ落ちしないか・音の大きさ/質・止まる位置が名札に近すぎないか確認。作りなおし: python3 tools/make_dice_assets.py / tools/gen_dice_sfx.py
- サイコロの1回目が飛ぶ件: 動きの時計を1コマ最大50msに・描きが安定(80ms未満のコマが5つ続く)してから転がしはじめる(最長2.5秒待ち)。まだ飛ぶなら ~/mjdata/stall.log の「dice」が true の行(何が重いか)を確認
