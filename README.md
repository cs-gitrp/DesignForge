# DesignForge

A focused practice tool for low-level design interviews. The product is built around one learner journey:

**Choose a problem → design it in structured sections → submit → get evidence-based feedback → review → try again.**

Three seeded problems are included: **Parking Lot, Vending Machine, and Elevator System**.

## Running locally

```bash
npm install
npm run dev      # http://localhost:8080
npm run test     # unit tests
npm run build    # production build
npm run lint
```

Create a local `.env` from `.env.example`.

AI evaluation uses either `GEMINI_API_KEY` for direct Gemini evaluation or `LOVABLE_API_KEY` for the hosted AI gateway. If neither is configured, the app still works end to end using the deterministic structural evaluator, which is clearly labelled in the UI.

The database schema and the three seeded problems are created by the migrations in `supabase/migrations/`.

No sign-in is required. Attempts are anonymous and scoped to the browser through an HTTP-only learner cookie, so a browser only sees its own attempts.

---

## The journey

| Step | What happens |
| --- | --- |
| `/` | Problem library with the three problems. |
| `/problems/$problemId` | Requirements and prompts to think about, then Start Practice. |
| `/attempt/$attemptId` | Five structured sections. Save Draft any time; Submit for Review locks the attempt. |
| evaluation | The attempt moves `SUBMITTED → EVALUATING`, an evaluator scores it, and the result is persisted. |
| `/attempt/$attemptId/feedback` | Overall score, strengths, improvement areas, and one card per rubric criterion with score, evidence quote, concern, suggestion and confidence. |
| Try Again | Starts a fresh attempt on the same problem; the previous attempt and feedback remain in history. |
| `/history` | Attempts grouped by problem, with scores, progress and criterion-level movement between completed attempts. |

---

## Submission format

Every submission currently uses `STRUCTURED_TEXT` with five sections:

1. **Assumptions**
2. **Classes & Responsibilities**
3. **Relationships**
4. **Design Decisions & Trade-offs**
5. **Edge Cases & Testability**

A completely empty submission is rejected before evaluation. Thin sections are flagged structurally in the editor without making claims about design quality.

The structure is intentional: it gives the learner a consistent way to reason through an LLD problem while giving the evaluator stable evidence to assess.

---

## Rubric

The eight criteria are shown before the learner starts designing:

1. Requirement Understanding
2. Class Responsibilities
3. Coupling & Cohesion
4. Encapsulation & Interfaces
5. Abstraction / Patterns
6. Extensibility
7. Edge Cases & Testability
8. Explanation / Trade-offs

Each criterion is scored from **1–5**.

The overall score is derived by the application as the mean of the eight criterion scores. It is never accepted from the model.

Every criterion must also contain:

- evidence quoted from the learner's submission
- one specific concern
- one actionable suggestion
- confidence

Invalid or incomplete evaluator output is rejected before persistence.

---


### Architecture diagram

```mermaid
flowchart TD
    UI["React Routes / UI"]
    SF["Server Functions"]
    APP["PracticeService"]
    DOMAIN["Domain Layer"]
    PORTS["Repository + Evaluator Ports"]
    INFRA["Infrastructure"]
    DB[("Supabase / Postgres")]
    EVAL["Evaluator Factory"]
    LLM["LLM Evaluator"]
    GEMINI["Gemini Direct Evaluator"]
    RULE["Rule-Based Evaluator"]

    UI --> SF
    SF --> APP
    APP --> DOMAIN
    APP --> PORTS

    PORTS --> INFRA
    INFRA --> DB
    INFRA --> EVAL

    EVAL --> LLM
    EVAL --> GEMINI
    EVAL --> RULE

    LLM --> AI["AI Provider"]
    GEMINI --> AI

---


## Architecture

```text
src/domain/           Pure rules: state machine, submission format,
                      rubric and evaluator ports

src/application/      PracticeService — owns the learner journey
                      and its ordering guarantees

src/infrastructure/   Supabase repositories, evaluator implementations
                      and evaluator factory

src/lib/              Server functions and query options

src/routes/           UI and route-level rendering

tests/                Unit tests using in-memory repositories and
                      stub evaluators
```

The application layer depends only on domain ports, so the core learner journey can be tested without a database or external model provider.

---

## Evaluators

`Evaluator` is an interface with three implementations:

### LlmEvaluator

Server-only evaluator using the hosted AI gateway when `LOVABLE_API_KEY` is configured.

### GeminiEvaluator

Server-only evaluator that calls Gemini directly when `GEMINI_API_KEY` is configured. This keeps the application usable outside the hosted environment.

### RuleBasedEvaluator

A deterministic fallback that performs structural validation only:

- section coverage
- section depth
- evidence taken from the learner's own text

It deliberately does not claim to judge design quality. Its scores are capped below the top of the scale and its confidence is low. The UI labels this output as **structural validation**, not AI design review.

The evaluator actually used is stored with every evaluation and shown in the UI.

---

## Evaluation and trust boundary

Model output is treated as untrusted input.

All evaluator results pass through the same domain validation path before being persisted. The application verifies:

- all eight criteria are present
- criterion names are valid
- scores are integers from 1–5
- evidence is present
- confidence is valid
- the overall score is derived from criterion scores

Malformed or unusable model output becomes a controlled evaluation failure. The learner's submission is preserved and the UI provides a retry path.

The model evaluator runs server-side; provider keys and evaluation instructions are never sent to the browser.

---

## Attempt state machine

```text
DRAFT ──submit──> SUBMITTED ──> EVALUATING ──> COMPLETED
                                      │
                                      └──> FAILED ──retry──> EVALUATING
```

Only `DRAFT` attempts are editable.

`COMPLETED` is terminal. Improving a design means creating a new attempt, which keeps previous submissions and feedback intact.

If evaluation fails, the stored submission is preserved and can be evaluated again without requiring the learner to retype it.

---

## Design decisions

A few decisions intentionally keep the MVP focused:

- **No authentication:** the assignment is about the practice loop, not account management.
- **Three problems:** enough variety to demonstrate the journey without turning the MVP into a content-management system.
- **Structured text instead of a UML editor:** keeps the submission format simple while still capturing the reasoning an LLD interview evaluates.
- **Synchronous evaluation:** avoids introducing a queue and worker infrastructure for a small MVP.
- **No reference-solution scoring:** LLD has multiple valid designs, so feedback evaluates the learner's stated reasoning rather than similarity to one canonical answer.
- **Deterministic fallback:** the product remains demonstrable and testable even without an AI provider.

---

## Testing

The test suite focuses on the rules that matter to the learner journey:

- state-machine transitions
- submission validation
- rubric validation
- overall score calculation
- draft saves
- duplicate submissions
- evaluation failures
- retry behaviour
- attempt numbering
- anonymous learner ownership
- evaluator output parsing

The core application tests use in-memory repositories and stub evaluators, so they do not require a live database or model provider.

---

## Out of scope

The MVP intentionally does not include:

- user accounts
- course structure
- problem authoring
- leaderboards
- payments
- code execution
- collaborative editing
- a full UML editor

These can be added later without changing the core practice journey.

---

## Further reading

- [DESIGN.md](./DESIGN.md) — architecture and technical decisions
- [RESEARCH.md](./RESEARCH.md) — product research and reasoning behind the MVP
- [AI_USAGE.md](./AI_USAGE.md) — AI usage, evaluation trust boundary and development process