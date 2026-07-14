# flagdrift CLI reference

The complete command surface. This file is itself gated: the smoke test
runs `flagdrift check` with flagdrift's own `--help` against this document,
so if the reference below drifts from the real CLI, the build fails —
the tool eats its own dog food on every run.

## Subcommands

| Subcommand | What it does |
|---|---|
| `flagdrift check` | Compare a CLI's `--help` against its Markdown docs (the default subcommand) |
| `flagdrift parse` | Print the flag surface parsed from a `--help` text — the tool's-eye view |
| `flagdrift docs` | Print the flags found in Markdown files — the docs'-eye view |
| `flagdrift explain` | Describe a drift code, or the topics `codes` and `exit-codes` |

## Options

| Flag | Default | Effect |
|---|---|---|
| `-c, --config <FILE>` | `flagdrift.json` | read check targets from a config file |
| `--cmd <COMMAND>` | — | shell command that prints the help text to diff |
| `--help-file <FILE>` | — | read the help text from a file instead of running a command |
| `--docs <GLOB>` | — | Markdown file or glob to scan; repeatable |
| `--ignore <NAME>` | — | flag or subcommand to exclude, trailing `*` allowed; repeatable |
| `--sections <LIST>` | — | comma-separated heading filter for the docs scan |
| `--no-fences` | — | skip fenced code blocks when scanning docs |
| `--fail-on <LEVEL>` | `warning` | exit 1 at or above this severity: `error`, `warning`, `info`, `never` |
| `--format <FMT>` | `text` | report format: `text` or `json` |
| `-q, --quiet` | — | print only the verdict line |
| `-h, --help` | — | print this help |
| `-V, --version` | — | print the version |

## check

Two ways to point it at a target:

```bash
# ad hoc: a help source plus at least one --docs
flagdrift check --cmd "node ./bin/mycli.js --help" --docs README.md --docs "docs/*.md"

# or from a config file (multiple targets, checked in one run)
flagdrift check --config flagdrift.json
```

The ad-hoc form accepts `--help-file` in place of `--cmd` when the help
text is stored on disk (useful for hermetic CI where the binary is not
built yet). With a config file, `failOn` in the file sets the gate and the
`--fail-on` flag overrides it.

## parse

```bash
flagdrift parse --cmd "node ./bin/mycli.js --help"
flagdrift parse saved-help.txt --format json
```

Prints every flag flagdrift recovered — canonical spelling, aliases,
value placeholder, default, choices, deprecation — plus the subcommand
list. When a check surprises you, this shows what the parser saw.

## docs

```bash
flagdrift docs README.md "docs/*.md"
flagdrift docs README.md --sections "CLI reference" --format json
```

Prints every flag spelling mentioned in the given Markdown files with its
mention count — the surface your docs promise, before any diffing.

## explain

```bash
flagdrift explain D102
flagdrift explain codes
flagdrift explain exit-codes
```

Documents any drift code offline. See [codes.md](codes.md) for the full
catalog with rationale.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | no drift at or above `--fail-on` |
| 1 | drift found at or above `--fail-on` |
| 2 | usage or execution error (bad flag, unreadable docs, help command failed) |
