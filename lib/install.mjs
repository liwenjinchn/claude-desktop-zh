import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { resourcesAt, buildPatch, discoverPatchTargets } from './patch.mjs';
import { readJSON, writeJSON, atomicWrite, sha256, inside, assertPlainDirectory, localeValue } from './common.mjs';
import { parseCatalog, bestCatalog, availableLocales } from './catalogs.mjs';

const STATE = '3p-zh-state.json';
export function detect3p(profileDirectory) {
  const directory = path.resolve(profileDirectory);
  const config = readJSON(path.join(directory, 'claude_desktop_config.json'));
  if (config.deploymentMode !== '3p') return { directory, configured3p: false, note: 'Configuration only, not proof of the running mode.' };
  const meta = readJSON(path.join(directory, 'configLibrary', '_meta.json'));
  if (typeof meta.appliedId !== 'string' || !/^[a-f0-9-]{36}$/i.test(meta.appliedId)) throw new Error('Invalid applied gateway profile ID.');
  const profilePath = inside(directory, path.join('configLibrary', meta.appliedId + '.json'));
  const profile = readJSON(profilePath);
  return { directory, configured3p: true, provider: typeof profile.inferenceProvider === 'string' ? profile.inferenceProvider : null, profilePath, note: 'Reads only deployment configuration. Does not claim to observe a live process or print credentials.' };
}
export function inspect(source) {
  const resources = resourcesAt(source), english = parseCatalog(fs.readFileSync(path.join(resources, 'ion-dist', 'i18n', 'en-US.json')));
  let patchable = false, reason;
  try { discoverPatchTargets(resources); patchable = true; } catch (error) { reason = error.message; }
  return { source: path.resolve(source), resources, platform: resources.includes(path.sep + 'Contents' + path.sep) ? 'macos' : 'windows', patchable, reason, englishKeys: Object.keys(english).length, asarSHA256: sha256(fs.readFileSync(path.join(resources, 'app.asar'))) };
}
export function plan(source, catalogDirectory, locale = 'zh-Hans') {
  localeValue(locale);
  const application = inspect(source);
  if (!application.patchable) throw new Error(application.reason);
  const english = parseCatalog(fs.readFileSync(path.join(application.resources, 'ion-dist', 'i18n', 'en-US.json')));
  const dynamicEnglish = parseCatalog(fs.readFileSync(path.join(application.resources, 'ion-dist', 'i18n', 'dynamic', 'en-US.json')));
  const catalogs = Object.create(null);
  for (const language of availableLocales(catalogDirectory)) {
    const base = bestCatalog(catalogDirectory, language, 'base', english);
    const dynamic = bestCatalog(catalogDirectory, language, 'dynamic', dynamicEnglish);
    if (!base || !dynamic || base.coverage < 0.95) continue;
    catalogs[language] = { base, dynamic };
  }
  if (!catalogs[locale]) throw new Error(`Missing compatible ${locale} base/dynamic catalogs. Import official resources first. Minimum base coverage is 95%.`);
  const patch = buildPatch(application.resources, locale, catalogs);
  const sourceHashes = Object.fromEntries([...patch.keys()].filter(relative => fs.existsSync(path.join(application.resources, relative))).map(relative => [relative, sha256(fs.readFileSync(path.join(application.resources, relative)))]));
  const coverage = Object.fromEntries(Object.entries(catalogs).map(([l, c]) => [l, { base: { matched: c.base.matched, total: c.base.total, coverage: c.base.coverage, fallback: c.base.fallback.length, placeholderMismatches: c.base.mismatches.length, sha256: c.base.sha256 }, dynamic: { matched: c.dynamic.matched, total: c.dynamic.total, sha256: c.dynamic.sha256 } }]));
  return { application, catalogs, patch, sourceHashes, report: { ...application, locale, coverage, files: [...patch.keys()], macos: application.platform === 'macos' ? 'Plan only: copying and modifying a signed bundle invalidates its signature. No automatic re-signing.' : undefined } };
}
export function assertStopped(root) {
  if (process.platform !== 'win32') throw new Error('Application writes are currently Windows-only. macOS supports inspect/plan.');
  const executable = path.resolve(root, 'app', 'claude.exe');
  // Arguments are passed directly; the path is an environment value, never shell source.
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$ErrorActionPreference="Stop"; @(Get-CimInstance Win32_Process -Filter "name = \'claude.exe\'" | Where-Object { $_.ExecutablePath -eq $env:CLAUDE_3P_ZH_EXE }).Count'], { env: { ...process.env, CLAUDE_3P_ZH_EXE: executable }, encoding: 'utf8', windowsHide: true }).trim();
  if (output !== '0') throw new Error('Close the managed Claude copy before changing its files.');
}
function stateAt(root) {
  assertPlainDirectory(root);
  const state = readJSON(path.join(root, STATE));
  if (state.schema !== 1 || state.root !== path.resolve(root)) throw new Error('Invalid managed-copy manifest.');
  for (const file of state.files) { inside(root, file.path); if (file.backup) inside(root, file.backup); }
  return state;
}
function verifyFiles(root, state) {
  for (const file of state.files) {
    const target = inside(root, file.path);
    if (!fs.existsSync(target) || sha256(fs.readFileSync(target)) !== file.after) throw new Error('Managed file changed since patch: ' + file.path + '. Restore refuses to overwrite it.');
  }
  if (sha256(fs.readFileSync(inside(root, 'app/resources/app.asar'))) !== state.asarSHA256) throw new Error('Application version changed. Prepare a new copy.');
}
function patchFiles(root, patch, locale, catalogs, oldState = null) {
  const resources = path.join(root, 'app', 'resources');
  const files = [];
  for (const [relative, bytes] of patch) {
    const targetRelative = path.join('app', 'resources', relative), target = inside(root, targetRelative);
    const previous = oldState?.files.find(f => f.path === targetRelative);
    const existed = previous ? previous.before !== null : fs.existsSync(target);
    const backupRelative = path.join('.3p-zh-backup', relative);
    if (!previous && existed) {
      const backup = inside(root, backupRelative);
      fs.mkdirSync(path.dirname(backup), { recursive: true }); fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
    }
    files.push({ path: targetRelative, backup: existed ? backupRelative : null, before: previous ? previous.before : existed ? sha256(fs.readFileSync(target)) : null, previousAfter: previous?.after ?? null, after: sha256(bytes) });
  }
  const state = { schema: 1, root: path.resolve(root), source: oldState?.source, status: 'applying', locale, createdAt: oldState?.createdAt ?? new Date().toISOString(), asarSHA256: sha256(fs.readFileSync(path.join(resources, 'app.asar'))), files, coverage: Object.fromEntries(Object.entries(catalogs).map(([l, c]) => [l, { matched: c.base.matched, total: c.base.total, fallback: c.base.fallback.length, placeholderMismatches: c.base.mismatches.length }])) };
  writeJSON(path.join(root, STATE), state);
  for (const [relative, bytes] of patch) atomicWrite(path.join(resources, relative), bytes);
  state.status = 'installed'; writeJSON(path.join(root, STATE), state);
  return state;
}
export function prepareCopy(source, destination, catalogDirectory, locale, gateway) {
  const prepared = plan(source, catalogDirectory, locale);
  if (prepared.application.platform !== 'windows' || process.platform !== 'win32') throw new Error('macOS is inspect/plan-only until signing and runtime behavior are tested. No bundle was modified.');
  const root = path.resolve(destination), original = path.resolve(source);
  assertPlainDirectory(root); assertPlainDirectory(original);
  if (/[/\\]WindowsApps(?:[/\\]|$)/i.test(root) || root === original || root.startsWith(original + path.sep) || original.startsWith(root + path.sep)) throw new Error('Destination must be a separate writable directory outside the source installation.');
  if (fs.existsSync(root)) throw new Error('Destination already exists. Use a new empty destination or switch an existing managed copy.');
  if (!fs.existsSync(path.join(original, 'claude.exe'))) throw new Error('Windows source must be the app directory containing claude.exe.');
  if (!gateway) throw new Error('Supply --gateway-profile or --gateway-url. No real application config is edited.');
  const profile = validateGateway(gateway);
  fs.mkdirSync(root, { recursive: true });
  writeJSON(path.join(root, 'prepare-journal.json'), { source: original, status: 'copying', createdAt: new Date().toISOString() });
  fs.cpSync(original, path.join(root, 'app'), { recursive: true, errorOnExist: true, force: false, dereference: false });
  const copied = resourcesAt(path.join(root, 'app'));
  if (sha256(fs.readFileSync(path.join(copied, 'app.asar'))) !== prepared.application.asarSHA256) throw new Error('Source changed during copy. The partial copy was retained; do not launch it.');
  for (const [relative, expected] of Object.entries(prepared.sourceHashes)) {
    if (sha256(fs.readFileSync(path.join(copied, relative))) !== expected) throw new Error('Source changed during copy: ' + relative);
  }
  const state = patchFiles(root, prepared.patch, locale, prepared.catalogs);
  state.source = original; state.status = 'preparing'; writeJSON(path.join(root, STATE), state);
  const data = path.join(root, 'local', 'Claude-3p'), id = '00000000-0000-4000-8000-3369707a6801';
  for (const dir of [data, path.join(root, 'bootstrap')]) writeJSON(path.join(dir, 'claude_desktop_config.json'), { deploymentMode: '3p' });
  writeJSON(path.join(data, 'config.json'), { locale });
  writeJSON(path.join(data, 'configLibrary', id + '.json'), profile);
  writeJSON(path.join(data, 'configLibrary', '_meta.json'), { appliedId: id, entries: [{ id, name: 'claude-desktop-3p-zh' }] });
  state.status = 'installed'; writeJSON(path.join(root, STATE), state);
  writeJSON(path.join(root, 'prepare-journal.json'), { source: original, status: 'complete' });
  return { root, status: state.status, locale, coverage: state.coverage, next: 'Run launch --root with this directory. Do not start app/claude.exe directly.' };
}
export function validateGateway(gateway) {
  if (gateway.inferenceProvider !== 'gateway') throw new Error('v0.1 supports inferenceProvider=gateway profiles only.');
  const url = new URL(gateway.inferenceGatewayBaseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw new Error('Invalid gateway base URL.');
  if (typeof gateway.inferenceGatewayApiKey !== 'string' || !gateway.inferenceGatewayApiKey) throw new Error('Gateway profile must include a nonempty API key. It is saved only in the local test profile.');
  return { inferenceProvider: 'gateway', inferenceGatewayBaseUrl: url.href.replace(/\/$/, ''), inferenceGatewayApiKey: gateway.inferenceGatewayApiKey, inferenceGatewayAuthScheme: gateway.inferenceGatewayAuthScheme ?? 'bearer', disableDeploymentModeChooser: true };
}
export function status(root) {
  const state = stateAt(root);
  let intact = true, error;
  try { if (state.status !== 'restored') verifyFiles(root, state); } catch (e) { intact = false; error = e.message; }
  return { root: state.root, status: state.status, locale: state.locale, coverage: state.coverage, intact, error };
}
export function switchLocale(root, catalogDirectory, locale) {
  localeValue(locale); assertStopped(root);
  const state = stateAt(root);
  if (state.status !== 'installed') throw new Error('Copy is not in installed state.');
  verifyFiles(root, state);
  const resources = resourcesAt(path.join(root, 'app'));
  if (sha256(fs.readFileSync(path.join(resources, 'app.asar'))) !== state.asarSHA256) throw new Error('Application version changed. Prepare a new copy.');
  const original = new Map(state.files.filter(f => f.backup && f.path.endsWith('.js')).map(f => [path.relative(resources, inside(root, f.path)), fs.readFileSync(inside(root, f.backup), 'utf8')]));
  // Use the saved originals for discovery and rebuild all available catalogs.
  const english = parseCatalog(fs.readFileSync(path.join(resources, 'ion-dist', 'i18n', 'en-US.json')));
  const dynamicEnglish = parseCatalog(fs.readFileSync(path.join(resources, 'ion-dist', 'i18n', 'dynamic', 'en-US.json')));
  const catalogs = Object.create(null);
  for (const language of availableLocales(catalogDirectory)) {
    const base = bestCatalog(catalogDirectory, language, 'base', english), dynamic = bestCatalog(catalogDirectory, language, 'dynamic', dynamicEnglish);
    if (base?.coverage >= 0.95 && dynamic) catalogs[language] = { base, dynamic };
  }
  if (!catalogs[locale]) throw new Error('Compatible requested catalog missing.');
  // Keep every previously installed language, so restoration retains ownership of its files.
  for (const language of Object.keys(state.coverage)) if (!catalogs[language]) throw new Error('Previously installed catalog missing: ' + language);
  return patchFiles(root, buildPatch(resources, locale, catalogs, original), locale, catalogs, state);
}
export function restore(root) {
  assertStopped(root); const state = stateAt(root);
  if (state.status === 'restored') return { status: 'restored', alreadyRestored: true };
  if (!['installed', 'applying', 'preparing'].includes(state.status)) throw new Error('Unknown transaction state.');
  const asar = inside(root, 'app/resources/app.asar');
  if (sha256(fs.readFileSync(asar)) !== state.asarSHA256) throw new Error('App version changed; refusing restoration.');
  // Preflight every file and backup before restoring any byte.
  for (const entry of state.files) {
    const file = inside(root, entry.path), current = fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null;
    if (current !== entry.after && current !== entry.before && !(state.status === 'applying' && current === entry.previousAfter)) throw new Error('File was changed outside this tool: ' + entry.path);
    if (entry.backup && sha256(fs.readFileSync(inside(root, entry.backup))) !== entry.before) throw new Error('Backup hash mismatch.');
  }
  for (const entry of state.files) {
    const file = inside(root, entry.path);
    if (entry.backup) atomicWrite(file, fs.readFileSync(inside(root, entry.backup)));
    else if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  state.status = 'restored'; writeJSON(path.join(root, STATE), state);
  return { status: 'restored', retained: 'Application copy and isolated data are kept. Original installation was never changed.' };
}
export async function launch(root) {
  const state = stateAt(root);
  if (state.status !== 'installed') throw new Error('Launch requires an installed managed copy.');
  verifyFiles(root, state);
  if (process.platform !== 'win32') throw new Error('Managed launch is Windows-only in v0.1.');
  const child = spawn(inside(root, 'app/claude.exe'), [`--user-data-dir=${path.join(path.resolve(root), 'bootstrap')}`], { cwd: inside(root, 'app'), detached: true, stdio: 'ignore', windowsHide: false, env: { ...process.env, LOCALAPPDATA: path.join(path.resolve(root), 'local') } });
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('spawn', resolve); });
  child.unref();
  return { pid: child.pid, expected3pData: path.join(path.resolve(root), 'local', 'Claude-3p'), note: 'PID is not proof of startup. Check the process data directory and visible local app:// page.' };
}
