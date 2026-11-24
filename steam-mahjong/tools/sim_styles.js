// CPU同士の自動対戦で、打ち方(守備・バランス・攻撃)ごとの順位の分布・和了率・放銃率を測る。
// 使い方: (mahjong フォルダで http サーバーを起動して) node tools/sim_styles.js 300 out.json   (Playwright が必要)
const {chromium}=require('playwright');
const N=+process.argv[2]||150; const out=process.argv[3]||'/tmp/sim/out.json';
(async()=>{const b=await chromium.launch();const p=await b.newPage();
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('http://localhost:8765/index.html?x=sim'+Date.now());await p.waitForTimeout(1500);
const res={};
for(const style of ['defense','balanced','attack']){
  res[style]=await p.evaluate(async(args)=>{
    const {style,N}=args; const rk=[0,0,0,0]; let hands=0,wins=0,dealin=0,riichi=0,tsumo=0,sumScore=0,draws=0;
    const orig=MJ.Game.prototype.playHand;
    MJ.Game.prototype.playHand=async function(){const r=await orig.call(this);hands++;
      if(r&&r.type==='win'){r.wins.forEach(w=>{if(w.winner.seat===0){wins++;if(w.tsumo)tsumo++;} if(w.loser&&w.loser.seat===0)dealin++;});} else draws++;
      return r;};
    for(let i=0;i<N;i++){
      const g=new MJ.Game({fast:true,allCpu:true,cpuLevel:4,chars:[MJ.CHARS[1],MJ.CHARS[3],MJ.CHARS[5]],length:'east'});
      g.players[0].char=Object.assign({},g.players[0].char,{style,level:4,ai:4});
      const f=await g.run(); const r=f.order.findIndex(x=>x.seat===0); rk[r]++; sumScore+=g.players[0].score;
    }
    MJ.Game.prototype.playHand=orig;
    return {games:N,ranks:rk,avgRank:(rk[0]*1+rk[1]*2+rk[2]*3+rk[3]*4)/N,hands,winRate:wins/hands,dealInRate:dealin/hands,avgScore:sumScore/N};
  },{style,N});
  console.log(style,JSON.stringify(res[style]));
}
require('fs').writeFileSync(out,JSON.stringify(res));
await b.close()})();
