import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { preparePackage } from './prepare.mjs';

let dir, server, pkg;
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'dropflex-capcut-test-'));
  const file = path.join(dir, 'fixture.mp4');
  await promisify(execFile)('ffmpeg', ['-hide_banner','-loglevel','error','-nostdin','-f','lavfi','-i','testsrc2=size=128x228:rate=24','-f','lavfi','-i','sine=frequency=300:sample_rate=48000','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',file]);
  const video=await readFile(file),image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
  server=createServer((req,res)=>{const isImage=new URL(req.url,'http://localhost').pathname==='/product.png';res.writeHead(200,{'Content-Type':isImage?'image/png':'video/mp4'});res.end(isImage?image:video);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  pkg={version:2,name:'fixture',product:{id:'fixture',title:'Organizador'},a_roll:[{key:'A1',line:'Encuentra todo',seconds:6,url:`${origin}/A1.mp4?token=private-fixture`}],b_roll:[{key:'B1',anchor:'todo',cut_s:1,url:`${origin}/B1.mp4?token=private-fixture`}],end_card:{image_url:`${origin}/product.png`,title:'Organizador',subtitle:'Pagas al recibir',cta:'Comprar',small_print:[]},expires_at:new Date(Date.now()+3600000).toISOString(),source:{script_id:'fixture',artifact_etag:'a'.repeat(64)},editing_brief:{objective:'Mostrar orden',art_direction:'Primeros planos',pacing:'Ágil',captions:'Legibles',sound:'Voz primero'}};
});
after(async()=>{server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));if(dir)await rm(dir,{recursive:true,force:true});});
test('prepara clips reales, tiempos medidos y referencia, sin guardar URLs firmadas',async()=>{
  const output=path.join(dir,'project');
  assert.deepEqual(await preparePackage({ok:true,data:{package:pkg}},output,{allowLocal:true}),{directory:output,clips:2,analyzed:true});
  const text=await readFile(path.join(output,'package.local.json'),'utf8'),local=JSON.parse(text),analysis=JSON.parse(await readFile(path.join(output,'analysis.json'),'utf8'));
  assert.ok(!text.includes('private-fixture'));assert.ok(!text.includes('http:'));assert.equal(local.a_roll[0].file,'A1.mp4');assert.match(local.a_roll[0].sha256,/^[a-f0-9]{64}$/);assert.equal(local.editing_brief.art_direction,'Primeros planos');assert.equal(local.end_card.image_file,'product.png');assert.equal(analysis.clips[0].duration_s,2);assert.equal(analysis.clips[0].has_audio,true);assert.equal(analysis.clips[0].frames[0].second,0);assert.ok((await readdir(output)).includes('A1-0s.jpg'));
  await assert.rejects(preparePackage(pkg,output,{allowLocal:true}),{code:'EEXIST'});
});
test('rechaza claves que salen de la carpeta y tomas duplicadas antes de escribir',async()=>{
  await assert.rejects(preparePackage({...pkg,a_roll:[{...pkg.a_roll[0],key:'../A1'}]},path.join(dir,'bad'),{allowLocal:true}),/claves/);
  await assert.rejects(preparePackage({...pkg,b_roll:[pkg.a_roll[0]]},path.join(dir,'duplicate'),{allowLocal:true}),/claves/);
});
test('no descarga paquetes vencidos ni permite HTTP local fuera de la prueba',async()=>{
  await assert.rejects(preparePackage({...pkg,expires_at:'2020-01-01T00:00:00Z'},path.join(dir,'expired'),{allowLocal:true}),/venció/);
  await assert.rejects(preparePackage(pkg,path.join(dir,'unsafe')),/HTTPS/);
});
