import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotInspectorBrowser, closeNewInspectorTab, tidyInspectorBrowser } from '../lib/macos-browser.mjs';

test('browser snapshot exposes only numeric identities and retains an unavailable permission state', () => {
  assert.deepEqual(snapshotInspectorBrowser(() => '123|456|11,22,\n'), { state: 'captured', frontPid: 123, chromePid: 456, tabIds: [11, 22] });
  assert.deepEqual(snapshotInspectorBrowser(() => '123|0|'), { state: 'captured', frontPid: 123, chromePid: 0, tabIds: [] });
  assert.deepEqual(snapshotInspectorBrowser(() => '123|unavailable|'), { state: 'unavailable', frontPid: 123 });
  assert.deepEqual(snapshotInspectorBrowser(() => { throw new Error('not authorized'); }), { state: 'unavailable' });
  assert.equal(snapshotInspectorBrowser(() => '123|456|not-a-number').state, 'unavailable');
});

test('cleanup refuses an unavailable baseline and reports only bounded outcomes', () => {
  let called = false;
  assert.deepEqual(closeNewInspectorTab({ state: 'unavailable' }, 123, () => { called = true; }), { state: 'unavailable', closed: 0 });
  assert.equal(called, false);
  const baseline = { state: 'captured', frontPid: 123, chromePid: 456, tabIds: [11, 22] };
  assert.deepEqual(closeNewInspectorTab(baseline, 123, () => '1'), { state: 'closed-new-tab', closed: 1 });
  assert.deepEqual(closeNewInspectorTab(baseline, 123, () => '0'), { state: 'no-unique-new-tab', closed: 0 });
  assert.deepEqual(closeNewInspectorTab(baseline, 123, () => '2'), { state: 'unavailable', closed: 0 });
  assert.equal(closeNewInspectorTab(baseline, 123, () => { throw new Error('denied'); }).closed, 0);
});

test('tidy retries delayed browser launch and stops after closing exactly one new tab', async () => {
  const baseline = { state: 'captured', frontPid: 123, chromePid: 456, tabIds: [11] };
  let calls = 0, waits = 0;
  const result = await tidyInspectorBrowser(baseline, 123, { exec: () => ++calls === 1 ? '0|0|0' : '1|1|1', verifyBrowser: () => baseline, sleep: async () => { waits++; } });
  assert.equal(result.closed, 1);
  assert.equal(result.baselinePreserved, true);
  assert.equal(result.focusRestored, true);
  assert.equal(calls, 2);
  assert.equal(waits, 1);
  assert.equal((await tidyInspectorBrowser({ state: 'unavailable' }, 123, { exec: () => { throw new Error('must not run'); } })).state, 'unavailable');
});
