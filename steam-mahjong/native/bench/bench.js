(async function(){
  try { MJ.loadRules && MJ.loadRules(); } catch(e){}
  var t0 = __now(); var hands=0, discards=0;
  var orig = MJ.Game.prototype.playHand;
  MJ.Game.prototype.playHand = async function(){ var r = await orig.call(this); hands++; for (var i=0;i<4;i++) discards += this.players[i].discards.length; return r; };
  var N = (typeof BENCH_N !== "undefined") ? BENCH_N : 1;
  for (var i=0;i<N;i++){ var g = new MJ.Game({fast:true,allCpu:true,cpuLevel:3,chars:[MJ.CHARS[1],MJ.CHARS[3],MJ.CHARS[5]],length:'east'}); await g.run(); }
  var ms = __now()-t0;
  console.log('games',N,'hands',hands,'discards',discards,'total ms',Math.round(ms),'ms/discard',(ms/discards).toFixed(3));
})().catch(function(e){ console.log('BENCH ERR', e && e.stack || e); });
