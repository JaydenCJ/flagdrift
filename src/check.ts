/**
 * Target runner: capture help → parse → scan docs → diff, for one target.
 * Pure orchestration; every step lives in its own unit-testable module.
 */

import fs from "node:fs";
import path from "node:path";
import { captureHelp, readHelpFile, UsageError } from "./capture.js";
import { diffSurfaces, summarize } from "./drift.js";
import { resolveDocs } from "./glob.js";
import { parseHelp } from "./helpparse.js";
import { scanDocs } from "./mdscan.js";
import type { Target, TargetResult } from "./types.js";

/** Run one target end to end. Throws UsageError for exit-2 conditions. */
export function runTarget(target: Target, baseDir: string): TargetResult {
  const helpText = target.command
    ? captureHelp(target.command, baseDir)
    : readHelpFile(path.resolve(baseDir, target.helpFile ?? ""));

  const help = parseHelp(helpText);
  if (help.flags.length === 0) {
    throw new UsageError(
      `${target.name}: parsed 0 flags from the help output — ` +
        "is the command printing a --help text? (try `flagdrift parse` to inspect)",
    );
  }

  const { files, missing } = resolveDocs(target.docs, baseDir);
  if (missing.length > 0) {
    throw new UsageError(
      `${target.name}: docs not found: ${missing.join(", ")} (relative to ${baseDir})`,
    );
  }

  const documents = files.map((abs) => ({
    file: relativize(abs, baseDir),
    text: fs.readFileSync(abs, "utf8"),
  }));

  const docs = scanDocs(documents, {
    tool: help.tool ?? target.name,
    fences: target.fences,
    sections: target.sections,
  });

  const findings = diffSurfaces(help, docs, { ignore: target.ignore });

  // Inferred names yield to what the tool calls itself on its Usage: line.
  const name = target.explicitName ? target.name : help.tool ?? target.name;

  return {
    name,
    helpFlags: help.flags.length,
    helpCommands: help.commands.length,
    docsFiles: docs.files,
    findings,
    summary: summarize(findings),
  };
}

function relativize(abs: string, baseDir: string): string {
  const rel = path.relative(baseDir, abs);
  return rel.startsWith("..") ? abs : rel.split(path.sep).join("/");
}
