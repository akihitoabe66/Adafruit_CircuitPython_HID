// 麻雀先生のタイプ(守備・バランス・攻撃)の強さを、自動対戦で測る。
// 使い方: node tools/sim_coach.js <variant> <試合数> <出力.json>   variant: cpu | defense | balance | attack | balance-saki | attack-saki | defense-saki
// (mahjong フォルダで python3 -m http.server 8765 を起動しておく。Playwright が必要)
const {chromium}=require('playwright');
const V=process.argv[2]||'balance', N=+process.argv[3]||300, OUT=process.argv[4]||('/tmp/sim/'+V+'.json');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('http://localhost:8765/index.html?x=sim'+Date.now());await p.waitForTimeout(1500);
const r=await p.evaluate(async({V,N})=>{
  const rk=[0,0,0,0]; let hands=0,wins=0,dealin=0,riichiN=0,sumScore=0,sumPt=0;
  const type=V.split('-')[0], saki=/saki/.test(V);
  const orig=MJ.Game.prototype.playHand;
  MJ.Game.prototype.playHand=async function(){const r=await orig.call(this);hands++;
    if(r&&r.type==='win'){r.wins.forEach(w=>{if(w.winner.seat===0)wins++; if(w.loser&&w.loser.seat===0)dealin++;});}
    return r;};
  const PT=[30,10,-10,-30];
  for(let i=0;i<N;i++){
    const g=new MJ.Game({fast:true,allCpu:true,cpuLevel:4,chars:[MJ.CHARS[1],MJ.CHARS[3],MJ.CHARS[5]],length:'east'});
    g.players[0].char=Object.assign({},g.players[0].char,{style:'balanced',level:4,ai:4});
    if(type!=='cpu'){g.players[0].coachType=type;g.players[0].coachSaki=saki;g.players[0].coachNoRank=/norank/.test(V);}
    const f=await g.run(); const rank=f.order.findIndex(x=>x.seat===0); rk[rank]++; sumScore+=g.players[0].score; sumPt+=PT[rank];
  }
  MJ.Game.prototype.playHand=orig;
  return {variant:V,games:N,ranks:rk,avgRank:+((rk[0]+rk[1]*2+rk[2]*3+rk[3]*4)/N).toFixed(3),winRate:+(wins/hands).toFixed(3),dealInRate:+(dealin/hands).toFixed(3),avgScore:Math.round(sumScore/N),avgPt:+(sumPt/N).toFixed(2)};
},{V,N});
console.log(JSON.stringify(r));require('fs').writeFileSync(OUT,JSON.stringify(r));
await b.close()})();
