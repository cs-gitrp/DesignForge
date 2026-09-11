import type { EvaluationResult, Problem, StructuredTextContent, SubmissionType } from "./types";

export interface EvaluationRequest {
  problem: Problem;
  submissionType: SubmissionType;
  content: StructuredTextContent;
  attemptNumber: number;
}

/**
 * The practice flow depends on this abstraction only. Adding a HumanEvaluator or
 * a second LLM evaluator means adding an implementation and registering it —
 * no change to submission, state transitions or the UI.
 */
export interface Evaluator {
  readonly type: string;
  evaluate(request: EvaluationRequest): Promise<EvaluationResult>;
}

/** Stored `evaluatorType` values, one per implementation. */
export const EVALUATOR_TYPES = {
  lovableGateway: "LLM",
  geminiDirect: "LLM_GEMINI_DIRECT",
  ruleBased: "RULE_BASED",
} as const;

/** True when a real model produced the evaluation (vs deterministic structural checks). */
export function isAiEvaluator(type: string): boolean {
  return type === EVALUATOR_TYPES.lovableGateway || type === EVALUATOR_TYPES.geminiDirect;
}

/** Human-readable label for the tier that actually ran, shown on feedback and history. */
export function evaluatorLabel(type: string): string {
  switch (type) {
    case EVALUATOR_TYPES.lovableGateway:
      return "AI design review — Lovable AI gateway";
    case EVALUATOR_TYPES.geminiDirect:
      return "AI design review — Gemini direct";
    case EVALUATOR_TYPES.ruleBased:
      return "Structural validation — no AI";
    default:
      return type;
  }
}
