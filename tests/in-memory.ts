import { PracticeService } from "@/application/practice-service";
import { DomainError } from "@/domain/errors";
import type { EvaluationRequest, Evaluator } from "@/domain/evaluator";
import type {
  AttemptRepository,
  Clock,
  EvaluationRepository,
  ProblemRepository,
  SubmissionRepository,
} from "@/domain/ports";
import { parseEvaluationResult, RUBRIC_CRITERIA } from "@/domain/rubric";
import { normalizeContent } from "@/domain/submission";
import type {
  Attempt,
  AttemptStatus,
  Evaluation,
  EvaluationResult,
  Problem,
  StructuredTextContent,
  Submission,
} from "@/domain/types";

export const PROBLEM: Problem = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "parking-lot",
  title: "Parking Lot",
  description: "Design a multi-floor parking lot.",
  difficulty: "Medium",
  requirements: ["Multiple floors", "Issue tickets"],
  thinkAbout: ["Who allocates spots?"],
};

export const LEARNER_A = "learner-aaaa-0001";
export const LEARNER_B = "learner-bbbb-0002";

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

export class InMemoryProblemRepository implements ProblemRepository {
  constructor(private readonly problems: Problem[] = [PROBLEM]) {}
  async list() {
    return [...this.problems];
  }
  async findById(id: string) {
    return this.problems.find((p) => p.id === id) ?? null;
  }
  async findBySlug(slug: string) {
    return this.problems.find((p) => p.slug === slug) ?? null;
  }
}

export class InMemoryAttemptRepository implements AttemptRepository {
  readonly rows = new Map<string, Attempt>();

  async create(learnerId: string, problemId: string, attemptNumber: number) {
    const taken = [...this.rows.values()].some(
      (a) =>
        a.learnerId === learnerId && a.problemId === problemId && a.attemptNumber === attemptNumber,
    );
    if (taken) throw new DomainError("CONFLICT", "attempt number already used");
    const attempt: Attempt = {
      id: nextId("attempt"),
      learnerId,
      problemId,
      attemptNumber,
      status: "DRAFT",
      createdAt: new Date().toISOString(),
      submittedAt: null,
    };
    this.rows.set(attempt.id, attempt);
    return attempt;
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async highestAttemptNumber(learnerId: string, problemId: string) {
    return [...this.rows.values()]
      .filter((a) => a.learnerId === learnerId && a.problemId === problemId)
      .reduce((max, a) => Math.max(max, a.attemptNumber), 0);
  }
  async updateStatus(id: string, status: AttemptStatus, submittedAt?: string | null) {
    const current = this.rows.get(id);
    if (!current) throw new DomainError("NOT_FOUND", "Attempt not found");
    const next: Attempt = {
      ...current,
      status,
      submittedAt: submittedAt === undefined ? current.submittedAt : submittedAt,
    };
    this.rows.set(id, next);
    return next;
  }
  async listForLearner(learnerId: string) {
    return [...this.rows.values()].filter((a) => a.learnerId === learnerId).reverse();
  }
}

export class InMemorySubmissionRepository implements SubmissionRepository {
  readonly rows = new Map<string, Submission>();

  async upsert(attemptId: string, content: StructuredTextContent) {
    const existing = this.rows.get(attemptId);
    const submission: Submission = {
      id: existing?.id ?? nextId("submission"),
      attemptId,
      submissionType: "STRUCTURED_TEXT",
      content,
      updatedAt: new Date().toISOString(),
    };
    this.rows.set(attemptId, submission);
    return submission;
  }
  async findByAttemptId(attemptId: string) {
    return this.rows.get(attemptId) ?? null;
  }
}

export class InMemoryEvaluationRepository implements EvaluationRepository {
  readonly rows: Evaluation[] = [];

  async createRunning(submissionId: string, evaluatorType: string) {
    const evaluation: Evaluation = {
      id: nextId("evaluation"),
      submissionId,
      status: "RUNNING",
      evaluatorType,
      overallScore: null,
      strengths: [],
      improvementAreas: [],
      errorMessage: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      feedback: [],
    };
    this.rows.unshift(evaluation);
    return evaluation;
  }
  private patch(id: string, patch: Partial<Evaluation>) {
    const index = this.rows.findIndex((e) => e.id === id);
    const next = { ...this.rows[index]!, ...patch };
    this.rows[index] = next;
    return next;
  }
  async complete(id: string, result: EvaluationResult) {
    return this.patch(id, {
      status: "COMPLETED",
      overallScore: result.overallScore,
      strengths: result.strengths,
      improvementAreas: result.improvementAreas,
      feedback: result.criteria,
      completedAt: new Date().toISOString(),
      errorMessage: null,
    });
  }
  async fail(id: string, message: string) {
    return this.patch(id, {
      status: "FAILED",
      errorMessage: message,
      completedAt: new Date().toISOString(),
    });
  }
  async findLatestBySubmissionId(submissionId: string) {
    return this.rows.find((e) => e.submissionId === submissionId) ?? null;
  }
  async findLatestForSubmissionIds(ids: string[]) {
    const map = new Map<string, Evaluation>();
    for (const row of this.rows) {
      if (ids.includes(row.submissionId) && !map.has(row.submissionId)) {
        map.set(row.submissionId, row);
      }
    }
    return map;
  }
}

export class StubEvaluator implements Evaluator {
  readonly type = "STUB";
  calls: EvaluationRequest[] = [];
  constructor(private readonly behaviour: "ok" | "throw" = "ok") {}

  async evaluate(request: EvaluationRequest): Promise<EvaluationResult> {
    this.calls.push(request);
    if (this.behaviour === "throw") throw new Error("evaluator exploded");
    return parseEvaluationResult({
      criteria: RUBRIC_CRITERIA.map((name) => ({
        name,
        score: 4,
        evidence: "quoted from submission",
        concern: "a concern",
        suggestion: "a suggestion",
        confidence: 0.8,
      })),
      strengths: ["clear responsibilities"],
      improvementAreas: ["name the allocation strategy"],
    });
  }
}

export const fixedClock: Clock = { now: () => "2026-01-01T00:00:00.000Z" };

/** Shared repositories so two learners can be tested against one datastore. */
export function buildStore() {
  return {
    problems: new InMemoryProblemRepository(),
    attempts: new InMemoryAttemptRepository(),
    submissions: new InMemorySubmissionRepository(),
    evaluations: new InMemoryEvaluationRepository(),
  };
}

export function buildService(
  evaluator: Evaluator = new StubEvaluator(),
  learnerId: string = LEARNER_A,
  store = buildStore(),
) {
  const service = new PracticeService({ ...store, evaluator, clock: fixedClock, learnerId });
  return { service, ...store, evaluator };
}

export const validContent = normalizeContent({
  assumptions: "Single lot, one entry gate, cash only.",
  classesResponsibilities:
    "ParkingLot owns floors. SpotAllocator picks a spot. TicketService issues tickets.",
  relationships:
    "ParkingLot composes Floor; Floor composes Spot; Ticket references Spot and Vehicle.",
  designDecisions: "Allocation is a Strategy so nearest-spot can be swapped for cheapest-spot.",
  edgeCases: "Full lot returns NoSpotAvailable; double exit is idempotent.",
});
