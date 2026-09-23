# DesignForge

A browser-based tool for practising Low-Level Design. The core loop:

**Choose a problem → design it in structured sections → submit → get evidence-based feedback → review your history → try again.**

Three problems are included: Parking Lot, Vending Machine, and Elevator System.

---

## Stack

TypeScript · TanStack Start (React, SSR) · Supabase / Postgres · Gemini API · Vitest

---

## What makes it interesting (engineering-wise)

**LLM output is treated as untrusted input.** Every model response is validated by `domain/rubric.ts` before a single row is written — all eight criteria must be present, scores must be integers 1–5, and every criterion must carry a verbatim quote from the learner's own submission as evidence. The overall score is always recomputed from criterion scores by the application; it is never accepted from the model. Malformed or incomplete output becomes a controlled `FAILED` evaluation with a retry path — no partial feedback is persisted and no failure is silently swallowed.

**Ports-and-adapters architecture.** `src/domain/` imports nothing outward — no framework, no Supabase, no fetch. `PracticeService` depends only on port interfaces; the Supabase repositories and the Gemini evaluator are infrastructure that plug in from outside. The entire learner journey can be tested with in-memory fakes and a stub evaluator, with no database or model provider involved.

**Attempt state machine as the single authority.** `domain/attempt-state-machine.ts` owns all legal transitions; `PracticeService` asks it rather than branching on status strings inline. Every illegal transition raises `INVALID_TRANSITION`. `COMPLETED` is terminal — improvement means a new attempt, which keeps previous submissions and feedback intact.

**Submission ordering guarantee.** In `PracticeService.submit`: content is persisted first, then the attempt transitions to `EVALUATING`, then the evaluator runs. On evaluator failure the submission is preserved and marked `FAILED`; retry runs against the stored content without asking the learner to retype.

**Evidence-based rubric feedback.** The prompt requires each of the eight criteria to quote the learner's own text as evidence, state one specific concern, and give one actionable suggestion. Generic advice ("consider SOLID") with no evidence anchor is blocked by the prompt constraints and rejected again by the domain validator if anything slips through.

---

## Running locally

```bash
npm install
npm run dev      # http://localhost:8080
npm run test
npm run build
```

Copy `.env.example` to `.env` and fill in your keys.

```env
# Gemini direct evaluation (recommended)
GEMINI_API_KEY=...

# Supabase
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Apply the migrations in `supabase/migrations/` to set up the schema and seed the three problems.

With no `GEMINI_API_KEY` set, the app runs end-to-end using the deterministic structural evaluator (section coverage, section depth, evidence quoted from the submission). That path is clearly labelled in the UI and is enough to test the full journey without any API key.

---

## The journey

| Route | What happens |
|---|---|
| `/` | Problem library. |
| `/problems/$problemId` | Requirements, rubric criteria, and a Start Practice button. |
| `/attempt/$attemptId` | Five structured sections. Save Draft any time; Submit for Review locks the attempt. |
| Evaluation | `SUBMITTED → EVALUATING` → evaluator runs → `COMPLETED` or `FAILED`. |
| `/attempt/$attemptId/feedback` | Overall score, strengths, improvement areas, and one card per criterion (score · evidence quote · concern · suggestion · confidence). |
| Try Again | New attempt on the same problem; previous attempt and feedback stay in history. |
| `/history` | All attempts grouped by problem. Shows per-attempt score, delta since first scored attempt, and which criteria moved up or down versus the previous completed attempt. |

---

## Submission format

Five sections per attempt (`STRUCTURED_TEXT`):

1. Assumptions
2. Classes & Responsibilities
3. Relationships
4. Design Decisions & Trade-offs
5. Edge Cases & Testability

This structure gives the learner a consistent thinking scaffold and gives the evaluator stable, comparable input across attempts.

---

## Architecture

```text
routes/                UI — renders state, dispatches intent
lib/*.functions.ts     Server functions — RPC boundary, domain errors → result objects
application/           PracticeService — learner journey and ordering guarantees
domain/                Pure rules and ports — no framework, no IO
infrastructure/        Supabase repositories + evaluator implementations + factory
tests/                 Unit tests — in-memory fakes, stub evaluators, fixed clock
```

```text
┌──────────────────────────────┐
│          Routes / UI         │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       Server Functions       │  ← RPC boundary
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       PracticeService        │
│   journey + ordering rules   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│           Domain             │
│ state machine · rubric ·     │
│ submission · evaluator port  │
└──────────────┬───────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
┌───────────────┐  ┌────────────────┐
│  Repositories │  │   Evaluators   │
│    Supabase   │  │ Gemini / Rule- │
│    Postgres   │  │ Based          │
└───────────────┘  └────────────────┘
```

---

## Evaluators

`Evaluator` is a domain interface. Two implementations, both producing the same validated output shape:

**`GeminiEvaluator`** (`LLM_GEMINI_DIRECT`) — calls Gemini directly with `responseMimeType: "application/json"` and a structured rubric prompt. Active when `GEMINI_API_KEY` is set.

**`RuleBasedEvaluator`** (`RULE_BASED`) — deterministic, no network, no key. Validates section coverage and depth and quotes the learner's own text as evidence. Scores are capped below the top of the scale; confidence is low. The UI labels this output "structural validation", not "AI design review".

Selection happens in one place — `practice-service-factory.server.ts`. The evaluator type is stored on every evaluation and shown in the UI; feedback is never mislabelled.

Adding a third evaluator (a different model, a human-review path) means implementing the interface and registering it in the factory. Nothing else changes.

---

## Rubric

Eight criteria, each scored 1–5, shown to the learner before they start:

Requirement Understanding · Class Responsibilities · Coupling & Cohesion · Encapsulation & Interfaces · Abstraction / Patterns · Extensibility · Edge Cases & Testability · Explanation / Trade-offs

The overall score is the mean of the eight criterion scores, computed by the application. The model's own overall figure is discarded.

---

## Tests

```bash
npm run test
```

The suite covers the layers where behaviour lives:

- state machine — every legal transition, every illegal one
- rubric — validation, clamping, missing criteria, score derivation
- PracticeService — full journey: draft saves, empty-submission rejection, duplicate submission, successful evaluation, evaluator failure preserving the submission, retry, attempt numbering
- evaluator output parsing — malformed JSON, missing criteria, out-of-range scores

No test needs a database or a network call. The domain imports nothing outward, so in-memory fakes are sufficient.

---

## Anonymity model

No sign-in. An HTTP-only learner cookie is set on first visit and scoped to that browser. Row-level security in Postgres enforces that every read and write is tied to the owning learner id — no attempt is visible to any other browser. Upgrading to real accounts means populating that same owner column from a session rather than a cookie; no schema change required.
