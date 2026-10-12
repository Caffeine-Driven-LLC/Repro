import { type Classification, hasExtension, toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// ShellCheck's own level per check, mapped onto the contract's scale (style-level checks are never
// run). An "error" is a script that won't do what it says; a "warning" is a likely bug, often
// unquoted expansion that splits or globs untrusted input.
const BY_LEVEL: Record<string, Classification> = {
  error: { severity: "medium", category: "correctness" },
  warning: { severity: "low", category: "correctness" },
  info: { severity: "info", category: "correctness" },
};

// SC2148 (no shebang, so the shell is unknown) is about the file, not a defect in what it does.
const NOT_A_DEFECT = new Set(["SC2148"]);

// ShellCheck over the project's shell scripts.
export const shellcheckSpec: ToolSpec = {
  id: "shellcheck",
  applies: (workspace) => hasExtension(workspace, ".sh", ".bash", ".ksh"),
  classify: (issue) =>
    NOT_A_DEFECT.has(issue.rule) ? { severity: "info", category: "style" } : (BY_LEVEL[issue.level] ?? BY_LEVEL.info),
};

export const shellcheckAdapter = toolAdapter(shellcheckSpec);
