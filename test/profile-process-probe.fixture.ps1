param([Parameter(Mandatory = $true)][string]$ProbeFile)
$ErrorActionPreference = 'Stop'
. $ProbeFile -RequestFile 'unused-fixture-path'
function Assert-Equal($Actual, $Expected, $Name) { if ($Actual -ne $Expected) { throw ('FIXTURE_FAILED: ' + $Name) } }
function Item($Id, $Parent, $Name, $Command = '', $Path = '', $Created = '2026-10-17T00:00:00Z') {
    return [pscustomobject]@{ ProcessId = $Id; ParentProcessId = $Parent; Name = $Name; CommandLine = $Command; ExecutablePath = $Path; CreationDate = [datetime]$Created }
}
$request = [pscustomobject]@{ source = 'C:\fixture\app'; profile = 'C:\fixture\profile'; runnerPid = 100; wrapperPid = 101; observedProcesses = @() }
$base = @((Item 100 101 'node.exe' 'tester' 'C:\node.exe'), (Item 101 1 'powershell.exe' 'wrapper' 'C:\powershell.exe'))
$clean = Get-ProfileProcessState -Items $base -Request $request -ProbePid 102
Assert-Equal $clean.blockedCount 0 'clean-blocked'
Assert-Equal $clean.unknownCount 0 'clean-unknown'
$orphan = Get-ProfileProcessState -Items ($base + @((Item 200 999 'node.exe' 'orphan' 'C:\node.exe'))) -Request $request -ProbePid 102
Assert-Equal $orphan.unknownCount 1 'orphan-generic-unknown'
$hidden = Get-ProfileProcessState -Items ($base + @((Item 201 1 'claude.exe'))) -Request $request -ProbePid 102
Assert-Equal $hidden.blockedCount 1 'hidden-app-blocked'
Assert-Equal $hidden.unknownCount 1 'hidden-app-unknown'
$tree = Get-ProfileProcessState -Items ($base + @((Item 202 1 'claude.exe' 'app' 'C:\fixture\app\claude.exe'), (Item 203 202 'worker.exe' 'worker' 'C:\other\worker.exe'))) -Request $request -ProbePid 102
Assert-Equal $tree.blockedCount 2 'descendant-blocked'
$request.observedProcesses = @($tree.observedProcesses)
$reparented = Get-ProfileProcessState -Items ($base + @((Item 203 1 'worker.exe' 'worker' 'C:\other\worker.exe'))) -Request $request -ProbePid 102
Assert-Equal $reparented.blockedCount 1 'observed-reparented-blocked'
$reused = Get-ProfileProcessState -Items ($base + @((Item 203 1 'worker.exe' 'worker' 'C:\other\worker.exe' '2026-10-17T01:00:00Z'))) -Request $request -ProbePid 102
Assert-Equal $reused.blockedCount 0 'pid-reuse-not-related'
$request.wrapperPid = 202
$rejected = $false
try { Get-ProfileProcessState -Items $base -Request $request -ProbePid 102 | Out-Null } catch { $rejected = $true }
Assert-Equal $rejected $true 'wrapper-identity-required'
Write-Output 'Process classifier fixtures passed.'
