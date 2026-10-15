#!/bin/sh
set -eu
script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
exec node "$script_dir/../bin/claude-3p-zh.mjs" "$@"
