// End-to-end CLI integration: the compiled dist/cli.js run as a child
// process against temp docs and a deterministic fixture CLI — exit codes,
// subcommands, gates, JSON output and the usage-error path. This is the
// same surface scripts/smoke.sh exercises.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { withTree } from "./helpers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "dist", "cli.js");
const FAKECLI = path.join(HERE, "fixtures", "fakecli.mjs");
const FAKE_CMD = `node ${FAKECLI} --help`;

function run(args, cwd) {
  const res = spawnSync("node", [CLI, ...args], { cwd, encoding: "utf8" });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

const GOOD_DOC = [
  "# fakecli",
  "",
  "Run `fakecli run` then `fakecli clean`.",
  "",
  "| Flag | Default | Effect |",
  "|---|---|---|",
  "| `-o, --out <DIR>` | `build` | output directory |",
  "| `--level <N>` | `2` | effort level |",
  "| `--fast` | — | skip the slow parts |",
  "",
].join("\n");

const DRIFTED_DOC = GOOD_DOC
  .replace("| `--level <N>` | `2` | effort level |\n", "") // D101
  .replace("`fakecli clean`", "`fakecli scrub`"); // D105 + D106

test("--version prints the package version; --help documents the surface", () => {
  const version = run(["--version"]);
  assert.equal(version.code, 0);
  assert.equal(version.stdout.trim(), "0.1.0");

  const help = run(["--help"]);
  assert.equal(help.code, 0);
  for (const word of ["check", "parse", "docs", "explain", "--fail-on", "--format", "Exit codes"]) {
    assert.ok(help.stdout.includes(word), `help is missing ${word}`);
  }
});

test("check (ad hoc): truthful docs exit 0, drifted docs exit 1 with codes", () => {
  withTree({ "README.md": GOOD_DOC, "DRIFT.md": DRIFTED_DOC }, (dir) => {
    const good = run(["check", "--cmd", FAKE_CMD, "--docs", "README.md"], dir);
    assert.equal(good.code, 0, good.stdout + good.stderr);
    assert.match(good.stdout, /flagdrift: fakecli — 4 help flags, 2 commands/);
    assert.match(good.stdout, /flagdrift: OK — 0 errors/);

    const bad = run(["check", "--cmd", FAKE_CMD, "--docs", "DRIFT.md"], dir);
    assert.equal(bad.code, 1);
    for (const needle of ["D101", "D105", "D106", "--level", "scrub", "did you mean"]) {
      assert.ok(bad.stdout.includes(needle), `report missing ${needle}`);
    }
  });
});

test("check is the default subcommand", () => {
  withTree({ "README.md": GOOD_DOC }, (dir) => {
    const explicit = run(["check", "--cmd", FAKE_CMD, "--docs", "README.md"], dir);
    const implicit = run(["--cmd", FAKE_CMD, "--docs", "README.md"], dir);
    assert.equal(implicit.code, 0);
    assert.equal(implicit.stdout, explicit.stdout);
  });
});

test("usage errors exit 2, distinct from drift's exit 1", () => {
  withTree({ "README.md": GOOD_DOC }, (dir) => {
    const cases = [
      [["--frobnicate"], /unknown flag: --frobnicate/],
      [["check"], /cannot read config file/], // no flagdrift.json here
      [["check", "--cmd", FAKE_CMD], /needs at least one --docs/],
      [["check", "--cmd", FAKE_CMD, "--docs", "MISSING.md"], /docs not found: MISSING\.md/],
      [["check", "--cmd", FAKE_CMD, "--docs", "README.md", "--fail-on", "sometimes"], /--fail-on must be/],
      [["check", "--cmd", "node -e ''", "--docs", "README.md"], /printed nothing/],
      [["explain", "D999"], /unknown drift code/],
    ];
    for (const [args, re] of cases) {
      const r = run(args, dir);
      assert.equal(r.code, 2, `${args.join(" ")} should exit 2, got ${r.code}`);
      assert.match(r.stderr, re, args.join(" "));
    }
  });
});

test("--fail-on moves the gate; --quiet keeps only the verdict", () => {
  withTree({ "DRIFT.md": DRIFTED_DOC }, (dir) => {
    const never = run(
      ["check", "--cmd", FAKE_CMD, "--docs", "DRIFT.md", "--fail-on", "never"],
      dir,
    );
    assert.equal(never.code, 0);
    assert.match(never.stdout, /FAIL|OK/); // findings still printed

    const errorOnly = run(
      ["check", "--cmd", FAKE_CMD, "--docs", "DRIFT.md", "--fail-on", "error", "-q"],
      dir,
    );
    assert.equal(errorOnly.code, 1); // D101/D106 are errors
    assert.equal(errorOnly.stdout.trim().split("\n").length, 1);
  });
});

test("--ignore silences named drift; config file drives multi-target runs", () => {
  withTree(
    {
      "DRIFT.md": DRIFTED_DOC,
      "README.md": GOOD_DOC,
      "flagdrift.json": JSON.stringify({
        failOn: "warning",
        targets: [
          { name: "good", command: FAKE_CMD, docs: ["README.md"] },
          {
            name: "drifty",
            command: FAKE_CMD,
            docs: ["DRIFT.md"],
            ignore: ["--level", "clean", "scrub"],
          },
        ],
      }),
    },
    (dir) => {
      const r = run(["check"], dir);
      assert.equal(r.code, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /flagdrift: good —/);
      assert.match(r.stdout, /flagdrift: drifty —/);
      assert.match(r.stdout, /flagdrift: OK/);
    },
  );
});

test("--format json emits the stable shape with real file positions", () => {
  withTree({ "DRIFT.md": DRIFTED_DOC }, (dir) => {
    const r = run(
      ["check", "--cmd", FAKE_CMD, "--docs", "DRIFT.md", "--format", "json"],
      dir,
    );
    assert.equal(r.code, 1);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.targets[0].name, "fakecli");
    const d106 = parsed.targets[0].findings.find((f) => f.code === "D106");
    assert.equal(d106.file, "DRIFT.md");
    assert.equal(typeof d106.line, "number");
  });
});

test("parse and docs subcommands expose both sides of the diff", () => {
  withTree({ "README.md": GOOD_DOC, "help.txt": "Options:\n  -z, --zed <N>  a flag [default: 9]\n" }, (dir) => {
    const parsed = run(["parse", "--cmd", FAKE_CMD], dir);
    assert.equal(parsed.code, 0);
    assert.match(parsed.stdout, /tool: fakecli/);
    assert.match(parsed.stdout, /--out <DIR> {2}\[aliases: -o; default: build\]/);
    assert.match(parsed.stdout, /commands \(2\):/);

    const fromFile = run(["parse", "help.txt", "--format", "json"], dir);
    const surface = JSON.parse(fromFile.stdout);
    assert.equal(surface.flags[0].name, "--zed");
    assert.equal(surface.flags[0].defaultValue, "9");

    const docs = run(["docs", "README.md"], dir);
    assert.equal(docs.code, 0);
    assert.match(docs.stdout, /--fast {2}x1/);
    assert.match(docs.stdout, /--level {2}x1/);
  });
});

test("explain documents every code, the code list, and exit codes — offline", () => {
  const one = run(["explain", "D103"]);
  assert.equal(one.code, 0);
  assert.match(one.stdout, /stale default/);

  const codes = run(["explain", "codes"]);
  const listed = codes.stdout.trim().split("\n");
  assert.equal(listed.length, 8);
  assert.ok(listed[0].startsWith("D101"));

  const exits = run(["explain", "exit-codes"]);
  assert.match(exits.stdout, /usage or execution error/);
});

test("repeat runs over the same tree are byte-identical", () => {
  withTree({ "DRIFT.md": DRIFTED_DOC }, (dir) => {
    const a = run(["check", "--cmd", FAKE_CMD, "--docs", "DRIFT.md"], dir);
    const b = run(["check", "--cmd", FAKE_CMD, "--docs", "DRIFT.md"], dir);
    assert.equal(a.stdout, b.stdout);
    assert.equal(a.code, b.code);
  });
});
