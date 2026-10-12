import { hasFile, toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// Diagnostics that only fire because the project opted into them (noUnusedLocals,
// noUnusedParameters, and their kin): tidiness, not type errors.
const UNUSED = new Set(["TS6133", "TS6138", "TS6192", "TS6196", "TS6198", "TS6199", "TS6205"]);

// The TypeScript compiler's type check (`tsc --noEmit`) for each tsconfig.json in the project, with
// that project's own compiler options: they define what its code is meant to type-check under. Every
// type error is medium correctness. Noise from dependencies not being installed at scan time
// ("cannot find module") is dropped in repro_tools.py's Tsc class.
export const tscSpec: ToolSpec = {
  id: "tsc",
  applies: (workspace) => workspace.languages.includes("typescript") && hasFile(workspace, (f) => f === "tsconfig.json" || f.endsWith("/tsconfig.json")),
  classify: (issue) => (UNUSED.has(issue.rule) ? { severity: "info", category: "style" } : { severity: "medium", category: "correctness" }),
};

export const tscAdapter = toolAdapter(tscSpec);
