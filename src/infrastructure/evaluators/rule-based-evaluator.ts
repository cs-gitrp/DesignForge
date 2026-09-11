import type { EvaluationRequest, Evaluator } from "@/domain/evaluator";
import { parseEvaluationResult, RUBRIC_CRITERIA } from "@/domain/rubric";
import { SUBMISSION_SECTIONS } from "@/domain/submission";
import { reviewStructure, type SectionReport } from "@/domain/structural-validation";
import type { EvaluationResult, StructuredTextContent } from "@/domain/types";

/** Which written section a criterion can be structurally checked against. */
const SECTION_FOR: Record<string, keyof StructuredTextContent> = {
  "Requirement Understanding": "assumptions",
  "Class Responsibilities": "classesResponsibilities",
  "Coupling & Cohesion": "relationships",
  "Encapsulation & Interfaces": "classesResponsibilities",
  "Abstraction / Patterns": "designDecisions",
  Extensibility: "designDecisions",
  "Edge Cases & Testability": "edgeCases",
  "Explanation / Trade-offs": "designDecisions",
};

const firstSentences = (text: string, count: number): string =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, count)
    .join(" ")
    .slice(0, 400);

/** Structural coverage only — never a claim about design quality. */
const COVERAGE_SCORE = { empty: 1, thin: 2, substantial: 3 } as const;

export const STRUCTURAL_DISCLAIMER =
  "Structural validation only: this checks that the section exists and contains reviewable content. It does not judge the quality of your design.";

/**
 * Deterministic structural validator exposed through the Evaluator abstraction.
 *
 * It answers only questions a machine can answer without judgement: does the
 * submission exist, are the required sections present, and do they contain
 * enough content to be reviewed. It never treats the presence of words like
 * "Strategy" or "interface" as evidence of design quality, and its scores are
 * capped below the top of the scale because it does not assess design at all.
 * Design-level judgement belongs to the LLM evaluator.
 */
export class RuleBasedEvaluator implements Evaluator {
  readonly type = "RULE_BASED";

  async evaluate(request: EvaluationRequest): Promise<EvaluationResult> {
    const { content } = request;
    const report = reviewStructure(content);
    const byKey = new Map<string, SectionReport>(report.sections.map((s) => [s.key, s]));

    const criteria = RUBRIC_CRITERIA.map((criterion) => {
      const sectionKey = SECTION_FOR[criterion]!;
      const spec = SUBMISSION_SECTIONS.find((s) => s.key === sectionKey)!;
      const section = byKey.get(sectionKey)!;
      const text = content[sectionKey].trim();

      return {
        criterion,
        score: COVERAGE_SCORE[section.coverage],
        evidence: text
          ? `From your "${spec.label}" section (${section.words} words): "${firstSentences(text, 2)}"`
          : `Your "${spec.label}" section is empty, so there is no content to check for ${criterion.toLowerCase()}.`,
        concern:
          section.coverage === "substantial"
            ? STRUCTURAL_DISCLAIMER
            : section.coverage === "thin"
              ? `"${spec.label}" has only ${section.words} words — too little to review. ${STRUCTURAL_DISCLAIMER}`
              : `"${spec.label}" is missing entirely. ${STRUCTURAL_DISCLAIMER}`,
        suggestion:
          section.coverage === "substantial"
            ? `Run the AI review to get design-level feedback on ${criterion.toLowerCase()}.`
            : `Expand "${spec.label}": ${spec.hint}`,
        confidence: 0.2,
      };
    });

    return parseEvaluationResult({
      criteria: criteria.map(({ criterion, ...rest }) => ({ name: criterion, ...rest })),
      strengths: report.sections
        .filter((s) => s.coverage === "substantial")
        .slice(0, 3)
        .map((s) => `You wrote a substantial "${s.label}" section (${s.words} words).`),
      improvementAreas:
        report.issues.length > 0
          ? report.issues.slice(0, 3).map((issue) => issue.message)
          : [
              "All five sections contain reviewable content — run the AI review for design feedback.",
            ],
    });
  }
}
