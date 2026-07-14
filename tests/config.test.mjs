// flagdrift.json loading and validation: shape errors become UsageError
// (exit 2 at the CLI), defaults are filled in, and name inference skips
// interpreter words so reports read `mycli`, not `node`.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadConfig, validateConfig, UsageError } from "../dist/index.js";
import { withTree } from "./helpers.mjs";

const MINIMAL = {
  targets: [{ command: "mycli --help", docs: ["README.md"] }],
};

test("a minimal config loads with defaults applied", () => {
  withTree({ "flagdrift.json": JSON.stringify(MINIMAL) }, (dir) => {
    const cfg = loadConfig(path.join(dir, "flagdrift.json"));
    assert.equal(cfg.failOn, "warning");
    assert.equal(cfg.targets.length, 1);
    const t = cfg.targets[0];
    assert.equal(t.name, "mycli");
    assert.equal(t.fences, true);
    assert.deepEqual(t.ignore, []);
    assert.deepEqual(t.sections, []);
  });
});

test("a missing config file is a UsageError, not a crash", () => {
  assert.throws(
    () => loadConfig("/nonexistent/flagdrift.json"),
    (e) => e instanceof UsageError && /cannot read config/.test(e.message),
  );
});

test("invalid JSON reports the file and the parse error", () => {
  withTree({ "flagdrift.json": "{ nope" }, (dir) => {
    assert.throws(
      () => loadConfig(path.join(dir, "flagdrift.json")),
      (e) => e instanceof UsageError && /not valid JSON/.test(e.message),
    );
  });
});

test("targets must be a non-empty array", () => {
  for (const bad of [{}, { targets: [] }, { targets: "x" }]) {
    assert.throws(
      () => validateConfig(bad, "cfg"),
      (e) => e instanceof UsageError && /"targets"/.test(e.message),
    );
  }
});

test("exactly one of command / helpFile is required per target", () => {
  const neither = { targets: [{ docs: ["a.md"] }] };
  const both = {
    targets: [{ command: "x --help", helpFile: "h.txt", docs: ["a.md"] }],
  };
  for (const bad of [neither, both]) {
    assert.throws(
      () => validateConfig(bad, "cfg"),
      (e) => e instanceof UsageError && /exactly one of "command" or "helpFile"/.test(e.message),
    );
  }
});

test("docs must list at least one entry; failOn is validated", () => {
  assert.throws(
    () => validateConfig({ targets: [{ command: "x", docs: [] }] }, "cfg"),
    /at least one file or glob/,
  );
  assert.throws(
    () => validateConfig({ failOn: "sometimes", targets: MINIMAL.targets }, "cfg"),
    /"failOn" must be one of/,
  );
});

test("duplicate target names are rejected", () => {
  const dup = {
    targets: [
      { name: "t", command: "a --help", docs: ["a.md"] },
      { name: "t", command: "b --help", docs: ["b.md"] },
    ],
  };
  assert.throws(() => validateConfig(dup, "cfg"), /duplicate target name "t"/);
});

test("name inference skips interpreters and strips extensions", () => {
  const cases = [
    ["node ./bin/mycli.js --help", "mycli"],
    ["python3 tools/report.py --help", "report"],
    ["npx some-tool --help", "some-tool"],
    ["./target/release/mytool --help", "mytool"],
  ];
  for (const [command, expected] of cases) {
    const cfg = validateConfig({ targets: [{ command, docs: ["a.md"] }] }, "cfg");
    assert.equal(cfg.targets[0].name, expected, command);
  }
  const fromFile = validateConfig(
    { targets: [{ helpFile: "captures/mycli-help.txt", docs: ["a.md"] }] },
    "cfg",
  );
  assert.equal(fromFile.targets[0].name, "mycli-help");

  // Explicit names are marked so the Usage: line cannot override them.
  const explicit = validateConfig(
    { targets: [{ name: "custom", command: "x --help", docs: ["a.md"] }] },
    "cfg",
  );
  assert.equal(explicit.targets[0].explicitName, true);
  assert.equal(validateConfig(MINIMAL, "cfg").targets[0].explicitName, false);
});
