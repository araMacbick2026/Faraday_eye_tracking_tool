(function(root){
 const limits={medianPx:120,p90Px:200,coverage:.7,minSamples:10,driftPx:60,maxAgeMs:250,positionDisplacement:.12,positionScaleFraction:.35,positionSustainedMs:1000};
 function q(a,p){if(!a.length)return null;const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor((b.length-1)*p))]}
 function summarize(rows){const targets=rows.map(r=>{const median=q(r.errors,.5),p90=q(r.errors,.9),coverage=r.slots?r.errors.length/r.slots:0;return {...r,median,p90,coverage,pass:median!==null&&median<=limits.medianPx&&p90<=limits.p90Px&&coverage>=limits.coverage&&r.errors.length>=limits.minSamples}});const errors=rows.flatMap(r=>r.errors),slots=rows.reduce((n,r)=>n+r.slots,0);return {median:q(errors,.5),p90:q(errors,.9),coverage:slots?errors.length/slots:0,targets,pass:targets.length>0&&targets.every(r=>r.pass)}}
 function movement(a,b){return !a||!b||Math.hypot(a.x-b.x,a.y-b.y)>.055||Math.abs(a.scale/b.scale-1)>.18}
 function positionChanged(a,b){return !!(a&&b&&(Math.hypot(a.x-b.x,a.y-b.y)>limits.positionDisplacement||Math.abs(a.scale/b.scale-1)>limits.positionScaleFraction))}
 function choose(stories,previous,random=Math.random){const choices=stories.filter(s=>s.id!==previous);return choices[Math.min(choices.length-1,Math.floor(random()*choices.length))]||stories[0]}
 function quality(mode,pre,post,coverage,invalidated){if(mode==='pointer')return 'rehearsal-not-gaze';if(invalidated||!pre?.pass||!post?.pass||coverage<limits.coverage||post.median-pre.median>limits.driftPx)return 'not-suitable-for-interpretation';return 'provisional-broad-region-only'}
 root.Reliability={limits,q,summarize,movement,positionChanged,choose,quality};
})(typeof window==='undefined'?globalThis:window);
