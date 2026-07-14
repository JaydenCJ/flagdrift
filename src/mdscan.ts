/**
 * Markdown docs scanner. Recovers the flag surface a document *claims* a
 * CLI has: flags mentioned in inline code spans, reference tables (with
 * their `Default` column) and shell-flavored fenced code blocks, plus
 * `<tool> <subcommand>` invocations.
 *
 * Precision over recall: prose text outside code spans is never scanned,
 * so an em-dash written as `--` or a horizontal rule can never become a
 * phantom flag. Fenced blocks are scanned only when their language tag is
 * shell-like (bash, sh, console, …) or absent — a `text` fence holding
 * captured program output is quoting, not documenting.
 */

import type {
  DocCommandOccurrence,
  DocFlagOccurrence,
  DocsSurface,
  ScanOptions,
} from "./types.js";

/** Fence languages treated as "someone typing commands". */
const SHELL_LANGS = new Set([
  "", "bash", "sh", "shell", "shell-session", "console", "zsh", "fish",
  "ksh", "powershell", "pwsh", "bat", "cmd", "terminal",
]);

/** A flag spelling inside code: `--long`, `-s`, `-golong`, `--[no-]x`. */
const FLAG_IN_CODE = /(^|[\s"'`=(\[{|])(--?(?:\[no-\])?[A-Za-z0-9?][\w.-]*)(=("[^"]*"|'[^']*'|\S*))?/g;

/**
 * The stricter variant for bare (non-code) table-cell text: quotes are not
 * accepted as a prefix there, so prose like `the docs'-eye view` cannot
 * produce a phantom `-eye` flag.
 */
const FLAG_IN_PROSE = /(^|[\s(\[{|])(--?(?:\[no-\])?[A-Za-z0-9?][\w.-]*)(=("[^"]*"|'[^']*'|\S*))?/g;

/** `--flag <VALUE>` written out inside a single code span. */
const SPAN_VALUE = /^<[^>]+>|^[A-Z][A-Z0-9_-]*$/;

const DEPRECATED_RE = /deprecat/i;

interface ScanState {
  file: string;
  opts: Required<Pick<ScanOptions, "fences">> & ScanOptions;
  flags: DocFlagOccurrence[];
  commands: DocCommandOccurrence[];
  /** Heading text by level, e.g. [ "flagdrift", "CLI reference" ]. */
  headings: string[];
  inFence: boolean;
  fenceLang: string;
  fenceMarker: string;
  inHtmlComment: boolean;
  tableHeader: string[] | undefined;
  tableDefaultCol: number;
}

/** Scan one or more Markdown documents into a DocsSurface. */
export function scanDocs(
  documents: Array<{ file: string; text: string }>,
  opts: ScanOptions = {},
): DocsSurface {
  const flags: DocFlagOccurrence[] = [];
  const commands: DocCommandOccurrence[] = [];
  const files: string[] = [];
  for (const doc of documents) {
    files.push(doc.file);
    const one = scanMarkdown(doc.text, doc.file, opts);
    flags.push(...one.flags);
    commands.push(...one.commands);
  }
  return { flags, commands, files };
}

/** Scan a single Markdown text. */
export function scanMarkdown(
  text: string,
  file: string,
  opts: ScanOptions = {},
): DocsSurface {
  const st: ScanState = {
    file,
    opts: { fences: opts.fences ?? true, ...opts },
    flags: [],
    commands: [],
    headings: [],
    inFence: false,
    fenceLang: "",
    fenceMarker: "",
    inHtmlComment: false,
    tableHeader: undefined,
    tableDefaultCol: -1,
  };

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    scanLine(st, lines[i] ?? "", i + 1);
  }
  return { flags: st.flags, commands: st.commands, files: [file] };
}

function scanLine(st: ScanState, raw: string, lineNo: number): void {
  let line = stripHtmlComments(st, raw);

  // Fence open/close (``` or ~~~), never inside an open fence of the
  // other marker.
  const fence = /^\s{0,3}(`{3,}|~{3,})\s*(\S*)/.exec(line);
  if (fence && (!st.inFence || (fence[1] ?? "").startsWith(st.fenceMarker[0] ?? ""))) {
    if (!st.inFence) {
      st.inFence = true;
      st.fenceMarker = fence[1] ?? "```";
      st.fenceLang = (fence[2] ?? "").toLowerCase();
    } else {
      st.inFence = false;
      st.fenceLang = "";
    }
    return;
  }

  if (st.inFence) {
    if (!st.opts.fences) return;
    if (!SHELL_LANGS.has(st.fenceLang)) return;
    if (!sectionMatches(st)) return;
    scanCommandText(st, stripPrompt(line), lineNo, "fence");
    return;
  }

  // Headings (ATX only; setext headings are rare in tool docs).
  const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
  if (heading) {
    const level = (heading[1] ?? "#").length;
    st.headings = st.headings.slice(0, level - 1);
    st.headings[level - 1] = (heading[2] ?? "").trim();
    st.tableHeader = undefined;
    return;
  }

  if (!sectionMatches(st)) return;

  // Tables.
  if (/^\s*\|.*\|\s*$/.test(line)) {
    scanTableRow(st, line, lineNo);
    return;
  }
  st.tableHeader = undefined;

  // Inline code spans in ordinary prose / list items.
  for (const span of codeSpans(line)) {
    scanCommandText(st, span, lineNo, "span", line);
  }
}

/** Track `<!-- … -->` comments, including multi-line ones. */
function stripHtmlComments(st: ScanState, line: string): string {
  let out = "";
  let rest = line;
  while (rest.length > 0) {
    if (st.inHtmlComment) {
      const end = rest.indexOf("-->");
      if (end === -1) return out;
      st.inHtmlComment = false;
      rest = rest.slice(end + 3);
    } else {
      const start = rest.indexOf("<!--");
      if (start === -1) {
        out += rest;
        break;
      }
      out += rest.slice(0, start);
      st.inHtmlComment = true;
      rest = rest.slice(start + 4);
    }
  }
  return out;
}

/** All inline `code span` contents on a line. */
function codeSpans(line: string): string[] {
  const spans: string[] = [];
  const re = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) spans.push(m[1] ?? "");
  return spans;
}

function stripPrompt(line: string): string {
  return line.replace(/^\s*\$\s+/, "");
}

function sectionMatches(st: ScanState): boolean {
  const filters = st.opts.sections;
  if (!filters || filters.length === 0) return true;
  const path = st.headings.filter(Boolean).join(" › ").toLowerCase();
  return filters.some((f) => path.includes(f.toLowerCase()));
}

function sectionPath(st: ScanState): string {
  return st.headings.filter(Boolean).join(" › ");
}

/**
 * Extract flags and `<tool> <subcommand>` mentions from a stretch of
 * command-like text (a code span or a shell fence line).
 */
function scanCommandText(
  st: ScanState,
  text: string,
  lineNo: number,
  context: "span" | "fence",
  noteContext: string = text,
): void {
  // Comment lines inside fences are prose, not commands.
  if (context === "fence" && /^\s*#/.test(text)) return;

  FLAG_IN_CODE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FLAG_IN_CODE.exec(text)) !== null) {
    const spelled = m[2] ?? "";
    // `--` alone is an args separator; `---` is never a flag.
    if (/^-+$/.test(spelled)) continue;
    let attachedValue = m[4] !== undefined ? m[4] : undefined;
    if (attachedValue === undefined && context === "span") {
      // `--flag <X>` written out inside one span documents a value.
      const after = text.slice((m.index ?? 0) + (m[0] ?? "").length).trimStart();
      const word = after.split(/\s+/)[0] ?? "";
      if (SPAN_VALUE.test(word)) attachedValue = word;
    }
    for (const flag of expandNegatable(spelled)) {
      st.flags.push({
        flag,
        file: st.file,
        line: lineNo,
        context,
        section: sectionPath(st),
        attachedValue,
        defaultValue: undefined,
        deprecatedNote: DEPRECATED_RE.test(noteContext),
      });
    }
  }

  scanToolInvocation(st, text, lineNo);
}

/** `--[no-]color` in docs documents both `--color` and `--no-color`. */
function expandNegatable(spelled: string): string[] {
  const m = /^(--?)\[no-\](.+)$/.exec(spelled);
  if (!m) return [spelled];
  return [`${m[1]}${m[2]}`, `${m[1]}no-${m[2]}`];
}

function scanToolInvocation(st: ScanState, text: string, lineNo: number): void {
  const tool = st.opts.tool;
  if (!tool) return;
  const tokens = text.trim().split(/\s+/);
  for (let i = 0; i < tokens.length - 1; i++) {
    const tok = tokens[i] ?? "";
    const isTool = tok === tool || tok.endsWith(`/${tool}`);
    if (!isTool) continue;
    const next = tokens[i + 1] ?? "";
    if (/^[a-z][\w:-]*$/.test(next)) {
      st.commands.push({
        name: next,
        file: st.file,
        line: lineNo,
        section: sectionPath(st),
      });
    }
  }
}

function scanTableRow(st: ScanState, line: string, lineNo: number): void {
  const cells = splitTableRow(line);

  // Delimiter row: |---|:---:| … — marks the previous row as the header.
  if (cells.every((c) => /^:?-{3,}:?$/.test(c.trim()) || c.trim() === "")) return;

  if (st.tableHeader === undefined) {
    st.tableHeader = cells.map((c) => c.trim().toLowerCase());
    st.tableDefaultCol = st.tableHeader.findIndex((h) => /default/.test(h));
    // The header row itself can name flags (rare); scan it like a body row
    // but without default extraction.
  }

  const rowText = cells.join(" ");
  const deprecatedNote = DEPRECATED_RE.test(rowText);
  const defaultCell =
    st.tableDefaultCol >= 0 ? (cells[st.tableDefaultCol] ?? "").trim() : "";
  const defaultValue = cleanDefaultCell(defaultCell);

  let assignedDefault = false;
  for (let c = 0; c < cells.length; c++) {
    const cell = cells[c] ?? "";
    if (c === st.tableDefaultCol) continue;
    const found = flagsInCell(cell);
    for (let f = 0; f < found.length; f++) {
      const spelled = found[f] ?? "";
      // The default belongs to the row's canonical flag: the first long
      // spelling in the first flag-bearing cell (so `-c, --config` rows
      // pin the default to `--config`, not `-c`).
      const isCanonical =
        !assignedDefault &&
        defaultValue !== undefined &&
        (spelled.startsWith("--") || found.every((x) => !x.startsWith("--")));
      if (isCanonical) assignedDefault = true;
      for (const flag of expandNegatable(spelled)) {
        st.flags.push({
          flag,
          file: st.file,
          line: lineNo,
          context: "table",
          section: sectionPath(st),
          attachedValue: undefined,
          defaultValue: isCanonical ? defaultValue : undefined,
          deprecatedNote,
        });
      }
    }
  }
}

/** Split `| a | b |` into cells, honoring `\|` escapes. */
function splitTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "\\" && inner[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (ch === "|") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

/** Flags in a table cell: code spans first, then bare spellings. */
function flagsInCell(cell: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const sources: Array<[string, RegExp]> = [
    ...codeSpans(cell).map((s): [string, RegExp] => [s, FLAG_IN_CODE]),
    [cell.replace(/`[^`]*`/g, " "), FLAG_IN_PROSE],
  ];
  for (const [src, re] of sources) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const spelled = m[2] ?? "";
      if (/^-+$/.test(spelled)) continue;
      if (!seen.has(spelled)) {
        seen.add(spelled);
        found.push(spelled);
      }
    }
  }
  return found;
}

/** Normalize a Default-column cell; empty-ish cells mean "no default". */
function cleanDefaultCell(cell: string): string | undefined {
  const cleaned = cell.replace(/`/g, "").trim();
  if (cleaned === "") return undefined;
  if (/^(—|–|-|n\/a|none|\(none\)|off)$/i.test(cleaned)) return undefined;
  return cleaned;
}
