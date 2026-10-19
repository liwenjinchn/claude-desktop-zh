import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readJSON } from './common.mjs';

const PUBLISHER = 'pzs8sxrjxfjjc';

// An injected environment is a complete fixture: never mix it with live AppX data.
export function discoverInstall(env, store = env === undefined ? storeLocations : () => []) {
  env ??= windowsEnv();
  const found = [];
  for (const location of store()) consider(found, path.join(location, 'app'), 'msix');
  const local = env.LOCALAPPDATA;
  if (local) {
    for (const name of ['Claude', 'claude', 'AnthropicClaude']) consider(found, path.join(local, name), 'local');
    const programs = path.join(local, 'Programs');
    if (fs.existsSync(programs)) {
      for (const name of safeNames(programs)) {
        if (!/claude/i.test(name)) continue;
        consider(found, path.join(programs, name), 'user-programs');
        consider(found, path.join(programs, name, 'app'), 'user-programs');
      }
    }
  }
  found.sort((a, b) => a.source.localeCompare(b.source));
  if (!found.length) throw new Error('No readable Claude Desktop installation found. Install Claude, or pass --source.');
  if (found.length > 1) throw new Error('More than one Claude installation found. Pass --source. Candidates: ' + found.map(item => item.source).join('; '));
  return found[0];
}

export function discoverProfiles(env = windowsEnv(), explicitDirectory) {
  const profiles = [];
  for (const directory of uniquePaths(explicitDirectory ? [explicitDirectory] : profileCandidates(env))) {
    const configPath = path.join(directory, 'claude_desktop_config.json');
    if (!fs.existsSync(configPath)) continue;
    let config;
    try { config = readJSON(configPath); } catch { continue; }
    if (config.deploymentMode !== '3p') continue;
    const metaPath = path.join(directory, 'configLibrary', '_meta.json');
    if (!fs.existsSync(metaPath)) continue;
    let meta;
    try { meta = readJSON(metaPath); } catch { continue; }
    if (typeof meta.appliedId !== 'string' || !/^[a-f0-9-]{36}$/i.test(meta.appliedId)) continue;
    const profilePath = path.join(directory, 'configLibrary', meta.appliedId + '.json');
    if (!fs.existsSync(profilePath)) continue;
    let profile;
    try { profile = readJSON(profilePath); } catch { continue; }
    if (profile.inferenceProvider !== 'gateway') continue;
    profiles.push({ directory, profilePath, provider: 'gateway' });
  }
  profiles.sort((a, b) => a.directory.localeCompare(b.directory));
  if (!profiles.length) throw new Error('No 3p Gateway profile found. Configure Claude Desktop for third-party Gateway mode first.');
  if (profiles.length > 1) throw new Error('More than one 3p Gateway profile found. Pass --profile-dir. Candidates: ' + profiles.map(item => item.directory).join('; '));
  return profiles[0];
}

export function discoverCaches(env, store = env === undefined ? storeLocations : () => []) {
  env ??= windowsEnv();
  const profiles = profileCandidates(env);
  const local = env.LOCALAPPDATA;
  if (local) profiles.push(path.join(local, 'Claude'));
  for (const location of store()) {
    const match = path.basename(location).match(/^Claude_[^_]+_(?:x64|arm64|x86|neutral)__([a-z0-9]+)$/i);
    if (local && match && match[1].toLowerCase() === PUBLISHER) {
      const roaming = path.join(local, 'Packages', 'Claude_' + match[1], 'LocalCache', 'Roaming');
      profiles.push(path.join(roaming, 'Claude'), path.join(roaming, 'Claude-3p'));
    }
  }
  return uniquePaths(profiles.map(directory => path.join(directory, 'Cache', 'Cache_Data'))).filter(isDirectory);
}

export function defaultLayout(env) {
  const home = env === undefined ? os.homedir() : env.USERPROFILE || env.HOME || '.';
  env ??= windowsEnv();
  const base = path.resolve(env.LOCALAPPDATA || path.join(home, '.local'), 'claude-desktop-3p-zh');
  return { managedRoot: path.join(base, 'copy'), catalogDirectory: path.join(base, 'catalogs'), originalStateDirectory: path.join(base, 'original') };
}

// Discovery is a read-only report. Missing installations or profiles must not
// prevent a controller from recovering an existing managed copy.
export function discover(options = {}, env, store) {
  const result = {
    source: options.source ? path.resolve(options.source) : null,
    profileDirectory: options.profileDirectory ? path.resolve(options.profileDirectory) : null,
    gatewayProfile: options.gatewayProfile ? path.resolve(options.gatewayProfile) : null,
    managedRoot: path.resolve(options.managedRoot ?? defaultLayout(env).managedRoot),
    catalogDirectory: path.resolve(options.catalogDirectory ?? '.catalogs'),
    caches: [],
    issues: []
  };
  function attempt(field, callback) {
    try { callback(); } catch (error) { result.issues.push({ field, message: error.message }); }
  }
  if (!result.source) attempt('source', () => { result.source = discoverInstall(env, store).source; });
  if (!result.gatewayProfile) attempt('profileDirectory', () => {
    const profile = discoverProfiles(env, result.profileDirectory);
    result.profileDirectory = profile.directory;
    result.gatewayProfile = profile.profilePath;
  });
  attempt('caches', () => { result.caches = options.cache ? [path.resolve(options.cache)] : discoverCaches(env, store); });
  return result;
}

function profileCandidates(env) {
  const values = [];
  const local = env.LOCALAPPDATA, roaming = env.APPDATA;
  if (local) {
    values.push(path.join(local, 'Claude-3p'));
    const packages = path.join(local, 'Packages');
    if (fs.existsSync(packages)) {
      for (const name of safeNames(packages)) {
        if (name.toLowerCase() !== 'claude_' + PUBLISHER) continue;
        values.push(path.join(packages, name, 'LocalCache', 'Roaming', 'Claude-3p'));
        values.push(path.join(packages, name, 'LocalCache', 'Roaming', 'Claude'));
      }
    }
  }
  if (roaming) values.push(path.join(roaming, 'Claude-3p'), path.join(roaming, 'Claude'));
  return values;
}
function pathKey(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
function uniquePaths(values) {
  const seen = new Set();
  return values.map(value => path.resolve(value)).filter(value => {
    const key = pathKey(value);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function isDirectory(directory) {
  try { return fs.statSync(directory).isDirectory(); } catch { return false; }
}
function consider(found, source, kind) {
  if (found.some(item => pathKey(item.source) === pathKey(source))) return;
  if (fs.existsSync(path.join(source, 'claude.exe')) && isDirectory(path.join(source, 'resources', 'ion-dist'))) found.push({ source: path.resolve(source), kind });
}
function windowsEnv(env = process.env) {
  if (process.platform !== 'win32') return env;
  const home = env.USERPROFILE || os.homedir();
  return { ...env, LOCALAPPDATA: env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), APPDATA: env.APPDATA || path.join(home, 'AppData', 'Roaming') };
}
function storeLocations() {
  if (process.platform !== 'win32') return [];
  try {
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-AppxPackage -Name Claude | ForEach-Object { $_.InstallLocation }'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    return output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  } catch { return []; }
}
function safeNames(directory) {
  try { return fs.readdirSync(directory); } catch { return []; }
}
