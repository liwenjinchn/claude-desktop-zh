import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { macRuntimeOwnerGuard, applyMacLocalization, restoreMacLocalization, injectCodeIntoPages } from '../lib/macos.mjs';
import { sha256 } from '../lib/common.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'zh-mac-owner-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registryFile = path.join(root, 'plugins.json'), file = path.join(root, 'watcher.lock');
  fs.writeFileSync(registryFile, '{"plugins":[]}');
  const owner = { instance: 'original', pid: process.pid, registryFile, registrySha256: sha256(fs.readFileSync(registryFile)) };
  fs.writeFileSync(file, JSON.stringify(owner));
  return { root, file, registryFile, owner };
}

test('Mac CLI owner binding rejects changed settings, missing lock and takeover', t => {
  const f = fixture(t), guard = macRuntimeOwnerGuard(f.file, 'original');
  guard();
  assert.throws(() => macRuntimeOwnerGuard(f.file, 'retired'), /owner changed/);
  fs.writeFileSync(f.registryFile, '{"plugins":[{}]}');
  assert.throws(guard, /owner changed/);
  fs.writeFileSync(f.registryFile, '{"plugins":[]}');
  fs.writeFileSync(f.file, JSON.stringify({ ...f.owner, instance: 'new-host' }));
  assert.throws(guard, /owner changed/);
  assert.throws(() => macRuntimeOwnerGuard(f.file, 'original'), /owner changed/);
  fs.unlinkSync(f.file);
  assert.throws(guard, /owner changed/);
});

test('owner revoked during inspector opening prevents injection and closes the inspector', async t => {
  const f = fixture(t); let injected = false, closed = false;
  await assert.rejects(applyMacLocalization({ stateDirectory: f.root, runtimeOwner: f.file, runtimeOwnerInstance: 'original' }, {
    platform: 'darwin', findApp: () => '/Applications/Claude.app', pids: () => [123],
    profile: () => ({ directory: '/mock-profile', configured3p: true, provider: 'gateway' }), devtools: () => ({ enabled: true }),
    spec: () => ({ locale: 'zh-Hans', base: {}, dynamic: {} }),
    openInspector: async () => { fs.writeFileSync(f.registryFile, '{"plugins":[{}]}'); return { opened: true }; },
    waitTarget: async () => ({ webSocketDebuggerUrl: 'not-connected' }),
    connect: async () => ({ close() {} }),
    inject: async () => { injected = true; }, closeClient: async () => { closed = true; return true; },
    closeByMenu: () => { closed = true; return true; },
  }), /owner changed/);
  assert.equal(injected, false);
  assert.equal(closed, true);
});


test('standalone Mac restore remains available without a watcher owner', async t => {
  const f = fixture(t); let restored = false, closed = false;
  const result = await restoreMacLocalization({ stateDirectory: f.root }, {
    platform: 'darwin', findApp: () => '/Applications/Claude.app', pids: () => [123],
    profile: () => ({ directory: '/mock-profile', configured3p: true, provider: 'gateway' }), devtools: () => ({ enabled: true }),
    openInspector: async () => ({ opened: true }), waitTarget: async () => ({ webSocketDebuggerUrl: 'mock' }),
    connect: async () => ({ close() {} }), restore: async () => { restored = true; return [{ id: 1, result: { restored: true } }]; },
    closeClient: async () => { closed = true; return true; },
  });
  assert.equal(result.state, 'Restored');
  assert.equal(restored, true);
  assert.equal(closed, true);
});


test('owner revoked during main-process status wait prevents page activation', async t => {
  const f = fixture(t), guard = macRuntimeOwnerGuard(f.file, 'original');
  const codeFile = path.join(f.root, 'language.js'); fs.writeFileSync(codeFile, 'never-execute');
  let pageCalls = 0;
  const page = { id: 1, isDestroyed: () => false, getURL: () => 'app://localhost/new', executeJavaScript: async () => {
    pageCalls++;
    fs.writeFileSync(f.registryFile, '{"plugins":[{}]}');
    return null;
  } };
  const require = createRequire(import.meta.url);
  const client = { evaluate: expression => vm.runInNewContext(expression, {
    process: { mainModule: { require: name => name === 'electron' ? { webContents: { getAllWebContents: () => [page] } } : require(name) }, kill: process.kill.bind(process) },
    // Pending timeout branches need not keep this inert regression alive.
    setTimeout: (callback, ms) => { const timer = setTimeout(callback, ms); timer.unref(); return timer; },
  }) };
  const pages = await injectCodeIntoPages(client, codeFile, 'zh-Hans', guard.snapshot);
  assert.equal(pageCalls, 1);
  assert.match(pages[0].error, /owner changed/);
});

test('Mac restore records failed page outcomes and rejects a completely failed restore', async t => {
  const f = fixture(t);
  const deps = {
    platform: 'darwin', findApp: () => '/Applications/Claude.app', pids: () => [123],
    profile: () => ({ directory: '/mock-profile', configured3p: true, provider: 'gateway' }), devtools: () => ({ enabled: true }),
    openInspector: async () => ({ opened: true }), waitTarget: async () => ({ webSocketDebuggerUrl: 'mock' }), connect: async () => ({ close() {} }),
    restore: async () => [{ id: 1, error: 'page restore timed out' }], closeClient: async () => true,
  };
  await assert.rejects(restoreMacLocalization({ stateDirectory: f.root }, deps), /not restored/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'last-restore.json'))).state, 'Failed');
  deps.restore = async () => [{ id: 1, error: 'page restore timed out' }, { id: 2, result: { restored: true } }];
  assert.equal((await restoreMacLocalization({ stateDirectory: f.root }, deps)).state, 'PartiallyRestored');
});
