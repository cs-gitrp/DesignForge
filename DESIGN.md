# DESIGN.md

## Layers

```text
routes/                UI. Renders state, dispatches intent. No rules.
lib/*.functions.ts     RPC boundary. Serialises domain errors into result objects.
application/           PracticeService. Owns the journey and its ordering guarantees.
domain/                Pure rules and ports. No framework, no IO, no Supabase, no fetch.
infrastructure/        Supabase repositories, evaluator implementations, factory.
```

Dependencies point inward only. `domain/` imports nothing from the other layers; `application/`
imports `domain/` and its ports; `infrastructure/` implements those ports. This is what makes the
journey testable without a database or a model provider.

## Domain model

| Entity | Role |
| --- | --- |
| `Problem` | Seeded, immutable. Slug, difficulty, requirements, prompts. |
| `Attempt` | One pass at a problem. Numbered per problem, carries the state machine. |
| `Submission` | The five-section content belonging to an attempt. `STRUCTURED_TEXT` format. |
| `Evaluation` | One evaluator run: evaluator type, status, overall score, strengths, improvement areas. |
| `Feedback` | One rubric criterion within an evaluation: score, evidence, concern, suggestion, confidence. |

`Evaluation` is separate from `Attempt` because an attempt can be evaluated more than once (a failed
run is retried) and because the evaluator identity belongs to the run, not the attempt. `Feedback`
is a separate row per criterion rather than a JSON blob so criteria can be queried and compared
across attempts later.

`format: 'STRUCTURED_TEXT'` is stored on every submission. It is redundant today and deliberate: a
future diagram or code submission type is a new format value, not a schema migration of existing rows.

## State machine

```text
DRAFT ──submit──> SUBMITTED ──> EVALUATING ──> COMPLETED (terminal)
                                     │
                                     └──> FAILED ──retry──> EVALUATING
```

The transition table lives in `domain/attempt-state-machine.ts` and is the only authority on legality;
services ask it rather than checking statuses inline. Invariants:

- Only `DRAFT` accepts content edits, so feedback always refers to text that can no longer change.
- `COMPLETED` is terminal. Improvement is a new attempt, which is what makes history meaningful.
- `EVALUATING` is persisted before the evaluator is invoked, so a crash mid-evaluation leaves a row
  that is visibly stuck rather than a submission that silently never produced feedback.
- Any illegal transition raises `INVALID_TRANSITION` rather than being ignored.

## Ordering guarantee in `PracticeService.submit`

1. Validate the submission (at least one filled section) — `EMPTY_SUBMISSION` otherwise.
2. Persist the submission content.
3. Transition `DRAFT → SUBMITTED → EVALUATING`.
4. Invoke the evaluator.
5. On success, persist the evaluation and its eight feedback rows, then `COMPLETED`.
6. On failure, mark evaluation and attempt `FAILED`. **The submission is never rolled back.**

The learner's writing is the thing that must not be lost, so it is written before anything that can
fail. Retry re-runs step 4 against the stored submission and never asks the learner to retype.

## Evaluator abstraction

```ts
interface Evaluator {
  readonly type: EvaluatorType;
  evaluate(request: EvaluationRequest): Promise<EvaluatorOutput>;
}
```

Three implementations, all returning the same `EvaluatorOutput`:

- `RuleBasedEvaluator` (`RULE_BASED`) — deterministic and offline, and honest about its limits: it
  checks section coverage and depth, quotes the learner's own sentences as evidence, caps scores below
  the top of the scale, reports low confidence and states that it does not assess design quality.
- `LlmEvaluator` (`LLM`) — server-only, via the Lovable AI gateway.
- `GeminiEvaluator` (`LLM_GEMINI_DIRECT`) — server-only, calling Gemini directly with a JSON response
  mime type, so the product still gives real AI review when run outside Lovable's hosting.

The two model evaluators share one prompt module (`src/domain/evaluation-prompt.ts`) and one JSON
contract, so their constraints cannot diverge.

`domain/rubric.ts` validates every evaluator's output before anything is persisted: all eight criteria
present and named, integer scores 1–5, confidence normalised, evidence non-empty, and the overall
score derived in the domain from the criterion scores rather than trusted from the model. An evaluator
cannot corrupt stored feedback — the worst it can do is fail validation, which becomes a `FAILED`
evaluation with a retry path.

Selection happens in exactly one place, `practice-service-factory.server.ts`, in the order
`GEMINI_API_KEY` → `LOVABLE_API_KEY` → rule-based. An explicitly set Gemini key wins because
`LOVABLE_API_KEY` is always present on Lovable Cloud — Gemini-first is the only way to make the
direct tier reachable in that environment. The stored `evaluatorType` records which path ran,
and the UI labels rule-based output as structural validation rather than AI review. The application
layer never learns which evaluator it is holding.

## Prompt design for the LLM evaluators

The prompt states that multiple valid LLD designs exist and that alternatives must not be penalised;
requires an exact quote from the submission for every criterion; forbids criticism that the evidence
does not support; and demands one concrete, actionable suggestion per criterion. Output is a fixed
JSON shape. Everything about it lives server-side.


## Persistence

Postgres, accessed through repository interfaces defined in `domain/ports.ts`. Foreign keys and
check constraints hold the shape (valid status values, score ranges, one submission per attempt);
indexes cover the read paths (attempts by problem, feedback by evaluation). RLS is enabled on every
table. Nothing is deletable — history is append-only, which is the point of the retry loop.

## Testing strategy

Tests target the layers where rules live, using in-memory repository fakes, stub evaluators and a
fixed clock:

- **State machine** — every legal transition, every illegal one.
- **Rubric** — validation, clamping, missing criteria, overall score computation.
- **PracticeService** — the journey: draft saves, empty-submission rejection, duplicate submission,
  successful evaluation, evaluator failure preserving the submission, retry, attempt numbering.

No test needs a database or a network call, because no rule depends on either.

## Known trade-offs

- **Anonymous attempts** — history is browser-scoped, not account-scoped. Cheap to add later.
- **Synchronous evaluation** — the learner waits for the model call. A queue would survive restarts
  and let the page be closed; it also adds infrastructure that a two-day scope does not need.
- **Text-only evidence** — quoting works for prose but not for a diagram, which a future submission
  format would need to solve differently.

`SUBMITTED` is a transient state — `DRAFT → SUBMITTED → EVALUATING` transitions synchronously in
`submitAttempt`, so the learner never observes the `SUBMITTED` status; it exists to guarantee the
submission row is persisted before evaluation begins.

Evaluator tiers are auto-selected server-side; the active tier is disclosed on the attempt screen
before submission and recorded on every stored evaluation. A learner-facing tier toggle was
considered and rejected: choosing an evaluator is an infrastructure concern, not part of the design
exercise, and a toggle toward an unconfigured tier would invite fake or failing feedback. Honest
labeling keeps the same transparency without the extra state.
