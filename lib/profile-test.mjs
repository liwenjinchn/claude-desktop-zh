import fs from 'node:fs';
import path from 'node:path';
import { assertPlainDirectory, readJSON, writeJSON } from './common.mjs';
import { detect3p, validateGateway } from './install.mjs';
import { inventoryProfile, copySnapshot, compareSnapshot, inspectProfile } from './profile-snapshot.mjs';

export const EXIT = Object.freeze({ failed: 1, waiting: 2, blocked: 3 });
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const norm = value => path.resolve(value).toLowerCase();
function pathIdentity(value) {
  let current = path.resolve(value), suffix = [];
  const identities = [];
  const exists = fs.existsSync(current);
  while (!fs.existsSync(current)) { suffix.unshift(path.basename(current)); const parent = path.dirname(current); if (parent === current) fail('TESTER_PATH_IDENTITY'); current = parent; }
  const canonical = path.join(fs.realpathSync.native(current), ...suffix);
  let leaf = null;
  while (true) {
    const stat = fs.statSync(current, { bigint: true });
    if (!stat.isDirectory() || !stat.ino) fail('TESTER_PATH_IDENTITY');
    const id = `${stat.dev}:${stat.ino}`;
    identities.push(id);
    if (exists && leaf === null) leaf = id;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return { canonical, identities, leaf };
}
export function canonicalLocation(value) { return pathIdentity(value).canonical; }
function overlaps(a, b) {
  const left = pathIdentity(a), right = pathIdentity(b), l = norm(left.canonical), r = norm(right.canonical);
  return l === r || l.startsWith(r + path.sep) || r.startsWith(l + path.sep) ||
    (left.leaf !== null && right.identities.includes(left.leaf)) || (right.leaf !== null && left.identities.includes(right.leaf));
}
const step = (status, detail) => ({ status, ...(detail === undefined ? {} : { detail }) });
function plain(directory) {
  try { assertPlainDirectory(directory); if (!fs.statSync(directory).isDirectory()) fail('TESTER_DIRECTORY'); }
  catch { fail('TESTER_DIRECTORY'); }
}
export function validateOptions(options) {
  const result = { ...options };
  if (!['Preflight', 'Snapshot'].includes(result.mode) || !['zh-Hans', 'zh-Hant'].includes(result.locale)) fail('TESTER_OPTIONS');
  for (const key of ['source', 'profile', 'catalogDirectory', 'outputParent']) {
    if (typeof result[key] !== 'string' || !result[key].trim()) fail('TESTER_OPTIONS');
    result[key] = path.resolve(result[key]);
  }
  if (overlaps(result.source, result.profile) || overlaps(result.outputParent, result.source) || overlaps(result.outputParent, result.profile) || overlaps(result.outputParent, result.catalogDirectory)) fail('TESTER_PATH_OVERLAP');
  for (const key of ['source', 'profile', 'catalogDirectory']) plain(result[key]);
  try {
    assertPlainDirectory(result.outputParent);
    const exe = fs.lstatSync(path.join(result.source, 'claude.exe'));
    if (!exe.isFile() || exe.isSymbolicLink()) fail('TESTER_SOURCE');
  } catch { fail('TESTER_SOURCE'); }
  for (const key of ['timeoutSeconds', 'pollSeconds', 'stableSeconds']) if (!Number.isInteger(result[key]) || result[key] < 1 || result[key] > 86400) fail('TESTER_OPTIONS');
  if (result.stableSeconds < 2 || result.pollSeconds > 60) fail('TESTER_OPTIONS');
  return result;
}
export function requireQuiescent(sample) {
  if (!sample || sample.schema !== 1 || sample.ok !== true || !Number.isInteger(sample.blockedCount) || !Number.isInteger(sample.unknownCount) || sample.blockedCount < 0 || sample.unknownCount < 0) fail('TESTER_PROCESS_UNKNOWN');
  if (sample.blockedCount || sample.unknownCount) fail('TESTER_PROCESS_ACTIVE');
}
export async function waitForQuiescence({ probe, timeoutSeconds, pollSeconds, stableSeconds, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), onWait = () => {} }) {
  const started = now();
  let quietSince = null;
  while (true) {
    const sample = probe();
    try { requireQuiescent(sample); }
    catch (error) {
      if (error.code !== 'TESTER_PROCESS_ACTIVE') throw error;
      quietSince = null;
    }
    const current = now();
    if (!sample.blockedCount && !sample.unknownCount) {
      quietSince ??= current;
      if (current - quietSince >= stableSeconds * 1000) return sample;
    }
    if (current - started >= timeoutSeconds * 1000) fail('TESTER_WAIT_TIMEOUT');
    onWait({ blockedCount: sample.blockedCount, unknownCount: sample.unknownCount });
    await sleep(Math.min(pollSeconds * 1000, Math.max(1, timeoutSeconds * 1000 - (current - started))));
  }
}
function applicationBytes(source) {
  let bytes = 0;
  function walk(directory) {
    plain(directory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name), stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) fail('TESTER_APPLICATION_LINK');
      if (stat.isDirectory()) walk(file);
      else if (stat.isFile()) bytes += stat.size;
      else fail('TESTER_APPLICATION_SPECIAL_FILE');
    }
  }
  walk(source);
  return bytes;
}
function validateSnapshotProfile(directory) {
  try {
    const config = readJSON(path.join(directory, 'config.json'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) fail('TESTER_PROFILE_SCHEMA');
    const detected = detect3p(directory);
    if (detected.configured3p !== true || detected.provider !== 'gateway') fail('TESTER_PROFILE_SCHEMA');
    validateGateway(readJSON(detected.profilePath));
  } catch { fail('TESTER_PROFILE_SCHEMA'); }
}
function publicSummary(manifest) {
  return { files: manifest.entries.length, bytes: manifest.entries.reduce((sum, entry) => sum + entry.bytes, 0), directories: manifest.dirs.length, exclusions: manifest.exclusions };
}
function markdown(report) {
  const lines = ['# Profile reuse test report', '', `Mode: ${report.mode}`, `Exit code: ${report.exitCode}`, '', '| Check | Result |', '| --- | --- |'];
  for (const [name, value] of Object.entries(report.checks)) lines.push(`| ${name} | ${value.status} |`);
  lines.push('', 'Snapshot and data-structure checks do not establish UI behavior.', 'Migrated-profile launch is blocked: no verified boundary prevents task recovery, remote/CLI workspace access and protocol registration.', 'Settings, session list and history display require a later isolated desktop test. Task execution is outside this test.', 'Private snapshots are retained; do not upload the private directory or launch the copied executable directly.', 'No process is stopped, no permissions are changed, and the original application is not launched.', '');
  if (report.error) lines.push(`Error code: ${report.error}`, '');
  return lines.join('\n');
}
export async function runProfileTest(input, dependencies) {
  const options = validateOptions(input);
  const { probe, cli, now = Date.now, sleep, log = () => {} } = dependencies;
  fs.mkdirSync(options.outputParent, { recursive: true });
  plain(options.outputParent);
  const root = fs.mkdtempSync(path.join(options.outputParent, 'profile-reuse-'));
  const privateDirectory = path.join(root, 'private');
  fs.mkdirSync(privateDirectory);
  writeJSON(path.join(root, 'owner.json'), { schema: 1, kind: 'claude-profile-reuse-test', root, createdAt: new Date().toISOString() });
  const report = {
    schema: 1, checkpoint: 'a5fd286', mode: options.mode, createdAt: new Date().toISOString(), launchAttempted: false,
    paths: { source: options.source, profile: options.profile, run: root },
    exitCode: EXIT.blocked,
    checks: {
      compatibility: step('not_run'), processExit: step('not_run'), fileSnapshot: step('not_run'), dataStructure: step('not_run'), databaseIntegrity: step('not_run'), signInState: step('not_run'),
      localizedCopy: step('not_run'), migratedData: step('not_run'), originalIncludedFilesUnchanged: step('not_run'), excludedOriginalData: step('not_run', 'VM, CLI, caches, logs, runtime locks and worker credentials are excluded.'), registryUnchanged: step('not_run'),
      launchSafety: step('blocked', 'Unverified task recovery, remote/CLI/workspace access and protocol registration boundary.'),
      window: step('not_run'), settingsDisplayed: step('not_run'), sessionsDisplayed: step('not_run'), historyDisplayed: step('not_run'), taskResume: step('out_of_scope')
    }
  };
  const persist = () => { writeJSON(path.join(root, 'report.json'), report); fs.writeFileSync(path.join(root, 'report.md'), markdown(report)); };
  const phase = name => { report.phase = name; persist(); log(name); };
  let baseline, manifest;
  const sample = () => probe({ ...options, root, privateDirectory });
  const assertQuiescent = () => requireQuiescent(sample());
  const compareRegistry = current => {
    if (!baseline?.registry || !current?.registry || !/^[a-f0-9]{64}$/.test(baseline.registry.protocol) || !/^[a-f0-9]{64}$/.test(baseline.registry.startup) || !/^[a-f0-9]{64}$/.test(current.registry.protocol) || !/^[a-f0-9]{64}$/.test(current.registry.startup)) fail('TESTER_REGISTRY_UNKNOWN');
    const matches = baseline.registry.protocol === current.registry.protocol && baseline.registry.startup === current.registry.startup;
    report.checks.registryUnchanged = step(matches ? 'passed' : 'failed', 'Observed HKCU Claude protocol and entire HKCU Run value hashes; a change does not establish its cause.');
    if (!matches) fail('TESTER_REGISTRY_CHANGED');
  };
  persist();
  try {
    phase('preflight');
    baseline = sample();
    try { requireQuiescent(baseline); } catch (error) { if (error.code !== 'TESTER_PROCESS_ACTIVE') throw error; }
    report.processes = { blockedCount: baseline.blockedCount, unknownCount: baseline.unknownCount };
    applicationBytes(options.source);
    const planned = cli('plan', ['--source', options.source, '--catalog-dir', options.catalogDirectory, '--locale', options.locale], privateDirectory);
    if (!planned?.patchable || planned.locale !== options.locale) fail('TESTER_PLAN_INVALID');
    report.application = { asarSHA256: planned.asarSHA256, locale: planned.locale };
    report.checks.compatibility = step('passed');
    if (options.mode === 'Preflight') {
      report.checks.processExit = step(baseline.blockedCount || baseline.unknownCount ? 'blocked' : 'not_run');
      compareRegistry(sample());
      report.exitCode = baseline.blockedCount || baseline.unknownCount ? EXIT.waiting : EXIT.blocked;
      phase('preflight_complete');
      return { root, report, exitCode: report.exitCode };
    }
    phase('waiting_for_user_exit');
    log('Waiting for the user to exit Claude and workers. No process will be stopped.');
    await waitForQuiescence({ probe: sample, ...options, now, sleep, onWait: counts => log(`Waiting: ${counts.blockedCount} related processes; ${counts.unknownCount} unknown.`) });
    report.checks.processExit = step('passed');
    phase('snapshot');
    assertQuiescent();
    const preview = inventoryProfile(options.profile);
    const profileBytes = preview.entries.reduce((sum, entry) => sum + entry.bytes, 0);
    const needed = applicationBytes(options.source) + profileBytes * 2 + 64 * 1024 * 1024;
    const space = fs.statfsSync(root, { bigint: true });
    if (space.bavail * space.bsize < BigInt(needed)) fail('TESTER_DISK_SPACE');
    manifest = copySnapshot(options.profile, path.join(privateDirectory, 'snapshot'), { assertQuiescent, requiredFreeBytes: needed });
    writeJSON(path.join(privateDirectory, 'snapshot-manifest.json'), manifest);
    report.snapshot = publicSummary(manifest);
    report.checks.fileSnapshot = step('passed');
    validateSnapshotProfile(path.join(privateDirectory, 'snapshot'));
    report.structure = inspectProfile(path.join(privateDirectory, 'snapshot'));
    report.checks.dataStructure = step('passed', 'Recognized 3p gateway profile; JSON/JSONL syntax only, not database or UI validation.');
    phase('prepare_localized_copy');
    assertQuiescent();
    const gatewayFile = path.join(privateDirectory, 'offline-gateway.json');
    writeJSON(gatewayFile, { inferenceProvider: 'gateway', inferenceGatewayBaseUrl: 'http://127.0.0.1:9', inferenceGatewayApiKey: 'offline-test-placeholder' });
    const managed = path.join(privateDirectory, 'managed');
    cli('prepare-copy', ['--source', options.source, '--destination', managed, '--catalog-dir', options.catalogDirectory, '--locale', options.locale, '--gateway-profile', gatewayFile], privateDirectory);
    assertQuiescent();
    const status = cli('status', ['--root', managed], privateDirectory);
    if (status?.status !== 'installed' || status.intact !== true || status.locale !== options.locale) fail('TESTER_COPY_INVALID');
    report.checks.localizedCopy = step('passed');
    // These exact paths were just created by prepare-copy inside this unique run.
    // Preserve the generated profile instead of deleting or merging private data.
    const generated = path.resolve(managed, 'local', 'Claude-3p');
    const preserved = path.resolve(managed, 'generated-profile');
    if (!generated.startsWith(path.resolve(root) + path.sep) || !preserved.startsWith(path.resolve(root) + path.sep) || fs.existsSync(preserved)) fail('TESTER_OWNERSHIP');
    plain(generated); plain(managed);
    fs.renameSync(generated, preserved);
    const migrated = copySnapshot(path.join(privateDirectory, 'snapshot'), generated, { assertQuiescent });
    if (!compareSnapshot(generated, manifest).matches || migrated.entries.length !== manifest.entries.length) fail('TESTER_MIGRATION_MISMATCH');
    // Defer locale/configuration edits until a verified UI launch boundary exists.
    report.checks.migratedData = step('passed');
    phase('verify_original');
    assertQuiescent();
    const comparison = compareSnapshot(options.profile, manifest);
    report.checks.originalIncludedFilesUnchanged = step(comparison.matches ? 'passed' : 'failed');
    if (!comparison.matches) fail('TESTER_ORIGINAL_CHANGED');
    compareRegistry(sample());
    report.exitCode = EXIT.blocked;
    phase('blocked_before_launch');
    return { root, report, exitCode: report.exitCode };
  } catch (error) {
    const code = typeof error.code === 'string' && /^(?:TESTER|PROFILE)_[A-Z_]+$/.test(error.code) ? error.code : 'TESTER_OPERATION_FAILED';
    report.error = code;
    report.exitCode = code === 'TESTER_WAIT_TIMEOUT' ? EXIT.waiting : EXIT.failed;
    const key = ({ preflight: 'compatibility', waiting_for_user_exit: 'processExit', snapshot: report.checks.fileSnapshot.status === 'passed' ? 'dataStructure' : 'fileSnapshot', prepare_localized_copy: report.checks.localizedCopy.status === 'passed' ? 'migratedData' : 'localizedCopy', verify_original: 'originalIncludedFilesUnchanged' })[report.phase];
    if (key && report.checks[key].status !== 'passed') report.checks[key] = step('failed', code);
    report.phase = 'failed';
    persist();
    return { root, report, exitCode: report.exitCode };
  } finally { persist(); }
}
