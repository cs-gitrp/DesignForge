import type {
  Attempt,
  AttemptStatus,
  Evaluation,
  EvaluationResult,
  Problem,
  StructuredTextContent,
  Submission,
} from "./types";

export interface ProblemRepository {
  list(): Promise<Problem[]>;
  findById(id: string): Promise<Problem | null>;
  findBySlug(slug: string): Promise<Problem | null>;
}

export interface AttemptRepository {
  /** Rejects with DomainError("CONFLICT") when (learner, problem, number) is taken. */
  create(learnerId: string, problemId: string, attemptNumber: number): Promise<Attempt>;
  findById(id: string): Promise<Attempt | null>;
  highestAttemptNumber(learnerId: string, problemId: string): Promise<number>;
  updateStatus(id: string, status: AttemptStatus, submittedAt?: string | null): Promise<Attempt>;
  listForLearner(learnerId: string): Promise<Attempt[]>;
}

export interface SubmissionRepository {
  upsert(attemptId: string, content: StructuredTextContent): Promise<Submission>;
  findByAttemptId(attemptId: string): Promise<Submission | null>;
}

export interface EvaluationRepository {
  createRunning(submissionId: string, evaluatorType: string): Promise<Evaluation>;
  complete(evaluationId: string, result: EvaluationResult): Promise<Evaluation>;
  fail(evaluationId: string, message: string): Promise<Evaluation>;
  findLatestBySubmissionId(submissionId: string): Promise<Evaluation | null>;
  findLatestForSubmissionIds(submissionIds: string[]): Promise<Map<string, Evaluation>>;
}

export interface Clock {
  now(): string;
}

export const systemClock: Clock = { now: () => new Date().toISOString() };
