import { PracticeService } from "@/application/practice-service";
import { evaluatorLabel, type Evaluator } from "@/domain/evaluator";
import { systemClock } from "@/domain/ports";
import { GeminiEvaluator } from "./evaluators/gemini-evaluator.server";
import { LlmEvaluator } from "./evaluators/llm-evaluator.server";
import { RuleBasedEvaluator } from "./evaluators/rule-based-evaluator";
import {
  createServerSupabaseClient,
  SupabaseAttemptRepository,
  SupabaseEvaluationRepository,
  SupabaseProblemRepository,
  SupabaseSubmissionRepository,
} from "./persistence/supabase-repositories.server";

/**
 * Single place where the evaluator implementation is chosen, in priority order:
 *   1. GEMINI_API_KEY   -> GeminiEvaluator (direct Gemini; an explicitly set key
 *                          wins because LOVABLE_API_KEY is always present on
 *                          Lovable Cloud, so Lovable-first would make this tier
 *                          unreachable)
 *   2. LOVABLE_API_KEY  -> LlmEvaluator (Lovable AI gateway, hosted default)
 *   3. neither          -> RuleBasedEvaluator (deterministic structural check)
 *
 * With no model key the deterministic structural validator runs, and the UI
 * labels the result as structural validation — never as AI review.
 */
function selectEvaluator(): Evaluator {
  if (process.env["GEMINI_API_KEY"]) return new GeminiEvaluator();
  if (process.env["LOVABLE_API_KEY"]) return new LlmEvaluator();
  return new RuleBasedEvaluator();
}

/**
 * Names the tier a submission would be routed to right now, so the UI can
 * disclose it before the learner submits. Returns only a label and the stored
 * type id — never key material.
 */
export function activeEvaluatorTier(): { type: string; label: string } {
  const evaluator = selectEvaluator();
  return { type: evaluator.type, label: evaluatorLabel(evaluator.type) };
}

export function createPracticeService(learnerId: string): PracticeService {
  const db = createServerSupabaseClient(learnerId);
  return new PracticeService({
    problems: new SupabaseProblemRepository(db),
    attempts: new SupabaseAttemptRepository(db),
    submissions: new SupabaseSubmissionRepository(db),
    evaluations: new SupabaseEvaluationRepository(db),
    evaluator: selectEvaluator(),
    clock: systemClock,
    learnerId,
  });
}
