import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../integrations/magpie/controller.mjs';

test('default mode refuses protected install without creating copy or importing catalogs', async () => {
  const calls = [];
  const controller = createController({}, async (_, args) => {
    calls.push(args);
    if (args[0] === 'original-check') return { eligible: false, reason: 'protected MSIX' };
    throw new Error('Unexpected write');
  });
  await assert.rejects(controller.execute('install', 'install'), /protected MSIX/);
  assert.deepEqual(calls.map(args => args[0]), ['original-check']);
  await assert.rejects(controller.execute('prepare', 'prepare'), /explicit mode/);
});

test('original install imports missing resources only after compatibility and gateway checks', async () => {
  const calls = []; let plans = 0;
  const controller = createController({}, async (_, args) => {
    calls.push(args);
    if (args[0] === 'original-check') return { eligible: true };
    if (args[0] === 'detect-3p') return { configured3p: true, provider: 'gateway' };
    if (args[0] === 'original-plan' && ++plans === 1) throw new Error('Error: Missing compatible zh-Hant base/dynamic catalogs.');
    return { status: 'installed' };
  });
  await controller.execute('install', 'install', { locale: 'zh-Hant' });
  assert.deepEqual(calls.map(args => args[0]), ['original-check', 'detect-3p', 'original-plan', 'catalog', 'original-plan', 'original-install']);
  assert.equal(calls.at(-1).at(-3), 'zh-Hant');
  assert.equal(controller.state().locale, 'zh-Hans');
});

test('original installed apply plans from saved originals and imports once before applying', async () => {
  const calls = []; let plans = 0;
  const controller = createController({ stateDirectory: 'saved-state' }, async (_, args) => {
    calls.push(args);
    if (args[0] === 'original-check') return { eligible: true };
    if (args[0] === 'detect-3p') return { configured3p: true, provider: 'gateway' };
    if (args[0] === 'original-plan' && ++plans === 1) throw new Error('Error: Missing compatible zh-Hant base/dynamic catalogs. Import official resources first.');
    return { status: 'installed' };
  });
  await controller.execute('install', 'install', { locale: 'zh-Hant' });
  assert.deepEqual(calls.map(args => args[0]), ['original-check', 'detect-3p', 'original-plan', 'catalog', 'original-plan', 'original-install']);
  for (const args of calls.filter(args => args[0] === 'original-plan')) {
    assert.equal(args[args.indexOf('--state-dir') + 1], 'saved-state');
    assert.equal(args[args.indexOf('--locale') + 1], 'zh-Hant');
  }
});

test('original switch imports only after a preflight missing-catalog refusal and retries once', async () => {
  const calls = []; let switches = 0;
  const controller = createController({}, async (_, args) => {
    calls.push(args);
    if (args[0] === 'original-switch' && ++switches === 1) throw new Error('Error: Missing compatible zh-Hant base/dynamic catalogs.');
    return { status: 'installed', locale: 'zh-Hant' };
  });
  assert.equal((await controller.execute('switch', 'switch', { locale: 'zh-Hant' })).locale, 'zh-Hant');
  assert.deepEqual(calls.map(args => args[0]), ['original-switch', 'catalog', 'original-switch']);
  assert(calls.every(args => args.includes('zh-Hant')));
});

test('original apply and switch never import on drift or running-process failures', async () => {
  for (const action of ['install', 'switch']) {
    for (const message of ['Managed file changed outside this tool', 'Close the managed Claude copy', 'Missing compatible unrelated catalogs']) {
      const calls = [];
      const controller = createController({}, async (_, args) => {
        calls.push(args[0]);
        if (args[0] === 'original-check') return { eligible: true };
        if (args[0] === 'detect-3p') return { configured3p: true, provider: 'gateway' };
        throw new Error(message);
      });
      await assert.rejects(controller.execute(action, action), error => error.message === message);
      assert(!calls.includes('catalog'));
    }
  }
});

test('original missing catalogs remaining after import do not trigger duplicate imports or apply', async () => {
  for (const action of ['install', 'switch']) {
    const calls = [];
    const controller = createController({}, async (_, args) => {
      calls.push(args[0]);
      if (args[0] === 'original-check') return { eligible: true };
      if (args[0] === 'detect-3p') return { configured3p: true, provider: 'gateway' };
      if (args[0] === 'catalog') return { imported: [] };
      throw new Error('Missing compatible zh-Hans base/dynamic catalogs.');
    });
    await assert.rejects(controller.execute(action, action), /Missing compatible/);
    assert.equal(calls.filter(command => command === 'catalog').length, 1);
    assert(!calls.includes('original-install'));
  }
});

test('original recovery needs no discovery and explicit read-only setting is preserved', async () => {
  const calls = [];
  const controller = createController({ stateDirectory: 'saved-state' }, async (_, args) => { calls.push(args); return { status: 'restored' }; });
  await controller.execute('restore', 'restore');
  assert.deepEqual(calls, [['original-restore', '--state-dir', 'saved-state']]);
  const readonly = createController({ allowWrites: false }, async () => { throw new Error('must not execute'); });
  await assert.rejects(readonly.execute('install', 'install'), /Writes disabled/);
});
