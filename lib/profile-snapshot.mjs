import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Manifests contain private filenames. Keep them outside public reports and Git.
// All other results, and every error message/code, contain only fixed labels,
// counts and booleans. Importing this module does not access the filesystem.
const GROUPS = Object.freeze(['largeComponents', 'caches', 'runtimeLocks', 'workerCredentials']);
const LARGE_COMPONENTS = new Set(['vm_bundles', 'claude-code', 'claude-code-vm', 'git-shadow']);
const CACHES = new Set(['cache', 'code cache', 'gpucache', 'gpupersistentcache', 'grshadercache',
  'shadercache', 'dawngraphitecache', 'dawnwebgpucache', 'crashpad', 'logs']);
const RUNTIME_LOCKS = new Set(['lock', 'lockfile', 'singletonlock', 'singletoncookie', 'singletonsocket']);
const CONFIG_NAMES = new Set(['preferences', 'secure preferences', 'local state']);
const SESSION_ROOTS = new Map([['claude-code-sessions', 'code'], ['local-agent-mode-sessions', 'cowork']]);
const ALL_INCLUDED = Object.freeze(Object.fromEntries(GROUPS.map(group => [group, false])));

class SnapshotError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function fail(code) { throw new SnapshotError(code); }
function guarded(action) {
  try { return action(); }
  catch (error) {
    if (error instanceof SnapshotError) throw error;
    fail('PROFILE_IO_ERROR');
  }
}
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
function groupsOption(value) {
  if (value === undefined) return Object.fromEntries(GROUPS.map(group => [group, true]));
  if (!isObject(value) || Object.keys(value).some(group => !GROUPS.includes(group))) fail('PROFILE_OPTIONS_INVALID');
  const result = {};
  for (const group of GROUPS) {
    if (value[group] !== undefined && typeof value[group] !== 'boolean') fail('PROFILE_OPTIONS_INVALID');
    result[group] = value[group] ?? true;
  }
  return result;
}
function component(name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[\\/:\0]/.test(name)
      || (process.platform === 'win32' && (/[. ]$/.test(name)
        || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)))) fail('PROFILE_PATH_INVALID');
}
function absolute(input) {
  if (typeof input !== 'string' || !input || input.includes('\0') || /^[\\/]{2}[?.][\\/]/.test(input)
      || input.split(/[\\/]/).includes('..')) fail('PROFILE_PATH_INVALID');
  const result = path.resolve(input);
  for (const name of result.slice(path.parse(result).root.length).split(path.sep).filter(Boolean)) component(name);
  return result;
}
function relative(input) {
  if (typeof input !== 'string' || !input || input.startsWith('/') || input.includes('\\')) fail('PROFILE_MANIFEST_INVALID');
  for (const name of input.split('/')) component(name);
  return input;
}
function joined(root, rel) {
  relative(rel);
  const result = path.resolve(root, ...rel.split('/'));
  const remainder = path.relative(root, result);
  if (!remainder || remainder === '..' || remainder.startsWith(`..${path.sep}`) || path.isAbsolute(remainder)) fail('PROFILE_PATH_INVALID');
  return result;
}
function key(value) { return process.platform === 'win32' ? value.toLowerCase() : value; }
function assertDirectory(directory) {
  const root = path.parse(directory).root;
  let current = root;
  const names = directory.slice(root.length).split(path.sep).filter(Boolean);
  // Check every ancestor, including the filesystem/share root. lstat rejects
  // Windows directory junctions as well as POSIX/Windows symbolic links.
  for (const name of [null, ...names]) {
    if (name !== null) current = path.join(current, name);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail('PROFILE_UNSAFE_LINK');
    if (!stat.isDirectory()) fail('PROFILE_UNSUPPORTED_ENTRY');
  }
}
function entryStat(file, bigint = false) {
  assertDirectory(path.dirname(file));
  const stat = fs.lstatSync(file, bigint ? { bigint: true } : undefined);
  if (stat.isSymbolicLink()) fail('PROFILE_UNSAFE_LINK');
  if (!stat.isFile() && !stat.isDirectory()) fail('PROFILE_UNSUPPORTED_ENTRY');
  if (bigint ? stat.size < 0n || stat.size > BigInt(Number.MAX_SAFE_INTEGER) : !integer(stat.size)) fail('PROFILE_SIZE_INVALID');
  return stat;
}
function unchangedStat(before, after) {
  return before.dev === after.dev && before.ino === after.ino && before.size === after.size
    && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs;
}
function readRegular(file, collect = false) {
  const before = entryStat(file, true);
  if (!before.isFile()) fail('PROFILE_UNSUPPORTED_ENTRY');
  // O_NOFOLLOW is available on POSIX. On Windows also check both the path and
  // the opened file's identity before and after the read.
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || !unchangedStat(before, opened)) fail('PROFILE_SOURCE_CHANGED');
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    const chunks = [];
    let bytes = 0;
    for (;;) {
      const count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      bytes += count;
      if (!integer(bytes)) fail('PROFILE_SIZE_INVALID');
      hash.update(buffer.subarray(0, count));
      if (collect) chunks.push(Buffer.from(buffer.subarray(0, count)));
    }
    if (BigInt(bytes) !== before.size || !unchangedStat(before, fs.fstatSync(descriptor, { bigint: true }))
        || !unchangedStat(before, entryStat(file, true))) fail('PROFILE_SOURCE_CHANGED');
    return { bytes, sha256: hash.digest('hex'), ...(collect ? { content: Buffer.concat(chunks) } : {}) };
  } finally { fs.closeSync(descriptor); }
}
function exclusionFor(rel, groups) {
  const parts = rel.split('/');
  const name = parts.at(-1).toLowerCase();
  if (parts.length === 1 && groups.largeComponents && LARGE_COMPONENTS.has(name)) return 'largeComponents';
  if (parts.length === 1 && groups.caches && CACHES.has(name)) return 'caches';
  if (groups.runtimeLocks && RUNTIME_LOCKS.has(name)) return 'runtimeLocks';
  if (groups.workerCredentials && ((parts.length === 1 && name === 'ccd-session-secrets') || name.startsWith('host-creds-'))) return 'workerCredentials';
  return null;
}
function scan(source, excludeGroups) {
  assertDirectory(source);
  const manifest = { version: 1, entries: [], dirs: [],
    exclusions: Object.fromEntries(GROUPS.map(group => [group, { files: 0, dirs: 0, bytes: 0 }])),
    excludeGroups: { ...excludeGroups } };
  function walk(directory, prefix, inheritedExclusion) {
    assertDirectory(directory);
    const before = fs.lstatSync(directory);
    const names = fs.readdirSync(directory).sort();
    for (const name of names) {
      component(name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const file = joined(source, rel);
      const stat = entryStat(file);
      const group = inheritedExclusion ?? exclusionFor(rel, excludeGroups);
      if (group) {
        const aggregate = manifest.exclusions[group];
        if (stat.isDirectory()) aggregate.dirs++;
        else { aggregate.files++; aggregate.bytes += stat.size; }
        // Exclusion never hides an unsafe entry. Count/validate the subtree,
        // but do not read/hash/copy excluded file contents.
        if (stat.isDirectory()) walk(file, rel, group);
      } else if (stat.isDirectory()) {
        manifest.dirs.push(rel);
        walk(file, rel, null);
      } else {
        const { bytes, sha256 } = readRegular(file);
        manifest.entries.push({ relative: rel, bytes, sha256 });
      }
    }
    const after = fs.lstatSync(directory);
    if (after.isSymbolicLink()) fail('PROFILE_UNSAFE_LINK');
    if (!after.isDirectory() || before.dev !== after.dev || before.ino !== after.ino) fail('PROFILE_SOURCE_CHANGED');
    assertDirectory(directory);
  }
  walk(source, '', null);
  manifest.entries.sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0);
  manifest.dirs.sort();
  return manifest;
}
function options(value) {
  if (!isObject(value)) fail('PROFILE_OPTIONS_INVALID');
  return value;
}

/** Private manifest: entries/dirs must never be included in a public report.
 * Only four fixed exclusion groups can be disabled; arbitrary exclusions are
 * deliberately unsupported. SQLite sidecars, LevelDB logs/tables/manifests and
 * unrelated .log files are retained (LevelDB's runtime LOCK is excluded).
 */
export function inventoryProfile(source, settings = {}) {
  return guarded(() => scan(absolute(source), groupsOption(options(settings).excludeGroups)));
}
function quiescent(callback) {
  if (typeof callback !== 'function') fail('PROFILE_QUIESCENCE_REQUIRED');
  try {
    if (callback.constructor?.name === 'AsyncFunction') fail('PROFILE_NOT_QUIESCENT');
    const result = callback();
    if (result instanceof Promise) result.catch(() => {});
    if (result !== undefined && result !== true) fail('PROFILE_NOT_QUIESCENT');
  } catch { fail('PROFILE_NOT_QUIESCENT'); }
}
function isInside(parent, child) {
  const rel = path.relative(key(parent), key(child));
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`));
}
function nativePath(directory) {
  let canonical = fs.realpathSync.native(directory);
  if (typeof canonical !== 'string' || !canonical) fail('PROFILE_IDENTITY_UNVERIFIED');
  if (process.platform === 'win32') {
    if (canonical.startsWith('\\\\?\\UNC\\')) canonical = `\\\\${canonical.slice(8)}`;
    else if (/^\\\\\?\\[A-Za-z]:\\/.test(canonical)) canonical = canonical.slice(4);
  }
  if (!path.isAbsolute(canonical)) fail('PROFILE_IDENTITY_UNVERIFIED');
  return path.normalize(canonical);
}
function identityChain(directory) {
  assertDirectory(directory);
  const root = path.parse(directory).root;
  let current = root;
  const ids = [];
  function identity(file) {
    const stat = fs.lstatSync(file, { bigint: true });
    if (stat.isSymbolicLink()) fail('PROFILE_UNSAFE_LINK');
    if (!stat.isDirectory()) fail('PROFILE_UNSUPPORTED_ENTRY');
    if (typeof stat.dev !== 'bigint' || typeof stat.ino !== 'bigint'
        || stat.dev < 0n || stat.ino <= 0n) fail('PROFILE_IDENTITY_UNVERIFIED');
    return `${stat.dev}:${stat.ino}`;
  }
  for (const name of [null, ...directory.slice(root.length).split(path.sep).filter(Boolean)]) {
    if (name !== null) current = path.join(current, name);
    ids.push(identity(current));
  }
  // Native realpath resolves Windows short names/drive aliases where possible;
  // dev+ino additionally covers aliases which keep distinct canonical strings.
  const canonical = nativePath(directory);
  assertDirectory(canonical);
  if (identity(canonical) !== ids.at(-1)) fail('PROFILE_IDENTITY_UNVERIFIED');
  return { canonical, ids, signature: ids.join('|') };
}
function disjointLocations(source, destination) {
  const origin = identityChain(source), parent = identityChain(path.dirname(destination));
  const projected = path.join(parent.canonical, path.basename(destination));
  if (parent.ids.includes(origin.ids.at(-1)) || isInside(origin.canonical, projected)
      || isInside(projected, origin.canonical)) fail('PROFILE_PATH_OVERLAP');
  return { origin, parent };
}
function stableLocation(directory, expected, code) {
  const current = identityChain(directory);
  if (current.signature !== expected.signature || key(current.canonical) !== key(expected.canonical)) fail(code);
}
function absent(file) {
  assertDirectory(path.dirname(file));
  try { fs.lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  fail('PROFILE_DESTINATION_EXISTS');
}
function equal(a, b) {
  return a.entries.length === b.entries.length && a.dirs.length === b.dirs.length
    && a.entries.every((entry, index) => entry.relative === b.entries[index].relative
      && entry.bytes === b.entries[index].bytes && entry.sha256 === b.entries[index].sha256)
    && a.dirs.every((dir, index) => dir === b.dirs[index]);
}
function expectedFile(root, entry, code) {
  try {
    const actual = readRegular(joined(root, entry.relative));
    if (actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256) fail(code);
  } catch (error) {
    if (error instanceof SnapshotError && ['PROFILE_UNSAFE_LINK', 'PROFILE_PATH_INVALID', 'PROFILE_UNSUPPORTED_ENTRY'].includes(error.code)) throw error;
    fail(code);
  }
}

/** Copy to a nonexistent child of an existing, safe parent directory.
 * requiredFreeBytes is a minimum free-space threshold, never less than the
 * included source bytes. The callback must synchronously throw/return false
 * when the app/worker is active. Failed copies are intentionally retained.
 * Returns the same PRIVATE manifest shape as inventoryProfile.
 */
export function copySnapshot(source, destination, settings = {}) {
  return guarded(() => {
    settings = options(settings);
    const from = absolute(source), to = absolute(destination);
    if (isInside(from, to) || isInside(to, from)) fail('PROFILE_PATH_OVERLAP');
    assertDirectory(from);
    absent(to);
    const locations = disjointLocations(from, to);
    const groups = groupsOption(settings.excludeGroups);
    if (settings.requiredFreeBytes !== undefined && !integer(settings.requiredFreeBytes)) fail('PROFILE_OPTIONS_INVALID');
    quiescent(settings.assertQuiescent);
    const manifest = scan(from, groups);
    const sourceBytes = manifest.entries.reduce((sum, entry) => sum + entry.bytes, 0);
    if (!integer(sourceBytes)) fail('PROFILE_SIZE_INVALID');
    const required = Math.max(sourceBytes, settings.requiredFreeBytes ?? 0);
    assertDirectory(path.dirname(to));
    const disk = fs.statfsSync(path.dirname(to), { bigint: true });
    if (disk.bavail * disk.bsize < BigInt(required)) fail('PROFILE_INSUFFICIENT_SPACE');
    quiescent(settings.assertQuiescent);
    stableLocation(from, locations.origin, 'PROFILE_SOURCE_CHANGED');
    stableLocation(path.dirname(to), locations.parent, 'PROFILE_DESTINATION_CHANGED');
    absent(to);
    try { fs.mkdirSync(to); }
    catch (error) { if (error.code === 'EEXIST') fail('PROFILE_DESTINATION_EXISTS'); throw error; }
    const destinationIdentity = identityChain(to);
    function stableLocations() {
      stableLocation(from, locations.origin, 'PROFILE_SOURCE_CHANGED');
      stableLocation(path.dirname(to), locations.parent, 'PROFILE_DESTINATION_CHANGED');
      stableLocation(to, destinationIdentity, 'PROFILE_DESTINATION_CHANGED');
    }
    for (const dir of manifest.dirs) {
      stableLocations();
      const target = joined(to, dir);
      assertDirectory(path.dirname(target));
      fs.mkdirSync(target);
    }
    for (const entry of manifest.entries) {
      quiescent(settings.assertQuiescent);
      stableLocations();
      expectedFile(from, entry, 'PROFILE_SOURCE_CHANGED');
      const origin = joined(from, entry.relative), target = joined(to, entry.relative);
      assertDirectory(path.dirname(target));
      // COPYFILE_EXCL also rejects an attacker-created destination link/file.
      fs.copyFileSync(origin, target, fs.constants.COPYFILE_EXCL);
      quiescent(settings.assertQuiescent);
      stableLocations();
      expectedFile(from, entry, 'PROFILE_SOURCE_CHANGED');
      expectedFile(to, entry, 'PROFILE_COPY_MISMATCH');
    }
    quiescent(settings.assertQuiescent);
    stableLocations();
    if (!equal(manifest, scan(from, groups))) fail('PROFILE_SOURCE_CHANGED');
    // Scan every copied file, including unexpected files whose names would be
    // excluded in the source, to verify both the set and the final hashes.
    if (!equal(manifest, scan(to, ALL_INCLUDED))) fail('PROFILE_COPY_MISMATCH');
    return manifest;
  });
}
function validateManifest(manifest) {
  if (!isObject(manifest) || manifest.version !== 1 || !Array.isArray(manifest.entries)
      || !Array.isArray(manifest.dirs) || !isObject(manifest.excludeGroups)) fail('PROFILE_MANIFEST_INVALID');
  const groups = groupsOption(manifest.excludeGroups);
  const entries = [], dirs = [], seen = new Set(), directorySet = new Set();
  for (const dir of manifest.dirs) {
    relative(dir);
    if (seen.has(key(dir))) fail('PROFILE_MANIFEST_INVALID');
    seen.add(key(dir)); directorySet.add(key(dir)); dirs.push(dir);
  }
  for (const entry of manifest.entries) {
    if (!isObject(entry)) fail('PROFILE_MANIFEST_INVALID');
    relative(entry.relative);
    if (seen.has(key(entry.relative)) || !integer(entry.bytes) || typeof entry.sha256 !== 'string'
        || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail('PROFILE_MANIFEST_INVALID');
    seen.add(key(entry.relative)); entries.push({ relative: entry.relative, bytes: entry.bytes, sha256: entry.sha256 });
  }
  for (const rel of [...dirs, ...entries.map(entry => entry.relative)]) {
    const parent = rel.split('/').slice(0, -1).join('/');
    if (parent && !directorySet.has(key(parent))) fail('PROFILE_MANIFEST_INVALID');
  }
  entries.sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0);
  dirs.sort();
  return { entries, dirs, excludeGroups: groups };
}

/** Public, path-free comparison. Unsafe/malformed input still throws a fixed code. */
export function compareSnapshot(source, manifest) {
  return guarded(() => {
    const expected = validateManifest(manifest);
    const current = scan(absolute(source), expected.excludeGroups);
    const previousFiles = new Map(expected.entries.map(entry => [entry.relative, entry]));
    const currentFiles = new Map(current.entries.map(entry => [entry.relative, entry]));
    const previousDirs = new Set(expected.dirs), currentDirs = new Set(current.dirs);
    let addedFiles = 0, removedFiles = 0, changedFiles = 0;
    for (const entry of current.entries) {
      const previous = previousFiles.get(entry.relative);
      if (!previous) addedFiles++;
      else if (entry.bytes !== previous.bytes || entry.sha256 !== previous.sha256) changedFiles++;
    }
    for (const entry of expected.entries) if (!currentFiles.has(entry.relative)) removedFiles++;
    const addedDirectories = current.dirs.filter(dir => !previousDirs.has(dir)).length;
    const removedDirectories = expected.dirs.filter(dir => !currentDirs.has(dir)).length;
    return { matches: addedFiles + removedFiles + changedFiles + addedDirectories + removedDirectories === 0,
      files: current.entries.length, bytes: current.entries.reduce((sum, entry) => sum + entry.bytes, 0), directories: current.dirs.length,
      addedFiles, removedFiles, changedFiles, addedDirectories, removedDirectories };
  });
}
function parseContent(content, jsonl) {
  const code = jsonl ? 'PROFILE_JSONL_INVALID' : 'PROFILE_JSON_INVALID';
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(content); }
  catch { fail(code); }
  function parse(text) {
    let value;
    try { value = JSON.parse(text); } catch { fail(code); }
    if (!isObject(value) && !Array.isArray(value)) fail(code);
    return value;
  }
  if (!jsonl) return parse(text);
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines.map(line => {
    const value = parse(line);
    if (!isObject(value)) fail(code);
    return value;
  });
}
function sessionSummary() { return { jsonFiles: 0, jsonlFiles: 0, sessionRecords: 0, historyFiles: 0, historyRecords: 0 }; }

/** Public counts only. Session IDs, keys, titles, paths and values never escape.
 * Known session roots follow the archived profile-shapes/inspect-session-ids
 * scripts. Every retained JSON/JSONL file is parsed, not just session metadata.
 * Histories are JSONL, JSON arrays, named history/messages/transcript files, or
 * JSON metadata with an embedded messages/history array.
 */
export function inspectProfile(snapshot) {
  return guarded(() => {
    const root = absolute(snapshot);
    const manifest = scan(root, groupsOption());
    const result = { configuration: { jsonFiles: 0 }, code: sessionSummary(), cowork: sessionSummary() };
    for (const entry of manifest.entries) {
      const parts = entry.relative.split('/');
      const name = parts.at(-1).toLowerCase();
      const jsonl = name.endsWith('.jsonl');
      const json = name.endsWith('.json') || (parts.length === 1 && CONFIG_NAMES.has(name));
      if (!json && !jsonl) continue;
      const read = readRegular(joined(root, entry.relative), true);
      if (read.bytes !== entry.bytes || read.sha256 !== entry.sha256) fail('PROFILE_SOURCE_CHANGED');
      const value = parseContent(read.content, jsonl);
      const group = SESSION_ROOTS.get(parts[0].toLowerCase());
      if (!group) {
        if (json) result.configuration.jsonFiles++;
        continue;
      }
      const summary = result[group];
      if (jsonl) {
        summary.jsonlFiles++; summary.historyFiles++; summary.historyRecords += value.length;
        continue;
      }
      summary.jsonFiles++;
      if (Array.isArray(value)) {
        if (value.some(record => !isObject(record))) fail('PROFILE_JSON_INVALID');
        summary.historyFiles++; summary.historyRecords += value.length;
        continue;
      }
      if (Object.hasOwn(value, 'sessionId')) {
        if (typeof value.sessionId !== 'string' || !value.sessionId) fail('PROFILE_JSON_INVALID');
        summary.sessionRecords++;
      }
      const historyKeys = ['messages', 'history'].filter(field => Object.hasOwn(value, field));
      if (historyKeys.some(field => !Array.isArray(value[field]) || value[field].some(record => !isObject(record)))) fail('PROFILE_JSON_INVALID');
      const namedHistory = parts.slice(1).some(part => /^(history|histories|messages|transcripts?)(\.|$)/i.test(part));
      if (historyKeys.length || namedHistory) {
        summary.historyFiles++;
        summary.historyRecords += historyKeys.reduce((sum, field) => sum + value[field].length, 0);
      }
    }
    return result;
  });
}
