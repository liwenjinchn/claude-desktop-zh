#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { inspect, plan, prepareCopy, status, switchLocale, restore, launch, detect3p } from '../lib/install.mjs';
import { checkOriginal, planOriginal, applyOriginal, statusOriginal, switchOriginal, restoreOriginal } from '../lib/original.mjs';
import { fetchCatalog, saveCatalog } from '../lib/catalogs.mjs';
import { importCache } from '../lib/cache.mjs';
import { readJSON, localeValue } from '../lib/common.mjs';
import { discover, discoverInstall, discoverProfiles, discoverCaches, defaultLayout } from '../lib/discover.mjs';
import { buildRuntimeLocalization } from '../scripts/build-runtime-localization.mjs';
import { runtimeSetupStatus, setupRuntime, restoreRuntimeSetup, windowsSetupGuard } from '../lib/runtime-setup.mjs';

const help = `claude-desktop-zh 0.1.0 (Node 22+)

discover
original-check   [--source <app>]
original-plan    [--source <app>] [--state-dir <backup directory>] [--locale zh-Hans|zh-Hant]
original-install [--source <app>] [--state-dir <backup directory>] [--locale zh-Hans|zh-Hant]
original-status  [--state-dir <backup directory>]
original-switch  [--state-dir <backup directory>] --locale zh-Hans|zh-Hant
original-restore [--state-dir <backup directory>]

Original resource commands change language resources only and preserve existing user data.
Protected MSIX/WindowsApps packages are refused; no automatic permission changes.

inspect       [--source <Claude app directory or Claude.app>]
detect-3p     [--profile-dir <Claude-3p directory>]
plan          [--source <app>] [--locale zh-Hans|zh-Hant] [--catalog-dir <dir>]
runtime-export [--source <app>] [--locale zh-Hans|zh-Hant] --output <new JS file>
runtime-setup-status [--profile-dir <Claude-3p directory>]
runtime-setup [--profile-dir <Claude-3p directory>] [--state-dir <backup directory>]
runtime-setup-restore --file <setup journal> [--profile-dir <Claude-3p directory>]
catalog import --locale <locale> --kind base|dynamic --file <JSON> [--url <source>]
catalog cache  --locale <locale> [--cache <Chromium Cache_Data directory>]
catalog fetch  --locale <locale> [--kind base|dynamic] [--url <official URL>]
prepare-copy  [--source <app>] [--destination <new directory>] [--locale zh-Hans|zh-Hant]
              [--gateway-profile <configLibrary profile JSON>]
              OR --gateway-url <URL> --gateway-key-file <text file>
switch        [--root <managed directory>] --locale zh-Hans|zh-Hant
status        [--root <managed directory>]
restore       [--root <managed directory>]
launch        [--root <managed directory>]

Omitted paths are discovered. The managed copy defaults to
%LOCALAPPDATA%\\claude-desktop-3p-zh\\copy. Catalogs default to .catalogs in the
current directory; use --catalog-dir to select another catalog store.
The default locale is zh-Hans. Both languages require their own official catalogs.
Windows: prepare-copy modifies a separate application copy only.
macOS: inspect/plan only; no signature changes or automatic re-signing.
prepare-copy/restore/switch require the managed copy to be closed.
No chat history, sign-in state, or real deployment mode is changed.
`;
function argumentsOf(argv) {
  const words = [], options = Object.create(null);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) { words.push(argv[i]); continue; }
    const key = argv[i].slice(2);
    if (options[key] !== undefined || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Flag requires one value: --' + key);
    options[key] = argv[++i];
  }
  const valid = new Set(['source', 'locale', 'catalog-dir', 'kind', 'file', 'url', 'cache', 'destination', 'gateway-profile', 'gateway-url', 'gateway-key-file', 'root', 'profile-dir', 'state-dir', 'output', 'runtime-owner']);
  for (const key of Object.keys(options)) if (!valid.has(key)) throw new Error('Unknown flag: --' + key);
  return { words, options };
}
function required(options, key) { if (!options[key]) throw new Error('Missing --' + key); return options[key]; }
function importDiscoveredCaches(directory, locale) {
  const caches = discoverCaches();
  if (!caches.length) throw new Error('No language cache found. Open Claude in the language once, or pass --cache.');
  const imported = [], skipped = [];
  for (const cache of caches) {
    try {
      // importCache only accepts the corresponding official language URLs.
      const result = importCache(cache, directory, locale);
      imported.push(...result.imported);
      skipped.push(...result.skipped.map(item => ({ cache, ...item })));
    } catch (error) { skipped.push({ cache, reason: error.message }); }
  }
  if (!imported.length) throw new Error(`No readable ${locale} catalog in discovered caches. Pass --cache or import JSON explicitly. ` + skipped.map(item => `${item.cache}: ${item.reason}`).join('; '));
  return { imported, skipped };
}
async function locked(root, callback) {
  const resolved = path.resolve(root);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const lock = resolved + '.3p-zh-lock';
  let fd;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch { throw new Error('Another operation is running, or a stale lock exists: ' + lock + '. Confirm no installer is running before removing it.'); }
  try { fs.writeFileSync(fd, String(process.pid)); return await callback(); }
  finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
async function main() {
  const { words, options } = argumentsOf(process.argv.slice(2)), [command, subcommand] = words;
  if (!command || command === 'help') { console.log(help); return; }
  if (words.length > (command === 'catalog' ? 2 : 1)) throw new Error('Unexpected positional argument.');
  const directory = () => path.resolve(options['catalog-dir'] ?? '.catalogs');
  const locale = () => localeValue(options.locale);
  const source = () => options.source ?? discoverInstall().source;
  const profile = () => discoverProfiles(undefined, options['profile-dir']);
  const root = () => options.root ?? defaultLayout().managedRoot;
  const stateDirectory = () => options['state-dir'] ?? defaultLayout().originalStateDirectory;
  let result;
  switch (command) {
    case 'discover': result = discover({ source: options.source, profileDirectory: options['profile-dir'], gatewayProfile: options['gateway-profile'], managedRoot: options.root ?? options.destination, catalogDirectory: options['catalog-dir'], cache: options.cache }); break;
    case 'original-check': result = checkOriginal(source(), stateDirectory()); break;
    case 'original-plan': result = planOriginal(options.source ?? (fs.existsSync(path.join(stateDirectory(), 'original-state.json')) ? undefined : source()), stateDirectory(), directory(), locale()); break;
    case 'original-install': result = await locked(stateDirectory(), () => applyOriginal(source(), stateDirectory(), directory(), locale())); break;
    case 'original-status': result = statusOriginal(stateDirectory()); break;
    case 'original-switch': result = await locked(stateDirectory(), () => switchOriginal(stateDirectory(), directory(), locale())); break;
    case 'original-restore': result = await locked(stateDirectory(), () => restoreOriginal(stateDirectory())); break;
    case 'inspect': result = inspect(source()); break;
    case 'detect-3p': result = detect3p(options['profile-dir'] ?? profile().directory); break;
    case 'plan': result = plan(source(), directory(), locale()).report; break;
    case 'runtime-export': result = buildRuntimeLocalization(source(), directory(), locale(), required(options, 'output')); break;
    case 'runtime-setup-status': result = runtimeSetupStatus(profile().directory); break;
    case 'runtime-setup': {
      const p = profile().directory;
      const state = path.join(stateDirectory(), 'runtime-setup');
      result = await locked(state, () => setupRuntime(p, state, windowsSetupGuard(options['runtime-owner'])));
      break;
    }
    case 'runtime-setup-restore': result = restoreRuntimeSetup(profile().directory, required(options, 'file'), windowsSetupGuard(options['runtime-owner'])); break;
    case 'catalog': {
      const kind = options.kind ?? 'base';
      if (subcommand === 'import') result = saveCatalog(directory(), locale(), kind, fs.readFileSync(required(options, 'file')), { source: 'user-import', ...(options.url ? { url: options.url } : {}) });
      else if (subcommand === 'cache') result = options.cache ? importCache(options.cache, directory(), locale()) : importDiscoveredCaches(directory(), locale());
      else if (subcommand === 'fetch') result = await fetchCatalog(directory(), locale(), kind, options.url ?? `https://claude.ai/i18n/${kind === 'dynamic' ? 'dynamic/' : ''}${locale()}.json`);
      else throw new Error('Use catalog import, cache, or fetch.');
      break;
    }
    case 'prepare-copy': {
      let gateway;
      if (options['gateway-profile']) gateway = readJSON(options['gateway-profile']);
      else if (options['gateway-url']) gateway = { inferenceProvider: 'gateway', inferenceGatewayBaseUrl: options['gateway-url'], inferenceGatewayApiKey: fs.readFileSync(required(options, 'gateway-key-file'), 'utf8').trim() };
      else gateway = readJSON(profile().profilePath);
      const destination = options.destination ?? defaultLayout().managedRoot;
      const application = source(), catalogs = directory(), language = locale();
      result = await locked(destination, () => prepareCopy(application, destination, catalogs, language, gateway));
      break;
    }
    case 'status': result = status(root()); break;
    case 'switch': result = await locked(root(), () => switchLocale(root(), directory(), locale())); break;
    case 'restore': result = await locked(root(), () => restore(root())); break;
    case 'launch': result = await locked(root(), () => launch(root())); break;
    default: throw new Error('Unknown command. Run help.');
  }
  // Never print the gateway profile, key, request headers, or chat data.
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error('Error: ' + error.message); process.exitCode = 1; });
