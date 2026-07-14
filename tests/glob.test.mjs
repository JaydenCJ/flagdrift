// The minimal glob engine behind "docs": ["docs/*.md"] — segment-local *,
// cross-segment **, literal paths, and the missing-pattern reporting that
// turns a typo'd docs path into a hard exit-2 error instead of a silent
// "0 files scanned, 0 drift, ship it".
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { compileGlob, hasMagic, resolveDocs } from "../dist/index.js";
import { withTree } from "./helpers.mjs";

test("* stays within a path segment; ** crosses segments", () => {
  const star = compileGlob("docs/*.md");
  assert.ok(star.test("docs/cli.md"));
  assert.ok(!star.test("docs/sub/cli.md"));

  const glob = compileGlob("docs/**/*.md");
  assert.ok(glob.test("docs/cli.md")); // `**/` also matches zero segments
  assert.ok(glob.test("docs/a/b/cli.md"));
  assert.ok(!glob.test("notes/cli.md"));

  assert.ok(hasMagic("docs/*.md"));
  assert.ok(!hasMagic("README.md"));
});

test("? matches exactly one character; regex metachars are literal", () => {
  const re = compileGlob("v?.?.md");
  assert.ok(re.test("v1.2.md"));
  assert.ok(!re.test("v12.2.md"));
  assert.ok(!re.test("v1x2.md")); // the dot is a literal dot
});

test("resolveDocs: literal paths resolve, globs expand sorted", () => {
  withTree(
    {
      "README.md": "# a\n",
      "docs/b.md": "# b\n",
      "docs/a.md": "# a\n",
      "docs/deep/c.md": "# c\n",
      "docs/note.txt": "not md\n",
    },
    (dir) => {
      const { files, missing } = resolveDocs(
        ["README.md", "docs/**/*.md", "docs/a.md"],
        dir,
      );
      assert.deepEqual(missing, []);
      // docs/a.md matched twice (literal + glob) but appears once.
      assert.deepEqual(
        files.map((f) => path.relative(dir, f).split(path.sep).join("/")),
        ["README.md", "docs/a.md", "docs/b.md", "docs/deep/c.md"],
      );
    },
  );
});

test("resolveDocs: a literal path that does not exist is reported missing", () => {
  withTree({ "README.md": "# a\n" }, (dir) => {
    const { files, missing } = resolveDocs(["README.md", "MISSING.md"], dir);
    assert.equal(files.length, 1);
    assert.deepEqual(missing, ["MISSING.md"]);
  });
});

test("resolveDocs: a glob matching nothing is reported missing too", () => {
  withTree({ "README.md": "# a\n" }, (dir) => {
    const { missing } = resolveDocs(["ghost/*.md"], dir);
    assert.deepEqual(missing, ["ghost/*.md"]);
  });
});

test("the walk skips node_modules, .git and build trees", () => {
  withTree(
    {
      "docs/a.md": "# a\n",
      "node_modules/pkg/README.md": "# no\n",
      ".git/description.md": "# no\n",
      "dist/out.md": "# no\n",
    },
    (dir) => {
      const { files } = resolveDocs(["**/*.md"], dir);
      assert.deepEqual(
        files.map((f) => path.relative(dir, f).split(path.sep).join("/")),
        ["docs/a.md"],
      );
    },
  );
});

