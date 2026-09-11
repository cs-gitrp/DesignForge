# Design

## Layers

```text
routes/                UI. Renders state, dispatches intent. No rules.
lib/*.functions.ts     Server-function boundary. Serialises domain errors
                       into result objects.
application/           PracticeService. Owns the journey and its
                       ordering guarantees.
domain/                Pure rules and ports. No framework, IO, Supabase
                       or fetch.
infrastructure/        Supabase repositories, evaluator implementations
                       and factory.
```

Dependencies point inward only.

`domain/` imports nothing from the other layers. `application/` imports the domain and its ports. `infrastructure/` implements those ports.

This keeps the learner journey testable without a database or model provider and prevents framework concerns from becoming business rules.

---

## Domain model

| Entity | Role |
| --- | --- |
| `Problem` | Seeded, immutable problem definition containing slug, difficulty, requirements and prompts. |
| `Attempt` | One pass at a problem. Numbered per problem and governed by the attempt state machine. |
| `Submission` | The five-section content belonging to an attempt. Currently `STRUCTURED_TEXT`. |
| `Evaluation` | One evaluator run containing evaluator type, status, overall score, strengths and improvement areas. |
| `Feedback` | One rubric criterion within an evaluation: score, evidence, concern, suggestion and confidence. |

`Evaluation` is separate from `Attempt` because an evaluation can fail and be retried without changing the learner's submitted design. It also keeps evaluator identity attached to the evaluation run rather than to the attempt itself.

`Feedback` is stored as one row per criterion rather than as an opaque JSON blob so criterion-level results can be queried and compared across attempts later.

`format: "STRUCTURED_TEXT"` is stored on every submission deliberately. A future diagram or code submission type can introduce a new format value without changing the meaning of existing submissions.

---

## State machine

```text
DRAFT ──submit──> SUBMITTED ──> EVALUATING ──> COMPLETED (terminal)
                                      │
                                      └──> FAILED ──retry──> EVALUATING
```

The transition table in `domain/attempt-state-machine.ts` is the authority on legal transitions.

### Invariants

- Only `DRAFT` accepts content edits, so completed feedback always refers to immutable submitted text.
- `COMPLETED` is terminal. Improvement creates a new attempt, which makes history meaningful.
- `EVALUATING` is persisted before the evaluator is invoked, so a failure is visible rather than disappearing silently.
- Illegal transitions raise `INVALID_TRANSITION` rather than being ignored.

---

## Ordering guarantee in `PracticeService.submit`

The submission flow is deliberately ordered:

1. Validate the submission.
2. Persist the submission content.
3. Transition `DRAFT → SUBMITTED → EVALUATING`.
4. Invoke the evaluator.
5. On success, persist the evaluation and its eight feedback rows, then mark the attempt `COMPLETED`.
6. On failure, mark the evaluation and attempt `FAILED`.

The submission is never rolled back on evaluator failure.

The learner's writing is the thing that must not be lost, so it is persisted before anything that can fail. Retry evaluates the stored submission again rather than asking the learner to retype it.

---

## Evaluator abstraction

```ts
interface Evaluator {
  readonly type: EvaluatorType;
  evaluate(request: EvaluationRequest): Promise<EvaluationResult>;
}
```

There are three implementations:

- `RuleBasedEvaluator` (`RULE_BASED`) — deterministic and offline. It checks section coverage and depth, quotes the learner's own sentences as evidence, caps scores below the top of the scale, reports low confidence and explicitly states that it does not assess design quality.
- `LlmEvaluator` (`LLM`) — server-only evaluator using the hosted AI gateway.
- `GeminiEvaluator` (`LLM_GEMINI_DIRECT`) — server-only evaluator calling Gemini directly with a structured JSON response.

The two model evaluators share one prompt module (`src/domain/evaluation-prompt.ts`) and one output contract, so their evaluation constraints cannot drift between implementations.

`domain/rubric.ts` validates every evaluator's output before anything is persisted:

- all eight criteria are present and correctly named
- scores are integers from 1–5
- evidence is non-empty
- confidence is normalised
- overall score is derived from the criterion scores rather than trusted from the model

An evaluator cannot directly corrupt stored feedback. Invalid output becomes a controlled failed evaluation with a retry path.

---

## Evaluator selection

Selection happens in exactly one place: `practice-service-factory.server.ts`.

The order is:

```text
GEMINI_API_KEY
      ↓
GeminiEvaluator

otherwise

LOVABLE_API_KEY
      ↓
LlmEvaluator

otherwise

RuleBasedEvaluator
```

An explicitly configured Gemini key takes priority because the hosted environment may also expose `LOVABLE_API_KEY`. This keeps the direct evaluator reachable when explicitly requested.

The stored `evaluatorType` records which evaluator actually ran. The UI displays that tier so feedback is never presented as AI-generated when it came from the deterministic fallback.

The application layer never needs to know which concrete evaluator it received.

---

## Prompt design

The shared evaluation prompt makes several constraints explicit:

- multiple valid LLD designs exist
- valid alternatives must not be penalised
- the evaluator should judge only what the learner actually wrote
- each criterion requires evidence from the submission
- unsupported criticism is not allowed
- concerns should describe actual design weaknesses rather than style preferences
- each criterion receives one actionable suggestion
- output follows a fixed JSON contract

The prompt is shared by both model evaluators and remains server-side.

---

## Persistence

Postgres is accessed through repository interfaces defined in `domain/ports.ts`.

Database constraints enforce the important structural invariants:

- valid status values
- valid score ranges
- one submission per attempt
- foreign-key relationships

Indexes cover the main read paths, including attempts by problem and feedback by evaluation.

Row-level security is enabled on the relevant tables, and learner ownership is scoped to the anonymous browser learner identifier.

History is append-oriented: completed attempts are retained rather than overwritten because comparison across attempts is part of the product.

---

## Testing strategy

Tests target the layers where the rules actually live, using in-memory repository fakes, stub evaluators and a fixed clock.

### State machine

Tests cover every legal transition and illegal transition.

### Rubric

Tests cover validation, missing criteria, score handling and overall score computation.

### PracticeService

Tests cover:

- draft saves
- empty-submission rejection
- duplicate submission
- successful evaluation
- evaluator failure
- preservation of the submission after failure
- retry
- attempt numbering
- learner ownership
- history

The core application tests do not need a database or network call because the rules do not depend on either.

---

## Known trade-offs

### Anonymous attempts

History is browser-scoped rather than account-scoped. This avoids authentication work in the MVP while leaving a clear path to populate the same learner ownership field from a real session later.

### Synchronous evaluation

The learner waits for the model call. A queue and worker would survive restarts better and allow evaluation to continue after the page closes, but would introduce infrastructure that is unnecessary for this MVP.

### Text-only evidence

Quoting evidence works naturally for structured prose. A future diagram or code submission type would need a different evidence representation.

### Small problem library

Three problems are enough to demonstrate the complete learner journey. A larger content-management system would move effort away from the core feedback loop.

---

## Transient `SUBMITTED` state

`SUBMITTED` is intentionally persisted as part of the transition sequence:

```text
DRAFT → SUBMITTED → EVALUATING
```

The transition currently happens synchronously inside `submitAttempt`, so the learner normally does not observe `SUBMITTED` as a long-lived state.

It exists to make the ordering explicit: the submission is accepted before evaluation starts.

---

## Evaluator transparency

Evaluator tiers are selected server-side and the active tier is disclosed on the attempt screen before submission. The selected evaluator type is also stored with the evaluation.

A learner-facing evaluator toggle was considered and rejected. Choosing an evaluator is an infrastructure concern rather than part of the LLD exercise, and a toggle could expose an unconfigured or failing provider. Honest evaluator labelling provides transparency without adding unnecessary product state.