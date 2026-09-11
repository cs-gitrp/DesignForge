# LLD Practice Lab

A focused practice tool for low-level design. One learner journey, end to end:

**Choose a problem → design it in structured sections → submit → get evidence-based feedback → review → try again.**

Three seeded problems: Parking Lot, Vending Machine, Elevator System.

## Running locally

```bash
bun install
bun run dev      # http://localhost:8080
bun run test     # unit tests (domain + application layers)
```

AI evaluation requires either `LOVABLE_API_KEY` (present automatically when the project is connected
to Lovable Cloud) or `GEMINI_API_KEY` (standalone runs — see `.env.example`); with neither set the
app still works end to end on the deterministic structural fallback, clearly labelled as such in the
UI.

The database schema and the three problems are created by the migration in `supabase/migrations/`.
No sign-in is required: attempts are anonymous and scoped to the browser by an HTTP-only cookie, so
one browser only ever sees its own attempts.


## The journey

| Step | What happens |
| --- | --- |
| `/` | Problem library with the three problems. |
| `/problems/$problemId` | Requirements and prompts to think about, then Start Practice. |
| `/attempt/$attemptId` | Five structured sections. Save Draft any time; Submit for Review locks the attempt. |
| evaluation | The attempt moves `SUBMITTED → EVALUATING`, an evaluator scores it, and the result is persisted. |
| `/attempt/$attemptId/feedback` | Overall score, strengths, improvement areas, and one card per rubric criterion with score, evidence quote, concern, suggestion and confidence. |
| Try Again | Starts a fresh attempt on the same problem; the old attempt and its feedback stay in history. |
| `/history` | All attempts grouped by problem, with per-attempt scores, the change since the first scored attempt, and which criteria moved up or down versus the previous completed attempt. |

## Submission format

Every submission is `STRUCTURED_TEXT` with five sections:

1. Assumptions
2. Classes & Responsibilities
3. Relationships
4. Design Decisions & Trade-offs
5. Edge Cases & Testability

A submission with no filled section is rejected before any evaluator runs. Thin sections are flagged
structurally in the editor without any claim about design quality.

## Rubric

The eight criteria are shown on the problem page *before* you design, each scored 1–5:

Requirement Understanding · Class Responsibilities · Coupling & Cohesion · Encapsulation &
Interfaces · Abstraction / Patterns · Extensibility · Edge Cases & Testability ·
Explanation / Trade-offs

The overall score is always derived by the application as the mean of the eight criterion scores —
never taken from the model. Every criterion must carry an evidence quote from the learner's own
text, a specific concern, and one actionable suggestion; output that doesn't is rejected.


## Architecture

```text
src/domain/           pure rules: state machine, submission format, rubric, evaluator port
src/application/      practice-service.ts — the whole learner journey, framework-free
src/infrastructure/   Supabase repositories, RuleBasedEvaluator, LlmEvaluator, factory
src/lib/              server functions (RPC boundary) and query options
src/routes/           UI
tests/                unit tests against in-memory fakes
```

The application layer depends only on ports (`src/domain/ports.ts`), so the tests run the real
journey with in-memory repositories and a fixed clock — no database, no network.

## Evaluators

`Evaluator` is an interface (`src/domain/evaluator.ts`) with three implementations:

- **`LlmEvaluator`** (`type: "LLM"`) — server-only. Calls the Lovable AI gateway with the shared
  prompt and a strict JSON contract. The hosted default.
- **`GeminiEvaluator`** (`type: "LLM_GEMINI_DIRECT"`) — server-only. Calls the Gemini API directly
  (`gemini-3.6-flash`, `responseMimeType: "application/json"`) with `GEMINI_API_KEY`, so the app
  gives real AI evaluation outside Lovable's hosted environment.
- **`RuleBasedEvaluator`** (`type: "RULE_BASED"`) — deterministic structural validation only: section
  coverage and depth, evidence quoted from the learner's text, scores capped below the top of the
  scale and low confidence. It never claims to judge design quality, and the UI labels it as
  structural validation rather than AI review. No network, no key, fully testable.

Both model evaluators import the same `SYSTEM_PROMPT`, `buildUserPrompt` and JSON contract from
`src/domain/evaluation-prompt.ts` — the prompt constraints (no reference-solution comparison,
verbatim evidence, one actionable suggestion per criterion) cannot drift between them — and both
validate output through the single `parseEvaluationResult` path in `src/domain/rubric.ts`.

`practice-service-factory.server.ts` is the only place that chooses one, in this order:

1. `GEMINI_API_KEY` set → `GeminiEvaluator` (an explicitly set key wins: `LOVABLE_API_KEY` is
   always present on Lovable Cloud, so Lovable-first would make the Gemini tier unreachable)
2. else `LOVABLE_API_KEY` set → `LlmEvaluator`
3. else → `RuleBasedEvaluator`

The stored `evaluatorType` on each evaluation names the path that actually ran — `LLM`,
`LLM_GEMINI_DIRECT` or `RULE_BASED` — and the feedback page and history show that tier label on
every attempt, so feedback is never mislabelled. Swapping in a fourth implementation touches that
one file.

Malformed or unusable model output is a controlled failure: the submission is preserved, the
attempt and evaluation become `FAILED`, and the UI offers Retry Evaluation.


## Attempt state machine

```text
DRAFT ──submit──> SUBMITTED ──> EVALUATING ──> COMPLETED
                                     │
                                     └──> FAILED ──retry──> EVALUATING
```

Only `DRAFT` is editable. `COMPLETED` is terminal — improving means a new attempt.
Re-submitting an already submitted attempt is rejected as a duplicate.

## Security

The model key lives only in server-side code. `LlmEvaluator` is a `.server.ts` module reached
exclusively through server functions, so the key, the prompt and the rubric never reach the browser.

## Out of scope

No authentication, no course structure, no problem authoring, no leaderboards, no payments.

Further reading: [RESEARCH.md](./RESEARCH.md), [DESIGN.md](./DESIGN.md), [AI_USAGE.md](./AI_USAGE.md).
