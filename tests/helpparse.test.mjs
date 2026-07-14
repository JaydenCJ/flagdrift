// Help-text parsing across the dialects of the mainstream generators:
// GNU/getopt, clap v4, Python argparse, Go's flag package, cobra and
// commander. Each sample below is shaped like the real generator's
// output, so a regression here means a real CLI stops parsing.
import test from "node:test";
import assert from "node:assert/strict";
import { parseHelp, spellingsOf } from "../dist/index.js";

function byName(surface, name) {
  const f = surface.flags.find((x) => x.name === name);
  assert.ok(f, `expected flag ${name}, got: ${surface.flags.map((x) => x.name).join(", ")}`);
  return f;
}

test("GNU style: short+long pairs, long-only flags, descriptions", () => {
  const s = parseHelp(`Usage: greptool [OPTION]... PATTERNS [FILE]...

Options:
  -i, --ignore-case         ignore case distinctions
  -v, --invert-match        select non-matching lines
      --include=GLOB        search only files that match GLOB
  -m, --max-count=NUM       stop after NUM selected lines
`);
  assert.equal(s.tool, "greptool");
  assert.equal(s.flags.length, 4);
  const ic = byName(s, "--ignore-case");
  assert.deepEqual(ic.aliases, ["-i"]);
  assert.equal(ic.takesValue, false);
  assert.equal(ic.description, "ignore case distinctions");
  const inc = byName(s, "--include");
  assert.equal(inc.takesValue, true);
  assert.equal(inc.placeholder, "GLOB");
  const mc = byName(s, "--max-count");
  assert.equal(mc.takesValue, true);
  assert.equal(mc.placeholder, "NUM");
});

test("clap v4 style: <PLACEHOLDER>, [default: …], [possible values: …]", () => {
  const s = parseHelp(`Usage: rgtool [OPTIONS] PATTERN

Options:
      --color <WHEN>     Controls when to use color [default: auto] [possible values: never, auto, always]
  -j, --threads <NUM>    The approximate number of threads to use [default: 0]
`);
  const color = byName(s, "--color");
  assert.equal(color.defaultValue, "auto");
  assert.deepEqual(color.choices, ["never", "auto", "always"]);
  const threads = byName(s, "--threads");
  assert.equal(threads.defaultValue, "0");
  assert.equal(threads.placeholder, "NUM");

  // clap's [aliases: …] become extra spellings.
  const aliased = parseHelp(`Options:
      --no-ignore    Don't respect ignore files [aliases: unrestricted]
`);
  const f = aliased.flags[0];
  assert.ok(f.aliases.includes("--unrestricted"));
  assert.deepEqual(spellingsOf(f).sort(), ["--no-ignore", "--unrestricted"]);
});

test("argparse style: -o OUT, --out OUT with {choices} placeholders", () => {
  const s = parseHelp(`usage: piptool [-h] [-o OUT] [--log-level {debug,info,warning}] cmd

options:
  -h, --help            show this help message and exit
  -o OUT, --out OUT     write the report to OUT
  --log-level {debug,info,warning}
                        set the log verbosity
`);
  const out = byName(s, "--out");
  assert.deepEqual(out.aliases, ["-o"]);
  assert.equal(out.takesValue, true);
  assert.equal(out.placeholder, "OUT");
  const lvl = byName(s, "--log-level");
  assert.deepEqual(lvl.choices, ["debug", "info", "warning"]);
  // The description arrived on a continuation line.
  assert.equal(lvl.description, "set the log verbosity");
});

test("Go flag style: single-dash long flags, description on the next line", () => {
  const s = parseHelp(`Usage of gotool:
  -count int
        number of iterations (default 3)
  -dry-run
        print what would happen
  -name string
        object to operate on (default "main")
  -v    verbose output
`);
  const count = byName(s, "-count");
  assert.equal(count.takesValue, true);
  assert.equal(count.defaultValue, "3");
  const dry = byName(s, "-dry-run");
  assert.equal(dry.takesValue, false);
  const name = byName(s, "-name");
  assert.equal(name.defaultValue, "main"); // quotes stripped
  assert.equal(byName(s, "-v").takesValue, false);
});

test("Go bool flags print a type but take no value", () => {
  const s = parseHelp(`Usage of gotool:
  -force bool
        do it anyway
`);
  assert.equal(byName(s, "-force").takesValue, false);
});

test("cobra style: Available Commands + Flags + Global Flags, deduped", () => {
  const s = parseHelp(`A container thing.

Usage:
  cubectl [command]

Available Commands:
  apply       Apply a configuration
  get, g      Display resources
  delete      Delete resources

Flags:
  -n, --namespace string   the namespace scope
  -o, --output string      output format
  -h, --help               help for cubectl

Global Flags:
  -n, --namespace string   the namespace scope
`);
  assert.equal(s.tool, "cubectl");
  assert.deepEqual(s.commands.map((c) => c.name), ["apply", "get", "delete"]);
  assert.deepEqual(s.commands[1].aliases, ["g"]);
  // --namespace appears under Flags and Global Flags: one record.
  assert.equal(s.flags.filter((f) => f.name === "--namespace").length, 1);
});

test("commander style: <value...> variadic placeholders", () => {
  const s = parseHelp(`Usage: webpackish [options]

Options:
  -t, --tag <tag...>   tag to attach (repeatable)
  -d, --debug          output extra debugging
`);
  const tag = byName(s, "--tag");
  assert.equal(tag.takesValue, true);
  assert.equal(tag.placeholder, "tag");
});

test("--[no-] negation expands into both spellings", () => {
  const s = parseHelp(`Options:
      --[no-]color    force or disable colored output
`);
  const f = byName(s, "--color");
  assert.deepEqual(f.aliases, ["--no-color"]);
});

test("deprecation wording in the description marks the flag deprecated", () => {
  const s = parseHelp(`Options:
      --timeout <SECS>  per-request timeout [default: 30] (deprecated, use --retries)
      --retries <N>     retry failed calls
`);
  assert.equal(byName(s, "--timeout").deprecated, true);
  assert.equal(byName(s, "--retries").deprecated, false);
});

test("[default: …] with quotes, and (default X) Go phrasing both extract", () => {
  const s = parseHelp(`Options:
      --mode <M>    the mode [default: "fast lane"]
`);
  assert.equal(byName(s, "--mode").defaultValue, "fast lane");
});

test("multi-line descriptions fold, first [default: …] wins", () => {
  const s = parseHelp(`Options:
      --cache <DIR>   where to keep the cache
                      [default: .cache] older docs said [default: /var/cache]
`);
  assert.equal(byName(s, "--cache").defaultValue, ".cache");
});

test("sections gate parsing: Examples: text is not scanned for flags", () => {
  const s = parseHelp(`Usage: t [options]

Options:
  -a, --alpha    the real flag

Examples:
  -this is not a flag, just an odd example line
`);
  assert.equal(s.flags.length, 1);
  assert.equal(s.flags[0].name, "--alpha");
});

test("flags before any section header still parse (headerless helps)", () => {
  const s = parseHelp(`  -q    quiet
  -x, --extended    extended mode
`);
  assert.equal(s.flags.length, 2);
  assert.equal(byName(s, "--extended").aliases[0], "-x");
});

test("commands are only collected inside a Commands: section", () => {
  const s = parseHelp(`Usage: t <command>

Commands:
  build    Build it
  push     Push it

Options:
  -v, --verbose    chatty
`);
  assert.deepEqual(s.commands.map((c) => c.name), ["build", "push"]);
  // The option description words never leak into commands.
  assert.ok(!s.commands.some((c) => c.name === "chatty"));

  // commander prints argument placeholders right after the command name with a
  // single space (`build [options]`, `deploy <env>`) and separates aliases
  // with `|`; those must not hide the command from D105/D106.
  const c = parseHelp(`Usage: webpackish [options] [command]

Commands:
  build [options]          produce a production bundle
  serve|s [options]        start the dev server
  deploy <env>             ship the bundle
  help [command]           display help for command
`);
  assert.deepEqual(
    c.commands.map((x) => x.name),
    ["build", "serve", "deploy", "help"],
  );
  assert.deepEqual(c.commands[1].aliases, ["s"]);
  assert.equal(c.commands[0].description, "produce a production bundle");
  // The placeholder text itself never becomes a command.
  assert.ok(!c.commands.some((x) => x.name === "options" || x.name === "env"));
});

test("usage line: path prefixes are stripped from the tool name", () => {
  const s = parseHelp(`Usage: /usr/local/bin/mytool [options]

Options:
  -v    verbose
`);
  assert.equal(s.tool, "mytool");
});

test("canonical name prefers the long spelling regardless of print order", () => {
  const s = parseHelp(`Options:
  -o, --out <F>    output
`);
  assert.equal(s.flags[0].name, "--out");
  assert.deepEqual(s.flags[0].aliases, ["-o"]);
});

test("`--opt=<VALUE>` attached placeholders mark the flag value-taking", () => {
  const s = parseHelp(`Options:
      --level=<N>    intensity
      --shape[=WHO]  optional value
`);
  assert.equal(byName(s, "--level").takesValue, true);
  assert.equal(byName(s, "--level").placeholder, "N");
  assert.equal(byName(s, "--shape").takesValue, true);
});

test("empty and flagless input yields an empty surface, no crash", () => {
  assert.deepEqual(parseHelp("").flags, []);
  const prose = parseHelp("This tool has no options.\nReally none.\n");
  assert.deepEqual(prose.flags, []);
  assert.deepEqual(prose.commands, []);
});

test("tabs in help output are treated as indentation", () => {
  const s = parseHelp("Options:\n\t-z, --zeta\tthe last flag\n");
  assert.equal(byName(s, "--zeta").aliases[0], "-z");
});

test("a bare -- separator line is not a flag", () => {
  const s = parseHelp(`Options:
  --     end of options
  -a     alpha
`);
  assert.equal(s.flags.length, 1);
  assert.equal(s.flags[0].name, "-a");
});
