import { basename } from "node:path";
import { type Classification, hasFile, toolAdapter, type ToolSpec } from "../tool-adapter.ts";

// hadolint's own level per rule, mapped onto the contract's scale. Its DL rules are Dockerfile
// practice; the SC rules are ShellCheck run over each RUN instruction.
const BY_LEVEL: Record<string, Classification> = {
  error: { severity: "medium", category: "correctness" },
  warning: { severity: "low", category: "correctness" },
  info: { severity: "info", category: "style" },
  style: { severity: "info", category: "style" },
};

// Rules about what the image runs as or trusts, rather than how it's built.
const SECURITY: Record<string, Classification> = {
  DL3002: { severity: "medium", category: "vulnerability" }, // last USER is root
  DL3004: { severity: "medium", category: "vulnerability" }, // sudo in RUN
  DL3020: { severity: "low", category: "vulnerability" }, // ADD where COPY would do (remote URLs, archives)
  DL3007: { severity: "low", category: "vulnerability" }, // :latest, an unpinned base image
};

// Same files as repro_tools.py's Hadolint class.
export const isDockerfile = (file: string) => {
  const name = basename(file);
  return name === "Dockerfile" || name === "Containerfile" || name.startsWith("Dockerfile.") || name.endsWith(".Dockerfile");
};

// hadolint over the project's Dockerfiles.
export const hadolintSpec: ToolSpec = {
  id: "hadolint",
  applies: (workspace) => hasFile(workspace, isDockerfile),
  classify: (issue) => SECURITY[issue.rule] ?? BY_LEVEL[issue.level] ?? BY_LEVEL.info,
};

export const hadolintAdapter = toolAdapter(hadolintSpec);
