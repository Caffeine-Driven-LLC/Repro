import { hasExtension, toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// stylelint-config-recommended is "possible errors" only: an invalid hex color, a duplicate property
// that silently overrides the first, an unknown unit. The browser drops what it can't read, so the
// worst case is a style that doesn't apply: low correctness, all of it.
export const stylelintSpec: ToolSpec = {
  id: "stylelint",
  applies: (workspace) => hasExtension(workspace, ".css"),
  classify: () => ({ severity: "low", category: "correctness" }),
};

export const stylelintAdapter = toolAdapter(stylelintSpec);
