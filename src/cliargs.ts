/**
 * A tiny, dependency-free argv parser for flagdrift's own CLI. Supports
 * boolean flags, value flags (`--x v` and `--x=v`), repeatable value
 * flags, and short aliases. Unknown flags are a UsageError — flagdrift
 * of all tools should not silently ignore flags.
 */

import { UsageError } from "./capture.js";

export interface FlagSpec {
  /** Long spelling, e.g. `--docs`. */
  name: string;
  alias?: string;
  takesValue: boolean;
  repeatable?: boolean;
}

export interface ParsedArgs {
  values: Map<string, string | boolean | string[]>;
  positionals: string[];
}

export function parseArgs(argv: string[], specs: FlagSpec[]): ParsedArgs {
  const byName = new Map<string, FlagSpec>();
  for (const s of specs) {
    byName.set(s.name, s);
    if (s.alias) byName.set(s.alias, s);
  }

  const values = new Map<string, string | boolean | string[]>();
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith("-") || arg === "-") {
      positionals.push(arg);
      continue;
    }

    const eq = arg.indexOf("=");
    const spelled = eq === -1 ? arg : arg.slice(0, eq);
    const spec = byName.get(spelled);
    if (!spec) throw new UsageError(`unknown flag: ${spelled}`);

    let value: string | boolean;
    if (spec.takesValue) {
      if (eq !== -1) {
        value = arg.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next === undefined) throw new UsageError(`${spec.name} requires a value`);
        value = next;
        i++;
      }
    } else {
      if (eq !== -1) throw new UsageError(`${spec.name} does not take a value`);
      value = true;
    }

    if (spec.repeatable) {
      const list = (values.get(spec.name) as string[] | undefined) ?? [];
      list.push(value as string);
      values.set(spec.name, list);
    } else {
      values.set(spec.name, value);
    }
  }

  return { values, positionals };
}

export function str(args: ParsedArgs, name: string): string | undefined {
  const v = args.values.get(name);
  return typeof v === "string" ? v : undefined;
}

export function list(args: ParsedArgs, name: string): string[] {
  const v = args.values.get(name);
  return Array.isArray(v) ? v : [];
}

export function flag(args: ParsedArgs, name: string): boolean {
  return args.values.get(name) === true;
}
