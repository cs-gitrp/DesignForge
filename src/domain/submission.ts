import { DomainError } from "./errors";
import type { StructuredTextContent } from "./types";

export interface SectionSpec {
  key: keyof StructuredTextContent;
  label: string;
  hint: string;
}

export const SUBMISSION_SECTIONS: readonly SectionSpec[] = [
  {
    key: "assumptions",
    label: "Assumptions",
    hint: "What did you assume about scope, scale and requirements?",
  },
  {
    key: "classesResponsibilities",
    label: "Classes & Responsibilities",
    hint: "List each class/interface and the single responsibility it owns.",
  },
  {
    key: "relationships",
    label: "Relationships",
    hint: "How do these types reference, compose or collaborate with each other?",
  },
  {
    key: "designDecisions",
    label: "Design Decisions & Trade-offs",
    hint: "Why this shape? Which patterns or abstractions, and what did you give up?",
  },
  {
    key: "edgeCases",
    label: "Edge Cases & Testability",
    hint: "Which edge cases matter, and how does the design let you test them?",
  },
];

export const EMPTY_CONTENT: StructuredTextContent = {
  assumptions: "",
  classesResponsibilities: "",
  relationships: "",
  designDecisions: "",
  edgeCases: "",
};

/** Deterministic check: every required section key must be present. */
export function normalizeContent(
  input: Partial<StructuredTextContent> | undefined | null,
): StructuredTextContent {
  if (!input || typeof input !== "object") {
    throw new DomainError("INVALID_INPUT", "Submission content is missing");
  }
  const out = { ...EMPTY_CONTENT };
  for (const section of SUBMISSION_SECTIONS) {
    const value = input[section.key];
    if (value !== undefined && typeof value !== "string") {
      throw new DomainError("INVALID_INPUT", `Section "${section.label}" must be text`);
    }
    out[section.key] = (value ?? "").slice(0, 20000);
  }
  return out;
}

export const filledSections = (content: StructuredTextContent): number =>
  SUBMISSION_SECTIONS.filter((s) => content[s.key].trim().length > 0).length;

export const isEmptySubmission = (content: StructuredTextContent): boolean =>
  filledSections(content) === 0;

/** Deterministic gate before any AI work happens. */
export function assertSubmittable(content: StructuredTextContent): void {
  if (isEmptySubmission(content)) {
    throw new DomainError(
      "EMPTY_SUBMISSION",
      "Add your design before submitting — all sections are empty.",
    );
  }
}

export function contentToPromptText(content: StructuredTextContent): string {
  return SUBMISSION_SECTIONS.map(
    (s) => `## ${s.label}\n${content[s.key].trim() || "(left blank by the learner)"}`,
  ).join("\n\n");
}
