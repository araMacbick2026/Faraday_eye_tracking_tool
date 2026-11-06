from pathlib import Path
p=Path('dist/app.js')
s=p.read_text(encoding='utf-8')
a=s.index('function loadTracker()');b=s.index('function startMode',a)
s=s[:a]+'''let trackerPromise;
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
    webgazer.setRegression('ridge').setGazeListener(data=>{if(state.mode==='camera')state.latest=data?{x:data.x,y:data.y,t:performance.now()}:null;});
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
''' +s[b:]
s=s.replace("if(window.webgazer){webgazer.clearData();webgazer.end();}","if(window.webgazer)webgazer.clearData();stopCamera();")
s=s.replace("window.addEventListener('beforeunload',()=>{if(window.webgazer)webgazer.end();});", "window.addEventListener('beforeunload',stopCamera);")
# Return to a fresh library state on reset to avoid WebGazer retaining a stopped stream.
s=s.replace("function startCamera(){", "function startCamera(){")
s=s.replace("function startMode(mode){state.mode=mode;", "function startMode(mode){if(mode==='pointer')stopCamera();state.mode=mode;")
p.write_text(s,encoding='utf-8')
p=Path('dist/index.html');s=p.read_text(encoding='utf-8-sig');s=s.replace('href="style.css"','href="style.css"');s=s.replace('<script src="app.js"></script>','<script src="app.js?v=2"></script>');p.write_text(s,encoding='utf-8')
