/**
 * Renderers: the human text report and the stable JSON shape CI consumes.
 * Both are pure functions over TargetResult values — no I/O here.
 */

import type { FailOn, Summary, TargetResult } from "./types.js";

/** `1 error`, `2 errors` — counts read like a human wrote them. */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

const FAIL_RANK: Record<Exclude<FailOn, "never">, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/** True when the run should exit 1 under the given gate. */
export function shouldFail(summary: Summary, failOn: FailOn): boolean {
  if (failOn === "never") return false;
  const gate = FAIL_RANK[failOn];
  if (gate >= 0 && summary.errors > 0) return true;
  if (gate >= 1 && summary.warnings > 0) return true;
  if (gate >= 2 && summary.infos > 0) return true;
  return false;
}

export function totalSummary(targets: TargetResult[]): Summary {
  const total = { errors: 0, warnings: 0, infos: 0 };
  for (const t of targets) {
    total.errors += t.summary.errors;
    total.warnings += t.summary.warnings;
    total.infos += t.summary.infos;
  }
  return total;
}

export interface RenderOptions {
  quiet?: boolean;
  failOn: FailOn;
}

/** The human report. Deterministic: same inputs, same bytes. */
export function renderText(targets: TargetResult[], opts: RenderOptions): string {
  const lines: string[] = [];
  const total = totalSummary(targets);

  for (const t of targets) {
    if (!opts.quiet) {
      lines.push(
        `flagdrift: ${t.name} — ${count(t.helpFlags, "help flag")}, ` +
          `${count(t.helpCommands, "command")} vs ${count(t.docsFiles.length, "docs file")}`,
      );
      for (const f of t.findings) {
        lines.push("");
        const where = f.file !== undefined ? `${f.file}:${f.line ?? "?"} › ` : "";
        lines.push(`  ${f.severity} ${f.code} ${where}${f.subject}`);
        lines.push(`      ${f.message}`);
        lines.push(`      fix: ${f.fix}`);
      }
      lines.push("");
    }
  }

  const verdict = shouldFail(total, opts.failOn) ? "FAIL" : "OK";
  lines.push(
    `flagdrift: ${verdict} — ${count(total.errors, "error")}, ${count(total.warnings, "warning")}, ` +
      `${total.infos} info (fail-on: ${opts.failOn})`,
  );
  return lines.join("\n") + "\n";
}

/** The stable JSON shape. Keys are API; only additions are allowed. */
export function renderJson(targets: TargetResult[], opts: RenderOptions): string {
  const total = totalSummary(targets);
  const payload = {
    ok: !shouldFail(total, opts.failOn),
    failOn: opts.failOn,
    summary: total,
    targets: targets.map((t) => ({
      name: t.name,
      helpFlags: t.helpFlags,
      helpCommands: t.helpCommands,
      docsFiles: t.docsFiles,
      summary: t.summary,
      findings: t.findings.map((f) => ({
        code: f.code,
        severity: f.severity,
        subject: f.subject,
        message: f.message,
        fix: f.fix,
        file: f.file ?? null,
        line: f.line ?? null,
      })),
    })),
  };
  return JSON.stringify(payload, null, 2) + "\n";
}
