// Builds a manual, reversible DevTools experiment. Does not start or modify Claude.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { sha256, localeValue } from '../lib/common.mjs';
import { discoverPatchTargets } from '../lib/patch.mjs';
import { plan } from '../lib/install.mjs';
import { localNamedExport } from '../lib/module-exports.mjs';

// Serialized into the generated snippet; keep this function self-contained.
export async function activateRuntimeCatalog(spec, expectedOrigin = 'app://localhost') {
  const origin = location.protocol + '//' + location.host;
  if (origin !== expectedOrigin) throw new Error('Run this only in the original Claude app://localhost frontend.');
  if (globalThis.claudeChineseRuntime) throw new Error('Restore the active experiment before applying another language.');
  const originalFetch = globalThis.fetch;
  const response = await originalFetch(spec.runtimeUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error('Cannot verify the installed language runtime.');
  const bytes = await response.arrayBuffer();
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
  if (digest !== spec.runtimeSha256) throw new Error('Claude changed since this snippet was built. Build it again.');
  const module = await import(spec.runtimeUrl);
  const store = module[spec.storeExport];
  if (typeof store?.getState !== 'function' || typeof store?.setState !== 'function' || typeof store.getState().setLocaleOverride !== 'function') throw new Error('Unsupported language store.');
  const before = store.getState();
  const previous = { localeOverride: before.localeOverride, localeChoice: before.localeChoice };
  let meta = document.querySelector('meta[name="i18n-catalogs"]');
  const created = !meta;
  if (!meta) { meta = document.createElement('meta'); meta.name = 'i18n-catalogs'; document.head.append(meta); }
  const oldCatalogs = meta.getAttribute('data-i18n-catalogs');
  const oldCut = meta.getAttribute('data-i18n-cut');
  // The existing normalizer accepts locales present in this manifest.
  const marker = spec.locale + ':runtime3pzh.runtime3pzh';
  const entries = (oldCatalogs || '').split(',').filter(Boolean);
  if (entries.some(x => x.split(':')[0] === spec.locale)) {
    if (created) meta.remove();
    throw new Error('This page already declares the selected locale. Use its normal language picker.');
  }
  const newCatalogs = [...entries, marker].join(',');
  const cut = oldCut || '';
  const routes = new Map([
    ['/i18n/' + cut + spec.locale + '.json', spec.base],
    ['/i18n/dynamic/' + spec.locale + '.json', spec.dynamic],
  ]);
  let served = 0, restored = false;
  const wrappedFetch = function(input, init) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    const method = (init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
    const body = origin === url.protocol + '//' + url.host && method === 'GET' ? routes.get(url.pathname) : undefined;
    if (body !== undefined) {
      served++;
      return Promise.resolve(new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json; charset=utf-8' } }));
    }
    return Reflect.apply(originalFetch, globalThis, [input, init]);
  };
  const restoreAttribute = (name, value) => value === null ? meta.removeAttribute(name) : meta.setAttribute(name, value);
  const control = {
    locale: spec.locale,
    nextLaunchAutomatic: false,
    status() { const s = store.getState(); return { locale: spec.locale, messagesLocale: s.messagesLocale, catalogRequestsServed: served, restored, nextLaunchAutomatic: false }; },
    restore() {
      if (restored) return;
      restored = true;
      if (globalThis.fetch === wrappedFetch) globalThis.fetch = originalFetch;
      if (meta.getAttribute('data-i18n-catalogs') === newCatalogs) {
        if (created) meta.remove();
        else { restoreAttribute('data-i18n-catalogs', oldCatalogs); restoreAttribute('data-i18n-cut', oldCut); }
      }
      store.getState().setLocaleOverride(previous.localeOverride);
      store.setState({ localeChoice: previous.localeChoice });
      if (globalThis.claudeChineseRuntime === control) delete globalThis.claudeChineseRuntime;
    },
  };
  meta.setAttribute('data-i18n-catalogs', newCatalogs);
  globalThis.fetch = wrappedFetch;
  globalThis.claudeChineseRuntime = control;
  try { store.getState().setLocaleOverride(spec.locale); }
  catch (error) { control.restore(); throw error; }
  return control.status();
}

export function runtimeSpec(source, catalogDirectory, locale) {
  localeValue(locale);
  const prepared = plan(source, catalogDirectory, locale);
  const runtime = discoverPatchTargets(prepared.application.resources).runtime;
  if (sha256(Buffer.from(runtime.text)) !== prepared.sourceHashes[runtime.relative]) throw new Error('Language runtime changed during planning.');
  const stores = [...runtime.text.matchAll(/var ([$\w]+)=[$\w]+\(\(e,t\)=>\(\{messages:\{\},messagesLocale:null,gates:\[\]/g)];
  if (stores.length !== 1) throw new Error('Unsupported language-store export. No snippet generated.');
  const storeExport = localNamedExport(runtime.text, stores[0][1]);
  const catalogs = prepared.catalogs[locale];
  return {
    locale, runtimeUrl: '/' + runtime.relative.replaceAll('\\', '/').replace(/^ion-dist\//, ''),
    runtimeSha256: sha256(Buffer.from(runtime.text)), storeExport,
    base: catalogs.base.messages, dynamic: catalogs.dynamic.messages,
  };
}

export function buildRuntimeLocalization(source, catalogDirectory, locale, output) {
  const spec = runtimeSpec(source, catalogDirectory, locale);
  const snippet = '/* Manual runtime language experiment; no automatic next-launch installation. */\n' +
    '(' + activateRuntimeCatalog.toString() + ')(' + JSON.stringify(spec) + ').then(console.info, console.error);\n';
  const specJSON = JSON.stringify(spec);
  const specOutput = output + '.spec.json', pickerOutput = output + '.picker.js';
  // The small console script selects local data through the browser file picker.
  // It never evaluates file contents or needs a network/CSP exception.
  const picker = `(async () => {
    if (location.protocol + '//' + location.host !== 'app://localhost') throw new Error('Open Claude DevTools first.');
    const file = await new Promise((resolve, reject) => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
      input.oncancel = () => reject(new Error('Cancelled.'));
      input.onchange = () => input.files[0] ? resolve(input.files[0]) : reject(new Error('No file selected.'));
      input.click();
    });
    const bytes = await file.arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
    if (hash !== ${JSON.stringify(sha256(Buffer.from(specJSON)))}) throw new Error('Select the matching generated .spec.json file.');
    return (${activateRuntimeCatalog.toString()})(JSON.parse(new TextDecoder().decode(bytes)));
  })().then(console.info, console.error);\n`;
  const successMarker = 'CLAUDE_ZH_APPLIED_' + randomUUID().replaceAll('-', '');
  const automationOutput = output + '.automation.js', manifestOutput = output + '.automation.json';
  const catalogSha256 = sha256(Buffer.from(specJSON));
  const automation = runtimePickerAutomationSource(spec.locale, catalogSha256, successMarker);
  const manifest = { version: 2, sourceExecutable: path.resolve(source, 'Claude.exe'), locale,
    payload: path.resolve(automationOutput), payloadSha256: sha256(Buffer.from(automation)), successMarker,
    catalogFile: path.resolve(specOutput), catalogSha256 };
  const artifacts = [[output, snippet], [specOutput, specJSON], [pickerOutput, picker],
    [automationOutput, automation], [manifestOutput, JSON.stringify(manifest, null, 2)]];
  if (artifacts.some(([file]) => fs.existsSync(file))) throw new Error('Output already exists. Choose a new output filename.');
  const created = [];
  try { for (const [file, data] of artifacts) { fs.writeFileSync(file, data, { flag: 'wx' }); created.push(file); } }
  catch (error) { for (const file of created) fs.unlinkSync(file); throw error; }
  return { output: path.resolve(output), specOutput: path.resolve(specOutput), pickerOutput: path.resolve(pickerOutput),
    automationManifest: path.resolve(manifestOutput), locale, runtimeUrl: spec.runtimeUrl, runtimeSha256: spec.runtimeSha256,
    storeExport: spec.storeExport, baseMessages: Object.keys(spec.base).length, dynamicMessages: Object.keys(spec.dynamic).length,
    automaticNextLaunch: false, originalApplicationModified: false, originalProfileModifiedByBuilder: false };
}

export function runtimeAutomationSource(spec, successMarker) {
  if (!/^CLAUDE_ZH_APPLIED_[a-f0-9]{32}$/.test(successMarker)) throw new Error('Invalid automation acknowledgement marker.');
  return `(async () => {
    if (location.protocol + '//' + location.host !== 'app://localhost') throw new Error('Wrong frontend.');
    const desired = ${JSON.stringify(spec.locale)};
    if (globalThis.claudeChineseRuntime && globalThis.claudeChineseRuntime.locale !== desired) throw new Error('Restore the previous language experiment first.');
    if (!globalThis.claudeChineseRuntime) await (${activateRuntimeCatalog.toString()})(${JSON.stringify(spec)});
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const state = globalThis.claudeChineseRuntime.status();
      if (state.messagesLocale === desired && state.catalogRequestsServed >= 2 && !state.restored) {
        console.info(${JSON.stringify(successMarker)}); return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Chinese catalog application was not acknowledged.');
  })().catch(error => console.error('CLAUDE_ZH_AUTOMATION_FAILED', error.message));\n`;
}

export function runtimePickerAutomationSource(locale, catalogSha256, successMarker) {
  localeValue(locale);
  if (!/^[a-f0-9]{64}$/.test(catalogSha256) || !/^CLAUDE_ZH_APPLIED_[a-f0-9]{32}$/.test(successMarker)) throw new Error('Invalid picker payload identity.');
  // This known function contains only whole-line comments. Keep the console
  // command on one short logical line so editor virtualization cannot hide data.
  const activate = activateRuntimeCatalog.toString().split(/\r?\n/).filter(line => !/^\s*\/\//.test(line)).map(line => line.trim()).join(' ');
  const source = `(async()=>{
    if(location.protocol+'//'+location.host!=='app://localhost')throw new Error('Wrong frontend.');
    const desired=${JSON.stringify(locale)};
    if(globalThis.claudeChineseRuntime&&globalThis.claudeChineseRuntime.locale!==desired)throw new Error('Restore the previous language experiment first.');
    const file=await new Promise((resolve,reject)=>{const input=document.createElement('input');input.type='file';input.accept='.json';input.oncancel=()=>reject(new Error('Cancelled.'));input.onchange=()=>input.files[0]?resolve(input.files[0]):reject(new Error('No file selected.'));input.click();});
    const bytes=await file.arrayBuffer();
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(hash!==${JSON.stringify(catalogSha256)})throw new Error('Catalog file changed.');
    const spec=JSON.parse(new TextDecoder().decode(bytes));
    if(spec.locale!==desired)throw new Error('Wrong catalog locale.');
    if(!globalThis.claudeChineseRuntime)await (${activate})(spec);
    const deadline=Date.now()+15000;
    while(Date.now()<deadline){const s=globalThis.claudeChineseRuntime.status();if(s.messagesLocale===desired&&s.catalogRequestsServed>=2&&!s.restored){console.info(${JSON.stringify(successMarker)});return;}await new Promise(resolve=>setTimeout(resolve,100));}
    throw new Error('Chinese catalog application was not acknowledged.');
  })().catch(error=>console.error('CLAUDE_ZH_AUTOMATION_FAILED',error.message));`;
  return source.split('\n').map(line => line.trim()).join(' ') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, catalogDirectory, locale, output] = process.argv.slice(2);
  if (!source || !catalogDirectory || !locale || !output) throw new Error('Usage: node scripts/build-runtime-localization.mjs SOURCE CATALOG_DIR zh-Hans|zh-Hant OUTPUT.js');
  console.log(JSON.stringify(buildRuntimeLocalization(source, catalogDirectory, locale, output), null, 2));
}
