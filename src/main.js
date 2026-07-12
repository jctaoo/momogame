import { play, setEnabled } from 'cuelume';

/* ====== CONSTANTS ====== */
const SUITS=['♠','♥','♦','♣'];
const COLORS={'♠':'black','♣':'black','♥':'red','♦':'red'};
const RANKS=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RV={};RANKS.forEach((r,i)=>RV[r]=i+1);

/* Read a numeric CSS custom property from :root and compute it to pixels.
   Custom properties with calc() are not computed until applied to a real property. */
const _cssCache=new Map();
function cssVar(name){
  if(_cssCache.has(name)) return _cssCache.get(name);
  const test=document.createElement('div');
  test.style.position='absolute';
  test.style.visibility='hidden';
  test.style.width=`var(${name})`;
  document.body.appendChild(test);
  const val=parseFloat(getComputedStyle(test).width)||0;
  document.body.removeChild(test);
  _cssCache.set(name,val);
  return val;
}
function invalidateCssCache(){ _cssCache.clear(); }

/* ====== STATE ====== */
let stock=[],waste=[],fnd=[[],[],[],[]],tab=[[],[],[],[],[],[],[]];
let moves=0,score=0,secs=0,tmr=null,started=false,hist=[];
let drag=null;
let soundEnabled=localStorage.getItem('solitaire-sound')!=='off';
setEnabled(soundEnabled);

function updateSoundButton(){
  const btn=document.getElementById('btn-sound');
  btn.textContent=soundEnabled?'🔊 音效':'🔇 静音';
  btn.setAttribute('aria-pressed',String(soundEnabled));
}

/* Difficulty: easy=draw1/∞redeal, normal=draw3/∞redeal, hard=draw3/3redeal */
let difficulty='normal';
let drawCount=3;   // cards per stock click
let maxRedeals=-1; // -1 = unlimited
let redealsUsed=0;

/* ====== DECK ====== */
function mkDeck(){
  const d=[];
  for(const s of SUITS)for(const r of RANKS)d.push({s,r,c:COLORS[s],up:false,id:r+s});
  return d;
}
function shuf(a){for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a}

/* ====== DEAL ====== */
function dealLayout(d){
  const nextTab=[[],[],[],[],[],[],[]],nextStock=[];
  let k=0;
  for(let c=0;c<7;c++)for(let r=0;r<=c;r++){const cd=d[k++];cd.up=(r===c);nextTab[c].push(cd)}
  while(k<52){d[k].up=false;nextStock.push(d[k++])}
  return{tab:nextTab,stock:nextStock};
}

function dealScore(layout){
  const tops=layout.tab.map(p=>p[p.length-1]);
  let score=Math.random()*2; // Keep equally good deals from becoming deterministic.

  // Reward useful opening moves between the seven visible tableau cards.
  for(let i=0;i<tops.length;i++)for(let j=0;j<tops.length;j++){
    if(i!==j&&tops[i].c!==tops[j].c&&RV[tops[i].r]===RV[tops[j].r]-1)score+=9;
  }

  // Low cards are needed early to start foundations; prefer them face-up or early in stock.
  tops.forEach(card=>{if(RV[card.r]<=3)score+=(4-RV[card.r])*9});
  const drawOrder=[...layout.stock].reverse();
  drawOrder.slice(0,drawCount*3).forEach((card,i)=>{
    if(RV[card.r]<=3)score+=(4-RV[card.r])*5-i*.15;
  });

  // Penalize Aces buried deep under face-down tableau cards.
  layout.tab.forEach(p=>p.forEach((card,i)=>{
    if(card.r==='A'&&!card.up)score-=(p.length-1-i)*5;
  }));
  return score;
}

function deal(){
  const attempts=difficulty==='easy'?96:difficulty==='normal'?32:1;
  let best=null,bestScore=-Infinity;
  for(let i=0;i<attempts;i++){
    const candidate=dealLayout(shuf(mkDeck()));
    const score=dealScore(candidate);
    if(score>bestScore){best=candidate;bestScore=score}
  }
  stock=[];waste=[];fnd=[[],[],[],[]];tab=[[],[],[],[],[],[],[]];
  stock=best.stock;tab=best.tab;
}

/* ====== CARD ELEMENT ====== */
function mkEl(card){
  const el=document.createElement('div');
  el.className='card '+(card.c)+' '+(card.up?'face-up':'face-down');
  el.dataset.id=card.id;
  el.innerHTML=`<div class="card-inner card-front">
    <div class="corner tl"><span class="rk">${card.r}</span><span class="st">${card.s}</span></div>
    <div class="center-suit">${card.s}</div>
    <div class="corner br"><span class="rk">${card.r}</span><span class="st">${card.s}</span></div>
  </div><div class="card-inner card-back"><div class="card-back-inner"></div></div>`;
  return el;
}

/* ====== RENDER ====== */
function render(){
  clearHint();
  // Stock
  const sp=document.getElementById('stock-pile');
  sp.querySelectorAll('.card,#diff-badge').forEach(e=>e.remove());
  if(stock.length){
    const el=mkEl({c:'black',up:false,id:'stk',r:'',s:''});
    el.style.top='0';el.querySelector('.card-front').style.display='none';
    el.querySelector('.card-back').style.display='flex';el.querySelector('.card-back').style.zIndex='2';
    sp.appendChild(el);
    // Show remaining count
    const badge=document.createElement('div');
    badge.id='diff-badge';badge.textContent=stock.length+'张';
    sp.appendChild(badge);
  }else if(maxRedeals>=0&&redealsUsed>=maxRedeals&&waste.length){
    // Show blocked indicator
    const badge=document.createElement('div');
    badge.id='diff-badge';badge.style.color='#ef5350';badge.textContent='无重发';
    sp.appendChild(badge);
  }

  // Waste (fan top cards based on drawCount)
  const wp=document.getElementById('waste-pile');
  wp.querySelectorAll('.card').forEach(e=>e.remove());
  if(waste.length){
    const n=Math.min(drawCount,waste.length);
    for(let i=0;i<n;i++){
      const card=waste[waste.length-n+i];
      const el=mkEl(card);
      el.style.top='0';el.style.left=(i*cssVar('--waste-fan'))+'px';el.style.zIndex=i+1;
      if(i===n-1){attachDrag(el,card,'w',0,waste.length-1,()=>dblClickAuto('w',0,waste.length-1))}
      else el.style.pointerEvents='none';
      wp.appendChild(el);
    }
  }

  // Foundations
  document.querySelectorAll('.fnd-col').forEach((col,fi)=>{
    col.querySelectorAll('.card').forEach(e=>e.remove());
    if(fnd[fi].length){
      const card=fnd[fi][fnd[fi].length-1];
      const el=mkEl(card);
      el.style.top='0';
      col.appendChild(el);
    }
  });

  // Tableau
  const tabUp=cssVar('--tab-up'),tabDown=cssVar('--tab-down');
  document.querySelectorAll('.tab-col').forEach((col,ti)=>{
    col.querySelectorAll('.card').forEach(e=>e.remove());
    let top=0;
    tab[ti].forEach((card,ci)=>{
      const el=mkEl(card);
      el.style.top=top+'px';el.style.zIndex=ci+1;
      if(card.up){
        attachDrag(el,card,'t',ti,ci,()=>dblClickAuto('t',ti,ci));
      }
      col.appendChild(el);
      top+=(card.up?tabUp:tabDown);
    });
  });

  updStats();chkAuto();
}

/* ====== DRAG & DROP ====== */
function attachDrag(el,card,src,si,ci,onDbl){
  // Double-click: auto-move to foundation if possible (otherwise tableau for waste/tableau).
  el.ondblclick=()=>{clearHint();(onDbl || (()=>dblClickAuto(src,si,ci)))();};

  function start(cx,cy,ev){
    ev.preventDefault();
    const startX=cx,startY=cy;
    let dragging=false;
    let cards=[card],els=[el];
    if(src==='t'&&ci!==undefined){
      cards=tab[si].slice(ci);
      const col=el.closest('.tab-col');
      els=[];col.querySelectorAll('.card').forEach(ce=>{if(cards.some(c=>c.id===ce.dataset.id))els.push(ce)});
    }
    const r=el.getBoundingClientRect();
    const ox=cx-r.left,oy=cy-r.top;
    const stackOff=cssVar('--drag-stack');
    // Capture current viewport positions BEFORE switching to fixed so the cards
    // stay visually in place when a real drag begins.
    const rects=els.map(ce=>ce.getBoundingClientRect());

    function beginDrag(){
      dragging=true;
      play('press');
      els.forEach((ce,i)=>{
        const rect=rects[i];
        ce.classList.add('dragging');
        ce.style.position='fixed';
        ce.style.left=rect.left+'px';
        ce.style.top=rect.top+'px';
        ce.style.zIndex=5000+i;
      });
      drag={cards,els,src,si,ci,ox,oy,stackOff};
    }

    function onMove(cx2,cy2){
      if(!dragging){
        const dx=cx2-startX,dy=cy2-startY;
        if(dx*dx+dy*dy<16) return; // ~4px threshold: small movements count as clicks
        beginDrag();
      }
      els.forEach((ce,i)=>{ce.style.left=(cx2-ox)+'px';ce.style.top=(cy2-oy+i*stackOff)+'px'});
      hlTargets(cx2,cy2);
    }
    function onEnd(cx2,cy2){
      document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);
      document.removeEventListener('touchmove',tm);document.removeEventListener('touchend',te);
      if(!dragging) return; // plain click/tap - keep element intact so dblclick can fire
      clearHL();
      const tgt=findTarget(cx2,cy2);
      if(tgt){
        doMove(cards,src,si,ci,tgt.t,tgt.i);
        els.forEach(ce=>ce.classList.remove('dragging'));
        drag=null;render();
        return;
      }

      play('droplet');
      els.forEach(ce=>ce.classList.add('returning'));
      void document.body.offsetWidth;
      els.forEach((ce,i)=>{
        ce.classList.remove('dragging');
        ce.style.left=rects[i].left+'px';
        ce.style.top=rects[i].top+'px';
      });
      drag=null;
      setTimeout(()=>render(),220);
    }
    function mm(e){onMove(e.clientX,e.clientY)}
    function mu(e){onEnd(e.clientX,e.clientY)}
    function tm(e){e.preventDefault();const t=e.touches[0];onMove(t.clientX,t.clientY)}
    function te(e){const t=e.changedTouches[0];onEnd(t.clientX,t.clientY)}
    document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);
    document.addEventListener('touchmove',tm,{passive:false});document.addEventListener('touchend',te);
  }
  el.addEventListener('mousedown',e=>{if(e.button===0)start(e.clientX,e.clientY,e)});
  el.addEventListener('touchstart',e=>{if(e.touches.length===1)start(e.touches[0].clientX,e.touches[0].clientY,e)},{passive:false});
}

function hlTargets(mx,my){
  clearHL();if(!drag)return;
  const{cards,src}=drag;
  // Only allow foundation drop if single card and NOT from foundation
  if(cards.length===1&&src!=='f'){
    document.querySelectorAll('.fnd-col').forEach((c,fi)=>{
      const r=c.getBoundingClientRect();
      if(mx>=r.left&&mx<=r.right&&my>=r.top&&my<=r.bottom&&canFnd(cards[0],fi))c.classList.add('drop-highlight');
    });
  }
  document.querySelectorAll('.tab-col').forEach((c,ti)=>{
    const r=c.getBoundingClientRect();
    const ext={l:r.left,r:r.right,t:r.top,b:Math.max(r.bottom,r.top+200)};
    if(mx>=ext.l&&mx<=ext.r&&my>=ext.t&&my<=ext.b&&canTab(cards[0],ti))c.classList.add('drop-highlight');
  });
}
function clearHL(){document.querySelectorAll('.drop-highlight').forEach(e=>e.classList.remove('drop-highlight'))}

function findTarget(mx,my){
  if(!drag)return null;
  const{cards,src}=drag;
  // Only allow foundation drop if single card and NOT from foundation
  if(cards.length===1&&src!=='f'){
    for(let fi=0;fi<4;fi++){
      const c=document.querySelectorAll('.fnd-col')[fi],r=c.getBoundingClientRect();
      if(mx>=r.left&&mx<=r.right&&my>=r.top&&my<=r.bottom&&canFnd(cards[0],fi))return{t:'f',i:fi};
    }
  }
  for(let ti=0;ti<7;ti++){
    const c=document.querySelectorAll('.tab-col')[ti],r=c.getBoundingClientRect();
    const ext={l:r.left,r:r.right,t:r.top,b:Math.max(r.bottom,r.top+200)};
    if(mx>=ext.l&&mx<=ext.r&&my>=ext.t&&my<=ext.b&&canTab(cards[0],ti))return{t:'t',i:ti};
  }
  return null;
}

/* ====== RULES ====== */
function canFnd(card,fi){
  const p=fnd[fi];
  if(!p.length)return card.r==='A'&&SUITS[fi]===card.s;
  const t=p[p.length-1];
  return card.s===t.s&&RV[card.r]===RV[t.r]+1;
}
function canTab(card,ti){
  const p=tab[ti];
  if(!p.length)return card.r==='K';
  const t=p[p.length-1];
  if(!t.up)return false;
  return card.c!==t.c&&RV[card.r]===RV[t.r]-1;
}

/* ====== MOVE ====== */
function doMove(cards,fs,fi,ci,tt,ti,withSound=true){
  hist.push({fs,fi,ci,tt,ti,cs:cards.map(c=>({...c})),flip:null});
  // remove from source
  if(fs==='w')waste.pop();
  else if(fs==='t')tab[fi].splice(ci);
  else if(fs==='f')fnd[fi].pop();
  // add to target
  if(tt==='f'){fnd[ti].push(cards[0]);score+=10}
  else if(tt==='t'){tab[ti].push(...cards);if(fs==='w')score+=5;if(fs==='f')score=Math.max(0,score-10)}
  // flip exposed
  let exposed=false;
  if(fs==='t'&&tab[fi].length){
    const last=tab[fi][tab[fi].length-1];
    if(!last.up){last.up=true;score+=5;hist[hist.length-1].flip=fi;exposed=true}
  }
  if(withSound)play(exposed?'bloom':tt==='f'?'sparkle':'release');
  moves++;if(!started)startTmr();
}

/* ====== STOCK ====== */
document.getElementById('stock-pile').addEventListener('click',()=>{
  if(!stock.length){
    // Recycle waste back to stock
    if(!waste.length){play('droplet');return}
    // Check redeal limit
    if(maxRedeals>=0&&redealsUsed>=maxRedeals){play('droplet');return}
    hist.push({type:'recycle',wc:waste.map(c=>({...c})),redealsUsed});
    while(waste.length){const c=waste.pop();c.up=false;stock.push(c)}
    redealsUsed++;
    score=Math.max(0,score-20);
  }else{
    const cnt=Math.min(drawCount,stock.length);
    hist.push({type:'draw',cnt});
    for(let i=0;i<cnt;i++){const c=stock.pop();c.up=true;waste.push(c)}
  }
  play('toggle');
  moves++;if(!started)startTmr();render();
});

/* ====== DOUBLE-CLICK AUTO MOVE (foundation priority, then tableau) ====== */
function dblClickAuto(fs,si,ci){
  const card=fs==='w'?waste[waste.length-1]:tab[si][ci];
  // 1. Try foundation
  for(let fi=0;fi<4;fi++){
    if(canFnd(card,fi)){doMove([card],fs,si,ci,'f',fi);render();return}
  }
  // 2. Try tableau - pick best target (prefer non-empty, different pile)
  let best=-1,bestScore=-1;
  for(let ti=0;ti<7;ti++){
    if(fs==='t'&&ti===si)continue; // skip same pile
    if(!canTab(card,ti))continue;
    let sc=0;
    if(tab[ti].length>0)sc+=10; // prefer non-empty
    // prefer placing on higher rank
    if(tab[ti].length>0)sc+=RV[tab[ti][tab[ti].length-1].r];
    // bonus if moving exposes a face-down card
    if(fs==='t'&&ci>0&&!tab[si][ci-1].up)sc+=20;
    if(sc>bestScore){bestScore=sc;best=ti}
  }
  if(best>=0){doMove([card],fs,si,ci,'t',best);render()}
  else play('droplet');
}

/* ====== HINT SYSTEM ====== */
let hintTimer=null;
function clearHint(){
  document.querySelectorAll('.hint-source,.hint-target').forEach(e=>{e.classList.remove('hint-source','hint-target')});
  document.getElementById('hint-arrow').innerHTML='';
  if(hintTimer){clearTimeout(hintTimer);hintTimer=null}
}

function showHint(){
  clearHint();
  const moves=findAllMoves();
  if(!moves.length){play('droplet');return}
  play('chime');
  // Score and pick the best hint
  let best=null,bestSc=-999;
  for(const m of moves){
    let sc=0;
    if(m.tt==='f')sc+=50; // foundation is always good
    if(m.tt==='t'){
      if(m.fs==='w')sc+=15; // waste to tableau useful
      if(m.fs==='t'&&m.ci>0&&!tab[m.si][m.ci-1].up)sc+=30; // exposes card
      if(m.tt==='t'&&tab[m.ti].length===0&&m.card.r==='K')sc+=5; // K to empty is ok but not great
    }
    // prefer moving single cards over stacks
    if(m.cards.length===1)sc+=3;
    if(sc>bestSc){bestSc=sc;best=m}
  }
  if(!best)return;

  // Highlight source card
  const srcCardId=best.card.id;
  let srcEl=null;
  document.querySelectorAll('.card').forEach(el=>{
    if(el.dataset.id===srcCardId&&el.classList.contains('face-up')&&!el.classList.contains('dragging')){
      // For tableau, pick the correct one by position
      if(best.fs==='w'){
        const wp=document.getElementById('waste-pile');
        if(wp.contains(el))srcEl=el;
      }else if(best.fs==='t'){
        const col=document.querySelectorAll('.tab-col')[best.si];
        if(col.contains(el)){
          const idx=best.ci;
          const cards=col.querySelectorAll('.card');
          // find matching by checking all face-up cards
          const faceUpCards=[...col.querySelectorAll('.card.face-up')];
          const pile=tab[best.si];
          const firstUp=pile.findIndex(c=>c.up);
          const posInFaceUp=best.ci-firstUp;
          if(faceUpCards[posInFaceUp]===el)srcEl=el;
        }
      }else if(best.fs==='f'){
        const col=document.querySelectorAll('.fnd-col')[best.si];
        if(col.contains(el))srcEl=el;
      }
    }
  });
  if(!srcEl)return;
  srcEl.classList.add('hint-source');

  // Highlight target
  let tgtEl=null;
  if(best.tt==='f'){
    tgtEl=document.querySelectorAll('.fnd-col')[best.ti];
  }else{
    tgtEl=document.querySelectorAll('.tab-col')[best.ti];
  }
  if(tgtEl)tgtEl.classList.add('hint-target');

  // Draw arrow
  drawHintArrow(srcEl,tgtEl);

  // Auto-clear after 3s
  hintTimer=setTimeout(clearHint,3000);
}

function findAllMoves(){
  const moves=[];
  // Waste top card
  if(waste.length){
    const card=waste[waste.length-1];
    for(let fi=0;fi<4;fi++){if(canFnd(card,fi))moves.push({card,fs:'w',si:0,ci:waste.length-1,tt:'f',ti:fi,cards:[card]})}
    for(let ti=0;ti<7;ti++){if(canTab(card,ti))moves.push({card,fs:'w',si:0,ci:waste.length-1,tt:'t',ti:ti,cards:[card]})}
  }
  // Tableau
  for(let ti=0;ti<7;ti++){
    const pile=tab[ti];
    if(!pile.length)continue;
    // Try moving just the top card
    const topCard=pile[pile.length-1];
    for(let fi=0;fi<4;fi++){if(canFnd(topCard,fi))moves.push({card:topCard,fs:'t',si:ti,ci:pile.length-1,tt:'f',ti:fi,cards:[topCard]})}
    for(let tj=0;tj<7;tj++){
      if(tj===ti)continue;
      if(canTab(topCard,tj))moves.push({card:topCard,fs:'t',si:ti,ci:pile.length-1,tt:'t',ti:tj,cards:[topCard]});
    }
    // Try moving sub-stacks (only face-up sequences)
    const firstUp=pile.findIndex(c=>c.up);
    for(let ci=firstUp;ci<pile.length-1;ci++){
      const card=pile[ci];
      // Only valid if it forms a valid descending alternating sequence down to end
      let valid=true;
      for(let k=ci;k<pile.length-1;k++){
        if(pile[k+1].c===pile[k].c||RV[pile[k+1].r]!==RV[pile[k].r]-1){valid=false;break}
      }
      if(!valid)continue;
      const sub=pile.slice(ci);
      for(let tj=0;tj<7;tj++){
        if(tj===ti)continue;
        if(canTab(card,tj))moves.push({card,fs:'t',si:ti,ci,tt:'t',ti:tj,cards:sub});
      }
    }
  }
  return moves;
}

function drawHintArrow(srcEl,tgtEl){
  const svg=document.getElementById('hint-arrow');
  const sr=srcEl.getBoundingClientRect();
  const tr=tgtEl.getBoundingClientRect();
  const x1=sr.left+sr.width/2,y1=sr.top+sr.height/2;
  const x2=tr.left+tr.width/2,y2=tr.top+tr.height/2;
  // Control point for curve
  const mx=(x1+x2)/2,my=Math.min(y1,y2)-30;
  svg.innerHTML=`
    <defs>
      <marker id="ah" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#4fc3f7"/>
      </marker>
    </defs>
    <path d="M${x1},${y1} Q${mx},${my} ${x2},${y2}"
      stroke="#4fc3f7" stroke-width="2.5" fill="none" stroke-dasharray="6,4"
      marker-end="url(#ah)" opacity="0.8">
      <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="0.8s" repeatCount="indefinite"/>
    </path>
  `;
}

document.getElementById('btn-hint').onclick=showHint;

/* ====== UNDO ====== */
document.getElementById('btn-undo').onclick=function(){
  if(!hist.length){play('droplet');return}
  const h=hist.pop();
  if(h.type==='recycle'){
    // Undo recycle: move cards back from stock to waste
    const cnt=h.wc.length;
    stock.splice(stock.length-cnt);
    h.wc.forEach(c=>{c.up=true;waste.push(c)});
    redealsUsed=h.redealsUsed;
  }else if(h.type==='draw'){
    // Undo draw: pop cnt cards from waste back to stock
    const cnt=h.cnt||1;
    for(let i=0;i<cnt;i++){
      if(waste.length){const c=waste.pop();c.up=false;stock.push(c)}
    }
  }else{
    if(h.tt==='f'){fnd[h.ti].pop();score-=10}
    else if(h.tt==='t'){tab[h.ti].splice(tab[h.ti].length-h.cs.length);if(h.fs==='w')score-=5;if(h.fs==='f')score+=10}
    if(h.fs==='w')h.cs.forEach(c=>{c.up=true;waste.push(c)});
    else if(h.fs==='t'){
      if(h.flip!==null&&tab[h.fi].length){tab[h.fi][tab[h.fi].length-1].up=false;score-=5}
      tab[h.fi].push(...h.cs);
    }
    else if(h.fs==='f')h.cs.forEach(c=>{c.up=true;fnd[h.fi].push(c)});
    moves=Math.max(0,moves-1);
  }
  play('whisper');
  render();
};

/* ====== TIMER ====== */
function startTmr(){started=true;if(tmr)clearInterval(tmr);tmr=setInterval(()=>{secs++;document.getElementById('s-time').textContent=String(secs/60|0).padStart(2,'0')+':'+String(secs%60).padStart(2,'0')},1000)}
function updStats(){
  document.getElementById('s-moves').textContent=moves;
  document.getElementById('s-score').textContent=score;
  const rd=document.getElementById('s-redeal');
  if(maxRedeals<0){rd.textContent='∞'}
  else{const left=maxRedeals-redealsUsed;rd.textContent=left>0?left:'无';rd.style.color=left<=1?'#ef5350':'#ffe082'}
}

/* ====== AUTO-COMPLETE ====== */
function chkAuto(){
  const ok=tab.every(p=>p.every(c=>c.up))&&!stock.length&&waste.every(c=>c.up);
  document.getElementById('auto-btn').style.display=ok?'block':'none';
}
document.getElementById('auto-btn').onclick=function(){
  play('sparkle');
  (function step(){
    let done=false;
    if(waste.length)for(let fi=0;fi<4;fi++){if(canFnd(waste[waste.length-1],fi)){doMove([waste[waste.length-1]],'w',0,waste.length-1,'f',fi,false);render();done=true;break}}
    if(!done)for(let ti=0;ti<7;ti++){if(!tab[ti].length)continue;const c=tab[ti][tab[ti].length-1];for(let fi=0;fi<4;fi++){if(canFnd(c,fi)){doMove([c],'t',ti,tab[ti].length-1,'f',fi,false);render();done=true;break}}if(done)break}
    if(done)setTimeout(step,100);else chkWin();
  })();
};

/* ====== WIN ====== */
function chkWin(){
  if(fnd.reduce((s,f)=>s+f.length,0)===52){
    play('success');
    clearInterval(tmr);
    const t=String(secs/60|0).padStart(2,'0')+':'+String(secs%60).padStart(2,'0');
    const dn={'easy':'简单','normal':'普通','hard':'困难'}[difficulty]||'普通';
    document.getElementById('win-stats').textContent='难度：'+dn+' 用时：'+t+' 步数：'+moves+' 得分：'+score;
    document.getElementById('win-overlay').classList.add('show');
    fireworks();
  }
}

/* ====== FIREWORKS ====== */
function fireworks(){
  const cv=document.getElementById('fireworks'),cx=cv.getContext('2d');
  cv.width=innerWidth;cv.height=innerHeight;
  const ps=[],cols=['#ff6b6b','#feca57','#48dbfb','#ff9ff3','#54a0ff','#5f27cd','#01a3a4','#f368e0'];
  function burst(x,y){const col=cols[Math.random()*cols.length|0];for(let i=0;i<50;i++){const a=Math.PI*2/50*i+Math.random()*.3,sp=2+Math.random()*3.5;ps.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,l:1,d:.013+Math.random()*.008,c:col,sz:1.5+Math.random()*2})}}
  let f=0;
  (function go(){
    cx.clearRect(0,0,cv.width,cv.height);
    for(let i=ps.length-1;i>=0;i--){const p=ps[i];p.x+=p.vx;p.y+=p.vy;p.vy+=.04;p.l-=p.d;if(p.l<=0){ps.splice(i,1);continue}cx.globalAlpha=p.l;cx.fillStyle=p.c;cx.beginPath();cx.arc(p.x,p.y,p.sz,0,Math.PI*2);cx.fill()}
    cx.globalAlpha=1;f++;if(f%35===0&&f<350)burst(80+Math.random()*(cv.width-160),80+Math.random()*cv.height*.45);
    if(f<450)requestAnimationFrame(go);else cx.clearRect(0,0,cv.width,cv.height);
  })();
  burst(cv.width/2,cv.height*.3);
}

/* ====== DIFFICULTY ====== */
function applyDifficulty(diff){
  difficulty=diff;
  if(diff==='easy'){drawCount=1;maxRedeals=-1}
  else if(diff==='normal'){drawCount=3;maxRedeals=-1}
  else{drawCount=3;maxRedeals=3}  // hard
  redealsUsed=0;
}
document.getElementById('diff-select').addEventListener('change',function(){
  applyDifficulty(this.value);newGame();
});

/* ====== NEW GAME ====== */
function newGame(){
  clearInterval(tmr);tmr=null;started=false;secs=0;moves=0;score=0;hist=[];
  applyDifficulty(document.getElementById('diff-select').value);
  document.getElementById('s-time').textContent='00:00';
  document.getElementById('win-overlay').classList.remove('show');
  document.getElementById('auto-btn').style.display='none';
  const cx2=document.getElementById('fireworks').getContext('2d');cx2.clearRect(0,0,cx2.canvas.width,cx2.canvas.height);
  deal();render();
  play('bloom');
}
document.getElementById('btn-new').onclick=newGame;
document.getElementById('btn-replay').onclick=newGame;
document.getElementById('btn-sound').onclick=function(){
  soundEnabled=!soundEnabled;
  setEnabled(soundEnabled);
  localStorage.setItem('solitaire-sound',soundEnabled?'on':'off');
  updateSoundButton();
  if(soundEnabled)play('toggle');
};

/* ====== INIT ====== */
window.addEventListener('resize',()=>{
  clearTimeout(window._rsz);
  window._rsz=setTimeout(()=>{invalidateCssCache();render();},100);
});
updateSoundButton();
newGame();
