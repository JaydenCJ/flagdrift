#!/usr/bin/env bash
# Minimal CI gate: fail the pipeline when the docs drift from the CLI.
# Copy this into your pipeline and point --config at your flagdrift.json.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/demo"

# In a real pipeline this would be `flagdrift check --config flagdrift.json`
# (or `npx flagdrift …`). The example uses the checked-out build directly.
node ../../dist/cli.js check --config flagdrift.json --fail-on warning
echo "docs and --help agree — safe to ship"
