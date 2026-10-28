import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runProfileTest, validateOptions, waitForQuiescence, requireQuiescent } from '../lib/profile-test.mjs';
import { parseArguments, createDependencies } from '../scripts/test-profile-reuse.mjs';
import { saveCatalog } from '../lib/catalogs.mjs';
import { writeJSON } from '../lib/common.mjs';

const quiet = () => ({ schema: 1, ok: true, blockedCount: 0, unknownCount: 0, registry: { protocol: 'a'.repeat(64), startup: 'b'.repeat(64) } });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), '3p-zh-tester-'));
  t.after(() => { assert(root.startsWith(fs.realpathSync(os.tmpdir()))); fs.rmSync(root, { recursive: true, force: true }); });
  const options = { mode: 'Snapshot', source: path.join(root, 'source'), profile: path.join(root, 'profile'), catalogDirectory: path.join(root, 'catalogs'), outputParent: path.join(root, 'results'), locale: 'zh-Hans', timeoutSeconds: 5, pollSeconds: 1, stableSeconds: 2 };
  for (const key of ['source', 'profile', 'catalogDirectory']) fs.mkdirSync(options[key]);
  fs.writeFileSync(path.join(options.source, 'claude.exe'), 'fixture-only, not executable');
  writeJSON(path.join(options.profile, 'config.json'), { locale: 'en-US', privateSetting: 'PRIVATE_SETTING' });
  writeJSON(path.join(options.profile, 'claude_desktop_config.json'), { deploymentMode: '3p', preferences: { ccdScheduledTasksEnabled: true } });
  const id = '00000000-0000-4000-8000-000000000001';
  writeJSON(path.join(options.profile, 'configLibrary/_meta.json'), { appliedId: id });
  writeJSON(path.join(options.profile, 'configLibrary', id + '.json'), { inferenceProvider: 'gateway', inferenceGatewayBaseUrl: 'http://127.0.0.1:9', inferenceGatewayApiKey: 'PRIVATE_GATEWAY_KEY' });
  const commands = [];
  let clock = 0;
  const dependencies = {
    probe: quiet,
    now: () => clock,
    sleep: async ms => { clock += ms; },
    cli: (command, args) => {
      commands.push(command);
      if (command === 'plan') return { patchable: true, locale: 'zh-Hans' };
      if (command === 'prepare-copy') {
        const managed = args[args.indexOf('--destination') + 1];
        writeJSON(path.join(managed, 'local/Claude-3p/config.json'), { locale: 'zh-Hans' });
        return { status: 'installed' };
      }
      if (command === 'status') return { status: 'installed', intact: true, locale: 'zh-Hans' };
      throw new Error('Unexpected operation');
    }
  };
  return { root, options, dependencies, commands };
}
test('wait resets quiet interval when an app or worker returns', async () => {
  let clock = 0, calls = 0;
  const activeAt = new Set([0, 2000]);
  await waitForQuiescence({ probe: () => ({ ...quiet(), blockedCount: activeAt.has(clock) ? 1 : 0 }), now: () => clock, sleep: async ms => { clock += ms; calls++; }, pollSeconds: 1, stableSeconds: 2, timeoutSeconds: 8 });
  assert.equal(clock, 5000); assert.equal(calls, 5);
});
test('unknown enumeration never establishes quiescence', async () => {
  assert.throws(() => requireQuiescent({ schema: 1, ok: true, blockedCount: 0 }), /TESTER_PROCESS_UNKNOWN/);
  await assert.rejects(waitForQuiescence({ probe: () => null, now: () => 0, sleep: async () => assert.fail('must not wait'), pollSeconds: 1, stableSeconds: 2, timeoutSeconds: 3 }), /TESTER_PROCESS_UNKNOWN/);
});
test('preflight does not snapshot or parse a live private profile', async t => {
  const { options, dependencies, commands } = fixture(t);
  options.mode = 'Preflight';
  fs.writeFileSync(path.join(options.profile, 'config.json'), 'PRIVATE_INVALID_JSON');
  dependencies.probe = () => ({ ...quiet(), blockedCount: 4 });
  const result = await runProfileTest(options, dependencies);
  assert.equal(result.exitCode, 2);
  assert.deepEqual(commands, ['plan']);
  assert.equal(result.report.checks.processExit.status, 'blocked');
  assert.equal(result.report.checks.fileSnapshot.status, 'not_run');
  assert(!fs.existsSync(path.join(result.root, 'private/snapshot')));
  assert(!JSON.stringify(result.report).includes('PRIVATE_INVALID_JSON'));
});
test('snapshot mode preserves data but cannot claim UI or task execution success', async t => {
  const { options, dependencies, commands } = fixture(t);
  const original = fs.readFileSync(path.join(options.profile, 'config.json'));
  const result = await runProfileTest(options, dependencies);
  assert.equal(result.exitCode, 3);
  assert.deepEqual(commands, ['plan', 'prepare-copy', 'status']);
  for (const key of ['processExit', 'fileSnapshot', 'dataStructure', 'localizedCopy', 'migratedData', 'originalIncludedFilesUnchanged', 'registryUnchanged']) assert.equal(result.report.checks[key].status, 'passed', key);
  for (const key of ['window', 'settingsDisplayed', 'sessionsDisplayed', 'historyDisplayed']) assert.equal(result.report.checks[key].status, 'not_run', key);
  assert.equal(result.report.checks.taskResume.status, 'out_of_scope');
  assert.equal(result.report.launchAttempted, false);
  assert.equal(result.report.checks.launchSafety.status, 'blocked');
  assert.deepEqual(fs.readFileSync(path.join(result.root, 'private/managed/local/Claude-3p/config.json')), original);
  assert.deepEqual(fs.readFileSync(path.join(options.profile, 'config.json')), original);
  assert(!JSON.stringify(result.report).includes('PRIVATE_SETTING'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.root, 'report.json'))).exitCode, 3);
});
test('timeout leaves a report and does not create a snapshot or localized copy', async t => {
  const { options, dependencies, commands } = fixture(t);
  dependencies.probe = () => ({ ...quiet(), blockedCount: 1 });
  const result = await runProfileTest(options, dependencies);
  assert.equal(result.exitCode, 2);
  assert.equal(result.report.error, 'TESTER_WAIT_TIMEOUT');
  assert(!fs.existsSync(path.join(result.root, 'private/snapshot')));
  assert.deepEqual(commands, ['plan']);
});
test('a worker returning during snapshot fails closed without launching or preparing', async t => {
  const { options, dependencies, commands } = fixture(t);
  let calls = 0;
  dependencies.probe = () => ({ ...quiet(), blockedCount: ++calls > 6 ? 1 : 0 });
  const result = await runProfileTest(options, dependencies);
  assert.equal(result.exitCode, 1);
  assert.match(result.report.error, /(?:PROFILE_NOT_QUIESCENT|TESTER_PROCESS_ACTIVE)/);
  assert.deepEqual(commands, ['plan']);
  assert.equal(result.report.launchAttempted, false);
});
test('registry changes are recorded as failure rather than hidden by successful copy', async t => {
  const { options, dependencies } = fixture(t);
  let calls = 0;
  dependencies.probe = () => {
    const result = quiet();
    if (++calls > 1) result.registry.protocol = 'c'.repeat(64);
    return result;
  };
  const result = await runProfileTest(options, dependencies);
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.error, 'TESTER_REGISTRY_CHANGED');
  assert.equal(result.report.checks.registryUnchanged.status, 'failed');
});
test('arbitrary native and JSON errors do not leak contents in reports', async t => {
  const { options, dependencies } = fixture(t);
  dependencies.cli = () => { throw new Error('PRIVATE_SECRET_AND_CONVERSATION'); };
  const result = await runProfileTest(options, dependencies);
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.error, 'TESTER_OPERATION_FAILED');
  assert(!fs.readFileSync(path.join(result.root, 'report.json'), 'utf8').includes('PRIVATE_SECRET'));
  assert(!fs.readFileSync(path.join(result.root, 'report.md'), 'utf8').includes('PRIVATE_SECRET'));
});
test('source/profile/output overlap and existing linked ancestors are rejected before writes', t => {
  const { root, options } = fixture(t);
  assert.throws(() => validateOptions({ ...options, outputParent: path.join(options.profile, 'test') }), /TESTER_PATH_OVERLAP/);
  assert.throws(() => validateOptions({ ...options, outputParent: root }), /TESTER_PATH_OVERLAP/);
  assert.throws(() => validateOptions({ ...options, source: options.profile }), /TESTER_PATH_OVERLAP/);
  const link = path.join(root, 'linked');
  try { fs.symlinkSync(options.profile, link, 'junction'); } catch { t.skip('Junction not available'); return; }
  assert.throws(() => validateOptions({ ...options, outputParent: path.join(link, 'test') }), /TESTER_(?:SOURCE|PATH_OVERLAP)/);
});
test('argument parser rejects duplicate/unknown flags and does not offer launch bypass', () => {
  assert.throws(() => parseArguments(['--source', 'x', '--source', 'y']), /TESTER_ARGUMENTS/);
  assert.throws(() => parseArguments(['--force-launch', 'true']), /TESTER_ARGUMENTS/);
  assert.throws(() => parseArguments(['--timeout-seconds', '1.5']), /TESTER_ARGUMENTS/);
  assert.equal(parseArguments(['--source', 'x', '--profile', 'y']).mode, 'Preflight');
});
test('an empty or unrecognized profile cannot pass the business data-structure gate', async t => {
  const { options, dependencies, commands } = fixture(t);
  fs.writeFileSync(path.join(options.profile, 'claude_desktop_config.json'), '{}');
  const result = await runProfileTest(options, dependencies);
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.error, 'TESTER_PROFILE_SCHEMA');
  assert.equal(result.report.checks.fileSnapshot.status, 'passed');
  assert.equal(result.report.checks.dataStructure.status, 'failed');
  assert.deepEqual(commands, ['plan']);
});
test('real CLI plan, copy and status integrate with private profile migration without executing the fixture', { skip: process.platform !== 'win32' }, async t => {
  const { options, dependencies } = fixture(t);
  const resources = path.join(options.source, 'resources');
  const english = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => ['key' + i, 'English']));
  const langs = '["en-US","de-DE","pt-BR","id-ID"]';
  fs.mkdirSync(path.join(resources, 'ion-dist/assets'), { recursive: true });
  fs.mkdirSync(path.join(resources, 'ion-dist/i18n/dynamic'), { recursive: true });
  fs.writeFileSync(path.join(resources, 'app.asar'), 'inert fixture archive');
  fs.writeFileSync(path.join(resources, 'ion-dist/assets/runtime.js'), `/* "spa:locale" */const a=${langs},b=${langs};function Zz(){let e=[];try{if(typeof document<"u"){let t=document.querySelector('meta[name="i18n-catalogs"]')}}catch{}return e}function Load(e){for(let[t,n,r]of Zz())if(t===e)return{base:"unused"}}`);
  fs.writeFileSync(path.join(resources, 'ion-dist/assets/selector.js'), 'const names={"en-US":{name:"English (United States)",localName:"English (United States)"},};');
  writeJSON(path.join(resources, 'ion-dist/i18n/en-US.json'), english);
  writeJSON(path.join(resources, 'ion-dist/i18n/dynamic/en-US.json'), { hello: 'Hello' });
  saveCatalog(options.catalogDirectory, 'zh-Hans', 'base', Buffer.from(JSON.stringify(Object.fromEntries(Object.keys(english).map(key => [key, '中文'])))), { source: 'fixture' });
  saveCatalog(options.catalogDirectory, 'zh-Hans', 'dynamic', Buffer.from('{"hello":"你好"}'), { source: 'fixture' });
  dependencies.cli = createDependencies().cli;
  const result = await runProfileTest(options, dependencies);
  assert.equal(result.exitCode, 3, result.report.error);
  assert.equal(result.report.checks.localizedCopy.status, 'passed');
  assert.equal(result.report.checks.migratedData.status, 'passed');
  assert.equal(result.report.launchAttempted, false);
  const managed = path.join(result.root, 'private/managed');
  assert(fs.existsSync(path.join(managed, 'app/resources/ion-dist/i18n/zh-Hans.json')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(managed, 'local/Claude-3p/config.json'))).locale, 'en-US');
  assert(!fs.existsSync(managed + '.3p-zh-lock'));
});
