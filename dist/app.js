'use strict';
const $=s=>document.querySelector(s);
const embeddedStudio=document.body?.classList.contains('pilot');
const state={mode:null,phase:'setup',latest:null,calibrated:false,validation:null,samples:[],elapsed:0,running:false,epoch:0,viewport:null};
let validationRows=[],activeValidation=null,calIndex=0,lastTick=0;
const calibration=[[.1,.18],[.5,.18],[.9,.18],[.1,.5],[.5,.5],[.9,.5],[.1,.82],[.5,.82],[.9,.82]];
const checks=[[.25,.3],[.75,.3],[.5,.55],[.25,.72],[.75,.72]];
const samplesPerTarget=15;
const calibrationCapacity=(calibration.length+3)*samplesPerTarget;
const quantile=(a,q)=>{if(!a.length)return null;const s=[...a].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor((s.length-1)*q))]};
const fmt=n=>n==null?'—':Math.round(n)+' px';
function phase(p,n){state.phase=p;document.querySelectorAll('.steps span').forEach((s,i)=>{const active=i===n-1;s.classList.toggle('selected',active);if(active)s.setAttribute('aria-current','step');else s.removeAttribute('aria-current');});}
function message(s){$('#signal').textContent=s;}
function setDesk(html){$('#desk').innerHTML=html;}
function setup(){phase('setup',1);setDesk(`<div class="welcome"><div class="eyebrow">Before you begin</div><h2>How would you like to start?</h2><p>Use your webcam to estimate where you look, or use your pointer to try the activity.</p><label class="consent"><input id="consent" type="checkbox"><span>I agree to use my camera for this activity. Video stays in this browser and is never recorded.</span></label><div class="actions"><button class="solid" id="camera" disabled>Use my camera</button><button class="secondary" id="rehearse">Practise with pointer</button></div><p class="small-note">About 5 minutes · For adults using a desktop or laptop</p><div id="error" role="status"></div></div>`);$('#consent').onchange=e=>$('#camera').disabled=!e.target.checked;$('#camera').onclick=startCamera;$('#rehearse').onclick=()=>startMode('pointer');}
let trackerPromise,cameraStarting=false;
function timeoutError(stage){const e=new Error(stage+' timed out');e.name='TimeoutError';return e;}
function withTimeout(promise,ms,stage){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(timeoutError(stage)),ms);})]).finally(()=>clearTimeout(timer));}
function stopCamera(){
  const video=document.getElementById('webgazerVideoFeed');
  if(video?.srcObject){video.srcObject.getTracks().forEach(track=>track.stop());video.srcObject=null;}
  try{window.webgazer?.removeMouseEventListeners();window.webgazer?.end();}catch{/* A failed start may not have created the preview. */}
  document.querySelectorAll('#webgazerVideoContainer,#webgazerGazeDot').forEach(el=>el.remove());
}
function cameraFailure(error){
  const name=error?.name||'Error';
  if(name==='NotAllowedError'||name==='PermissionDeniedError'||name==='SecurityError')return 'Camera access was blocked. Allow camera access for this site, then try again.';
  if(name==='NotFoundError'||name==='DevicesNotFoundError')return 'No camera was found. Connect or enable your webcam, then reload and try again.';
  if(name==='NotReadableError'||name==='TrackStartError')return 'The camera could not be opened. Close other apps using it (such as a video meeting), check the webcam privacy switch, then reload and try again.';
  if(name==='OverconstrainedError')return 'This camera could not use the requested settings. Try another webcam or a desktop browser.';
  if(name==='TimeoutError')return 'The camera took too long to start. Check your camera permission and try again.';
  if(name==='UnsupportedError')return 'This browser does not expose camera access. Open the same link directly in Chrome or Edge on your computer.';
  return 'The camera couldn’t start. Try again or open Faraday in Chrome or Edge.';
}
function loadTracker(){
  if(window.webgazer)return Promise.resolve();
  if(trackerPromise)return trackerPromise;
  trackerPromise=withTimeout(new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/webgazer.js';script.onload=resolve;script.onerror=()=>reject(new Error('Tracking library download failed'));document.head.append(script);}),20000,'tracking library').catch(error=>{trackerPromise=null;throw error;});
  return trackerPromise;
}
async function startCamera(){
  if(cameraStarting){$('#error').textContent='The previous camera request is still closing. Try again shortly.';return;}
  cameraStarting=true;
  const epoch=++state.epoch;let stage='browser camera support';
  const button=$('#camera');button.disabled=true;button.textContent='Opening your camera…';$('#rehearse').disabled=true;$('#error').textContent='';
  try{
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){const error=new Error('Camera API unavailable');error.name='UnsupportedError';throw error;}
    const policy=document.permissionsPolicy||document.featurePolicy;
    if(policy?.allowsFeature&&!policy.allowsFeature('camera')){const error=new Error('Camera blocked by browser embedding policy');error.name='SecurityError';throw error;}
    stage='tracking library loading';await loadTracker();if(epoch!==state.epoch)return;
    // This WebGazer distribution uses a relative MediaPipe directory by default.
    // Ship the matching assets with the application and resolve from the page URL.
    webgazer.params.faceMeshSolutionPath=new URL('/mediapipe/face_mesh/',document.baseURI).href;
    webgazer.saveDataAcrossSessions(false);await webgazer.setCameraConstraints({audio:false,video:{width:{ideal:640},height:{ideal:480},facingMode:'user'}});
    if(epoch!==state.epoch)return;
    installFaceMonitor();
    const tracker=webgazer;
    tracker.addRegressionModule('faraday',function(){
     return window.GazeModel.create(patches=>tracker.util.getEyeFeats(patches),calibrationCapacity);
    });
    tracker.setRegression('faraday').setGazeListener(ingest);
    stage='camera permission and face-tracking initialization';button.textContent='Allow camera to continue…';$('#error').textContent='Allow camera access when your browser asks. It can take a few seconds to start.';
    const startup=Promise.resolve(webgazer.begin());
    startup.then(()=>{if(epoch!==state.epoch)stopCamera();},()=>{});
    await withTimeout(startup,45000,stage);
    if(epoch!==state.epoch){stopCamera();return;}
    webgazer.removeMouseEventListeners();webgazer.showPredictionPoints(false);webgazer.showVideoPreview(true);startMode('camera');
  }catch(error){
    if(epoch!==state.epoch)return;
    state.epoch++;stopCamera();
    console.warn('Faraday camera startup:',stage,error?.name,error?.message);
    $('#error').textContent=cameraFailure(error)+' You can still rehearse the workflow with the pointer.';
    button.disabled=false;button.textContent=embeddedStudio?'Reset camera setup':'Reload & retry camera ↗';button.onclick=embeddedStudio?reset:()=>location.reload();$('#rehearse').disabled=false;
  }finally{cameraStarting=false;}
}
const R=window.Reliability;
Object.assign(state,{sequence:0,frameSequence:0,face:null,stableSince:0,pose:null,baseline:null,preChecks:[],postCheck:null,story:null,invalidated:false,interruptions:[],calibrationLog:[],calibrationPoses:[],validationHistory:[],lastPredictionId:0});
let collecting=false,calSamples=0,calLastFrame=0,calLastAt=0,calSettle=0,calLastProgressAt=0,calAnchor=null,movementSince=0,checkPurpose='pre',checkIndex=0,checkStarted=0,checkLastSlot=-1,checkLastId=0,recordNext=50,badSince=0;
let calibrationPath=calibration.map((_,i)=>i),refining=false,refinementStarted=false;
const now=()=>performance.now();
function ingest(data){
 if(state.mode!=='camera')return;
 if(!state.face||!data||!Number.isFinite(data.x)||!Number.isFinite(data.y)){state.latest=null;return;}
 if(state.latest?.id===state.face.id)return;
 state.latest={x:data.x,y:data.y,t:state.face.t,id:state.face.id};
}
function installFaceMonitor(){
 const tracker=webgazer.getTracker();if(tracker.faradayWrapped)return;
 const original=tracker.getEyePatches;tracker.faradayWrapped=true;
 let lastPresentedFrame;
 tracker.getEyePatches=async function(...args){
  const epoch=state.epoch;
  const presentedFrame=args[0]?.getVideoPlaybackQuality?.()?.totalVideoFrames;
  let patches;try{patches=await original.apply(this,args);}catch(error){if(epoch===state.epoch){state.face=null;state.trackerError=error?.message||'Face tracking interrupted';}return null;}
  if(epoch!==state.epoch)return null;
  const p=this.getPositions?.();const canvas=args[1];
  if(patches?.left&&patches?.right&&[1,33,263].every(i=>Number.isFinite(p?.[i]?.[0])&&Number.isFinite(p?.[i]?.[1]))&&canvas?.width&&canvas?.height){state.trackerError=null;
   if(presentedFrame>0&&presentedFrame===lastPresentedFrame&&state.face)return patches;
   lastPresentedFrame=presentedFrame;
   const pose={x:p[1][0]/canvas.width,y:p[1][1]/canvas.height,scale:Math.hypot(p[33][0]-p[263][0],p[33][1]-p[263][1])/canvas.width};
   if(!state.pose||R.movement(state.pose,pose))state.stableSince=now();
   state.pose=pose;state.face=pose.scale>0?{...pose,t:now(),id:++state.frameSequence,patches}:null;
  }else{state.face=null;state.pose=null;state.stableSince=now();}
  return patches;
 };
}
function faceReady(){return state.mode==='pointer'||!!(state.face&&now()-state.face.t<600&&now()-state.stableSince>=600);}
function headMoved(){return state.mode==='camera'&&state.face&&state.baseline&&R.positionChanged(state.baseline,state.face);}
function startMode(mode){if(mode==='pointer')stopCamera();state.mode=mode;state.latest=null;state.preChecks=[];state.invalidated=false;$('#modeBadge').textContent=mode==='camera'?'Camera':'Pointer practice';$('#source').textContent=mode==='camera'?'Webcam estimate':'Pointer (not gaze)';showCalibrationIntro();}
document.addEventListener('pointermove',e=>{if(state.mode==='pointer')state.latest={x:e.clientX,y:e.clientY,t:now(),id:++state.sequence};});
function pointerPrediction(){const p=state.latest;return p?{...p,t:now(),id:++state.sequence}:null;}
function fresh(){const p=state.mode==='pointer'?pointerPrediction():state.latest;return p&&now()-p.t<R.limits.maxAgeMs&&Number.isFinite(p.x)&&Number.isFinite(p.y)?p:null;}
function showCalibrationIntro(){phase('calibration',2);setDesk(`<div class="welcome"><div class="eyebrow">Step 2 · Set up the dots</div><h2>Look at each dot in turn</h2><p>Click a dot once, then look at its centre until it moves. Each dot takes about three seconds. Keep your head comfortably still.</p><p>${state.mode==='pointer'?'For pointer practice, move your pointer to each dot.':'If a dot stops moving, face the camera and hold still for a moment.'}</p><div class="actions"><button class="solid" id="calibrate">Start the nine dots</button><button class="secondary" id="reset">Disconnect camera</button></div></div>`);$('#calibrate').onclick=beginCalibration;$('#reset').onclick=reset;message('Ready to start the nine dots.');}
function placeTarget(pt){$('#target').style.left=pt[0]*innerWidth+'px';$('#target').style.top=pt[1]*innerHeight+'px';}
function beginCalibration(){
 refining=false;refinementStarted=false;calibrationPath=calibration.map((_,i)=>i);
 phase('calibration',2);
 state.viewport={width:innerWidth,height:innerHeight,dpr:devicePixelRatio};state.validation=null;state.preChecks=[];state.postCheck=null;state.calibrated=false;state.invalidated=false;state.baseline=null;state.calibrationLog=[];state.calibrationPoses=[];state.calibrationModel=null;
 $('#accuracy').textContent='—';if(state.mode==='camera')webgazer.getRegression()[0].init();calIndex=0;calSamples=0;collecting=false;$('#overlay').hidden=false;$('#target').disabled=false;$('#target').onclick=clickCalibration;calTarget();
}
function calTarget(){showCalibrationControls();collecting=false;calAnchor=null;calSamples=0;calLastFrame=0;placeTarget(calibration[calibrationPath[calIndex]]);$('#target').textContent='+';$('#targetInstruction').textContent=`${refining?'Refinement':'Calibration'} ${calIndex+1}/${calibrationPath.length} · Click once, then look steadily`;$('#targetProgress').textContent='Click the target to begin collecting';}
function clickCalibration(){if(collecting)return;collecting=true;state.trackerError=null;calAnchor=null;calLastProgressAt=now();calSettle=now()+700;calLastAt=0;$('#target').textContent='·';}
function showCalibrationControls(){
 let controls=document.getElementById('calibrationControls');
 if(!controls){controls=document.createElement('div');controls.id='calibrationControls';controls.className='calibration-controls';controls.innerHTML='<button id="restartCalibration">Restart all 9 points</button><button id="reconnectCalibration">Reconnect camera</button><button id="exitCalibration">Cancel calibration</button>';$('#overlay').appendChild(controls);}
 controls.hidden=false;
 $('#restartCalibration').onclick=beginCalibration;$('#reconnectCalibration').onclick=reset;$('#exitCalibration').onclick=cancelTargets;
}
function hideCalibrationControls(){const controls=document.getElementById('calibrationControls');if(controls)controls.hidden=true;}
function calibrationStatus(text){$('#targetProgress').textContent=`${Math.round(calSamples/samplesPerTarget*100)}% done · ${text}`;}
function collectCalibration(){
 if(!collecting||state.phase!=='calibration'||$('#overlay').hidden)return;
 if(now()-calLastProgressAt>=15000){collecting=false;$('#target').textContent='!';calibrationStatus('Collection stopped. Restart calibration, or reconnect the camera if it keeps stopping.');return;}
 if(now()<calSettle)return;
 if(state.trackerError){calibrationStatus('Camera interrupted · Reconnect to continue');return;}
 if(state.mode==='camera'&&(!state.face||now()-state.face.t>=600)){calibrationStatus('Face the camera. Reconnect if the dot still won’t move.');return;}
 if(!faceReady()){calibrationStatus('Face moving · Hold your head steady');return;}
 if(state.mode==='camera'){
  if(!calAnchor)calAnchor={...state.face};
  else if(R.movement(calAnchor,state.face)){calAnchor={...state.face};calSettle=now()+650;calibrationStatus('Settling at this target · Hold comfortably still');return;}
 }
 if(now()-calLastAt<130)return;
 if(state.mode==='camera'&&state.face.id===calLastFrame){calibrationStatus('Keep looking at the dot while the camera catches up');return;}
 const pt=calibration[calibrationPath[calIndex]],x=pt[0]*innerWidth,y=pt[1]*innerHeight;
 if(state.mode==='camera'){
  calLastFrame=state.face.id;
  if(!webgazer.getRegression()[0].addData(state.face.patches,[x,y],'faraday-calibration')){
   calibrationStatus('Keep both eyes in view');return;
  }
 }
 calLastAt=now();calLastProgressAt=now();calSamples++;calibrationStatus('Keep looking at the centre');
 if(calSamples===samplesPerTarget){
  state.calibrationLog.push({point:calibrationPath[calIndex]+1,refinement:refining,x,y,samples:calSamples});
  if(state.pose)state.calibrationPoses.push(state.pose);
  calIndex++;collecting=false;
  if(calIndex===calibrationPath.length)finishCalibration();else calTarget();
 }
}
function finishCalibration(){
 hideCalibrationControls();$('#overlay').hidden=true;
 if(state.mode==='camera'){
  const model=webgazer.getRegression()[0];
  if(!model.fit()){
   showCalibrationIntro();message('We couldn’t set up tracking. Start the nine dots again.');return;
  }
  state.calibrationModel={name:model.name,samples:model.sampleCount,heldOutMeanPx:model.calibrationError};
 }
 state.calibrated=true;
 if(state.calibrationPoses.length)state.baseline=Object.fromEntries(['x','y','scale'].map(key=>[key,R.q(state.calibrationPoses.map(pose=>pose[key]),.5)]));
 $('#calStatus').textContent=refining?'Adjusted':'Complete';
 showValidationIntro();
}
function showValidationIntro(){phase('validation',3);setDesk(`<div class="welcome"><div class="eyebrow">Step 3 · Check accuracy</div><h2>${state.mode==='pointer'?'Move your pointer to each dot':'Follow the dots with your eyes'}</h2><p>${state.mode==='pointer'?'Keep your pointer at the centre of each dot until it moves.':'Look at the centre of each dot until it moves.'} There are five dots per check.</p><p>Two checks need to pass before you can read with the camera.</p><div class="actions"><button class="solid" id="validate">Start check ${state.preChecks.length+1} of 2</button><button class="secondary" id="recalibrate">Recalibrate</button></div></div>`);$('#validate').onclick=()=>beginValidation('pre');$('#recalibrate').onclick=showCalibrationIntro;}
function beginValidation(purpose='pre'){hideCalibrationControls();checkPurpose=purpose;validationRows=[];checkIndex=0;phase(purpose==='post'?'postcheck':'validation',purpose==='post'?5:3);$('#overlay').hidden=false;$('#target').disabled=true;$('#target').textContent='·';$('#target').onclick=null;startCheckTarget();}
function startCheckTarget(){
 if(checkIndex===checks.length){activeValidation=null;$('#overlay').hidden=true;finishValidation();return;}
 const pt=checks[checkIndex];placeTarget(pt);checkStarted=now();checkLastSlot=-1;checkLastId=0;
 activeValidation={point:checkIndex+1,target:{x:pt[0]*innerWidth,y:pt[1]*innerHeight},errors:[],offsets:[],slots:60,freshSlots:0,uniquePredictions:[],missing:0};
 $('#targetInstruction').textContent=`${checkPurpose==='post'?'After-activity drift check':'Accuracy check '+(state.preChecks.length+1)+'/2'} · Target ${checkIndex+1}/5`;
 $('#targetProgress').textContent='Settle for one second, then look for three seconds · No clicking';
}
function collectValidation(){
 if(!activeValidation||$('#overlay').hidden)return;
 const elapsed=now()-checkStarted;if(elapsed>=4000){activeValidation.missing=60-activeValidation.freshSlots;validationRows.push(activeValidation);activeValidation=null;checkIndex++;startCheckTarget();return;}
 if(elapsed<1000)return;
 const slot=Math.min(59,Math.floor((elapsed-1000)/50));if(slot===checkLastSlot)return;checkLastSlot=slot;
 const p=fresh();if(p&&faceReady())activeValidation.freshSlots++;if(p&&p.id!==checkLastId&&faceReady()){checkLastId=p.id;activeValidation.errors.push(Math.hypot(p.x-activeValidation.target.x,p.y-activeValidation.target.y));activeValidation.offsets.push({x:p.x-activeValidation.target.x,y:p.y-activeValidation.target.y});activeValidation.uniquePredictions.push(p.id);}
 $('#targetProgress').textContent=`${Math.ceil((4000-elapsed)/1000)} seconds left · Keep looking at the dot`;
}
function checkTable(v){return `<table class="quality-table"><thead><tr><th>Target</th><th>Typical distance</th><th>90% of readings within</th><th>Tracking time</th><th>Readings per second</th><th>Result</th></tr></thead><tbody>${v.targets.map(r=>`<tr><td>${r.point}</td><td>${fmt(r.median)}</td><td>${fmt(r.p90)}</td><td>${Math.round(r.coverage*100)}%</td><td>${r.predictionsPerSecond.toFixed(1)}</td><td>${r.pass?'Pass':'Repeat'}</td></tr>`).join('')}</tbody></table>`;}
function targetMap(v){const w=state.viewport?.width||innerWidth,h=state.viewport?.height||innerHeight;return `<div class="target-map"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Accuracy map showing the dots and where the camera estimated you looked">${v.targets.filter(t=>t.target&&t.offsetX!==null&&t.offsetY!==null).map(t=>{const x=t.target.x+t.offsetX,y=t.target.y+t.offsetY;return `<line x1="${t.target.x}" y1="${t.target.y}" x2="${x}" y2="${y}" stroke="#c95632" stroke-width="5"/><circle cx="${t.target.x}" cy="${t.target.y}" r="18" stroke="#365e4e" stroke-width="6" fill="none"/><circle cx="${x}" cy="${y}" r="12" fill="#c95632"/><text x="${t.target.x+25}" y="${t.target.y-25}" font-size="36" fill="#242e2a">${t.point}</text>`;}).join('')}</svg><p class="fine">Green rings show where the dots appeared. Orange marks show where the camera estimated you looked.</p></div>`;}
function diagnosticPanel(v){return `<div class="session-next">${R.diagnose(v).map(m=>`<p>${m}</p>`).join('')}</div>`;}
function beginRefinement(){
 if(!state.validation||refinementStarted||R.widespreadPositionError(state.validation))return;
 const bad=R.positionFailures(state.validation).sort((a,b)=>b.median-a.median)[0];if(!bad)return;
 refinementStarted=true;
 calibrationPath=R.refinementPoints({x:bad.target.x/innerWidth,y:bad.target.y/innerHeight},calibration);refining=true;state.preChecks=[];state.postCheck=null;state.calibrated=false;state.baseline=null;state.invalidated=false;calIndex=0;phase('calibration',2);$('#overlay').hidden=false;$('#target').disabled=false;$('#target').onclick=clickCalibration;calTarget();
}
function downloadValidation(){const report={schema:'faraday.validation.v1',exportedAt:new Date().toISOString(),mode:state.mode,thresholds:R.limits,viewport:state.viewport,calibration:state.calibrationLog,calibrationModel:state.calibrationModel??null,validation:state.validation,history:state.validationHistory,nonclinical:true};saveFile(JSON.stringify(report,null,2),'application/json',`faraday-validation-${Date.now()}.json`);}
function finishValidation(){
 const result={...R.summarize(validationRows,checks.length),purpose:checkPurpose,mode:state.mode,checkedAt:new Date().toISOString(),viewport:state.viewport};state.validationHistory.push(result);
 if(checkPurpose==='post'){state.postCheck=result;renderReview();return;}
 if(result.pass)state.preChecks.push(result);else state.preChecks=[];
 state.validation=result;$('#accuracy').textContent=fmt(result.median);phase('validated',3);
 const ready=state.preChecks.length>=2;
 const restartCalibration=state.mode==='camera'&&R.widespreadPositionError(result);
 const canRefine=!result.pass&&!refinementStarted&&!R.widespreadPositionError(result)&&R.positionFailures(result).length>0;
 const heading=result.pass?(ready?'You’re ready to read':'One more check'):'Let’s adjust the setup';
 const passed=result.targets.filter(target=>target.pass).length;
 const primary=result.pass?`<button class="solid" id="nextCheck">${ready?'Choose a story':'Start the second check'}</button>`:
  canRefine?'<button class="solid" id="refine">Adjust the weak area</button>':'';
 setDesk(`<div class="welcome"><p class="eyebrow">${state.mode==='pointer'?'Pointer practice':'Accuracy check'}</p>
  <h2>${heading}</h2><p>${passed} of ${checks.length} targets passed. ${state.mode==='pointer'?'These results are from your pointer.':''}</p>
  ${result.pass?`<p>${ready?'Choose a story to begin the reading activity.':'A second check makes sure the results hold up.'}</p>`:diagnosticPanel(result)}
  <div class="actions">${primary}<button class="${!result.pass&&!canRefine?'solid':'secondary'}" id="recalibrate">Calibrate all nine dots</button>
  ${!result.pass&&!restartCalibration?'<button class="secondary" id="retryCheck">Check again</button>':''}
  ${!result.pass?`<button class="secondary" id="demoContinue">${state.mode==='camera'?'Practise with pointer':'Read a practice story'}</button>`:''}</div>
  <details class="accuracy-details"><summary>See results for each target</summary>${checkTable(result)}${targetMap(result)}
  <button class="secondary" id="exportValidation">Download check results</button></details></div>`);
 if(result.pass)$('#nextCheck').onclick=ready?()=>showActivity(true):()=>beginValidation('pre');
 $('#recalibrate').onclick=showCalibrationIntro;$('#exportValidation').onclick=downloadValidation;
 if(canRefine)$('#refine').onclick=beginRefinement;
 if(!result.pass&&!restartCalibration)$('#retryCheck').onclick=()=>beginValidation('pre');
 if(!result.pass)$('#demoContinue').onclick=()=>{if(state.mode==='camera'){reset();startMode('pointer');}showActivity(true);};
 message(result.pass?'Accuracy check complete.':'The camera checks need to pass before you can read.');
}
function chooseStory(){state.story=R.choose(window.STORIES,state.story?.id);}
function lesson(){const s=state.story;return `<div class="activity" id="activity"><div class="activity-inner"><article data-region="reading"><div class="eyebrow">${s.category} · ${s.id.toUpperCase()}</div><h2>${s.title}</h2>${s.paragraphs.map(p=>`<p>${p}</p>`).join('')}<p><b>Consider:</b> ${s.question}</p></article><div class="diagram" data-region="diagram"><span class="story-symbol" aria-hidden="true">${s.symbol}</span><div class="eyebrow">STORY THREAD</div>${s.diagram.map((p,i)=>`<p>${i?'↓<br>':''}${p}</p>`).join('')}</div></div><canvas id="heatmap" hidden></canvas></div>`;}
function showActivity(randomize=false){
 if(state.mode==='camera'&&(!state.calibrated||state.preChecks.length<2||state.invalidated)){showCalibrationIntro();return;}
 if(randomize||!state.story)chooseStory();phase('ready',4);
 setDesk(`<div class="actions"><button class="solid" id="start">Start reading</button><button class="secondary" id="shuffle">Choose another story</button><button class="secondary" id="redo">Recheck accuracy</button></div><p class="small-note">Story ${window.STORIES.findIndex(s=>s.id===state.story.id)+1} OF ${window.STORIES.length}</p>${lesson()}<p class="small-note">Read at your own pace. We’ll check accuracy again when you finish.</p>`);
 $('#start').onclick=startRecording;$('#shuffle').onclick=()=>showActivity(true);$('#redo').onclick=()=>{state.preChecks=[];showValidationIntro();};
}
function rectJSON(r){return{x:r.x,y:r.y,width:r.width,height:r.height};}
function inside(p,r){return p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height;}
function captureLayout(){state.activityRect=rectJSON($('#activity').getBoundingClientRect());state.regions=[...document.querySelectorAll('#activity [data-region]')].map(e=>({name:e.dataset.region,rect:rectJSON(e.getBoundingClientRect())}));}
function startRecording(){
 if(state.mode==='camera'&&(!state.calibrated||state.invalidated||state.preChecks.length<2||!faceReady()||headMoved())){showCalibrationIntro();message('○ Face not steady or position changed · recalibrate');return;}
 state.samples=[];state.elapsed=0;state.postCheck=null;state.interruptions=[];state.invalidated=false;state.lastPredictionId=0;recordNext=50;badSince=0;movementSince=0;
 $('#activity').scrollIntoView({block:'center'});captureLayout();state.viewport={width:innerWidth,height:innerHeight,dpr:devicePixelRatio};
 state.running=true;phase('recording',4);$('#start').outerHTML='<button class="secondary" id="pause">Pause</button><button class="solid" id="finish">Finish reading</button><span id="clock">00:45</span>';$('#shuffle').hidden=true;$('#redo').hidden=true;
 $('#pause').onclick=togglePause;$('#finish').onclick=finish;lastTick=now();message('Reading activity started.');
}
function pauseRecording(reason){if(!state.running)return;state.running=false;state.interruptions.push({at_ms:Math.round(state.elapsed),reason});if($('#pause'))$('#pause').textContent='Resume';message('○ Paused · '+reason);}
function togglePause(){if(state.running){pauseRecording('Manual pause');return;}if(state.invalidated){finish();return;}if(!faceReady()||headMoved()||!fresh()){message('○ Face the camera and hold steady before resuming');return;}state.running=true;lastTick=now();badSince=0;$('#pause').textContent='Pause';message('● Recording resumed');}
function addRecordingSlot(t,forceMissing=false){
 if(!state.activityRect)captureLayout();
 const p=forceMissing?null:fresh();const available=!!(p&&faceReady()&&!headMoved());const valid=available&&p.id!==state.lastPredictionId;if(valid)state.lastPredictionId=p.id;
 state.samples.push({t_ms:t,available,prediction_id:valid?p.id:null,prediction_age_ms:p?Math.round(now()-p.t):null,x:valid?Math.round(p.x):null,y:valid?Math.round(p.y):null,valid,reason:valid?'fresh':forceMissing?'scheduler-gap':!p?'missing-or-stale':p.id===state.lastPredictionId?'repeated-prediction':'face-or-position',offscreen:valid&&(p.x<0||p.x>innerWidth||p.y<0||p.y>innerHeight),activity_x:valid?p.x-state.activityRect.x:null,activity_y:valid?p.y-state.activityRect.y:null,region:valid?state.regions.find(r=>inside(p,r.rect))?.name||'outside activity':'missing'});
}
function tick(time){
 if(state.running){const dt=Math.max(0,time-lastTick);state.elapsed=Math.min(45000,state.elapsed+dt);
  if(recordNext<=state.elapsed)captureLayout();
  while(recordNext<=state.elapsed){addRecordingSlot(recordNext,state.elapsed-recordNext>=50);recordNext+=50;}
  $('#sampleCount').textContent=state.samples.filter(s=>s.valid).length;
  if($('#clock'))$('#clock').textContent='00:'+String(Math.max(0,Math.ceil((45000-state.elapsed)/1000))).padStart(2,'0');
  if(headMoved()){if(!movementSince)movementSince=time;if(time-movementSince>=R.limits.positionSustainedMs){state.invalidated=true;pauseRecording('Sustained position change · finish and recalibrate');}}else movementSince=0;
  if(!faceReady()||!fresh()){if(!badSince)badSince=time;if(time-badSince>900)pauseRecording('Signal lost · face the camera before resuming');}else badSince=0;
  if(state.elapsed>=45000)finish();
 }
 lastTick=time;requestAnimationFrame(tick);
}
function finish(){
 state.running=false;phase('post-intro',5);captureLayout();
 setDesk(`<div class="welcome"><div class="eyebrow">Step 5 · Review</div><h2>Check accuracy once more</h2><p>Follow five more dots so we can see whether tracking stayed accurate while you read.</p><p>If you skip this check, the results will be marked as unverified.</p><div class="actions"><button class="solid" id="post">Start final check</button><button class="secondary" id="skipPost">Skip to results</button></div></div>`);
 $('#post').onclick=()=>beginValidation('post');$('#skipPost').onclick=()=>{state.postCheck=null;renderReview();};
}
function coverage(){return state.samples.length?state.samples.filter(s=>s.available??s.valid).length/state.samples.length:0;}
function sessionQuality(){const pre={...state.validation,pass:state.preChecks.length>=2&&!!state.validation?.pass};const tooShort=state.elapsed<3000||state.samples.filter(s=>s.valid).length<10;return R.quality(state.mode,pre,state.postCheck,coverage(),state.invalidated||tooShort);}
async function saveObservation(button, status){
 const pixels=value=>value==null?null:Math.round(value);
 const summary={story:state.story.title,mode:state.mode,quality:sessionQuality(),durationMs:Math.round(state.elapsed),
  coverage:Math.round(coverage()*100),predictions:state.samples.filter(sample=>sample.valid).length,
  beforePx:pixels(state.validation?.median),afterPx:pixels(state.postCheck?.median),pauses:state.interruptions.length};
 button.disabled=true;
 status.textContent='Saving summary…';
 try{
  const response=await fetch('/pilot/api/observations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(summary)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'The summary could not be saved.');
  status.textContent='Saved. The coach and athlete can now see this summary.';
  if(embeddedStudio)window.dispatchEvent(new CustomEvent('faraday:observation-saved',{detail:result.observation}));
 }catch(error){
  status.textContent=error.message;
  button.disabled=false;
 }
}
function renderReview(){
 phase('review',5);
 const quality=sessionQuality(),usable=quality==='provisional-broad-region-only',pointer=state.mode==='pointer';
 const valid=state.samples.filter(s=>s.valid);
 const summary=pointer?'This map shows how you moved the pointer.':usable?
  'All three accuracy checks passed. The map can help compare broad parts of the page.':
  'We couldn’t verify tracking for this activity. Use the map only to see where tracking went wrong.';
 setDesk(`<div class="welcome"><p class="eyebrow">${pointer?'Pointer practice':'Camera activity'}</p>
  <h2>${pointer?'Your practice results':usable?'Your reading results':'Tracking couldn’t be verified'}</h2>
  <div class="stats"><div><b>${(state.elapsed/1000).toFixed(1)}s</b><span>Reading time</span></div>
  <div><b>${Math.round(coverage()*100)}%</b><span>Time tracked</span></div><div><b>${valid.length}</b><span>Readings</span></div></div>
  <p class="notice">${summary}</p>
  <details class="accuracy-details"><summary>See accuracy checks</summary><p>Typical distance before reading: ${fmt(state.validation?.median)}. After reading: ${fmt(state.postCheck?.median)}.</p>${state.postCheck?checkTable(state.postCheck):'<p>There was no final check.</p>'}</details></div>
  ${lesson()}<div class="actions"><button class="secondary" id="heatToggle">${usable||pointer?'Hide heatmap':'Show troubleshooting map'}</button></div>
  <p class="small-note" id="regions"></p><p class="fine">Darker areas show more readings. The map can’t tell whether you understood the story.</p>
  <details class="accuracy-details review-downloads"><summary>Download results</summary><div class="actions"><button class="secondary" id="json">Download full results</button><button class="secondary" id="csv">Download readings for a spreadsheet</button></div></details>
  <div class="actions"><button class="secondary" id="again">Read another story</button><button class="secondary" id="clear">${pointer?'End practice':'Disconnect camera'}</button></div>`);
 const visible=usable||state.mode==='pointer';$('#heatmap').hidden=!visible;if(visible)drawHeatmap();$('#heatToggle').onclick=()=>{const c=$('#heatmap');c.hidden=!c.hidden;if(!c.hidden)drawHeatmap();$('#heatToggle').textContent=c.hidden?'Show troubleshooting map':'Hide heatmap';};
 const regionLabels={reading:'Story',diagram:'Illustration','outside activity':'Outside the story',missing:'No new reading'};
 $('#regions').textContent=Object.entries(regionLabels).map(([region,label])=>`${label}: ${state.samples.length?Math.round(state.samples.filter(s=>s.region===region).length/state.samples.length*100):0}%`).join(' · ');
 $('#json').onclick=()=>download('json');$('#csv').onclick=()=>download('csv');$('#again').onclick=()=>{state.preChecks=[];state.postCheck=null;chooseStory();if(!state.calibrated||state.invalidated)showCalibrationIntro();else showValidationIntro();};$('#clear').onclick=reset;message('Your results are ready.');
 if(embeddedStudio||location.pathname==='/pilot/studio'){
  const resultsLink=embeddedStudio?'<button type="button" class="secondary" id="showSavedObservation">View saved summary ↓</button>':'<a class="text-link" href="/pilot/#eye-tracking">Open eye-tracking dashboard →</a>';
  $('#regions').insertAdjacentHTML('afterend',`<div class="actions"><button class="solid" id="saveObservation">Save to dashboard</button>${resultsLink}</div><p class="fine">Saving replaces the previous shared summary. Export the session before closing the activity if you want to keep the full results.</p><p id="observationStatus" role="status"></p>`);
  const button=$('#saveObservation');
  const status=$('#observationStatus');
  button.onclick=()=>saveObservation(button,status);
  if(embeddedStudio)$('#showSavedObservation').onclick=()=>$('#pilot-observation-card').focus();
 }
}
function drawHeatmap(){const c=$('#heatmap'),r=state.activityRect;c.width=r.width;c.height=r.height;const ctx=c.getContext('2d');for(const s of state.samples){if(!s.valid||s.activity_x<0||s.activity_x>r.width||s.activity_y<0||s.activity_y>r.height)continue;const x=s.activity_x,y=s.activity_y;const g=ctx.createRadialGradient(x,y,0,x,y,32);g.addColorStop(0,'rgba(201,86,50,.08)');g.addColorStop(.5,'rgba(219,153,61,.035)');g.addColorStop(1,'rgba(219,153,61,0)');ctx.fillStyle=g;ctx.fillRect(x-32,y-32,64,64);}}
function sessionReport(){return{schema:'faraday.observatory.v3',exportedAt:new Date().toISOString(),mode:state.mode,nonclinical:true,quality:sessionQuality(),thresholds:R.limits,samplingDefinitions:{available:'Recent prediction (age <250ms), stable visible face and acceptable position; may repeat a callback ID.',valid:'Independent prediction ID selected once; used for spatial density and raw accuracy samples.',coverage:'Available slots divided by scheduled slots; scheduler gaps remain unavailable.'},story:state.story,calibration:state.calibrationLog,calibrationModel:state.calibrationModel??null,validationHistory:state.validationHistory,preChecks:state.preChecks,lastPreCheck:state.validation,postCheck:state.postCheck,positionInvalidated:state.invalidated,interruptions:state.interruptions,duration_ms:Math.round(state.elapsed),sampleIntervalTarget_ms:50,freshSignalCoverage:coverage(),viewport:state.viewport,activityRect:state.activityRect,regions:state.regions,samples:state.samples,limitations:'Engineering heuristics for adult exploratory use. No clinical, attention, fixation, or comprehension inference. Face movement proxy is not a calibrated head pose. Repeated predictions may indicate fresh signal availability, but are excluded from accuracy samples and heatmap density.'};}
function exportContent(type){const report=sessionReport(),keys=['t_ms','prediction_id','prediction_age_ms','x','y','valid','available','reason','offscreen','activity_x','activity_y','region'];return type==='json'?JSON.stringify(report,null,2):['mode,quality,story_id,'+keys.join(','),...state.samples.map(s=>[state.mode,report.quality,state.story.id,...keys.map(k=>s[k]??'')].join(','))].join('\n');}
function saveFile(content,mime,filename){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function download(type){saveFile(exportContent(type),type==='json'?'application/json':'text/csv',`faraday-${state.mode}-${state.story.id}-${Date.now()}.${type}`);}
function cancelTargets(){hideCalibrationControls();collecting=false;activeValidation=null;$('#overlay').hidden=true;if(checkPurpose==='post'&&state.phase==='postcheck'){state.postCheck=null;renderReview();}else if(state.phase==='calibration')showCalibrationIntro();else showValidationIntro();}
$('#cancelTarget').onclick=cancelTargets;
function reset(){hideCalibrationControls();state.epoch++;collecting=false;activeValidation=null;state.running=false;window.webgazer?.getRegression()[0]?.init();stopCamera();window.webgazer=undefined;trackerPromise=null;Object.assign(state,{mode:null,phase:'setup',latest:null,face:null,pose:null,baseline:null,calibrated:false,validation:null,preChecks:[],postCheck:null,samples:[],elapsed:0,story:null,invalidated:false,interruptions:[],calibrationLog:[],calibrationPoses:[],calibrationModel:null,activityRect:null,regions:[],viewport:null,validationHistory:[]});$('#overlay').hidden=true;$('#modeBadge').textContent='Choose a way to start';$('#source').textContent='Not connected';$('#calStatus').textContent='Not started';$('#accuracy').textContent='—';$('#sampleCount').textContent='0';setup();message('Camera disconnected.');}
window.addEventListener('resize',()=>{if(!state.mode)return;state.calibrated=false;if(state.phase==='review')return;state.invalidated=true;state.preChecks=[];collecting=false;activeValidation=null;$('#overlay').hidden=true;$('#calStatus').textContent='Window changed';if(['postcheck','post-intro'].includes(state.phase)){state.postCheck=null;renderReview();}else if(['recording','paused'].includes(state.phase)){state.running=false;finish();}else showCalibrationIntro();message('The window size changed. Start the nine dots again.');});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(!$('#overlay').hidden)cancelTargets();if(state.running)pauseRecording('Browser tab hidden');}});
const studioNav=document.querySelectorAll('nav button[data-view]');
studioNav.forEach(b=>b.onclick=()=>{if(state.running)pauseRecording('Left observation studio');document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==b.dataset.view);studioNav.forEach(x=>x.classList.toggle('active',x===b));});
if(embeddedStudio)window.addEventListener('faraday:close-studio',reset);
window.addEventListener('pagehide',()=>{if(state.mode||cameraStarting)reset();});
setInterval(()=>{if(document.hidden)return;collectCalibration();collectValidation();},25);
setup();requestAnimationFrame(tick);
