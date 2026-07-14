/**
 * Minimal ambient declarations for the handful of Node.js built-ins this
 * project uses. Declaring them in-repo keeps `typescript` the only
 * devDependency (no `@types/node`); the surface below is intentionally
 * restricted to exactly what `src/` calls, so a typo against a real Node
 * API still fails to compile.
 */

declare module "node:fs" {
  export interface Stats {
    isDirectory(): boolean;
    isFile(): boolean;
  }
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readdirSync(
    path: string,
    options: { withFileTypes: true }
  ): Dirent[];
  export function statSync(
    path: string,
    options: { throwIfNoEntry: false }
  ): Stats | undefined;
  const fs: {
    readFileSync: typeof readFileSync;
    readdirSync: typeof readdirSync;
    statSync: typeof statSync;
  };
  export default fs;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function relative(from: string, to: string): string;
  export function basename(p: string, ext?: string): string;
  export function dirname(p: string): string;
  export const sep: string;
  const path: {
    join: typeof join;
    resolve: typeof resolve;
    relative: typeof relative;
    basename: typeof basename;
    dirname: typeof dirname;
    sep: string;
  };
  export default path;
}

declare module "node:child_process" {
  export interface SpawnSyncResult {
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error;
  }
  export function spawnSync(
    command: string,
    options: {
      shell?: boolean;
      cwd?: string;
      encoding: "utf8";
      timeout?: number;
      env?: Record<string, string | undefined>;
    }
  ): SpawnSyncResult;
}

declare var process: {
  argv: string[];
  env: Record<string, string | undefined>;
  cwd(): string;
  exit(code?: number): never;
  stdout: { write(chunk: string): boolean };
  stderr: { write(chunk: string): boolean };
};
