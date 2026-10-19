import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { assertPlainDirectory, inside, readJSON, sha256, writeJSON } from './common.mjs';
import { detect3p } from './install.mjs';

function snapshot(profileDirectory) {
  const target = inside(profileDirectory, 'developer_settings.json');
  const bytes = fs.existsSync(target) ? fs.readFileSync(target) : null;
  const config = bytes === null ? {} : JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  if (!config || Array.isArray(config) || typeof config !== 'object' ||
      ('allowDevTools' in config && typeof config.allowDevTools !== 'boolean')) throw new Error('Unsupported developer settings.');
  return { target, bytes, config, hash: bytes === null ? null : sha256(bytes) };
}

// One process query checks every Claude instance, including helpers. A running
// app is never closed here, and an unreadable process query cannot permit writes.
export function windowsSetupGuard(ownerFile) {
  if (process.platform !== 'win32') throw new Error('Runtime setup is Windows-only.');
  const owner = ownerFile ? readJSON(ownerFile) : null;
  const checkOwner = () => {
    if (!owner) return;
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || !/^\d+$/.test(owner.startedTicks) ||
        !path.isAbsolute(owner.executable) || !/^[a-f0-9]{64}$/.test(owner.registrySha256) ||
        !path.isAbsolute(owner.registryFile) || !path.isAbsolute(owner.stopFile)) throw new Error('Invalid runtime setup owner.');
    if (fs.existsSync(owner.stopFile) || sha256(fs.readFileSync(owner.registryFile)) !== owner.registrySha256) throw new Error('Runtime setup owner changed.');
  };
  return () => {
    checkOwner();
    const script = '$ErrorActionPreference="Stop"; $o=$env:CLAUDE_ZH_SETUP_OWNER | ConvertFrom-Json; if ($o) { $p=Get-Process -Id $o.pid -ErrorAction Stop; if ($p.Path -ine $o.executable -or $p.StartTime.ToUniversalTime().Ticks.ToString() -ne $o.startedTicks) { throw "Owner changed" } }; @(Get-Process -Name Claude -ErrorAction SilentlyContinue).Count';
    const count = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...process.env, CLAUDE_ZH_SETUP_OWNER: JSON.stringify(owner) }, encoding: 'utf8', windowsHide: true
    }).trim();
    checkOwner();
    if (!/^\d+$/.test(count)) throw new Error('Cannot verify Claude process state.');
    return count === '0';
  };
}

export function runtimeSetupStatus(profileDirectory) {
  const profile = detect3p(profileDirectory);
  if (!profile.configured3p || profile.provider !== 'gateway') throw new Error('Original Claude is not configured for 3p Gateway.');
  const s = snapshot(profile.directory);
  return { state: s.config.allowDevTools === true ? 'RuntimeSetupReady' : 'RuntimeSetupRequired', profileDirectory: profile.directory };
}

function externalState(profile, stateDirectory) {
  const state = path.resolve(stateDirectory), root = path.resolve(profile);
  const a = state.toLowerCase(), b = root.toLowerCase();
  if (a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep)) throw new Error('Runtime setup backups must be outside the profile.');
  assertPlainDirectory(state);
  return state;
}

export function setupRuntime(profileDirectory, stateDirectory, guard = windowsSetupGuard()) {
  const status = runtimeSetupStatus(profileDirectory);
  if (status.state === 'RuntimeSetupReady') return { ...status, changed: false };
  const before = snapshot(status.profileDirectory);
  if (!guard()) return { ...status, state: 'WaitingForNormalExit', changed: false };
  const state = externalState(status.profileDirectory, stateDirectory);
  fs.mkdirSync(state, { recursive: true });
  const run = fs.mkdtempSync(path.join(state, 'setup-'));
  const journal = path.join(run, 'journal.json');
  const after = Buffer.from(JSON.stringify({ ...before.config, allowDevTools: true }, null, 2) + '\n');
  const record = { schema: 1, profileDirectory: status.profileDirectory, target: before.target,
    beforeSha256: before.hash, afterSha256: sha256(after), applied: false, createdAt: new Date().toISOString() };
  if (before.bytes !== null) fs.writeFileSync(path.join(run, 'before.json'), before.bytes, { flag: 'wx', mode: 0o600 });
  writeJSON(journal, record);
  const temporary = path.join(run, 'after-' + crypto.randomUUID() + '.pending');
  try {
    fs.writeFileSync(temporary, after, { flag: 'wx', mode: 0o600 });
    if (!guard()) return { ...status, state: 'WaitingForNormalExit', changed: false, journal };
    if (snapshot(status.profileDirectory).hash !== before.hash) throw new Error('Developer settings changed during setup.');
    // No app writes occur before the final stopped/owner check and hash compare.
    fs.renameSync(temporary, before.target);
    record.applied = true;
    writeJSON(journal, record);
    return { ...status, state: 'RuntimeSetupReady', changed: true, journal };
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

export function restoreRuntimeSetup(profileDirectory, journal, guard = windowsSetupGuard()) {
  const profile = path.resolve(profileDirectory), record = readJSON(journal);
  const current = snapshot(profile);
  if (record.schema !== 1 || record.profileDirectory !== profile || record.target !== current.target ||
      !/^[a-f0-9]{64}$/.test(record.afterSha256) ||
      (record.beforeSha256 !== null && !/^[a-f0-9]{64}$/.test(record.beforeSha256))) throw new Error('Invalid runtime setup journal.');
  if (current.hash !== record.afterSha256) throw new Error('Developer settings changed; restore refused.');
  const backup = record.beforeSha256 === null ? null : fs.readFileSync(inside(path.dirname(journal), 'before.json'));
  if (backup && sha256(backup) !== record.beforeSha256) throw new Error('Runtime setup backup changed.');
  if (!guard()) throw new Error('Normal Claude exit is required before restoring setup.');
  if (snapshot(profile).hash !== current.hash) throw new Error('Developer settings changed during restore.');
  if (backup === null) fs.unlinkSync(current.target);
  else {
    assertPlainDirectory(path.dirname(journal));
    const temporary = inside(path.dirname(journal), 'restore-' + crypto.randomUUID() + '.pending');
    try {
      fs.writeFileSync(temporary, backup, { flag: 'wx', mode: 0o600 });
      if (!guard() || snapshot(profile).hash !== current.hash) throw new Error('Claude restarted or settings changed during restore.');
      fs.renameSync(temporary, current.target);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  writeJSON(journal, { ...record, restoredAt: new Date().toISOString() });
  return { state: 'RuntimeSetupRestored', profileDirectory: profile };
}
