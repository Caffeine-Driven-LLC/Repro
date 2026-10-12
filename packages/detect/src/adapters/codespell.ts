import { toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// codespell's common misspellings in code, comments, and docs. A typo is a style issue; the rule is
// the misspelled word itself, so a reproduction checks for that word in that file.
export const codespellSpec: ToolSpec = {
  id: "codespell",
  applies: (workspace) => workspace.fileIndex.length > 0,
  classify: () => ({ severity: "info", category: "style" }),
};

export const codespellAdapter = toolAdapter(codespellSpec);
