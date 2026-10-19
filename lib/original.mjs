import fs from 'node:fs';
import path from 'node:path';
import { plan, inspect, assertExecutableStopped } from './install.mjs';
import { resourcesAt } from './patch.mjs';
import { inside, assertPlainDirectory, readJSON, writeJSON, atomicWrite, sha256, localeValue } from './common.mjs';

const MANIFEST = 'original-state.json';
const PROTECTED = 'This is a protected MSIX installation. Original-mode localization is unavailable; no permissions or user settings were changed.';
const samePath = (a, b) => process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);

function protectedPackage(source) {
  if (/(?:^|[/\\])WindowsApps(?:[/\\]|$)/i.test(source)) return true;
  let directory = path.resolve(source);
  for (let i = 0; i < 3; i++, directory = path.dirname(directory)) {
    if (fs.existsSync(path.join(directory, 'AppxManifest.xml'))) return true;
  }
  return false;
}
function assertTarget(source) {
  assertPlainDirectory(source);
  if (protectedPackage(source)) throw new Error(PROTECTED);
  if (process.platform !== 'win32') throw new Error('Original-mode writes are Windows-only; macOS signatures are not modified.');
  if (!fs.existsSync(path.join(source, 'claude.exe'))) throw new Error('Source must contain claude.exe.');
  return resourcesAt(source);
}
function originalOverrides(source, directory) {
  const overrides = new Map();
  if (directory && fs.existsSync(path.join(directory, MANIFEST))) {
    const state = loadState(directory);
    if (!samePath(state.source, source)) throw new Error('State belongs to another installation. Restore it before selecting a different source.');
    verify(state);
    if (state.status === 'installed') for (const file of state.files) {
      if (file.path.endsWith('.js') && file.backup) overrides.set(file.path, fs.readFileSync(inside(directory, file.backup), 'utf8'));
    }
  }
  return overrides;
}
export function planOriginal(source, directory, catalogs, locale) {
  if (!source) source = loadState(directory).source;
  return plan(source, catalogs, locale, originalOverrides(source, directory)).report;
}
export function checkOriginal(source, directory) {
  const application = inspect(source, originalOverrides(source, directory));
  if (application.patchable && !fs.existsSync(path.join(source, 'claude.exe'))) {
    application.patchable = false; application.reason = 'Source must contain claude.exe.';
  }
  const protectedInstall = protectedPackage(source);
  return { ...application, mode: 'original', eligible: application.patchable && !protectedInstall && process.platform === 'win32',
    protectedInstall, reason: protectedInstall ? PROTECTED : application.reason,
    note: 'Read-only compatibility check. Write access and stopped processes are checked again when applying. Existing user data is never copied or rewritten.' };
}
function targetFile(resources, relative) {
  const normalized = relative.replaceAll('\\', '/');
  if (!/^ion-dist\/(?:assets\/.+\.js|i18n\/(?:dynamic\/)?zh-Han[st]\.json)$/.test(normalized)) throw new Error('Manifest contains a non-language file.');
  return inside(resources, relative);
}
function loadState(directory) {
  assertPlainDirectory(directory);
  return validateState(readJSON(path.join(directory, MANIFEST)), directory);
}
function validateState(state, directory) {
  if (state.schema !== 1 || state.mode !== 'original' || state.stateDirectory !== path.resolve(directory) || !['preparing', 'applying', 'installed', 'restored'].includes(state.status)) throw new Error('Invalid original-mode manifest.');
  const resources = assertTarget(state.source);
  if (!samePath(resources, state.resources) || !Array.isArray(state.files) || new Set(state.files.map(f => f.path)).size !== state.files.length) throw new Error('Invalid original-mode resources or file list.');
  for (const file of state.files) {
    targetFile(resources, file.path);
    if (file.backup !== null && file.backup !== path.join('backups', file.path)) throw new Error('Invalid backup path.');
    if ((file.before === null) !== (file.backup === null)) throw new Error('Invalid backup record.');
  }
  if (state.status === 'preparing' && state.previousState) {
    if (!['installed', 'restored'].includes(state.previousState.status)) throw new Error('Invalid previous transaction state.');
    validateState(state.previousState, directory);
    if (state.previousState.source !== state.source) throw new Error('Invalid previous installation.');
  }
  return state;
}
function verifyPreparation(state) {
  if (sha256(fs.readFileSync(inside(state.resources, 'app.asar'))) !== state.asarSHA256) throw new Error('Application version changed during backup preparation.');
  if (state.previousState) verify(state.previousState);
  for (const entry of state.files) {
    const file = targetFile(state.resources, entry.path);
    const current = fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null;
    if (current !== entry.preparedBefore) throw new Error('Managed file changed during backup preparation: ' + entry.path);
  }
}
function cancelPreparation(state) {
  // No application resource has been written in this phase. Discard only new
  // staging backups; a failed copy may have left a partial file here.
  for (const entry of state.files) if (entry.backup && !state.previousState?.files.some(file => file.path === entry.path)) {
    const backup = inside(state.stateDirectory, entry.backup);
    if (fs.existsSync(backup)) fs.unlinkSync(backup);
    let parent = path.dirname(backup);
    while (parent !== state.stateDirectory && fs.existsSync(parent) && fs.readdirSync(parent).length === 0) {
      fs.rmdirSync(parent); parent = path.dirname(parent);
    }
  }
  const manifest = path.join(state.stateDirectory, MANIFEST);
  if (state.previousState) writeJSON(manifest, state.previousState);
  else fs.unlinkSync(manifest);
}
function verify(state, recovering = false) {
  if (state.status === 'preparing') { verifyPreparation(state); return; }
  if (sha256(fs.readFileSync(inside(state.resources, 'app.asar'))) !== state.asarSHA256) throw new Error('Application version changed; do not restore old backups onto the new version.');
  for (const entry of state.files) {
    const target = targetFile(state.resources, entry.path);
    const hash = fs.existsSync(target) ? sha256(fs.readFileSync(target)) : null;
    const expected = state.status === 'restored' ? entry.before : entry.after;
    if (hash !== expected && !(recovering && (hash === entry.before || (state.status === 'applying' && hash === entry.previousAfter)))) throw new Error('Managed file changed outside this tool: ' + entry.path);
    if (entry.backup && sha256(fs.readFileSync(inside(state.stateDirectory, entry.backup))) !== entry.before) throw new Error('Backup hash mismatch: ' + entry.path);
  }
}
function withTargetLock(source, callback) {
  const resources = assertTarget(source);
  const lock = inside(resources, '.3p-zh-original-lock');
  let fd;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch (error) { throw new Error('Cannot lock the application: another operation is running or the installation is not writable. ' + error.code); }
  try {
    fs.writeFileSync(fd, String(process.pid));
    assertExecutableStopped(path.join(source, 'claude.exe'));
    return callback(resources);
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
export function statusOriginal(directory) {
  if (!fs.existsSync(path.join(directory, MANIFEST))) return { mode: 'original', status: 'not-installed', stateDirectory: path.resolve(directory) };
  const state = loadState(directory);
  let intact = true, error;
  try { verify(state); } catch (e) { intact = false; error = e.message; }
  return { mode: 'original', source: state.source, status: state.status, locale: state.locale, intact, error, stateDirectory: state.stateDirectory };
}
export function applyOriginal(source, directory, catalogs, locale) {
  localeValue(locale);
  source = path.resolve(source); directory = path.resolve(directory);
  assertTarget(source); assertPlainDirectory(directory);
  const a = source.toLowerCase(), b = directory.toLowerCase();
  if (a === b || b.startsWith(a + path.sep) || a.startsWith(b + path.sep)) throw new Error('Backups must be outside the application directory.');
  return withTargetLock(source, resources => {
    const manifest = path.join(directory, MANIFEST);
    let previous = fs.existsSync(manifest) ? loadState(directory) : null;
    if (previous && !samePath(previous.source, source)) throw new Error('State belongs to another installation. Use its original source or a separate state directory.');
    if (previous?.status === 'preparing') {
      verifyPreparation(previous);
      cancelPreparation(previous);
      previous = previous.previousState ?? null;
    }
    if (previous?.status === 'applying') throw new Error('An interrupted apply must be restored before retrying.');
    if (previous) verify(previous);
    const overrides = new Map();
    if (previous?.status === 'installed') {
      for (const file of previous.files) if (file.path.endsWith('.js') && file.backup) overrides.set(file.path, fs.readFileSync(inside(directory, file.backup), 'utf8'));
    }
    const prepared = plan(source, catalogs, locale, overrides);
    const verifySource = () => {
      if (sha256(fs.readFileSync(inside(resources, 'app.asar'))) !== prepared.application.asarSHA256) throw new Error('Application version changed during preparation.');
      for (const [relative, expected] of Object.entries(prepared.sourceHashes)) {
        const file = targetFile(resources, relative);
        const actual = fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null;
        if (actual !== expected) throw new Error('Source changed during preparation: ' + relative);
      }
    };
    verifySource();
    for (const file of previous?.files || []) if (!prepared.patch.has(file.path)) throw new Error('Previously managed language resource missing; retain its catalogs before switching.');
    const files = [];
    for (const [relative, bytes] of prepared.patch) {
      const target = targetFile(resources, relative), old = previous?.files.find(f => f.path === relative);
      const before = old ? old.before : fs.existsSync(target) ? sha256(fs.readFileSync(target)) : null;
      const backup = before === null ? null : path.join('backups', relative);
      // Check all write locations before writing any application resource.
      let parent = path.dirname(target);
      while (!fs.existsSync(parent)) parent = path.dirname(parent);
      fs.accessSync(parent, fs.constants.W_OK);
      if (fs.existsSync(target)) fs.accessSync(target, fs.constants.W_OK);
      files.push({ path: relative, before, backup, preparedBefore: prepared.sourceHashes[relative] ?? null, previousAfter: old?.after ?? null, after: sha256(bytes) });
    }
    if (!previous && fs.existsSync(directory) && fs.readdirSync(directory).length) throw new Error('State directory is not empty; use a fresh directory.');
    const state = { schema: 1, mode: 'original', stateDirectory: directory, source, resources, status: 'preparing', locale,
      asarSHA256: prepared.application.asarSHA256, files, previousState: previous };
    writeJSON(manifest, state);
    for (const file of files) if (file.backup) {
      const backup = inside(directory, file.backup);
      if (!previous?.files.some(f => f.path === file.path)) {
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.copyFileSync(targetFile(resources, file.path), backup, fs.constants.COPYFILE_EXCL);
      }
      if (sha256(fs.readFileSync(backup)) !== file.before) throw new Error('Backup hash mismatch: ' + file.path);
    }
    verifySource();
    state.status = 'applying'; delete state.previousState;
    writeJSON(manifest, state);
    verifySource();
    for (const [relative, bytes] of prepared.patch) atomicWrite(targetFile(resources, relative), bytes);
    state.status = 'installed'; writeJSON(manifest, state);
    return { mode: 'original', status: 'installed', locale, source, stateDirectory: directory, retained: 'Existing configuration, accounts and sessions were not rewritten. Reopen Claude using its existing shortcut.' };
  });
}
export function switchOriginal(directory, catalogs, locale) {
  const state = loadState(directory);
  return applyOriginal(state.source, directory, catalogs, locale);
}
export function restoreOriginal(directory) {
  const state = loadState(directory);
  return withTargetLock(state.source, () => {
    if (state.status === 'preparing') {
      cancelPreparation(state);
      return { mode: 'original', status: state.previousState?.status ?? 'not-installed', cancelledPreparation: true, retained: 'Backup preparation cancelled; no application resources were written.' };
    }
    verify(state, true);
    if (state.status === 'restored') return { mode: 'original', status: 'restored', alreadyRestored: true };
    for (const entry of state.files) {
      const file = targetFile(state.resources, entry.path);
      if (entry.backup) atomicWrite(file, fs.readFileSync(inside(directory, entry.backup)));
      else if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    state.status = 'restored'; writeJSON(path.join(directory, MANIFEST), state);
    return { mode: 'original', status: 'restored', retained: 'User configuration, login data and sessions were not modified.' };
  });
}
