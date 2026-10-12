import { Finding, type Severity } from "@repro/contracts";
import { describe, expect, it } from "vitest";
import {
  MAX_FINDINGS_PER_DETECTOR,
  parseToolReport,
  redactLine,
  type ToolIssue,
  type ToolSpec,
  toolAdapter,
} from "../src/tool-adapter.ts";
import { DetectorError } from "../src/util.ts";
import { FakeExecutor, multiWorkspace } from "./helpers.ts";

const issue = (over: Partial<ToolIssue> = {}): ToolIssue => ({
  rule: "R1",
  file: "app/service.py",
  line: 8,
  end_line: 8,
  message: "subprocess call with shell=True",
  level: "low",
  ...over,
});

const report = (issues: ToolIssue[], errors: string[] = []) => JSON.stringify({ issues, files: 1, batches: 1, errors });

const spec: ToolSpec = {
  id: "fake-tool",
  applies: (workspace) => workspace.languages.includes("python"),
  classify: (i) => (i.rule === "DROP" ? undefined : { severity: (i.level as Severity) || "low", category: "correctness" }),
};

describe("repro-scan tool adapters", () => {
  it("turns each issue into an unconfirmed Finding that re-checks the same rule in the same file", () => {
    const [f] = parseToolReport(spec, report([issue()]), multiWorkspace);
    expect(Finding.parse(f)).toMatchObject({
      detectorId: "fake-tool",
      ruleId: "R1",
      file: "app/service.py",
      lineStart: 8,
      lineEnd: 8,
      reproducible: false,
      reproductionCommand: "repro-check 'fake-tool' 'R1' 'app/service.py'",
      evidence: "    return subprocess.call(cmd, shell=True)",
    });
    expect(f!.reproductionOutput).toBeUndefined();
  });

  it("quotes rule ids and paths that a shell would otherwise read", () => {
    const [f] = parseToolReport(spec, report([issue({ rule: "Secret Keyword", file: "it's here.py" })]), multiWorkspace);
    expect(f!.reproductionCommand).toBe(`repro-check 'fake-tool' 'Secret Keyword' 'it'\\''s here.py'`);
  });

  it("drops what classify drops, and collapses an issue reported twice", () => {
    const findings = parseToolReport(spec, report([issue(), issue(), issue({ rule: "DROP" })]), multiWorkspace);
    expect(findings).toHaveLength(1);
  });

  it(`keeps at most ${MAX_FINDINGS_PER_DETECTOR} Findings, the most severe first`, () => {
    const many = Array.from({ length: 300 }, (_, n) => issue({ line: n + 1, end_line: n + 1, level: "info" }));
    many.push(issue({ line: 999, end_line: 999, level: "high" }));
    const findings = parseToolReport(spec, report(many), multiWorkspace);
    expect(findings).toHaveLength(MAX_FINDINGS_PER_DETECTOR);
    expect(findings[0]).toMatchObject({ severity: "high", lineStart: 999 });
  });

  it("masks the whole matched line for a secret scanner, keeping the key's name", () => {
    const secret = { ...spec, secrets: true };
    const [f] = parseToolReport(secret, report([issue({ file: "config/settings.py", line: 4, end_line: 4 })]), multiWorkspace);
    expect(f!.evidence).toBe('DB_PASSWORD = "REDACTED"');
    expect(redactLine("token = abcdefghijklmnopqrstuvwxyz0123")).toBe("token = REDACTED");
    expect(redactLine("const awsKey = process.env.AWS_KEY")).toBe("const awsKey = process.env.AWS_KEY");
  });

  it("runs repro-scan for its detector, and skips the sandbox when nothing applies", async () => {
    const exec = new FakeExecutor(() => ({ stdout: report([issue()]) }));
    const adapter = toolAdapter(spec);
    expect(await adapter.run(multiWorkspace, exec)).toHaveLength(1);
    expect(exec.requests[0]!.command).toBe("repro-scan 'fake-tool'");
    const none = new FakeExecutor(() => ({ stdout: report([]) }));
    expect(await adapter.run({ ...multiWorkspace, languages: ["go"] }, none)).toEqual([]);
    expect(none.requests).toHaveLength(0);
  });

  it("treats a scan where nothing could run, or an unreadable report, as a failure", async () => {
    const adapter = toolAdapter(spec);
    const broken = new FakeExecutor(() => ({ exitCode: 2, stderr: "repro-scan: every fake-tool run failed" }));
    await expect(adapter.run(multiWorkspace, broken)).rejects.toBeInstanceOf(DetectorError);
    const garbled = new FakeExecutor(() => ({ stdout: "Traceback (most recent call last)" }));
    await expect(adapter.run(multiWorkspace, garbled)).rejects.toThrow(/unreadable report/);
  });
});
