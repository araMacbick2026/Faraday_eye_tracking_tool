import vm from 'node:vm';import fs from 'node:fs';import assert from 'node:assert/strict';
const code=['dist/reliability.js','dist/stories.js','dist/gaze-model.js','dist/app.js'].map(p=>fs.readFileSync(p,'utf8')).join('\n');
function environment({media=true,policy=true,error=null}={}){
 let time=1000,stopped=0,began=0,training=0;const elements=new Map(),events={};
 const el=()=>({textContent:'',disabled:false,hidden:true,style:{},classList:{toggle(){}},remove(){},appendChild(child){elements.set('#'+child.id,child)},scrollIntoView(){},getBoundingClientRect(){return{x:0,y:0,width:600,height:440}},getContext(){return{createRadialGradient(){return{addColorStop(){}}},fillRect(){}}}});
 const get=s=>{if(!elements.has(s))elements.set(s,el());return elements.get(s)};
 let regression={init(){},fit(){return true},addData(){training++;return true}};
 let createRegression;
 const tracker={params:{},util:{getEyeFeats:patches=>patches.features},getTracker(){return{getEyePatches:async()=>false}},getRegression(){return [regression]},addRegressionModule(_,create){createRegression=create},saveDataAcrossSessions(){return this},async setCameraConstraints(c){this.constraints=c},setRegression(){regression=new createRegression();const add=regression.addData;regression.addData=(...args)=>{const accepted=add(...args);if(accepted)training++;return accepted;};return this},setGazeListener(){return this},async begin(){began++;if(error)throw error;return this},end(){throw new Error('partial start')},removeMouseEventListeners(){},showPredictionPoints(){},showVideoPreview(){}};
 const window={webgazer:tracker,isSecureContext:true,addEventListener:(n,f)=>events[n]=f};
 const context={window,document:{baseURI:'https://example.test/',permissionsPolicy:{allowsFeature:()=>policy},querySelector:get,querySelectorAll:()=>[],createElement:()=>el(),getElementById:id=>id==='webgazerVideoFeed'?{srcObject:{getTracks:()=>[{stop(){stopped++}}]}}:(elements.get('#'+id)||null),addEventListener:(n,f)=>events[n]=f,head:{append(){}}},performance:{now:()=>time},URL,console:{warn(){}},setTimeout,clearTimeout,setInterval(){},requestAnimationFrame(){},navigator:{mediaDevices:media?{getUserMedia(){}}:undefined},location:{reload(){}},innerWidth:1200,innerHeight:800,devicePixelRatio:1};
 Object.defineProperty(context,'webgazer',{get:()=>window.webgazer});vm.createContext(context);vm.runInContext(code,context);
 return{context,get,tracker,events,run:s=>vm.runInContext(s,context),advance:ms=>time+=ms,stats:()=>({stopped,began,training})};
}
for(const [name,expected] of [['NotAllowedError','blocked'],['NotFoundError','No camera'],['NotReadableError','could not be opened'],['OverconstrainedError','settings'],['TimeoutError','too long']]){const e=environment({error:Object.assign(new Error(name),{name})});await e.run('startCamera()');assert.match(e.get('#error').textContent,new RegExp(expected));assert.equal(e.get('#camera').disabled,false);assert.equal(e.stats().stopped,1);}
for(const config of [{media:false},{policy:false}]){const e=environment(config);await e.run('startCamera()');assert.equal(e.stats().began,0);}
const success=environment();await success.run('startCamera()');assert.equal(success.tracker.params.faceMeshSolutionPath,'https://example.test/mediapipe/face_mesh/');assert.equal(success.run('state.mode'),'camera');
const cal=environment();await cal.run('startCamera()');cal.run('beginCalibration();clickCalibration()');cal.advance(1000);cal.run('collectCalibration()');assert.equal(cal.stats().training,0,'No training without face');
for(let point=0;point<9;point++){if(point)cal.run('clickCalibration()');cal.advance(800);for(let i=0;i<15;i++){cal.advance(140);cal.run(`state.face={x:.5,y:.5,scale:.2,t:now(),id:${point*15+i+1},patches:{features:${i===14?"[8,-9]":`calibration[${point}]`}}};state.stableSince=0;collectCalibration()`);}}
assert.equal(cal.run('state.calibrated'),true);assert.equal(cal.stats().training,135);assert.equal(cal.run('state.calibrationLog.length'),9);
const calibratedRidge=cal.tracker.getRegression()[0];
assert.equal(calibratedRidge.sampleCount,135);
const estimate=calibratedRidge.predict({features:[.25,.3]});
assert.ok(Math.hypot(estimate.x-300,estimate.y-240)<15,'A held-out screen position remains accurate');
assert.equal(calibratedRidge.predict({features:[NaN,.3]}),null);
assert.equal(calibratedRidge.addData({features:[.25,.3]},[300,240],'click'),false,'Ordinary clicks never train the model');
cal.run("state.validation={targets:[{point:1,pass:false,median:350,target:{x:300,y:240}}]};beginRefinement()");
for(let point=0;point<3;point++){cal.run('clickCalibration()');cal.advance(800);for(let frame=0;frame<15;frame++){cal.advance(140);cal.run(`state.face={x:.5,y:.5,scale:.2,t:now(),id:${136+point*15+frame},patches:{features:calibration[calibrationPath[${point}]]}};state.stableSince=0;collectCalibration()`);}}
assert.equal(calibratedRidge.sampleCount,180);
cal.run('beginRefinement()');assert.equal(cal.run('state.phase'),'validation');
cal.run('beginCalibration()');assert.equal(calibratedRidge.sampleCount,0);assert.equal(calibratedRidge.predict({features:[.25,.3]}),null);
console.log('PASS: centered regression retains the calibration and refinement, predicts a held-out point, and ignores ordinary clicks.');
const r=success.context.window.Reliability;const good=()=>[1,2,3,4,5].map(point=>({point,slots:60,errors:Array(60).fill(20)}));
assert.equal(r.summarize(good()).pass,true);let rows=good();rows[4].errors=Array(60).fill(400);assert.equal(r.summarize(rows).pass,false,'Bad corner fails despite low global median');rows=good();rows[0].errors=[20];assert.equal(r.summarize(rows).pass,false,'Sparse target fails');
const v=environment();v.run("state.mode='pointer';beginValidation('pre')");for(let i=0;i<5;i++){for(let j=0;j<60;j++){v.advance(j===0?1000:50);v.run(`state.latest={x:activeValidation.target.x,y:activeValidation.target.y,t:now(),id:1};collectValidation()`);}v.advance(100);v.run('collectValidation()');}assert.equal(v.run('state.preChecks.length'),1);assert.equal(v.stats().training,0,'Validation must never train');
// All thresholds and post-activity gates affect session interpretation.
assert.equal(r.quality('camera',{pass:true,median:20},{pass:true,median:90},1,false),'not-suitable-for-interpretation');assert.equal(r.quality('camera',{pass:true,median:20},null,1,false),'not-suitable-for-interpretation');assert.equal(r.quality('camera',{pass:true,median:20},{pass:true,median:30},.6,false),'not-suitable-for-interpretation');assert.equal(r.quality('camera',{pass:true,median:20},{pass:true,median:30},1,false),'provisional-broad-region-only');assert.equal(r.quality('pointer',null,null,1,false),'rehearsal-not-gaze');
const rec=environment();rec.run("state.mode='camera';state.face={x:.5,y:.5,scale:.2,t:now(),id:1};state.stableSince=0;state.latest={x:100,y:100,t:now(),id:7};addRecordingSlot(50);addRecordingSlot(100)");assert.equal(rec.run('state.samples.filter(s=>s.valid).length'),1,'Repeated prediction counted once');rec.advance(500);rec.run('addRecordingSlot(150)');assert.equal(rec.run('state.samples[2].valid'),false,'Stale signal is missing');rec.run('addRecordingSlot(200,true)');assert.equal(rec.run('state.samples[3].reason'),'scheduler-gap');
const lost=environment();lost.run("state.mode='camera';state.running=true;state.phase='recording';state.latest=null;state.face=null;lastTick=now()");lost.advance(100);lost.run('tick(now())');lost.advance(1100);lost.run('tick(now())');assert.equal(lost.run('state.running'),false,'Signal loss pauses');
const moved=environment();moved.run("state.mode='camera';state.running=true;state.phase='recording';state.baseline={x:.5,y:.5,scale:.2};state.face={x:.7,y:.5,scale:.2,t:now()};lastTick=now()");moved.advance(50);moved.run('tick(now())');assert.equal(moved.run('state.invalidated'),false);moved.advance(1100);moved.run('tick(now())');assert.equal(moved.run('state.invalidated'),true);assert.equal(moved.run('state.running'),false);
const blocked=environment();blocked.run("state.mode='camera';state.preChecks=[];showActivity(true)");assert.equal(blocked.run('state.phase'),'calibration','Failed prechecks block recording');
const review=environment();review.run("state.mode='camera';chooseStory();state.samples=[];state.activityRect={width:600,height:440};renderReview()");assert.equal(review.get('#heatmap').hidden,true);assert.match(review.get('#desk').innerHTML,/NOT SUITABLE/);assert.equal(review.run('sessionReport().schema'),'faraday.observatory.v3');
const stories=success.context.window.STORIES;assert.equal(stories.length,6);assert.equal(new Set(stories.map(s=>s.id)).size,6);for(const s of stories){assert.notEqual(r.choose(stories,s.id,()=>0).id,s.id);assert.ok(s.paragraphs.length===3&&s.question&&s.diagram.length===3);}
const css=fs.readFileSync('dist/style.css','utf8');assert.ok(+css.match(/#overlay\{[^}]*z-index:(\d+)/)[1]>+css.match(/#webgazerVideoContainer\{[^}]*z-index:(\d+)/)[1]);
console.log('PASS: camera recovery; 9-point/135-sample gated calibration; independent validation; per-target quality gates; drift/coverage rules; unique/stale/gap accounting; signal/movement pauses; recording block; failed heatmap hidden; exports; 6 randomized stories; overlay ordering.');


// A second successful check is required; failed checks reset the streak.
v.run("beginValidation('pre')");
for(let point=0;point<5;point++){for(let slot=0;slot<60;slot++){v.advance(slot===0?1000:50);v.run('state.latest={x:activeValidation.target.x,y:activeValidation.target.y,t:now(),id:1};collectValidation()');}v.advance(100);v.run('collectValidation()');}
assert.equal(v.run('state.preChecks.length'),2);assert.equal(v.stats().training,0);
v.run("chooseStory();state.samples=[{t_ms:50,prediction_id:1,prediction_age_ms:0,x:10,y:20,valid:true,reason:'fresh',offscreen:false,activity_x:10,activity_y:20,region:'reading'}]");
const exported=JSON.parse(v.run("exportContent('json')"));assert.equal(exported.schema,'faraday.observatory.v3');assert.equal(exported.preChecks.length,2);assert.ok(exported.story.id&&exported.story.paragraphs.length===3);
const csv=v.run("exportContent('csv')").split('\n');assert.equal(csv.length,2);assert.equal(csv[0].split(',').length,csv[1].split(',').length);assert.match(csv[1],/^pointer,rehearsal-not-gaze,/);
v.run("validationRows=[{point:1,slots:60,errors:[]}];finishValidation()");assert.equal(v.run('state.preChecks.length'),0);
const canceled=environment();canceled.run("state.mode='pointer';chooseStory();state.activityRect={width:600,height:440};beginValidation('post');cancelTargets()");assert.equal(canceled.run('state.postCheck'),null);assert.equal(canceled.run('state.phase'),'review');
console.log('PASS: two consecutive checks, failed-check reset, JSON/CSV serialization and labels, cancelled drift-check recovery.');

const integrated = environment();
integrated.context.location.pathname = '/pilot/studio';
let summaryRequest;
integrated.get('#regions').insertAdjacentHTML = (_, html) => assert.match(html, /Save summary to athlete dashboard/);
integrated.context.fetch = async (url, options) => {
  assert.equal(url, '/pilot/api/observations');
  assert.equal(options.method, 'POST');
  summaryRequest = JSON.parse(options.body);
  return { ok: true, json: async () => ({}) };
};
integrated.run("state.mode='pointer';chooseStory();state.activityRect={width:600,height:440};state.interruptions=[];state.samples=[{x:10,y:20,valid:true}];renderReview()");
await integrated.get('#saveObservation').onclick();
assert.equal(summaryRequest.quality, 'rehearsal-not-gaze');
assert.equal(summaryRequest.predictions, 1);
assert.equal('samples' in summaryRequest, false);
assert.match(integrated.get('#observationStatus').textContent, /Saved/);
console.log('PASS: studio saves only the observation summary to the athlete dashboard.');

const stall=environment();stall.run("state.mode='camera';beginCalibration();clickCalibration();calSamples=11;state.face={x:.5,y:.5,scale:.2,t:now(),id:11};state.stableSince=0;calLastFrame=11");
stall.advance(1000);stall.run('collectCalibration()');assert.match(stall.get('#targetProgress').textContent,/No fresh eye frames/);assert.equal(stall.run('calSamples'),11);
stall.advance(15000);stall.run('collectCalibration()');assert.equal(stall.run('collecting'),false);assert.match(stall.get('#targetProgress').textContent,/Collection stopped/);assert.equal(stall.get('#calibrationControls').hidden,false);
stall.get('#restartCalibration').onclick();assert.equal(stall.run('calSamples'),0);assert.equal(stall.run('calIndex'),0);assert.equal(stall.run('state.calibrated'),false);
const resume=environment();resume.run("state.mode='camera';beginCalibration();clickCalibration();calSamples=11");resume.advance(1000);resume.run('collectCalibration()');assert.equal(resume.run('calSamples'),11);resume.run('state.face={x:.5,y:.5,scale:.2,t:now(),id:12};state.stableSince=0;collectCalibration()');assert.equal(resume.run('calSamples'),12);
resume.run('cancelTargets()');assert.equal(resume.get('#calibrationControls').hidden,true);assert.equal(resume.get('#overlay').hidden,true);
console.log('PASS: stalled 11/15 samples never advance; fresh-frame recovery; 15-second stop; visible restart controls; full calibration reset; cancel cleanup.');

const monitor=environment();monitor.run("let shouldFail=true;const positions=Array.from({length:264},()=>[320,240,0]);positions[33]=[250,240,0];positions[263]=[390,240,0];const sensor={getPositions:()=>positions,getEyePatches:async()=>{if(shouldFail)throw new Error('temporary frame error');return {left:{},right:{}}}};webgazer.getTracker=()=>sensor;installFaceMonitor()");
await monitor.run('sensor.getEyePatches(null,{width:640,height:480})');assert.equal(monitor.run('state.face'),null);assert.match(monitor.run('state.trackerError'),/temporary/);
monitor.run('shouldFail=false');await monitor.run('sensor.getEyePatches(null,{width:640,height:480})');assert.equal(monitor.run('state.trackerError'),null);assert.equal(monitor.run('state.face.id'),1);
await monitor.run("state.mode='camera'; const video={getVideoPlaybackQuality:()=>({totalVideoFrames:10})}; sensor.getEyePatches(video,{width:640,height:480})");
monitor.run('ingest({x:100,y:100})');
await monitor.run('sensor.getEyePatches(video,{width:640,height:480})');
monitor.run('ingest({x:200,y:200})');
assert.equal(monitor.run('state.latest.x'),100,'Duplicate video frames cannot masquerade as new estimates');
console.log('PASS: transient face-model exception does not reject the tracking loop and clears after a good frame.');

// Reproduce the reported point-2 failure: a new stable pose is normal at a new target.
const targetShift=environment();targetShift.run("state.mode='camera';beginCalibration()");
for(let point=0;point<9;point++){targetShift.run('clickCalibration()');targetShift.advance(800);for(let frame=0;frame<15;frame++){targetShift.advance(140);targetShift.run(`state.face={x:${point%2===0?.35:.55},y:.5,scale:.2,t:now(),id:${point*15+frame+1}};state.stableSince=0;collectCalibration()`);}}
assert.equal(targetShift.run('state.calibrated'),true);assert.equal(targetShift.stats().training,135);assert.equal(targetShift.run('state.invalidated'),false);
const settling=environment();settling.run("state.mode='camera';beginCalibration();clickCalibration()");settling.advance(800);settling.run("state.face={x:.4,y:.5,scale:.2,t:now(),id:1};state.stableSince=0;collectCalibration()");settling.advance(150);settling.run("state.face={x:.5,y:.5,scale:.2,t:now(),id:2};collectCalibration()");assert.equal(settling.run('collecting'),true);assert.equal(settling.run('calSamples'),1);assert.match(settling.get('#targetProgress').textContent,/Settling/);
settling.advance(700);settling.run("state.face={x:.5,y:.5,scale:.2,t:now(),id:3};collectCalibration()");assert.equal(settling.run('calSamples'),2);
assert.equal(r.positionChanged({x:.4,y:.5,scale:.2},{x:.46,y:.5,scale:.2}),false);assert.equal(r.positionChanged({x:.4,y:.5,scale:.2},{x:.6,y:.5,scale:.2}),true);
console.log('PASS: all 9 webcam calibration targets accept changed stable poses; within-target movement settles/resumes without full restart; sustained large recording movement still invalidates.');

const slow=r.summarize([1,2,3,4,5].map(point=>({point,slots:60,freshSlots:60,errors:Array(30).fill(40)})));assert.equal(slow.pass,true);assert.equal(slow.coverage,1);assert.equal(slow.targets[0].predictionsPerSecond,10);
const sparse=r.summarize([{point:1,slots:60,freshSlots:60,errors:[20]}]);assert.equal(sparse.pass,false,'Availability cannot substitute for independent accuracy measurements');assert.match(r.diagnose(sparse).join(' '),/Too few/);
const duplicate=environment();duplicate.run("state.mode='camera';state.face={x:.5,y:.5,scale:.2,t:now(),id:1};state.stableSince=0;state.latest={x:100,y:100,t:now(),id:5};addRecordingSlot(50);addRecordingSlot(100)");assert.equal(duplicate.run('coverage()'),1);assert.equal(duplicate.run('state.samples.filter(s=>s.valid).length'),1);assert.equal(duplicate.run('state.samples[1].available'),true);
const refine=environment();refine.run("state.mode='camera';state.validation={targets:[{point:1,pass:false,median:350,target:{x:300,y:240}}]};state.calibrationLog=[{point:1,samples:15}];beginRefinement()");assert.equal(refine.run('calibrationPath.length'),3);assert.equal(refine.run('refining'),true);assert.equal(refine.run('state.preChecks.length'),0);
for(let point=0;point<3;point++){refine.run('clickCalibration()');refine.advance(800);for(let frame=0;frame<15;frame++){refine.advance(140);refine.run(`state.face={x:.5,y:.5,scale:.2,t:now(),id:${point*15+frame+1}};state.stableSince=0;collectCalibration()`);}}
assert.equal(refine.run('state.calibrated'),true);assert.equal(refine.stats().training,45);assert.equal(refine.run('state.calibrationLog.length'),4);assert.equal(refine.run('state.phase'),'validation');
assert.equal(new Set(r.refinementPoints({x:.25,y:.3},[[.1,.18],[.5,.18],[.9,.18],[.1,.5]])).size,3);
console.log('PASS: 10 Hz tracker with fresh signal is not falsely marked missing; minimum unique-count gate retained; repeated data never adds heatmap points; 3-point refinement and mandatory independent revalidation.');

const offsets=r.summarize([{point:1,slots:60,freshSlots:60,errors:Array(30).fill(50),offsets:[{x:-30,y:40},{x:-20,y:30},{x:-40,y:50}]}]);assert.equal(offsets.targets[0].offsetX,-30);assert.equal(offsets.targets[0].offsetY,40);
const diag=environment();diag.run("state.mode='pointer';state.viewport={width:1200,height:800};validationRows=[{point:1,target:{x:300,y:240},slots:60,freshSlots:60,errors:Array(30).fill(350),offsets:Array(30).fill({x:350,y:0})}];finishValidation()");assert.match(diag.get('#desk').innerHTML,/Refine weak area/);assert.match(diag.get('#desk').innerHTML,/Download diagnostics/);assert.match(diag.get('#desk').innerHTML,/Accuracy map/);assert.equal(typeof diag.get('#retryCheck').onclick,'function');diag.get('#retryCheck').onclick();assert.equal(diag.run('state.phase'),'validation');
console.log('PASS: signed offset summaries, target-map rendering, failed-check recovery and diagnostic controls.');

const widespread=environment();
widespread.run("state.mode='camera';state.calibrationLog=[{point:1,samples:15}];validationRows=[194,213,237,252,307].map((error,i)=>({point:i+1,slots:60,freshSlots:48,errors:Array(48).fill(error)}));finishValidation()");
assert.match(widespread.get('#desk').innerHTML,/5 of 5 targets missed/);
assert.doesNotMatch(widespread.get('#desk').innerHTML,/Refine weak area|Repeat accuracy check/);
assert.equal(widespread.run('state.validation.pass'),false);
widespread.get('#demoContinue').onclick();
assert.equal(widespread.run('state.mode'),'pointer');
assert.equal(widespread.run('state.validation'),null);
assert.equal(widespread.run('state.calibrationLog.length'),0);
assert.equal(widespread.run('state.phase'),'ready');
console.log('PASS: widespread webcam error recommends full calibration and offers a separate pointer rehearsal.');

const partial=environment();partial.run("state.mode='camera';validationRows=[{point:1,slots:60,freshSlots:60,errors:Array(30).fill(20)}];finishValidation()");
assert.equal(partial.run('state.preChecks.length'),0);
partial.run("state.phase='review';state.validation={pass:true,median:20};state.preChecks=[state.validation,state.validation];state.postCheck={pass:true,median:30};state.samples=Array(10).fill({valid:true,available:true});state.elapsed=2000");
assert.equal(partial.run('sessionQuality()'),'not-suitable-for-interpretation');
partial.run('state.elapsed=5000');
partial.events.resize();
assert.equal(partial.run('sessionQuality()'),'provisional-broad-region-only','A resize cannot rewrite a completed review');
assert.equal(partial.run('state.calibrated'),false,'A new activity requires calibration for the new viewport');
console.log('PASS: incomplete validation and short sessions stay gated, and completed reviews survive a resize.');
