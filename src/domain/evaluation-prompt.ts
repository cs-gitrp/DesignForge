import type { EvaluationRequest } from "./evaluator";
import { RUBRIC_CRITERIA } from "./rubric";
import { contentToPromptText } from "./submission";

/**
 * The single source of truth for how any model-backed evaluator is instructed.
 * Both the Lovable AI gateway evaluator and the direct Gemini evaluator import
 * this, so the constraints — no reference-solution comparison, verbatim
 * evidence, one actionable suggestion per criterion — cannot drift apart.
 */
export const SYSTEM_PROMPT = `You are a senior software engineer reviewing a candidate's Low-Level Design (LLD) submission for interview practice.

Rules you must follow:
- There are MANY valid LLD solutions. Do not compare the submission against one reference implementation, and never penalise a design purely for differing from how you would do it.
- Judge only what the learner actually wrote. Every "evidence" field must quote or closely paraphrase the learner's own words. If a section is empty or vague, say so explicitly instead of inventing content.
- Never give generic advice ("use SOLID", "add more classes"). Every suggestion must be specific to this submission and immediately actionable.
- Score each criterion 1-5 (integers), where 1 = absent/incorrect, 3 = reasonable but incomplete, 5 = strong and well justified.
- confidence is 0-1 and should be low when the submission gives you little evidence.
- Concerns must be real design weaknesses, not style preferences.
- Return 2-3 strengths and 2-3 improvementAreas, each one sentence, concrete.
- The overall score is computed by the application from your eight criterion scores, so score each criterion honestly and independently.`;

/**
 * JSON contract for evaluator output. No overallScore: the application derives
 * it from the eight criterion scores so a model cannot override the rubric.
 */
export const EVALUATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["criteria", "strengths", "improvementAreas"],
  properties: {
    criteria: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "score", "evidence", "concern", "suggestion", "confidence"],
        properties: {
          name: { type: "string", enum: [...RUBRIC_CRITERIA] },
          score: { type: "integer" },
          evidence: { type: "string" },
          concern: { type: "string" },
          suggestion: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
    strengths: { type: "array", items: { type: "string" } },
    improvementAreas: { type: "array", items: { type: "string" } },
  },
} as const;

export function buildUserPrompt(request: EvaluationRequest): string {
  const { problem, content, attemptNumber } = request;
  return [
    `# Problem: ${problem.title} (${problem.difficulty})`,
    problem.description,
    "",
    "## Stated requirements",
    problem.requirements.map((r) => `- ${r}`).join("\n"),
    "",
    `# Learner submission (attempt #${attemptNumber}, format: structured text)`,
    contentToPromptText(content),
    "",
    `Evaluate against exactly these criteria: ${RUBRIC_CRITERIA.join(", ")}.`,
    "Return one entry per criterion in the required JSON shape.",
  ].join("\n");
}
