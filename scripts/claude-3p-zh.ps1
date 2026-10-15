$ErrorActionPreference = 'Stop'
$cli = Join-Path $PSScriptRoot '..\bin\claude-3p-zh.mjs'
& node $cli @args
exit $LASTEXITCODE
