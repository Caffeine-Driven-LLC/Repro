import { type Classification, hasExtension, toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// The rules left after Repro's relaxed config (sandbox/lint/yamllint.yml). A duplicate key silently
// replaces the first value; a syntax error means nothing reads the file at all.
const BY_RULE: Record<string, Classification> = {
  syntax: { severity: "medium", category: "correctness" },
  "key-duplicates": { severity: "low", category: "correctness" },
  anchors: { severity: "low", category: "correctness" },
};

// yamllint over the project's YAML files.
export const yamllintSpec: ToolSpec = {
  id: "yamllint",
  applies: (workspace) => hasExtension(workspace, ".yml", ".yaml"),
  classify: (issue) => BY_RULE[issue.rule] ?? { severity: "info", category: "style" },
};

export const yamllintAdapter = toolAdapter(yamllintSpec);
