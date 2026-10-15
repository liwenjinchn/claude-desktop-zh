import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createController } from '../integrations/magpie/controller.mjs';
import { ClaudeChinesePlugin } from '../integrations/magpie/server.mjs';
const projectDirectory = fileURLToPath(new URL('..', import.meta.url));
const base = { projectDirectory, managedRoot: 'managed', profileDirectory: 'profile', sourceDirectory: 'source', locale: 'zh-Hant' };
test('host plugin exposes real tool hooks without a fake model provider', async () => {
  const hooks = await ClaudeChinesePlugin({}, {});
  assert(hooks.tool.claude_zh_manage.execute); assert(!hooks.auth);
});
test('plugin writes require both user-saved opt-in and exact confirmation', async () => {
  const c = createController(base, async () => { throw new Error('should not run'); });
  await assert.rejects(c.execute('switch', 'switch'), /Writes disabled/);
  const opted = createController({ ...base, allowWrites: true });
  await assert.rejects(opted.execute('restore', 'prepare'), /Writes disabled/);
});
test('sync detects configured gateway before switching only an installed idle copy', async () => {
  const calls = [];
  const c = createController({ ...base, allowWrites: true, autoSync: true }, async (_, args) => {
    calls.push(args[0]);
    if (args[0] === 'detect-3p') return { configured3p: true, provider: 'gateway' };
    if (args[0] === 'status') return { status: 'installed', intact: true, locale: 'zh-Hans' };
    return { status: 'installed' };
  });
  assert.equal((await c.sync()).state, 'switched');
  assert.deepEqual(calls, ['detect-3p', 'status', 'switch']);
});
test('sync makes no changes outside gateway mode or when already synchronized', async () => {
  const calls = [];
  const c = createController({ ...base, allowWrites: true, autoSync: true }, async (_, args) => { calls.push(args[0]); return { configured3p: false }; });
  assert.equal((await c.sync()).state, 'not-3p-gateway'); assert.deepEqual(calls, ['detect-3p']);
});
test('running copy failure is deferred; automatic mode does not install a new copy', async () => {
  const c = createController({ ...base, allowWrites: true, autoSync: true }, async (_, args) => {
    if (args[0] === 'detect-3p') return { configured3p: true, provider: 'gateway' };
    if (args[0] === 'status') return { status: 'installed', intact: true, locale: 'zh-Hans' };
    throw new Error('Close managed copy');
  });
  assert.equal((await c.sync()).state, 'deferred');
});
