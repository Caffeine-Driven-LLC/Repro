import { type Classification, hasExtension, toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// Memory-safety errors, the ones that are exploitable in C and C++ rather than just wrong.
const MEMORY_SAFETY = new Set([
  "bufferAccessOutOfBounds",
  "arrayIndexOutOfBounds",
  "arrayIndexOutOfBoundsCond",
  "negativeIndex",
  "outOfBounds",
  "pointerOutOfBounds",
  "nullPointer",
  "nullPointerRedundantCheck",
  "uninitvar",
  "uninitdata",
  "doubleFree",
  "deallocuse",
  "useAfterFree",
  "invalidLifetime",
  "returnDanglingLifetime",
  "danglingLifetime",
  "invalidFunctionArg",
  "wrongPrintfScanfArgNum",
  "invalidScanfFormatWidth",
]);

// cppcheck's own severity per check, mapped onto the contract's scale. An "error" is undefined
// behavior or a definite bug; "warning", a likely one; performance and portability are lower.
const BY_SEVERITY: Record<string, Classification> = {
  error: { severity: "medium", category: "correctness" },
  warning: { severity: "low", category: "correctness" },
  performance: { severity: "low", category: "inefficiency" },
  portability: { severity: "low", category: "correctness" },
};

// cppcheck over the project's C and C++ files.
export const cppcheckSpec: ToolSpec = {
  id: "cppcheck",
  applies: (workspace) => hasExtension(workspace, ".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh", ".hxx"),
  classify: (issue) =>
    MEMORY_SAFETY.has(issue.rule) ? { severity: "high", category: "vulnerability" } : BY_SEVERITY[issue.level],
  timeoutMs: 15 * 60_000,
};

export const cppcheckAdapter = toolAdapter(cppcheckSpec);
