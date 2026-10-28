import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sha256 } from '../lib/common.mjs';

test('Windows adapter compiles and refuses decoy UI targets in self-test without touching UI', { skip: process.platform !== 'win32' }, t => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'zh-console-bridge-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const payload = path.join(root, 'payload.js'), manifest = path.join(root, 'bundle.json');
  fs.writeFileSync(payload, 'inert build-only fixture');
  const catalog=path.join(root,'catalog.json');
  fs.writeFileSync(catalog,'{"locale":"zh-Hans"}');
  fs.writeFileSync(manifest, JSON.stringify({ version: 2, locale: 'zh-Hans', payload,
    payloadSha256: sha256(fs.readFileSync(payload)), sourceExecutable: path.join(root, 'Claude.exe'),
    catalogFile:catalog,catalogSha256:sha256(fs.readFileSync(catalog)),
    successMarker: 'CLAUDE_ZH_APPLIED_' + 'a'.repeat(32) }));
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
    path.resolve('scripts/test-runtime-autoload.ps1'), '-Manifest', manifest, '-BuildDirectory', path.join(root, 'build')],
    { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout.trim());
  assert.equal(report.mode, 'BuildOnly');
  assert.equal(report.uiAttempted, false);
  const saved = JSON.parse(fs.readFileSync(report.report, 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(saved.selfTest.state, 'SelfTestPassed');
  assert.equal(saved.selfTest.cases, 90);
  assert.equal(saved.selfTest.uiActions, 0);
  assert.deepEqual(saved.events, []);
});
