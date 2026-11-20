# ブランチの使いわけ(Zero W 版と Zero 2 W 版)

| 機械 | ブランチ | 内容 |
|---|---|---|
| Raspberry Pi **Zero W**(Zero 1) | `zero1` | 安定版。 Zero W の遅さに合わせた作り(たとえば、配牌のあいだは BGM を止める)。 Zero 2 W 向けの最適化は **入れない** |
| Raspberry Pi **Zero 2 W** | `claude/vibrant-gates-hmjh7h` | Zero 2 W 向けの最適化・実験を入れていく開発版(4コア・GPU・速いSDカードを前提にしてよい) |

## ラズパイで使うブランチ
- **Zero 2 W**(いまのまま): `cd ~/Adafruit_CircuitPython_HID && git pull`
- **Zero W**(Zero 1)を `zero1` に切りかえる(最初の1回だけ):
  ```
  cd ~/Adafruit_CircuitPython_HID
  git remote set-branches --add origin zero1     # 1つのブランチだけ取ってきた clone のとき
  git fetch origin zero1
  git checkout -B zero1 origin/zero1
  ```
  そのあとは、ふつうの `git pull` で、`zero1` だけが更新される(Zero 2 W 版は降ってこない)。
  本体(`main.c`・`video.h`)が変わった更新のときは、`cd mahjong/native/app && sh build.sh`。
- いま、どのブランチか: `git branch --show-current`

## 変更の入れかた(共通の修正を、両方に)
- **共通の修正**(バグ、セリフ、絵、画面の見た目など): まず `zero1` に入れて、`zero2` 側(`claude/vibrant-gates-hmjh7h`)へ `git merge zero1` で取りこむ。 こうすれば Zero 2 W 版は、いつも「Zero 1 版+最適化」になる。
- **Zero 2 W だけの変更**(並列の読みこみ、GPU の描画、速いテンポなど): `claude/vibrant-gates-hmjh7h` にだけ入れる。 `zero1` には入れない。
- 切りわけのめやす: 変更が Zero W で動かなくなる・遅くなるおそれがあるなら、Zero 2 W だけ。

## いま Zero 2 W だけ(`zero1` には入っていない)変更
- 対局の BGM を、雀卓が出たときからすぐに流す(配牌のあいだも止めない)。 `zero1` では、配牌のあいだ曲を止める(曲の読みこみが、配牌のアニメを止めるため)。
