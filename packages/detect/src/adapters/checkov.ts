import { type Classification, hasExtension, hasFile, toolAdapter, type ToolSpec } from "../tool-adapter.ts";
import { isDockerfile } from "./hadolint.ts";

// Checkov rates nothing offline (severities come from the Prisma Cloud platform, which the sandbox
// never contacts), so the mapping is Repro's: every failed check is a misconfiguration, low by
// default, and these, which expose something to anyone or hand out full control, rated up.
const RATED: Record<string, Classification> = {
  // Public storage and wide-open network access.
  CKV_AWS_20: { severity: "high", category: "vulnerability" }, // S3 bucket readable by everyone
  CKV_AWS_57: { severity: "high", category: "vulnerability" }, // S3 bucket writable by everyone
  CKV_AWS_24: { severity: "high", category: "vulnerability" }, // SSH open to 0.0.0.0/0
  CKV_AWS_25: { severity: "high", category: "vulnerability" }, // RDP open to 0.0.0.0/0
  CKV_AWS_260: { severity: "high", category: "vulnerability" }, // HTTP open to 0.0.0.0/0
  CKV_AWS_17: { severity: "high", category: "vulnerability" }, // RDS instance publicly accessible
  CKV_AZURE_9: { severity: "high", category: "vulnerability" }, // RDP open to the internet
  CKV_AZURE_10: { severity: "high", category: "vulnerability" }, // SSH open to the internet
  CKV_GCP_2: { severity: "high", category: "vulnerability" }, // SSH open to the internet
  CKV_GCP_3: { severity: "high", category: "vulnerability" }, // RDP open to the internet
  // Full administrative rights and credentials in code.
  CKV_AWS_1: { severity: "high", category: "vulnerability" }, // IAM policy allows *:*
  CKV_AWS_41: { severity: "high", category: "vulnerability" }, // AWS access keys in the provider block
  CKV_AWS_45: { severity: "high", category: "vulnerability" }, // credentials in Lambda environment
  // Containers that can take over their node.
  CKV_K8S_16: { severity: "high", category: "vulnerability" }, // privileged container
  CKV_K8S_17: { severity: "medium", category: "vulnerability" }, // shares the host PID namespace
  CKV_K8S_18: { severity: "medium", category: "vulnerability" }, // shares the host IPC namespace
  CKV_K8S_19: { severity: "medium", category: "vulnerability" }, // shares the host network
  CKV_K8S_20: { severity: "medium", category: "vulnerability" }, // allows privilege escalation
  // CI that can be hijacked.
  CKV_GHA_1: { severity: "medium", category: "vulnerability" }, // ACTIONS_ALLOW_UNSECURE_COMMANDS
  CKV_GHA_2: { severity: "high", category: "vulnerability" }, // shell injection from event fields
  CKV2_GHA_1: { severity: "medium", category: "vulnerability" }, // top-level write-all permissions
};

const DEFAULT: Classification = { severity: "low", category: "vulnerability" };

// Checkov over Terraform, Kubernetes, CloudFormation, Dockerfiles, and GitHub Actions workflows,
// offline. YAML files that aren't Kubernetes or CloudFormation are parsed and pass silently.
export const checkovSpec: ToolSpec = {
  id: "checkov",
  applies: (workspace) => hasExtension(workspace, ".tf", ".yml", ".yaml") || hasFile(workspace, isDockerfile),
  classify: (issue) => RATED[issue.rule] ?? DEFAULT,
  timeoutMs: 15 * 60_000,
};

export const checkovAdapter = toolAdapter(checkovSpec);
