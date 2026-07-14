// Renderers and the fail gate: the text report shape, the stable JSON
// contract CI parses, --quiet, and severity gating across every fail-on
// level. Renderers are pure, so two calls must be byte-identical.
import test from "node:test";
import assert from "node:assert/strict";
import {
  renderJson,
  renderText,
  shouldFail,
  summarize,
  totalSummary,
} from "../dist/index.js";

function target(findings, name = "mycli") {
  return {
    name,
    helpFlags: 5,
    helpCommands: 2,
    docsFiles: ["README.md"],
    findings,
    summary: summarize(findings),
  };
}

const FINDINGS = [
  {
    code: "D101",
    severity: "error",
    subject: "--retries",
    message: "`--retries <N>` is in the live --help but never appears in the docs",
    fix: "add it to the flag reference",
  },
  {
    code: "D103",
    severity: "warning",
    subject: "--timeout",
    message: "the docs say `60`, --help says `30`",
    fix: "update the table cell to `30`",
    file: "README.md",
    line: 12,
  },
];

test("shouldFail honors every gate level", () => {
  const s = { errors: 0, warnings: 1, infos: 2 };
  assert.equal(shouldFail(s, "error"), false);
  assert.equal(shouldFail(s, "warning"), true);
  assert.equal(shouldFail(s, "info"), true);
  assert.equal(shouldFail(s, "never"), false);
  assert.equal(shouldFail({ errors: 1, warnings: 0, infos: 0 }, "error"), true);
  assert.equal(shouldFail({ errors: 0, warnings: 0, infos: 0 }, "info"), false);
});

test("the text report shows header, findings with fix lines, and verdict", () => {
  const out = renderText([target(FINDINGS)], { failOn: "warning" });
  assert.match(out, /flagdrift: mycli — 5 help flags, 2 commands vs 1 docs file/);
  assert.match(out, /error D101 --retries/);
  assert.match(out, /warning D103 README\.md:12 › --timeout/);
  assert.match(out, /fix: update the table cell/);
  // Singular counts read singular — no lazy "1 error(s)".
  assert.match(out, /flagdrift: FAIL — 1 error, 1 warning, 0 info \(fail-on: warning\)/);
});

test("a clean run renders OK and quiet mode keeps only the verdict", () => {
  const clean = renderText([target([])], { failOn: "warning" });
  assert.match(clean, /flagdrift: OK — 0 errors, 0 warnings, 0 info/);

  const quiet = renderText([target(FINDINGS)], { failOn: "warning", quiet: true });
  assert.equal(quiet.trim().split("\n").length, 1);
  assert.match(quiet, /^flagdrift: FAIL/);
});

test("multi-target reports aggregate one verdict across all targets", () => {
  const out = renderText(
    [target([], "alpha"), target(FINDINGS, "beta")],
    { failOn: "warning" },
  );
  assert.match(out, /flagdrift: alpha —/);
  assert.match(out, /flagdrift: beta —/);
  assert.equal((out.match(/flagdrift: (OK|FAIL) —/g) ?? []).length, 1);
  assert.deepEqual(totalSummary([target([], "a"), target(FINDINGS, "b")]), {
    errors: 1,
    warnings: 1,
    infos: 0,
  });
});

test("the JSON shape is stable: ok, failOn, summary, per-target findings", () => {
  const parsed = JSON.parse(renderJson([target(FINDINGS)], { failOn: "warning" }));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.failOn, "warning");
  assert.deepEqual(parsed.summary, { errors: 1, warnings: 1, infos: 0 });
  assert.equal(parsed.targets.length, 1);
  const t = parsed.targets[0];
  assert.equal(t.name, "mycli");
  assert.deepEqual(t.docsFiles, ["README.md"]);
  // Docs-side findings carry file/line; help-side ones carry null.
  assert.equal(t.findings[0].file, null);
  assert.equal(t.findings[1].file, "README.md");
  assert.equal(t.findings[1].line, 12);

  // `ok` flips with the gate without changing the findings list.
  const relaxed = JSON.parse(renderJson([target(FINDINGS)], { failOn: "never" }));
  assert.equal(relaxed.ok, true);
  assert.equal(relaxed.targets[0].findings.length, 2);
});

test("renderers are deterministic: same input, same bytes", () => {
  const args = [[target(FINDINGS)], { failOn: "info" }];
  assert.equal(renderText(...args), renderText(...args));
  assert.equal(renderJson(...args), renderJson(...args));
});
