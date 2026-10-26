# 麻雀・ギャンブラーズ 引き継ぎメモ(v32 時点・旧)

## 場所・成果物
- リポジトリ: akihitoabe66/Adafruit_CircuitPython_HID、ブランチ `claude/mahjong-learning-game-x80rgu`、フォルダ `mahjong/`(静的 HTML/JS/CSS。`window.MJ`)
- 公開アーティファクト(新レイアウト・最新): https://claude.ai/artifact/9qYiB6WTdfVoYZx1eV4etv (Version 32)
- 旧レイアウト(復元ポイント): アーティファクト https://claude.ai/artifact/Uho6LNtCsrWCP8LL5TP4VG (Version 72) / コミット `2283d97` / タグ `restore-mahjong-v72`
- 公開手順: 作業用 `scratchpad/art2/` に `js/*.js`・`style.css`・`index.html`(`<head>/<body>`ラッパーを除き `claude:viewport-fit-sides` メタを足したもの)をコピー → Artifact publish(`url`指定、`files`で変更ファイルのみ)。他者が書いたファイルは先に read が必要。
- スクリプト読込順: tiles, rules, forms, chars, ai, coach, lessons, game, audio, yomi, sfx, banter, glossary, ui, drill, drillui, pad, main

## 画面・設計(すべて「設計座標」を画面に合わせて拡大縮小。スクロールなし・横画面固定、縦持ちは90°回転)
- 対局: 卓レイアウト 720×428 + 右ボタン列 112 幅。河は席ごとに回転、中央パネル、伏せ牌(青)、点数札、右端にツモ/リーチ/カン/ポン/チー/解説/ツール/MENU。顔・吹き出しは喋る/鳴く時だけ。
- 解説: 上から降りる横長パネル、名前ボタン(ポイント/おすすめ…)+左右の青い矢印帯。長いカードはページ分割(文字は縮めない)。
- 結果ダイアログ/練習問題の答え合わせ: 左右矢印帯、右下は「次の局へ/次の問題」、スキップ付き。
- ホーム: 5×2カードの1画面。タイトル: ボタンは背景画像の座標(フリーザの頭にかかる位置)に固定、画像読込後に表示。
- 練習問題: 832×428 の1画面、河3人横並び。
- 設定パネル: 2列スクロールなし。声は Google を除外、性別表示なし。読み上げ速度/音量、用語読み辞書 `js/yomi.js`、読み上げ中ハイライト。
- 操作: タッチ/クリック(牌は2回タッチで捨てる。「捨てる」ボタンは廃止)。パッド/リモコン/キーボードは `js/pad.js`(十字キー+A+B のみ)。
- 音: BGM 96kbps・先読み(Blob)・冒頭無音カット・音量スライダー最大0.3。

## ゲーム/AI
- ルール設定(東風/東南/1局、喰いタン、赤、一発、裏、飛び…)、CPU 5段階、`A.eff2` 2手先読み、危険度表示(現物/スジ/半スジ/無スジ)、リーチ中は★を安全牌に切替(オリ)、フリテンは待ち全体(実ルール)。
- 赤五は専用画像 `img/tiles/r4/r13/r22.png`、白は無地。

## Android / Fire TV
- `mahjong/android-app/`(Capacitor ラッパー)+ `.github/workflows/mahjong-apk.yml`。GitHub Actions でビルド(この環境ではSDK取得不可で未検証)。手順は `android-app/README.md`。

## テスト用スクリプト(scratchpad、セッション限定)
- `ovf.js`(はみ出し検査)、`padg.js/padd.js`(パッド操作)、`cch.js`(解説の収まり)、`drall.js`(練習問題)など。Playwright(`/opt/node-tools`)で実行。

## 未対応・既知
- 麻雀ノート/用語辞典/ルール設定/対戦相手選択/クレジットは、まだスクロールするレイアウト(Switch向けに1画面化が必要)。
- Fire TV/Switch 実機、iPhone 実機での最終確認は未実施。APKビルドは初回に失敗する可能性あり。
- 「リーチ?ダマ?」の用語タップは説明カード→「辞典で見る」経由(直接辞書は未)。
- パッドで解説窓に入った後の左右キーでのページ送りは未実装。
