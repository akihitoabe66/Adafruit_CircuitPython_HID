const OUT='__OUT__'; const done={}; let busy=false, started=false, nq=0;
function snap(name){ if(done[name]) return; done[name]=1; gfx.snap(OUT+name+'.bmp'); __S.dirty=true; __S.full=true; print('SNAP '+name); }
function later(f,ms){ busy=true; setTimeout(()=>{ busy=false; f(); },ms); }
function tick(){
  const S=__S;
  if(!S.game && !started){ window.__key('ok'); }
  if(S.game) started=true;
  if(!busy && S.mode==='game' && S.game){
    const calm=Object.keys(S.bub||{}).length===0 && !S.banner && !S.ryu && !S.fly && !S.deal && !S.intro && !S.dice && !S.coach && !S.react && !S.result;
    if(S.react){ later(()=>window.__key('ok'),300); }
    else if(S.self && !S.self.rm){
      if(calm && S.self.tiles && S.self.tiles.length>=14 && !(S.self.btns&&S.self.btns.length)){
        nq++;
        if(nq>=3){
          if(!done.discard){ window.__key('left'); later(()=>snap('discard'),700); }
          else if(!done.riichi && !globalThis.__teacherEnv){ const s=S.self; s.btns=[{label:'リーチ',act:'riichi'},{label:'ツモ',act:'tsumo'}]; s.row=1; s.idx=1; S.dirty=true; S.full=true; later(()=>snap('riichi'),700); }
          else if(globalThis.__teacherEnv && !done.teacher){ later(()=>snap('teacher'),700); }
          else window.__key('ok');
        } else later(()=>{},300);
      } else if(done.riichi || done.teacher){ window.__key('ok'); }
      else if(!done.discard){ window.__key('ok'); }
    }
  }
  setTimeout(tick, 250);
}
setTimeout(tick,2500);
