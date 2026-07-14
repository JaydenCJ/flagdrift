/**
 * Help-text capture: run the target's help command, or read a saved help
 * file. The only process flagdrift ever spawns is the one the user asked
 * for — nothing else runs, and nothing touches the network.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";

/** Thrown for anything that should exit 2 (usage / execution error). */
export class UsageError extends Error {}

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

/**
 * Run `command` through the shell and return the help text it prints.
 * Many CLIs print help to stderr and/or exit non-zero for --help, so the
 * capture prefers stdout but falls back to stderr, and only the "no
 * output at all" case is an error. `NO_COLOR` is set for determinism.
 */
export function captureHelp(command: string, cwd?: string): string {
  const res = spawnSync(command, {
    shell: true,
    cwd,
    encoding: "utf8",
    timeout: 15000,
    env: { ...process.env, NO_COLOR: "1", CLICOLOR: "0", TERM: "dumb" },
  });
  if (res.error) {
    throw new UsageError(`help command failed to start: ${command} (${res.error.message})`);
  }
  const stdout = (res.stdout ?? "").replace(ANSI_RE, "");
  const stderr = (res.stderr ?? "").replace(ANSI_RE, "");
  const text = stdout.trim().length > 0 ? stdout : stderr;
  if (text.trim().length === 0) {
    throw new UsageError(
      `help command printed nothing on stdout or stderr: ${command}` +
        (res.status !== 0 ? ` (exit ${res.status})` : ""),
    );
  }
  return text;
}

/** Read a saved help text from disk. */
export function readHelpFile(path: string): string {
  try {
    return fs.readFileSync(path, "utf8").replace(ANSI_RE, "");
  } catch {
    throw new UsageError(`cannot read help file: ${path}`);
  }
}
