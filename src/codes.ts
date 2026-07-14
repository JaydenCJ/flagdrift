/**
 * The offline drift-code catalog behind `flagdrift explain`. One entry per
 * stable code; the text here is the source of truth that docs/codes.md
 * paraphrases.
 */

import type { Severity } from "./types.js";

export interface CodeDoc {
  code: string;
  severity: Severity;
  title: string;
  body: string;
  fix: string;
}

export const CODE_CATALOG: CodeDoc[] = [
  {
    code: "D101",
    severity: "error",
    title: "undocumented flag",
    body:
      "A flag exists in the live --help output but never appears in any scanned " +
      "Markdown file — not in a code span, not in a reference table, not in a " +
      "shell fence. Users reading the docs cannot discover it. Deprecated flags " +
      "are exempt (hiding them from docs is a valid choice), as are --help / " +
      "--version / -h / -V.",
    fix:
      "Add the flag to the docs (flagdrift's message includes the placeholder " +
      "and default to paste), or suppress it with --ignore '<flag>' if it is " +
      "intentionally internal.",
  },
  {
    code: "D102",
    severity: "error",
    title: "phantom flag",
    body:
      "The docs mention a flag that the live --help does not list under any " +
      "spelling. This is the classic docs lie: a rename or removal shipped and " +
      "the prose kept the old name. Anyone copying the example gets an " +
      "'unknown flag' error. A did-you-mean suggestion is attached when a live " +
      "flag is within edit distance 3.",
    fix: "Update the reference to the current spelling, or delete it.",
  },
  {
    code: "D103",
    severity: "warning",
    title: "stale default",
    body:
      "A reference table documents a default value for a flag (via a column " +
      "whose header contains 'default'), and the live --help declares a " +
      "different one. Comparison is format-forgiving: backticks and quotes are " +
      "stripped, booleans compare case-insensitively, numbers numerically.",
    fix: "Update the table cell to the value --help declares.",
  },
  {
    code: "D104",
    severity: "warning",
    title: "value drift",
    body:
      "The docs attach a value to a flag (`--flag=x`, or `--flag <X>` inside a " +
      "code span) that --help declares boolean. Either the docs are wrong or " +
      "the help text under-describes the flag; both are drift.",
    fix: "Drop the value from the docs, or fix the help text.",
  },
  {
    code: "D105",
    severity: "warning",
    title: "undocumented subcommand",
    body:
      "The help's Commands: section lists a subcommand that the docs never " +
      "invoke as `<tool> <subcommand>`. Only checked when the help lists " +
      "subcommands at all; auto-generated `help` / `completion` are exempt.",
    fix: "Show at least one invocation of the subcommand, or --ignore it.",
  },
  {
    code: "D106",
    severity: "error",
    title: "phantom subcommand",
    body:
      "The docs invoke `<tool> <subcommand>` for a subcommand the live --help " +
      "does not list. Readers hit the error verbatim. Only checked when the " +
      "help lists subcommands; a did-you-mean suggestion is attached when " +
      "possible.",
    fix: "Update or remove the invocation.",
  },
  {
    code: "D107",
    severity: "info",
    title: "deprecated but documented plainly",
    body:
      "--help marks a flag deprecated, the docs document it, and no mention " +
      "carries a deprecation note (any 'deprecat…' wording on the same line or " +
      "table row counts). The docs steer readers toward a flag on its way out.",
    fix: "Add a deprecation note next to the documented flag.",
  },
  {
    code: "D108",
    severity: "info",
    title: "short alias never shown",
    body:
      "A flag has a single-letter short form in --help, the long form is " +
      "documented, but the short form never appears anywhere in the docs. " +
      "Cosmetic, but reference tables usually promise the full spelling set.",
    fix: "Mention the short form in the flag reference.",
  },
];

export function findCode(code: string): CodeDoc | undefined {
  return CODE_CATALOG.find((c) => c.code.toLowerCase() === code.toLowerCase());
}

export const EXIT_CODES_DOC = [
  "0  no drift at or above --fail-on",
  "1  drift found at or above --fail-on",
  "2  usage or execution error (bad flag, unreadable docs, help command failed)",
].join("\n");
