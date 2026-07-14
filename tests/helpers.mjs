// Shared test helpers: build a throwaway directory tree from a plain
// object (path -> content) inside a fresh temp directory, and clean it up
// afterwards. Every test is hermetic: no network, no shared state, no
// reliance on the repo's own tree.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function makeTree(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flagdrift-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}

/** Run `fn(dir)` against a temp tree and always clean up. */
export function withTree(files, fn) {
  const dir = makeTree(files);
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Shorthand: scan a single markdown text as file "doc.md". */
export function docOf(text, opts = {}) {
  return { file: "doc.md", text, ...opts };
}
