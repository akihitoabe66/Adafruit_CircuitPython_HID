#!/usr/bin/env python3
# 土地の声を追加する: python3 tools/add_place_voice.py <wav> <土地の名前(肥後国 など)> <ファイル名の英字(higo など)>
import sys,subprocess,json,re,shutil,os
w,name,en=sys.argv[1:4]; R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
shutil.copy(w,os.path.join(R,'tools/dan_src/place_%s.wav'%en))
r=subprocess.run(['ffmpeg','-v','info','-i',w,'-af','volumedetect','-f','null','-'],capture_output=True,text=True).stderr
mv=float(re.search(r'mean_volume: (-?[\d.]+)',r).group(1))
subprocess.run(['ffmpeg','-y','-v','0','-i',w,'-af','volume=%sdB,alimiter=limit=0.9,adelay=300:all=1'%(-16.5-mv),'-ar','44100','-ac','1','-b:a','96k',os.path.join(R,'audio/yk/m_%s.mp3'%en)],check=True)
mp=os.path.join(R,'audio/yk/manifest.json'); m=json.load(open(mp)); m['m:'+name]='m_%s.mp3'%en; json.dump(m,open(mp,'w'),ensure_ascii=False)
