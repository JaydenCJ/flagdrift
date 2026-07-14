# Drift codes

flagdrift reports drift with stable codes. Codes are API: they are never
renumbered or repurposed; new checks get new codes. `flagdrift explain
<code>` prints the same catalog offline.

Severities: **error** means the docs are wrong right now (someone copying
them hits a failure or misses a feature); **warning** means the docs are
misleading; **info** is polish worth knowing about. The `--fail-on` gate
(default `warning`) decides which severities flip the exit code to 1.

## Catalog

| Code | Severity | Name | Fires when |
|---|---|---|---|
| D101 | error | undocumented flag | a live `--help` flag never appears in any scanned Markdown |
| D102 | error | phantom flag | the docs mention a flag the live `--help` does not have |
| D103 | warning | stale default | a reference-table default differs from the `--help` default |
| D104 | warning | value drift | the docs attach a value to a flag `--help` declares boolean |
| D105 | warning | undocumented subcommand | a `Commands:` entry is never invoked in the docs |
| D106 | error | phantom subcommand | the docs invoke a subcommand `--help` does not list |
| D107 | info | deprecated but documented plainly | a deprecated flag is documented without a deprecation note |
| D108 | info | short alias never shown | a short form exists but the docs only ever show the long form |

## Design notes (why the checks are shaped this way)

- **Precision over recall.** Prose outside code spans is never scanned, so
  an em-dash typed as `--` or a horizontal rule can never become a phantom
  flag. Fenced blocks are scanned only when their language tag is
  shell-like (`bash`, `sh`, `console`, …) or absent — a `text` fence
  holding captured program output is quoting the tool, not documenting it.
- **Built-in exemptions.** `--help`, `--version`, `-h` and `-V` are exempt
  from D101/D102/D108 in both directions: nearly every CLI has them, many
  help texts omit them, and either direction would be pure noise. The
  auto-generated `help` / `completion` subcommands are exempt from
  D105/D106 for the same reason.
- **Deprecated flags may hide.** A deprecated flag absent from the docs is
  not D101 — removing it from the docs is a legitimate way to sunset it.
  Documenting it *without saying it is deprecated* is D107.
- **Defaults compare by meaning.** Backticks and quotes are stripped,
  booleans compare case-insensitively, numbers numerically — `` `3` `` in
  a table matches `[default: 3.0]` in the help. Empty-ish cells (`—`,
  `n/a`, `none`) claim nothing and are skipped.
- **Subcommand checks are conditional.** They only run when the help text
  actually lists a `Commands:` section; flagdrift never guesses at a
  command structure the tool did not declare.
- **Every finding carries a fix.** D101 messages include the placeholder
  and default ready to paste; D102/D106 attach a did-you-mean when a live
  name is within edit distance 3.

## Suppressing findings

`--ignore <name>` (repeatable, also per-target `"ignore": […]` in
`flagdrift.json`) silences a flag or subcommand entirely, in both
directions. A trailing `*` matches a prefix: `--ignore '--debug-*'` keeps
a family of internal flags out of the report.
