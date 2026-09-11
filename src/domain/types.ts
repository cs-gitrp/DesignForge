/**
 * Domain types. Framework-free and persistence-free on purpose: everything in
 * `application/` and `infrastructure/` depends on these, never the reverse.
 */

export type Difficulty = "Easy" | "Easy/Medium" | "Medium" | "Hard";

export interface Problem {
  id: string;
  slug: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  requirements: string[];
  thinkAbout: string[];
}

export type AttemptStatus = "DRAFT" | "SUBMITTED" | "EVALUATING" | "COMPLETED" | "FAILED";

export interface Attempt {
  id: string;
  /** Anonymous, browser-scoped owner. Never shown in the UI. */
  learnerId: string;
  problemId: string;
  attemptNumber: number;
  status: AttemptStatus;
  createdAt: string;
  submittedAt: string | null;
}

/**
 * Variation point: today the only submission format is structured text. New
 * formats (class diagram, code) add a member here plus a content shape, without
 * touching the practice flow.
 */
export type SubmissionType = "STRUCTURED_TEXT";

export interface StructuredTextContent {
  assumptions: string;
  classesResponsibilities: string;
  relationships: string;
  designDecisions: string;
  edgeCases: string;
}

export interface Submission {
  id: string;
  attemptId: string;
  submissionType: SubmissionType;
  content: StructuredTextContent;
  updatedAt: string;
}

export type EvaluationStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface CriterionFeedback {
  criterion: string;
  score: number;
  evidence: string;
  concern: string;
  suggestion: string;
  confidence: number;
}

export interface Evaluation {
  id: string;
  submissionId: string;
  status: EvaluationStatus;
  evaluatorType: string;
  overallScore: number | null;
  strengths: string[];
  improvementAreas: string[];
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  feedback: CriterionFeedback[];
}

export interface EvaluationResult {
  overallScore: number;
  criteria: CriterionFeedback[];
  strengths: string[];
  improvementAreas: string[];
}
