import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { restore, status } from '../lib/install.mjs';
import { sha256, writeJSON, inside } from '../lib/common.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), '3p-zh-restore-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const before = Buffer.from('original frontend'), after = Buffer.from('localized frontend');
  fs.mkdirSync(path.join(root, 'app/resources'), { recursive: true });
  fs.mkdirSync(path.join(root, '.backup'));
  fs.writeFileSync(path.join(root, 'app/resources/app.asar'), 'archive');
  fs.writeFileSync(path.join(root, 'app/resources/main.js'), after);
  fs.writeFileSync(path.join(root, '.backup/main.js'), before);
  fs.writeFileSync(path.join(root, 'app/resources/zh-Hans.json'), '{}');
  const state = { schema: 1, root, status: 'installed', locale: 'zh-Hans', asarSHA256: sha256('archive'), files: [
    { path: 'app/resources/main.js', backup: '.backup/main.js', before: sha256(before), after: sha256(after) },
    { path: 'app/resources/zh-Hans.json', backup: null, before: null, after: sha256('{}') }
  ] };
  writeJSON(path.join(root, '3p-zh-state.json'), state);
  return { root, before, after, state };
}
test('restores original bytes, removes only created catalog, retains user data, is idempotent', { skip: process.platform !== 'win32' }, t => {
  const { root, before } = fixture(t);
  fs.writeFileSync(path.join(root, 'user-note.txt'), 'keep me');
  assert.equal(restore(root).status, 'restored');
  assert.deepEqual(fs.readFileSync(path.join(root, 'app/resources/main.js')), before);
  assert(!fs.existsSync(path.join(root, 'app/resources/zh-Hans.json')));
  assert.equal(fs.readFileSync(path.join(root, 'user-note.txt'), 'utf8'), 'keep me');
  assert.equal(restore(root).alreadyRestored, true);
});
test('preflights all files before restoring anything', { skip: process.platform !== 'win32' }, t => {
  const { root, after } = fixture(t);
  fs.writeFileSync(path.join(root, 'app/resources/zh-Hans.json'), 'user edit');
  assert.throws(() => restore(root), /changed outside/);
  assert.deepEqual(fs.readFileSync(path.join(root, 'app/resources/main.js')), after);
  assert.equal(status(root).intact, false);
});
test('refuses old backups after application update', { skip: process.platform !== 'win32' }, t => {
  const { root } = fixture(t);
  fs.writeFileSync(path.join(root, 'app/resources/app.asar'), 'new archive');
  assert.throws(() => restore(root), /version changed/);
});
test('restoration resumes from interrupted language switch', { skip: process.platform !== 'win32' }, t => {
  const { root, before, state } = fixture(t);
  state.status = 'applying'; state.files[0].previousAfter = state.files[0].after; state.files[0].after = sha256('new language');
  writeJSON(path.join(root, '3p-zh-state.json'), state);
  restore(root);
  assert.deepEqual(fs.readFileSync(path.join(root, 'app/resources/main.js')), before);
});
test('rejects symlink targets before restore can follow them', t => {
  const { root } = fixture(t), external = path.join(root, 'external');
  fs.mkdirSync(external);
  try { fs.symlinkSync(external, path.join(root, 'link'), 'junction'); } catch { t.skip('Symlink unavailable'); return; }
  assert.throws(() => inside(root, 'link/file'), /Symbolic-link/);
});
test('launch refuses the same lock held by switch or restore', t => {
  const { root } = fixture(t), lock = root + '.3p-zh-lock';
  fs.writeFileSync(lock, String(process.pid));
  t.after(() => fs.unlinkSync(lock));
  const cli = fileURLToPath(new URL('../bin/claude-3p-zh.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'launch', '--root', root], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stderr, /Another operation is running/);
});
