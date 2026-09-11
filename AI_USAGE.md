# AI Usage

There are two distinct uses of AI in this project:

1. AI **inside the product**, where it evaluates learner submissions.
2. AI **during development**, where AI-assisted tools were used to accelerate implementation.

The important distinction is that model output was treated as something to review and validate, not as an authority.

---

## 1. AI inside the product

### Where it runs

There are two model-backed evaluator implementations:

- `src/infrastructure/evaluators/llm-evaluator.server.ts` — hosted AI gateway
- `src/infrastructure/evaluators/gemini-evaluator.server.ts` — direct Gemini API

Both are reached through server-side application functions.

Both use the same prompt module:

```text
src/domain/evaluation-prompt.ts
```

The `.server` modules stay outside the browser bundle, keeping provider keys and evaluation instructions server-side.

---

### What the model is asked to do

The evaluator scores one learner submission against eight fixed rubric criteria.

For each criterion it returns:

- score: 1–5
- evidence quoted from the learner's submission
- one specific concern
- one actionable suggestion
- confidence

It also returns overall strengths and improvement areas.

The application derives the overall score itself rather than trusting a model-generated total.

---

## Prompt constraints and why they exist

| Constraint | Reason |
| --- | --- |
| Multiple valid designs exist; do not penalise valid alternatives. | Prevents the evaluator from treating one textbook design as the only correct answer. |
| Every criterion must contain evidence from the submission. | Makes feedback checkable and reduces unsupported criticism. |
| Do not make claims the evidence does not support. | Prevents generic advice from being presented as a finding. |
| Exactly one actionable suggestion per criterion. | Keeps feedback focused enough to act on during the next attempt. |
| Fixed JSON shape. | Makes model output parseable and validates it before persistence. |

---

## Trust boundary

Model output is untrusted input.

`domain/rubric.ts` validates evaluator output in one place for every evaluator path:

- all eight criteria must be present
- criterion names must be valid
- scores must be integers from 1–5
- evidence must be present
- confidence is normalised
- the overall score is derived by the application

Only validated output is persisted.

If the model returns malformed or unusable output, the system treats that as a controlled failure:

- the learner's submission is preserved
- the evaluation is marked `FAILED`
- the attempt is marked `FAILED`
- the UI provides a retry path

There is no silent fallback that presents structural feedback as if it were an AI design review.

---

## The deterministic alternative

`RuleBasedEvaluator` implements the same `Evaluator` interface without a model, network call or API key.

It deliberately has a narrower responsibility:

- checks section coverage
- checks section depth
- quotes evidence from the learner's text
- caps scores below the top of the scale
- reports low confidence
- explicitly states that it does not judge design quality

The UI labels this output **structural validation**, not AI design review.

This serves two purposes:

1. the product remains demonstrable without an external model provider
2. the evaluator abstraction remains testable and meaningful even without AI

---

## Evaluator selection

`practice-service-factory.server.ts` is the only place that chooses the evaluator:

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

An explicitly configured Gemini key takes priority because the hosted environment may also expose `LOVABLE_API_KEY`. This keeps the direct evaluator reachable when explicitly configured.

Each evaluation stores the evaluator type that actually ran:

- `LLM`
- `LLM_GEMINI_DIRECT`
- `RULE_BASED`

The UI uses that stored value to label the feedback honestly.

---

# 2. AI used during development

Development was AI-assisted throughout an agent-style workflow: intent and constraints were specified first, generated implementation was reviewed, and code that did not fit the intended architecture was corrected or rejected.

AI was particularly useful for mechanical and repetitive work.

### Where it was useful

- scaffolding database schema and migrations
- repository and server-function plumbing
- route wiring
- React Query setup
- repetitive domain mappings
- generating initial test cases
- expanding edge-case coverage
- drafting documentation

### Where engineering judgement mattered most

The important architectural decisions were reviewed and enforced explicitly:

- keeping the domain layer independent of framework and infrastructure
- making `PracticeService` own the learner journey
- choosing the five-section submission format
- separating evaluator implementations behind an interface
- treating model output as untrusted
- persisting the learner's submission before invoking an evaluator
- preserving submissions when evaluation fails
- making retries operate on the stored submission
- deriving the overall score in the application rather than accepting it from the model

---

## Corrections made during development

AI-generated implementation was not accepted unchanged.

Examples of corrections included:

- Business rules initially drifted toward route components; they were moved into `PracticeService`.
- A field-name mismatch between deterministic evaluator output and the rubric parser was caught by tests and corrected.
- A proposed evaluator fallback would have silently substituted rule-based scoring after an LLM failure. That was rejected because it would hide the failure and mislabel the evaluator that produced the feedback.
- Test alias resolution required explicit configuration rather than assuming the application's build configuration would automatically apply.

These corrections reinforced the role of tests and architectural boundaries as checks on AI-generated implementation.

---

## Development judgement

AI reduced the amount of mechanical implementation work, but generated code was treated as a starting point rather than as a source of architectural truth.

The useful workflow was:

```text
Define intent and constraints
        ↓
Generate implementation
        ↓
Review against architecture
        ↓
Test behaviour and edge cases
        ↓
Correct or reject output
```

The goal was not to avoid AI-generated code. It was to make sure the resulting system reflected deliberate product and engineering decisions rather than blindly accepting plausible-looking implementation.