#!/usr/bin/env node
// Deterministic fixture CLI for the integration tests: prints a small,
// fixed --help text and nothing else. No arguments, no environment, no
// clock — the same bytes on every run.
process.stdout.write(`Usage: fakecli <command> [options]

Commands:
  run     Run the thing
  clean   Remove outputs

Options:
  -o, --out <DIR>    output directory [default: build]
      --level <N>    effort level [default: 2]
      --fast         skip the slow parts
  -h, --help         print this help
`);
