import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync('dist/app.js','utf8');
function environment({media=true,policy=true,error=null}={}){
 const elements=new Map();let stopped=0,ended=0,began=0;
 const element=()=>({textContent:'',disabled:false,hidden:true,style:{},classList:{toggle(){}},remove(){},getBoundingClientRect(){return {x:0,y:0,width:600,height:400}}});
 const get=s=>{if(!elements.has(s))elements.set(s,element());return elements.get(s)};
 const tracker={params:{},saveDataAcrossSessions(){return this},async setCameraConstraints(c){this.constraints=c},setRegression(){return this},setGazeListener(){return this},async begin(){began++;if(error)throw error;return this},end(){ended++;throw new Error('partial initialization')},removeMouseEventListeners(){},showPredictionPoints(){},showVideoPreview(){}};
 const context={console:{warn(){}},URL,performance, setTimeout,clearTimeout,setInterval(){},requestAnimationFrame(){},innerWidth:1200,innerHeight:800,devicePixelRatio:1,
 document:{baseURI:'https://example.test/',permissionsPolicy:{allowsFeature:()=>policy},querySelector:get,querySelectorAll:()=>[],getElementById:id=>id==='webgazerVideoFeed'?{srcObject:{getTracks:()=>[{stop(){stopped++}}]}}:null,addEventListener(){},head:{append(){}}},
 navigator:{mediaDevices:media?{getUserMedia(){}}:undefined},location:{reload(){}},window:{webgazer:tracker,isSecureContext:true,addEventListener(){}}};
 Object.defineProperty(context,'webgazer',{get:()=>context.window.webgazer});
 vm.createContext(context);vm.runInContext(source,context);
 return {context,get,tracker,stats:()=>({stopped,ended,began})};
}
for(const [name,expected] of [['NotAllowedError','blocked'],['NotFoundError','No camera'],['NotReadableError','could not be opened'],['OverconstrainedError','settings'],['TimeoutError','too long']]){
 const e=environment({error:Object.assign(new Error(name),{name})});await vm.runInContext('startCamera()',e.context);
 assert.match(e.get('#error').textContent,new RegExp(expected));assert.equal(e.get('#camera').disabled,false);assert.equal(e.get('#rehearse').disabled,false);assert.equal(e.stats().stopped,1);
}
for(const config of [{media:false},{policy:false}]){const e=environment(config);await vm.runInContext('startCamera()',e.context);assert.equal(e.stats().began,0);assert.match(e.get('#error').textContent,/Chrome or Edge/);}
const success=environment();await vm.runInContext('startCamera()',success.context);assert.equal(success.tracker.params.faceMeshSolutionPath,'https://example.test/mediapipe/face_mesh/');assert.equal(success.tracker.constraints.audio,false);assert.equal(vm.runInContext('state.mode',success.context),'camera');
vm.runInContext('stopCamera()',success.context);assert.equal(success.stats().stopped,1);
for(const name of ['face_mesh.binarypb','face_mesh_solution_packed_assets_loader.js','face_mesh_solution_packed_assets.data','face_mesh_solution_simd_wasm_bin.js','face_mesh_solution_simd_wasm_bin.wasm','face_mesh_solution_wasm_bin.js','face_mesh_solution_wasm_bin.wasm'])assert.ok(fs.statSync('dist/mediapipe/face_mesh/'+name).size>100);
console.log('Passed: camera error recovery (5 cases), unavailable API, blocked policy, startup configuration, stream cleanup, and 7 required bundled assets.');

// The preview must never cover calibration target 7 in the bottom-left corner.
const css=fs.readFileSync('dist/style.css','utf8');
const overlayLayer=Number(css.match(/#overlay\{[^}]*z-index:(\d+)/)[1]);
const previewLayer=Number(css.match(/#webgazerVideoContainer\{[^}]*z-index:(\d+)/)[1]);
assert.ok(overlayLayer>previewLayer,'Calibration must cover the camera preview');
const calibrationRun=environment();
vm.runInContext("state.mode='pointer';beginCalibration()",calibrationRun.context);
for(let point=0;point<9;point++){
 assert.match(calibrationRun.get('#targetInstruction').textContent,new RegExp('Calibration '+(point+1)+'/9'));
 for(let click=0;click<5;click++)vm.runInContext('clickCalibration({})',calibrationRun.context);
}
assert.equal(vm.runInContext('state.calibrated',calibrationRun.context),true);
assert.equal(calibrationRun.get('#overlay').hidden,true);
assert.equal(calibrationRun.get('#calStatus').textContent,'Rehearsed 9/9');
console.log('Passed: all 9 calibration targets / 45 clicks, including points 7–9; calibration layer above camera preview.');
