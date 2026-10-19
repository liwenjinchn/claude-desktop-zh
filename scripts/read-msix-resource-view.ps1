param([Parameter(Mandatory=$true)][string]$BuildReport)
$ErrorActionPreference='Stop'

# Read the effective resources in a real registered MSIX context, without
# starting Claude, touching its profile, changing trust, or injecting code.
# This is a diagnostic process, not a replacement launcher for normal use.
$reportPath=(Resolve-Path -LiteralPath $BuildReport).Path
$report=Get-Content -Raw -LiteralPath $reportPath | ConvertFrom-Json
$packages=@(Get-AppxPackage -Name Claude)
if($packages.Count -ne 1){throw 'Expected exactly one registered Claude package'}
$package=$packages[0]
$source=Join-Path $package.InstallLocation 'app'
if([IO.Path]::GetFullPath($report.source) -ne [IO.Path]::GetFullPath($source)){throw 'Build report belongs to a different installation'}
$resource=[IO.Path]::GetFullPath($report.resource)
$resourceRoot=[IO.Path]::GetFullPath((Join-Path $source 'resources'))+[IO.Path]::DirectorySeparatorChar
if(-not $resource.StartsWith($resourceRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Resource path is outside the registered package'}
if($report.probeSHA256 -notmatch '^[a-f0-9]{64}$'){throw 'Invalid probe resource hash'}
$output=Join-Path ([IO.Path]::GetDirectoryName($reportPath)) ('view-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$script=Join-Path $output 'read-view.ps1'
$resultFile=Join-Path $output 'result.json'
@'
param([string]$Resource,[string]$Output)
$ErrorActionPreference='Stop'
try {
  Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class ResourceViewIdentity {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] public static extern int GetCurrentPackageFullName(ref uint length, StringBuilder name);
}
"@
  [uint32]$length=0
  $code=[ResourceViewIdentity]::GetCurrentPackageFullName([ref]$length,$null)
  $name=New-Object Text.StringBuilder ([int][Math]::Max(1,$length))
  $code=[ResourceViewIdentity]::GetCurrentPackageFullName([ref]$length,$name)
  @{identityCode=$code;packageFullName=$name.ToString();resourceSHA256=(Get-FileHash -Algorithm SHA256 -LiteralPath $Resource).Hash.ToLowerInvariant()} | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath $Output
} catch {
  @{errorType=$_.Exception.GetType().Name;hresult=$_.Exception.HResult}|ConvertTo-Json|Set-Content -Encoding UTF8 -LiteralPath $Output
}
'@ | Set-Content -Encoding UTF8 -LiteralPath $script
foreach($value in @($script,$resource,$resultFile)){if($value.Contains('"')){throw 'Invalid diagnostic argument'}}
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$script+'" -Resource "'+$resource+'" -Output "'+$resultFile+'"'
Invoke-CommandInDesktopPackage -PackageFamilyName $package.PackageFamilyName -AppId Claude -Command (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -Args $arguments
$deadline=[DateTime]::UtcNow.AddSeconds(10)
while(-not (Test-Path -LiteralPath $resultFile)) {
  if([DateTime]::UtcNow -gt $deadline){throw 'Package-view diagnostic timed out; no process was terminated'}
  Start-Sleep -Milliseconds 100
}
$view=Get-Content -Raw -LiteralPath $resultFile | ConvertFrom-Json
if($view.errorType){throw ('Package-view diagnostic failed: '+$view.errorType)}
$identityMatches=$view.identityCode -eq 0 -and $view.packageFullName -eq $package.PackageFullName
$overlaid=$identityMatches -and $view.resourceSHA256 -eq $report.probeSHA256
$result=[ordered]@{schema=1;packageFullName=$package.PackageFullName;identityMatches=$identityMatches;resourceSHA256=$view.resourceSHA256;expectedSHA256=$report.probeSHA256;overlayVerified=$overlaid;diagnosticOnly=$true;claudeStarted=$false;certificateStoreModified=$false;output=$output}
$result|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $output 'report.json') -Encoding UTF8
$result|ConvertTo-Json
if(-not $identityMatches){exit 1}
if(-not $overlaid){exit 3}
