/**
 * Parser for --help output. Turns the text a CLI actually prints into a
 * structured HelpSurface: flags (with aliases, value placeholders, defaults,
 * choices, deprecation markers) and subcommands.
 *
 * The parser is format-tolerant by design — it recognizes the dialects of
 * the mainstream generators without being configured for any of them:
 *
 *   - GNU/getopt:   `  -v, --verbose         be chatty`
 *   - argparse:     `  -o OUT, --out OUT     output file`
 *   - clap v4:      `      --color <WHEN>    [default: auto] [possible values: …]`
 *   - Go flag:      `  -count int` + description on the next, deeper line
 *   - cobra:        `Available Commands:` + `Flags:` / `Global Flags:`
 *   - commander:    `  -t, --tag <tag...>    tag to publish`
 */

import type { HelpCommand, HelpFlag, HelpSurface } from "./types.js";

/** Section headers that introduce option listings. */
const OPTION_SECTION = /^(global |local |common |main |general |extra )?(options?|flags?|arguments?|switches|parameters)\b/i;
/** Section headers that introduce subcommand listings. */
const COMMAND_SECTION = /^(available |common |main |management )?(sub)?commands?\b/i;

/** `  -x`, `  --long`, `  -golong` at a plausible indent. */
const FLAG_LINE = /^(\s{1,12})(-{1,2}[A-Za-z0-9?[@#]\S*)/;

/** A single flag token inside the definition part of a flag line. */
const FLAG_TOKEN = /^(-{1,2})(\[no-\])?([A-Za-z0-9?][\w.-]*)/;

/** Value placeholders: `<FILE>`, `[FILE]`, `FILE`, `{a,b}`, Go type keywords. */
const GO_TYPES = new Set(["int", "uint", "float", "string", "bool", "duration", "value", "list"]);

const DEFAULT_RE = /[[(]default:?\s+("([^"]*)"|'([^']*)'|[^\])]*)[\])]/i;
const CHOICES_RE = /\[possible values:\s*([^\]]+)\]|\(choices:\s*([^)]+)\)/i;
const ALIASES_RE = /\[aliases?:\s*([^\]]+)\]/i;
const DEPRECATED_RE = /deprecated/i;

interface Section {
  kind: "options" | "commands" | "usage" | "other" | "auto";
}

/** Parse a --help text into a structured surface. */
export function parseHelp(text: string): HelpSurface {
  const lines = text.split(/\r?\n/);
  const flags: HelpFlag[] = [];
  const commands: HelpCommand[] = [];
  let tool: string | undefined;
  let section: Section = { kind: "auto" };
  let current: HelpFlag | undefined;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const line = raw.replace(/\t/g, "    ");

    if (line.trim() === "") {
      current = undefined;
      continue;
    }

    // `Usage: tool …` inline, or Go's `Usage of tool:`.
    const usage = /^\s*usage(?: of)?[:\s]\s*(\S+?):?\s/i.exec(line + " ");
    if (usage && tool === undefined && /^\s*usage/i.test(line)) {
      const captured = usage[1] ?? "";
      if (captured !== "" && !/^usage/i.test(captured)) {
        tool = basename(captured);
        current = undefined;
        continue;
      }
    }

    const header = sectionHeader(line);
    if (header) {
      section = header;
      current = undefined;
      continue;
    }

    // cobra prints `Usage:` as a bare header with the tool on the next line.
    if (section.kind === "usage") {
      if (tool === undefined) {
        const first = line.trim().split(/\s+/)[0];
        if (first && !first.startsWith("-")) tool = basename(first);
      }
      continue;
    }

    if (section.kind === "commands") {
      const cmd = parseCommandLine(line, i + 1);
      if (cmd) {
        commands.push(cmd);
        current = undefined;
      } else if (current === undefined && commands.length > 0) {
        // Continuation of the previous command's description; ignore.
      }
      continue;
    }

    if (section.kind === "options" || section.kind === "auto") {
      const flagLine = FLAG_LINE.exec(line);
      if (flagLine && !/^\s*-{2,}\s*$/.test(line)) {
        const parsed = parseFlagLine(line, i + 1);
        if (parsed) {
          flags.push(parsed);
          current = parsed;
          continue;
        }
      }
      // Deeper-indented non-flag line: description continuation
      // (this is also how Go's flag package prints every description).
      if (current && /^\s{2,}/.test(line)) {
        appendDescription(current, line.trim());
        continue;
      }
      current = undefined;
    }
  }

  return { tool, flags: dedupe(flags), commands };
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] ?? p;
}

function sectionHeader(line: string): Section | undefined {
  // Section headers sit at indent 0–2 and end with a colon: `Options:`,
  // `Available Commands:`, `Global Flags:`, `Examples:`.
  const m = /^(\s{0,2})([A-Za-z][A-Za-z /-]{1,40}):\s*$/.exec(line);
  if (!m) return undefined;
  const title = (m[2] ?? "").trim();
  if (OPTION_SECTION.test(title)) return { kind: "options" };
  if (COMMAND_SECTION.test(title)) return { kind: "commands" };
  if (/^usage$/i.test(title)) return { kind: "usage" };
  return { kind: "other" };
}

/**
 * Split a flag line into its definition part and its description part.
 * The description starts at the first run of 2+ spaces that follows the
 * complete flag spec (single spaces inside the spec — `-o OUT, --out OUT`
 * — do not split it).
 */
function splitFlagLine(line: string): { def: string; desc: string } {
  const body = line.trimStart();
  const gap = /\s{2,}/.exec(body);
  if (!gap || gap.index === 0) return { def: body.trim(), desc: "" };
  return {
    def: body.slice(0, gap.index).trim(),
    desc: body.slice(gap.index + gap[0].length).trim(),
  };
}

function parseFlagLine(line: string, lineNo: number): HelpFlag | undefined {
  const { def, desc } = splitFlagLine(line);
  const spellings: string[] = [];
  let takesValue = false;
  let placeholder: string | undefined;
  let choices: string[] | undefined;

  // Tokenize the definition on commas / pipes between flags. A lookahead
  // keeps commas inside `{a,b,c}` choice placeholders intact.
  const entries = def.split(/\s*,\s*(?=-)|\s*\|\s*/).filter((e) => e.length > 0);
  for (const entry of entries) {
    const words = entry.split(/\s+/);
    const head = words[0] ?? "";
    const tok = FLAG_TOKEN.exec(head);
    if (!tok) {
      // Not a flag: a bare placeholder from `-o OUT, --out OUT` style —
      // handled below via the trailing words of the previous entry.
      continue;
    }
    const dashes = tok[1] ?? "-";
    const negatable = tok[2] !== undefined;
    const name = tok[3] ?? "";
    spellings.push(`${dashes}${name}`);
    if (negatable) spellings.push(`${dashes}no-${name}`);

    // `--name=<PH>` / `--name[=PH]` attached placeholder.
    const rest = head.slice(tok[0].length);
    const attached = /^\[?=<?([^\]>]+)>?\]?/.exec(rest);
    if (attached) {
      takesValue = true;
      placeholder = placeholder ?? cleanPlaceholder(attached[1] ?? "");
    }
    // ` <PH>` / ` PH` / ` {a,b}` / Go type keyword as the next word.
    const next = words[1];
    if (next !== undefined && looksLikePlaceholder(next, dashes)) {
      if (dashes === "-" && next === "bool") {
        // Go bool flags print their type but take no value on the CLI.
      } else {
        takesValue = true;
        placeholder = placeholder ?? cleanPlaceholder(next);
      }
      const braced = /^\{([^}]+)\}$/.exec(next);
      if (braced) choices = (braced[1] ?? "").split(",").map((c) => c.trim());
    }
  }

  if (spellings.length === 0) return undefined;

  const flag: HelpFlag = {
    name: canonical(spellings),
    aliases: [],
    takesValue,
    placeholder,
    defaultValue: undefined,
    choices,
    deprecated: false,
    description: "",
    line: lineNo,
  };
  flag.aliases = spellings.filter((s) => s !== flag.name);
  if (desc) appendDescription(flag, desc);
  return flag;
}

/** Prefer the first `--long` spelling; fall back to the first spelling. */
function canonical(spellings: string[]): string {
  return spellings.find((s) => s.startsWith("--")) ?? spellings[0] ?? "";
}

function looksLikePlaceholder(word: string, dashes: string): boolean {
  if (/^<[^>]+>(\.\.\.)?$/.test(word)) return true;
  if (/^\[[^\]]+\](\.\.\.)?$/.test(word)) return true;
  if (/^\{[^}]+\}$/.test(word)) return true;
  if (/^[A-Z][A-Z0-9_-]*(\.\.\.)?$/.test(word)) return true;
  if (dashes === "-" && GO_TYPES.has(word)) return true;
  return false;
}

function cleanPlaceholder(word: string): string {
  return word.replace(/^[<[{]|[>\]}]$/g, "").replace(/\.\.\.$/, "");
}

/** Fold a description fragment into the flag, mining it for metadata. */
function appendDescription(flag: HelpFlag, fragment: string): void {
  flag.description = flag.description ? `${flag.description} ${fragment}` : fragment;

  const def = DEFAULT_RE.exec(flag.description);
  if (def && flag.defaultValue === undefined) {
    flag.defaultValue = (def[2] ?? def[3] ?? def[1] ?? "").trim();
  }
  const choices = CHOICES_RE.exec(flag.description);
  if (choices && flag.choices === undefined) {
    flag.choices = (choices[1] ?? choices[2] ?? "").split(",").map((c) => c.trim());
  }
  const aliases = ALIASES_RE.exec(flag.description);
  if (aliases) {
    for (const alias of (aliases[1] ?? "").split(",")) {
      const spelled = alias.trim().startsWith("-") ? alias.trim() : `--${alias.trim()}`;
      if (spelled !== flag.name && !flag.aliases.includes(spelled)) {
        flag.aliases.push(spelled);
      }
    }
  }
  if (DEPRECATED_RE.test(fragment)) flag.deprecated = true;
}

/**
 * `  build, b    Build the artifacts` inside a Commands: section.
 * Commander prints `build [options]` / `serve|s [options]` / `deploy <env>`;
 * the bracketed argument placeholders are tolerated and discarded, and `|`
 * separates aliases exactly like `,` does.
 */
function parseCommandLine(line: string, lineNo: number): HelpCommand | undefined {
  const m =
    /^\s{1,12}([a-z][\w:-]*(?:[,|]\s*[\w:-]+)*)((?:\s+(?:\[[^\]]*\]|<[^>]*>))*)(?:\s{2,}(.*))?$/.exec(
      line,
    );
  if (!m) return undefined;
  const names = (m[1] ?? "").split(/[,|]/).map((n) => n.trim()).filter(Boolean);
  const name = names[0];
  if (!name || name.startsWith("-")) return undefined;
  return {
    name,
    aliases: names.slice(1),
    description: (m[3] ?? "").trim(),
    line: lineNo,
  };
}

/**
 * Cobra prints the same flag under `Flags:` and `Global Flags:` in nested
 * helps; keep the first definition of each canonical name.
 */
function dedupe(flags: HelpFlag[]): HelpFlag[] {
  const seen = new Set<string>();
  const out: HelpFlag[] = [];
  for (const f of flags) {
    if (seen.has(f.name)) continue;
    seen.add(f.name);
    out.push(f);
  }
  return out;
}

/** Every spelling of a flag: canonical name plus aliases. */
export function spellingsOf(flag: HelpFlag): string[] {
  return [flag.name, ...flag.aliases];
}
