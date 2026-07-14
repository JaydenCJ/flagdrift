#!/usr/bin/env node
// A toy CLI used by the flagdrift examples and the smoke test. It does
// nothing except print a realistic --help text, so every example is
// offline and deterministic.
const HELP = `shipctl 2.4.0 — toy release helper used by the flagdrift examples

Usage: shipctl <command> [options]

Commands:
  build    Build the release artifacts
  push     Upload artifacts to the registry
  status   Show the state of the last push

Options:
  -o, --out <DIR>       write artifacts to this directory [default: dist]
      --retries <N>     retry failed uploads [default: 3]
      --registry <URL>  registry to push to [default: http://127.0.0.1:5000]
      --format <FMT>    output format [default: table] [possible values: table, json]
      --[no-]color      force or disable colored output
  -t, --tag <TAG>       tag to publish; repeatable
      --dry-run         print what would happen without doing it
      --timeout <SECS>  per-request timeout [default: 30] (deprecated, use --retries)
  -q, --quiet           only errors
  -h, --help            print this help
  -V, --version         print the version
`;

const arg = process.argv[2];
if (arg === "--version" || arg === "-V") {
  process.stdout.write("2.4.0\n");
} else {
  process.stdout.write(HELP);
}
