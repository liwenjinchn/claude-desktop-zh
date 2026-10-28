import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {
  applyMacLocalization, buildMacActivationCode, claudePids, findClaudeApp,
  macLayout, openMainProcessInspector, readDeveloperSettings, RESTORE_CODE, waitForInspectorTarget,
} from '../lib/macos.mjs';

const darwin = { skip: process.platform !== 'darwin' };
const EXE = path.join('Contents', 'MacOS', 'Claude');

function tempRoot(t, prefix = 'macos-zh-') {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function fakeApp(t, root = tempRoot(t)) {
  const app = path.join(root, 'Claude.app');
  fs.mkdirSync(path.dirname(path.join(app, EXE)), { recursive: true });
  fs.mkdirSync(path.join(app, 'Contents', 'Resources', 'ion-dist', 'i18n'), { recursive: true });
  fs.writeFileSync(path.join(app, 'Contents', 'Resources', 'ion-dist', 'i18n', 'en-US.json'), '{}');
  fs.writeFileSync(path.join(app, EXE), 'inert');
  return app;
}

test('findClaudeApp accepts a Mac bundle and rejects unrelated directories', t => {
  const app = fakeApp(t);
  assert.equal(findClaudeApp(app), path.resolve(app));
  const unrelated = tempRoot(t);
  assert.throws(() => findClaudeApp(unrelated), /not a readable Claude\.app/);
});

test('claudePids matches only the main executable, not helpers or arguments', () => {
  const app = path.resolve('/Applications/Claude.app');
  const output = [
    `  111 ${path.join(app, 'Contents/MacOS/Claude')}`,
    `  222 ${path.join(app, 'Contents/Helpers/disclaimer')}`,
    `  333 ${path.join(app, 'Contents/Frameworks/Claude Helper.app/Contents/MacOS/Claude Helper')}`,
    `  444 ${path.join(app, 'Contents/MacOS/Claude Helper')}`,
  ].join('\n');
  const exec = () => output;
  assert.deepEqual(claudePids('/Applications/Claude.app', exec), [111]);
});

test('inspector target must match the expected PID and executable', async () => {
  const executable = path.resolve('/Applications/Claude.app/Contents/MacOS/Claude');
  const target = { type: 'node', title: `${executable}[123]`, webSocketDebuggerUrl: 'ws://127.0.0.1:9229/x' };
  const fetchImpl = async () => ({ ok: true, json: async () => [target] });
  assert.equal((await waitForInspectorTarget(123, '/Applications/Claude.app/Contents/MacOS/Claude', { fetchImpl, timeoutMs: 200 })).webSocketDebuggerUrl, target.webSocketDebuggerUrl);
  const emptyFetch = async () => ({ ok: true, json: async () => [] });
  await assert.rejects(waitForInspectorTarget(999, '/Applications/Claude.app/Contents/MacOS/Claude', { fetchImpl: emptyFetch, timeoutMs: 30 }), /did not open/);
  const other = { type: 'node', title: 'some-other-node[999]', webSocketDebuggerUrl: 'ws://127.0.0.1:9229/y' };
  const otherFetch = async () => ({ ok: true, json: async () => [other] });
  await assert.rejects(waitForInspectorTarget(123, '/Applications/Claude.app/Contents/MacOS/Claude', { fetchImpl: otherFetch }), /another Node inspector/);
});

test('runtime activation code skips an already matching language without touching the page', async () => {
  const code = buildMacActivationCode({ locale: 'zh-Hans', base: {}, dynamic: {} });
  const runtime = { locale: 'zh-Hans', restored: false, status: () => ({ locale: 'zh-Hans', messagesLocale: 'zh-Hans', catalogRequestsServed: 2, restored: false }) };
  const result = await vm.runInNewContext(code, { claudeChineseRuntime: runtime });
  assert.equal(result.skipped, true);
  assert.equal(result.status.messagesLocale, 'zh-Hans');
});

test('restore code removes an active runtime and reports it was not active', () => {
  const context = vm.createContext({});
  vm.runInContext('globalThis.claudeChineseRuntime = { restored: false, status: () => ({ locale: "zh-Hans" }), restore() { this.restored = true; delete globalThis.claudeChineseRuntime; } }', context);
  const result = vm.runInContext(RESTORE_CODE, context);
  assert.equal(result.restored, true);
  assert.equal(result.stillActive, false);
  assert.equal(vm.runInContext('globalThis.claudeChineseRuntime', context), undefined);
  assert.equal(vm.runInNewContext(RESTORE_CODE, {}).restored, false);
});

test('developer settings are read without inventing a missing file', t => {
  const profile = tempRoot(t);
  assert.deepEqual(readDeveloperSettings(profile).enabled, false);
  fs.writeFileSync(path.join(profile, 'developer_settings.json'), '{"allowDevTools":true}');
  assert.equal(readDeveloperSettings(profile).enabled, true);
  fs.writeFileSync(path.join(profile, 'developer_settings.json'), '{bad json');
  assert.equal(readDeveloperSettings(profile).enabled, false);
  assert.equal(readDeveloperSettings(profile).malformed, true);
});

test('macOS state and catalogs default outside the Claude profile', { skip: process.platform !== 'darwin' }, () => {
  const layout = macLayout({ HOME: '/Users/example' });
  assert.equal(layout.catalogDirectory, '/Users/example/Library/Application Support/claude-desktop-zh/catalogs');
  assert.equal(layout.stateDirectory, '/Users/example/Library/Application Support/claude-desktop-zh/mac');
});

function fakeDependencies(overrides = {}) {
  const calls = { open: 0, inject: 0, close: 0 };
  const client = { close() {} };
  const deps = {
    platform: 'darwin',
    findApp: () => '/Applications/Claude.app',
    pids: () => [123],
    profile: () => ({ directory: '/tmp/profile', configured3p: true, provider: 'gateway' }),
    devtools: () => ({ enabled: true }),
    spec: () => ({ locale: 'zh-Hans', runtimeUrl: '/assets/x.js', runtimeSha256: 'a'.repeat(64), storeExport: 'S', base: { a: '你' }, dynamic: { b: '好' } }),
    openInspector: async () => { calls.open++; return { opened: true }; },
    waitTarget: async () => ({ webSocketDebuggerUrl: 'ws://127.0.0.1:9229/fake' }),
    connect: async () => client,
    inject: async () => { calls.inject++; return [{ id: 1, origin: 'app://localhost', result: { skipped: false, status: { locale: 'zh-Hans', messagesLocale: 'zh-Hans', catalogRequestsServed: 2, restored: false } } }]; },
    closeClient: async () => { calls.close++; return true; },
    ...overrides,
  };
  return { deps, calls };
}

test('macOS apply builds a pinned snippet, injects the page and closes the inspector', async t => {
  const stateDirectory = tempRoot(t);
  const { deps, calls } = fakeDependencies();
  const result = await applyMacLocalization({ stateDirectory }, deps);
  assert.equal(result.state, 'Applied');
  assert.equal(result.locale, 'zh-Hans');
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].origin, 'app://localhost');
  assert.equal(Object.hasOwn(result.pages[0], 'title'), false);
  assert.equal(fs.existsSync(path.join(stateDirectory, 'language-zh-Hans.js')), true);
  const last = JSON.parse(fs.readFileSync(path.join(stateDirectory, 'last-apply.json')));
  assert.equal(last.state, 'Applied');
  assert.equal(last.pages[0].origin, 'app://localhost');
  assert.equal(JSON.stringify(last).includes('conversation'), false);
  assert.deepEqual(calls, { open: 1, inject: 1, close: 1 });
});

test('macOS apply reports RuntimeSetupRequired without opening the debugger', async t => {
  const stateDirectory = tempRoot(t);
  let opened = 0;
  const { deps } = fakeDependencies({ devtools: () => ({ enabled: false }), openInspector: async () => { opened++; } });
  const result = await applyMacLocalization({ stateDirectory }, deps);
  assert.equal(result.state, 'RuntimeSetupRequired');
  assert.equal(opened, 0);
  assert.equal(fs.existsSync(path.join(stateDirectory, 'last-apply.json')), false);
});

test('macOS apply refuses a missing or ambiguous running app', async t => {
  const stateDirectory = tempRoot(t);
  let { deps } = fakeDependencies({ pids: () => [] });
  await assert.rejects(applyMacLocalization({ stateDirectory }, deps), /not running/);
  ({ deps } = fakeDependencies({ pids: () => [123, 456] }));
  await assert.rejects(applyMacLocalization({ stateDirectory }, deps), /More than one/);
});

test('macOS partial page failures stay visible and all failures throw after recording', async t => {
  const stateDirectory = tempRoot(t);
  const { deps } = fakeDependencies({
    inject: async () => [
      { id: 1, origin: 'app://localhost', result: { skipped: true, status: { messagesLocale: 'zh-Hans' } } },
      { id: 2, origin: 'app://localhost', error: 'page timed out.' },
    ],
  });
  const partial = await applyMacLocalization({ stateDirectory }, deps);
  assert.equal(partial.state, 'PartiallyApplied');
  const failing = fakeDependencies({ inject: async () => [{ id: 1, origin: 'app://localhost', error: 'page timed out.' }] });
  await assert.rejects(applyMacLocalization({ stateDirectory }, failing.deps), /Chinese was not applied/);
  const last = JSON.parse(fs.readFileSync(path.join(stateDirectory, 'last-apply.json')));
  assert.equal(last.state, 'Failed');
});


test('menu automation checks the actual operation instead of the legacy global accessibility flag', async () => {
  let calls = 0;
  await assert.rejects(openMainProcessInspector(123, { port: 65439, captureBrowser: () => ({ state: 'unavailable' }), exec: (command, args) => {
    calls++;
    assert.equal(command, 'osascript');
    assert.equal(args[1].includes('get UI elements enabled'), false);
    assert.equal(args[1].includes('Enable Main Process Debugger'), true);
    throw Object.assign(new Error('denied'), { stderr: 'osascript is not allowed assistive access.' });
  } }), /Accessibility permission/);
  assert.equal(calls, 1);
});


test('activation does not skip a control whose messages are still in another language', async () => {
  const runtime = { status: () => ({ locale: 'zh-Hans', messagesLocale: 'en-US', restored: false }), restore: () => { throw new Error('stale control restored'); } };
  await assert.rejects(vm.runInNewContext(buildMacActivationCode({ locale: 'zh-Hans', base: {}, dynamic: {} }), { claudeChineseRuntime: runtime }), /stale control restored/);
});
