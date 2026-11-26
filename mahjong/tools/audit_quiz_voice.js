// クイズの出題の声が、全種類の問題に付いているか調べる: node tools/audit_quiz_voice.js (リポジトリの mahjong フォルダで実行)。「★なし」が出たら、声のファイルが足りない
const fs=require('fs'); const vm=require('vm');
const files=['native/app/prelude.js','js/tiles.js','js/rules.js','js/forms.js','js/chars.js','js/ai.js','js/coach.js','js/game.js','js/banter.js','js/banter2.js','js/banter3.js','js/banter4.js','js/banter5.js','js/chars2.js','js/rank.js','native/app/icon.js','js/ruby.js','js/drill.js','native/app/stats.js','native/app/learn.js'];
const ctx={console,print:console.log,Math,Date,JSON,setTimeout,clearTimeout,localStorage:{getItem(){return null},setItem(){},removeItem(){}},__now:()=>Date.now()}; ctx.window=ctx; ctx.globalThis=ctx; vm.createContext(ctx);
for(const f of files){ try{ vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f}); }catch(e){ console.log('load err',f,String(e).slice(0,100)); } }
const nui=fs.readFileSync('native/app/nui.js','utf8'); const a=nui.indexOf('  const qVoiceKey'); const b=nui.indexOf('  function quizNext()'); 
const fn=nui.slice(a,b);
const man=JSON.parse(fs.readFileSync('audio/yk/manifest.json','utf8'));
vm.runInContext(fn.replace('const qVoiceKey','globalThis.qVoiceKey'),ctx);
const MJ=ctx.MJ; const seen={}; const miss={};
const gens=[]; 
['genEff','genDef','genCall','genYaku','genWait','genPush','genRiichi','genKeep'].forEach(k=>gens.push([k,MJ.Drill[k]]));
gens.push(['genScore',MJ.Drill.genScore]);
for(const [t,gs] of Object.entries((MJ.Learn||{}).TAGGEN||{})) gs.forEach((g,i)=>gens.push(['learn:'+t+':'+i,g]));
for(const [name,g] of gens){ for(let i=0;i<40;i++){ let p; try{p=g();}catch(e){continue;} if(!p)continue; const key=ctx.qVoiceKey(p); const id=(p.cat||'')+'|'+(p.tag||'')+'|'+p.title+' => '+key+(key&&man[key]?' OK':' ★なし'); seen[id]=1; } }
Object.keys(seen).sort().forEach(s=>console.log(s));
