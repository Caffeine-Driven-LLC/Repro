import { type Classification, hasExtension, toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// Per rule family (the code's letters). Layout and capitalisation are excluded in
// sandbox/lint/sqlfluff.cfg. Ambiguous (AM) and references (RF) are queries that may not return what
// they look like they return. PRS is a parse failure, but under ANSI: a dialect-specific query
// (Postgres, MySQL, T-SQL) fails to parse without being wrong, so it is only info.
const BY_FAMILY: Record<string, Classification> = {
  AM: { severity: "low", category: "correctness" },
  RF: { severity: "low", category: "correctness" },
  PRS: { severity: "info", category: "correctness" },
  ST: { severity: "info", category: "style" },
  AL: { severity: "info", category: "style" },
  CV: { severity: "info", category: "style" },
};

// SQLFluff over the project's .sql files, ANSI dialect.
export const sqlfluffSpec: ToolSpec = {
  id: "sqlfluff",
  applies: (workspace) => hasExtension(workspace, ".sql"),
  classify: (issue) => BY_FAMILY[issue.rule.replace(/\d+$/, "")] ?? { severity: "info", category: "style" },
};

export const sqlfluffAdapter = toolAdapter(sqlfluffSpec);
