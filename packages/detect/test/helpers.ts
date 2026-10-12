import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ExecRequest, ExecResult, Executor, Workspace } from "@repro/contracts";

export const FIXTURES = join(import.meta.dirname, "fixtures");
export const SEEDED = join(FIXTURES, "seeded-target");

export function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

// A workspace over the seeded fixture tree, for parsing tests that read evidence but never exec.
export const seededWorkspace: Workspace = {
  runId: "run-test",
  path: SEEDED,
  fileIndex: [
    "app/jobs.py",
    "assistant/chat.ts",
    "assistant/memory.py",
    "package-lock.json",
    "package.json",
    "requirements.txt",
    "server/config.js",
    "server/index.js",
  ],
  languages: ["javascript", "python", "typescript"],
  headCommit: "0".repeat(40),
};

export const MULTI = join(FIXTURES, "multi-target");

// A workspace over the multi-language fixture tree the repro-scan detectors' captured reports
// (fixtures/tools/) were produced from, so evidence reads the same lines the tools pointed at.
export const multiWorkspace: Workspace = {
  runId: "run-test",
  path: MULTI,
  fileIndex: [
    ".github/workflows/ci.yml",
    "Dockerfile",
    "app/broken.py",
    "app/service.py",
    "config/broken.json",
    "config/settings.py",
    "config/settings.yaml",
    "db/query.sql",
    "infra/main.tf",
    "k8s/deploy.yaml",
    "native/buf.c",
    "scripts/deploy.sh",
    "tsconfig.json",
    "web/app.ts",
    "web/index.html",
    "web/server.js",
    "web/style.css",
  ],
  languages: ["bash", "c", "dockerfile", "javascript", "python", "terraform", "typescript"],
  headCommit: "0".repeat(40),
};

const REPRO_SCAN = join(import.meta.dirname, "../../../sandbox/bin/repro-scan");

// A detector's captured native report (fixtures/tools/<id>.*, real output of the tool run in the
// sandbox image on the multi-target tree), read by repro_tools.py's parser for that tool on the
// host and wrapped the way repro-scan prints a scan.
export function toolReport(detector: string): string {
  const name = readdirSync(join(FIXTURES, "tools")).find((f) => f.replace(/\.[^.]+$/, "") === detector);
  if (!name) throw new Error(`no captured report for ${detector}`);
  const issues = execFileSync("python3", [REPRO_SCAN, "--parse", detector, join(FIXTURES, "tools", name)], {
    encoding: "utf8",
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
  return JSON.stringify({ issues: JSON.parse(issues), files: 1, batches: 1, errors: [] });
}

// Scripted Executor: answers each request from a handler and records what it was asked to run.
export class FakeExecutor implements Executor {
  readonly requests: ExecRequest[] = [];
  constructor(private readonly handler: (req: ExecRequest) => Partial<ExecResult> | Promise<Partial<ExecResult>>) {}

  async exec(req: ExecRequest): Promise<ExecResult> {
    this.requests.push(req);
    const r = await this.handler(req);
    return { exitCode: 0, stdout: "", stderr: "", timedOut: false, durationMs: 1, ...r };
  }
}
