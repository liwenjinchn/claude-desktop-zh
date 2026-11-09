import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { downloadBrowserCatalog, updateBrowserCatalogs, officialCatalogURL } from '../lib/browser-catalogs.mjs';
import { createController } from '../integrations/magpie/controller.mjs';
const temp = t => { const d=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'browser-catalog-test-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d; };
const base = Buffer.from(JSON.stringify(Object.fromEntries(Array.from({length:1000},(_,i)=>['key'+i,'中文']))));
const dynamic = Buffer.from('{"a":"中文"}');
test('browser download accepts only exact official catalog URLs before opening a browser', async t => {
 for (const url of ['https://evil.test/i18n/zh-Hans.json','https://claude.ai/i18n/zh-Hans.json?x=1','https://user@claude.ai/i18n/zh-Hans.json'])
  await assert.rejects(downloadBrowserCatalog(url,temp(t),{run:()=>assert.fail('must not open browser')}),/Only official/);
 assert.equal(officialCatalogURL('zh-Hans','dynamic'),'https://claude.ai/i18n/dynamic/zh-Hans.json');
});
test('browser ignores challenge HTML, imports complete JSON, closes only its own exact tab', async t => {
 let saves=0; const calls=[];
 const data=await downloadBrowserCatalog(officialCatalogURL('zh-Hans','dynamic'),temp(t),{sleep:async()=>{}, run:async(_script,args)=>{
  calls.push(args);
  if(args.length===1)return '10|20';
  assert.deepEqual(args.slice(0,3),['10','20','https://claude.ai/i18n/dynamic/zh-Hans.json']);
  if(args[3]!=='close')fs.writeFileSync(args[3],++saves===1?'<html>Just a moment...</html>':dynamic);
  return 'ok';
 }});
 assert.deepEqual(data,dynamic);assert.equal(saves,2);assert.equal(calls.at(-1)[3],'close');
});
test('both downloads and compatibility validation complete before active store changes', async t => {
 const d=temp(t);fs.writeFileSync(path.join(d,'existing'),'unchanged');
 const deps={platform:'darwin',findApp:()=>'/fixture',download:async url=>url.includes('/dynamic/')?dynamic:base,validate:()=>{throw Error('Missing compatible catalogs');}};
 await assert.rejects(updateBrowserCatalogs(d,'zh-Hans',null,deps),/Missing compatible/);
 assert.deepEqual(fs.readdirSync(d),['existing']);
 const result=await updateBrowserCatalogs(d,'zh-Hans',null,{...deps,validate:()=>({base:{a:'中文'},dynamic:{b:'中文'}})});
 assert.equal(result.state,'CatalogsUpdated');assert.equal(result.imported.length,2);assert.equal(fs.readFileSync(path.join(d,'existing'),'utf8'),'unchanged');
 const again=await updateBrowserCatalogs(d,'zh-Hans',null,{...deps,validate:()=>({base:{},dynamic:{}})});assert.equal(again.imported.length,0);
});
test('failed second download leaves active catalogs untouched', async t => {
 const d=temp(t);
 await assert.rejects(updateBrowserCatalogs(d,'zh-Hans',null,{platform:'darwin',findApp:()=>'/fixture',download:async url=>{if(url.includes('/dynamic/'))throw Error('cancelled');return base;}}),/cancelled/);
 assert.deepEqual(fs.readdirSync(d),[]);
});
test('browser update is explicit, guarded, and retries localization only after import', async()=>{
 const calls=[];const run=async(_c,args)=>{calls.push(args);return {state:args[0]==='catalog'?'CatalogsUpdated':'Applied'};};
 const c=createController({platform:'darwin'},run);
 await assert.rejects(c.execute('browser-update'),/Confirm/);assert.equal(calls.length,0);
 const r=await c.execute('browser-update','browser-update');assert.equal(r.application.state,'Applied');assert.deepEqual(calls.map(x=>x[0]),['catalog','mac-apply']);
 await assert.rejects(createController({platform:'darwin',allowWrites:false},run).execute('browser-update','browser-update'),/Writes disabled/);
 await assert.rejects(createController({platform:'win32'},run).execute('browser-update','browser-update'),/macOS/);
});
