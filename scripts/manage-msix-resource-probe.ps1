param(
 [ValidateSet('Install','Remove')][string]$Action,
 [string]$BuildReport,
 [string]$PackageSHA256,
 [string]$SignerThumbprint
)
$ErrorActionPreference='Stop'

function Assert-MsixApplicationStopped {
 param([Parameter(Mandatory=$true)][AllowEmptyCollection()][object[]]$Processes,[Parameter(Mandatory=$true)][string]$Source)
 $root=[IO.Path]::GetFullPath($Source).TrimEnd('\')+'\'
 foreach($process in $Processes){
  $name=[string]$process.Name
  $executable=[string]$process.ExecutablePath
  # Optional-package removal can terminate its main application even without
  # any ForceApplicationShutdown switch. Refuse every Claude image, including
  # ones whose path is unreadable, and all processes under the package root.
  if($name -ieq 'claude.exe' -or ($executable -and $executable.StartsWith($root,[StringComparison]::OrdinalIgnoreCase))){throw 'MSIX_PROBE_APPLICATION_RUNNING'}
 }
}

# Dot-sourcing exposes only the pure process guard for isolated fixture tests.
if($MyInvocation.InvocationName -eq '.'){return}
if(-not $Action -or -not $BuildReport){throw 'Action and BuildReport are required'}
$reportPath=(Resolve-Path -LiteralPath $BuildReport).Path
$report=Get-Content -Raw -LiteralPath $reportPath|ConvertFrom-Json
if($report.packageName -notmatch '^ClaudeChinese\.ResourceProbe\.[a-f0-9]{12}$'){throw 'Unexpected probe package name'}
$main=@(Get-AppxPackage -Name Claude)
if($main.Count -ne 1){throw 'Expected exactly one registered Claude package'}
$source=Join-Path $main[0].InstallLocation 'app'
if([IO.Path]::GetFullPath($report.source) -ne [IO.Path]::GetFullPath($source) -or [string]$main[0].Version -ne $report.originalVersion){throw 'Probe installation/version changed'}

function Assert-StoppedNow {
 $all=@(Get-CimInstance Win32_Process -ErrorAction Stop)
 Assert-MsixApplicationStopped -Processes $all -Source $source
}
Assert-StoppedNow
$lockPath=Join-Path ([IO.Path]::GetDirectoryName($reportPath)) 'deployment.lock'
$lock=[IO.File]::Open($lockPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try {
 if($Action -eq 'Install'){
  if($PackageSHA256 -notmatch '^[a-fA-F0-9]{64}$' -or $SignerThumbprint -notmatch '^[a-fA-F0-9]{40}$'){throw 'Explicit package SHA256 and signer thumbprint required'}
  $packageFile=(Resolve-Path -LiteralPath $report.file).Path
  if((Get-FileHash -Algorithm SHA256 -LiteralPath $packageFile).Hash -ne $PackageSHA256){throw 'Probe package hash changed'}
  $signature=Get-AuthenticodeSignature -LiteralPath $packageFile
  if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $SignerThumbprint){throw 'Probe signature is not trusted or signer changed'}
  if(@(Get-AppxPackage -PackageTypeFilter Optional -Name $report.packageName).Count){throw 'Probe already installed; inspect and remove before a different trial'}
  Assert-StoppedNow
  Add-AppxPackage -Path $packageFile -DeferRegistrationWhenPackagesAreInUse
  $installed=@(Get-AppxPackage -PackageTypeFilter Optional -Name $report.packageName)
  if($installed.Count -ne 1){throw 'Probe registration not confirmed'}
  [pscustomobject]@{action='installed';packageFullName=$installed[0].PackageFullName;certificateTrustChanged=$false}|ConvertTo-Json
 } else {
  $installed=@(Get-AppxPackage -PackageTypeFilter Optional -Name $report.packageName)
  if($installed.Count -eq 0){[pscustomobject]@{action='already-removed';certificateTrustChanged=$false}|ConvertTo-Json;return}
  if($installed.Count -ne 1 -or $installed[0].Name -ne $report.packageName){throw 'Probe cleanup target is ambiguous'}
  Assert-StoppedNow
  Remove-AppxPackage -Package $installed[0].PackageFullName
  if(@(Get-AppxPackage -PackageTypeFilter Optional -Name $report.packageName).Count){throw 'Probe cleanup not confirmed'}
  [pscustomobject]@{action='removed';certificateTrustChanged=$false}|ConvertTo-Json
 }
} finally {
 $lock.Dispose()
 Remove-Item -LiteralPath $lockPath
}
