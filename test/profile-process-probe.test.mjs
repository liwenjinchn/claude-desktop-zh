import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('Windows PowerShell classifier handles orphan workers, unreadable fields and process identity', { skip: process.platform !== 'win32' }, t => {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), '3p-zh-probe-fixture-'));
  t.after(() => { assert(directory.startsWith(os.tmpdir())); fs.rmSync(directory, { recursive: true, force: true }); });
  const log = path.join(directory, 'fixture.log'), fd = fs.openSync(log, 'wx');
  let result;
  try {
    result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('./profile-process-probe.fixture.ps1', import.meta.url)), '-ProbeFile', fileURLToPath(new URL('../scripts/profile-process-probe.ps1', import.meta.url))], { stdio: ['ignore', fd, fd], windowsHide: true });
  } finally { fs.closeSync(fd); }
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, fs.readFileSync(log, 'utf8'));
  assert.match(fs.readFileSync(log, 'utf8'), /fixtures passed/);
});
