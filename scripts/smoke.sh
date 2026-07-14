#!/usr/bin/env bash
# Smoke test for flagdrift: exercises the real CLI end to end against the
# bundled shipctl example and flagdrift's own docs (the dogfood gate).
# No network, idempotent, runs from a clean checkout (after `npm install`).
# Prints "SMOKE OK" on success.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

fail() {
  echo "SMOKE FAIL: $1" >&2
  exit 1
}

# 1. Build (idempotent).
npm run build >/dev/null 2>&1 || fail "npm run build failed"
CLI="node $ROOT/dist/cli.js"
echo "[smoke] build ok"

# 2. --version matches package.json; --help documents the surface.
PKG_VERSION="$(node -p "require('$ROOT/package.json').version")"
CLI_VERSION="$($CLI --version)"
[ "$CLI_VERSION" = "$PKG_VERSION" ] || fail "--version mismatch: $CLI_VERSION != $PKG_VERSION"
HELP="$($CLI --help)"
for word in check parse docs explain --fail-on --format --ignore "Exit codes"; do
  echo "$HELP" | grep -q -- "$word" || fail "--help missing $word"
done
echo "[smoke] --help/--version ok ($CLI_VERSION)"

# 3. Usage errors exit 2 (distinct from drift's exit 1).
set +e
$CLI --frobnicate >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "unknown flag should exit 2"; }
$CLI check --config "$WORKDIR/nope.json" >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "missing config should exit 2"; }
$CLI check --cmd "true" --docs README.md >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "silent help command should exit 2"; }
$CLI explain D999 >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "unknown code should exit 2"; }
set -e
echo "[smoke] error handling ok (exit 2)"

# 4. The truthful example passes with zero findings.
(cd examples/demo && $CLI check --config flagdrift.json) >/dev/null \
  || fail "examples/demo (good docs) should exit 0"
GOOD_OUT="$(cd examples/demo && $CLI check --config flagdrift.json)"
echo "$GOOD_OUT" | grep -q 'flagdrift: OK — 0 errors, 0 warnings, 0 info' \
  || fail "good example should be spotless"
echo "[smoke] truthful example ok (exit 0)"

# 5. The drifted example fails with all eight seeded codes.
set +e
DRIFT_OUT="$(cd examples/demo && $CLI check --config flagdrift.drifted.json)"; DRIFT_CODE=$?
set -e
[ "$DRIFT_CODE" -eq 1 ] || fail "drifted example should exit 1, got $DRIFT_CODE"
for code in D101 D102 D103 D104 D105 D106 D107 D108; do
  echo "$DRIFT_OUT" | grep -q "$code" || fail "drifted report missing $code"
done
echo "$DRIFT_OUT" | grep -q '3 errors, 3 warnings, 3 info' || fail "drifted counts wrong"
echo "$DRIFT_OUT" | grep -q "the docs say the default for \`--timeout\` is \`60\`, but --help says \`30\`" \
  || fail "stale-default message wrong"
echo "[smoke] drifted example ok (all 8 codes)"

# 6. Dogfood: flagdrift's own --help vs docs/cli.md must be clean.
$CLI check --cmd "$CLI --help" --docs docs/cli.md >/dev/null \
  || fail "dogfood check failed: docs/cli.md drifted from the real CLI"
echo "[smoke] dogfood ok (docs/cli.md matches the real --help)"

# 7. --fail-on moves the gate; --ignore silences named drift.
set +e
(cd examples/demo && $CLI check --config flagdrift.drifted.json --fail-on never) >/dev/null 2>&1
[ $? -eq 0 ] || { set -e; fail "--fail-on never should exit 0"; }
(cd examples/demo && $CLI check --cmd "node democli.mjs --help" --docs docs/drifted.md \
  --ignore '--retries' --ignore '--concurrency' --ignore '--timeout' --ignore '--dry-run' \
  --ignore '--out' --ignore '--tag' --ignore status --ignore deploy) >/dev/null 2>&1
[ $? -eq 0 ] || { set -e; fail "--ignore should silence every seeded finding"; }
set -e
echo "[smoke] --fail-on / --ignore ok"

# 8. JSON output is valid JSON with the stable shape.
set +e
JSON_OUT="$(cd examples/demo && $CLI check --config flagdrift.drifted.json --format json)"; JSON_CODE=$?
set -e
[ "$JSON_CODE" -eq 1 ] || fail "json run should still exit 1"
echo "$JSON_OUT" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);if(j.ok!==false||j.summary.errors!==3||j.targets[0].name!=='shipctl')throw new Error('bad shape')})" \
  || fail "--format json shape wrong"
echo "[smoke] JSON output ok"

# 9. parse and docs expose both sides of the diff.
$CLI parse --cmd "node examples/demo/democli.mjs --help" | grep -q -- '--retries <N>  \[default: 3\]' \
  || fail "parse should show --retries with its default"
$CLI docs examples/demo/docs/good.md | grep -q -- '--retries  x2' \
  || fail "docs should count both --retries mentions in good.md"
echo "[smoke] parse/docs ok"

# 10. explain documents the catalog offline.
$CLI explain D102 | grep -q "phantom flag" || fail "explain D102 failed"
[ "$($CLI explain codes | wc -l)" -eq 8 ] || fail "explain codes should list 8 codes"
$CLI explain exit-codes | grep -q "usage or execution error" || fail "explain exit-codes failed"
echo "[smoke] explain ok"

# 11. Fix loop on a fresh temp project: drift -> edit the docs -> clean.
cat > "$WORKDIR/help.txt" <<'EOF'
Usage: tinytool [options]

Options:
  -n, --dry-run     preview only
      --jobs <N>    parallel jobs [default: 4]
EOF
cat > "$WORKDIR/README.md" <<'EOF'
# tinytool

| Flag | Default | Effect |
|---|---|---|
| `-n, --dry-run` | — | preview only |
EOF
set +e
(cd "$WORKDIR" && $CLI check --help-file help.txt --docs README.md) > "$WORKDIR/before.txt"
[ $? -eq 1 ] || { set -e; fail "temp project should drift (missing --jobs)"; }
set -e
grep -q 'D101' "$WORKDIR/before.txt" || fail "temp project should report D101"
printf '| `--jobs <N>` | `4` | parallel jobs |\n' >> "$WORKDIR/README.md"
(cd "$WORKDIR" && $CLI check --help-file help.txt --docs README.md) >/dev/null \
  || fail "temp project should be clean after documenting --jobs"
echo "[smoke] fix loop ok (D101 -> document the flag -> clean)"

# 12. Determinism: two runs over the same tree are byte-identical.
(cd examples/demo && $CLI check --config flagdrift.drifted.json) > "$WORKDIR/run1.txt" 2>/dev/null || true
(cd examples/demo && $CLI check --config flagdrift.drifted.json) > "$WORKDIR/run2.txt" 2>/dev/null || true
cmp -s "$WORKDIR/run1.txt" "$WORKDIR/run2.txt" || fail "repeat runs differ"
echo "[smoke] determinism ok"

echo "SMOKE OK"
