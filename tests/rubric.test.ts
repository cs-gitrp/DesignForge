import { describe, expect, it } from "vitest";

import { DomainError } from "@/domain/errors";
import { MAX_SCORE, parseEvaluationResult, RUBRIC_CRITERIA } from "@/domain/rubric";
import { isEmptySubmission, normalizeContent } from "@/domain/submission";
import { reviewStructure } from "@/domain/structural-validation";
import { RuleBasedEvaluator } from "@/infrastructure/evaluators/rule-based-evaluator";
import { PROBLEM, validContent } from "./in-memory";

const criteria = (score: number) =>
  RUBRIC_CRITERIA.map((name) => ({
    name,
    score,
    evidence: "e",
    concern: "c",
    suggestion: "s",
    confidence: 0.9,
  }));

describe("evaluator output validation", () => {
  it("accepts a well-formed result and clamps values into range", () => {
    const result = parseEvaluationResult({
      criteria: criteria(3).map((c) => ({ ...c, confidence: 4 })),
      strengths: ["a", "", "b"],
      improvementAreas: ["c"],
    });

    expect(result.criteria).toHaveLength(8);
    expect(result.overallScore).toBe(3);
    expect(result.criteria[0]!.confidence).toBe(1);
    expect(result.strengths).toEqual(["a", "b"]);
  });

  it("requires all eight criteria", () => {
    expect(() => parseEvaluationResult({ criteria: criteria(3).slice(0, 5) })).toThrowError(
      DomainError,
    );
  });

  it("rejects a non-numeric score, missing evidence and a non-object payload", () => {
    expect(() =>
      parseEvaluationResult({
        criteria: criteria(3).map((c, i) => (i === 0 ? { ...c, score: "good" } : c)),
      }),
    ).toThrowError(/no numeric score/);
    expect(() =>
      parseEvaluationResult({
        criteria: criteria(3).map((c, i) => (i === 0 ? { ...c, evidence: "  " } : c)),
      }),
    ).toThrowError(/no evidence/);
    expect(() => parseEvaluationResult("nope")).toThrowError(/non-object/);
  });

  it("coerces out-of-range and fractional scores to integers 1-5", () => {
    const result = parseEvaluationResult({
      criteria: criteria(3).map((c, i) =>
        i === 0 ? { ...c, score: 42 } : i === 1 ? { ...c, score: -7 } : { ...c, score: 3.6 },
      ),
    });
    expect(result.criteria[0]!.score).toBe(MAX_SCORE);
    expect(result.criteria[1]!.score).toBe(1);
    expect(result.criteria[2]!.score).toBe(4);
    expect(result.criteria.every((c) => Number.isInteger(c.score))).toBe(true);
  });

  it("derives the overall score from the criterion scores, ignoring any the evaluator sends", () => {
    const mixed = criteria(4).map((c, i) => (i === 0 ? { ...c, score: 2 } : c));
    const result = parseEvaluationResult({ overallScore: 5, criteria: mixed });
    expect(result.overallScore).toBe(3.8); // (2 + 7*4) / 8
  });
});

describe("deterministic submission checks", () => {
  it("detects an empty submission", () => {
    expect(isEmptySubmission(normalizeContent({}))).toBe(true);
    expect(isEmptySubmission(normalizeContent({ assumptions: "x" }))).toBe(false);
  });

  it("always returns all five sections", () => {
    expect(Object.keys(normalizeContent({ assumptions: "x" }))).toHaveLength(5);
  });

  it("reports empty, thin and substantial sections without judging design", () => {
    const report = reviewStructure(
      normalizeContent({
        assumptions: "short note",
        classesResponsibilities: validContent.classesResponsibilities,
      }),
    );
    const coverage = Object.fromEntries(report.sections.map((s) => [s.key, s.coverage]));

    expect(report.submittable).toBe(true);
    expect(coverage["assumptions"]).toBe("thin");
    expect(coverage["relationships"]).toBe("empty");
    expect(report.issues.some((i) => i.message.includes("Relationships"))).toBe(true);

    const empty = reviewStructure(normalizeContent({}));
    expect(empty.submittable).toBe(false);
    expect(empty.issues[0]!.severity).toBe("blocker");
  });
});

describe("rule based evaluator (structural validation)", () => {
  it("produces a full rubric without calling any model and never claims design quality", async () => {
    const result = await new RuleBasedEvaluator().evaluate({
      problem: PROBLEM,
      submissionType: "STRUCTURED_TEXT",
      content: validContent,
      attemptNumber: 1,
    });

    expect(result.criteria).toHaveLength(8);
    expect(result.criteria.every((c) => c.evidence.length > 0)).toBe(true);
    // It is capped below the top of the scale because it does not assess design.
    expect(result.criteria.every((c) => c.score <= 3)).toBe(true);
    expect(result.criteria.every((c) => c.concern.includes("Structural validation only"))).toBe(
      true,
    );
    expect(result.criteria.every((c) => c.confidence <= 0.3)).toBe(true);
  });

  it("scores empty sections lowest and says which section is missing", async () => {
    const result = await new RuleBasedEvaluator().evaluate({
      problem: PROBLEM,
      submissionType: "STRUCTURED_TEXT",
      content: normalizeContent({}),
      attemptNumber: 1,
    });

    expect(result.overallScore).toBe(1);
    expect(result.criteria[0]!.evidence).toContain("empty");
    expect(result.improvementAreas.length).toBeGreaterThan(0);
  });
});
