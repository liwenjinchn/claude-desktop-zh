import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createWorkbench, closeWorkbenches } from '../integrations/magpie/workbench.mjs';
import { ClaudeChinesePlugin } from '../integrations/magpie/server.mjs';

const projectDirectory = fileURLToPath(new URL('..', import.meta.url));
const options = { projectDirectory, mode: 'copy', managedRoot: 'managed', profileDirectory: 'profile', locale: 'zh-Hant', allowWrites: true };
const discovered = { source: 'source', managedRoot: 'managed', profileDirectory: 'profile', gatewayProfile: 'gateway.json', catalogDirectory: 'catalogs', caches: ['cache'] };
function fakeRun(_config, args) {
  if (args[0] === 'discover') return Promise.resolve(discovered);
  return Promise.resolve({ command: args[0], locale: args[args.indexOf('--locale') + 1] });
}
async function listen(run = fakeRun, controller) {
  const workbench = createWorkbench(options, run, controller);
  const address = await workbench.listen();
  const base = `http://127.0.0.1:${address.port}`;
  const token = new URLSearchParams(new URL(workbench.url()).hash.slice(1)).get('token');
  const headers = { authorization: 'Bearer ' + token };
  const post = body => fetch(base + '/api/run', { method: 'POST', headers: { ...headers, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { workbench, base, token, headers, post };
}
async function completed(base, headers, id) {
  for (let i = 0; i < 100; i++) {
    const response = await fetch(base + '/api/jobs/' + id, { headers });
    assert.equal(response.status, 200);
    const job = await response.json();
    if (job.state !== 'running') return job;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('Job did not finish');
}
function rawRequest(base, headers, path = '/') {
  return new Promise((resolve, reject) => {
    const request = http.get(new URL(path, base), { headers }, response => {
      response.resume();
      response.once('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
  });
}

test('normal browser GETs need no Origin; no public endpoint reveals the capability', async () => {
  const { workbench, base, token, headers } = await listen();
  try {
    for (const path of ['/', '/app.js', '/style.css']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert(!(await response.text()).includes(token));
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    }
    for (const origin of [undefined, base]) {
      const response = await fetch(base + '/session', { headers: origin ? { origin } : {} });
      assert.equal(response.status, 404);
      assert(!(await response.text()).includes(token));
    }
    assert.equal((await fetch(base + '/api/state')).status, 401);
    assert.equal((await fetch(base + '/api/state', { headers: { authorization: 'Bearer ' + 'x'.repeat(64) } })).status, 401);
    assert.equal((await fetch(base + '/api/state', { headers: { authorization: 'Bearer ' + 'é'.repeat(64) } })).status, 401);
    const state = await fetch(base + '/api/state', { headers });
    assert.equal(state.status, 200);
    assert(!(await state.text()).includes(token));
  } finally { await workbench.close(); }
});

test('malicious Host, Origin and cross-site fetches are refused, even with a valid bearer', async () => {
  const { workbench, base, headers } = await listen();
  try {
    for (const path of ['/', '/api/state']) {
      for (const host of ['evil.example', 'localhost:' + new URL(base).port, '127.0.0.1:1', '127.0.0.1:' + new URL(base).port + '.evil.example']) {
        assert.equal(await rawRequest(base, { ...headers, host }, path), 403);
      }
      for (const origin of ['http://evil.example', 'null', 'http://127.0.0.1:1']) {
        assert.equal((await fetch(base + path, { headers: { ...headers, origin } })).status, 403);
      }
      assert.equal(await rawRequest(base, { ...headers, 'sec-fetch-site': 'cross-site' }, path), 403);
    }
    const body = JSON.stringify({ action: 'restore', confirm: 'restore', locale: 'zh-Hans' });
    assert.equal((await fetch(base + '/api/run', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body })).status, 403);
    assert.equal((await fetch(base + '/api/run', { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body })).status, 401);
    assert.equal((await fetch(base + '/api/run', { method: 'POST', headers: { ...headers, origin: base, 'content-type': 'text/plain' }, body })).status, 415);
  } finally { await workbench.close(); }
});

test('actions pass the selected locale to the CLI and retain exact confirmation', async () => {
  const calls = [];
  const { workbench, base, headers, post } = await listen(async (_config, args) => { calls.push(args); return fakeRun(_config, args); });
  try {
    for (const action of ['restore', 'switch', 'prepare', 'import-cache', 'launch']) {
      assert.equal((await post({ action, confirm: 'wrong', locale: 'zh-Hans' })).status, 400);
    }
    for (const locale of [undefined, 'en', null]) {
      assert.equal((await post({ action: 'switch', confirm: 'switch', locale })).status, 400);
    }
    const started = await post({ action: 'switch', confirm: 'switch', locale: 'zh-Hans' });
    assert.equal(started.status, 202);
    const job = await completed(base, headers, (await started.json()).id);
    assert.equal(job.state, 'done');
    assert.equal(job.locale, 'zh-Hans');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'switch');
    assert.equal(calls[0][calls[0].indexOf('--locale') + 1], 'zh-Hans');
  } finally { await workbench.close(); }
});

test('invalid JSON is a client error and does not create jobs', async () => {
  const { workbench, base, headers } = await listen();
  try {
    for (const [body, status] of [['{', 400], ['null', 400], ['[]', 400], ['x'.repeat(17 * 1024), 413]]) {
      const response = await fetch(base + '/api/run', { method: 'POST', headers: { ...headers, origin: base, 'content-type': 'application/json' }, body });
      assert.equal(response.status, status);
    }
    assert.deepEqual((await (await fetch(base + '/api/state', { headers })).json()).jobs, []);
  } finally { await workbench.close(); }
});

test('one active job, shared-controller busy refusal, bounded history, and awaited close', async () => {
  let finish;
  let busy = false;
  const calls = [];
  const controller = {
    state: () => ({ busy }), paths: async () => ({ locale: 'zh-Hant' }),
    execute: async (...args) => {
      calls.push(args);
      if (calls.length === 1) await new Promise(resolve => { finish = resolve; });
      return { ok: true };
    }
  };
  const { workbench, base, headers, post } = await listen(undefined, controller);
  try {
    const first = await post({ action: 'status', locale: 'zh-Hans' });
    const firstId = (await first.json()).id;
    assert.equal((await post({ action: 'status', locale: 'zh-Hans' })).status, 409);
    finish();
    await completed(base, headers, firstId);
    assert.deepEqual(calls[0], ['status', undefined, { locale: 'zh-Hans' }]);
    busy = true;
    assert.equal((await post({ action: 'status', locale: 'zh-Hans' })).status, 409);
    busy = false;
    for (let i = 0; i < 35; i++) {
      const started = await post({ action: 'status', locale: 'zh-Hans' });
      await completed(base, headers, (await started.json()).id);
    }
    const state = await (await fetch(base + '/api/state', { headers })).json();
    assert.equal(state.jobs.length, 32);
    assert.equal((await fetch(base + '/api/jobs/' + firstId, { headers })).status, 404);
  } finally { await workbench.close(); }
  assert.equal(workbench.address(), null);
  await workbench.close();
  await assert.rejects(workbench.listen(), /closed/);

  let release;
  const pending = await listen(undefined, { ...controller, execute: async () => new Promise(resolve => { release = resolve; }) });
  await pending.post({ action: 'status', locale: 'zh-Hans' });
  let closed = false;
  const closing = pending.workbench.close().then(() => { closed = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, false);
  release({ ok: true });
  await closing;
  assert.equal(closed, true);
});

test('concurrent opens share one server, actual auth method authorizes, cleanup allows reopen', async () => {
  const hooks = await ClaudeChinesePlugin({}, options);
  try {
    assert.equal(hooks.auth.provider, 'claude-desktop-3p-zh');
    assert.equal(hooks.auth.authorize, undefined);
    const [first, second, login] = await Promise.all([
      hooks.tool.claude_zh_workbench.execute({}).then(JSON.parse),
      hooks.tool.claude_zh_workbench.execute({}).then(JSON.parse),
      hooks.auth.methods[0].authorize()
    ]);
    assert.match(first.url, /^http:\/\/127\.0\.0\.1:\d+\/#token=[a-f0-9]{64}$/);
    assert.equal(second.url, first.url);
    assert.equal(login.url, first.url);
    assert.equal(login.method, 'code');
    assert.equal((await login.callback()).type, 'failed');
    const page = await fetch(first.url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /locale-select/);
    await closeWorkbenches();
    const reopened = JSON.parse(await hooks.tool.claude_zh_workbench.execute({}));
    assert.notEqual(new URL(reopened.url).hash, new URL(first.url).hash);
    assert.equal((await fetch(reopened.url)).status, 200);
  } finally { await closeWorkbenches(); }
});

test('listen and close are idempotent, including close while opening', async () => {
  const workbench = createWorkbench(options, fakeRun);
  assert.equal(workbench.listen(), workbench.listen());
  await workbench.close();
  assert.equal(workbench.address(), null);
  const neverOpened = createWorkbench(options, fakeRun);
  await neverOpened.close();
  await neverOpened.close();
  await assert.rejects(neverOpened.listen(), /closed/);
});

test('page uses fragment authentication and selected locale without editing JSON', async () => {
  const elements = new Map();
  const element = (properties = {}) => ({ textContent: '', disabled: true, children: [], append(...children) { this.children.push(...children); }, ...properties });
  for (const id of ['log', 'locale-select', 'paths', 'mode', 'guard']) elements.set(id, element());
  const button = element({ dataset: { action: 'switch', write: 'true' }, addEventListener(_event, callback) { this.click = callback; } });
  const token = 'a'.repeat(64);
  const calls = [];
  let confirmed = false, scrubbed = false;
  const context = {
    URLSearchParams, location: { hash: '#token=' + token, pathname: '/' },
    history: { replaceState(_state, _title, url) { assert.equal(url, '/'); scrubbed = true; } },
    document: { getElementById: id => elements.get(id), createElement: () => element(), querySelectorAll: () => [button] },
    window: { confirm: () => confirmed },
    setTimeout: callback => { callback(); },
    fetch: async (url, init) => {
      assert(scrubbed);
      calls.push({ url, init });
      assert.equal(init.headers.authorization, 'Bearer ' + token);
      return { ok: true, json: async () => url === '/api/state' ? { paths: { locale: 'zh-Hant', mode: 'copy', root: 'managed', allowWrites: true } } : url === '/api/run' ? { id: 'job' } : { state: 'done', result: { ok: true } } };
    }
  };
  await vm.runInNewContext(fs.readFileSync(new URL('../integrations/magpie/workbench/app.js', import.meta.url), 'utf8'), context);
  assert.equal(elements.get('locale-select').value, 'zh-Hant');
  await button.click();
  assert.equal(calls.length, 1, 'cancel must not submit a write');
  confirmed = true;
  elements.get('locale-select').value = 'zh-Hans';
  await button.click();
  assert.deepEqual(JSON.parse(calls.find(call => call.url === '/api/run').init.body), { action: 'switch', confirm: 'switch', locale: 'zh-Hans' });
  assert(!calls.some(call => call.url === '/session'));
  assert.equal(button.disabled, false);
});
