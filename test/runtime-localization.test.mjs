import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { saveCatalog } from '../lib/catalogs.mjs';
import { sha256 } from '../lib/common.mjs';
import { activateRuntimeCatalog, buildRuntimeLocalization, runtimeAutomationSource, runtimePickerAutomationSource } from '../scripts/build-runtime-localization.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'zh-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'app'), catalogs = path.join(root, 'catalogs');
  const resources = path.join(source, 'resources'), assets = path.join(resources, 'ion-dist/assets');
  fs.mkdirSync(assets, { recursive: true });
  fs.mkdirSync(path.join(resources, 'ion-dist/i18n/dynamic'), { recursive: true });
  fs.writeFileSync(path.join(resources, 'app.asar'), 'inert fixture');
  const languages = '["en-US","de-DE","pt-BR","id-ID"]';
  const runtime = `/* "spa:locale" */const a=${languages},b=${languages};function Zz(){let e=[];try{if(typeof document<"u"){let t=document.querySelector('meta[name="i18n-catalogs"]')}}catch{}return e}function Load(e){for(let[t,n,r]of Zz())if(t===e)return{base:"unused"}}var $State=make((e,t)=>({messages:{},messagesLocale:null,gates:[]}));export{$State as $Public};`;
  fs.writeFileSync(path.join(assets, 'runtime.js'), runtime);
  fs.writeFileSync(path.join(assets, 'selector.js'), 'const names={"en-US":{name:"English (United States)",localName:"English (United States)"},};');
  const english = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => ['key' + i, 'English {name}']));
  fs.writeFileSync(path.join(resources, 'ion-dist/i18n/en-US.json'), JSON.stringify(english));
  fs.writeFileSync(path.join(resources, 'ion-dist/i18n/dynamic/en-US.json'), '{"hello":"Hello"}');
  saveCatalog(catalogs, 'zh-Hans', 'base', Buffer.from(JSON.stringify(Object.fromEntries(Object.keys(english).map(k => [k, '你好 {name}'])))), { source: 'fixture' });
  saveCatalog(catalogs, 'zh-Hans', 'dynamic', Buffer.from('{"hello":"你好"}'), { source: 'fixture' });
  return { root, source, catalogs, assets, runtime };
}

test('runtime builder emits pinned data and manual picker without modifying application or overwriting outputs', t => {
  const f = fixture(t), output = path.join(f.root, 'experiment.js');
  const result = buildRuntimeLocalization(f.source, f.catalogs, 'zh-Hans', output);
  const spec = JSON.parse(fs.readFileSync(result.specOutput));
  assert.equal(result.automaticNextLaunch, false);
  assert.equal(result.storeExport, '$Public');
  assert.equal(spec.runtimeSha256, sha256(Buffer.from(f.runtime)));
  assert.equal(spec.base.key0, '你好 {name}');
  assert.equal(spec.dynamic.hello, '你好');
  const manifest = JSON.parse(fs.readFileSync(result.automationManifest));
  assert.equal(manifest.locale, 'zh-Hans');
  assert.equal(manifest.version, 2);
  assert.equal(sha256(fs.readFileSync(manifest.catalogFile)), manifest.catalogSha256);
  assert.equal(sha256(fs.readFileSync(manifest.payload)), manifest.payloadSha256);
  const command = fs.readFileSync(manifest.payload, 'utf8');
  assert.ok(command.length < 10_000);
  assert.equal(command.trimEnd().split('\n').length, 1);
  assert.equal(command.includes('你好'), false);
  new vm.Script(command);
  assert.equal(fs.readFileSync(path.join(f.assets, 'runtime.js'), 'utf8'), f.runtime);
  const before = fs.readFileSync(output);
  assert.throws(() => buildRuntimeLocalization(f.source, f.catalogs, 'zh-Hans', output), /already exists/);
  assert.deepEqual(fs.readFileSync(output), before);
  new vm.Script(fs.readFileSync(result.pickerOutput, 'utf8'));
});

test('runtime builder resolves the local store export when an earlier import uses the same source name', async t => {
  const f = fixture(t), output = path.join(f.root, 'experiment.js');
  const moduleURL = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  const dependency = moduleURL('export const $State = () => false;');
  const factory = 'function make(init){let state;const store={getState:()=>state,setState:patch=>Object.assign(state,patch)};state=init(store.setState,store.getState);return store;}';
  const runtime = `import{$State as Wrong}from ${JSON.stringify(dependency)};` + factory +
    f.runtime.replace('gates:[]', 'gates:[],setLocaleOverride:locale=>e({localeOverride:locale})') + 'export{Wrong};';
  fs.writeFileSync(path.join(f.assets, 'runtime.js'), runtime);
  const result = buildRuntimeLocalization(f.source, f.catalogs, 'zh-Hans', output);
  const spec = JSON.parse(fs.readFileSync(result.specOutput));
  const namespace = await import(moduleURL(runtime));
  assert.equal(typeof namespace.Wrong, 'function');
  assert.equal(namespace.Wrong.getState, undefined);
  const store = namespace[spec.storeExport];
  assert.equal(typeof store.getState, 'function');
  assert.equal(typeof store.setState, 'function');
  store.getState().setLocaleOverride(spec.locale);
  assert.equal(store.getState().localeOverride, 'zh-Hans');
  assert.equal(spec.runtimeSha256, sha256(Buffer.from(runtime)));
  const manifest = JSON.parse(fs.readFileSync(result.automationManifest));
  assert.equal(manifest.catalogSha256, sha256(fs.readFileSync(result.specOutput)));
  assert.equal(manifest.payloadSha256, sha256(fs.readFileSync(manifest.payload)));
  assert.equal(fs.readFileSync(path.join(f.assets, 'runtime.js'), 'utf8'), runtime);
});

test('runtime builder handles whitespace, comments, multiple export blocks and external re-exports', t => {
  const f = fixture(t), output = path.join(f.root, 'experiment.js');
  const runtime = 'export{$State as Wrong}from"./other.js";const other=1,last=2;' +
    f.runtime.replace('export{$State as $Public};', 'export /* own */ {other as Other,\n$State /* local */ as /* alias */ qf,\n};export{last as Last};') +
    'export{$State as AlsoWrong}from"./another.js";';
  fs.writeFileSync(path.join(f.assets, 'runtime.js'), runtime);
  const result = buildRuntimeLocalization(f.source, f.catalogs, 'zh-Hans', output);
  assert.equal(JSON.parse(fs.readFileSync(result.specOutput)).storeExport, 'qf');
});

test('runtime builder ignores export-like text in literals, comments and template interpolations', t => {
  const f = fixture(t), output = path.join(f.root, 'experiment.js');
  const decoys = [
    '// export{$State as Wrong};',
    '/* export{$State as Wrong}; */',
    'const quoted=";export{$State as Wrong};";',
    "const single=';export{$State as Wrong};';",
    'const template=`export{$State as Wrong};${(()=>({value:"export{$State as Wrong}"}))()}tail`;',
    'const nested=`${`export{$State as Wrong};${1}`}tail`;',
    'const regex=/export\\{\\$State as Wrong\\}/;',
    'if(false)/[{}]/.test("");',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(f.assets, 'runtime.js'), decoys + f.runtime + '\nconst trailing=`export{$State as Wrong};`;');
  const result = buildRuntimeLocalization(f.source, f.catalogs, 'zh-Hans', output);
  assert.equal(JSON.parse(fs.readFileSync(result.specOutput)).storeExport, '$Public');
});

test('runtime builder accepts an unaliased local named export', t => {
  const f = fixture(t), output = path.join(f.root, 'experiment.js');
  fs.writeFileSync(path.join(f.assets, 'runtime.js'), f.runtime.replace('export{$State as $Public};', 'export{$State};'));
  const result = buildRuntimeLocalization(f.source, f.catalogs, 'zh-Hans', output);
  assert.equal(JSON.parse(fs.readFileSync(result.specOutput)).storeExport, '$State');
});

test('missing, ambiguous and external-only store exports refuse every generated artifact', async t => {
  const cases = [
    ['missing', 'export{other as Other};'],
    ['external-only', 'export{$State as Wrong}from"./other.js";'],
    ['ambiguous', 'export{$State as First,$State as Second};'],
    ['separate aliases', 'export{$State as First};export{$State as Second};'],
  ];
  for (const [name, exports] of cases) await t.test(name, t => {
    const f = fixture(t), output = path.join(f.root, 'experiment.js');
    fs.writeFileSync(path.join(f.assets, 'runtime.js'), 'const other=1;' + f.runtime.replace('export{$State as $Public};', exports));
    assert.throws(() => buildRuntimeLocalization(f.source, f.catalogs, 'zh-Hans', output), /Unsupported language-store export/);
    for (const suffix of ['', '.spec.json', '.picker.js', '.automation.js', '.automation.json']) {
      assert.equal(fs.existsSync(output + suffix), false);
    }
  });
});

test('small automation picker validates data before acknowledging and refuses changed or cancelled files', async () => {
  const data=Buffer.from(JSON.stringify({locale:'zh-Hans',runtimeUrl:'/runtime.js',runtimeSha256:'0'.repeat(64)}));
  const marker='CLAUDE_ZH_APPLIED_'+'b'.repeat(32);
  const source=runtimePickerAutomationSource('zh-Hans',sha256(data),marker);
  const messages=[],errors=[];
  let cancelled=false,changed=false,opened=0;
  const context={location:{protocol:'app:',host:'localhost'},crypto:webcrypto,TextDecoder,
    console:{info:value=>messages.push(value),error:(...values)=>errors.push(values)},
    document:{createElement:tag=>{
      assert.equal(tag,'input');
      const input={files:[{arrayBuffer:async()=>Uint8Array.from(changed?Buffer.from('changed'):data).buffer}],
        click:()=>{opened++;queueMicrotask(()=>cancelled?input.oncancel():input.onchange());}};
      return input;
    }},
    claudeChineseRuntime:{locale:'zh-Hans',status:()=>({messagesLocale:'zh-Hans',catalogRequestsServed:2,restored:false})}};
  await vm.runInNewContext(source,context);
  assert.deepEqual(messages,[marker]);
  changed=true;
  await vm.runInNewContext(source,context);
  assert.equal(errors.at(-1)[1],'Catalog file changed.');
  cancelled=true;
  await vm.runInNewContext(source,context);
  assert.equal(errors.at(-1)[1],'Cancelled.');
  assert.equal(messages.length,1);
  assert.equal(opened,3);
  context.location.host='example.test';
  await vm.runInNewContext(source,context);
  assert.equal(opened,3);
  assert.equal(errors.at(-1)[1],'Wrong frontend.');
  context.location.host='localhost';
  delete context.claudeChineseRuntime;
  cancelled=false; changed=false;
  context.fetch=async()=>new Response('changed runtime');
  await vm.runInNewContext(source,context);
  assert.equal(errors.at(-1)[1],'Claude changed since this snippet was built. Build it again.');
  assert.equal(context.claudeChineseRuntime,undefined);
});

test('automation payload acknowledges an active matching language and refuses another active locale', async () => {
  const marker = 'CLAUDE_ZH_APPLIED_' + 'a'.repeat(32), source = runtimeAutomationSource({ locale: 'zh-Hans' }, marker);
  const messages = [], errors = [];
  const context = { location: { protocol: 'app:', host: 'localhost' },
    console: { info: value => messages.push(value), error: (...values) => errors.push(values) },
    claudeChineseRuntime: { locale: 'zh-Hans', status: () => ({ messagesLocale: 'zh-Hans', catalogRequestsServed: 2, restored: false }) } };
  await vm.runInNewContext(source, context);
  assert.deepEqual(messages, [marker]);
  assert.deepEqual(errors, []);
  context.claudeChineseRuntime.locale = 'zh-Hant';
  await vm.runInNewContext(source, context);
  assert.equal(messages.length, 1);
  assert.equal(errors[0][1], 'Restore the previous language experiment first.');
  assert.throws(() => runtimeAutomationSource({}, 'invalid'), /acknowledgement marker/);
});

test('unknown runtime store is refused before creating output artifacts', t => {
  const f = fixture(t), output = path.join(f.root, 'experiment.js');
  fs.writeFileSync(path.join(f.assets, 'runtime.js'), f.runtime.replace('var $State=', 'let $State='));
  assert.throws(() => buildRuntimeLocalization(f.source, f.catalogs, 'zh-Hans', output), /Unsupported language-store/);
  assert.equal(fs.existsSync(output), false);
  assert.equal(fs.existsSync(output + '.spec.json'), false);
});

test('runtime activation refuses another origin and resource drift before importing or mutating a page', async () => {
  const invoke = context => vm.runInNewContext('(' + activateRuntimeCatalog.toString() + ')(spec)', context);
  await assert.rejects(invoke({ location: { protocol: 'https:', host: 'example.test' }, spec: {} }), /original Claude/);
  let reads = 0;
  const context = { location: { protocol: 'app:', host: 'localhost' }, spec: { runtimeUrl: '/runtime.js', runtimeSha256: '0'.repeat(64) },
    crypto: webcrypto, fetch: async () => { reads++; return new Response('changed runtime'); } };
  await assert.rejects(invoke(context), /changed since/);
  assert.equal(reads, 1);
  assert.equal(context.claudeChineseRuntime, undefined);
});
