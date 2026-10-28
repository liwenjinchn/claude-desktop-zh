import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createRuntimeHost, registrySnapshot } from '../integrations/magpie/runtime-host.mjs';
import { createController } from '../integrations/magpie/controller.mjs';
import { sha256 } from '../lib/common.mjs';

const project = fileURLToPath(new URL('..', import.meta.url));
const plugin = fileURLToPath(new URL('../integrations/magpie', import.meta.url));
function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'zh-host-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registry = path.join(root, 'plugins.json');
  fs.writeFileSync(registry, JSON.stringify({ plugins: [{ spec: plugin, options }] }));
  return { root, registry, options };
}
function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.unref = () => {};
  child.kill = () => { throw new Error('Must stop normally'); };
  return child;
}

test('registry binds the actual plugin, saved options and enabled state', t => {
  const f = fixture(t, { locale: 'zh-Hant', runtimeAutoLoad: true });
  assert.equal(registrySnapshot(f.root, { runtimeAutoLoad: true, locale: 'zh-Hant' }).hash, sha256(fs.readFileSync(f.registry)));
  assert.throws(() => registrySnapshot(f.root, { locale: 'zh-Hans' }), /changed/);
  const data = JSON.parse(fs.readFileSync(f.registry)); data.plugins[0].off = true;
  fs.writeFileSync(f.registry, JSON.stringify(data));
  assert.throws(() => registrySnapshot(f.root, f.options), /changed/);
});

test('registry accepts root, npm and GitHub installs and rejects ambiguous or unrelated owners', t => {
  const f = fixture(t);
  const write = entries => fs.writeFileSync(f.registry, JSON.stringify({ plugins: entries }));
  for (const spec of [project, plugin, path.join(plugin, 'server.mjs'), 'magpie-claude-zh',
    'magpie-claude-zh@0.1.0', 'magpie-claude-zh@latest', 'github:polang233/claude-desktop-zh',
    'github:polang233/claude-desktop-zh#v0.1.0', 'https://github.com/polang233/claude-desktop-zh.git',
    'github:polang233/claude-desktop-3p-zh']) {
    write([{ spec }]);
    assert.equal(registrySnapshot(f.root, {}).hash, sha256(fs.readFileSync(f.registry)), spec);
  }
  for (const spec of ['magpie-claude-zh-other', 'github:someone/claude-desktop-zh',
    'github:polang233/claude-desktop-zh-other', 'https://example.com/polang233/claude-desktop-zh',
    'https://github.com/polang233/claude-desktop-zh/tree/main', path.dirname(project)]) {
    write([{ spec }]);
    assert.throws(() => registrySnapshot(f.root, {}), /changed/, spec);
  }
  write([{ spec: project }, { spec: 'magpie-claude-zh' }]);
  assert.throws(() => registrySnapshot(f.root, {}), /changed/);
});

test('default locale starts one hidden owner-bound watcher and stop uses a file', async t => {
  const f = fixture(t), calls = [], child = fakeChild(), toasts = [];
  const controller = { runtimeConfiguration: () => ({ cwd: project, executable: process.execPath, cli: path.join(project, 'bin/claude-3p-zh.mjs') }), prepareRuntime: async output => ({ automationManifest: output + '.automation.json', profileDirectory: path.join(f.root, 'profile') }) };
  const runtime = createRuntimeHost({ directory: f.root, client: { tui: { showToast: async value => toasts.push(value.body.message) } } }, f.options, controller, {
    platform: 'win32', runtimeDirectory: path.join(f.root, 'runtime'),
    spawn: (...args) => { calls.push(args); return child; }
  });
  await Promise.all([runtime.start(), runtime.start()]);
  assert.equal(calls.length, 1);
  const [exe, args, settings] = calls[0];
  assert.equal(exe, 'powershell.exe');
  assert(args.includes('-ParentProcessId')); assert(args.includes(String(process.pid)));
  assert(args.includes('-RegistrySha256')); assert(args.includes(sha256(fs.readFileSync(f.registry))));
  assert(args.includes('-SetupProfileDirectory')); assert(args.includes(path.join(f.root, 'profile')));
  child.stdout.write('{"state":"WaitingForNormalExit","changed":false}\n');
  assert.equal(runtime.state().state, 'waiting-for-normal-exit');
  assert.equal(runtime.state().automaticNextLaunch, false);
  child.stdout.write('{"state":"RuntimeSetupReady","changed":true,"journal":"private-journal"}\n');
  assert.equal(runtime.state().setupChanged, true);
  assert.equal(settings.windowsHide, true); assert.equal(settings.shell, false);
  assert.deepEqual(settings.stdio, ['ignore', 'pipe', 'pipe']);
  child.stdout.write('Watching original Claude while plugin host and options are current.\n');
  assert.equal(runtime.state().locale, 'zh-Hans'); assert.equal(runtime.state().automaticNextLaunch, true);
  assert.equal(toasts.length, 2); assert.match(toasts[0], /退出/); assert.match(toasts[1], /已准备好/);
  runtime.stop();
  assert.equal(fs.existsSync(args[args.indexOf('-StopFile') + 1]), true);
  assert.equal(runtime.state().automaticNextLaunch, false);
  child.emit('exit', 0);
  assert.equal(runtime.state().state, 'stopped');
});

test('an options change during catalog preparation prevents an obsolete watcher', async t => {
  const f = fixture(t); let release, spawned = false;
  const runtime = createRuntimeHost({ directory: f.root }, {}, {
    runtimeConfiguration: () => ({ cwd: project }), prepareRuntime: () => new Promise(resolve => { release = resolve; })
  }, { platform: 'win32', runtimeDirectory: path.join(f.root, 'runtime'), spawn: () => { spawned = true; } });
  const ready = runtime.start();
  fs.writeFileSync(f.registry, '{"plugins":[]}');
  release({ automationManifest: 'not-run', profileDirectory: path.join(f.root, 'profile') });
  await ready;
  assert.equal(spawned, false); assert.equal(runtime.state().state, 'owner-changed');
});

test('disabled or unsupported modes never prepare catalogs or start a process', async () => {
  for (const options of [{ mode: 'copy' }, { runtimeAutoLoad: false }, { allowWrites: false }]) {
    const runtime = createRuntimeHost({}, options, { runtimeConfiguration() { throw new Error('Unexpected preparation'); } }, { platform: 'win32' });
    assert.equal((await runtime.start()).state, 'disabled');
  }
});

test('runtime controller uses the CLI and only imports after a missing-catalog refusal', async () => {
  const calls = []; let exports = 0;
  const controller = createController({ projectDirectory: project, sourceDirectory: 'original', catalogDirectory: 'catalogs' }, async (_config, args) => {
    calls.push(args);
    if (args[0] === 'detect-3p') return { configured3p: true, provider: 'gateway' };
    if (args[0] === 'runtime-export' && exports++ === 0) throw new Error('Missing compatible zh-Hans base/dynamic catalogs.');
    return { automationManifest: 'manifest' };
  });
  await controller.prepareRuntime('new.js');
  assert.deepEqual(calls.map(x => x[0]), ['detect-3p', 'runtime-export', 'catalog', 'runtime-export']);
  assert(calls[1].includes('zh-Hans')); assert(calls[1].includes('original')); assert(calls[1].includes('new.js'));
  const refused = [];
  const drift = createController({ projectDirectory: project }, async (_config, args) => {
    refused.push(args[0]);
    if (args[0] === 'detect-3p') return { configured3p: true, provider: 'gateway' };
    throw new Error('Language runtime changed.');
  });
  await assert.rejects(drift.prepareRuntime('unused.js'), /changed/);
  assert.deepEqual(refused, ['detect-3p', 'runtime-export']);
});

test('fresh install fetches official catalogs only after local and cache misses', async () => {
  const calls = []; let attempts = 0;
  const c = createController({ projectDirectory: project }, async (_config, args) => {
    calls.push(args);
    if (args[0] === 'detect-3p') return { configured3p: true, provider: 'gateway', directory: 'bound-profile' };
    if (args[0] === 'runtime-export' && attempts++ < 2) throw Error('Missing compatible zh-Hans base/dynamic catalogs.');
    if (args[0] === 'catalog' && args[1] === 'cache') throw Error('No language cache found.');
    return { automationManifest: 'manifest' };
  });
  const result = await c.prepareRuntime('new.js');
  assert.equal(result.profileDirectory, 'bound-profile');
  assert.deepEqual(calls.filter(x => x[1] === 'fetch').map(x => x[x.indexOf('--kind') + 1]), ['base', 'dynamic']);
  assert.equal(calls.filter(x => x[0] === 'runtime-export').length, 3);
  assert.equal(calls.some(x => x.includes('--url')), false);
});
