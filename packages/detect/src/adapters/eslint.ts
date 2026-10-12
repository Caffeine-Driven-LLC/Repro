import { type Severity } from "@repro/contracts";
import { toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// Per rule, from what the pattern can lead to when the flagged input is attacker-controlled. The
// rules come from Repro's own config (sandbox/lint/eslint.config.mjs): eslint-plugin-security's
// recommended set plus the core rules against code built from strings.
const SEVERITY: Record<string, Severity> = {
  // Code execution and XSS.
  "security/detect-eval-with-expression": "high",
  "security/detect-disable-mustache-escape": "high",
  "security/detect-bidi-characters": "high",
  "no-eval": "high",
  "no-implied-eval": "high",
  "no-new-func": "high",
  // Command injection, path traversal, ReDoS, arbitrary module loading, weak randomness, CSRF bypass.
  "security/detect-child-process": "medium",
  "security/detect-non-literal-fs-filename": "medium",
  "security/detect-non-literal-require": "medium",
  "security/detect-unsafe-regex": "medium",
  "security/detect-pseudoRandomBytes": "medium",
  "security/detect-no-csrf-before-method-override": "medium",
  "security/detect-buffer-noassert": "medium",
  "no-script-url": "medium",
  // Usually benign, worth a look.
  "security/detect-non-literal-regexp": "low",
  "security/detect-possible-timing-attacks": "low",
  "security/detect-new-buffer": "low",
};

// ESLint with eslint-plugin-security over the project's JS/TS files.
export const eslintSpec: ToolSpec = {
  id: "eslint",
  applies: (workspace) => workspace.languages.includes("javascript") || workspace.languages.includes("typescript"),
  classify: (issue) => ({ severity: SEVERITY[issue.rule] ?? "low", category: "vulnerability" }),
};

export const eslintAdapter = toolAdapter(eslintSpec);
