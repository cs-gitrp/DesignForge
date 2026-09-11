import { assertTransition } from "@/domain/attempt-state-machine";
import { DomainError, notFound } from "@/domain/errors";
import type { Evaluator } from "@/domain/evaluator";
import type {
  AttemptRepository,
  Clock,
  EvaluationRepository,
  ProblemRepository,
  SubmissionRepository,
} from "@/domain/ports";
import { assertSubmittable, normalizeContent } from "@/domain/submission";
import type {
  Attempt,
  Evaluation,
  Problem,
  StructuredTextContent,
  Submission,
} from "@/domain/types";

export interface PracticeServiceDeps {
  problems: ProblemRepository;
  attempts: AttemptRepository;
  submissions: SubmissionRepository;
  evaluations: EvaluationRepository;
  evaluator: Evaluator;
  clock: Clock;
  /** The anonymous learner this service instance acts for. */
  learnerId: string;
}

export interface AttemptWorkspace {
  attempt: Attempt;
  problem: Problem;
  submission: Submission;
  evaluation: Evaluation | null;
}

export interface HistoryEntry {
  attempt: Attempt;
  problem: Problem;
  evaluation: Evaluation | null;
}

const MAX_NUMBERING_ATTEMPTS = 5;

/**
 * Application layer. Owns the learner journey and all state-transition rules.
 * Knows nothing about HTTP, React or Postgres, and talks to the evaluator only
 * through the Evaluator abstraction.
 */
export class PracticeService {
  constructor(private readonly deps: PracticeServiceDeps) {}

  listProblems(): Promise<Problem[]> {
    return this.deps.problems.list();
  }

  async getProblem(idOrSlug: string): Promise<Problem> {
    if (!idOrSlug) throw new DomainError("INVALID_INPUT", "A problem id is required");
    const problem =
      (await this.deps.problems.findBySlug(idOrSlug)) ??
      (await this.deps.problems.findById(idOrSlug));
    if (!problem) throw notFound("Problem");
    return problem;
  }

  /**
   * Starting practice always creates a fresh attempt; earlier ones are untouched.
   * Attempt numbers are unique per (learner, problem) in the database, so a lost
   * race is retried rather than producing two "attempt #2"s.
   */
  async startAttempt(problemIdOrSlug: string): Promise<Attempt> {
    const problem = await this.getProblem(problemIdOrSlug);

    for (let tries = 0; tries < MAX_NUMBERING_ATTEMPTS; tries += 1) {
      const highest = await this.deps.attempts.highestAttemptNumber(
        this.deps.learnerId,
        problem.id,
      );
      try {
        const attempt = await this.deps.attempts.create(
          this.deps.learnerId,
          problem.id,
          highest + 1,
        );
        await this.deps.submissions.upsert(attempt.id, normalizeContent({}));
        return attempt;
      } catch (error) {
        if (error instanceof DomainError && error.code === "CONFLICT") continue;
        throw error;
      }
    }
    throw new DomainError("CONFLICT", "Could not start a new attempt right now. Please try again.");
  }

  async getWorkspace(attemptId: string): Promise<AttemptWorkspace> {
    const attempt = await this.requireAttempt(attemptId);
    const problem = await this.deps.problems.findById(attempt.problemId);
    if (!problem) throw notFound("Problem");
    const submission =
      (await this.deps.submissions.findByAttemptId(attempt.id)) ??
      (await this.deps.submissions.upsert(attempt.id, normalizeContent({})));
    const evaluation = await this.deps.evaluations.findLatestBySubmissionId(submission.id);
    return { attempt, problem, submission, evaluation };
  }

  async saveDraft(attemptId: string, raw: Partial<StructuredTextContent>): Promise<Submission> {
    const attempt = await this.requireAttempt(attemptId);
    assertTransition(attempt.status, "DRAFT");
    return this.deps.submissions.upsert(attempt.id, normalizeContent(raw));
  }

  /**
   * Persists the submission and moves DRAFT -> SUBMITTED -> EVALUATING *before*
   * calling the evaluator, so a failing evaluator can never lose the design.
   */
  async submitAttempt(
    attemptId: string,
    raw: Partial<StructuredTextContent>,
  ): Promise<{ attempt: Attempt; evaluation: Evaluation }> {
    const attempt = await this.requireAttempt(attemptId);
    if (attempt.status !== "DRAFT") {
      throw new DomainError(
        "DUPLICATE_SUBMISSION",
        `This attempt was already submitted (status ${attempt.status}). Use Try Again to start a new attempt.`,
      );
    }
    const content = normalizeContent(raw);
    assertSubmittable(content);

    const submission = await this.deps.submissions.upsert(attempt.id, content);
    assertTransition(attempt.status, "SUBMITTED");
    const submitted = await this.deps.attempts.updateStatus(
      attempt.id,
      "SUBMITTED",
      this.deps.clock.now(),
    );

    const evaluation = await this.runEvaluation(submitted, submission);
    const finalAttempt = (await this.deps.attempts.findById(attempt.id)) ?? submitted;
    return { attempt: finalAttempt, evaluation };
  }

  /** Retrying evaluation reuses the persisted submission; it never re-asks for input. */
  async retryEvaluation(attemptId: string): Promise<Evaluation> {
    const attempt = await this.requireAttempt(attemptId);
    if (attempt.status !== "FAILED") {
      throw new DomainError("INVALID_TRANSITION", "Only a failed evaluation can be retried.");
    }
    const submission = await this.deps.submissions.findByAttemptId(attempt.id);
    if (!submission) throw notFound("Submission");
    return this.runEvaluation(attempt, submission);
  }

  async getFeedback(attemptId: string): Promise<AttemptWorkspace> {
    const workspace = await this.getWorkspace(attemptId);
    if (!workspace.evaluation) throw notFound("Evaluation");
    return workspace;
  }

  async listHistory(): Promise<HistoryEntry[]> {
    const [attempts, problems] = await Promise.all([
      this.deps.attempts.listForLearner(this.deps.learnerId),
      this.deps.problems.list(),
    ]);
    const problemsById = new Map(problems.map((p) => [p.id, p]));
    const submissions = await Promise.all(
      attempts.map((a) => this.deps.submissions.findByAttemptId(a.id)),
    );
    const submissionIds = submissions.filter((s): s is Submission => s !== null).map((s) => s.id);
    const evaluations = await this.deps.evaluations.findLatestForSubmissionIds(submissionIds);

    return attempts.flatMap((attempt, index) => {
      const problem = problemsById.get(attempt.problemId);
      if (!problem) return [];
      const submission = submissions[index];
      const evaluation = submission ? (evaluations.get(submission.id) ?? null) : null;
      return [{ attempt, problem, evaluation }];
    });
  }

  /**
   * Ownership gate. Another learner's attempt is indistinguishable from a
   * missing one, so nothing leaks about what exists.
   */
  private async requireAttempt(attemptId: string): Promise<Attempt> {
    if (!attemptId) throw new DomainError("INVALID_INPUT", "An attempt id is required");
    const attempt = await this.deps.attempts.findById(attemptId);
    if (!attempt || attempt.learnerId !== this.deps.learnerId) throw notFound("Attempt");
    return attempt;
  }

  private async runEvaluation(attempt: Attempt, submission: Submission): Promise<Evaluation> {
    assertTransition(attempt.status, "EVALUATING");
    await this.deps.attempts.updateStatus(attempt.id, "EVALUATING");
    const evaluation = await this.deps.evaluations.createRunning(
      submission.id,
      this.deps.evaluator.type,
    );

    const problem = await this.deps.problems.findById(attempt.problemId);
    if (!problem) throw notFound("Problem");

    try {
      const result = await this.deps.evaluator.evaluate({
        problem,
        submissionType: submission.submissionType,
        content: submission.content,
        attemptNumber: attempt.attemptNumber,
      });
      const completed = await this.deps.evaluations.complete(evaluation.id, result);
      await this.deps.attempts.updateStatus(attempt.id, "COMPLETED");
      return completed;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown evaluation error";
      const failed = await this.deps.evaluations.fail(evaluation.id, message);
      await this.deps.attempts.updateStatus(attempt.id, "FAILED");
      return failed;
    }
  }
}
