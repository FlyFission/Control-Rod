import { createRequire } from "node:module";

/** The Rust kernel, compiled to WebAssembly. The only code that decides a state change. */
const require = createRequire(import.meta.url);
const wasm = require("../kernel/controlrod_kernel.js") as {
  decide_json(request: string): string;
  canonical_sha256_hex(json: string): string;
};

export type Status = "draft" | "released" | "in-work" | "in-verification" | "accepted" | "closed";
export type Action =
  | "release"
  | "claim"
  | "submit-output"
  | "submit-pre-check"
  | "revise"
  | "accept"
  | "accept-with-findings"
  | "return"
  | "reject";

/** Provider and model that ran an agent. The kernel treats the same provider as the same runtime. */
export interface RuntimeIdentity {
  provider: string;
  model: string;
}

export interface KernelRequest {
  status: Status;
  action: Action;
  actor_kind: "human" | "agent" | "system";
  actor_id: string;
  author_baseline?: string;
  checker_baseline?: string;
  author_runtime?: RuntimeIdentity;
  checker_runtime?: RuntimeIdentity;
  owner_override?: boolean;
  pre_check?: "pass" | "fail" | "inconclusive";
  assertion_verified?: boolean;
  digest_matches?: boolean;
  reason_given?: boolean;
}

export interface KernelOutcome {
  allowed: boolean;
  reason: string;
  next: Status | null;
}

export function decide(req: KernelRequest): KernelOutcome {
  return JSON.parse(wasm.decide_json(JSON.stringify(req))) as KernelOutcome;
}

/** Canonical SHA-256 (RFC 8785 under the shared profile). Throws for values outside it. */
export function digest(value: unknown): string {
  return wasm.canonical_sha256_hex(JSON.stringify(value));
}
