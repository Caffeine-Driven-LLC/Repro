import { toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// Bandit's own per-test severity (HIGH/MEDIUM/LOW), carried over one-to-one: Bandit rates each test,
// not each match, so this is still a per-rule mapping. Every Bandit test is a security check.
const SEVERITY = { high: "high", medium: "medium", low: "low" } as const;

// Bandit over the project's Python files. It overlaps Ruff's S rules (ports of Bandit's tests) on
// purpose: Bandit is the reference implementation, rates its own tests, and covers the ones Ruff
// hasn't ported. Rules left out are listed in repro_tools.py's Bandit class.
export const banditSpec: ToolSpec = {
  id: "bandit",
  applies: (workspace) => workspace.languages.includes("python"),
  classify: (issue) => ({ severity: SEVERITY[issue.level as keyof typeof SEVERITY] ?? "low", category: "vulnerability" }),
};

export const banditAdapter = toolAdapter(banditSpec);
