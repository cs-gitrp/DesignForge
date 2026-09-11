import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { AttemptWorkspace, HistoryEntry } from "@/application/practice-service";
import { DomainError, type DomainErrorCode } from "@/domain/errors";
import type { Attempt, Evaluation, Problem } from "@/domain/types";

const contentSchema = z.object({
  assumptions: z.string().default(""),
  classesResponsibilities: z.string().default(""),
  relationships: z.string().default(""),
  designDecisions: z.string().default(""),
  edgeCases: z.string().default(""),
});

const idSchema = z.object({ id: z.string().min(1) });

export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; code: DomainErrorCode; message: string };

function toFailure(error: unknown): ActionResult<never> {
  if (error instanceof DomainError) return { ok: false, code: error.code, message: error.message };
  console.error("practice action failed", error);
  return {
    ok: false,
    code: "INVALID_INPUT",
    message: "Something went wrong. Your work has been kept — please try again.",
  };
}

/**
 * Establish the browser-scoped learner before either reads or writes. Creating
 * it on the first write races the immediate attempt-page loader in hosted
 * previews: that loader can arrive without the newly issued cookie and treat
 * the just-created attempt as somebody else's. Minting during the preceding
 * problem-page read makes the ownership handoff stable.
 */
const readService = async () => {
  const { requireLearnerId } = await import("./learner.server");
  const { createPracticeService } =
    await import("@/infrastructure/practice-service-factory.server");
  return createPracticeService(requireLearnerId());
};

const writeService = async () => {
  const { requireLearnerId } = await import("./learner.server");
  const { createPracticeService } =
    await import("@/infrastructure/practice-service-factory.server");
  return createPracticeService(requireLearnerId());
};

/**
 * Missing rows are an expected outcome, not a server crash: throwing across the
 * RPC boundary turns into a 500 HTML error page (blank screen), so reads return
 * null and the query layer maps that to a router notFound().
 */
async function orNull<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

export const listProblems = createServerFn({ method: "GET" }).handler(
  async (): Promise<Problem[]> => (await readService()).listProblems(),
);

/**
 * Discloses which evaluator tier will run before the learner submits. The
 * tier is chosen server-side by the factory; this only returns its label.
 */
export const getActiveEvaluatorTier = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ type: string; label: string }> => {
    const { activeEvaluatorTier } =
      await import("@/infrastructure/practice-service-factory.server");
    return activeEvaluatorTier();
  },
);

export const getProblem = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data }): Promise<Problem | null> =>
    orNull(async () => (await readService()).getProblem(data.id)),
  );

export const getWorkspace = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data }): Promise<AttemptWorkspace | null> =>
    orNull(async () => (await readService()).getWorkspace(data.id)),
  );

export const listHistory = createServerFn({ method: "GET" }).handler(
  async (): Promise<HistoryEntry[]> => (await readService()).listHistory(),
);

export const startAttempt = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data }): Promise<ActionResult<Attempt>> => {
    try {
      return { ok: true, data: await (await writeService()).startAttempt(data.id) };
    } catch (error) {
      return toFailure(error);
    }
  });

export const saveDraft = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ attemptId: z.string().min(1), content: contentSchema }).parse(input),
  )
  .handler(async ({ data }): Promise<ActionResult<{ updatedAt: string }>> => {
    try {
      const submission = await (await writeService()).saveDraft(data.attemptId, data.content);
      return { ok: true, data: { updatedAt: submission.updatedAt } };
    } catch (error) {
      return toFailure(error);
    }
  });

export const submitAttempt = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ attemptId: z.string().min(1), content: contentSchema }).parse(input),
  )
  .handler(
    async ({ data }): Promise<ActionResult<{ attempt: Attempt; evaluation: Evaluation }>> => {
      try {
        return {
          ok: true,
          data: await (await writeService()).submitAttempt(data.attemptId, data.content),
        };
      } catch (error) {
        return toFailure(error);
      }
    },
  );

export const retryEvaluation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ attemptId: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<ActionResult<Evaluation>> => {
    try {
      return { ok: true, data: await (await writeService()).retryEvaluation(data.attemptId) };
    } catch (error) {
      return toFailure(error);
    }
  });
