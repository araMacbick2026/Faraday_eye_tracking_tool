(function(root){
 const limits={medianPx:120,p90Px:200,coverage:.7,minSamples:10,driftPx:60,maxAgeMs:250,positionDisplacement:.12,positionScaleFraction:.35,positionSustainedMs:1000};
 function q(a,p){if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),i=(b.length-1)*p;return b[Math.floor(i)]+(b[Math.ceil(i)]-b[Math.floor(i)])*(i%1);}
 function summarize(rows,expectedCount=rows.length){const targets=rows.map(r=>{const median=q(r.errors,.5),p90=q(r.errors,.9),coverage=r.slots?(r.freshSlots??r.errors.length)/r.slots:0;return {...r,median,p90,coverage,offsetX:q((r.offsets||[]).map(p=>p.x),.5),offsetY:q((r.offsets||[]).map(p=>p.y),.5),predictionsPerSecond:r.errors.length/3,pass:median!==null&&median<=limits.medianPx&&p90<=limits.p90Px&&coverage>=limits.coverage&&r.errors.length>=limits.minSamples}});const errors=rows.flatMap(r=>r.errors),slots=rows.reduce((n,r)=>n+r.slots,0);const complete=targets.length===expectedCount&&new Set(targets.map(t=>t.point)).size===expectedCount;return {median:q(errors,.5),p90:q(errors,.9),coverage:slots?rows.reduce((n,r)=>n+(r.freshSlots??r.errors.length),0)/slots:0,targets,complete,pass:complete&&targets.length>0&&targets.every(r=>r.pass)}}
 function positionFailures(v){return v.targets.filter(t=>t.median!==null&&(t.median>limits.medianPx||t.p90>limits.p90Px));}
 function widespreadPositionError(v){return positionFailures(v).length>=3&&v.targets.filter(target=>target.pass).length<2;}
 function previewFeedback(result,width){
  const rows=result.targets;
  if(!result.complete||rows.length!==3||!Number.isFinite(width)||width<=0||rows.some(row=>row.coverage<limits.coverage||row.errors.length<limits.minSamples||!Number.isFinite(row.offsetX))){
   return {title:'The camera missed some of the preview',text:'Keep both eyes in view, light your face from the front, and try the preview again.'};
  }
  const estimates=rows.map(row=>row.target.x+row.offsetX);
  const spread=Math.max(...estimates)-Math.min(...estimates);
  if(spread<width*.20){
   const nearCenter=estimates.every(x=>Math.abs(x-width/2)<width*.20);
   return {title:nearCenter?'The estimates stayed near the centre':'The estimates stayed close together',text:'The camera had trouble telling left from right. Face the camera, keep your head still, and look at each dot until it moves.'};
  }
  const direction=rows.every(row=>row.offsetX>width*.08)?'right':rows.every(row=>row.offsetX< -width*.08)?'left':null;
  if(direction)return {title:'The estimates landed to the '+direction,text:'Centre your webcam above the screen and try the preview again.'};
  if(estimates[0]<estimates[1]&&estimates[1]<estimates[2]&&rows.every(row=>Math.hypot(row.offsetX,row.offsetY)<width*.12)){
   return {title:'The camera followed left, centre, and right',text:'You’re ready to try the full nine-dot setup. It checks more of the screen.'};
  }
  return {title:'The estimates missed some dots',text:'Hold your position and try again. You can also continue to the full setup or practise with your pointer.'};
 }
 function diagnose(v){
  const messages=[];
  if(v.complete===false)messages.push('This check did not cover all five targets. Run a complete accuracy check.');
  if(v.targets.some(t=>t.coverage<limits.coverage))messages.push('The camera lost sight of your eyes too often. Keep your face in view and try again.');
  if(v.targets.some(t=>t.errors.length<limits.minSamples))messages.push('There were too few readings. Close other apps that use the camera, then check again.');
  const bad=positionFailures(v);
  if(widespreadPositionError(v))messages.push(`${bad.length} of ${v.targets.length} targets missed the mark. Centre your camera and light your face from the front, then start the nine dots again.`);
  else if(bad.length)messages.push('Tracking was off at dot'+(bad.length>1?'s ':' ')+bad.map(t=>t.point).join(', ')+'. Adjust the weak areas and check again.');
  if(!messages.length)messages.push('All dots passed. Run the next check to make sure tracking stays accurate.');
  return messages;
 }
 function refinementTargets(failed, grid, width, height){
  const targets=failed.filter(row=>Number.isFinite(row.target?.x)&&Number.isFinite(row.target?.y))
   .sort((a,b)=>Math.max(b.median/limits.medianPx,b.p90/limits.p90Px)-Math.max(a.median/limits.medianPx,a.p90/limits.p90Px))
   .slice(0,3).map(row=>[row.target.x/width,row.target.y/height]);
  if(!targets.length)return [];
  const points=[];
  for(const target of targets){
   const nearest=[...grid].sort((a,b)=>Math.hypot(a[0]-target[0],a[1]-target[1])-Math.hypot(b[0]-target[0],b[1]-target[1]));
   const count=targets.length===1?3:targets.length===2&&target===targets[0]?2:1;
   for(const anchor of nearest.slice(0,count))points.push(target.map((value,i)=>(value+anchor[i])/2));
  }
  return points;
 }
 function movement(a,b){return !a||!b||Math.hypot(a.x-b.x,a.y-b.y)>.055||Math.abs(a.scale/b.scale-1)>.18}
 function positionChanged(a,b){return !!(a&&b&&(Math.hypot(a.x-b.x,a.y-b.y)>limits.positionDisplacement||Math.abs(a.scale/b.scale-1)>limits.positionScaleFraction))}
 function choose(stories,previous,random=Math.random){const choices=stories.filter(s=>s.id!==previous);return choices[Math.min(choices.length-1,Math.floor(random()*choices.length))]||stories[0]}
 function quality(mode,pre,post,coverage,invalidated){if(mode==='pointer')return 'rehearsal-not-gaze';if(invalidated||!pre?.pass||!post?.pass||![pre.median,post.median,coverage].every(Number.isFinite)||coverage<limits.coverage||post.median-pre.median>limits.driftPx)return 'not-suitable-for-interpretation';return 'provisional-broad-region-only'}
 root.Reliability={limits,q,summarize,diagnose,positionFailures,widespreadPositionError,previewFeedback,refinementTargets,movement,positionChanged,choose,quality};
})(typeof window==='undefined'?globalThis:window);
