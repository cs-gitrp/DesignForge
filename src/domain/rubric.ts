import { DomainError } from "./errors";
import type { CriterionFeedback, EvaluationResult } from "./types";

export const RUBRIC_CRITERIA = [
  "Requirement Understanding",
  "Class Responsibilities",
  "Coupling & Cohesion",
  "Encapsulation & Interfaces",
  "Abstraction / Patterns",
  "Extensibility",
  "Edge Cases & Testability",
  "Explanation / Trade-offs",
] as const;

export type RubricCriterion = (typeof RUBRIC_CRITERIA)[number];

export const MIN_SCORE = 1;
export const MAX_SCORE = 5;

/** Shown to the learner before they design, so the rubric is never a surprise. */
export const RUBRIC_GUIDE: Record<RubricCriterion, string> = {
  "Requirement Understanding": "Did you capture the stated requirements and name your assumptions?",
  "Class Responsibilities": "Does each class own one clear responsibility?",
  "Coupling & Cohesion": "Do collaborators depend on as little of each other as possible?",
  "Encapsulation & Interfaces": "Is internal state hidden behind intentional interfaces?",
  "Abstraction / Patterns": "Are abstractions chosen for a reason you can defend?",
  Extensibility: "Can a likely new requirement be added without rewriting the core?",
  "Edge Cases & Testability": "Which edge cases matter, and can the design be tested?",
  "Explanation / Trade-offs": "Do you explain why, and what you gave up?",
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round1 = (value: number) => Math.round(value * 10) / 10;

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const asNumber = (value: unknown): number | null => {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** The overall score is always derived from the eight criterion scores. */
export const deriveOverallScore = (criteria: readonly CriterionFeedback[]): number =>
  round1(criteria.reduce((sum, c) => sum + c.score, 0) / criteria.length);

/**
 * Validates untrusted evaluator output (LLM JSON included) before it is stored.
 * Throws DomainError("EVALUATION_FAILED") rather than letting bad data through,
 * so a partially parsed evaluation is never persisted.
 */
export function parseEvaluationResult(raw: unknown): EvaluationResult {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("EVALUATION_FAILED", "Evaluator returned a non-object response");
  }
  const payload = raw as Record<string, unknown>;
  const rawCriteria = Array.isArray(payload["criteria"]) ? payload["criteria"] : [];

  const byName = new Map<string, Record<string, unknown>>();
  for (const entry of rawCriteria) {
    if (entry && typeof entry === "object") {
      const name = asString((entry as Record<string, unknown>)["name"]);
      const match = RUBRIC_CRITERIA.find((c) => c.toLowerCase() === name.toLowerCase());
      if (match) byName.set(match, entry as Record<string, unknown>);
    }
  }

  if (byName.size < RUBRIC_CRITERIA.length) {
    const missing = RUBRIC_CRITERIA.filter((c) => !byName.has(c));
    throw new DomainError(
      "EVALUATION_FAILED",
      `Evaluator response is missing criteria: ${missing.join(", ")}`,
    );
  }

  const criteria: CriterionFeedback[] = RUBRIC_CRITERIA.map((criterion) => {
    const entry = byName.get(criterion)!;
    const score = asNumber(entry["score"]);
    if (score === null) {
      throw new DomainError("EVALUATION_FAILED", `Criterion "${criterion}" has no numeric score`);
    }
    const evidence = asString(entry["evidence"]);
    if (!evidence) {
      throw new DomainError(
        "EVALUATION_FAILED",
        `Criterion "${criterion}" has no evidence from the submission`,
      );
    }
    const confidence = asNumber(entry["confidence"]);
    return {
      criterion,
      // Scores are integers on a 1-5 scale; anything else is coerced into range.
      score: clamp(Math.round(score), MIN_SCORE, MAX_SCORE),
      evidence,
      concern: asString(entry["concern"]),
      suggestion: asString(entry["suggestion"]),
      confidence: confidence === null ? 0.5 : round1(clamp(confidence, 0, 1)),
    };
  });

  const stringList = (value: unknown): string[] =>
    (Array.isArray(value) ? value : []).map(asString).filter(Boolean).slice(0, 4);

  return {
    // Derived, never taken from the evaluator: the rubric average is the only
    // authority on the overall score, so the number is always explainable.
    overallScore: deriveOverallScore(criteria),
    criteria,
    strengths: stringList(payload["strengths"]),
    improvementAreas: stringList(payload["improvementAreas"]),
  };
}
