# 麻雀・ギャンブラーズ — Android / Fire TV 用 APK

ウェブ版をそのまま Android アプリ(Capacitor)に包みます。画像・音声は APK の中に入るので、ネット接続は不要です。

## APK の作り方(GitHub で自動ビルド)
1. GitHub のリポジトリで **Actions** タブを開く(初めてなら「Enable workflows」を押す)。
2. 左の **Mahjong APK (Android / Fire TV)** → **Run workflow**。
3. 数分後、完了した実行結果ページの **Artifacts → mahjong-gamblers-apk** をダウンロード(zip の中に `app-debug.apk`)。

## Fire TV スティックに入れる
- **Downloader アプリ**で APK の URL を開く(APK をどこかに置いた場合)、または
- Fire TV の「設定 → My Fire TV → 開発者オプション」で「ADB デバッグ」と「不明なアプリのインストール」をオンにし、PC から  
  `adb connect <FireTVのIP>:5555` → `adb install app-debug.apk`
- インストール後は、ホーム画面の「アプリ」の一覧から起動できます。

## コントローラー操作
十字キー=カーソル移動 / A=決定 / B=戻る・パス(この3つだけ。リーチ・ポン・解説なども、枠を動かしてAで押します)
(最初にボタンを押すとカーソル(白い枠)が出ます。Fire TV のリモコンの十字キー・選択・戻るも同じように使えます)

## 注意
- ここで作るのはデバッグ署名の APK です(個人で入れて遊ぶ用)。ストア公開には別途リリース署名が必要です。
- この環境では Android SDK を取得できないため、ビルド自体は GitHub 側で初めて動きます。失敗したら Actions のログを見せてください。
