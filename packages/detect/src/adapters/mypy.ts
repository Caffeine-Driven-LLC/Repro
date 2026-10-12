import { toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// mypy's type errors, under mypy's default (non-strict) settings: a call with the wrong argument
// type, a missing attribute, a return of the wrong type. Every one is a likely runtime bug in code
// its author annotated, so all of them are medium correctness.
export const mypySpec: ToolSpec = {
  id: "mypy",
  applies: (workspace) => workspace.languages.includes("python"),
  classify: () => ({ severity: "medium", category: "correctness" }),
};

export const mypyAdapter = toolAdapter(mypySpec);
