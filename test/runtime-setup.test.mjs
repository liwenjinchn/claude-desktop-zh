import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setupRuntime, restoreRuntimeSetup, runtimeSetupStatus, windowsSetupGuard } from '../lib/runtime-setup.mjs';

function fixture(t, settings) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zh-first-install-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const profile = path.join(root, 'profile'), state = path.join(root, 'state');
  fs.mkdirSync(path.join(profile, 'configLibrary'), { recursive: true });
  const id = '11111111-1111-4111-8111-111111111111';
  fs.writeFileSync(path.join(profile, 'claude_desktop_config.json'), '{"deploymentMode":"3p"}');
  fs.writeFileSync(path.join(profile, 'configLibrary/_meta.json'), JSON.stringify({ appliedId: id }));
  fs.writeFileSync(path.join(profile, 'configLibrary', id + '.json'), '{"inferenceProvider":"gateway"}');
  const target = path.join(profile, 'developer_settings.json');
  if (settings !== undefined) fs.writeFileSync(target, settings);
  return { root, profile, state, target };
}

test('first install waits for normal exit without creating profile or backup files', t => {
  const f = fixture(t, '{"other":true}'), before = fs.readFileSync(f.target);
  assert.equal(runtimeSetupStatus(f.profile).state, 'RuntimeSetupRequired');
  assert.equal(setupRuntime(f.profile, f.state, () => false).state, 'WaitingForNormalExit');
  assert.deepEqual(fs.readFileSync(f.target), before);
  assert.equal(fs.existsSync(f.state), false);
});

test('setup preserves all other values, backs up exact bytes and restores them', t => {
  const bytes = '\uFEFF{ "allowDevTools":false, "nested":{"value":[1,"中文"]}, "other":null }\r\n';
  const f = fixture(t, bytes), result = setupRuntime(f.profile, f.state, () => true);
  assert.equal(result.state, 'RuntimeSetupReady'); assert.equal(result.changed, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.target)), { allowDevTools: true, nested: { value: [1, '中文'] }, other: null });
  assert.equal(fs.readFileSync(path.join(path.dirname(result.journal), 'before.json'), 'utf8'), bytes);
  assert.equal(setupRuntime(f.profile, f.state, () => { throw Error('Already ready must not write'); }).changed, false);
  restoreRuntimeSetup(f.profile, result.journal, () => true);
  assert.equal(fs.readFileSync(f.target, 'utf8'), bytes);
});

test('missing setting is created and restore removes only that unchanged file', t => {
  const f = fixture(t), result = setupRuntime(f.profile, f.state, () => true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.target)), { allowDevTools: true });
  restoreRuntimeSetup(f.profile, result.journal, () => true);
  assert.equal(fs.existsSync(f.target), false);
});

test('restart before commit leaves settings untouched and a retry converges', t => {
  const f = fixture(t, '{"allowDevTools":false,"other":7}'); let calls = 0;
  const result = setupRuntime(f.profile, f.state, () => ++calls === 1);
  assert.equal(result.state, 'WaitingForNormalExit');
  assert.equal(JSON.parse(fs.readFileSync(f.target)).allowDevTools, false);
  assert.equal(JSON.parse(fs.readFileSync(result.journal)).applied, false);
  assert.equal(fs.readdirSync(f.profile).some(n => n.includes('pending') || n.includes('zh-setup')), false);
  assert.equal(setupRuntime(f.profile, f.state, () => true).state, 'RuntimeSetupReady');
});

test('setup and restore refuse drift, preserve other edits and require stopped state', t => {
  const f = fixture(t, '{"other":1}'); let calls = 0;
  assert.throws(() => setupRuntime(f.profile, f.state, () => {
    if (++calls === 2) fs.writeFileSync(f.target, '{"other":2}');
    return true;
  }), /changed during setup/);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.target)), { other: 2 });
  const ready = setupRuntime(f.profile, f.state, () => true);
  assert.throws(() => restoreRuntimeSetup(f.profile, ready.journal, () => false), /Normal Claude exit/);
  fs.writeFileSync(f.target, '{"allowDevTools":true,"other":3}');
  assert.throws(() => restoreRuntimeSetup(f.profile, ready.journal, () => true), /changed; restore refused/);
  assert.equal(JSON.parse(fs.readFileSync(f.target)).other, 3);
});

test('unknown schemas and backups in the profile fail without writes', t => {
  for (const config of ['[]', 'null', '{"allowDevTools":"false"}', '{broken']) {
    const f = fixture(t, config);
    assert.throws(() => setupRuntime(f.profile, f.state, () => true));
    assert.equal(fs.readFileSync(f.target, 'utf8'), config);
  }
  const f = fixture(t, '{}');
  assert.throws(() => setupRuntime(f.profile, path.join(f.profile, 'backup'), () => true), /outside the profile/);
});

test('revoked runtime owner refuses the setup write', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t, '{}'), registry = path.join(f.root, 'registry.json'), stop = path.join(f.root, 'stop');
  fs.writeFileSync(registry, '{}'); fs.writeFileSync(stop, 'stop');
  const owner = path.join(f.root, 'owner.json');
  fs.writeFileSync(owner, JSON.stringify({ pid: process.pid, startedTicks: '1', executable: process.execPath,
    registryFile: registry, registrySha256: 'a'.repeat(64), stopFile: stop }));
  assert.throws(() => setupRuntime(f.profile, f.state, windowsSetupGuard(owner)), /owner changed/);
  assert.equal(fs.readFileSync(f.target, 'utf8'), '{}');
});
