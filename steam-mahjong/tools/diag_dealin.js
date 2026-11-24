// 放銃(自分が当たり牌を出した)の場面を集めて、原因を調べる。 使い方: node tools/diag_dealin.js <型> <試合数>
const {chromium}=require('playwright');
const T=process.argv[2]||'defense', N=+process.argv[3]||300;
(async()=>{const b=await chromium.launch();const p=await b.newPage();
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('http://localhost:8765/index.html?x=diag'+Date.now());await p.waitForTimeout(1500);
const r=await p.evaluate(async({T,N})=>{
  const A=MJ.AI; const log=[]; let hands=0, riichiHands=0;
  // 自分の打牌ごとに、そのときの状況を記録(放銃したときに、結びつける)
  const origCS=A.coachSelf;
  A.coachSelf=function(game,p,opts,type,opt){
    const res=origCS.call(this,game,p,opts,type,opt);
    try{ const opps=game.players.filter(q=>q!==p&&q.riichi); const an=A.analyze(game,p,{know:1});
      p.__last={opps:opps.length, riichiBefore:opps.length>0, sh:an.minSh, live:game.live.length, melds:p.melds.length, tile:res.tile?res.tile.t:-1, riichiMine:p.riichi, dealerRiichi:opps.some(q=>q.seat===game.dealer)};
      if(res.tile){ const ev=an.evals.find(e=>e.t===res.tile.t); p.__last.danger=ev&&ev.danger?Math.round(ev.danger.score):null; p.__last.tag=ev&&ev.danger?ev.danger.tag:null; const minD=Math.min(...an.evals.map(e=>e.danger?e.danger.score:0)); p.__last.minDanger=an.opps.length?Math.round(minD):null; }
    }catch(e){}
    return res;};
  const orig=MJ.Game.prototype.playHand;
  MJ.Game.prototype.playHand=async function(){const r=await orig.call(this);hands++;
    if(this.players.some(q=>q.riichi))riichiHands++;
    if(r&&r.type==='win'){r.wins.forEach(w=>{ if(w.loser&&w.loser.seat===0){ const L=this.players[0].__last||{}; log.push(Object.assign({winnerRiichi:w.winner.riichi,han:w.res.han,pay:w.pay.ron},L)); }});}
    return r;};
  for(let i=0;i<N;i++){
    const g=new MJ.Game({fast:true,allCpu:true,cpuLevel:4,chars:[MJ.CHARS[1],MJ.CHARS[3],MJ.CHARS[5]],length:'east'});
    g.players[0].char=Object.assign({},g.players[0].char,{style:'balanced',level:4,ai:4});
    g.players[0].coachType=T; await g.run();
  }
  MJ.Game.prototype.playHand=orig; A.coachSelf=origCS;
  const n=log.length; const c=(f)=>log.filter(f).length;
  return {type:T,games:N,hands,riichiHands,dealins:n,
    whileOppRiichi:c(x=>x.riichiBefore), noOppRiichi:c(x=>!x.riichiBefore),
    winnerRiichi:c(x=>x.winnerRiichi),
    mineRiichi:c(x=>x.riichiMine),
    meldedHand:c(x=>x.melds>0),
    shDist:[0,1,2,3,4].map(s=>c(x=>x.sh===s)),
    avgPay:Math.round(log.reduce((a,x)=>a+x.pay,0)/Math.max(1,n)),
    oppRiichi_tagDist:log.filter(x=>x.riichiBefore).reduce((m,x)=>{m[x.tag]=(m[x.tag]||0)+1;return m;},{}),
    oppRiichi_pickedVsSafest:log.filter(x=>x.riichiBefore&&x.danger!=null).reduce((s,x)=>{s.n++; s.pickedAvg+=x.danger; s.safestAvg+=x.minDanger; return s;},{n:0,pickedAvg:0,safestAvg:0}),
    sample:log.slice(0,4)};
},{T,N});
console.log(JSON.stringify(r,null,1));await b.close()})();
