import { hasExtension, toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// Files that don't parse at all (sandbox/bin/repro-syntax): a Python module that won't import, a
// JSON, TOML, or YAML file nothing can load. Whatever reads them fails outright, so medium.
export const syntaxSpec: ToolSpec = {
  id: "syntax",
  applies: (workspace) => hasExtension(workspace, ".py", ".json", ".toml", ".yml", ".yaml"),
  classify: () => ({ severity: "medium", category: "correctness" }),
};

export const syntaxAdapter = toolAdapter(syntaxSpec);
