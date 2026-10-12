import { toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// Code that can never run (after a return, under a condition that is never true) is a correctness
// smell: whatever it was meant to do doesn't happen. An unused import or argument is tidiness.
const UNREACHABLE = /^(unreachable-code|unsatisfiable-|redundant-if-condition)/;

// Vulture's dead code at 90% confidence and up only; the lower bands (unused functions, classes,
// attributes) guess wrong on anything called dynamically or by a framework.
export const vultureSpec: ToolSpec = {
  id: "vulture",
  applies: (workspace) => workspace.languages.includes("python"),
  classify: (issue) =>
    UNREACHABLE.test(issue.rule) ? { severity: "low", category: "correctness" } : { severity: "info", category: "style" },
};

export const vultureAdapter = toolAdapter(vultureSpec);
