import { type Severity } from "@repro/contracts";
import { toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// Plugins that match a specific credential format are as sure as gitleaks' rules and get the same
// severity. The heuristic ones (a long random-looking string, a variable named like a password with a
// literal assigned) are right often enough to keep, not often enough to rate as high.
const HEURISTIC: Record<string, Severity> = {
  "Base64 High Entropy String": "medium",
  "Hex High Entropy String": "medium",
  "Secret Keyword": "medium",
};

// Yelp's detect-secrets over every text file in the project. Its report carries only a hash of
// each secret, and evidence masks the line (redactLine), the same guarantee gitleaks' --redact gives.
export const detectSecretsSpec: ToolSpec = {
  id: "detect-secrets",
  applies: (workspace) => workspace.fileIndex.length > 0,
  classify: (issue) => ({ severity: HEURISTIC[issue.rule] ?? "high", category: "vulnerability" }),
  secrets: true,
};

export const detectSecretsAdapter = toolAdapter(detectSecretsSpec);
