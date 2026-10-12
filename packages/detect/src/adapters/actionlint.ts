import { type Classification, hasFile, toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// Per actionlint check ("kind"). Script injection and hardcoded credentials are vulnerabilities; a
// workflow that won't parse or references something that doesn't exist fails when it runs.
const BY_KIND: Record<string, Classification> = {
  "untrusted-input": { severity: "high", category: "vulnerability" },
  credentials: { severity: "high", category: "vulnerability" },
  permissions: { severity: "medium", category: "vulnerability" },
  "syntax-check": { severity: "medium", category: "correctness" },
  expression: { severity: "medium", category: "correctness" },
  "job-needs": { severity: "medium", category: "correctness" },
  "workflow-call": { severity: "medium", category: "correctness" },
  action: { severity: "low", category: "correctness" },
  "deprecated-commands": { severity: "low", category: "correctness" },
};

export const isWorkflow = (file: string) => file.startsWith(".github/workflows/") && /\.ya?ml$/i.test(file);

// actionlint over the project's GitHub Actions workflows.
export const actionlintSpec: ToolSpec = {
  id: "actionlint",
  applies: (workspace) => hasFile(workspace, isWorkflow),
  classify: (issue) => BY_KIND[issue.rule] ?? { severity: "low", category: "correctness" },
};

export const actionlintAdapter = toolAdapter(actionlintSpec);
