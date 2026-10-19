import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('MSIX deployment refuses active Claude even with unreadable paths and catches package helpers', { skip: process.platform !== 'win32' }, () => {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
$ErrorActionPreference='Stop'
. $env:CLAUDE_ZH_GUARD_SCRIPT
$source='C:\\Program Files\\WindowsApps\\Claude_fixture\\app'
$cases=@(
 @([pscustomobject]@{Name='Claude.exe';ExecutablePath=$null}),
 @([pscustomobject]@{Name='claude.exe';ExecutablePath='C:\\unrelated-copy\\claude.exe'}),
 @([pscustomobject]@{Name='helper.exe';ExecutablePath=$source+'\\resources\\helper.exe'})
)
$refused=0
foreach($case in $cases){
 try {Assert-MsixApplicationStopped -Processes $case -Source $source;throw 'Expected refusal'}
 catch {if($_.Exception.Message -ne 'MSIX_PROBE_APPLICATION_RUNNING'){throw};$refused++}
}
Assert-MsixApplicationStopped -Processes @() -Source $source
Assert-MsixApplicationStopped -Processes @([pscustomobject]@{Name='node.exe';ExecutablePath='C:\\other-project\\node.exe'}) -Source $source
@{refused=$refused;unrelatedProcessUntouched=$true}|ConvertTo-Json -Compress
`], { env: { ...process.env, CLAUDE_ZH_GUARD_SCRIPT: fileURLToPath(new URL('../scripts/manage-msix-resource-probe.ps1', import.meta.url)) }, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { refused: 3, unrelatedProcessUntouched: true });
});
