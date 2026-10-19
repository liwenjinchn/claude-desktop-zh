param([Parameter(Mandatory = $true)][string]$RequestFile)
# Internal read-only probe. Never output command lines, registry values or titles.
$ErrorActionPreference = 'Stop'
function Get-ProfileProcessState {
    param([object[]]$Items, [object]$Request, [int]$ProbePid)
    $ignored = @($ProbePid, [int]$Request.runnerPid)
    $runner = @($Items | Where-Object { [int]$_.ProcessId -eq [int]$Request.runnerPid })
    $wrapper = @($Items | Where-Object { [int]$_.ProcessId -eq [int]$Request.wrapperPid })
    if ([int]$Request.wrapperPid -gt 0) {
        if ($runner.Count -ne 1 -or $wrapper.Count -ne 1 -or [int]$runner[0].ParentProcessId -ne [int]$Request.wrapperPid -or [string]$wrapper[0].Name -notmatch '^(?:powershell|pwsh)\.exe$') { throw 'PROBE_WRAPPER_IDENTITY' }
        $ignored += [int]$Request.wrapperPid
    }
    $blocked = @{}
    $unknown = @{}
    $roots = @([string]$Request.source, [string]$Request.profile)
    foreach ($item in $Items) {
        $processId = [int]$item.ProcessId
        if ($ignored -contains $processId) { continue }
        $named = [string]$item.Name -match '^(claude(?:[-_].*)?|cowork(?:[-_].*)?)\.exe$'
        $generic = [string]$item.Name -match '^(?:node|nodejs|python(?:w|\d+(?:\.\d+)?)?|ssh|sshd|wsl|wslhost|wslrelay|vmwp|vmmem(?:WSL)?|bash|sh|zsh|pwsh|powershell|cmd)(?:\.exe)?$'
        $related = $named
        $identity = if ($null -ne $item.CreationDate) { ([datetime]$item.CreationDate).ToUniversalTime().ToString('o') } else { '' }
        foreach ($previous in @($Request.observedProcesses)) {
            if ([int]$previous.pid -eq $processId -and [string]$previous.created -eq $identity) { $related = $true }
        }
        foreach ($root in $roots) {
            if (!$root) { throw 'PROBE_ROOT_REQUIRED' }
            foreach ($value in @([string]$item.ExecutablePath, [string]$item.CommandLine)) {
                if ($value -and $value.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $related = $true }
            }
        }
        if ($related) {
            $blocked[$processId] = $item
            if (!$item.ExecutablePath -or !$item.CommandLine -or !$identity) { $unknown[$processId] = $true }
        } elseif ($generic) {
            # An orphan generic worker may no longer contain any Claude path.
            # Do not infer that it is unrelated merely because ancestry was lost.
            $unknown[$processId] = $true
        }
    }
    do {
        $added = $false
        foreach ($item in $Items) {
            $processId = [int]$item.ProcessId
            if ($ignored -contains $processId) { continue }
            if ($blocked.ContainsKey([int]$item.ParentProcessId) -and !$blocked.ContainsKey($processId)) {
                $blocked[$processId] = $item
                $added = $true
            }
        }
    } while ($added)
    $observed = @($blocked.Values | ForEach-Object {
        $created = if ($null -ne $_.CreationDate) { ([datetime]$_.CreationDate).ToUniversalTime().ToString('o') } else { '' }
        [pscustomobject]@{ pid = [int]$_.ProcessId; created = $created }
    })
    return @{ blockedCount = $blocked.Count; unknownCount = $unknown.Count; observedProcesses = $observed }
}
# Dot sourcing exposes only the pure classifier for fixture tests, with no probe.
if ($MyInvocation.InvocationName -eq '.') { return }
try {
    $request = Get-Content -LiteralPath $RequestFile -Raw | ConvertFrom-Json
    $items = @(Get-CimInstance Win32_Process -ErrorAction Stop)
    $state = Get-ProfileProcessState -Items $items -Request $request -ProbePid $PID
    $registry = @{}
    foreach ($entry in @(
        @{ name = 'protocol'; path = 'Registry::HKEY_CURRENT_USER\Software\Classes\claude' },
        @{ name = 'startup'; path = 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run' }
    )) {
        $values = @()
        if (Test-Path -LiteralPath $entry.path -ErrorAction Stop) {
            $keys = @((Get-Item -LiteralPath $entry.path)) + @(Get-ChildItem -LiteralPath $entry.path -Recurse -ErrorAction Stop)
            foreach ($key in @($keys | Sort-Object Name)) {
                foreach ($valueName in @($key.GetValueNames() | Sort-Object)) {
                    $values += [pscustomobject]@{ key = $key.Name; name = $valueName; kind = [string]$key.GetValueKind($valueName); value = $key.GetValue($valueName) }
                }
            }
        }
        $text = ConvertTo-Json -InputObject @($values) -Depth 12 -Compress
        $hasher = [Security.Cryptography.SHA256]::Create()
        try { $hash = [BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($text))).Replace('-', '').ToLowerInvariant() }
        finally { $hasher.Dispose() }
        $registry[$entry.name] = $hash
    }
    $result = @{ schema = 1; ok = $true; blockedCount = $state.blockedCount; unknownCount = $state.unknownCount; observedProcesses = @($state.observedProcesses); registry = $registry }
    $result | ConvertTo-Json -Depth 5 -Compress | Set-Content -LiteralPath $request.resultFile -Encoding UTF8
    exit 0
} catch {
    # Raw native errors may include sensitive process arguments or registry values.
    exit 1
}
