import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { sha256 } from '../lib/common.mjs';

test('parent-bound watcher stops naturally when registry changes, with an inert app and no UI attempts',
  { skip: process.platform !== 'win32', timeout: 30000 }, async t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'zh-owner-'));
    const registry = path.join(root, 'plugins.json'), payload = path.join(root, 'payload.js'), manifest = path.join(root, 'bundle.json');
    const stop = path.join(root, 'stop');
    fs.writeFileSync(registry, '{"plugins":[]}');
    fs.utimesSync(registry, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'));
    fs.writeFileSync(payload, 'inert fixture; never sent to any application');
    fs.writeFileSync(manifest, JSON.stringify({ version: 1, locale: 'zh-Hans', payload,
      sourceExecutable: path.join(root, 'nonexistent-app', 'Claude.exe'), payloadSha256: sha256(fs.readFileSync(payload)),
      successMarker: 'CLAUDE_ZH_APPLIED_' + 'c'.repeat(32) }));
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.resolve('scripts/test-runtime-autoload.ps1'),
      '-Manifest', manifest, '-BuildDirectory', path.join(root, 'build'), '-Watch', '-WatchSeconds', '10',
      '-ParentProcessId', String(process.pid), '-ParentExecutable', process.execPath, '-ParentStartedBefore', new Date().toISOString(),
      '-RegistryFile', registry, '-RegistrySha256', sha256(fs.readFileSync(registry)), '-StopFile', stop],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    t.after(() => { if (child.exitCode === null) fs.writeFileSync(stop, 'Test cleanup: normal stop.'); });
    let announce;
    const watching = new Promise(resolve => { announce = resolve; });
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.includes('Watching original Claude')) announce(); });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const closed = new Promise(resolve => child.once('close', code => resolve(code)));
    const start = await Promise.race([watching.then(() => true), closed.then(() => false)]);
    assert.equal(start, true, stderr || stdout);
    fs.writeFileSync(registry, '{"plugins":[],"changed":true}');
    assert.equal(await closed, 0, stderr || stdout);
    const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
    const report = JSON.parse(fs.readFileSync(result.report, 'utf8').replace(/^\uFEFF/, ''));
    assert.equal(report.parentBound, true);
    assert.deepEqual(report.events, []); // No executable at the fixture path can match a running app.
    assert.equal(report.selfTest.uiActions, 0);
    assert.ok(report.finishedAt);
    fs.rmSync(root, { recursive: true, force: true });
  });
