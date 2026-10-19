import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { discover, discoverInstall, discoverProfiles, discoverCaches, defaultLayout } from '../lib/discover.mjs';

function home(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '3p-zh-discover-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { LOCALAPPDATA: path.join(root, 'Local'), APPDATA: path.join(root, 'Roaming'), ProgramFiles: path.join(root, 'Program Files'), USERPROFILE: root };
  return { root, env };
}
function app(directory) {
  fs.mkdirSync(path.join(directory, 'resources', 'ion-dist'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'claude.exe'), '');
}
function gateway(directory) {
  fs.mkdirSync(path.join(directory, 'configLibrary'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'claude_desktop_config.json'), JSON.stringify({ deploymentMode: '3p', secret: 'not-returned' }));
  fs.writeFileSync(path.join(directory, 'configLibrary', '_meta.json'), JSON.stringify({ appliedId: '00000000-0000-4000-8000-3369707a6801' }));
  fs.writeFileSync(path.join(directory, 'configLibrary', '00000000-0000-4000-8000-3369707a6801.json'), JSON.stringify({ inferenceProvider: 'gateway', inferenceGatewayApiKey: 'secret' }));
}

test('discovers one store install and its gateway without exposing the key', t => {
  const { env } = home(t);
  const source = path.join(env.ProgramFiles, 'WindowsApps', 'Claude_1.0.0.0_x64__pzs8sxrjxfjjc', 'app');
  app(source);
  const store = () => [path.dirname(source)];
  const profile = path.join(env.LOCALAPPDATA, 'Claude-3p');
  gateway(profile);
  fs.mkdirSync(path.join(env.LOCALAPPDATA, 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude', 'Cache', 'Cache_Data'), { recursive: true });
  assert.equal(discoverInstall(env, store).source, path.resolve(source));
  const found = discoverProfiles(env);
  assert.equal(found.directory, path.resolve(profile));
  assert.equal(found.provider, 'gateway');
  assert.equal(JSON.stringify(found).includes('secret'), false);
  assert.equal(discoverCaches(env, store).length, 1);
  assert.match(defaultLayout(env).managedRoot, /claude-desktop-3p-zh[\\/]copy$/);
});

test('ambiguous or missing installations stay unresolved', t => {
  const { env } = home(t);
  assert.throws(() => discoverInstall(env, () => []), /No readable Claude/);
  app(path.join(env.LOCALAPPDATA, 'Claude'));
  app(path.join(env.LOCALAPPDATA, 'Programs', 'Claude'));
  assert.throws(() => discoverInstall(env), /More than one/);
  assert.throws(() => discoverProfiles(env), /No 3p Gateway/);
});

test('finds package-family profiles, ignores package-full-name and unrelated publisher folders', t => {
  const { env } = home(t);
  const packages = path.join(env.LOCALAPPDATA, 'Packages');
  gateway(path.join(packages, 'Claude_1.0_arm64__pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude-3p'));
  gateway(path.join(packages, 'Claude_someoneelse', 'LocalCache', 'Roaming', 'Claude-3p'));
  const profile = path.join(packages, 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude-3p');
  gateway(profile);
  assert.equal(discoverProfiles(env).directory, profile);
});

test('deduplicates local install aliases and repeated store candidates', t => {
  const { root, env } = home(t);
  const local = path.join(env.LOCALAPPDATA, 'Claude');
  app(local);
  assert.equal(discoverInstall(env).source, local);
  const store = path.join(root, 'Claude_1.0_arm64__pzs8sxrjxfjjc');
  app(path.join(store, 'app'));
  const candidates = process.platform === 'win32' ? [store, store.toUpperCase(), store] : [store, store];
  assert.equal(discoverInstall({}, () => candidates).source, path.join(store, 'app'));
});

test('deduplicates overlapping profile and cache paths on Windows', { skip: process.platform !== 'win32' }, t => {
  const { env } = home(t);
  env.APPDATA = env.LOCALAPPDATA.toUpperCase();
  const profile = path.join(env.LOCALAPPDATA, 'Claude-3p');
  gateway(profile);
  fs.mkdirSync(path.join(profile, 'Cache', 'Cache_Data'), { recursive: true });
  assert.equal(discoverProfiles(env).directory, profile);
  assert.equal(discoverCaches(env).length, 1);
});

test('finds ARM64 family caches, scans both modes, and excludes regular files', t => {
  const { root, env } = home(t);
  const base = path.join(env.LOCALAPPDATA, 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming');
  const caches = ['Claude', 'Claude-3p'].map(name => path.join(base, name, 'Cache', 'Cache_Data'));
  for (const cache of caches) fs.mkdirSync(cache, { recursive: true });
  const invalid = path.join(env.LOCALAPPDATA, 'Claude', 'Cache', 'Cache_Data');
  fs.mkdirSync(path.dirname(invalid), { recursive: true }); fs.writeFileSync(invalid, 'not a directory');
  const store = () => [path.join(root, 'Claude_2.0.0.0_arm64__pzs8sxrjxfjjc')];
  assert.deepEqual(discoverCaches(env, store).sort(), caches.sort());
  // Family caches remain discoverable after an installation disappears.
  assert.deepEqual(discoverCaches(env).sort(), caches.sort());
});

test('injected environments never query the host AppX installation or use its home', t => {
  const { env } = home(t);
  let calls = 0;
  const original = childProcess.execFileSync;
  childProcess.execFileSync = () => { calls++; throw new Error('Host access forbidden'); };
  syncBuiltinESMExports();
  try {
    assert.throws(() => discoverInstall(env), /No readable/);
    assert.deepEqual(discoverCaches(env), []);
    const report = discover({}, env);
    assert.equal(report.source, null);
    assert.equal(report.profileDirectory, null);
    assert.deepEqual(report.issues.map(issue => issue.field), ['source', 'profileDirectory']);
    assert.equal(calls, 0);
    assert.equal(defaultLayout({ USERPROFILE: env.USERPROFILE }).managedRoot, path.join(env.USERPROFILE, '.local', 'claude-desktop-3p-zh', 'copy'));
  } finally { childProcess.execFileSync = original; syncBuiltinESMExports(); }
});

test('partial reports resolve source and profile independently and preserve recovery paths', t => {
  const { root, env } = home(t);
  const profile = path.join(env.LOCALAPPDATA, 'Claude-3p');
  gateway(profile);
  let result = discover({}, env);
  assert.equal(result.source, null);
  assert.equal(result.profileDirectory, profile);
  assert.deepEqual(result.issues.map(issue => issue.field), ['source']);
  fs.rmSync(profile, { recursive: true });
  const source = path.join(env.LOCALAPPDATA, 'Claude'); app(source);
  result = discover({}, env);
  assert.equal(result.source, source);
  assert.equal(result.gatewayProfile, null);
  assert.deepEqual(result.issues.map(issue => issue.field), ['profileDirectory']);
  assert.equal(result.managedRoot, defaultLayout(env).managedRoot);
  assert.equal(result.catalogDirectory, path.resolve('.catalogs'));
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert(!fs.existsSync(path.join(root, 'Local', 'claude-desktop-3p-zh')));
});

test('explicit discovery paths override ambiguous globals and resolve matching gateway files', t => {
  const { root, env } = home(t);
  for (const directory of [path.join(env.LOCALAPPDATA, 'Claude-3p'), path.join(env.APPDATA, 'Claude')]) gateway(directory);
  app(path.join(env.LOCALAPPDATA, 'Claude'));
  app(path.join(env.LOCALAPPDATA, 'Programs', 'Claude'));
  const profile = path.join(root, 'selected-profile'); gateway(profile);
  const options = { source: path.join(root, 'selected-app'), profileDirectory: profile, managedRoot: path.join(root, 'copy'), catalogDirectory: path.join(root, 'catalogs'), cache: path.join(root, 'cache') };
  const result = discover(options, env);
  assert.equal(result.source, options.source);
  assert.equal(result.profileDirectory, profile);
  assert.equal(result.gatewayProfile, path.join(profile, 'configLibrary', '00000000-0000-4000-8000-3369707a6801.json'));
  assert.equal(result.managedRoot, options.managedRoot);
  assert.equal(result.catalogDirectory, options.catalogDirectory);
  assert.deepEqual(result.caches, [options.cache]);
  assert.deepEqual(result.issues, []);
  fs.rmSync(profile, { recursive: true });
  const missing = discover(options, env);
  assert.equal(missing.profileDirectory, profile);
  assert.equal(missing.gatewayProfile, null);
  assert.equal(missing.issues[0].field, 'profileDirectory');
  const override = discover({ ...options, gatewayProfile: path.join(root, 'explicit.json') }, env);
  assert.equal(override.gatewayProfile, path.join(root, 'explicit.json'));
  assert.deepEqual(override.issues, []);
});
