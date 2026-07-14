/**
 * flagdrift.json loader and validator. The config is a plain JSON file:
 *
 *   {
 *     "failOn": "warning",
 *     "targets": [
 *       {
 *         "name": "mycli",
 *         "command": "mycli --help",          // or "helpFile": "help.txt"
 *         "docs": ["README.md", "docs/*.md"],
 *         "ignore": ["--debug-*"],
 *         "sections": ["CLI reference"],
 *         "fences": true
 *       }
 *     ]
 *   }
 *
 * Validation is strict about shape but lenient about omissions: everything
 * except `docs` and a help source has a sensible default.
 */

import fs from "node:fs";
import { UsageError } from "./capture.js";
import type { Config, FailOn, Target } from "./types.js";

const FAIL_ON_VALUES: FailOn[] = ["error", "warning", "info", "never"];

export function loadConfig(path: string): Config {
  let raw: string;
  try {
    raw = fs.readFileSync(path, "utf8");
  } catch {
    throw new UsageError(`cannot read config file: ${path}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new UsageError(`config is not valid JSON: ${path} (${(e as Error).message})`);
  }
  return validateConfig(json, path);
}

export function validateConfig(json: unknown, source: string): Config {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new UsageError(`${source}: config must be a JSON object`);
  }
  const obj = json as Record<string, unknown>;

  const failOn = obj["failOn"] ?? "warning";
  if (typeof failOn !== "string" || !FAIL_ON_VALUES.includes(failOn as FailOn)) {
    throw new UsageError(
      `${source}: "failOn" must be one of ${FAIL_ON_VALUES.join(", ")}`,
    );
  }

  const rawTargets = obj["targets"];
  if (!Array.isArray(rawTargets) || rawTargets.length === 0) {
    throw new UsageError(`${source}: "targets" must be a non-empty array`);
  }

  const targets = rawTargets.map((t, i) => validateTarget(t, `${source}: targets[${i}]`));
  const names = new Set<string>();
  for (const t of targets) {
    if (names.has(t.name)) {
      throw new UsageError(`${source}: duplicate target name "${t.name}"`);
    }
    names.add(t.name);
  }
  return { targets, failOn: failOn as FailOn };
}

function validateTarget(t: unknown, where: string): Target {
  if (typeof t !== "object" || t === null || Array.isArray(t)) {
    throw new UsageError(`${where}: target must be an object`);
  }
  const obj = t as Record<string, unknown>;

  const command = optionalString(obj["command"], `${where}: "command"`);
  const helpFile = optionalString(obj["helpFile"], `${where}: "helpFile"`);
  if ((command === undefined) === (helpFile === undefined)) {
    throw new UsageError(`${where}: set exactly one of "command" or "helpFile"`);
  }

  const docs = stringArray(obj["docs"], `${where}: "docs"`);
  if (docs.length === 0) {
    throw new UsageError(`${where}: "docs" must list at least one file or glob`);
  }

  const explicit = optionalString(obj["name"], `${where}: "name"`);
  const name = explicit ?? inferName(command, helpFile);

  const fences = obj["fences"] ?? true;
  if (typeof fences !== "boolean") {
    throw new UsageError(`${where}: "fences" must be a boolean`);
  }

  return {
    name,
    explicitName: explicit !== undefined,
    command,
    helpFile,
    docs,
    ignore: stringArray(obj["ignore"] ?? [], `${where}: "ignore"`),
    sections: stringArray(obj["sections"] ?? [], `${where}: "sections"`),
    fences,
  };
}

/** Interpreter words skipped when inferring a tool name from a command. */
const INTERPRETERS = new Set([
  "node", "deno", "bun", "python", "python3", "ruby", "perl", "php",
  "sh", "bash", "zsh", "env", "npx", "uvx", "go", "cargo",
]);

/** Infer a display name from the command / the help file's stem. */
export function inferName(command?: string, helpFile?: string): string {
  if (command) {
    const words = command.trim().split(/\s+/);
    let pick = words[0] ?? "target";
    for (const w of words) {
      if (w.startsWith("-")) break;
      pick = w;
      const base = w.split(/[\\/]/).pop() ?? w;
      if (!INTERPRETERS.has(base)) break;
    }
    const base = pick.split(/[\\/]/).pop() ?? pick;
    return base.replace(/\.(js|mjs|cjs|py|rb|sh|exe)$/i, "") || "target";
  }
  if (helpFile) {
    const base = helpFile.split(/[\\/]/).pop() ?? helpFile;
    return base.replace(/\.[^.]+$/, "") || "target";
  }
  return "target";
}

function optionalString(v: unknown, where: string): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string" || v.trim() === "") {
    throw new UsageError(`${where} must be a non-empty string`);
  }
  return v;
}

function stringArray(v: unknown, where: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new UsageError(`${where} must be an array of strings`);
  }
  return v as string[];
}
