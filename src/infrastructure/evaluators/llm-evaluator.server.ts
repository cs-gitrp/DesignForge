import { DomainError } from "@/domain/errors";
import { buildUserPrompt, EVALUATION_JSON_SCHEMA, SYSTEM_PROMPT } from "@/domain/evaluation-prompt";
import { EVALUATOR_TYPES, type EvaluationRequest, type Evaluator } from "@/domain/evaluator";
import { parseEvaluationResult } from "@/domain/rubric";
import type { EvaluationResult } from "@/domain/types";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.8-flash";
const RESPONSE_SCHEMA = EVALUATION_JSON_SCHEMA;

/** Server-only: reads LOVABLE_API_KEY and never runs in the browser. */
export class LlmEvaluator implements Evaluator {
  readonly type = EVALUATOR_TYPES.lovableGateway;

  async evaluate(request: EvaluationRequest): Promise<EvaluationResult> {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new DomainError("EVALUATION_FAILED", "AI review is not configured on the server.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch(GATEWAY_URL, {
        signal: controller.signal,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(request) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "lld_evaluation", strict: true, schema: RESPONSE_SCHEMA },
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
      throw new DomainError("EVALUATION_FAILED", describeGatewayError(response.status, body));
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content;
    if (!text) {
      throw new DomainError("EVALUATION_FAILED", "AI review returned an empty response.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new DomainError("EVALUATION_FAILED", "AI review returned malformed JSON.");
    }
    // Validated against the rubric before anything is stored.
    return parseEvaluationResult(parsed);
  }
}

function describeGatewayError(status: number, body: string): string {
  const message = extractMessage(body);
  if (status === 429) return "AI review is rate limited right now. Retry evaluation in a moment.";
  if (status === 402) return message || "AI review credits are exhausted for this workspace.";
  if (status === 403) return message || "AI review is blocked by workspace policy.";
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
