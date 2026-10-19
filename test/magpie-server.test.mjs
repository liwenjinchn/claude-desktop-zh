import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createController } from '../integrations/magpie/controller.mjs';
import * as pluginModule from '../integrations/magpie/server.mjs';
import { ClaudeChinesePlugin } from '../integrations/magpie/server.mjs';
const projectDirectory = fileURLToPath(new URL('..', import.meta.url));
const base = { projectDirectory, mode: 'copy', managedRoot: 'managed', locale: 'zh-Hant' };
const discovered = { source: 'source', managedRoot: 'managed', profileDirectory: 'profile', gatewayProfile: 'gateway.json', catalogDirectory: 'catalogs', caches: ['cache'] };
function answers(calls) {
  return async (_, args) => {
    calls.push(args);
    if (args[0] === 'discover') return discovered;
    if (args[0] === 'detect-3p') return { configured3p: true, provider: 'gateway' };
    if (args[0] === 'status') return { status: 'installed', intact: true, locale: 'zh-Hans' };
    return { status: 'installed' };
  };
}
test('host plugin exposes real tool hooks and a local page opener, not a model provider', async () => {
  assert.deepEqual(Object.keys(pluginModule), ['ClaudeChinesePlugin']);
  const hooks = await ClaudeChinesePlugin({}, { projectDirectory: 'nonexistent-path', autoSync: true });
  assert(hooks.auth.methods[0].authorize);
  assert.equal(hooks.auth.authorize, undefined);
  assert(hooks.tool.claude_zh_manage.execute);
  assert(hooks.tool.claude_zh_manage.args.properties.action.enum.includes('discover'));
  assert(hooks.tool.claude_zh_workbench.execute);
  assert.equal(hooks.auth.provider, 'claude-desktop-3p-zh');
  assert.equal(hooks.config, undefined);
});
test('actions use discovered paths and still require the exact confirmation', async () => {
  const calls = [];
  const c = createController(base, answers(calls));
  await assert.rejects(c.execute('restore', 'prepare'), /Confirm the exact action/);
  const result = await c.execute('switch', 'switch');
  assert.equal(result.status, 'installed');
  assert.deepEqual(calls.map(args => args[0]), ['switch']);
  assert(calls.at(-1).includes('managed'));
});
test('sync detects configured gateway before switching only an installed idle copy', async () => {
  const calls = [];
  const c = createController({ ...base, autoSync: true }, answers(calls));
  assert.equal((await c.sync()).state, 'switched');
  assert.deepEqual(calls.map(args => args[0]), ['detect-3p', 'status', 'switch']);
});
test('sync makes no changes outside gateway mode or when already synchronized', async () => {
  const calls = [];
  const c = createController({ ...base, autoSync: true }, async (_, args) => { calls.push(args[0]); return args[0] === 'discover' ? discovered : { configured3p: false }; });
  assert.equal((await c.sync()).state, 'not-3p-gateway'); assert.deepEqual(calls, ['detect-3p']);
});
test('running copy failure is deferred; automatic mode does not install a new copy', async () => {
  const c = createController({ ...base, autoSync: true }, async (_, args) => {
    if (args[0] === 'discover') return discovered;
    if (args[0] === 'detect-3p') return { configured3p: true, provider: 'gateway' };
    if (args[0] === 'status') return { status: 'installed', intact: true, locale: 'zh-Hans' };
    throw new Error('Close managed copy');
  });
  assert.equal((await c.sync()).state, 'deferred');
});
