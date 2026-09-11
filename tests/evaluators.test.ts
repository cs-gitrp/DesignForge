import { afterEach, describe, expect, it, vi } from "vitest";

import { buildUserPrompt, SYSTEM_PROMPT } from "@/domain/evaluation-prompt";
import { DomainError } from "@/domain/errors";
import { RUBRIC_CRITERIA } from "@/domain/rubric";
import { GeminiEvaluator } from "@/infrastructure/evaluators/gemini-evaluator.server";
import { LlmEvaluator } from "@/infrastructure/evaluators/llm-evaluator.server";
import { PROBLEM, validContent } from "./in-memory";

const request = {
  problem: PROBLEM,
  submissionType: "STRUCTURED_TEXT" as const,
  content: validContent,
  attemptNumber: 2,
};

const modelJson = JSON.stringify({
  criteria: RUBRIC_CRITERIA.map((name) => ({
    name,
    score: 4,
    evidence: "SpotAllocator picks a spot",
    concern: "c",
    suggestion: "s",
    confidence: 0.7,
  })),
  strengths: ["clear ownership"],
  improvementAreas: ["name the pricing rule"],
});

const geminiReply = (text: string) => ({
  ok: true,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  text: async () => text,
});

const stubFetch = (value: unknown) => {
  const spy = vi.fn().mockResolvedValue(value);
  vi.stubGlobal("fetch", spy);
  return spy;
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["GEMINI_API_KEY"];
  delete process.env["LOVABLE_API_KEY"];
});

describe("shared evaluation prompt", () => {
  it("states the constraints both model evaluators depend on", () => {
    expect(SYSTEM_PROMPT).toMatch(/MANY valid LLD solutions/);
    expect(SYSTEM_PROMPT).toMatch(/quote or closely paraphrase the learner's own words/);
    expect(SYSTEM_PROMPT).toMatch(/specific to this submission and immediately actionable/);
  });

  it("includes the problem, requirements, submission and criteria", () => {
    const prompt = buildUserPrompt(request);
    expect(prompt).toContain(PROBLEM.title);
    expect(prompt).toContain("Issue tickets");
    expect(prompt).toContain("attempt #2");
    expect(prompt).toContain("SpotAllocator");
    for (const criterion of RUBRIC_CRITERIA) expect(prompt).toContain(criterion);
  });
});

describe("GeminiEvaluator", () => {
  it("reports its own evaluator type, distinct from the gateway path", () => {
    expect(new GeminiEvaluator().type).toBe("LLM_GEMINI_DIRECT");
  });

  it("fails cleanly when no key is configured", async () => {
    await expect(new GeminiEvaluator().evaluate(request)).rejects.toBeInstanceOf(DomainError);
  });

  it("requests JSON output with the shared prompt and validates the result", async () => {
    process.env["GEMINI_API_KEY"] = "test-key";
    const fetchSpy = stubFetch(geminiReply(modelJson));

    const result = await new GeminiEvaluator().evaluate(request);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toContain("gemini-3.6-flash");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.systemInstruction.parts[0].text).toBe(SYSTEM_PROMPT);
    expect(JSON.stringify(body.generationConfig.responseSchema)).not.toContain(
      "additionalProperties",
    );
    expect(result.criteria).toHaveLength(8);
    expect(result.overallScore).toBe(4);
  });

  it("maps rate limiting, a rejected key and a safety block to clear failures", async () => {
    process.env["GEMINI_API_KEY"] = "test-key";

    stubFetch({ ok: false, status: 429, text: async () => "{}" });
    await expect(new GeminiEvaluator().evaluate(request)).rejects.toThrowError(/rate limited/i);

    stubFetch({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: "API key not valid" } }),
    });
    await expect(new GeminiEvaluator().evaluate(request)).rejects.toThrowError(/GEMINI_API_KEY/);

    stubFetch({
      ok: true,
      json: async () => ({ promptFeedback: { blockReason: "SAFETY" } }),
      text: async () => "",
    });
    await expect(new GeminiEvaluator().evaluate(request)).rejects.toThrowError(/safety filters/i);
  });

  it("rejects malformed model output instead of storing it", async () => {
    process.env["GEMINI_API_KEY"] = "test-key";
    stubFetch(geminiReply("not json"));
    await expect(new GeminiEvaluator().evaluate(request)).rejects.toThrowError(/malformed JSON/);

    stubFetch(geminiReply(JSON.stringify({ criteria: [] })));
    await expect(new GeminiEvaluator().evaluate(request)).rejects.toThrowError(/missing criteria/);
  });
});

const gatewayReply = (text: string) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: text } }] }),
  text: async () => text,
});

describe("LlmEvaluator", () => {
  it("reports its own evaluator type, distinct from the Gemini path", () => {
    expect(new LlmEvaluator().type).toBe("LLM");
  });

  it("fails cleanly when no key is configured", async () => {
    await expect(new LlmEvaluator().evaluate(request)).rejects.toBeInstanceOf(DomainError);
  });

  it("sends the shared prompt and validates the result", async () => {
    process.env["LOVABLE_API_KEY"] = "test-key";
    const fetchSpy = stubFetch(gatewayReply(modelJson));

    const result = await new LlmEvaluator().evaluate(request);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toContain("lovable.dev");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toBe(SYSTEM_PROMPT);
    expect(result.criteria).toHaveLength(8);
    expect(result.overallScore).toBe(4);
  });

  it("maps 429, 402 and 500 to clear failure messages", async () => {
    process.env["LOVABLE_API_KEY"] = "test-key";

    stubFetch({ ok: false, status: 429, text: async () => "{}" });
    await expect(new LlmEvaluator().evaluate(request)).rejects.toThrowError(/rate limited/i);

    stubFetch({ ok: false, status: 402, text: async () => "{}" });
    await expect(new LlmEvaluator().evaluate(request)).rejects.toThrowError(/credits/i);

    stubFetch({ ok: false, status: 500, text: async () => "{}" });
    await expect(new LlmEvaluator().evaluate(request)).rejects.toThrowError(/unavailable/i);
  });

  it("rejects malformed gateway output instead of storing it", async () => {
    process.env["LOVABLE_API_KEY"] = "test-key";
    stubFetch(gatewayReply("not json"));
    await expect(new LlmEvaluator().evaluate(request)).rejects.toThrowError(/malformed JSON/);
  });
});

describe("activeEvaluatorTier", () => {
  it("names the Gemini tier when its key is set, even alongside the gateway key", async () => {
    process.env["GEMINI_API_KEY"] = "test-key";
    process.env["LOVABLE_API_KEY"] = "test-key";
    const { activeEvaluatorTier } =
      await import("@/infrastructure/practice-service-factory.server");
    expect(activeEvaluatorTier().type).toBe("LLM_GEMINI_DIRECT");
  });

  it("names the gateway tier when only LOVABLE_API_KEY is set", async () => {
    process.env["LOVABLE_API_KEY"] = "test-key";
    const { activeEvaluatorTier } =
      await import("@/infrastructure/practice-service-factory.server");
    expect(activeEvaluatorTier().type).toBe("LLM");
  });

  it("names the structural fallback when no model key is set", async () => {
    const { activeEvaluatorTier } =
      await import("@/infrastructure/practice-service-factory.server");
    expect(activeEvaluatorTier().type).toBe("RULE_BASED");
  });
});
