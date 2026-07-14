# flagdrift examples

Everything here is offline and deterministic: `demo/democli.mjs` is a toy
CLI (`shipctl`) that only prints a fixed `--help` text, so the examples
run identically on any machine.

## demo/ — one CLI, two docs

| File | Purpose |
|---|---|
| `demo/democli.mjs` | the toy CLI; `node democli.mjs --help` prints its surface |
| `demo/docs/good.md` | docs that match the help exactly — zero findings |
| `demo/docs/drifted.md` | docs with one seeded lie per drift code |
| `demo/flagdrift.json` | config checking the truthful docs (exits 0) |
| `demo/flagdrift.drifted.json` | config checking the drifted docs (exits 1) |

Run both:

```bash
cd demo
node ../../dist/cli.js check --config flagdrift.json          # OK, exit 0
node ../../dist/cli.js check --config flagdrift.drifted.json  # FAIL, exit 1
```

## The seeded drift, code by code

| Code | The lie in `drifted.md` |
|---|---|
| D101 | `--retries` was dropped from the flag table |
| D102 | the quickstart passes `--concurrency`, which shipctl never had |
| D103 | the table says the `--timeout` default is `60`; the help says `30` |
| D104 | the quickstart writes `--dry-run=fast`, but `--dry-run` is boolean |
| D105 | the `status` subcommand is never invoked |
| D106 | the quickstart runs `shipctl deploy`, which does not exist |
| D107 | `--timeout` is deprecated in the help, documented without a note |
| D108 | `-o` and `-t` short forms vanished from the flag table |

Diff `docs/good.md` against `docs/drifted.md` to see exactly how little a
doc has to rot before it starts lying.

## CI gate

`ci-gate.sh` is the whole integration story — run flagdrift with your
config and let the exit code fail the pipeline:

```bash
bash ci-gate.sh   # runs the truthful demo config, exits non-zero on drift
```
