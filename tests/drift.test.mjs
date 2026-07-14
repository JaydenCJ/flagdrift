// The diff engine: every drift code D101–D108, the exemptions that keep
// the tool quiet on healthy repos, ignore patterns, and the forgiving
// default comparison. Surfaces are built from real parse/scan calls so
// these tests cover the integration seam, not hand-mocked structs.
import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultsEqual,
  diffSurfaces,
  nearest,
  parseHelp,
  scanMarkdown,
  summarize,
} from "../dist/index.js";

const HELP = parseHelp(`Usage: shipctl <command> [options]

Commands:
  build    Build the release artifacts
  push     Upload artifacts
  status   Show the last push

Options:
  -o, --out <DIR>       write artifacts here [default: dist]
      --retries <N>     retry failed uploads [default: 3]
      --dry-run         print what would happen
      --timeout <SECS>  per-request timeout [default: 30] (deprecated)
  -q, --quiet           only errors
  -h, --help            print this help
  -V, --version         print the version
`);

function docs(md) {
  return scanMarkdown(md, "doc.md", { tool: "shipctl" });
}

const GOOD_MD = [
  "Run `shipctl build`, `shipctl push`, `shipctl status`.",
  "",
  "| Flag | Default | Effect |",
  "|---|---|---|",
  "| `-o, --out <DIR>` | `dist` | output dir |",
  "| `--retries <N>` | `3` | retries |",
  "| `--dry-run` | — | preview |",
  "| `--timeout <SECS>` | `30` | timeout (deprecated) |",
  "| `-q, --quiet` | — | only errors |",
  "",
].join("\n");

function codesOf(findings) {
  return findings.map((f) => f.code);
}

test("a truthful doc produces zero findings", () => {
  assert.deepEqual(diffSurfaces(HELP, docs(GOOD_MD)), []);
});

test("D101: a live flag missing from the docs is an error", () => {
  const md = GOOD_MD.replace("| `--retries <N>` | `3` | retries |\n", "");
  const findings = diffSurfaces(HELP, docs(md));
  assert.deepEqual(codesOf(findings), ["D101"]);
  assert.equal(findings[0].subject, "--retries");
  assert.match(findings[0].message, /--retries <N>/);
  assert.match(findings[0].fix, /default: 3/);
});

test("D101: documenting only the short form still counts as documented", () => {
  const md = GOOD_MD.replace("`-o, --out <DIR>`", "`-o`");
  const findings = diffSurfaces(HELP, docs(md));
  // No D101 for --out; D108 does not fire either (the short IS shown).
  assert.deepEqual(codesOf(findings), []);
});

test("D102: a documented flag the CLI lacks is an error with did-you-mean", () => {
  const md = GOOD_MD + "\nAlso pass `--retrie` for luck.\n";
  const findings = diffSurfaces(HELP, docs(md));
  assert.deepEqual(codesOf(findings), ["D102"]);
  assert.equal(findings[0].file, "doc.md");
  assert.match(findings[0].message, /did you mean `--retries`\?/);

  // Reported once per spelling, however often the docs repeat it.
  const noisy = GOOD_MD + "\n`--ghost` here, `--ghost` there, `--ghost` everywhere.\n";
  const once = diffSurfaces(HELP, docs(noisy));
  assert.equal(once.filter((f) => f.code === "D102").length, 1);
});

test("D103: a stale table default is a warning naming both values", () => {
  const md = GOOD_MD.replace("| `--retries <N>` | `3` |", "| `--retries <N>` | `5` |");
  const findings = diffSurfaces(HELP, docs(md));
  assert.deepEqual(codesOf(findings), ["D103"]);
  assert.match(findings[0].message, /`5`.*`3`/);
});

test("D103 does not fire when formats differ but values agree", () => {
  // Quotes/backticks and numeric formatting are normalized away.
  const md = GOOD_MD.replace("| `--retries <N>` | `3` |", '| `--retries <N>` | "3.0" |');
  assert.deepEqual(diffSurfaces(HELP, docs(md)), []);
});

test("D104: attaching a value to a boolean flag is a warning", () => {
  const md = GOOD_MD + "\nUse `--dry-run=fast` to hurry.\n";
  const findings = diffSurfaces(HELP, docs(md));
  assert.deepEqual(codesOf(findings), ["D104"]);
  assert.match(findings[0].message, /--dry-run=fast/);

  // Value flags used with values are exactly what docs should show.
  const fine = GOOD_MD + "\nUse `--retries=9` when flaky.\n";
  assert.deepEqual(diffSurfaces(HELP, docs(fine)), []);
});

test("D105: a subcommand the docs never invoke is a warning", () => {
  const md = GOOD_MD.replace(", `shipctl status`", "");
  const findings = diffSurfaces(HELP, docs(md));
  assert.deepEqual(codesOf(findings), ["D105"]);
  assert.equal(findings[0].subject, "status");
});

test("D106: invoking a subcommand the CLI lacks is an error", () => {
  const md = GOOD_MD + "\nThen `shipctl deploy` to production.\n";
  const findings = diffSurfaces(HELP, docs(md));
  assert.deepEqual(codesOf(findings), ["D106"]);
  assert.equal(findings[0].severity, "error");
});

test("subcommand checks are skipped when the help lists no commands", () => {
  const flat = parseHelp("Options:\n  -a, --alpha   the only flag\n");
  const md = "`tool frobnicate` and `-a, --alpha`.\n";
  const surface = scanMarkdown(md, "doc.md", { tool: "tool" });
  assert.deepEqual(diffSurfaces(flat, surface), []);
});

test("D107: a deprecated flag documented without a note is an info", () => {
  const md = GOOD_MD.replace("timeout (deprecated)", "timeout");
  const findings = diffSurfaces(HELP, docs(md));
  assert.deepEqual(codesOf(findings), ["D107"]);
});

test("hiding a deprecated flag from the docs entirely is fine (no D101)", () => {
  const md = GOOD_MD.replace("| `--timeout <SECS>` | `30` | timeout (deprecated) |\n", "");
  assert.deepEqual(diffSurfaces(HELP, docs(md)), []);
});

test("D108: a short alias the docs never show is an info", () => {
  const md = GOOD_MD.replace("`-q, --quiet`", "`--quiet`");
  const findings = diffSurfaces(HELP, docs(md));
  assert.deepEqual(codesOf(findings), ["D108"]);
  assert.match(findings[0].message, /`-q`/);
});

test("--help/--version/-h/-V are exempt in both directions", () => {
  const md = GOOD_MD + "\nSee `shipctl --help` and `--version`.\n";
  assert.deepEqual(diffSurfaces(HELP, docs(md)), []);
  // And their absence from docs is equally fine: GOOD_MD never mentions them.
  assert.deepEqual(diffSurfaces(HELP, docs(GOOD_MD)), []);
});

test("auto-generated help/completion subcommands are exempt", () => {
  const withHelp = parseHelp(`Usage: t <command>

Commands:
  run         Run it
  completion  Generate shell completion
  help        Help about any command

Options:
  -a, --alpha    a flag
`);
  const md = "`t run` with `-a, --alpha`.\n";
  const surface = scanMarkdown(md, "doc.md", { tool: "t" });
  assert.deepEqual(diffSurfaces(withHelp, surface), []);
});

test("ignore: exact spellings silence both directions", () => {
  const md = GOOD_MD.replace("| `--retries <N>` | `3` | retries |\n", "") +
    "\nUse `--ghost` maybe.\n";
  const findings = diffSurfaces(HELP, docs(md), {
    ignore: ["--retries", "--ghost"],
  });
  assert.deepEqual(findings, []);
});

test("ignore: trailing * matches a prefix; subcommand names match too", () => {
  const md = GOOD_MD.replace(", `shipctl status`", "") + "\n`--debug-trace` is internal.\n";
  const findings = diffSurfaces(HELP, docs(md), { ignore: ["--debug-*", "stat*"] });
  assert.deepEqual(findings, []);
});

test("findings sort by severity, then code, then subject — deterministically", () => {
  const md = [
    "Run `shipctl build`, `shipctl push`.", // status missing -> D105
    "`shipctl deploy` too.", // D106
    "",
    "| Flag | Default | Effect |",
    "|---|---|---|",
    "| `-o, --out <DIR>` | `dist` | output |",
    "| `--dry-run` | — | preview |",
    "| `--timeout <SECS>` | `60` | timeout |", // D103 + D107
    "| `--quiet` | — | only errors |", // D108 (-q hidden)
    "",
  ].join("\n"); // --retries missing -> D101
  const findings = diffSurfaces(HELP, docs(md));
  assert.deepEqual(codesOf(findings), [
    "D101", "D106", "D103", "D105", "D107", "D108",
  ]);
  const again = diffSurfaces(HELP, docs(md));
  assert.deepEqual(findings, again);
  assert.deepEqual(summarize(findings), { errors: 2, warnings: 2, infos: 2 });
});

test("defaultsEqual: forgiving on format, strict on meaning", () => {
  assert.ok(defaultsEqual("`3`", "3"));
  assert.ok(defaultsEqual('"3.0"', "3"));
  assert.ok(defaultsEqual("TRUE", "true"));
  assert.ok(defaultsEqual("'auto'", "auto"));
  assert.ok(!defaultsEqual("5", "3"));
  assert.ok(!defaultsEqual("fast", "slow"));
  assert.ok(!defaultsEqual("", "3"));
});

test("nearest: suggests within edit distance 3, stays quiet beyond", () => {
  assert.equal(nearest("--retrie", ["--retries", "--out"]), "--retries");
  assert.equal(nearest("--zzzzzz", ["--retries", "--out"]), undefined);
});
