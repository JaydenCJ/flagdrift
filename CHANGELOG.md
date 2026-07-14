# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-07-13

### Added

- `flagdrift check`: runs a CLI's real `--help` (or reads a saved help
  file), parses the flag surface, scans the project's Markdown docs, and
  fails CI on drift with exit codes 0 (clean) / 1 (drift) / 2 (usage or
  execution error).
- Format-tolerant help parser covering the mainstream generator dialects
  without configuration: GNU/getopt short+long pairs, clap v4
  (`[default: …]`, `[possible values: …]`, `[aliases: …]`), Python
  argparse (`-o OUT, --out OUT`, `{choice}` placeholders), Go's flag
  package (single-dash long flags, next-line descriptions, `(default X)`),
  cobra (`Available Commands:`, `Flags:`/`Global Flags:` dedupe) and
  commander — plus `--[no-]` negation pairs and deprecation markers.
- Precision-first Markdown scanner: inline code spans, reference tables
  (with `Default`-column extraction pinned to the row's long flag), and
  shell-flavored fenced blocks; prose dashes, `text` fences holding
  captured output, fence comments and HTML comments can never fabricate a
  flag. Optional heading-path `sections` filter and `--no-fences`.
- Eight stable drift codes: D101 undocumented flag, D102 phantom flag
  (with did-you-mean), D103 stale default (format-forgiving comparison),
  D104 value drift, D105 undocumented subcommand, D106 phantom
  subcommand, D107 deprecated-but-documented-plainly, D108 short alias
  never shown — with built-in exemptions for `--help`/`--version` and
  auto-generated `help`/`completion` subcommands.
- CLI surface: `check` (ad hoc via `--cmd`/`--help-file` + `--docs`, or
  multi-target via `flagdrift.json`), `parse` and `docs` inspection
  subcommands, `explain` for every code offline; `--fail-on
  error|warning|info|never` (default warning), `--ignore` with trailing
  `*` wildcards, `--format json` with a stable shape, `--quiet`.
- Public programmatic API (`parseHelp`, `scanDocs`, `diffSurfaces`,
  `captureHelp`, `runTarget`, renderers) with type declarations.
- Runnable example (`examples/demo`): a toy `shipctl` CLI with truthful
  docs and a drifted twin seeding one lie per code, plus a CI gate script.
- Test suite: 90 node:test tests (unit + CLI integration in fresh temp
  dirs) and an end-to-end `scripts/smoke.sh` that also dogfoods
  flagdrift's own `--help` against `docs/cli.md`.

[0.1.0]: https://github.com/JaydenCJ/flagdrift/releases/tag/v0.1.0
