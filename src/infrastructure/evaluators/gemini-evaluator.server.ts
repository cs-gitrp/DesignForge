import { DomainError } from "@/domain/errors";
import { buildUserPrompt, EVALUATION_JSON_SCHEMA, SYSTEM_PROMPT } from "@/domain/evaluation-prompt";
import { EVALUATOR_TYPES, type EvaluationRequest, type Evaluator } from "@/domain/evaluator";
import { parseEvaluationResult } from "@/domain/rubric";
import type { EvaluationResult } from "@/domain/types";

const MODEL = "gemini-3.6-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/**
 * Portability tier: calls the Gemini API directly with GEMINI_API_KEY, for
 * running this app outside Lovable's hosted environment. It shares the prompt
 * and the output validation with the gateway evaluator, and reports its own
 * type so a stored evaluation always names the path that actually ran.
 */
export class GeminiEvaluator implements Evaluator {
  readonly type = EVALUATOR_TYPES.geminiDirect;

  async evaluate(request: EvaluationRequest): Promise<EvaluationResult> {
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) {
      throw new DomainError("EVALUATION_FAILED", "AI review is not configured on the server.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: buildUserPrompt(request) }] }],
          generationConfig: {
            // Forces clean JSON, so no markdown fence stripping is needed.
            responseMimeType: "application/json",
            responseSchema: toGeminiSchema(EVALUATION_JSON_SCHEMA),
            temperature: 0.2,
          },
        }),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new DomainError("EVALUATION_FAILED", "AI review timed out. Retry evaluation.");
      }
      throw new DomainError(
        "EVALUATION_FAILED",
        "Could not reach the AI review service. Retry evaluation.",
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new DomainError("EVALUATION_FAILED", describeGeminiError(response.status, body));
    }

    const payload = (await response.json()) as GeminiResponse;
    const blockReason =
      payload.promptFeedback?.blockReason ??
      (payload.candidates?.[0]?.finishReason === "SAFETY" ? "SAFETY" : undefined);
    if (blockReason) {
      throw new DomainError(
        "EVALUATION_FAILED",
        "AI review was blocked by the model's safety filters. Rephrase your design and retry evaluation.",
      );
    }

    const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) {
      throw new DomainError("EVALUATION_FAILED", "AI review returned an empty response.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new DomainError("EVALUATION_FAILED", "AI review returned malformed JSON.");
    }
    // Same single validation path as every other evaluator.
    return parseEvaluationResult(parsed);
  }
}

interface GeminiResponse {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string }[] };
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

/** Gemini's responseSchema dialect rejects additionalProperties. */
function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (schema && typeof schema === "object") {
    return Object.fromEntries(
      Object.entries(schema as Record<string, unknown>)
        .filter(([key]) => key !== "additionalProperties")
        .map(([key, value]) => [key, toGeminiSchema(value)]),
    );
  }
  return schema;
}

function describeGeminiError(status: number, body: string): string {
  const message = extractMessage(body);
  if (status === 429) return "AI review is rate limited right now. Retry evaluation in a moment.";
  if (status === 400 && /api key/i.test(message)) {
    return "The configured AI review key was rejected. Check GEMINI_API_KEY.";
  }
  if (status === 401 || status === 403) {
    return message || "The configured AI review key is invalid or lacks access to Gemini.";
  }
  if (status >= 500) return "The AI review service is temporarily unavailable. Retry evaluation.";
  return message || `AI review failed with status ${status}.`;
}

function extractMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    return parsed.error?.message ?? parsed.message ?? "";
  } catch {
    return "";
  }
}
