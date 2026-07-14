/**
 * Public programmatic API. Everything the CLI does is reachable from here:
 *
 *   import { captureHelp, parseHelp, scanDocs, diffSurfaces } from "flagdrift";
 *
 *   const help = parseHelp(captureHelp("mycli --help"));
 *   const docs = scanDocs([{ file: "README.md", text: md }], { tool: help.tool });
 *   const findings = diffSurfaces(help, docs);
 */

export { parseHelp, spellingsOf } from "./helpparse.js";
export { scanDocs, scanMarkdown } from "./mdscan.js";
export { diffSurfaces, defaultsEqual, nearest, summarize } from "./drift.js";
export { captureHelp, readHelpFile, UsageError } from "./capture.js";
export { loadConfig, validateConfig } from "./config.js";
export { runTarget } from "./check.js";
export { compileGlob, hasMagic, resolveDocs, walk } from "./glob.js";
export { renderJson, renderText, shouldFail, totalSummary } from "./report.js";
export { CODE_CATALOG, findCode } from "./codes.js";
export { VERSION } from "./version.js";
export type {
  Config,
  DocCommandOccurrence,
  DocContext,
  DocFlagOccurrence,
  DocsSurface,
  DriftOptions,
  FailOn,
  Finding,
  HelpCommand,
  HelpFlag,
  HelpSurface,
  ScanOptions,
  Severity,
  Summary,
  Target,
  TargetResult,
} from "./types.js";
