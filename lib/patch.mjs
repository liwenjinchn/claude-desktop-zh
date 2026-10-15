import fs from 'node:fs';
import path from 'node:path';
import { filesBelow, LOCALES, localeValue } from './common.mjs';

const ARRAY = /\[(?:"[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*",?){3,}\]/g;
const NAMES = '{"en-US":{name:"English (United States)",localName:"English (United States)"},';
export function resourcesAt(source) {
  const root = path.resolve(source);
  const candidates = [path.join(root, 'resources'), path.join(root, 'Contents', 'Resources'), root];
  const resources = candidates.find(p => fs.existsSync(path.join(p, 'ion-dist', 'i18n', 'en-US.json')));
  if (!resources) throw new Error('No external ion-dist frontend found. This build layout is unsupported.');
  return resources;
}
export function discoverPatchTargets(resources, overrides = new Map()) {
  const assets = path.join(resources, 'ion-dist', 'assets');
  const js = filesBelow(assets).filter(p => p.endsWith('.js')).map(file => ({ file, relative: path.relative(resources, file), text: overrides.get(path.relative(resources, file)) ?? fs.readFileSync(file, 'utf8') }));
  const runtimes = js.filter(x => x.text.includes('"spa:locale"') && x.text.includes('meta[name="i18n-catalogs"]'));
  const selectors = js.filter(x => x.text.includes(NAMES));
  if (runtimes.length !== 1 || selectors.length !== 1) throw new Error(`Unsupported frontend: expected one locale runtime and one selector, found ${runtimes.length}/${selectors.length}. No changes applied.`);
  return { runtime: runtimes[0], selector: selectors[0] };
}
export function patchRuntime(source, locale, locales) {
  localeValue(locale);
  if (!locales.includes(locale) || locales.some(l => !LOCALES.includes(l))) throw new Error('Selected catalog is unavailable.');
  let arrays = 0;
  let result = source.replace(ARRAY, text => {
    const names = JSON.parse(text);
    if (!names.includes('en-US') || !names.includes('pt-BR') || !names.includes('id-ID')) return text;
    arrays++;
    return JSON.stringify([...new Set([...names, ...locales])]);
  });
  if (arrays !== 2) throw new Error(`Language-array anchors changed: ${arrays}, expected 2.`);
  const listing = /function ([$\w]+)\(\)\{let e=\[\];try\{if\(typeof document<"u"\)\{let t=document\.querySelector\('meta\[name="i18n-catalogs"\]'\)/g;
  const listMatches = [...result.matchAll(listing)];
  if (listMatches.length !== 1) throw new Error('Catalog-list anchor changed.');
  const name = listMatches[0][1];
  const declaration = `function ${name}(){let e=[];`;
  result = result.replace(declaration, `function ${name}(){let e=${JSON.stringify(locales.map(l => [l, '3pzh', '3pzh']))};`);
  const loader = new RegExp('function ([$\\w]+)\\(e\\)\\{for\\(let\\[t,n,r\\]of ' + name.replace(/[$]/g, '\\$&') + '\\(\\)\\)if\\(t===e\\)return\\{base:');
  const match = result.match(loader);
  if (!match) throw new Error('Catalog-loader anchor changed.');
  const start = `function ${match[1]}(e){`;
  const routes = locales.map(l => `if(e===${JSON.stringify(l)})return{base:${JSON.stringify('/i18n/' + l + '.json')},dynamic:${JSON.stringify('/i18n/dynamic/' + l + '.json')}};`).join('');
  result = result.replace(start, start + routes);
  // Runs before this module's language initialization, in the copied local frontend.
  return `/* claude-desktop-3p-zh */try{localStorage.setItem("spa:locale",${JSON.stringify(locale)});localStorage.setItem("spa:locale-source","user_choice")}catch{};` + result;
}
export function patchSelector(source, locales) {
  if (source.split(NAMES).length - 1 !== 1) throw new Error('Language-name anchor changed.');
  const labels = locales.map(l => JSON.stringify(l) + ':' + JSON.stringify({ name: l === 'zh-Hans' ? 'Chinese (Simplified)' : 'Chinese (Traditional)', localName: l === 'zh-Hans' ? '中文（简体）' : '中文（繁體）' }) + ',').join('');
  return source.replace(NAMES, '{' + labels + NAMES.slice(1));
}
export function buildPatch(resources, locale, catalogs, overrides = new Map()) {
  const locales = Object.keys(catalogs), targets = discoverPatchTargets(resources, overrides);
  const result = new Map([
    [targets.runtime.relative, Buffer.from(patchRuntime(targets.runtime.text, locale, locales))],
    [targets.selector.relative, Buffer.from(patchSelector(targets.selector.text, locales))],
  ]);
  for (const [language, catalog] of Object.entries(catalogs)) {
    result.set(path.join('ion-dist', 'i18n', language + '.json'), Buffer.from(JSON.stringify(catalog.base.messages)));
    result.set(path.join('ion-dist', 'i18n', 'dynamic', language + '.json'), Buffer.from(JSON.stringify(catalog.dynamic.messages)));
  }
  return result;
}
