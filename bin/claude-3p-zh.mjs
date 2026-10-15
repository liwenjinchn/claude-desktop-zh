#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { inspect, plan, prepareCopy, status, switchLocale, restore, launch, detect3p } from '../lib/install.mjs';
import { fetchCatalog, saveCatalog } from '../lib/catalogs.mjs';
import { importCache } from '../lib/cache.mjs';
import { readJSON, localeValue } from '../lib/common.mjs';

const help = `claude-desktop-3p-zh 0.1.0 (Node 22+)

inspect       --source <Claude app directory or Claude.app>
detect-3p     --profile-dir <Claude-3p directory>
plan          --source <app> [--locale zh-Hans|zh-Hant] [--catalog-dir <dir>]
catalog import --locale <locale> --kind base|dynamic --file <JSON> [--url <source>]
catalog cache  --locale <locale> --cache <Chromium Cache_Data directory>
catalog fetch  --locale <locale> [--kind base|dynamic] [--url <official URL>]
prepare-copy  --source <app> --destination <new directory> [--locale zh-Hans|zh-Hant]
              --gateway-profile <configLibrary profile JSON>
              OR --gateway-url <URL> --gateway-key-file <text file>
switch        --root <managed directory> --locale zh-Hans|zh-Hant
status        --root <managed directory>
restore       --root <managed directory>
launch        --root <managed directory>

Catalogs default to .catalogs in the current directory (not committed).
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
  const valid = new Set(['source', 'locale', 'catalog-dir', 'kind', 'file', 'url', 'cache', 'destination', 'gateway-profile', 'gateway-url', 'gateway-key-file', 'root', 'profile-dir']);
  for (const key of Object.keys(options)) if (!valid.has(key)) throw new Error('Unknown flag: --' + key);
  return { words, options };
}
function required(options, key) { if (!options[key]) throw new Error('Missing --' + key); return options[key]; }
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
  const directory = path.resolve(options['catalog-dir'] ?? '.catalogs');
  const locale = localeValue(options.locale);
  let result;
  switch (command) {
    case 'inspect': result = inspect(required(options, 'source')); break;
    case 'detect-3p': result = detect3p(required(options, 'profile-dir')); break;
    case 'plan': result = plan(required(options, 'source'), directory, locale).report; break;
    case 'catalog': {
      const kind = options.kind ?? 'base';
      if (subcommand === 'import') result = saveCatalog(directory, locale, kind, fs.readFileSync(required(options, 'file')), { source: 'user-import', ...(options.url ? { url: options.url } : {}) });
      else if (subcommand === 'cache') result = importCache(required(options, 'cache'), directory, locale);
      else if (subcommand === 'fetch') result = await fetchCatalog(directory, locale, kind, options.url ?? `https://claude.ai/i18n/${kind === 'dynamic' ? 'dynamic/' : ''}${locale}.json`);
      else throw new Error('Use catalog import, cache, or fetch.');
      break;
    }
    case 'prepare-copy': {
      let gateway;
      if (options['gateway-profile']) gateway = readJSON(options['gateway-profile']);
      else if (options['gateway-url']) gateway = { inferenceProvider: 'gateway', inferenceGatewayBaseUrl: options['gateway-url'], inferenceGatewayApiKey: fs.readFileSync(required(options, 'gateway-key-file'), 'utf8').trim() };
      result = await locked(required(options, 'destination'), () => prepareCopy(required(options, 'source'), options.destination, directory, locale, gateway));
      break;
    }
    case 'status': result = status(required(options, 'root')); break;
    case 'switch': result = await locked(required(options, 'root'), () => switchLocale(options.root, directory, locale)); break;
    case 'restore': result = await locked(required(options, 'root'), () => restore(options.root)); break;
    case 'launch': result = await locked(required(options, 'root'), () => launch(options.root)); break;
    default: throw new Error('Unknown command. Run help.');
  }
  // Never print the gateway profile, key, request headers, or chat data.
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error('Error: ' + error.message); process.exitCode = 1; });
