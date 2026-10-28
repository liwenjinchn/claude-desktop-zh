import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import childProcess from 'node:child_process';
import { inventoryProfile, copySnapshot, inspectProfile, compareSnapshot } from '../lib/profile-snapshot.mjs';

const PRIVATE = 'fixture-private-title-body-session-credential';
// Windows native realpath can change drive/path casing. Match the same
// physical fixture in both the lexical and canonical identity passes.
const sameFixturePath = (input, expected) => process.platform === 'win32'
  ? path.resolve(String(input)).toLowerCase() === path.resolve(expected).toLowerCase()
  : String(input) === expected;
// Alias/drift tests model filesystem identities, including their canonical
// lookup. Use deterministic IDs for every directory in those tests so native
// Windows path spelling and file-ID behavior cannot invalidate the model.
function mockDirectoryIdentities(t, identityPath = key => key, revision = () => 0n) {
  const lstat = fs.lstatSync, realpath = fs.realpathSync.native;
  const ids = new Map();
  const canonicalKey = input => {
    const resolved = path.normalize(realpath(input));
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  t.mock.method(fs, 'lstatSync', (input, settings) => {
    const stat = lstat(input, settings);
    if (!settings?.bigint || !stat.isDirectory() || stat.isSymbolicLink()) return stat;
    const key = canonicalKey(input), identity = identityPath(key);
    if (!ids.has(identity)) ids.set(identity, BigInt(ids.size + 1));
    const ino = ids.get(identity) + revision(key);
    return new Proxy(stat, { get(target, property) {
      if (property === 'dev') return 1n;
      if (property === 'ino') return ino;
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
  });
  return canonicalKey;
}
function fixture(t) {
  // Canonicalize the platform temp parent so a machine's /tmp alias is not
  // mistaken for a link introduced inside a profile fixture.
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), '3p-profile-snapshot-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), destination = path.join(root, 'snapshot');
  fs.mkdirSync(source);
  function put(relative, content = '') {
    const file = path.join(source, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  }
  return { root, source, destination, put };
}
function code(expected) {
  return error => {
    assert.equal(error.code, expected);
    assert.equal(error.message, expected);
    for (const property of Object.getOwnPropertyNames(error)) {
      assert.equal(String(error[property]).includes(PRIVATE), false);
    }
    assert.equal(Object.hasOwn(error, 'cause'), false);
    assert.deepEqual(Object.keys(error), ['code']);
    return true;
  };
}
function assertPublic(result) {
  const encoded = JSON.stringify(result);
  assert.equal(encoded.includes(PRIVATE), false);
  function walk(value) {
    for (const item of Object.values(value)) {
      if (item && typeof item === 'object') walk(item);
      else assert.ok(typeof item === 'number' || typeof item === 'boolean');
    }
  }
  walk(result);
}
function directoryLink(t, target, link) {
  try { fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip('Fixture directory links are unavailable under the current sandbox');
      return false;
    }
    throw error;
  }
  return true;
}

test('inventory retains SQLite sidecars and LevelDB while aggregating fixed exclusion groups', t => {
  const { source, put } = fixture(t);
  for (const name of ['Cookies', 'Cookies-wal', 'Cookies-shm', 'Cookies-journal',
    'db.sqlite-wal', 'db.sqlite-shm', 'db.sqlite-journal',
    'Local Storage/leveldb/CURRENT', 'Local Storage/leveldb/MANIFEST-000001',
    'Local Storage/leveldb/000003.log', 'Local Storage/leveldb/000004.ldb',
    'IndexedDB/site.leveldb/000005.log', 'ordinary.log']) put(name, name);
  const excluded = [
    ['vm_bundles/large.bin', 'largeComponents'], ['claude-code/runtime.bin', 'largeComponents'],
    ['Cache/data', 'caches'], ['logs/log', 'caches'], ['Code Cache/cache', 'caches'],
    ['LOCK', 'runtimeLocks'], ['Local Storage/leveldb/LOCK', 'runtimeLocks'], ['SingletonLock', 'runtimeLocks'],
    ['ccd-session-secrets/key', 'workerCredentials'], [`nested/host-creds-${PRIVATE}`, 'workerCredentials']
  ];
  for (const [name] of excluded) put(name, PRIVATE);
  fs.mkdirSync(path.join(source, 'empty'));
  const manifest = inventoryProfile(source);
  assert.equal(manifest.version, 1);
  assert.equal(manifest.entries.length, 13);
  assert.ok(manifest.dirs.includes('empty'));
  assert.equal(manifest.entries.some(entry => excluded.some(([name]) => name === entry.relative)), false);
  assert.deepEqual(manifest.exclusions.largeComponents, { files: 2, dirs: 2, bytes: 2 * Buffer.byteLength(PRIVATE) });
  assert.deepEqual(manifest.exclusions.caches, { files: 3, dirs: 3, bytes: 3 * Buffer.byteLength(PRIVATE) });
  assert.deepEqual(manifest.exclusions.runtimeLocks, { files: 3, dirs: 0, bytes: 3 * Buffer.byteLength(PRIVATE) });
  assert.deepEqual(manifest.exclusions.workerCredentials, { files: 2, dirs: 1, bytes: 2 * Buffer.byteLength(PRIVATE) });
  for (const entry of manifest.entries) {
    assert.deepEqual(Object.keys(entry), ['relative', 'bytes', 'sha256']);
    assert.equal(entry.bytes, Buffer.byteLength(entry.relative));
    assert.equal(entry.sha256, createHash('sha256').update(entry.relative).digest('hex'));
  }
  assertPublic(manifest.exclusions);
});

test('group options only toggle the four fixed exclusions', t => {
  const { source, put } = fixture(t);
  put('Cache/data', PRIVATE); put('LOCK', PRIVATE); put('data.sqlite-wal', PRIVATE);
  assert.equal(inventoryProfile(source, { excludeGroups: { caches: false } }).entries.length, 2);
  assert.equal(inventoryProfile(source, { excludeGroups: { runtimeLocks: false } }).entries.length, 2);
  assert.throws(() => inventoryProfile(source, { excludeGroups: { arbitraryPath: true } }), code('PROFILE_OPTIONS_INVALID'));
  assert.throws(() => inventoryProfile(source, { excludeGroups: { caches: 'yes' } }), code('PROFILE_OPTIONS_INVALID'));
});

test('copy uses exclusive creation, preserves empty dirs and verifies all retained data', t => {
  const { source, destination, put } = fixture(t);
  put('config.json', JSON.stringify({ credential: PRIVATE }));
  put('Cookies-wal', 'wal'); put('Cookies-shm', 'shm'); put('Cookies-journal', 'journal');
  put('Local Storage/leveldb/000003.log', 'leveldb'); put('Local Storage/leveldb/LOCK', 'runtime');
  fs.mkdirSync(path.join(source, 'empty'));
  const original = fs.copyFileSync;
  let copyCalls = 0, quiescentCalls = 0;
  t.mock.method(fs, 'copyFileSync', (from, to, flags) => {
    assert.equal(flags, fs.constants.COPYFILE_EXCL);
    copyCalls++;
    return original(from, to, flags);
  });
  const manifest = copySnapshot(source, destination, { assertQuiescent() { quiescentCalls++; } });
  assert.equal(copyCalls, 5);
  assert.equal(quiescentCalls, 2 * copyCalls + 3);
  assert.ok(fs.statSync(path.join(destination, 'empty')).isDirectory());
  assert.equal(fs.existsSync(path.join(destination, 'Local Storage/leveldb/LOCK')), false);
  assert.equal(fs.readFileSync(path.join(destination, 'Cookies-wal'), 'utf8'), 'wal');
  assert.equal(compareSnapshot(source, manifest).matches, true);
  assert.equal(compareSnapshot(destination, manifest).matches, true);
  assertPublic(compareSnapshot(destination, manifest));
});

test('copy requires a synchronous quiescence assertion and rejects active callbacks before writing', t => {
  const { source, destination, put } = fixture(t);
  put('config.json', '{}');
  assert.throws(() => copySnapshot(source, destination), code('PROFILE_QUIESCENCE_REQUIRED'));
  for (const assertQuiescent of [() => false, () => { throw new Error(PRIVATE); }, async () => true,
    () => Promise.resolve(true), () => Promise.reject(new Error(PRIVATE))]) {
    assert.throws(() => copySnapshot(source, destination, { assertQuiescent }), code('PROFILE_NOT_QUIESCENT'));
    assert.equal(fs.existsSync(destination), false);
  }
});

test('activity after the first copy rejects the snapshot and retains the partial directory', t => {
  const { source, destination, put } = fixture(t);
  put('a.json', '{}'); put('b.json', '{}');
  let calls = 0;
  assert.throws(() => copySnapshot(source, destination, { assertQuiescent() { if (++calls === 4) return false; } }), code('PROFILE_NOT_QUIESCENT'));
  assert.equal(fs.existsSync(path.join(destination, 'a.json')), true);
  assert.equal(fs.existsSync(path.join(destination, 'b.json')), false);
});

for (const mutation of ['change-current', 'change-earlier', 'add', 'delete-next', 'delete-earlier', 'add-directory', 'remove-directory']) {
  test(`copy rejects source drift: ${mutation}`, t => {
    const { source, destination, put } = fixture(t);
    const first = put('a.json', '{"n":1}'), second = put('b.json', '{"n":2}');
    fs.mkdirSync(path.join(source, 'empty'));
    let calls = 0;
    const late = ['change-earlier', 'delete-earlier'].includes(mutation);
    assert.throws(() => copySnapshot(source, destination, { assertQuiescent() {
      if (++calls !== (late ? 6 : 4)) return;
      if (mutation === 'change-current' || mutation === 'change-earlier') fs.writeFileSync(first, '{"n":9}');
      if (mutation === 'add') put(`${PRIVATE}.json`, '{}');
      if (mutation === 'delete-next') fs.unlinkSync(second);
      if (mutation === 'delete-earlier') fs.unlinkSync(first);
      if (mutation === 'add-directory') fs.mkdirSync(path.join(source, PRIVATE));
      if (mutation === 'remove-directory') fs.rmdirSync(path.join(source, 'empty'));
    } }), code('PROFILE_SOURCE_CHANGED'));
    assert.equal(fs.existsSync(destination), true);
  });
}

test('source mutation after the initial scan is rejected before copying that file', t => {
  const { source, destination, put } = fixture(t);
  const file = put('a.json', '{"n":1}');
  let calls = 0;
  assert.throws(() => copySnapshot(source, destination, { assertQuiescent() {
    if (++calls === 2) fs.writeFileSync(file, '{"n":2}');
  } }), code('PROFILE_SOURCE_CHANGED'));
  assert.equal(fs.existsSync(destination), true);
  assert.equal(fs.existsSync(path.join(destination, 'a.json')), false);
});

test('copied content is hashed immediately after copyFileSync returns', t => {
  const { source, destination, put } = fixture(t);
  put('a.json', '{}');
  const copyFile = fs.copyFileSync;
  t.mock.method(fs, 'copyFileSync', (from, to, flags) => {
    copyFile(from, to, flags);
    fs.writeFileSync(to, PRIVATE);
  });
  assert.throws(() => copySnapshot(source, destination, { assertQuiescent() {} }), code('PROFILE_COPY_MISMATCH'));
  assert.equal(fs.existsSync(destination), true);
});

test('copied content is hashed again after all copies', t => {
  const { source, destination, put } = fixture(t);
  put('a.json', '{}'); put('b.json', '{}');
  let calls = 0;
  assert.throws(() => copySnapshot(source, destination, { assertQuiescent() {
    if (++calls === 6) fs.writeFileSync(path.join(destination, 'a.json'), PRIVATE);
  } }), code('PROFILE_COPY_MISMATCH'));
  assert.equal(fs.existsSync(destination), true);
});

test('exclusive creation never overwrites a destination file introduced during copying', t => {
  const { source, destination, put } = fixture(t);
  put('a.json', '{}');
  let calls = 0;
  assert.throws(() => copySnapshot(source, destination, { assertQuiescent() {
    if (++calls === 3) fs.writeFileSync(path.join(destination, 'a.json'), PRIVATE);
  } }), code('PROFILE_IO_ERROR'));
  assert.equal(fs.readFileSync(path.join(destination, 'a.json'), 'utf8'), PRIVATE);
});

test('source/destination overlap and existing destinations are rejected without modifying data', t => {
  const { root, source, destination, put } = fixture(t);
  put('a.json', PRIVATE);
  for (const target of [source, path.join(source, 'nested'), root]) {
    assert.throws(() => copySnapshot(source, target, { assertQuiescent() {} }), code('PROFILE_PATH_OVERLAP'));
  }
  fs.mkdirSync(destination); fs.writeFileSync(path.join(destination, 'keep'), PRIVATE);
  assert.throws(() => copySnapshot(source, destination, { assertQuiescent() {} }), code('PROFILE_DESTINATION_EXISTS'));
  assert.equal(fs.readFileSync(path.join(destination, 'keep'), 'utf8'), PRIVATE);
  if (process.platform === 'win32') {
    assert.throws(() => copySnapshot(source, source.toUpperCase(), { assertQuiescent() {} }), code('PROFILE_PATH_OVERLAP'));
  }
});

test('ancestor file identities reject drive/volume aliases even when canonical strings differ', t => {
  const { root, source, put } = fixture(t);
  put('a.json', '{}');
  const aliasParent = path.join(root, 'alias-parent'); fs.mkdirSync(aliasParent);
  let sourceKey, aliasKey;
  const key = mockDirectoryIdentities(t, value => value === aliasKey ? sourceKey : value);
  sourceKey = key(source); aliasKey = key(aliasParent);
  assert.notEqual(sourceKey, aliasKey);
  // Simulate an OS alias (SUBST/volume/short-name) without changing a real
  // drive: distinct canonical strings share the same reliable directory ID.
  const target = path.join(aliasParent, 'snapshot');
  assert.throws(() => copySnapshot(source, target, { assertQuiescent() {} }), code('PROFILE_PATH_OVERLAP'));
  assert.equal(fs.existsSync(target), false);
});

test('canonical aliases are checked and missing reliable identities fail closed', t => {
  const { root, source, destination, put } = fixture(t);
  put('a.json', '{}');
  const aliasParent = path.join(root, 'alias-parent'); fs.mkdirSync(aliasParent);
  const lstat = fs.lstatSync, realpath = fs.realpathSync.native;
  t.mock.method(fs.realpathSync, 'native', input => sameFixturePath(input, aliasParent) ? source : realpath(input));
  assert.throws(() => copySnapshot(source, path.join(aliasParent, 'snapshot'), { assertQuiescent() {} }), code('PROFILE_IDENTITY_UNVERIFIED'));
  t.mock.method(fs, 'lstatSync', (input, settings) => {
    if (sameFixturePath(input, source) && settings?.bigint) {
      return { dev: 1n, ino: 0n, isDirectory: () => true, isSymbolicLink: () => false };
    }
    return lstat(input, settings);
  });
  assert.throws(() => copySnapshot(source, destination, { assertQuiescent() {} }), code('PROFILE_IDENTITY_UNVERIFIED'));
  assert.equal(fs.existsSync(destination), false);
});

test('copy rejects a changed directory identity after the initial scan', t => {
  const { source, destination, put } = fixture(t);
  put('a.json', '{}');
  let changed = false, calls = 0, sourceKey;
  const key = mockDirectoryIdentities(t, value => value,
    value => changed && value === sourceKey ? 1000000n : 0n);
  sourceKey = key(source);
  assert.throws(() => copySnapshot(source, destination, { assertQuiescent() {
    if (++calls === 2) changed = true;
  } }), code('PROFILE_SOURCE_CHANGED'));
  assert.equal(calls, 2);
  assert.equal(fs.existsSync(destination), false);
});

test('free-space checks occur before creating a destination', t => {
  const { source, destination, put } = fixture(t);
  put('a.json', '{}');
  t.mock.method(fs, 'statfsSync', () => ({ bavail: 10n, bsize: 1n }));
  assert.throws(() => copySnapshot(source, destination, { assertQuiescent() {}, requiredFreeBytes: 11 }), code('PROFILE_INSUFFICIENT_SPACE'));
  assert.equal(fs.existsSync(destination), false);
  for (const requiredFreeBytes of [-1, NaN, Infinity, '10']) {
    assert.throws(() => copySnapshot(source, destination, { assertQuiescent() {}, requiredFreeBytes }), code('PROFILE_OPTIONS_INVALID'));
  }
  t.mock.method(fs, 'statfsSync', () => ({ bavail: 0n, bsize: 1n }));
  assert.throws(() => copySnapshot(source, destination, { assertQuiescent() {}, requiredFreeBytes: 0 }), code('PROFILE_INSUFFICIENT_SPACE'));
});

test('links inside profiles and excluded subtrees are rejected rather than followed', t => {
  const { root, source, put } = fixture(t);
  put('a.json', '{}');
  const outside = path.join(root, 'outside'); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'secret'), PRIVATE);
  const link = path.join(source, 'Cache');
  if (!directoryLink(t, outside, link)) return;
  assert.throws(() => inventoryProfile(source), code('PROFILE_UNSAFE_LINK'));
});

test('a symbolic file link is rejected without reading its target', t => {
  const { root, source } = fixture(t);
  const target = path.join(root, 'secret'); fs.writeFileSync(target, PRIVATE);
  try { fs.symlinkSync(target, path.join(source, `${PRIVATE}.json`), 'file'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('Fixture file symlinks are unavailable under the current sandbox'); return; }
    throw error;
  }
  assert.throws(() => inventoryProfile(source), code('PROFILE_UNSAFE_LINK'));
});

test('source and destination parent junctions/links are rejected', t => {
  const { root, source, put } = fixture(t);
  put('a.json', '{}');
  const alias = path.join(root, 'alias');
  if (!directoryLink(t, root, alias)) return;
  assert.throws(() => inventoryProfile(path.join(alias, 'source')), code('PROFILE_UNSAFE_LINK'));
  assert.throws(() => inspectProfile(path.join(alias, 'source')), code('PROFILE_UNSAFE_LINK'));
  const manifest = inventoryProfile(source);
  assert.throws(() => compareSnapshot(path.join(alias, 'source'), manifest), code('PROFILE_UNSAFE_LINK'));
  assert.throws(() => copySnapshot(source, path.join(alias, 'snapshot'), { assertQuiescent() {} }), code('PROFILE_UNSAFE_LINK'));
  assert.equal(fs.existsSync(path.join(root, 'snapshot')), false);
});

test('unsupported filesystem objects are rejected before opening them', t => {
  const { source, put } = fixture(t);
  const file = put(`${PRIVATE}.pipe`, '');
  const lstat = fs.lstatSync;
  t.mock.method(fs, 'lstatSync', (input, ...args) => {
    if (String(input) !== file) return lstat(input, ...args);
    return { size: 0, isSymbolicLink: () => false, isDirectory: () => false, isFile: () => false };
  });
  let opens = 0;
  t.mock.method(fs, 'openSync', () => { opens++; throw new Error(PRIVATE); });
  assert.throws(() => inventoryProfile(source), code('PROFILE_UNSUPPORTED_ENTRY'));
  assert.equal(opens, 0);
});

test('path traversal in roots and private manifests is rejected', t => {
  const { source, put } = fixture(t);
  put('a.json', '{}');
  const manifest = inventoryProfile(source);
  const traversalRoot = `${source}${path.sep}..${path.sep}source`;
  assert.throws(() => inventoryProfile(traversalRoot), code('PROFILE_PATH_INVALID'));
  for (const namespace of ['//?/C:/profile', '//./pipe/profile', '\\\\?\\C:\\profile']) {
    assert.throws(() => inventoryProfile(namespace), code('PROFILE_PATH_INVALID'));
  }
  for (const rel of [`../${PRIVATE}`, `/absolute/${PRIVATE}`, `x\\${PRIVATE}`, `x//${PRIVATE}`, `x/./${PRIVATE}`, `x/${PRIVATE}:stream`]) {
    const altered = structuredClone(manifest); altered.entries[0].relative = rel;
    assert.throws(() => compareSnapshot(source, altered), error => {
      assert.ok(['PROFILE_PATH_INVALID', 'PROFILE_MANIFEST_INVALID'].includes(error.code));
      return code(error.code)(error);
    });
  }
  const duplicate = structuredClone(manifest); duplicate.entries.push(duplicate.entries[0]);
  assert.throws(() => compareSnapshot(source, duplicate), code('PROFILE_MANIFEST_INVALID'));
});

test('comparison returns only counts and booleans for additions, changes, deletions and directories', t => {
  const { source, put } = fixture(t);
  const changed = put(`changed-${PRIVATE}.json`, '{"n":1}');
  const removed = put(`removed-${PRIVATE}.json`, '{}');
  fs.mkdirSync(path.join(source, 'old-empty'));
  const manifest = inventoryProfile(source);
  fs.writeFileSync(changed, '{"n":2}'); fs.unlinkSync(removed);
  put(`added-${PRIVATE}.json`, '{}');
  fs.rmdirSync(path.join(source, 'old-empty')); fs.mkdirSync(path.join(source, 'new-empty'));
  const result = compareSnapshot(source, manifest);
  assert.deepEqual(result, { matches: false, files: 2, bytes: 9, directories: 1,
    addedFiles: 1, removedFiles: 1, changedFiles: 1, addedDirectories: 1, removedDirectories: 1 });
  assertPublic(result);
});

test('inspection counts configuration and Code/Cowork records/history without returning private values', t => {
  const { source, put } = fixture(t);
  put('config.json', JSON.stringify({ secret: PRIVATE })); put('Preferences', '{}');
  put(`configLibrary/${PRIVATE}.json`, JSON.stringify({ credential: PRIVATE }));
  put(`claude-code-sessions/${PRIVATE}/session.json`, JSON.stringify({ sessionId: PRIVATE, title: PRIVATE, cwd: PRIVATE }));
  put(`claude-code-sessions/${PRIVATE}/history.jsonl`, `${JSON.stringify({ sessionId: PRIVATE, body: PRIVATE })}\r\n${JSON.stringify({ body: PRIVATE })}\r\n`);
  put(`claude-code-sessions/${PRIVATE}/history.json`, JSON.stringify([{ body: PRIVATE }]));
  put(`local-agent-mode-sessions/${PRIVATE}.json`, JSON.stringify({ sessionId: PRIVATE, title: PRIVATE, messages: [{ body: PRIVATE }] }));
  put('logs/invalid.json', PRIVATE);
  const summary = inspectProfile(source);
  assert.deepEqual(summary, { configuration: { jsonFiles: 3 },
    code: { jsonFiles: 2, jsonlFiles: 1, sessionRecords: 1, historyFiles: 2, historyRecords: 3 },
    cowork: { jsonFiles: 1, jsonlFiles: 0, sessionRecords: 1, historyFiles: 1, historyRecords: 1 } });
  assertPublic(summary);
});

test('inspection accepts an empty profile and an empty JSONL history', t => {
  const { source, put } = fixture(t);
  const empty = inspectProfile(source);
  assert.deepEqual(empty.configuration, { jsonFiles: 0 });
  assert.equal(empty.code.sessionRecords, 0);
  put('claude-code-sessions/history.jsonl', '');
  assert.equal(inspectProfile(source).code.historyFiles, 1);
  assert.equal(inspectProfile(source).code.historyRecords, 0);
});

for (const [relative, content, expected] of [
  [`${PRIVATE}.json`, `{"title":"${PRIVATE}",`, 'PROFILE_JSON_INVALID'],
  ['Preferences', 'true', 'PROFILE_JSON_INVALID'],
  [`configLibrary/${PRIVATE}.json`, 'null', 'PROFILE_JSON_INVALID'],
  [`claude-code-sessions/${PRIVATE}.json`, '{"sessionId":12}', 'PROFILE_JSON_INVALID'],
  [`local-agent-mode-sessions/${PRIVATE}.json`, '{"messages":"invalid"}', 'PROFILE_JSON_INVALID'],
  [`claude-code-sessions/${PRIVATE}.jsonl`, `{"body":"${PRIVATE}"}\nnot-json\n`, 'PROFILE_JSONL_INVALID'],
  [`claude-code-sessions/${PRIVATE}.jsonl`, '{}\n\n{}\n', 'PROFILE_JSONL_INVALID'],
  [`local-agent-mode-sessions/${PRIVATE}.jsonl`, '[]\n', 'PROFILE_JSONL_INVALID'],
  [`local-agent-mode-sessions/${PRIVATE}.jsonl`, 'false\n', 'PROFILE_JSONL_INVALID'],
  [`${PRIVATE}.json`, Buffer.from([0xff]), 'PROFILE_JSON_INVALID']
]) {
  test(`inspection rejects malformed structured content (${expected}, case ${content.length})`, t => {
    const { source, put } = fixture(t);
    put(relative, content);
    assert.throws(() => inspectProfile(source), code(expected));
  });
}

test('native filesystem errors and callback errors cannot expose paths or content', t => {
  const { source, put } = fixture(t);
  put(`${PRIVATE}.json`, '{}');
  const native = Object.assign(new Error(`open ${PRIVATE}`), { code: 'EACCES', path: PRIVATE });
  t.mock.method(fs, 'readSync', () => { throw native; });
  assert.throws(() => inventoryProfile(source), code('PROFILE_IO_ERROR'));
  assert.throws(() => inspectProfile(source), code('PROFILE_IO_ERROR'));
});

test('import has no filesystem writes, process, or console side effects', async t => {
  // Node itself must read the module during import. Ban observable mutations
  // and process launches rather than intercepting the loader's own reads.
  for (const method of ['mkdirSync', 'writeFileSync', 'copyFileSync', 'renameSync', 'rmSync', 'unlinkSync']) {
    t.mock.method(fs, method, () => { throw new Error('Import changed the filesystem'); });
  }
  for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
    t.mock.method(childProcess, method, () => { throw new Error('Import launched a process'); });
  }
  for (const method of ['log', 'error', 'warn']) {
    t.mock.method(console, method, () => { throw new Error('Import wrote console output'); });
  }
  const imported = await import('../lib/profile-snapshot.mjs?fixture-import-side-effects');
  assert.equal(typeof imported.inventoryProfile, 'function');
});
