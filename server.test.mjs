import {test} from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';import {createAppServer} from './server.mjs';
test('Railway HTTP serving and camera asset delivery',async()=>{
 const server=createAppServer();server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const home=await fetch(base);assert.equal(home.status,200);assert.match(await home.text(),/V0.3/);assert.match(home.headers.get('permissions-policy'),/camera=\(self\)/);assert.equal(home.headers.get('cache-control'),'no-cache');
  const health=await fetch(base+'/health');assert.equal((await health.json()).status,'ok');
  for(const [url,type] of [['/app.js','text/javascript'],['/gaze-model.js','text/javascript'],['/reliability.js','text/javascript'],['/stories.js','text/javascript'],['/mediapipe/face_mesh/face_mesh_solution_simd_wasm_bin.wasm','application/wasm'],['/mediapipe/face_mesh/face_mesh_solution_packed_assets.data','application/octet-stream']]){const r=await fetch(base+url,{method:'HEAD'});assert.equal(r.status,200,url);assert.match(r.headers.get('content-type'),new RegExp(type));assert.ok(+r.headers.get('content-length')>0);}
  for(const url of ['/.git/config','/.openai/hosting.json','/server.mjs','/%00','/missing'])assert.equal((await fetch(base+url)).status,404,url);
  assert.equal((await fetch(base,{method:'POST',body:'discarded'})).status,405);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
