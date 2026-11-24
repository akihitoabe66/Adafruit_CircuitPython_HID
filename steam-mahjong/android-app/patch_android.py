#!/usr/bin/env python3
"""`npx cap add android` が作った Android プロジェクトを、横画面・Fire TV(リーン・バック)対応にする。
使い方: python3 patch_android.py <android-app ディレクトリ>"""
import re, shutil, sys, pathlib

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
app = root / 'android' / 'app' / 'src' / 'main'
man = app / 'AndroidManifest.xml'
s = man.read_text(encoding='utf-8')

# 横画面に固定(センサーで左右反転も可)
if 'screenOrientation' not in s:
    s = s.replace('<activity', '<activity\n            android:screenOrientation="sensorLandscape"', 1)
# Fire TV / Android TV のホーム画面に出す
if 'LEANBACK_LAUNCHER' not in s:
    s = re.sub(r'(<category android:name="android.intent.category.LAUNCHER" ?/>)',
               r'\1\n                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />', s, count=1)
# タッチパネルなし・リーン・バックでも入れられるように
feat = ('    <uses-feature android:name="android.software.leanback" android:required="false" />\n'
        '    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />\n'
        '    <uses-feature android:name="android.hardware.gamepad" android:required="false" />\n')
if 'android.software.leanback' not in s:
    s = s.replace('<application', feat + '    <application', 1)
# TV のホーム用バナー(320×180)
if 'android:banner' not in s:
    s = s.replace('<application', '<application\n        android:banner="@drawable/banner"', 1)
man.write_text(s, encoding='utf-8')

# バナー・アイコン・MainActivity を入れ替える
dr = app / 'res' / 'drawable'
dr.mkdir(parents=True, exist_ok=True)
shutil.copy(root / 'res' / 'banner.png', dr / 'banner.png')
java = next((app / 'java').rglob('MainActivity.java'), None)
pkg_dir = (app / 'java' / 'jp' / 'mahjong' / 'gamblers')
pkg_dir.mkdir(parents=True, exist_ok=True)
if java and java.parent != pkg_dir:
    java.unlink()
shutil.copy(root / 'MainActivity.java', pkg_dir / 'MainActivity.java')

# ランチャーアイコン(512px の画像を各解像度へ)
try:
    from PIL import Image
    ic = Image.open(root / 'res' / 'icon.png').convert('RGBA')
    for d, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
        for name in ('ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'):
            t = app / 'res' / f'mipmap-{d}' / name
            if t.exists():
                ic.resize((px, px)).save(t)
except Exception as e:  # アイコン差し替えに失敗してもビルドは続ける
    print('icon skip:', e)
print('patched', man)
