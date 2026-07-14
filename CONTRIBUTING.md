# Contributing to flagdrift

Issues, discussions and pull requests are all welcome — this project aims
to stay small, zero-dependency at runtime, and precise about what it flags.

## Getting started

Requirements: Node.js >= 22.13 (for the stable `node:test` runner used by the suite).

```bash
git clone https://github.com/JaydenCJ/flagdrift.git
cd flagdrift
npm install            # installs typescript, the only devDependency
npm run build          # compile TypeScript to dist/
npm test               # build + 90 node:test tests
bash scripts/smoke.sh  # end-to-end CLI check against examples/ + dogfood
```

`scripts/smoke.sh` exercises the real CLI (check, parse, docs, explain,
exit codes, --fail-on, --ignore, JSON output, the docs-fix loop,
determinism) against the bundled shipctl example, then diffs flagdrift's
own `--help` against `docs/cli.md`. It must print `SMOKE OK`.

## Before you open a pull request

1. `npx tsc -p tsconfig.json --noEmit` — the tree must type-check clean (strict mode is enforced).
2. `npm test` — all tests must pass.
3. `bash scripts/smoke.sh` — must print `SMOKE OK`.
4. Add tests for behavior changes; keep logic in pure, unit-testable
   modules (parsing, scanning and diffing take values — only the CLI
   touches process state, and only `capture.ts` spawns anything).
5. If you touched the CLI surface, update `docs/cli.md` — the smoke
   test dogfoods it and will fail on drift, which is the point.
6. New drift checks need a stable code that is never reused, a row in
   `docs/codes.md`, an `explain` entry, and at least one test.

## Ground rules

- **No runtime dependencies.** The zero-dependency install is a core
  feature; adding one needs justification in the PR and will usually be
  declined.
- No network calls, ever — flagdrift runs the one help command you give
  it, reads the Markdown you list, then prints. That is the whole I/O
  surface.
- Drift codes (`D1xx`) and the JSON report keys are stable API: never
  renumber, repurpose or remove; only add.
- Err on the side of silence: help-text dialects flagdrift cannot parse
  confidently and docs constructs it cannot attribute are skipped rather
  than guessed at. False positives train people to ignore the gate.
- Support for a new help dialect must be additive: every sample in
  `tests/helpparse.test.mjs` must keep parsing identically.
- Code comments and doc comments are written in English.

## Reporting bugs

Please include: `flagdrift --version` output, the exact command line, the
raw `--help` text of the target CLI (attach `flagdrift parse --cmd "…"
--format json` output if you can), and the Markdown snippet involved. If
you believe a finding is wrong, quote what the CLI actually accepts —
observed behavior is the tiebreaker.

## Security

Do not open public issues for security problems; use GitHub private
vulnerability reporting on this repository instead.
