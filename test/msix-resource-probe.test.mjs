import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resourcePackage } from '../scripts/msix-resource-probe.mjs';
import { sha256 } from '../lib/common.mjs';

test('resource package refuses executable content, traversal and Windows path aliases', () => {
  for (const name of ['../outside.txt', '/root.txt', 'app/file.exe', 'app/file.dll', 'app/file.ps1', 'app/file.vbs', 'app/../outside.txt', 'app/NUL.txt', 'app/dir./file.json']) {
    assert.throws(() => resourcePackage(new Map([['AppxManifest.xml', '<Package/>'], [name, 'inert fixture']])), /relative resource/);
  }
  for (const names of [['app\\one.json', 'app/one.json'], ['app/One.json', 'app/one.json']]) {
    assert.throws(() => resourcePackage(new Map([['AppxManifest.xml', '<Package/>'], ...names.map(name => [name, '{}'])])), /Duplicate/);
  }
});

test('Windows ZIP and XML readers recover a multi-block resource and its block map', { skip: process.platform !== 'win32' }, t => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), '3p-zh-resource-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const payload = Buffer.from('中文 resource\n'.repeat(7000)), packageFile = path.join(root, 'fixture.msix');
  fs.writeFileSync(packageFile, resourcePackage(new Map([['AppxManifest.xml', '<Package/>'], ['app/resources/zh-Hans.json', payload]])));
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($env:CLAUDE_ZH_RESOURCE_PACKAGE)
try {
  $stream=$zip.GetEntry('app/resources/zh-Hans.json').Open()
  $memory=New-Object IO.MemoryStream
  $stream.CopyTo($memory); $stream.Dispose()
  $hash=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($memory.ToArray())).Replace('-','').ToLowerInvariant()
  $reader=New-Object IO.StreamReader ($zip.GetEntry('AppxBlockMap.xml').Open())
  [xml]$map=$reader.ReadToEnd(); $reader.Dispose()
  $file=@($map.BlockMap.File | Where-Object {$_.Name -eq 'app\\resources\\zh-Hans.json'})
  if($file.Count -ne 1){throw 'Missing resource in block map'}
  @{hash=$hash;size=[int]$file[0].Size;blocks=@($file[0].Block).Count;entries=$zip.Entries.Count}|ConvertTo-Json -Compress
} finally {$zip.Dispose()}
`], { env: { ...process.env, CLAUDE_ZH_RESOURCE_PACKAGE: packageFile }, windowsHide: true, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  const actual = JSON.parse(result.stdout);
  assert.equal(actual.hash, sha256(payload));
  assert.equal(actual.size, payload.length);
  assert.equal(actual.blocks, Math.ceil(payload.length / 65536));
  assert.equal(actual.entries, 4);
});
