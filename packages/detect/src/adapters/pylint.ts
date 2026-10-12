import { type Classification, toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// Warnings that are a security problem rather than a code smell.
const SECURITY = new Set(["W0122", "W0123", "W1510"]); // exec-used, eval-used, subprocess-run-check
// Warnings about tidiness rather than behavior: unused names, statements with no effect on purpose.
const TIDINESS = new Set(["W0611", "W0612", "W0614", "W0107", "W0105", "W0404", "W0621", "W0622", "W0120", "W0108"]);

// Pylint errors (E) are code that will fail when it runs: an undefined name, a call with the wrong
// number of arguments. Warnings (W) are likely bugs (a dangerous default argument, unreachable
// code), apart from the security and tidiness ones named above.
function classify(rule: string): Classification {
  if (rule.startsWith("E")) return { severity: "medium", category: "correctness" };
  if (SECURITY.has(rule)) return { severity: "medium", category: "vulnerability" };
  if (TIDINESS.has(rule)) return { severity: "info", category: "style" };
  return { severity: "low", category: "correctness" };
}

// Pylint's errors and warnings over the project's Python files; convention and refactor messages are
// never enabled (sandbox/lint/pylintrc).
export const pylintSpec: ToolSpec = {
  id: "pylint",
  applies: (workspace) => workspace.languages.includes("python"),
  classify: (issue) => classify(issue.rule),
  timeoutMs: 15 * 60_000,
};

export const pylintAdapter = toolAdapter(pylintSpec);
