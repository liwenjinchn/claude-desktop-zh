import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRuntimeHost } from '../integrations/magpie/runtime-host.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'zh-watcher-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function harness(t, overrides = {}) {
  const state = { pids: [111], last: null, applied: [], toasts: [] };
  const directory = tempDir(t);
  const controller = {};
  const input = { directory, client: { tui: { showToast: message => state.toasts.push(message) } } };
  const options = { locale: 'zh-Hans', mode: 'original', allowWrites: true, runtimeAutoLoad: true, ...overrides.options };
  fs.writeFileSync(path.join(directory, 'plugins.json'), JSON.stringify({ plugins: [{ spec: 'github:liwenjinchn/claude-desktop-zh', options }] }));
  const dependencies = {
    platform: 'darwin',
    macPollMs: 5,
    macStateDirectory: directory,
    macPids: () => state.pids,
    macLastApplied: () => state.last,
    macApply: async locale => {
      state.applied.push({ locale, pid: state.pids[0] ?? null });
      return { state: 'Applied', pages: [{ id: 1, origin: 'app://localhost' }] };
    },
    ...overrides.dependencies,
  };
  const host = createRuntimeHost(input, options, controller, dependencies);
  t.after(() => host.stop());
  return { host, state, directory };
}

test('macOS watcher applies after a new Claude process, waits on exit and applies again', async t => {
  const { host, state, directory } = harness(t);
  const started = await host.start();
  assert.equal(started.state, 'watching');
  assert.equal(started.automaticNextLaunch, true);
  await sleep(80);
  assert.equal(host.state().state, 'Applied');
  assert.equal(host.state().appliedPid, 111);
  assert.deepEqual(state.applied, [{ locale: 'zh-Hans', pid: 111 }]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'watcher.json'))).state, 'Applied');
  assert.equal(fs.existsSync(path.join(directory, 'watcher.lock')), true);
  assert.equal(state.toasts.some(message => message.body?.message === 'Claude 中文已加载。'), true);

  state.pids = [];
  await sleep(40);
  assert.equal(host.state().state, 'waiting-for-claude');
  assert.equal(host.state().automaticNextLaunch, true);

  state.pids = [222];
  await sleep(80);
  assert.equal(host.state().state, 'Applied');
  assert.equal(host.state().appliedPid, 222);
  assert.deepEqual(state.applied.map(item => item.pid), [111, 222]);

  host.stop();
  assert.equal(host.state().state, 'stopped');
  assert.equal(host.state().automaticNextLaunch, false);
  assert.equal(fs.existsSync(path.join(directory, 'watcher.lock')), false);
  state.pids = [333];
  await sleep(40);
  assert.deepEqual(state.applied.map(item => item.pid), [111, 222]);
});

test('macOS watcher adopts an already applied process and does not re-open the debugger', async t => {
  const { host, state } = harness(t, { dependencies: { macLastApplied: () => ({ state: 'Applied', pid: 111, locale: 'zh-Hans' }) } });
  await host.start();
  await sleep(50);
  assert.equal(host.state().state, 'Applied');
  assert.equal(host.state().lastResult, 'already-applied');
  assert.equal(state.applied.length, 0);
});

test('macOS watcher reports missing Accessibility once and stops retrying', async t => {
  const { host, state } = harness(t, {
    dependencies: {
      macApply: async () => { state.applied.push({ locale: 'zh-Hans', pid: 111 }); throw new Error('macOS Accessibility permission is required to open Claude\'s developer menu.'); },
    },
  });
  await host.start();
  await sleep(60);
  assert.equal(host.state().state, 'needs-accessibility');
  assert.equal(state.applied.length, 1);
  await sleep(40);
  assert.equal(state.applied.length, 1);
  assert.equal(host.state().automaticNextLaunch, true);
});

test('macOS watcher reports RuntimeSetupRequired without retrying', async t => {
  const { host, state } = harness(t, {
    dependencies: { macApply: async () => { state.applied.push({ locale: 'zh-Hans', pid: 111 }); return { state: 'RuntimeSetupRequired' }; } },
  });
  await host.start();
  await sleep(60);
  assert.equal(host.state().state, 'needs-setup');
  assert.equal(state.applied.length, 1);
  await sleep(40);
  assert.equal(state.applied.length, 1);
});

test('macOS watcher is disabled without runtimeAutoLoad and never applies', async t => {
  const { host, state, directory } = harness(t, { options: { runtimeAutoLoad: false } });
  const started = await host.start();
  assert.equal(started.state, 'disabled');
  await sleep(40);
  assert.equal(state.applied.length, 0);
  assert.equal(fs.existsSync(path.join(directory, 'watcher.lock')), false);
});

test('a newer plugin host takes ownership and the old watcher stops without applying', async t => {
  const first = harness(t);
  await first.host.start();
  await sleep(20);
  // First watcher has already applied 111. A second host shares the state
  // directory but owns a different process/instance token.
  const second = harness(t, {
    dependencies: {
      macPids: () => [222],
      macApply: async locale => { second.state.applied.push({ locale, pid: 222 }); return { state: 'Applied', pages: [] }; },
      macStateDirectory: first.directory,
    },
  });
  await second.host.start();
  await sleep(60);
  assert.equal(second.host.state().state, 'Applied');
  assert.deepEqual(second.state.applied.map(item => item.pid), [222]);
  assert.equal(first.state.applied.length, 1);
  first.host.stop();
  second.host.stop();
});


test('macOS watcher distinguishes discovery failure from an app that is closed', async t => {
  const { host } = harness(t, { dependencies: { macPids: () => { throw new Error('Unknown frontend'); } } });
  t.after(() => host.stop());
  await host.start();
  await sleep(40);
  assert.equal(host.state().state, 'discovery-failed');
});


test('registry removal or saved options change stops a Mac watcher before the next apply', async t => {
  for (const plugins of [[], [{ spec: 'github:liwenjinchn/claude-desktop-zh', off: true }], [{ spec: 'github:liwenjinchn/claude-desktop-zh', options: { locale: 'zh-Hant' } }]]) {
    const { host, state, directory } = harness(t);
    state.pids = [];
    await host.start();
    fs.writeFileSync(path.join(directory, 'plugins.json'), JSON.stringify({ plugins }));
    state.pids = [222];
    await sleep(50);
    assert.equal(host.state().state, 'stopped');
    assert.equal(state.applied.length, 0);
  }
});

test('a busy retired Mac host does not overwrite the new owners state', async t => {
  let release;
  const first = harness(t, { dependencies: { macApply: () => new Promise(resolve => { release = resolve; }) } });
  await first.host.start();
  const second = harness(t, { dependencies: { macStateDirectory: first.directory, macPids: () => [222] } });
  await second.host.start();
  await sleep(30);
  release({ state: 'Applied', pages: [] });
  await sleep(30);
  const saved = JSON.parse(fs.readFileSync(path.join(first.directory, 'watcher.json')));
  assert.equal(saved.appliedPid, 222);
});
