/**
 * Shared types for flagdrift: the parsed --help surface, the flag surface
 * recovered from Markdown docs, and the drift findings produced by
 * comparing the two.
 */

export type Severity = "error" | "warning" | "info";

export type FailOn = Severity | "never";

/** One option parsed from a --help text. */
export interface HelpFlag {
  /**
   * Canonical spelling: the first double-dash long form if one exists,
   * otherwise the first single-dash form (Go-style long flags included).
   */
  name: string;
  /** Every other spelling: short forms, [aliases: …], --[no-] expansions. */
  aliases: string[];
  /** True when the flag takes a value (`--out <FILE>`, `-count int`, …). */
  takesValue: boolean;
  /** The value placeholder as printed, e.g. `FILE`, `N`, `WHEN`. */
  placeholder?: string;
  /** Default extracted from `[default: X]` / `(default X)` phrasing. */
  defaultValue?: string;
  /** Enumerated values from `[possible values: …]` or `{a,b,c}` placeholders. */
  choices?: string[];
  /** True when the description marks the flag deprecated. */
  deprecated: boolean;
  description: string;
  /** 1-indexed line in the help text where the flag is defined. */
  line: number;
}

/** One subcommand parsed from a Commands: section of a --help text. */
export interface HelpCommand {
  name: string;
  /** Comma-separated alias spellings printed next to the name, if any. */
  aliases: string[];
  description: string;
  line: number;
}

/** Everything flagdrift understands about a CLI from its --help output. */
export interface HelpSurface {
  /** Tool name recovered from the `Usage:` line, when present. */
  tool?: string;
  flags: HelpFlag[];
  commands: HelpCommand[];
}

/** Where in a Markdown file a flag mention was found. */
export type DocContext = "span" | "table" | "fence";

/** One mention of a flag in the Markdown docs. */
export interface DocFlagOccurrence {
  /** The spelling as written, e.g. `--retries` or `-q`. */
  flag: string;
  file: string;
  /** 1-indexed line in the Markdown file. */
  line: number;
  context: DocContext;
  /** Heading breadcrumb at the mention, e.g. `CLI reference › Options`. */
  section: string;
  /** Value attached in the docs (`--flag=x`, `` `--flag <X>` ``), if any. */
  attachedValue?: string;
  /** Default from the `Default` column of a reference table, if any. */
  defaultValue?: string;
  /** True when the surrounding row/line acknowledges a deprecation. */
  deprecatedNote: boolean;
}

/** One mention of `<tool> <subcommand>` in the Markdown docs. */
export interface DocCommandOccurrence {
  name: string;
  file: string;
  line: number;
  section: string;
}

/** Everything flagdrift recovered from the Markdown docs. */
export interface DocsSurface {
  flags: DocFlagOccurrence[];
  commands: DocCommandOccurrence[];
  /** The Markdown files that were scanned, in scan order. */
  files: string[];
}

/** One drift finding, produced by diffSurfaces(). */
export interface Finding {
  /** Stable code, e.g. `D101`. Codes are never renumbered. */
  code: string;
  severity: Severity;
  /** The flag or subcommand the finding is about. */
  subject: string;
  message: string;
  fix: string;
  /** Docs location for docs-side findings; absent for help-side ones. */
  file?: string;
  line?: number;
}

/** Per-target summary counts. */
export interface Summary {
  errors: number;
  warnings: number;
  infos: number;
}

/** The result of checking one target. */
export interface TargetResult {
  name: string;
  helpFlags: number;
  helpCommands: number;
  docsFiles: string[];
  findings: Finding[];
  summary: Summary;
}

/** Options that shape the docs scan. */
export interface ScanOptions {
  /** Tool name used to spot `<tool> <subcommand>` mentions. */
  tool?: string;
  /** Scan fenced code blocks (shell-tagged and untagged). Default true. */
  fences?: boolean;
  /**
   * Case-insensitive heading filters; when non-empty, only content under a
   * heading whose text contains one of these strings is scanned.
   */
  sections?: string[];
}

/** Options that shape the diff. */
export interface DriftOptions {
  /**
   * Ignore patterns: exact flag/command spellings, or a trailing `*`
   * wildcard (`--debug-*`). Matched flags produce no findings at all.
   */
  ignore?: string[];
}

/** One check target, from the config file or ad-hoc CLI flags. */
export interface Target {
  name: string;
  /** True when the user set the name; inferred names yield to the Usage: line. */
  explicitName?: boolean;
  /** Shell command that prints the help text (mutually exclusive with helpFile). */
  command?: string;
  /** Path to a file containing the help text. */
  helpFile?: string;
  /** Markdown files or globs, relative to the config file / cwd. */
  docs: string[];
  ignore: string[];
  sections: string[];
  fences: boolean;
}

/** Parsed flagdrift.json. */
export interface Config {
  targets: Target[];
  failOn: FailOn;
}
