import { describe, expect, it } from "vitest";

import { PracticeService } from "@/application/practice-service";
import { DomainError } from "@/domain/errors";
import {
  buildService,
  buildStore,
  fixedClock,
  LEARNER_A,
  LEARNER_B,
  PROBLEM,
  StubEvaluator,
  validContent,
} from "./in-memory";

const expectDomainError = async (promise: Promise<unknown>, code: string) => {
  await expect(promise).rejects.toBeInstanceOf(DomainError);
  await promise.catch((error: DomainError) => expect(error.code).toBe(code));
};

describe("attempts", () => {
  it("creates an attempt in DRAFT with an empty submission", async () => {
    const { service, submissions } = buildService();
    const attempt = await service.startAttempt(PROBLEM.slug);

    expect(attempt.status).toBe("DRAFT");
    expect(attempt.attemptNumber).toBe(1);
    expect(await submissions.findByAttemptId(attempt.id)).not.toBeNull();
  });

  it("saves a draft without submitting", async () => {
    const { service } = buildService();
    const attempt = await service.startAttempt(PROBLEM.id);

    await service.saveDraft(attempt.id, { assumptions: "One gate." });
    const workspace = await service.getWorkspace(attempt.id);

    expect(workspace.attempt.status).toBe("DRAFT");
    expect(workspace.submission.content.assumptions).toBe("One gate.");
    expect(workspace.evaluation).toBeNull();
  });

  it("submits a valid attempt and completes evaluation", async () => {
    const { service } = buildService();
    const attempt = await service.startAttempt(PROBLEM.id);

    const { attempt: submitted, evaluation } = await service.submitAttempt(
      attempt.id,
      validContent,
    );

    expect(submitted.status).toBe("COMPLETED");
    expect(submitted.submittedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(evaluation.status).toBe("COMPLETED");
    expect(evaluation.overallScore).toBe(4);
    expect(evaluation.feedback).toHaveLength(8);
  });

  it("rejects an entirely empty submission and keeps the attempt editable", async () => {
    const { service, evaluator } = buildService();
    const attempt = await service.startAttempt(PROBLEM.id);

    await expectDomainError(service.submitAttempt(attempt.id, {}), "EMPTY_SUBMISSION");

    const workspace = await service.getWorkspace(attempt.id);
    expect(workspace.attempt.status).toBe("DRAFT");
    expect((evaluator as StubEvaluator).calls).toHaveLength(0);
  });

  it("rejects duplicate submission of the same attempt", async () => {
    const { service } = buildService();
    const attempt = await service.startAttempt(PROBLEM.id);
    await service.submitAttempt(attempt.id, validContent);

    await expectDomainError(
      service.submitAttempt(attempt.id, validContent),
      "DUPLICATE_SUBMISSION",
    );
  });

  it("rejects editing a submitted attempt", async () => {
    const { service } = buildService();
    const attempt = await service.startAttempt(PROBLEM.id);
    await service.submitAttempt(attempt.id, validContent);

    await expectDomainError(
      service.saveDraft(attempt.id, { assumptions: "sneaky edit" }),
      "INVALID_TRANSITION",
    );
  });

  it("try again creates a new attempt and leaves the previous one untouched", async () => {
    const { service } = buildService();
    const first = await service.startAttempt(PROBLEM.id);
    await service.submitAttempt(first.id, validContent);

    const second = await service.startAttempt(PROBLEM.id);
    expect(second.id).not.toBe(first.id);
    expect(second.attemptNumber).toBe(2);
    expect(second.status).toBe("DRAFT");

    const previous = await service.getWorkspace(first.id);
    expect(previous.attempt.status).toBe("COMPLETED");
    expect(previous.submission.content).toEqual(validContent);
  });

  it("numbers attempts uniquely per learner and problem, retrying a taken number", async () => {
    const store = buildStore();
    const { service } = buildService(new StubEvaluator(), LEARNER_A, store);
    await service.startAttempt(PROBLEM.id);

    // Simulate a lost race: the number the service is about to use is taken.
    const original = store.attempts.highestAttemptNumber.bind(store.attempts);
    let firstCall = true;
    store.attempts.highestAttemptNumber = async (learnerId, problemId) => {
      if (firstCall) {
        firstCall = false;
        return 0; // stale read -> tries #1 again -> CONFLICT -> retry
      }
      return original(learnerId, problemId);
    };

    const second = await service.startAttempt(PROBLEM.id);
    expect(second.attemptNumber).toBe(2);

    const numbers = (await store.attempts.listForLearner(LEARNER_A)).map((a) => a.attemptNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe("anonymous learner ownership", () => {
  it("lets a learner open their own attempt", async () => {
    const { service } = buildService();
    const attempt = await service.startAttempt(PROBLEM.id);
    expect((await service.getWorkspace(attempt.id)).attempt.id).toBe(attempt.id);
  });

  it("hides another learner's attempt, draft and feedback", async () => {
    const store = buildStore();
    const a = buildService(new StubEvaluator(), LEARNER_A, store).service;
    const b = buildService(new StubEvaluator(), LEARNER_B, store).service;

    const attempt = await a.startAttempt(PROBLEM.id);
    await a.submitAttempt(attempt.id, validContent);

    await expectDomainError(b.getWorkspace(attempt.id), "NOT_FOUND");
    await expectDomainError(b.saveDraft(attempt.id, { assumptions: "hijack" }), "NOT_FOUND");
    await expectDomainError(b.retryEvaluation(attempt.id), "NOT_FOUND");
    expect(await b.listHistory()).toHaveLength(0);
    expect(await a.listHistory()).toHaveLength(1);
  });

  it("numbers each learner's attempts independently", async () => {
    const store = buildStore();
    const a = buildService(new StubEvaluator(), LEARNER_A, store).service;
    const b = buildService(new StubEvaluator(), LEARNER_B, store).service;

    await a.startAttempt(PROBLEM.id);
    await a.startAttempt(PROBLEM.id);
    const firstForB = await b.startAttempt(PROBLEM.id);

    expect(firstForB.attemptNumber).toBe(1);
  });
});

describe("evaluation failure handling", () => {
  it("marks the attempt FAILED but keeps the submission", async () => {
    const { service } = buildService(new StubEvaluator("throw"));
    const attempt = await service.startAttempt(PROBLEM.id);

    const { attempt: failedAttempt, evaluation } = await service.submitAttempt(
      attempt.id,
      validContent,
    );

    expect(failedAttempt.status).toBe("FAILED");
    expect(evaluation.status).toBe("FAILED");
    expect(evaluation.errorMessage).toContain("exploded");
    expect(evaluation.overallScore).toBeNull();
    expect(evaluation.feedback).toHaveLength(0);

    const workspace = await service.getWorkspace(attempt.id);
    expect(workspace.submission.content).toEqual(validContent);
  });

  it("retries a failed evaluation without re-submitting", async () => {
    const store = buildStore();
    const { service } = buildService(new StubEvaluator("throw"), LEARNER_A, store);
    const attempt = await service.startAttempt(PROBLEM.id);
    await service.submitAttempt(attempt.id, validContent);

    // Swap in a working evaluator, mirroring a transient provider outage clearing.
    const healthy = new PracticeService({
      ...store,
      evaluator: new StubEvaluator("ok"),
      clock: fixedClock,
      learnerId: LEARNER_A,
    });

    const evaluation = await healthy.retryEvaluation(attempt.id);
    expect(evaluation.status).toBe("COMPLETED");
    const workspace = await healthy.getWorkspace(attempt.id);
    expect(workspace.attempt.status).toBe("COMPLETED");
    // The retry reused the stored submission rather than asking for it again.
    expect(workspace.submission.content).toEqual(validContent);
  });

  it("refuses to retry an evaluation that did not fail", async () => {
    const { service } = buildService();
    const attempt = await service.startAttempt(PROBLEM.id);
    await service.submitAttempt(attempt.id, validContent);

    await expectDomainError(service.retryEvaluation(attempt.id), "INVALID_TRANSITION");
  });
});

describe("data validation", () => {
  it("rejects an unknown problem id", async () => {
    const { service } = buildService();
    await expectDomainError(
      service.getProblem("22222222-2222-2222-2222-222222222222"),
      "NOT_FOUND",
    );
    await expectDomainError(service.startAttempt("not-a-problem"), "NOT_FOUND");
  });

  it("rejects an unknown or empty attempt id", async () => {
    const { service } = buildService();
    await expectDomainError(service.getWorkspace("missing"), "NOT_FOUND");
    await expectDomainError(service.getWorkspace(""), "INVALID_INPUT");
  });

  it("rejects non-text submission sections", async () => {
    const { service } = buildService();
    const attempt = await service.startAttempt(PROBLEM.id);
    await expectDomainError(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.saveDraft(attempt.id, { assumptions: 42 as any }),
      "INVALID_INPUT",
    );
  });
});

describe("history", () => {
  it("lists attempts per problem with their latest evaluation", async () => {
    const { service } = buildService();
    const first = await service.startAttempt(PROBLEM.id);
    await service.submitAttempt(first.id, validContent);
    await service.startAttempt(PROBLEM.id);

    const history = await service.listHistory();
    expect(history).toHaveLength(2);
    const completed = history.find((h) => h.attempt.id === first.id);
    expect(completed?.evaluation?.overallScore).toBe(4);
    expect(history.find((h) => h.attempt.attemptNumber === 2)?.evaluation).toBeNull();
  });
});
