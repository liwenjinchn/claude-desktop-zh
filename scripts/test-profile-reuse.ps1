param(
    [ValidateSet('Preflight', 'Snapshot')][string]$Mode = 'Preflight',
    [Parameter(Mandatory = $true)][string]$SourceApp,
    [Parameter(Mandatory = $true)][string]$ProfileDirectory,
    [string]$CatalogDirectory,
    [string]$OutputParent,
    [ValidateSet('zh-Hans', 'zh-Hant')][string]$Locale = 'zh-Hans',
    [ValidateRange(1, 86400)][int]$TimeoutSeconds = 600,
    [ValidateRange(1, 60)][int]$PollSeconds = 3,
    [ValidateRange(2, 300)][int]$StableSeconds = 6,
    [string]$NodePath = 'node'
)
# Run from an independent terminal. This wrapper never exits or launches Claude.
$ErrorActionPreference = 'Stop'
try {
    $repo = Split-Path -Parent $PSScriptRoot
    if (!$CatalogDirectory) { $CatalogDirectory = Join-Path $repo '.catalogs' }
    if (!$OutputParent) { $OutputParent = Join-Path $repo '.handoff\profile-tests' }
    $entry = Join-Path $PSScriptRoot 'test-profile-reuse.mjs'
    & $NodePath $entry --mode $Mode --source $SourceApp --profile $ProfileDirectory `
        --catalog-dir $CatalogDirectory --output-parent $OutputParent --locale $Locale `
        --timeout-seconds $TimeoutSeconds --poll-seconds $PollSeconds `
        --stable-seconds $StableSeconds --wrapper-pid $PID
    exit $LASTEXITCODE
} catch {
    # Exception messages can contain private paths or native command output.
    Write-Host 'TESTER_WRAPPER_FAILED: Node.js 22+ and readable local paths are required.'
    exit 1
}
