import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/domain/errors";
import type {
  AttemptRepository,
  EvaluationRepository,
  ProblemRepository,
  SubmissionRepository,
} from "@/domain/ports";
import type {
  Attempt,
  AttemptStatus,
  CriterionFeedback,
  Difficulty,
  Evaluation,
  EvaluationResult,
  Problem,
  StructuredTextContent,
  Submission,
} from "@/domain/types";

type Row = Record<string, unknown>;

/**
 * The learner id travels as a request header so RLS policies can enforce
 * ownership in the database, not only in application code.
 */
export function createServerSupabaseClient(learnerId: string): SupabaseClient {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new DomainError("INVALID_INPUT", "Backend is not configured");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { "x-learner-id": learnerId },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        headers.set("x-learner-id", learnerId);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

type PostgrestFailure = { message: string; code?: string } | null;

const UNIQUE_VIOLATION = "23505";

const fail = (context: string, error: PostgrestFailure): void => {
  if (!error) return;
  if (error.code === UNIQUE_VIOLATION) {
    throw new DomainError("CONFLICT", `${context}: ${error.message}`);
  }
  throw new DomainError("INVALID_INPUT", `${context}: ${error.message}`);
};

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const strArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

const toProblem = (row: Row): Problem => ({
  id: str(row["id"]),
  slug: str(row["slug"]),
  title: str(row["title"]),
  description: str(row["description"]),
  difficulty: str(row["difficulty"]) as Difficulty,
  requirements: strArray(row["requirements"]),
  thinkAbout: strArray(row["think_about"]),
});

const toAttempt = (row: Row): Attempt => ({
  id: str(row["id"]),
  learnerId: str(row["learner_id"]),
  problemId: str(row["problem_id"]),
  attemptNumber: Number(row["attempt_number"] ?? 1),
  status: str(row["status"]) as AttemptStatus,
  createdAt: str(row["created_at"]),
  submittedAt: (row["submitted_at"] as string | null) ?? null,
});

const toSubmission = (row: Row): Submission => ({
  id: str(row["id"]),
  attemptId: str(row["attempt_id"]),
  submissionType: "STRUCTURED_TEXT",
  content: {
    assumptions: str(row["assumptions"]),
    classesResponsibilities: str(row["classes_responsibilities"]),
    relationships: str(row["relationships"]),
    designDecisions: str(row["design_decisions"]),
    edgeCases: str(row["edge_cases"]),
  },
  updatedAt: str(row["updated_at"]),
});

const toFeedback = (row: Row): CriterionFeedback => ({
  criterion: str(row["criterion"]),
  score: Number(row["score"] ?? 0),
  evidence: str(row["evidence"]),
  concern: str(row["concern"]),
  suggestion: str(row["suggestion"]),
  confidence: Number(row["confidence"] ?? 0.5),
});

const toEvaluation = (row: Row): Evaluation => ({
  id: str(row["id"]),
  submissionId: str(row["submission_id"]),
  status: str(row["status"]) as Evaluation["status"],
  evaluatorType: str(row["evaluator_type"]),
  overallScore: row["overall_score"] === null ? null : Number(row["overall_score"]),
  strengths: strArray(row["strengths"]),
  improvementAreas: strArray(row["improvement_areas"]),
  errorMessage: (row["error_message"] as string | null) ?? null,
  createdAt: str(row["created_at"]),
  completedAt: (row["completed_at"] as string | null) ?? null,
  feedback: Array.isArray(row["feedback"])
    ? (row["feedback"] as Row[])
        .slice()
        .sort((a, b) => Number(a["position"] ?? 0) - Number(b["position"] ?? 0))
        .map(toFeedback)
    : [],
});

const EVALUATION_SELECT = "*, feedback(*)";

export class SupabaseProblemRepository implements ProblemRepository {
  constructor(private readonly db: SupabaseClient) {}

  async list(): Promise<Problem[]> {
    const { data, error } = await this.db.from("problems").select("*").order("created_at");
    fail("Loading problems", error);
    return (data ?? []).map(toProblem);
  }

  async findById(id: string): Promise<Problem | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data, error } = await this.db.from("problems").select("*").eq("id", id).maybeSingle();
    fail("Loading problem", error);
    return data ? toProblem(data) : null;
  }

  async findBySlug(slug: string): Promise<Problem | null> {
    const { data, error } = await this.db
      .from("problems")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    fail("Loading problem", error);
    return data ? toProblem(data) : null;
  }
}

export class SupabaseAttemptRepository implements AttemptRepository {
  constructor(private readonly db: SupabaseClient) {}

  async create(learnerId: string, problemId: string, attemptNumber: number): Promise<Attempt> {
    const { data, error } = await this.db
      .from("attempts")
      .insert({
        learner_id: learnerId,
        problem_id: problemId,
        attempt_number: attemptNumber,
        status: "DRAFT",
      })
      .select("*")
      .single();
    // UNIQUE(learner_id, problem_id, attempt_number) surfaces here as CONFLICT.
    fail("Creating attempt", error);
    return toAttempt(data as Row);
  }

  async findById(id: string): Promise<Attempt | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data, error } = await this.db.from("attempts").select("*").eq("id", id).maybeSingle();
    fail("Loading attempt", error);
    return data ? toAttempt(data) : null;
  }

  async highestAttemptNumber(learnerId: string, problemId: string): Promise<number> {
    const { data, error } = await this.db
      .from("attempts")
      .select("attempt_number")
      .eq("learner_id", learnerId)
      .eq("problem_id", problemId)
      .order("attempt_number", { ascending: false })
      .limit(1);
    fail("Numbering attempt", error);
    return Number((data ?? [])[0]?.attempt_number ?? 0);
  }

  async updateStatus(
    id: string,
    status: AttemptStatus,
    submittedAt?: string | null,
  ): Promise<Attempt> {
    const patch: Row = { status };
    if (submittedAt !== undefined) patch["submitted_at"] = submittedAt;
    const { data, error } = await this.db
      .from("attempts")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    fail("Updating attempt", error);
    return toAttempt(data as Row);
  }

  async listForLearner(learnerId: string): Promise<Attempt[]> {
    const { data, error } = await this.db
      .from("attempts")
      .select("*")
      .eq("learner_id", learnerId)
      .order("created_at", { ascending: false })
      .limit(200);
    fail("Loading history", error);
    return (data ?? []).map(toAttempt);
  }
}

export class SupabaseSubmissionRepository implements SubmissionRepository {
  constructor(private readonly db: SupabaseClient) {}

  async upsert(attemptId: string, content: StructuredTextContent): Promise<Submission> {
    const { data, error } = await this.db
      .from("submissions")
      .upsert(
        {
          attempt_id: attemptId,
          submission_type: "STRUCTURED_TEXT",
          assumptions: content.assumptions,
          classes_responsibilities: content.classesResponsibilities,
          relationships: content.relationships,
          design_decisions: content.designDecisions,
          edge_cases: content.edgeCases,
        },
        { onConflict: "attempt_id" },
      )
      .select("*")
      .single();
    fail("Saving submission", error);
    return toSubmission(data as Row);
  }

  async findByAttemptId(attemptId: string): Promise<Submission | null> {
    const { data, error } = await this.db
      .from("submissions")
      .select("*")
      .eq("attempt_id", attemptId)
      .maybeSingle();
    fail("Loading submission", error);
    return data ? toSubmission(data) : null;
  }
}

export class SupabaseEvaluationRepository implements EvaluationRepository {
  constructor(private readonly db: SupabaseClient) {}

  async createRunning(submissionId: string, evaluatorType: string): Promise<Evaluation> {
    const { data, error } = await this.db
      .from("evaluations")
      .insert({ submission_id: submissionId, evaluator_type: evaluatorType, status: "RUNNING" })
      .select(EVALUATION_SELECT)
      .single();
    fail("Starting evaluation", error);
    return toEvaluation(data as Row);
  }

  async complete(evaluationId: string, result: EvaluationResult): Promise<Evaluation> {
    const rows = result.criteria.map((c, index) => ({
      evaluation_id: evaluationId,
      criterion: c.criterion,
      score: c.score,
      evidence: c.evidence,
      concern: c.concern,
      suggestion: c.suggestion,
      confidence: c.confidence,
      position: index,
    }));
    const { error: feedbackError } = await this.db
      .from("feedback")
      .upsert(rows, { onConflict: "evaluation_id,criterion" });
    fail("Saving feedback", feedbackError);

    const { data, error } = await this.db
      .from("evaluations")
      .update({
        status: "COMPLETED",
        overall_score: result.overallScore,
        strengths: result.strengths,
        improvement_areas: result.improvementAreas,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", evaluationId)
      .select(EVALUATION_SELECT)
      .single();
    fail("Completing evaluation", error);
    return toEvaluation(data as Row);
  }

  async fail(evaluationId: string, message: string): Promise<Evaluation> {
    const { data, error } = await this.db
      .from("evaluations")
      .update({
        status: "FAILED",
        error_message: message.slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq("id", evaluationId)
      .select(EVALUATION_SELECT)
      .single();
    fail("Recording evaluation failure", error);
    return toEvaluation(data as Row);
  }

  async findLatestBySubmissionId(submissionId: string): Promise<Evaluation | null> {
    const { data, error } = await this.db
      .from("evaluations")
      .select(EVALUATION_SELECT)
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: false })
      .limit(1);
    fail("Loading evaluation", error);
    const row = (data ?? [])[0];
    return row ? toEvaluation(row) : null;
  }

  async findLatestForSubmissionIds(submissionIds: string[]): Promise<Map<string, Evaluation>> {
    const result = new Map<string, Evaluation>();
    if (submissionIds.length === 0) return result;
    const { data, error } = await this.db
      .from("evaluations")
      .select(EVALUATION_SELECT)
      .in("submission_id", submissionIds)
      .order("created_at", { ascending: false });
    fail("Loading evaluations", error);
    for (const row of data ?? []) {
      const evaluation = toEvaluation(row);
      if (!result.has(evaluation.submissionId)) result.set(evaluation.submissionId, evaluation);
    }
    return result;
  }
}
