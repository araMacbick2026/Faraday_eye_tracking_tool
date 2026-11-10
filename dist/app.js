'use strict';
const $=s=>document.querySelector(s);
const embeddedStudio=document.body?.classList.contains('pilot');
const state={mode:null,phase:'setup',latest:null,calibrated:false,validation:null,samples:[],started:0,elapsed:0,running:false,raf:0,epoch:0,viewport:null};
let targetTimer,validationRows=[],activeValidation=null,calIndex=0,calClicks=0,lastSample=0,lastTick=0;
const calibration=[[.1,.18],[.5,.18],[.9,.18],[.1,.5],[.5,.5],[.9,.5],[.1,.82],[.5,.82],[.9,.82]];
const checks=[[.25,.3],[.75,.3],[.5,.55],[.25,.72],[.75,.72]];
const quantile=(a,q)=>{if(!a.length)return null;const s=[...a].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor((s.length-1)*q))]};
const fmt=n=>n==null?'—':Math.round(n)+' px';
function phase(p,n){state.phase=p;document.querySelectorAll('.steps span').forEach((s,i)=>s.classList.toggle('selected',i===n-1));}
function message(s){$('#signal').textContent=s;}
function setDesk(html){$('#desk').innerHTML=html;}
function setup(){phase('setup',1);setDesk(`<div class="welcome"><div class="eyebrow">EXPERIMENT NO. 001</div><h2>Where does a learner look?</h2><p>A short reading experiment, a simple webcam, and a transparent look at the quality of the signal.</p><label class="consent"><input id="consent" type="checkbox"><span>I agree to enable my camera for this exploratory demo. Camera frames are processed locally and video is never recorded. Raw samples stay in your browser. Tracking assets load from this site.</span></label><div class="actions"><button class="solid" id="camera" disabled>Connect camera ↗</button><button class="secondary" id="rehearse">Rehearse with pointer →</button></div><p class="small-note">ABOUT 5 MINUTES · DESKTOP RECOMMENDED · ADULT TESTING</p><div id="error" role="status"></div></div>`);$('#consent').onchange=e=>$('#camera').disabled=!e.target.checked;$('#camera').onclick=startCamera;$('#rehearse').onclick=()=>startMode('pointer');}
let trackerPromise,cameraStarting=false;
function timeoutError(stage){const e=new Error(stage+' timed out');e.name='TimeoutError';return e;}
function withTimeout(promise,ms,stage){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(timeoutError(stage)),ms);})]).finally(()=>clearTimeout(timer));}
function stopCamera(){
  const video=document.getElementById('webgazerVideoFeed');
  if(video?.srcObject){video.srcObject.getTracks().forEach(track=>track.stop());video.srcObject=null;}
  try{window.webgazer?.removeMouseEventListeners();window.webgazer?.end();}catch{/* A failed start may not have created the preview. */}
  document.querySelectorAll('#webgazerVideoContainer,#webgazerGazeDot').forEach(el=>el.remove());
}
function cameraFailure(error,stage){
  const name=error?.name||'Error';
  if(name==='NotAllowedError'||name==='PermissionDeniedError'||name==='SecurityError')return 'Camera access was blocked. Open this link in Chrome or Edge in a separate browser window, allow camera access for this site, and check Windows Settings → Privacy & security → Camera if it is still blocked.';
  if(name==='NotFoundError'||name==='DevicesNotFoundError')return 'No camera was found. Connect or enable your webcam, then reload and try again.';
  if(name==='NotReadableError'||name==='TrackStartError')return 'The camera could not be opened. Close other apps using it (such as a video meeting), check the webcam privacy switch, then reload and try again.';
  if(name==='OverconstrainedError')return 'This camera could not use the requested settings. Try another webcam or a desktop browser.';
  if(name==='TimeoutError')return 'Startup took too long during '+stage+'. If no camera prompt appeared, open the site in Chrome or Edge outside this embedded browser. Otherwise check camera permission, then reload to retry.';
  if(name==='UnsupportedError')return 'This browser does not expose camera access. Open the same link directly in Chrome or Edge on your computer.';
  return 'Tracking could not initialize during '+stage+'. Reload to retry. If you are using an embedded browser, open this link directly in Chrome or Edge.';
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
  const button=$('#camera');button.disabled=true;button.textContent='Checking camera…';$('#rehearse').disabled=true;$('#error').textContent='';
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
    installFaceMonitor();webgazer.setRegression('ridge').setGazeListener(ingest);
    stage='camera permission and face-tracking initialization';button.textContent='Allow camera to continue…';$('#error').textContent='Allow camera access when prompted. Initializing the local tracking model can take a few seconds.';
    const startup=Promise.resolve(webgazer.begin());
    startup.then(()=>{if(epoch!==state.epoch)stopCamera();},()=>{});
    await withTimeout(startup,45000,stage);
    if(epoch!==state.epoch){stopCamera();return;}
    webgazer.removeMouseEventListeners();webgazer.showPredictionPoints(false);webgazer.showVideoPreview(true);startMode('camera');
  }catch(error){
    if(epoch!==state.epoch)return;
    state.epoch++;stopCamera();
    console.warn('Faraday camera startup:',stage,error?.name,error?.message);
    $('#error').textContent=cameraFailure(error,stage)+' You can still rehearse the workflow with the pointer.';
    button.disabled=false;button.textContent=embeddedStudio?'Reset camera setup':'Reload & retry camera ↗';button.onclick=embeddedStudio?reset:()=>location.reload();$('#rehearse').disabled=false;
  }finally{cameraStarting=false;}
}
const R=window.Reliability;
Object.assign(state,{sequence:0,frameSequence:0,face:null,stableSince:0,pose:null,baseline:null,preChecks:[],postCheck:null,story:null,invalidated:false,interruptions:[],calibrationLog:[],validationHistory:[],lastPredictionId:0});
let collecting=false,calSamples=0,calLastFrame=0,calLastAt=0,calSettle=0,calLastProgressAt=0,calPointStarted=0,calAnchor=null,movementSince=0,checkPurpose='pre',checkIndex=0,checkStarted=0,checkLastSlot=-1,checkLastId=0,recordNext=50,badSince=0;
let calibrationPath=calibration.map((_,i)=>i),refining=false;
const now=()=>performance.now();
function ingest(data){
 if(state.mode!=='camera')return;
 state.latest=data&&Number.isFinite(data.x)&&Number.isFinite(data.y)?{x:data.x,y:data.y,t:now(),id:++state.sequence}:null;
}
function installFaceMonitor(){
 const tracker=webgazer.getTracker();if(tracker.faradayWrapped)return;
 const original=tracker.getEyePatches;tracker.faradayWrapped=true;
 tracker.getEyePatches=async function(...args){
  let patches;try{patches=await original.apply(this,args);}catch(error){state.face=null;state.trackerError=error?.message||'Face tracking interrupted';return null;}
  const p=this.getPositions?.();const canvas=args[1];
  if(patches&&p?.[263]&&canvas?.width&&canvas?.height){state.trackerError=null;
   const pose={x:p[1][0]/canvas.width,y:p[1][1]/canvas.height,scale:Math.hypot(p[33][0]-p[263][0],p[33][1]-p[263][1])/canvas.width};
   if(!state.pose||R.movement(state.pose,pose))state.stableSince=now();
   state.pose=pose;state.face={...pose,t:now(),id:++state.frameSequence};
  }else{state.face=null;state.pose=null;state.stableSince=now();}
  return patches;
 };
}
function faceReady(){return state.mode==='pointer'||!!(state.face&&now()-state.face.t<600&&now()-state.stableSince>=600);}
function headMoved(){return state.mode==='camera'&&state.face&&state.baseline&&R.positionChanged(state.baseline,state.face);}
function startMode(mode){if(mode==='pointer')stopCamera();state.mode=mode;state.latest=null;state.preChecks=[];state.invalidated=false;$('#modeBadge').textContent=mode==='camera'?'LIVE WEBCAM':'POINTER REHEARSAL';$('#source').textContent=mode==='camera'?'Webcam estimate':'Pointer (not gaze)';showCalibrationIntro();}
document.addEventListener('pointermove',e=>{if(state.mode==='pointer')state.latest={x:e.clientX,y:e.clientY,t:now(),id:++state.sequence};});
function pointerPrediction(){const p=state.latest;return p?{...p,t:now(),id:++state.sequence}:null;}
function fresh(){const p=state.mode==='pointer'?pointerPrediction():state.latest;return p&&now()-p.t<R.limits.maxAgeMs&&Number.isFinite(p.x)&&Number.isFinite(p.y)?p:null;}
function showCalibrationIntro(){phase('calibration',2);setDesk(`<div class="welcome"><div class="eyebrow">01 / BUILD A BETTER SIGNAL</div><h2>Nine points. A steady gaze.</h2><p>Click each target once, then keep looking at its centre. The tool collects 15 spaced eye-feature samples only while your face is visible and steady. Hold for about three seconds per point; move naturally between targets.</p><p>${state.mode==='pointer'?'Pointer rehearsal uses the same timing. It cannot demonstrate webcam accuracy.':'The camera preview stays behind the target screen. If collection pauses, face the camera and settle before continuing.'}</p><div class="actions"><button class="solid" id="calibrate">Begin guided calibration →</button><button class="secondary" id="reset">Clear & disconnect</button></div></div>`);$('#calibrate').onclick=beginCalibration;$('#reset').onclick=reset;message('○ Guided calibration required');}
function placeTarget(pt){$('#target').style.left=pt[0]*innerWidth+'px';$('#target').style.top=pt[1]*innerHeight+'px';}
function beginCalibration(){
 refining=false;calibrationPath=calibration.map((_,i)=>i);
 phase('calibration',2);
 state.viewport={width:innerWidth,height:innerHeight,dpr:devicePixelRatio};state.validation=null;state.preChecks=[];state.postCheck=null;state.calibrated=false;state.invalidated=false;state.baseline=null;state.calibrationLog=[];
 $('#accuracy').textContent='—';if(state.mode==='camera')webgazer.clearData();calIndex=0;calSamples=0;collecting=false;$('#overlay').hidden=false;$('#target').disabled=false;$('#target').onclick=clickCalibration;calTarget();
}
function calTarget(){showCalibrationControls();collecting=false;calAnchor=null;calSamples=0;calLastFrame=0;placeTarget(calibration[calibrationPath[calIndex]]);$('#target').textContent='+';$('#targetInstruction').textContent=`${refining?'Refinement':'Calibration'} ${calIndex+1}/${calibrationPath.length} · Click once, then look steadily`;$('#targetProgress').textContent='Click the target to begin collecting';}
function clickCalibration(){if(collecting)return;collecting=true;state.trackerError=null;calPointStarted=now();calAnchor=null;calLastProgressAt=now();calSettle=now()+700;calLastAt=0;$('#target').textContent='·';}
function showCalibrationControls(){
 let controls=document.getElementById('calibrationControls');
 if(!controls){controls=document.createElement('div');controls.id='calibrationControls';controls.className='calibration-controls';controls.innerHTML='<button id="restartCalibration">Restart all 9 points</button><button id="reconnectCalibration">Reconnect camera</button><button id="exitCalibration">Cancel calibration</button>';$('#overlay').appendChild(controls);}
 controls.hidden=false;
 $('#restartCalibration').onclick=beginCalibration;$('#reconnectCalibration').onclick=reset;$('#exitCalibration').onclick=cancelTargets;
}
function hideCalibrationControls(){const controls=document.getElementById('calibrationControls');if(controls)controls.hidden=true;}
function calibrationStatus(text){$('#targetProgress').textContent=`${calSamples}/15 samples · ${text}`;}
function collectCalibration(){
 if(!collecting||state.phase!=='calibration'||$('#overlay').hidden)return;
 if(now()-calLastProgressAt>=15000){collecting=false;$('#target').textContent='!';calibrationStatus('Collection stopped. Restart calibration, or reconnect the camera if it keeps stopping.');return;}
 if(now()<calSettle)return;
 if(state.trackerError){calibrationStatus('Tracker interrupted · Reconnect the camera');return;}
 if(state.mode==='camera'&&(!state.face||now()-state.face.t>=600)){calibrationStatus('No fresh eye frames · Face the camera. Reconnect if this persists.');return;}
 if(!faceReady()){calibrationStatus('Face moving · Hold your head steady');return;}
 if(state.mode==='camera'){
  if(!calAnchor)calAnchor={...state.face};
  else if(R.movement(calAnchor,state.face)){calAnchor={...state.face};calSettle=now()+650;calibrationStatus('Settling at this target · Hold comfortably still');return;}
 }
 if(now()-calLastAt<130)return;
 if(state.mode==='camera'&&state.face.id===calLastFrame){calibrationStatus('Waiting for a new eye frame · Keep looking at the target');return;}
 const pt=calibration[calibrationPath[calIndex]],x=pt[0]*innerWidth,y=pt[1]*innerHeight;
 if(state.mode==='camera'){try{webgazer.recordScreenPosition(x,y,'click');}catch(error){collecting=false;state.trackerError=error?.message;calibrationStatus('Training interrupted · Restart calibration or reconnect');return;}calLastFrame=state.face.id;}
 calLastAt=now();calLastProgressAt=now();calSamples++;calibrationStatus('Keep looking at the centre');
 if(calSamples===15){state.calibrationLog.push({point:calibrationPath[calIndex]+1,refinement:refining,x,y,samples:calSamples});calIndex++;collecting=false;if(calIndex===calibrationPath.length){hideCalibrationControls();$('#overlay').hidden=true;state.calibrated=true;state.baseline=state.face?{...state.face}:null;$('#calStatus').textContent=`${state.calibrationLog.reduce((n,p)=>n+p.samples,0)} training samples${refining?' · refined':''}`;showValidationIntro();}else calTarget();}
}
function showValidationIntro(){phase('validation',3);setDesk(`<div class="welcome"><div class="eyebrow">02 / INDEPENDENT CHECKS</div><h2>Check twice. Then observe.</h2><p>Run two separate five-target checks. Look at each target for four seconds without clicking. These measurements never train the model.</p><p>Each target needs median error ≤120 px, 90th-percentile error ≤200 px, ≥70% fresh signal coverage, and ≥10 unique predictions. These are provisional engineering criteria for broad regions.</p><div class="actions"><button class="solid" id="validate">Run check ${state.preChecks.length+1} of 2 →</button><button class="secondary" id="recalibrate">Recalibrate</button></div></div>`);$('#validate').onclick=()=>beginValidation('pre');$('#recalibrate').onclick=showCalibrationIntro;}
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
 $('#targetProgress').textContent=`${Math.ceil((4000-elapsed)/1000)}s remaining · ${activeValidation.errors.length} fresh predictions`;
}
function checkTable(v){return `<table class="quality-table"><thead><tr><th>Target</th><th>Median</th><th>90th %</th><th>Signal coverage</th><th>Predictions/s</th><th>Result</th></tr></thead><tbody>${v.targets.map(r=>`<tr><td>${r.point}</td><td>${fmt(r.median)}</td><td>${fmt(r.p90)}</td><td>${Math.round(r.coverage*100)}%</td><td>${r.predictionsPerSecond.toFixed(1)}</td><td>${r.pass?'Pass':'Repeat'}</td></tr>`).join('')}</tbody></table>`;}
function targetMap(v){const w=state.viewport?.width||innerWidth,h=state.viewport?.height||innerHeight;return `<div class="target-map"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Accuracy map: target rings and median estimated positions">${v.targets.filter(t=>t.target&&t.offsetX!==null&&t.offsetY!==null).map(t=>{const x=t.target.x+t.offsetX,y=t.target.y+t.offsetY;return `<line x1="${t.target.x}" y1="${t.target.y}" x2="${x}" y2="${y}" stroke="#c95632" stroke-width="5"/><circle cx="${t.target.x}" cy="${t.target.y}" r="18" stroke="#365e4e" stroke-width="6" fill="none"/><circle cx="${x}" cy="${y}" r="12" fill="#c95632"/><text x="${t.target.x+25}" y="${t.target.y-25}" font-size="36" fill="#242e2a">${t.point}</text>`;}).join('')}</svg><p class="fine">Green rings: known targets. Orange dots: median estimated positions. Lines show displacement; positions outside the screen may be clipped. This is a diagnostic map, not a gaze heatmap.</p></div>`;}
function diagnosticPanel(v){return `<div class="diagnostics"><div class="eyebrow">WHAT TO DO NEXT</div>${R.diagnose(v).map(m=>`<p>${m}</p>`).join('')}<p class="fine">Signal coverage measures whether a recent estimate exists. Prediction rate counts independent callbacks. A slower webcam can have good coverage; repeated estimates never count as extra accuracy measurements.</p></div>`;}
function beginRefinement(){
 const bad=state.validation?.targets.filter(t=>!t.pass&&t.median!==null).sort((a,b)=>b.median-a.median)[0];if(!bad)return;
 calibrationPath=R.refinementPoints({x:bad.target.x/innerWidth,y:bad.target.y/innerHeight},calibration);refining=true;state.preChecks=[];state.postCheck=null;state.calibrated=false;state.baseline=null;state.invalidated=false;calIndex=0;phase('calibration',2);$('#overlay').hidden=false;$('#target').disabled=false;$('#target').onclick=clickCalibration;calTarget();
}
function downloadValidation(){const report={schema:'faraday.validation.v1',exportedAt:new Date().toISOString(),mode:state.mode,thresholds:R.limits,viewport:state.viewport,calibration:state.calibrationLog,validation:state.validation,history:state.validationHistory,nonclinical:true};saveFile(JSON.stringify(report,null,2),'application/json',`faraday-validation-${Date.now()}.json`);}
function finishValidation(){
 const result={...R.summarize(validationRows),purpose:checkPurpose,mode:state.mode,checkedAt:new Date().toISOString(),viewport:state.viewport};state.validationHistory.push(result);
 if(checkPurpose==='post'){state.postCheck=result;renderReview();return;}
 if(result.pass){state.preChecks.push(result);state.baseline=state.face?{...state.face}:null;}else state.preChecks=[];
 state.validation=result;$('#accuracy').textContent=fmt(result.median);phase('validated',3);
 const ready=state.preChecks.length>=2;
 setDesk(`<div class="welcome"><div class="eyebrow">${state.mode==='pointer'?'POINTER REHEARSAL / ':''}${result.pass?'CHECK PASSED':'QUALITY GATE FAILED'}</div><h2>${!result.pass?'Review the failed targets.':ready?'Two checks complete.':'A second check confirms consistency.'}</h2>${checkTable(result)}${targetMap(result)}${diagnosticPanel(result)}<p>${state.mode==='pointer'?'These are pointer measurements, not webcam reliability results. ':''}Thresholds apply to every target, not just the overall median. Failed checks reset the consecutive-check count.</p><div class="actions">${result.pass?`<button class="solid" id="nextCheck">${ready?'Choose a story':'Run second check'} →</button>`:''}<button class="secondary" id="recalibrate">Full recalibration</button>${!result.pass?'<button class="solid" id="refine">Refine weak area</button><button class="secondary" id="retryCheck">Repeat accuracy check</button>':''}<button class="secondary" id="exportValidation">Download diagnostics ↓</button>${state.mode==='pointer'&&!result.pass?'<button class="secondary" id="demoContinue">Preview story (rehearsal only)</button>':''}</div></div>`);
 if(result.pass)$('#nextCheck').onclick=ready?()=>showActivity(true):()=>beginValidation('pre');
 $('#recalibrate').onclick=showCalibrationIntro;$('#exportValidation').onclick=downloadValidation;
 if(!result.pass){$('#refine').onclick=beginRefinement;$('#refine').disabled=!result.targets.some(t=>!t.pass&&t.median!==null);$('#retryCheck').onclick=()=>beginValidation('pre');}
 if(state.mode==='pointer'&&!result.pass)$('#demoContinue').onclick=()=>showActivity(true);
 message(result.pass?'● Accuracy check complete':'○ Failed quality gate · recording blocked');
}
function chooseStory(){state.story=R.choose(window.STORIES,state.story?.id);}
function lesson(){const s=state.story;return `<div class="activity" id="activity"><div class="activity-inner"><article data-region="reading"><div class="eyebrow">${s.category} · ${s.id.toUpperCase()}</div><h2>${s.title}</h2>${s.paragraphs.map(p=>`<p>${p}</p>`).join('')}<p><b>Consider:</b> ${s.question}</p></article><div class="diagram" data-region="diagram"><span class="story-symbol" aria-hidden="true">${s.symbol}</span><div class="eyebrow">STORY THREAD</div>${s.diagram.map((p,i)=>`<p>${i?'↓<br>':''}${p}</p>`).join('')}</div></div><canvas id="heatmap" hidden></canvas></div>`;}
function showActivity(randomize=false){
 if(state.mode==='camera'&&(state.preChecks.length<2||state.invalidated)){showCalibrationIntro();return;}
 if(randomize||!state.story)chooseStory();phase('ready',4);
 setDesk(`<div class="actions"><button class="solid" id="start">Start 45-second observation →</button><button class="secondary" id="shuffle">Another random story ↻</button><button class="secondary" id="redo">Recheck accuracy</button></div><p class="small-note">STORY ${window.STORIES.findIndex(s=>s.id===state.story.id)+1} OF ${window.STORIES.length} · ORIGINAL FICTION · STORY ID SAVED IN EXPORT</p>${lesson()}<p class="small-note">READ NATURALLY · A POST-ACTIVITY CHECK IS REQUIRED FOR INTERPRETATION</p>`);
 $('#start').onclick=startRecording;$('#shuffle').onclick=()=>showActivity(true);$('#redo').onclick=()=>{state.preChecks=[];showValidationIntro();};
}
function rectJSON(r){return{x:r.x,y:r.y,width:r.width,height:r.height};}
function inside(p,r){return p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height;}
function captureLayout(){state.activityRect=rectJSON($('#activity').getBoundingClientRect());state.regions=[...document.querySelectorAll('[data-region]')].map(e=>({name:e.dataset.region,rect:rectJSON(e.getBoundingClientRect())}));}
function startRecording(){
 if(state.mode==='camera'&&(state.preChecks.length<2||!faceReady()||headMoved())){message('○ Face not steady or position changed · recalibrate');showCalibrationIntro();return;}
 state.samples=[];state.elapsed=0;state.postCheck=null;state.interruptions=[];state.invalidated=false;state.lastPredictionId=0;recordNext=50;badSince=0;movementSince=0;
 $('#activity').scrollIntoView({block:'center'});captureLayout();state.viewport={width:innerWidth,height:innerHeight,dpr:devicePixelRatio};
 state.running=true;phase('recording',4);$('#start').outerHTML='<button class="secondary" id="pause">Pause</button><button class="solid" id="finish">Finish & check drift →</button><span id="clock">00:45</span>';$('#shuffle').hidden=true;$('#redo').hidden=true;
 $('#pause').onclick=togglePause;$('#finish').onclick=finish;lastTick=now();message('● Recording unique predictions');
}
function pauseRecording(reason){if(!state.running)return;state.running=false;state.interruptions.push({at_ms:Math.round(state.elapsed),reason});if($('#pause'))$('#pause').textContent='Resume';message('○ Paused · '+reason);}
function togglePause(){if(state.running){pauseRecording('Manual pause');return;}if(state.invalidated){finish();return;}if(!faceReady()||headMoved()||!fresh()){message('○ Face the camera and hold steady before resuming');return;}state.running=true;lastTick=now();badSince=0;$('#pause').textContent='Pause';message('● Recording resumed');}
function addRecordingSlot(t,forceMissing=false){
 captureLayout();const p=forceMissing?null:fresh();const available=!!(p&&faceReady()&&!headMoved());const valid=available&&p.id!==state.lastPredictionId;if(valid)state.lastPredictionId=p.id;
 state.samples.push({t_ms:t,available,prediction_id:valid?p.id:null,prediction_age_ms:p?Math.round(now()-p.t):null,x:valid?Math.round(p.x):null,y:valid?Math.round(p.y):null,valid,reason:valid?'fresh':forceMissing?'scheduler-gap':!p?'missing-or-stale':p.id===state.lastPredictionId?'repeated-prediction':'face-or-position',offscreen:valid&&(p.x<0||p.x>innerWidth||p.y<0||p.y>innerHeight),activity_x:valid?p.x-state.activityRect.x:null,activity_y:valid?p.y-state.activityRect.y:null,region:valid?state.regions.find(r=>inside(p,r.rect))?.name||'outside activity':'missing'});
}
function tick(time){
 if(state.running){const dt=Math.max(0,time-lastTick);state.elapsed=Math.min(45000,state.elapsed+dt);
  while(recordNext<=state.elapsed){addRecordingSlot(recordNext,state.elapsed-recordNext>=100);recordNext+=50;}
  $('#sampleCount').textContent=state.samples.filter(s=>s.valid).length;
  if($('#clock'))$('#clock').textContent='00:'+String(Math.max(0,Math.ceil((45000-state.elapsed)/1000))).padStart(2,'0');
  if(headMoved()){if(!movementSince)movementSince=time;if(time-movementSince>=R.limits.positionSustainedMs){state.invalidated=true;pauseRecording('Sustained position change · finish and recalibrate');}}else movementSince=0;
  if(!faceReady()||!fresh()){if(!badSince)badSince=time;if(time-badSince>900)pauseRecording('Signal lost · face the camera before resuming');}else badSince=0;
  if(state.elapsed>=45000)finish();
 }
 lastTick=time;state.raf=requestAnimationFrame(tick);
}
function finish(){
 state.running=false;phase('post-intro',5);captureLayout();
 setDesk(`<div class="welcome"><div class="eyebrow">05 / DID THE SIGNAL DRIFT?</div><h2>One final check.</h2><p>The recording is held in memory. Look at five independent targets again so we can compare accuracy before and after this story.</p><p>Skipping this check leaves the session unsuitable for interpretation.</p><div class="actions"><button class="solid" id="post">Run after-activity check →</button><button class="secondary" id="skipPost">Review as unverified</button></div></div>`);
 $('#post').onclick=()=>beginValidation('post');$('#skipPost').onclick=()=>{state.postCheck=null;renderReview();};
}
function coverage(){return state.samples.length?state.samples.filter(s=>s.available??s.valid).length/state.samples.length:0;}
function sessionQuality(){const pre={...state.validation,pass:state.preChecks.length>=2&&!!state.validation?.pass};return R.quality(state.mode,pre,state.postCheck,coverage(),state.invalidated);}
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
 phase('review',5);const quality=sessionQuality(),usable=quality==='provisional-broad-region-only',valid=state.samples.filter(s=>s.valid),drift=state.postCheck?.median!=null&&state.validation?.median!=null?state.postCheck.median-state.validation.median:null;
 setDesk(`<div class="welcome"><div class="eyebrow">${state.mode==='pointer'?'POINTER REHEARSAL':'WEBCAM SESSION'} / ${state.story.title}</div><h2>${usable?'A provisional broad view.':'Measurements before interpretation.'}</h2><div class="stats"><div><b>${(state.elapsed/1000).toFixed(1)}s</b><span>ACTIVE TIME</span></div><div><b>${Math.round(coverage()*100)}%</b><span>FRESH SIGNAL COVERAGE</span></div><div><b>${valid.length}</b><span>UNIQUE PREDICTIONS</span></div></div><div class="notice">${state.mode==='pointer'?'Pointer rehearsal only. These are not eye movements.':usable?'Both pre-checks and the post-check passed provisional criteria. This is not proof of research-grade accuracy.':'NOT SUITABLE FOR INTERPRETATION. A check failed, was skipped, the signal coverage was too low, or the position changed.'}</div><p>Before: ${fmt(state.validation?.median)} · After: ${fmt(state.postCheck?.median)} · Median change: ${drift===null?'not checked':Math.round(drift)+' px'} · Pauses: ${state.interruptions.length}</p>${state.postCheck?checkTable(state.postCheck):'<p>After-activity validation was not completed.</p>'}</div>${lesson()}<div class="actions"><button class="secondary" id="heatToggle">${usable||state.mode==='pointer'?'Hide heatmap':'Show diagnostic heatmap'}</button></div><p class="small-note" id="regions"></p><div class="actions"><button class="solid" id="json">Export full session JSON ↓</button><button class="secondary" id="csv">Raw samples CSV ↓</button><button class="secondary" id="again">New story & checks</button><button class="secondary" id="clear">Clear & disconnect</button></div><p class="fine">Density shows unique prediction samples, not verified fixations or attention. Region “missing” includes slots with no new independent prediction, even when a recent signal remains available. Failed sessions hide the heatmap by default. Prototype gates: each target median ≤120 px, p90 ≤200 px, coverage ≥70%; post-check median increase ≤60 px. These thresholds require pilot validation.</p>`);
 const visible=usable||state.mode==='pointer';$('#heatmap').hidden=!visible;if(visible)drawHeatmap();$('#heatToggle').onclick=()=>{const c=$('#heatmap');c.hidden=!c.hidden;if(!c.hidden)drawHeatmap();$('#heatToggle').textContent=c.hidden?'Show diagnostic heatmap':'Hide heatmap';};
 $('#regions').textContent=['reading','diagram','outside activity','missing'].map(r=>`${r}: ${state.samples.length?Math.round(state.samples.filter(s=>s.region===r).length/state.samples.length*100):0}%`).join(' · ');
 $('#json').onclick=()=>download('json');$('#csv').onclick=()=>download('csv');$('#again').onclick=()=>{state.preChecks=[];state.postCheck=null;chooseStory();if(state.invalidated)showCalibrationIntro();else showValidationIntro();};$('#clear').onclick=reset;message('○ Review ready · '+quality);
 if(embeddedStudio||location.pathname==='/pilot/studio'){
  const resultsLink=embeddedStudio?'<button type="button" class="secondary" id="showSavedObservation">View saved summary ↓</button>':'<a class="text-link" href="/pilot/#eye-tracking">Open eye-tracking dashboard →</a>';
  $('#regions').insertAdjacentHTML('afterend',`<div class="actions"><button class="solid" id="saveObservation">Save summary to athlete dashboard</button>${resultsLink}</div><p class="fine">Saving replaces the previous shared summary. Export the session before closing the activity if you want to keep the full results.</p><p id="observationStatus" role="status"></p>`);
  const button=$('#saveObservation');
  const status=$('#observationStatus');
  button.onclick=()=>saveObservation(button,status);
  if(embeddedStudio)$('#showSavedObservation').onclick=()=>$('#pilot-observation-card').focus();
 }
}
function drawHeatmap(){const c=$('#heatmap'),r=state.activityRect;c.width=r.width;c.height=r.height;const ctx=c.getContext('2d');for(const s of state.samples){if(!s.valid||s.activity_x<0||s.activity_x>r.width||s.activity_y<0||s.activity_y>r.height)continue;const x=s.activity_x,y=s.activity_y;const g=ctx.createRadialGradient(x,y,0,x,y,32);g.addColorStop(0,'rgba(201,86,50,.08)');g.addColorStop(.5,'rgba(219,153,61,.035)');g.addColorStop(1,'rgba(219,153,61,0)');ctx.fillStyle=g;ctx.fillRect(x-32,y-32,64,64);}}
function sessionReport(){return{schema:'faraday.observatory.v3',exportedAt:new Date().toISOString(),mode:state.mode,nonclinical:true,quality:sessionQuality(),thresholds:R.limits,samplingDefinitions:{available:'Recent prediction (age <250ms), stable visible face and acceptable position; may repeat a callback ID.',valid:'Independent prediction ID selected once; used for spatial density and raw accuracy samples.',coverage:'Available slots divided by scheduled slots; scheduler gaps remain unavailable.'},story:state.story,calibration:state.calibrationLog,validationHistory:state.validationHistory,preChecks:state.preChecks,lastPreCheck:state.validation,postCheck:state.postCheck,positionInvalidated:state.invalidated,interruptions:state.interruptions,duration_ms:Math.round(state.elapsed),sampleIntervalTarget_ms:50,freshSignalCoverage:coverage(),viewport:state.viewport,activityRect:state.activityRect,regions:state.regions,samples:state.samples,limitations:'Engineering heuristics for adult exploratory use. No clinical, attention, fixation, or comprehension inference. Face movement proxy is not a calibrated head pose. Repeated predictions may indicate fresh signal availability, but are excluded from accuracy samples and heatmap density.'};}
function exportContent(type){const report=sessionReport(),keys=['t_ms','prediction_id','prediction_age_ms','x','y','valid','available','reason','offscreen','activity_x','activity_y','region'];return type==='json'?JSON.stringify(report,null,2):['mode,quality,story_id,'+keys.join(','),...state.samples.map(s=>[state.mode,report.quality,state.story.id,...keys.map(k=>s[k]??'')].join(','))].join('\n');}
function saveFile(content,mime,filename){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function download(type){saveFile(exportContent(type),type==='json'?'application/json':'text/csv',`faraday-${state.mode}-${state.story.id}-${Date.now()}.${type}`);}
function cancelTargets(){hideCalibrationControls();collecting=false;activeValidation=null;$('#overlay').hidden=true;if(checkPurpose==='post'&&state.phase==='postcheck'){state.postCheck=null;renderReview();}else if(state.phase==='calibration')showCalibrationIntro();else showValidationIntro();}
$('#cancelTarget').onclick=cancelTargets;
function reset(){hideCalibrationControls();state.epoch++;collecting=false;activeValidation=null;state.running=false;if(window.webgazer)webgazer.clearData();stopCamera();window.webgazer=undefined;trackerPromise=null;Object.assign(state,{mode:null,phase:'setup',latest:null,face:null,pose:null,baseline:null,calibrated:false,validation:null,preChecks:[],postCheck:null,samples:[],elapsed:0,story:null,invalidated:false,interruptions:[],validationHistory:[]});$('#overlay').hidden=true;$('#modeBadge').textContent='NO SESSION';$('#source').textContent='Not connected';$('#calStatus').textContent='Not started';$('#accuracy').textContent='—';$('#sampleCount').textContent='0';setup();message('○ Cleared · camera disconnected');}
window.addEventListener('resize',()=>{if(!state.mode)return;state.invalidated=true;state.calibrated=false;state.preChecks=[];collecting=false;activeValidation=null;$('#overlay').hidden=true;$('#calStatus').textContent='Window changed';if(['review','postcheck','post-intro'].includes(state.phase)){state.postCheck=null;renderReview();}else if(['recording','paused'].includes(state.phase)){state.running=false;finish();}else showCalibrationIntro();message('○ Window changed · new calibration required');});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(!$('#overlay').hidden)cancelTargets();if(state.running)pauseRecording('Browser tab hidden');}});
const studioNav=document.querySelectorAll('nav button[data-view]');
studioNav.forEach(b=>b.onclick=()=>{if(state.running)pauseRecording('Left observation studio');document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==b.dataset.view);studioNav.forEach(x=>x.classList.toggle('active',x===b));});
if(embeddedStudio)window.addEventListener('faraday:close-studio',reset);
window.addEventListener('beforeunload',stopCamera);
setInterval(()=>{if(document.hidden)return;collectCalibration();collectValidation();},50);
setup();state.raf=requestAnimationFrame(tick);
