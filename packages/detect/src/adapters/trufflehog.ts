import { toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// TruffleHog's filesystem scan, with --no-verification: verifying a credential means calling the
// service it belongs to, and the sandbox has no network (nor should a scan log in with a leaked
// key). Every TruffleHog detector matches one provider's credential format, so every Finding is high,
// like gitleaks'. Its report's raw and redacted secret fields are never read (repro_tools.py), and
// evidence masks the line (redactLine).
export const trufflehogSpec: ToolSpec = {
  id: "trufflehog",
  applies: (workspace) => workspace.fileIndex.length > 0,
  classify: () => ({ severity: "high", category: "vulnerability" }),
  secrets: true,
};

export const trufflehogAdapter = toolAdapter(trufflehogSpec);
