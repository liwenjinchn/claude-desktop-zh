import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256 } from '../lib/common.mjs';

const cli = fileURLToPath(new URL('../bin/claude-3p-zh.mjs', import.meta.url));
const profileId = '00000000-0000-4000-8000-3369707a6801';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), '3p-zh-cli-discovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const log = path.join(root, 'process-calls.jsonl');
  const preload = path.join(root, 'isolate-host.mjs');
  fs.writeFileSync(preload, `import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
childProcess.execFileSync = (command, args) => {
  fs.appendFileSync(process.env.DISCOVERY_TEST_LOG, JSON.stringify({ command, args }) + '\\n');
  if (args.some(arg => arg.includes('Get-AppxPackage'))) return '';
  if (args.some(arg => arg.includes('Get-CimInstance'))) return '0';
  throw new Error('Unexpected host process');
};
syncBuiltinESMExports();
globalThis.fetch = async () => new Response('{"hello":"fixture translation"}', { status: 200 });
`);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !['localappdata', 'appdata', 'userprofile', 'home', 'node_options'].includes(key.toLowerCase())));
  Object.assign(env, { LOCALAPPDATA: path.join(root, 'Local'), APPDATA: path.join(root, 'Roaming'), USERPROFILE: root, HOME: root, DISCOVERY_TEST_LOG: log });
  function run(...args) {
    return spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, cli, ...args], { cwd: root, env, encoding: 'utf8', timeout: 20000 });
  }
  function json(...args) {
    const result = run(...args);
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return JSON.parse(result.stdout);
  }
  function calls() { return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []; }
  function invalidEnvironment() {
    fs.writeFileSync(path.join(root, 'not-a-directory'), 'fixture');
    env.LOCALAPPDATA = env.APPDATA = path.join(root, 'not-a-directory', 'missing');
  }
  return { root, env, run, json, calls, invalidEnvironment };
}
function gateway(directory, configured = true) {
  fs.mkdirSync(path.join(directory, 'configLibrary'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'claude_desktop_config.json'), JSON.stringify({ deploymentMode: configured ? '3p' : 'normal' }));
  fs.writeFileSync(path.join(directory, 'configLibrary', '_meta.json'), JSON.stringify({ appliedId: profileId }));
  fs.writeFileSync(path.join(directory, 'configLibrary', profileId + '.json'), JSON.stringify({ inferenceProvider: 'gateway', inferenceGatewayApiKey: 'never-print-this-key' }));
}
function managed(root) {
  fs.mkdirSync(path.join(root, 'app', 'resources'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app', 'resources', 'app.asar'), 'fixture archive');
  fs.writeFileSync(path.join(root, '3p-zh-state.json'), JSON.stringify({ schema: 1, root, status: 'installed', locale: 'zh-Hans', asarSHA256: sha256('fixture archive'), files: [] }));
}
function cache(directory, records) {
  fs.mkdirSync(directory, { recursive: true });
  const index = Buffer.alloc(8192 + 256 * records.length);
  records.forEach(({ url, body }, i) => {
    const offset = 8192 + i * 256;
    const headers = Buffer.from('HTTP/1.1 200 OK\0content-type: application/json\0');
    const data = Buffer.from(JSON.stringify(body));
    index.writeUInt32LE(Buffer.byteLength(url), offset + 32);
    index.writeUInt32LE(headers.length, offset + 40);
    index.writeUInt32LE(data.length, offset + 44);
    index.writeUInt32LE(0x80000000 + 2 * i + 1, offset + 56);
    index.writeUInt32LE(0x80000000 + 2 * i + 2, offset + 60);
    index.write(url, offset + 100);
    fs.writeFileSync(path.join(directory, 'f_' + (2 * i + 1).toString(16).padStart(6, '0')), headers);
    fs.writeFileSync(path.join(directory, 'f_' + (2 * i + 2).toString(16).padStart(6, '0')), data);
  });
  fs.writeFileSync(path.join(directory, 'data_1'), index);
}

test('explicit detect ignores missing or ambiguous global profiles and reports the selected mode', t => {
  const f = fixture(t), selected = path.join(f.root, 'selected');
  gateway(selected);
  f.invalidEnvironment();
  let result = f.json('detect-3p', '--profile-dir', selected);
  assert.equal(result.directory, selected);
  assert.equal(result.provider, 'gateway');
  assert(!JSON.stringify(result).includes('never-print-this-key'));
  f.env.LOCALAPPDATA = path.join(f.root, 'Local'); f.env.APPDATA = path.join(f.root, 'Roaming');
  gateway(path.join(f.env.LOCALAPPDATA, 'Claude-3p')); gateway(path.join(f.env.APPDATA, 'Claude'));
  gateway(selected, false);
  result = f.json('detect-3p', '--profile-dir', selected);
  assert.equal(result.configured3p, false);
  assert.deepEqual(f.calls(), []);
});

test('status needs only an explicit managed root despite invalid unrelated environment and flags', t => {
  const f = fixture(t), root = path.join(f.root, 'managed'); managed(root); f.invalidEnvironment();
  const result = f.json('status', '--root', root, '--source', 'missing-app', '--profile-dir', 'missing-profile', '--locale', 'irrelevant');
  assert.equal(result.status, 'installed'); assert.equal(result.intact, true);
  assert.deepEqual(f.calls(), []);
});

test('restore works with a missing source/profile and touches only fixture state', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t), root = path.join(f.root, 'managed'); managed(root); f.invalidEnvironment();
  assert.equal(f.json('restore', '--root', root).status, 'restored');
  assert.equal(f.json('restore', '--root', root).alreadyRestored, true);
  assert(f.calls().every(call => call.args.some(arg => arg.includes('Get-CimInstance'))));
  assert.equal(fs.existsSync(root + '.3p-zh-lock'), false);
});

test('discover returns partial JSON with recovery paths when installation and profile are missing', t => {
  const f = fixture(t);
  const result = f.json('discover');
  assert.deepEqual(Object.keys(result).sort(), ['source', 'profileDirectory', 'gatewayProfile', 'managedRoot', 'catalogDirectory', 'caches', 'issues'].sort());
  assert.equal(result.source, null); assert.equal(result.profileDirectory, null); assert.equal(result.gatewayProfile, null);
  assert.deepEqual(result.issues.map(issue => issue.field), ['source', 'profileDirectory']);
  assert.equal(result.managedRoot, path.join(f.env.LOCALAPPDATA, 'claude-desktop-3p-zh', 'copy'));
  assert.equal(result.catalogDirectory, path.join(f.root, '.catalogs'));
  assert.deepEqual(result.caches, []);
  assert.equal(fs.existsSync(f.env.LOCALAPPDATA), false);
});

test('discover honors every explicit path without discovering or reading unrelated globals', t => {
  const f = fixture(t); f.invalidEnvironment();
  const source = path.join(f.root, 'app'), profile = path.join(f.root, 'profile'), gatewayFile = path.join(f.root, 'gateway.json');
  const root = path.join(f.root, 'managed'), catalogs = path.join(f.root, 'catalogs'), selectedCache = path.join(f.root, 'cache');
  const result = f.json('discover', '--source', source, '--profile-dir', profile, '--gateway-profile', gatewayFile, '--root', root, '--catalog-dir', catalogs, '--cache', selectedCache);
  assert.deepEqual(result, { source, profileDirectory: profile, gatewayProfile: gatewayFile, managedRoot: root, catalogDirectory: catalogs, caches: [selectedCache], issues: [] });
  assert.deepEqual(f.calls(), []);
});

test('explicit catalog import and cache commands ignore invalid unrelated environment', t => {
  const f = fixture(t); f.invalidEnvironment();
  const file = path.join(f.root, 'catalog.json'); fs.writeFileSync(file, '{"hello":"你好"}');
  assert.equal(f.json('catalog', 'import', '--kind', 'dynamic', '--locale', 'zh-Hans', '--file', file).kind, 'dynamic');
  assert(fs.existsSync(path.join(f.root, '.catalogs', 'zh-Hans', 'dynamic')));
  const selectedCache = path.join(f.root, 'selected-cache');
  cache(selectedCache, [{ url: 'https://claude.ai/i18n/dynamic/zh-Hant.json', body: { hello: '您好' } }]);
  const catalogDirectory = path.join(f.root, 'custom-catalogs');
  const result = f.json('catalog', 'cache', '--locale', 'zh-Hant', '--cache', selectedCache, '--catalog-dir', catalogDirectory);
  assert.equal(result.imported.length, 1);
  assert(fs.existsSync(path.join(catalogDirectory, 'zh-Hant', 'dynamic')));
  const fetched = f.json('catalog', 'fetch', '--kind', 'dynamic', '--locale', 'zh-Hant', '--url', 'https://claude.ai/i18n/dynamic/zh-Hant.json');
  assert.equal(fetched.kind, 'dynamic');
  assert(fs.existsSync(path.join(f.root, '.catalogs', 'zh-Hant', 'dynamic')));
  assert.deepEqual(f.calls(), []);
});

test('automatic cache import aggregates official data from all caches despite empty or unsupported candidates', t => {
  const f = fixture(t);
  const unsupported = path.join(f.env.LOCALAPPDATA, 'Claude-3p', 'Cache', 'Cache_Data');
  fs.mkdirSync(unsupported, { recursive: true }); fs.writeFileSync(path.join(unsupported, 'index'), 'simple cache fixture');
  const base = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => ['key' + i, '翻译']));
  cache(path.join(f.env.LOCALAPPDATA, 'Claude', 'Cache', 'Cache_Data'), [
    { url: 'https://claude.ai/i18n/zh-Hans.json', body: base },
    { url: 'https://evil.example/i18n/dynamic/zh-Hans.json', body: { stolen: 'must not import' } },
    { url: 'https://claude.ai/api/organizations', body: { private: 'must not import' } }
  ]);
  cache(path.join(f.env.APPDATA, 'Claude', 'Cache', 'Cache_Data'), [
    { url: 'https://claude.ai/i18n/dynamic/zh-Hans.json', body: { hello: '你好' } },
    { url: 'https://claude.ai/i18n/dynamic/zh-Hant.json', body: { other: 'other locale' } }
  ]);
  const result = f.json('catalog', 'cache', '--locale', 'zh-Hans');
  assert.deepEqual(result.imported.map(item => item.kind).sort(), ['base', 'dynamic']);
  assert(result.skipped.some(item => item.cache === unsupported));
  const folder = path.join(f.root, '.catalogs', 'zh-Hans', 'dynamic');
  const snapshots = fs.readdirSync(folder).filter(name => !name.endsWith('.meta.json'));
  assert.equal(snapshots.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, snapshots[0]), 'utf8')), { hello: '你好' });
  assert.equal(fs.existsSync(path.join(f.root, '.catalogs', 'zh-Hant')), false);
});

test('explicit cache failure does not fall back to unrelated automatic caches', t => {
  const f = fixture(t);
  cache(path.join(f.env.APPDATA, 'Claude', 'Cache', 'Cache_Data'), [{ url: 'https://claude.ai/i18n/dynamic/zh-Hans.json', body: { hello: '你好' } }]);
  const result = f.run('catalog', 'cache', '--cache', path.join(f.root, 'missing-cache'));
  assert.equal(result.status, 1); assert.match(result.stderr, /missing-cache/);
  assert.deepEqual(f.calls(), []);
  assert.equal(fs.existsSync(path.join(f.root, '.catalogs')), false);
});
