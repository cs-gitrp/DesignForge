import { SUBMISSION_SECTIONS } from "./submission";
import type { StructuredTextContent } from "./types";

/**
 * Deterministic structural validation of a submission.
 *
 * This module deliberately makes NO judgement about design quality: it only
 * measures whether the required sections exist and contain enough written
 * content to be reviewable. Design quality is the LLM evaluator's job.
 */

export type SectionCoverage = "empty" | "thin" | "substantial";

export interface SectionReport {
  key: keyof StructuredTextContent;
  label: string;
  words: number;
  coverage: SectionCoverage;
}

export interface StructuralIssue {
  section: keyof StructuredTextContent | null;
  message: string;
  severity: "blocker" | "warning";
}

export interface StructuralReport {
  /** False only when nothing reviewable was written at all. */
  submittable: boolean;
  filledSections: number;
  totalSections: number;
  sections: SectionReport[];
  issues: StructuralIssue[];
}

/** Fewer than this many words is present-but-too-thin to review. */
export const THIN_SECTION_WORDS = 20;

const countWords = (text: string): number => {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

export function coverageOf(words: number): SectionCoverage {
  if (words === 0) return "empty";
  return words < THIN_SECTION_WORDS ? "thin" : "substantial";
}

export function reviewStructure(content: StructuredTextContent): StructuralReport {
  const sections: SectionReport[] = SUBMISSION_SECTIONS.map((section) => {
    const words = countWords(content[section.key]);
    return { key: section.key, label: section.label, words, coverage: coverageOf(words) };
  });

  const issues: StructuralIssue[] = [];
  const filled = sections.filter((s) => s.coverage !== "empty").length;

  if (filled === 0) {
    issues.push({
      section: null,
      severity: "blocker",
      message: "Every section is empty, so there is nothing to review.",
    });
  }

  for (const section of sections) {
    if (section.coverage === "empty") {
      issues.push({
        section: section.key,
        severity: "warning",
        message: `"${section.label}" is empty, so this part of your design cannot be reviewed.`,
      });
    } else if (section.coverage === "thin") {
      issues.push({
        section: section.key,
        severity: "warning",
        message: `"${section.label}" has only ${section.words} words — too little to review meaningfully.`,
      });
    }
  }

  return {
    submittable: filled > 0,
    filledSections: filled,
    totalSections: sections.length,
    sections,
    issues,
  };
}
