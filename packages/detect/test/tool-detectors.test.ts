import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Finding, type Workspace } from "@repro/contracts";
import { DockerExecutor, sandboxAvailable } from "@repro/executor";
import { ingest, removeWorkspace } from "@repro/ingest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { banditSpec } from "../src/adapters/bandit.ts";
import { mypySpec } from "../src/adapters/mypy.ts";
import { pylintSpec } from "../src/adapters/pylint.ts";
import { vultureSpec } from "../src/adapters/vulture.ts";
import { reproduce } from "../src/reproduce.ts";
import { parseToolReport, type ToolSpec, toolAdapter } from "../src/tool-adapter.ts";
import { MULTI, multiWorkspace, toolReport } from "./helpers.ts";

type Row = [rule: string, file: string, line: number, severity: string, category: string];

// Every repro-scan detector against its captured report (fixtures/tools/), as Findings: rule, file,
// start line, severity, category, most severe first.
const CASES: Array<[ToolSpec, Row[]]> = [
  [
    banditSpec,
    [
      ["B602", "app/service.py", 8, "high", "vulnerability"],
      ["B301", "app/service.py", 12, "medium", "vulnerability"],
      ["B506", "app/service.py", 16, "medium", "vulnerability"],
      ["B403", "app/service.py", 2, "low", "vulnerability"],
      ["B105", "config/settings.py", 3, "low", "vulnerability"],
      ["B105", "config/settings.py", 4, "low", "vulnerability"],
      ["B105", "config/settings.py", 5, "low", "vulnerability"],
    ],
  ],
  [mypySpec, [["operator", "app/service.py", 20, "medium", "correctness"]]],
  [
    pylintSpec,
    [
      ["E0001", "app/broken.py", 1, "medium", "correctness"],
      ["E1120", "app/service.py", 16, "medium", "correctness"],
      ["E0602", "app/service.py", 31, "medium", "correctness"],
      ["W0102", "app/service.py", 23, "low", "correctness"],
      ["W0101", "app/service.py", 26, "low", "correctness"],
      ["W0611", "app/service.py", 1, "info", "style"],
    ],
  ],
  [
    vultureSpec,
    [
      ["unreachable-code", "app/service.py", 26, "low", "correctness"],
      ["unused-import", "app/service.py", 1, "info", "style"],
    ],
  ],
];

const FAKE_VALUES = ["FAKE_AWS_KEY_ID", "FAKE_AWS_SECRET", "FAKE_DB_PASSWORD", "FAKE_GITHUB_TOKEN"];

describe.each(CASES)("%s detector, from its captured report", (spec, expected) => {
  const findings = parseToolReport(spec, toolReport(spec.id), multiWorkspace);

  it("maps each rule to its severity and category", () => {
    expect(findings.map((f) => [f.ruleId, f.file, f.lineStart, f.severity, f.category])).toEqual(expected);
  });

  it("emits unconfirmed Findings, each reproduced by repro-check on its own rule and file", () => {
    for (const f of findings) {
      Finding.parse(f);
      expect(f).toMatchObject({ detectorId: spec.id, reproducible: false });
      expect(f.reproductionCommand).toBe(`repro-check '${spec.id}' '${f.ruleId}' '${f.file}'`);
      expect(f.evidence).not.toBe("");
    }
  });

  it("never carries a secret's value in a message or evidence", () => {
    const text = JSON.stringify(findings);
    for (const value of FAKE_VALUES) expect(text).not.toContain(value);
  });
});

// The real tools in the real image, end to end: every repro-scan detector finds its seeded issue in
// the multi-language fixture, the reproduction step confirms it, and fixing the issue by hand turns
// repro-check to NOT REPRODUCED.
const ready = await sandboxAvailable();

describe.skipIf(!ready)("repro-scan detectors (sandbox)", () => {
  const exec = new DockerExecutor();
  let source: string;
  let workspace: Workspace;

  beforeAll(async () => {
    source = mkdtempSync(join(tmpdir(), "repro-multi-"));
    cpSync(MULTI, source, { recursive: true });
    // Credentials in their real formats, assembled here so no scanner of this repo ever sees one.
    const rnd = (alphabet: string, n: number) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const mixed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const settings = readFileSync(join(MULTI, "config/settings.py"), "utf8")
      .replace("FAKE_AWS_KEY_ID", `AKIA${rnd(upper, 16)}`)
      .replace("FAKE_AWS_SECRET", rnd(`${mixed}/+`, 40))
      .replace("FAKE_DB_PASSWORD", `${rnd(mixed, 12)}#${rnd(mixed, 6)}`)
      .replace("FAKE_GITHUB_TOKEN", `ghp_${rnd(mixed, 36)}`);
    writeFileSync(join(source, "config/settings.py"), settings);
    const git = (...a: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: source });
    git("init", "-q");
    git("add", "-A", "--force");
    git("commit", "-qm", "seed");
    workspace = await ingest(`multi-${Date.now()}`, { kind: "local", ref: source });
  }, 60_000);

  afterAll(() => {
    if (workspace) removeWorkspace(workspace);
    rmSync(source, { recursive: true, force: true });
  });

  it.each(CASES.map(([spec, expected]) => [spec.id, spec, expected] as const))(
    "%s finds and reproduces its seeded issues",
    async (_id, spec, expected) => {
      const findings = await toolAdapter(spec).run(workspace, exec);
      const rows = findings.map((f) => [f.ruleId, f.file, f.lineStart]);
      for (const [rule, file, line] of expected) expect(rows).toContainEqual([rule, file, line]);
      const { findings: checked } = await reproduce(findings.slice(0, 1), workspace, exec);
      expect(checked[0]!.reproducible).toBe(true);
      expect(checked[0]!.reproductionOutput).toMatch(new RegExp(`^REPRODUCED ${spec.id} `));
    },
    180_000,
  );

  it("reports NOT REPRODUCED once the issue is fixed by hand", async () => {
    const check = (cmd: string) => exec.exec({ workspacePath: workspace.path, command: cmd, timeoutMs: 120_000 });
    const before = await check("repro-check eslint no-eval web/server.js");
    expect(before.exitCode).toBe(1);
    const server = join(workspace.path, "web/server.js");
    writeFileSync(server, readFileSync(server, "utf8").replace("  eval(req.body.code);\n", ""));
    const after = await check("repro-check eslint no-eval web/server.js");
    expect(after).toMatchObject({ exitCode: 0, stdout: "NOT REPRODUCED eslint no-eval in web/server.js\n" });
  }, 180_000);
});
