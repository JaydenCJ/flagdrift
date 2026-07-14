// Markdown scanning: what counts as "the docs claim this flag exists" —
// code spans, reference tables (and their Default column), shell fences —
// and, just as important, what must NOT count: prose dashes, text fences
// holding captured output, HTML comments, horizontal rules.
import test from "node:test";
import assert from "node:assert/strict";
import { scanMarkdown } from "../dist/index.js";

function flags(md, opts) {
  return scanMarkdown(md, "doc.md", opts).flags;
}

function spellings(md, opts) {
  return flags(md, opts).map((f) => f.flag);
}

test("inline code spans document flags; bare prose does not", () => {
  const md = "Use `--verbose` to see more. A plain --loud in prose is ignored.\n";
  assert.deepEqual(spellings(md), ["--verbose"]);
});

test("an em-dash typed as -- and a horizontal rule are not flags", () => {
  const md = "Fast -- really fast -- and simple.\n\n---\n\nMore text.\n";
  assert.deepEqual(spellings(md), []);
});

test("short flags and single-dash long flags are recognized in spans", () => {
  assert.deepEqual(spellings("Run with `-v` or `-count 3`.\n"), ["-v", "-count"]);
});

test("`--flag=value` in a span records the attached value", () => {
  const occ = flags("Set `--level=9` for max.\n")[0];
  assert.equal(occ.flag, "--level");
  assert.equal(occ.attachedValue, "9");
});

test("`--flag <VALUE>` written inside one span records a value shape", () => {
  const occ = flags("Pass `--out <FILE>` to redirect.\n")[0];
  assert.equal(occ.flag, "--out");
  assert.equal(occ.attachedValue, "<FILE>");
});

test("shell and untagged fences are scanned; fence comments are not", () => {
  const md = [
    "```bash",
    "$ mytool run --fast",
    "# --this-is-a-comment, not a flag",
    "```",
    "",
    "```",
    "mytool --go",
    "```",
    "",
  ].join("\n");
  assert.deepEqual(spellings(md), ["--fast", "--go"]);
});

test("text fences (captured output) are never scanned, ``` or ~~~", () => {
  const md = [
    "```text",
    "error: try --frobnicate",
    "```",
    "",
    "~~~text",
    "not scanned --nope",
    "~~~",
    "",
  ].join("\n");
  assert.deepEqual(spellings(md), []);
});

test("fences: false turns off all fence scanning", () => {
  const md = ["```bash", "mytool --fast", "```", "", "And `--kept`.", ""].join("\n");
  assert.deepEqual(spellings(md, { fences: false }), ["--kept"]);
});

test("table rows document flags from any cell, with file:line positions", () => {
  const md = [
    "| Flag | Effect |",
    "|---|---|",
    "| `-o, --out <DIR>` | output dir |",
    "| `--force` | just do it |",
    "",
  ].join("\n");
  const got = flags(md);
  assert.deepEqual(got.map((f) => f.flag), ["-o", "--out", "--force"]);
  assert.equal(got[0].line, 3);
  assert.equal(got[2].line, 4);
  assert.ok(got.every((f) => f.context === "table"));
});

test("the Default column value is pinned to the row's long flag only", () => {
  const md = [
    "| Flag | Default | Effect |",
    "|---|---|---|",
    "| `-r, --retries <N>` | `3` | retry count |",
    "",
  ].join("\n");
  const got = flags(md);
  const short = got.find((f) => f.flag === "-r");
  const long = got.find((f) => f.flag === "--retries");
  assert.equal(long.defaultValue, "3");
  assert.equal(short.defaultValue, undefined);
});

test("empty-ish Default cells (—, n/a, none) mean no default claim", () => {
  for (const cell of ["—", "-", "n/a", "none", ""]) {
    const md = [
      "| Flag | Default |",
      "|---|---|",
      `| \`--x\` | ${cell} |`,
      "",
    ].join("\n");
    const got = flags(md).find((f) => f.flag === "--x");
    assert.equal(got.defaultValue, undefined, `cell: ${JSON.stringify(cell)}`);
  }
});

test("escaped pipes inside cells do not break the column split", () => {
  const md = [
    "| Flag | Default | Effect |",
    "|---|---|---|",
    "| `--mode` | `a` | one of a \\| b |",
    "",
  ].join("\n");
  const got = flags(md).find((f) => f.flag === "--mode");
  assert.equal(got.defaultValue, "a");
});

test("--[no-]color in docs documents both polarities", () => {
  assert.deepEqual(spellings("Use `--[no-]color`.\n"), ["--color", "--no-color"]);
});

test("a deprecation note on the same row/line is recorded", () => {
  const md = [
    "| Flag | Effect |",
    "|---|---|",
    "| `--old` | superseded (deprecated) |",
    "",
    "And `--older` is deprecated too.",
    "",
  ].join("\n");
  const got = flags(md);
  assert.ok(got.find((f) => f.flag === "--old").deprecatedNote);
  assert.ok(got.find((f) => f.flag === "--older").deprecatedNote);
});

test("HTML comments are invisible, including multi-line ones", () => {
  const md = [
    "<!-- `--hidden` should not count -->",
    "<!--",
    "also `--hidden-two`",
    "-->",
    "But `--visible` counts.",
    "",
  ].join("\n");
  assert.deepEqual(spellings(md), ["--visible"]);
});

test("prose apostrophes cannot fabricate flags in table cells", () => {
  const md = [
    "| Subcommand | What it does |",
    "|---|---|",
    "| `x docs` | the docs'-eye view |",
    "",
  ].join("\n");
  assert.deepEqual(spellings(md), []);
});

test("sections filter scopes the scan to matching heading paths", () => {
  const md = [
    "# tool",
    "",
    "Intro has `--noise`.",
    "",
    "## CLI reference",
    "",
    "Real `--signal` here.",
    "",
    "### Sub-details",
    "",
    "Nested `--signal-two` also inside the filter.",
    "",
    "## Other",
    "",
    "`--noise-two` outside again.",
    "",
  ].join("\n");
  assert.deepEqual(spellings(md, { sections: ["cli reference"] }), [
    "--signal",
    "--signal-two",
  ]);

  // Heading breadcrumbs are attached to every occurrence.
  const crumbs = ["# tool", "", "## Flags", "", "Use `--x`.", ""].join("\n");
  assert.equal(flags(crumbs)[0].section, "tool › Flags");
});

test("tool subcommand invocations are collected from spans and fences", () => {
  const md = [
    "Run `shipctl build` first.",
    "",
    "```bash",
    "$ shipctl push --tag v1",
    "./bin/shipctl status",
    "```",
    "",
  ].join("\n");
  const got = scanMarkdown(md, "doc.md", { tool: "shipctl" });
  assert.deepEqual(got.commands.map((c) => c.name), ["build", "push", "status"]);
});

test("subcommand collection needs a tool name and skips flag-shaped words", () => {
  const md = "Run `shipctl --help` and `other build`.\n";
  const anon = scanMarkdown(md, "doc.md", {});
  assert.deepEqual(anon.commands, []);
  const named = scanMarkdown(md, "doc.md", { tool: "shipctl" });
  assert.deepEqual(named.commands, []);
});

test("a fence inside a section outside the filter is skipped", () => {
  const md = [
    "## Skipped",
    "",
    "```bash",
    "tool --hidden",
    "```",
    "",
    "## Kept",
    "",
    "```bash",
    "tool --shown",
    "```",
    "",
  ].join("\n");
  assert.deepEqual(spellings(md, { sections: ["kept"] }), ["--shown"]);
});
