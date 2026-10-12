import { type DetectorAdapter, type Executor, type Finding, type Severity, type Workspace } from "@repro/contracts";
import { DetectorError, findingId, readEvidence, redactSecrets, shq, truncate } from "./util.ts";

// One issue as repro-scan reports it (sandbox/bin/repro_tools.py): the tool's own rule, location,
// message, and level, already read out of whatever native format the tool writes.
export interface ToolIssue {
  rule: string;
  file: string;
  line: number;
  end_line: number;
  message: string;
  level: string;
}

interface ToolReport {
  issues: ToolIssue[];
  files: number;
  batches: number;
  errors: string[];
}

export interface Classification {
  severity: Severity;
  category: string;
}

// What a detector built on repro-scan declares. The tool's command line, config, and parser live in
// its class in repro_tools.py, shared with its reproduction (repro-check); this side decides which
// workspaces it applies to and what each rule means.
export interface ToolSpec {
  id: string;
  // Whether any file the tool looks at is in the workspace. Keep in step with the class's
  // matches() in repro_tools.py; it's what lets a workspace with nothing for the tool skip the
  // sandbox entirely.
  applies(workspace: Workspace): boolean;
  // A rule's severity and category, per rule family. undefined drops the issue.
  classify(issue: ToolIssue): Classification | undefined;
  // Secret scanners: evidence never shows the matched line as-is (see redactLine).
  secrets?: boolean;
  timeoutMs?: number;
}

// At most this many Findings per detector per run, the most severe kept. A linter pointed at a large
// untidy repo can report thousands of issues, every one of which would cost a reproduction run, and
// past a few hundred the rest are the same few rules again.
export const MAX_FINDINGS_PER_DETECTOR = 200;

const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

export const scanCommand = (id: string) => `repro-scan ${shq(id)}`;
export const checkCommand = (id: string, rule: string, file: string) => `repro-check ${shq(id)} ${shq(rule)} ${shq(file)}`;

// Evidence for a secret scanner's Finding. detect-secrets reports only a hash of what it matched, so
// there's no value to replace: every quoted string, and every long unbroken token with a digit in it,
// is masked on top of redactSecrets' known shapes. The key's name stays readable.
export function redactLine(text: string): string {
  return redactSecrets(text)
    .replace(/(["'`])[^"'`\n]{4,}\1/g, "$1REDACTED$1")
    .replace(/(?<![A-Za-z0-9_])(?=[A-Za-z_+/=~-]*\d)[A-Za-z0-9+/=_~-]{16,}/g, "REDACTED");
}

export function parseToolReport(
  spec: ToolSpec,
  stdout: string,
  workspace: Workspace,
  createdAt = new Date().toISOString(),
): Finding[] {
  let report: ToolReport;
  try {
    report = JSON.parse(stdout);
  } catch {
    throw new DetectorError(`${spec.id} produced an unreadable report: ${stdout.slice(0, 500)}`);
  }
  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const issue of report.issues) {
    const kind = spec.classify(issue);
    if (!kind) continue;
    const file = issue.file.replace(/^\.\//, "");
    const lineStart = Math.max(1, issue.line);
    const lineEnd = Math.max(lineStart, issue.end_line);
    const id = findingId({ runId: workspace.runId, detectorId: spec.id, ruleId: issue.rule, file, span: `${lineStart}-${lineEnd}` });
    if (seen.has(id)) continue;
    seen.add(id);
    const evidence = readEvidence(workspace.path, file, lineStart, lineEnd);
    findings.push({
      id,
      detectorId: spec.id,
      ruleId: issue.rule,
      severity: kind.severity,
      category: kind.category,
      file,
      lineStart,
      lineEnd,
      message: truncate(redactSecrets(issue.message), 500),
      evidence: spec.secrets ? redactLine(evidence) : evidence,
      reproducible: false,
      reproductionCommand: checkCommand(spec.id, issue.rule, file),
      createdAt,
    });
  }
  // Most severe first, then by location, so the cap drops the least severe and the order is stable.
  findings.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.file.localeCompare(b.file) || a.lineStart - b.lineStart,
  );
  return findings.slice(0, MAX_FINDINGS_PER_DETECTOR);
}

// A DetectorAdapter over one repro-scan detector. repro-scan exits 2 only when no run of the tool
// succeeded at all; a batch that failed alongside ones that didn't is listed in the report's errors
// and the rest of the Findings still count.
export function toolAdapter(spec: ToolSpec): DetectorAdapter {
  return {
    id: spec.id,
    async run(workspace: Workspace, exec: Executor): Promise<Finding[]> {
      if (!spec.applies(workspace)) return [];
      const result = await exec.exec({
        workspacePath: workspace.path,
        command: scanCommand(spec.id),
        timeoutMs: spec.timeoutMs ?? 10 * 60_000,
      });
      if (result.timedOut || result.exitCode !== 0) {
        throw new DetectorError(
          `${spec.id} failed (exit ${result.exitCode}${result.timedOut ? ", timed out" : ""}): ${result.stderr.slice(0, 2000)}`,
        );
      }
      return parseToolReport(spec, result.stdout, workspace);
    },
  };
}

// File filters for applies(): every file in the index with one of these extensions, or matching.
export const hasExtension = (workspace: Workspace, ...exts: string[]) =>
  workspace.fileIndex.some((f) => !isExcluded(f) && exts.some((e) => f.toLowerCase().endsWith(e)));

export const hasFile = (workspace: Workspace, test: (file: string) => boolean) =>
  workspace.fileIndex.some((f) => !isExcluded(f) && test(f));

// Same exclusions as repro_tools.py's EXCLUDED_DIRS.
const isExcluded = (file: string) => file.split("/").some((part) => part === "node_modules" || part === ".repro" || part === ".git");
