#!/usr/bin/env node
/**
 * The flagdrift CLI. Subcommands:
 *
 *   check    compare a CLI's --help against its Markdown docs (default)
 *   parse    print the flag surface parsed from a --help text
 *   docs     print the flags found in Markdown files
 *   explain  describe a drift code, `codes`, or `exit-codes`
 *
 * Exit codes: 0 clean, 1 drift at/above --fail-on, 2 usage/execution error.
 */

import fs from "node:fs";
import path from "node:path";
import { captureHelp, readHelpFile, UsageError } from "./capture.js";
import { runTarget } from "./check.js";
import { flag, list, parseArgs, str } from "./cliargs.js";
import { CODE_CATALOG, EXIT_CODES_DOC, findCode } from "./codes.js";
import { inferName, loadConfig } from "./config.js";
import { resolveDocs } from "./glob.js";
import { parseHelp } from "./helpparse.js";
import { scanDocs } from "./mdscan.js";
import { renderJson, renderText, shouldFail, totalSummary } from "./report.js";
import type { Config, FailOn, Target, TargetResult } from "./types.js";
import { VERSION } from "./version.js";

const HELP_TEXT = `flagdrift ${VERSION}
Diffs a CLI's real --help surface against its documented flags.

Usage: flagdrift [command] [options]

Commands:
  check    Compare a CLI's --help against its Markdown docs (default)
  parse    Print the flag surface parsed from a --help text
  docs     Print the flags found in Markdown files
  explain  Describe a drift code, or the topics codes and exit-codes

Options:
  -c, --config <FILE>    read check targets from a config file [default: flagdrift.json]
      --cmd <COMMAND>    shell command that prints the help text to diff
      --help-file <FILE> read the help text from a file instead of running a command
      --docs <GLOB>      Markdown file or glob to scan; repeatable
      --ignore <NAME>    flag or subcommand to exclude, trailing * allowed; repeatable
      --sections <LIST>  comma-separated heading filter for the docs scan
      --no-fences        skip fenced code blocks when scanning docs
      --fail-on <LEVEL>  exit 1 at or above: error, warning, info, never [default: warning]
      --format <FMT>     report format: text or json [default: text]
  -q, --quiet            print only the verdict line
  -h, --help             print this help
  -V, --version          print the version

Exit codes:
  0 no drift at or above --fail-on, 1 drift found, 2 usage or execution error.
`;

const SPECS = [
  { name: "--config", alias: "-c", takesValue: true },
  { name: "--cmd", takesValue: true },
  { name: "--help-file", takesValue: true },
  { name: "--docs", takesValue: true, repeatable: true },
  { name: "--ignore", takesValue: true, repeatable: true },
  { name: "--sections", takesValue: true },
  { name: "--no-fences", takesValue: false },
  { name: "--fail-on", takesValue: true },
  { name: "--format", takesValue: true },
  { name: "--quiet", alias: "-q", takesValue: false },
  { name: "--help", alias: "-h", takesValue: false },
  { name: "--version", alias: "-V", takesValue: false },
];

export function main(argv: string[]): number {
  try {
    return run(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`flagdrift: error: ${e.message}\n`);
      return 2;
    }
    throw e;
  }
}

function run(argv: string[]): number {
  const args = parseArgs(argv, SPECS);

  if (flag(args, "--version")) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (flag(args, "--help")) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  const format = str(args, "--format") ?? "text";
  if (format !== "text" && format !== "json") {
    throw new UsageError(`--format must be text or json, got: ${format}`);
  }
  const failOn = (str(args, "--fail-on") ?? "warning") as FailOn;
  if (!["error", "warning", "info", "never"].includes(failOn)) {
    throw new UsageError(`--fail-on must be error, warning, info or never, got: ${failOn}`);
  }

  const [command, ...rest] = args.positionals;
  switch (command ?? "check") {
    case "check":
      return cmdCheck(args, rest, format, failOn);
    case "parse":
      return cmdParse(args, rest, format);
    case "docs":
      return cmdDocs(args, rest, format);
    case "explain":
      return cmdExplain(rest);
    default:
      throw new UsageError(`unknown command: ${command} (try flagdrift --help)`);
  }
}

// ---- check ------------------------------------------------------------------

function cmdCheck(
  args: ReturnType<typeof parseArgs>,
  rest: string[],
  format: "text" | "json",
  failOnFlag: FailOn,
): number {
  if (rest.length > 0) {
    throw new UsageError(`check takes no positional arguments, got: ${rest.join(" ")}`);
  }
  const cwd = process.cwd();
  const adHoc = str(args, "--cmd") !== undefined || str(args, "--help-file") !== undefined;

  let config: Config;
  let baseDir: string;
  let failOn = failOnFlag;

  if (adHoc) {
    const docs = list(args, "--docs");
    if (docs.length === 0) {
      throw new UsageError("--cmd/--help-file needs at least one --docs <file-or-glob>");
    }
    if (str(args, "--cmd") !== undefined && str(args, "--help-file") !== undefined) {
      throw new UsageError("set --cmd or --help-file, not both");
    }
    baseDir = cwd;
    config = {
      failOn,
      targets: [
        adHocTarget(args, docs),
      ],
    };
  } else {
    const configPath = path.resolve(cwd, str(args, "--config") ?? "flagdrift.json");
    config = loadConfig(configPath);
    baseDir = path.dirname(configPath);
    // The CLI flag outranks the config; the config outranks the default.
    failOn = str(args, "--fail-on") !== undefined ? failOnFlag : config.failOn;
  }

  const results: TargetResult[] = config.targets.map((t) => runTarget(t, baseDir));
  const opts = { quiet: flag(args, "--quiet"), failOn };
  process.stdout.write(format === "json" ? renderJson(results, opts) : renderText(results, opts));
  return shouldFail(totalSummary(results), failOn) ? 1 : 0;
}

function adHocTarget(args: ReturnType<typeof parseArgs>, docs: string[]): Target {
  const command = str(args, "--cmd");
  const helpFile = str(args, "--help-file");
  const sections = str(args, "--sections");
  return {
    name: inferName(command, helpFile),
    command,
    helpFile,
    docs,
    ignore: list(args, "--ignore"),
    sections: sections ? sections.split(",").map((s) => s.trim()).filter(Boolean) : [],
    fences: !flag(args, "--no-fences"),
  };
}

// ---- parse ------------------------------------------------------------------

function cmdParse(
  args: ReturnType<typeof parseArgs>,
  rest: string[],
  format: "text" | "json",
): number {
  const cmd = str(args, "--cmd");
  const helpFile = str(args, "--help-file") ?? rest[0];
  if ((cmd === undefined) === (helpFile === undefined)) {
    throw new UsageError("parse needs exactly one of --cmd <command> or a help-text file");
  }
  const text = cmd !== undefined ? captureHelp(cmd, process.cwd()) : readHelpFile(helpFile ?? "");
  const surface = parseHelp(text);

  if (format === "json") {
    process.stdout.write(JSON.stringify(surface, null, 2) + "\n");
    return 0;
  }

  const out: string[] = [];
  out.push(`tool: ${surface.tool ?? "(no usage line)"}`);
  out.push(`flags (${surface.flags.length}):`);
  for (const f of surface.flags) {
    const shape = f.takesValue ? `${f.name} <${f.placeholder ?? "VALUE"}>` : f.name;
    const bits: string[] = [];
    if (f.aliases.length > 0) bits.push(`aliases: ${f.aliases.join(", ")}`);
    if (f.defaultValue !== undefined) bits.push(`default: ${f.defaultValue}`);
    if (f.choices) bits.push(`choices: ${f.choices.join("|")}`);
    if (f.deprecated) bits.push("deprecated");
    out.push(`  ${shape}${bits.length > 0 ? `  [${bits.join("; ")}]` : ""}`);
  }
  out.push(`commands (${surface.commands.length}):`);
  for (const c of surface.commands) {
    out.push(`  ${c.name}${c.aliases.length > 0 ? ` (${c.aliases.join(", ")})` : ""}`);
  }
  process.stdout.write(out.join("\n") + "\n");
  return 0;
}

// ---- docs -------------------------------------------------------------------

function cmdDocs(
  args: ReturnType<typeof parseArgs>,
  rest: string[],
  format: "text" | "json",
): number {
  const patterns = [...rest, ...list(args, "--docs")];
  if (patterns.length === 0) {
    throw new UsageError("docs needs at least one Markdown file or glob");
  }
  const cwd = process.cwd();
  const { files, missing } = resolveDocs(patterns, cwd);
  if (missing.length > 0) {
    throw new UsageError(`docs not found: ${missing.join(", ")}`);
  }
  const sections = str(args, "--sections");
  const surface = scanDocs(
    files.map((abs) => ({
      file: path.relative(cwd, abs).split(path.sep).join("/"),
      text: fs.readFileSync(abs, "utf8"),
    })),
    {
      fences: !flag(args, "--no-fences"),
      sections: sections ? sections.split(",").map((s) => s.trim()).filter(Boolean) : [],
    },
  );

  if (format === "json") {
    process.stdout.write(JSON.stringify(surface, null, 2) + "\n");
    return 0;
  }

  const out: string[] = [];
  const bySpelling = new Map<string, number>();
  for (const occ of surface.flags) {
    bySpelling.set(occ.flag, (bySpelling.get(occ.flag) ?? 0) + 1);
  }
  out.push(`docs files (${surface.files.length}): ${surface.files.join(", ")}`);
  const mentions = surface.flags.length;
  out.push(`flags (${bySpelling.size} distinct, ${mentions} mention${mentions === 1 ? "" : "s"}):`);
  for (const [spelling, count] of [...bySpelling.entries()].sort()) {
    out.push(`  ${spelling}  x${count}`);
  }
  process.stdout.write(out.join("\n") + "\n");
  return 0;
}

// ---- explain ----------------------------------------------------------------

function cmdExplain(rest: string[]): number {
  const topic = rest[0];
  if (topic === undefined) {
    throw new UsageError("explain needs a drift code, `codes`, or `exit-codes`");
  }
  if (topic === "codes") {
    for (const c of CODE_CATALOG) {
      process.stdout.write(`${c.code}  ${c.severity.padEnd(7)}  ${c.title}\n`);
    }
    return 0;
  }
  if (topic === "exit-codes") {
    process.stdout.write(EXIT_CODES_DOC + "\n");
    return 0;
  }
  const doc = findCode(topic);
  if (!doc) {
    throw new UsageError(`unknown drift code: ${topic} (try flagdrift explain codes)`);
  }
  process.stdout.write(
    `${doc.code} (${doc.severity}) — ${doc.title}\n\n${wrap(doc.body)}\n\nfix: ${wrap(doc.fix)}\n`,
  );
  return 0;
}

function wrap(text: string, width = 78): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur.length + w.length + 1 > width && cur !== "") {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur === "" ? w : `${cur} ${w}`;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines.join("\n");
}

process.exit(main(process.argv.slice(2)));
