import { type Classification, hasExtension, toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// Per rule (sandbox/lint/htmlhint.json enables exactly these). Broken structure and duplicate ids
// change how the page renders and what scripts find; a missing alt is an accessibility defect.
const BY_RULE: Record<string, Classification> = {
  "tag-pair": { severity: "low", category: "correctness" },
  "attr-no-duplication": { severity: "low", category: "correctness" },
  "id-unique": { severity: "low", category: "correctness" },
  "src-not-empty": { severity: "low", category: "correctness" },
  "attr-unsafe-chars": { severity: "low", category: "correctness" },
  "alt-require": { severity: "low", category: "accessibility" },
  "doctype-html5": { severity: "info", category: "style" },
};

// HTMLHint over the project's HTML files.
export const htmlhintSpec: ToolSpec = {
  id: "htmlhint",
  applies: (workspace) => hasExtension(workspace, ".html", ".htm"),
  classify: (issue) => BY_RULE[issue.rule] ?? { severity: "info", category: "style" },
};

export const htmlhintAdapter = toolAdapter(htmlhintSpec);
