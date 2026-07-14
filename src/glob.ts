/**
 * A minimal glob matcher for the docs lists in flagdrift.json: `*` matches
 * within a path segment, `**` across segments, `?` a single character.
 * Patterns without magic are treated as literal paths. The walk skips
 * `.git`, `node_modules` and other trees that never hold docs.
 */

import fs from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "target", "vendor", ".venv", "__pycache__",
]);

export function hasMagic(pattern: string): boolean {
  return /[*?]/.test(pattern);
}

/** Compile a glob into a RegExp over `/`-separated relative paths. */
export function compileGlob(pattern: string): RegExp {
  const norm = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
  let re = "";
  for (let i = 0; i < norm.length; i++) {
    const ch = norm[i];
    if (ch === "*") {
      if (norm[i + 1] === "*") {
        // `**/` matches zero or more whole segments; bare `**` matches all.
        if (norm[i + 2] === "/") {
          re += "(?:[^/]+/)*";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else {
      re += (ch ?? "").replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

/**
 * Resolve a list of docs patterns against a base directory into a sorted,
 * de-duplicated list of absolute file paths. Literal (non-magic) patterns
 * that do not exist are reported via the returned `missing` list so the
 * caller can turn a typo into a hard error instead of a silent no-op.
 */
export function resolveDocs(
  patterns: string[],
  baseDir: string,
): { files: string[]; missing: string[] } {
  const files = new Set<string>();
  const missing: string[] = [];
  let walked: string[] | undefined;

  for (const pattern of patterns) {
    if (!hasMagic(pattern)) {
      const abs = path.resolve(baseDir, pattern);
      const st = fs.statSync(abs, { throwIfNoEntry: false });
      if (st && st.isFile()) files.add(abs);
      else missing.push(pattern);
      continue;
    }
    walked = walked ?? walk(baseDir);
    const re = compileGlob(pattern);
    let hit = false;
    for (const rel of walked) {
      if (re.test(rel)) {
        files.add(path.resolve(baseDir, rel));
        hit = true;
      }
    }
    if (!hit) missing.push(pattern);
  }
  return { files: [...files].sort(), missing };
}

/** All regular files under root, as sorted `/`-separated relative paths. */
export function walk(root: string): string[] {
  const out: string[] = [];
  const stack = [""];
  while (stack.length > 0) {
    const rel = stack.pop() ?? "";
    const abs = rel === "" ? root : path.join(root, rel);
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const childRel = rel === "" ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(childRel);
      } else if (e.isFile()) {
        out.push(childRel);
      }
    }
  }
  return out.sort();
}
