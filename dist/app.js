'use strict';
const $=s=>document.querySelector(s);
const state={mode:null,phase:'setup',latest:null,calibrated:false,validation:null,samples:[],started:0,elapsed:0,running:false,raf:0,epoch:0,viewport:null};
let targetTimer,validationRows=[],activeValidation=null,calIndex=0,calClicks=0,lastSample=0,lastTick=0;
const calibration=[[.1,.18],[.5,.18],[.9,.18],[.1,.5],[.5,.5],[.9,.5],[.1,.82],[.5,.82],[.9,.82]];
const checks=[[.25,.3],[.75,.3],[.5,.55],[.25,.72],[.75,.72]];
const quantile=(a,q)=>{if(!a.length)return null;const s=[...a].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor((s.length-1)*q))]};
const fmt=n=>n==null?'—':Math.round(n)+' px';
function phase(p,n){state.phase=p;document.querySelectorAll('.steps span').forEach((s,i)=>s.classList.toggle('selected',i===n-1));}
function message(s){$('#signal').textContent=s;}
function setDesk(html){$('#desk').innerHTML=html;}
function setup(){phase('setup',1);setDesk(`<div class="welcome"><div class="eyebrow">EXPERIMENT NO. 001</div><h2>Where does a learner look?</h2><p>A short reading experiment, a simple webcam, and a transparent look at the quality of the signal.</p><label class="consent"><input id="consent" type="checkbox"><span>I agree to enable my camera for this exploratory demo. Frames are processed locally; nothing is recorded or uploaded by this app. Tracking assets load from this site.</span></label><div class="actions"><button class="solid" id="camera" disabled>Connect camera ↗</button><button class="secondary" id="rehearse">Rehearse with pointer →</button></div><p class="small-note">ABOUT 5 MINUTES · DESKTOP RECOMMENDED · ADULT TESTING</p><div id="error" role="status"></div></div>`);$('#consent').onchange=e=>$('#camera').disabled=!e.target.checked;$('#camera').onclick=startCamera;$('#rehearse').onclick=()=>startMode('pointer');}
let trackerPromise;
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
  trackerPromise=withTimeout(new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/webgazer.js';script.onload=resolve;script.onerror=()=>reject(new Error('Tracking library download failed'));document.head.append(script);}),20000,'tracking library').catch(error=>{trackerPromise=null;throw error;});
  return trackerPromise;
}
async function startCamera(){
  const epoch=++state.epoch;let stage='browser camera support';
  const button=$('#camera');button.disabled=true;button.textContent='Checking camera…';$('#rehearse').disabled=true;$('#error').textContent='';
  try{
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){const error=new Error('Camera API unavailable');error.name='UnsupportedError';throw error;}
    const policy=document.permissionsPolicy||document.featurePolicy;
    if(policy?.allowsFeature&&!policy.allowsFeature('camera')){const error=new Error('Camera blocked by browser embedding policy');error.name='SecurityError';throw error;}
    stage='tracking library loading';await loadTracker();if(epoch!==state.epoch)return;
    // This WebGazer distribution uses a relative MediaPipe directory by default.
    // Ship the matching assets with the application and resolve from the page URL.
    webgazer.params.faceMeshSolutionPath=new URL('mediapipe/face_mesh/',document.baseURI).href;
    webgazer.saveDataAcrossSessions(false);await webgazer.setCameraConstraints({audio:false,video:{width:{ideal:640},height:{ideal:480},facingMode:'user'}});
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
    button.disabled=false;button.textContent='Reload & retry camera ↗';button.onclick=()=>location.reload();$('#rehearse').disabled=false;
  }
}
const R=window.Reliability;
Object.assign(state,{sequence:0,frameSequence:0,face:null,stableSince:0,pose:null,baseline:null,preChecks:[],postCheck:null,story:null,invalidated:false,interruptions:[],calibrationLog:[],validationHistory:[],lastPredictionId:0});
let collecting=false,calSamples=0,calLastFrame=0,calLastAt=0,calSettle=0,calLastProgressAt=0,calPointStarted=0,checkPurpose='pre',checkIndex=0,checkStarted=0,checkLastSlot=-1,checkLastId=0,recordNext=50,badSince=0;
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
function headMoved(){return state.mode==='camera'&&state.face&&state.baseline&&R.movement(state.baseline,state.face);}
function startMode(mode){if(mode==='pointer')stopCamera();state.mode=mode;state.latest=null;state.preChecks=[];state.invalidated=false;$('#modeBadge').textContent=mode==='camera'?'LIVE WEBCAM':'POINTER REHEARSAL';$('#source').textContent=mode==='camera'?'Webcam estimate':'Pointer (not gaze)';showCalibrationIntro();}
document.addEventListener('pointermove',e=>{if(state.mode==='pointer')state.latest={x:e.clientX,y:e.clientY,t:now(),id:++state.sequence};});
function pointerPrediction(){const p=state.latest;return p?{...p,t:now(),id:++state.sequence}:null;}
function fresh(){const p=state.mode==='pointer'?pointerPrediction():state.latest;return p&&now()-p.t<R.limits.maxAgeMs&&Number.isFinite(p.x)&&Number.isFinite(p.y)?p:null;}
function showCalibrationIntro(){phase('calibration',2);setDesk(`<div class="welcome"><div class="eyebrow">01 / BUILD A BETTER SIGNAL</div><h2>Nine points. A steady gaze.</h2><p>Click each target once, then keep looking at its centre. The tool collects 15 spaced eye-feature samples only while your face is visible and steady. Hold for about three seconds per point; move naturally between targets.</p><p>${state.mode==='pointer'?'Pointer rehearsal uses the same timing. It cannot demonstrate webcam accuracy.':'The camera preview stays behind the target screen. If collection pauses, face the camera and settle before continuing.'}</p><div class="actions"><button class="solid" id="calibrate">Begin guided calibration →</button><button class="secondary" id="reset">Clear & disconnect</button></div></div>`);$('#calibrate').onclick=beginCalibration;$('#reset').onclick=reset;message('○ Guided calibration required');}
function placeTarget(pt){$('#target').style.left=pt[0]*innerWidth+'px';$('#target').style.top=pt[1]*innerHeight+'px';}
function beginCalibration(){
 phase('calibration',2);
 state.viewport={width:innerWidth,height:innerHeight,dpr:devicePixelRatio};state.validation=null;state.preChecks=[];state.postCheck=null;state.calibrated=false;state.invalidated=false;state.baseline=null;state.calibrationLog=[];
 $('#accuracy').textContent='—';if(state.mode==='camera')webgazer.clearData();calIndex=0;calSamples=0;collecting=false;$('#overlay').hidden=false;$('#target').disabled=false;$('#target').onclick=clickCalibration;calTarget();
}
function calTarget(){showCalibrationControls();collecting=false;calSamples=0;calLastFrame=0;placeTarget(calibration[calIndex]);$('#target').textContent='+';$('#targetInstruction').textContent=`Calibration ${calIndex+1}/9 · Click once, then look steadily`;$('#targetProgress').textContent='Click the target to begin collecting';}
function clickCalibration(){if(collecting)return;collecting=true;state.trackerError=null;calPointStarted=now();calLastProgressAt=now();calSettle=now()+700;calLastAt=0;$('#target').textContent='·';}
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
 if(state.mode==='camera'&&!state.baseline)state.baseline={...state.face};
 if(headMoved()){collecting=false;state.invalidated=true;calibrationStatus('Position changed · Restart all 9 points');return;}
 if(now()-calLastAt<130)return;
 if(state.mode==='camera'&&state.face.id===calLastFrame){calibrationStatus('Waiting for a new eye frame · Keep looking at the target');return;}
 const pt=calibration[calIndex],x=pt[0]*innerWidth,y=pt[1]*innerHeight;
 if(state.mode==='camera'){try{webgazer.recordScreenPosition(x,y,'click');}catch(error){collecting=false;state.trackerError=error?.message;calibrationStatus('Training interrupted · Restart calibration or reconnect');return;}calLastFrame=state.face.id;}
 calLastAt=now();calLastProgressAt=now();calSamples++;calibrationStatus('Keep looking at the centre');
 if(calSamples===15){state.calibrationLog.push({point:calIndex+1,x,y,samples:calSamples});calIndex++;collecting=false;if(calIndex===9){hideCalibrationControls();$('#overlay').hidden=true;state.calibrated=true;state.baseline=state.face?{...state.face}:null;$('#calStatus').textContent='9/9 · 135 samples';showValidationIntro();}else calTarget();}
}
function showValidationIntro(){phase('validation',3);setDesk(`<div class="welcome"><div class="eyebrow">02 / INDEPENDENT CHECKS</div><h2>Check twice. Then observe.</h2><p>Run two separate five-target checks. Look at each target for four seconds without clicking. These measurements never train the model.</p><p>Each target needs median error ≤120 px, 90th-percentile error ≤200 px, ≥70% fresh-sample coverage, and ≥10 unique predictions. These are provisional engineering criteria for broad regions.</p><div class="actions"><button class="solid" id="validate">Run check ${state.preChecks.length+1} of 2 →</button><button class="secondary" id="recalibrate">Recalibrate</button></div></div>`);$('#validate').onclick=()=>beginValidation('pre');$('#recalibrate').onclick=showCalibrationIntro;}
function beginValidation(purpose='pre'){hideCalibrationControls();checkPurpose=purpose;validationRows=[];checkIndex=0;phase(purpose==='post'?'postcheck':'validation',purpose==='post'?5:3);$('#overlay').hidden=false;$('#target').disabled=true;$('#target').textContent='·';$('#target').onclick=null;startCheckTarget();}
function startCheckTarget(){
 if(checkIndex===checks.length){activeValidation=null;$('#overlay').hidden=true;finishValidation();return;}
 const pt=checks[checkIndex];placeTarget(pt);checkStarted=now();checkLastSlot=-1;checkLastId=0;
 activeValidation={point:checkIndex+1,target:{x:pt[0]*innerWidth,y:pt[1]*innerHeight},errors:[],slots:60,uniquePredictions:[],missing:0};
 $('#targetInstruction').textContent=`${checkPurpose==='post'?'After-activity drift check':'Accuracy check '+(state.preChecks.length+1)+'/2'} · Target ${checkIndex+1}/5`;
 $('#targetProgress').textContent='Settle for one second, then look for three seconds · No clicking';
}
function collectValidation(){
 if(!activeValidation||$('#overlay').hidden)return;
 const elapsed=now()-checkStarted;if(elapsed>=4000){activeValidation.missing=60-activeValidation.errors.length;validationRows.push(activeValidation);activeValidation=null;checkIndex++;startCheckTarget();return;}
 if(elapsed<1000)return;
 const slot=Math.min(59,Math.floor((elapsed-1000)/50));if(slot===checkLastSlot)return;checkLastSlot=slot;
 const p=fresh();if(p&&p.id!==checkLastId&&faceReady()&&!headMoved()){checkLastId=p.id;activeValidation.errors.push(Math.hypot(p.x-activeValidation.target.x,p.y-activeValidation.target.y));activeValidation.uniquePredictions.push(p.id);}
 $('#targetProgress').textContent=`${Math.ceil((4000-elapsed)/1000)}s remaining · ${activeValidation.errors.length} fresh predictions`;
}
function checkTable(v){return `<table class="quality-table"><thead><tr><th>Target</th><th>Median</th><th>90th %</th><th>Coverage</th><th>Result</th></tr></thead><tbody>${v.targets.map(r=>`<tr><td>${r.point}</td><td>${fmt(r.median)}</td><td>${fmt(r.p90)}</td><td>${Math.round(r.coverage*100)}%</td><td>${r.pass?'Pass':'Repeat'}</td></tr>`).join('')}</tbody></table>`;}
function finishValidation(){
 const result={...R.summarize(validationRows),purpose:checkPurpose,mode:state.mode,checkedAt:new Date().toISOString(),viewport:state.viewport};state.validationHistory.push(result);
 if(checkPurpose==='post'){state.postCheck=result;renderReview();return;}
 if(result.pass)state.preChecks.push(result);else state.preChecks=[];
 state.validation=result;$('#accuracy').textContent=fmt(result.median);phase('validated',3);
 const ready=state.preChecks.length>=2;
 setDesk(`<div class="welcome"><div class="eyebrow">${state.mode==='pointer'?'POINTER REHEARSAL / ':''}${result.pass?'CHECK PASSED':'QUALITY GATE FAILED'}</div><h2>${!result.pass?'Recalibrate before recording.':ready?'Two checks complete.':'A second check confirms consistency.'}</h2>${checkTable(result)}<p>${state.mode==='pointer'?'These are pointer measurements, not webcam reliability results. ':''}Thresholds apply to every target, not just the overall median. Failed checks reset the consecutive-check count.</p><div class="actions">${result.pass?`<button class="solid" id="nextCheck">${ready?'Choose a story':'Run second check'} →</button>`:''}<button class="secondary" id="recalibrate">Recalibrate</button>${state.mode==='pointer'&&!result.pass?'<button class="secondary" id="demoContinue">Preview story (rehearsal only)</button>':''}</div></div>`);
 if(result.pass)$('#nextCheck').onclick=ready?()=>showActivity(true):()=>beginValidation('pre');
 $('#recalibrate').onclick=showCalibrationIntro;
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
 state.samples=[];state.elapsed=0;state.postCheck=null;state.interruptions=[];state.invalidated=false;state.lastPredictionId=0;recordNext=50;badSince=0;
 $('#activity').scrollIntoView({block:'center'});captureLayout();state.viewport={width:innerWidth,height:innerHeight,dpr:devicePixelRatio};
 state.running=true;phase('recording',4);$('#start').outerHTML='<button class="secondary" id="pause">Pause</button><button class="solid" id="finish">Finish & check drift →</button><span id="clock">00:45</span>';$('#shuffle').hidden=true;$('#redo').hidden=true;
 $('#pause').onclick=togglePause;$('#finish').onclick=finish;lastTick=now();message('● Recording unique predictions');
}
function pauseRecording(reason){if(!state.running)return;state.running=false;state.interruptions.push({at_ms:Math.round(state.elapsed),reason});if($('#pause'))$('#pause').textContent='Resume';message('○ Paused · '+reason);}
function togglePause(){if(state.running){pauseRecording('Manual pause');return;}if(state.invalidated){finish();return;}if(!faceReady()||headMoved()||!fresh()){message('○ Face the camera and hold steady before resuming');return;}state.running=true;lastTick=now();badSince=0;$('#pause').textContent='Pause';message('● Recording resumed');}
function addRecordingSlot(t,forceMissing=false){
 captureLayout();const p=forceMissing?null:fresh();const valid=!!(p&&p.id!==state.lastPredictionId&&faceReady()&&!headMoved());if(valid)state.lastPredictionId=p.id;
 state.samples.push({t_ms:t,prediction_id:valid?p.id:null,prediction_age_ms:p?Math.round(now()-p.t):null,x:valid?Math.round(p.x):null,y:valid?Math.round(p.y):null,valid,reason:valid?'fresh':forceMissing?'scheduler-gap':!p?'missing-or-stale':p.id===state.lastPredictionId?'repeated-prediction':'face-or-position',offscreen:valid&&(p.x<0||p.x>innerWidth||p.y<0||p.y>innerHeight),activity_x:valid?p.x-state.activityRect.x:null,activity_y:valid?p.y-state.activityRect.y:null,region:valid?state.regions.find(r=>inside(p,r.rect))?.name||'outside activity':'missing'});
}
function tick(time){
 if(state.running){const dt=Math.max(0,time-lastTick);state.elapsed=Math.min(45000,state.elapsed+dt);
  while(recordNext<=state.elapsed){addRecordingSlot(recordNext,state.elapsed-recordNext>=100);recordNext+=50;}
  $('#sampleCount').textContent=state.samples.filter(s=>s.valid).length;
  if($('#clock'))$('#clock').textContent='00:'+String(Math.max(0,Math.ceil((45000-state.elapsed)/1000))).padStart(2,'0');
  if(headMoved()){state.invalidated=true;pauseRecording('Head position changed · finish and recalibrate');}
  else if(!faceReady()||!fresh()){if(!badSince)badSince=time;if(time-badSince>900)pauseRecording('Signal lost · face the camera before resuming');}else badSince=0;
  if(state.elapsed>=45000)finish();
 }
 lastTick=time;state.raf=requestAnimationFrame(tick);
}
function finish(){
 state.running=false;phase('post-intro',5);captureLayout();
 setDesk(`<div class="welcome"><div class="eyebrow">05 / DID THE SIGNAL DRIFT?</div><h2>One final check.</h2><p>The recording is held in memory. Look at five independent targets again so we can compare accuracy before and after this story.</p><p>Skipping this check leaves the session unsuitable for interpretation.</p><div class="actions"><button class="solid" id="post">Run after-activity check →</button><button class="secondary" id="skipPost">Review as unverified</button></div></div>`);
 $('#post').onclick=()=>beginValidation('post');$('#skipPost').onclick=()=>{state.postCheck=null;renderReview();};
}
function coverage(){return state.samples.length?state.samples.filter(s=>s.valid).length/state.samples.length:0;}
function sessionQuality(){const pre={...state.validation,pass:state.preChecks.length>=2&&!!state.validation?.pass};return R.quality(state.mode,pre,state.postCheck,coverage(),state.invalidated);}
function renderReview(){
 phase('review',5);const quality=sessionQuality(),usable=quality==='provisional-broad-region-only',valid=state.samples.filter(s=>s.valid),drift=state.postCheck?.median!=null&&state.validation?.median!=null?state.postCheck.median-state.validation.median:null;
 setDesk(`<div class="welcome"><div class="eyebrow">${state.mode==='pointer'?'POINTER REHEARSAL':'WEBCAM SESSION'} / ${state.story.title}</div><h2>${usable?'A provisional broad view.':'Measurements before interpretation.'}</h2><div class="stats"><div><b>${(state.elapsed/1000).toFixed(1)}s</b><span>ACTIVE TIME</span></div><div><b>${Math.round(coverage()*100)}%</b><span>FRESH-SAMPLE COVERAGE</span></div><div><b>${valid.length}</b><span>UNIQUE PREDICTIONS</span></div></div><div class="notice">${state.mode==='pointer'?'Pointer rehearsal only. These are not eye movements.':usable?'Both pre-checks and the post-check passed provisional criteria. This is not proof of research-grade accuracy.':'NOT SUITABLE FOR INTERPRETATION. A check failed, was skipped, the signal coverage was too low, or the position changed.'}</div><p>Before: ${fmt(state.validation?.median)} · After: ${fmt(state.postCheck?.median)} · Median change: ${drift===null?'not checked':Math.round(drift)+' px'} · Pauses: ${state.interruptions.length}</p>${state.postCheck?checkTable(state.postCheck):'<p>After-activity validation was not completed.</p>'}</div>${lesson()}<div class="actions"><button class="secondary" id="heatToggle">${usable||state.mode==='pointer'?'Hide heatmap':'Show diagnostic heatmap'}</button></div><p class="small-note" id="regions"></p><div class="actions"><button class="solid" id="json">Export full session JSON ↓</button><button class="secondary" id="csv">Raw samples CSV ↓</button><button class="secondary" id="again">New story & checks</button><button class="secondary" id="clear">Clear & disconnect</button></div><p class="fine">Density shows fresh prediction samples, not verified fixations or attention. Failed sessions hide the heatmap by default. Prototype gates: each target median ≤120 px, p90 ≤200 px, coverage ≥70%; post-check median increase ≤60 px. These thresholds require pilot validation.</p>`);
 const visible=usable||state.mode==='pointer';$('#heatmap').hidden=!visible;if(visible)drawHeatmap();$('#heatToggle').onclick=()=>{const c=$('#heatmap');c.hidden=!c.hidden;if(!c.hidden)drawHeatmap();$('#heatToggle').textContent=c.hidden?'Show diagnostic heatmap':'Hide heatmap';};
 $('#regions').textContent=['reading','diagram','outside activity','missing'].map(r=>`${r}: ${state.samples.length?Math.round(state.samples.filter(s=>s.region===r).length/state.samples.length*100):0}%`).join(' · ');
 $('#json').onclick=()=>download('json');$('#csv').onclick=()=>download('csv');$('#again').onclick=()=>{state.preChecks=[];state.postCheck=null;chooseStory();if(state.invalidated)showCalibrationIntro();else showValidationIntro();};$('#clear').onclick=reset;message('○ Review ready · '+quality);
}
function drawHeatmap(){const c=$('#heatmap'),r=state.activityRect;c.width=r.width;c.height=r.height;const ctx=c.getContext('2d');for(const s of state.samples){if(!s.valid||s.activity_x<0||s.activity_x>r.width||s.activity_y<0||s.activity_y>r.height)continue;const x=s.activity_x,y=s.activity_y;const g=ctx.createRadialGradient(x,y,0,x,y,32);g.addColorStop(0,'rgba(201,86,50,.08)');g.addColorStop(.5,'rgba(219,153,61,.035)');g.addColorStop(1,'rgba(219,153,61,0)');ctx.fillStyle=g;ctx.fillRect(x-32,y-32,64,64);}}
function sessionReport(){return{schema:'faraday.observatory.v2',exportedAt:new Date().toISOString(),mode:state.mode,nonclinical:true,quality:sessionQuality(),thresholds:R.limits,story:state.story,calibration:state.calibrationLog,validationHistory:state.validationHistory,preChecks:state.preChecks,lastPreCheck:state.validation,postCheck:state.postCheck,positionInvalidated:state.invalidated,interruptions:state.interruptions,duration_ms:Math.round(state.elapsed),sampleIntervalTarget_ms:50,freshSampleCoverage:coverage(),viewport:state.viewport,activityRect:state.activityRect,regions:state.regions,samples:state.samples,limitations:'Engineering heuristics for adult exploratory use. No clinical, attention, fixation, or comprehension inference. Face movement proxy is not a calibrated head pose. Repeated estimates are excluded from fresh coverage.'};}
function exportContent(type){const report=sessionReport(),keys=['t_ms','prediction_id','prediction_age_ms','x','y','valid','reason','offscreen','activity_x','activity_y','region'];return type==='json'?JSON.stringify(report,null,2):['mode,quality,story_id,'+keys.join(','),...state.samples.map(s=>[state.mode,report.quality,state.story.id,...keys.map(k=>s[k]??'')].join(','))].join('\n');}
function download(type){const url=URL.createObjectURL(new Blob([exportContent(type)],{type:type==='json'?'application/json':'text/csv'}));const a=document.createElement('a');a.href=url;a.download=`faraday-${state.mode}-${state.story.id}-${Date.now()}.${type}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function cancelTargets(){hideCalibrationControls();collecting=false;activeValidation=null;$('#overlay').hidden=true;if(checkPurpose==='post'&&state.phase==='postcheck'){state.postCheck=null;renderReview();}else if(state.phase==='calibration')showCalibrationIntro();else showValidationIntro();}
$('#cancelTarget').onclick=cancelTargets;
function reset(){hideCalibrationControls();state.epoch++;collecting=false;activeValidation=null;state.running=false;if(window.webgazer)webgazer.clearData();stopCamera();window.webgazer=undefined;trackerPromise=null;Object.assign(state,{mode:null,phase:'setup',latest:null,face:null,pose:null,baseline:null,calibrated:false,validation:null,preChecks:[],postCheck:null,samples:[],elapsed:0,story:null,invalidated:false,interruptions:[],validationHistory:[]});$('#overlay').hidden=true;$('#modeBadge').textContent='NO SESSION';$('#source').textContent='Not connected';$('#calStatus').textContent='Not started';$('#accuracy').textContent='—';$('#sampleCount').textContent='0';setup();message('○ Cleared · camera disconnected');}
window.addEventListener('resize',()=>{if(!state.mode)return;state.invalidated=true;state.calibrated=false;state.preChecks=[];collecting=false;activeValidation=null;$('#overlay').hidden=true;$('#calStatus').textContent='Window changed';if(['review','postcheck','post-intro'].includes(state.phase)){state.postCheck=null;renderReview();}else if(['recording','paused'].includes(state.phase)){state.running=false;finish();}else showCalibrationIntro();message('○ Window changed · new calibration required');});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(!$('#overlay').hidden)cancelTargets();if(state.running)pauseRecording('Browser tab hidden');}});
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{if(state.running)pauseRecording('Left observation studio');document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==b.dataset.view);document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x===b));});
window.addEventListener('beforeunload',stopCamera);
setInterval(()=>{if(document.hidden)return;collectCalibration();collectValidation();},50);
setup();state.raf=requestAnimationFrame(tick);
