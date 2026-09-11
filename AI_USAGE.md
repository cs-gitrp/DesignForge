# AI_USAGE.md

Two distinct uses of AI here: AI **inside** the product, and AI used **to build** it.

## 1. AI inside the product

### Where it runs

`src/infrastructure/evaluators/llm-evaluator.server.ts` (Lovable AI gateway) and
`src/infrastructure/evaluators/gemini-evaluator.server.ts` (Gemini API directly, for standalone
runs), both reached only through server functions in `src/lib/practice.functions.ts`. Both share one
prompt module, `src/domain/evaluation-prompt.ts`, so the constraints below apply identically on either
path. `.server` modules never enter a browser bundle, so the API keys, the rubric prompt and the
evaluation instructions stay server-side.


### What it is asked to do

Score one submission against the eight fixed rubric criteria and return JSON: per criterion a score
1–5, an exact quote from the submission as evidence, one specific concern, one actionable suggestion,
and a confidence value; plus overall strengths and improvement areas.

### Prompt constraints, and why

| Constraint | Reason |
| --- | --- |
| "Multiple valid designs exist; do not penalise a valid alternative." | Models drift toward a canonical textbook solution and mark different-but-correct designs down. |
| Every criterion must quote the submission verbatim. | Makes feedback checkable by the learner and exposes invented criticism. |
| No claim the evidence does not support. | Blocks generic advice ("consider SOLID") dressed up as a finding. |
| Exactly one actionable suggestion per criterion. | Eight criteria times three vague tips is unusable. |
| Fixed JSON shape. | Parseable, and validatable against the rubric before persistence. |

### Trust boundary

Model output is untrusted input. `domain/rubric.ts` validates it in one place for every path: all
eight criteria present and correctly named, scores integer 1–5 (not rounded silently from anything
else), evidence non-empty, confidence normalised, and the overall score derived by the application
rather than accepted from the model. Only validated output is persisted. Anything else is a
controlled failure — the submission is preserved, the attempt and evaluation are marked `FAILED`, and
the UI offers Retry Evaluation. No partially-parsed feedback is ever stored, and the learner is never
shown a silent fallback pretending to be a real evaluation.

### The deterministic alternative

`RuleBasedEvaluator` implements the same `Evaluator` interface with no model, no network and no key,
but it is deliberately narrower than the model evaluators: it validates *structure* — section
coverage and depth, with evidence quoted from the submission — caps its scores below the top of the
scale, reports low confidence, and says outright that it is not judging design quality. The UI labels
its output "structural validation", not "AI design review". It exists because the product must be
demonstrable and testable without a provider, and because it proves the abstraction is real.

`practice-service-factory.server.ts` is the only chooser: `LOVABLE_API_KEY` → gateway evaluator, else
`GEMINI_API_KEY` → direct Gemini evaluator, else rule-based. Each evaluation stores the
`evaluatorType` that actually ran (`LLM`, `LLM_GEMINI_DIRECT`, `RULE_BASED`), so the label is always
honest; nothing else in the codebase knows which is in use.


## 2. AI used to build this

Development was AI-assisted throughout, in an agent-style loop: I described intent and constraints,
reviewed the produced code, and rejected or reshaped what did not fit.

**Where it was clearly worth it**

- Scaffolding: schema and migration, repository plumbing, route wiring, React Query setup.
- Repetitive shaping: five section definitions, eight rubric criteria, mapping rows to domain types.
- Test breadth: enumerating illegal state transitions and rubric edge cases.
- Documentation drafts, then edited down.

**Where I made the calls myself**

- Layering, and the rule that the domain imports nothing outward. This is what makes the journey
  testable and it does not survive being left to an autocomplete.
- The five-section submission format — the product's central decision.
- The ordering guarantee in `submit`: persist the submission before evaluating, never roll it back on
  evaluator failure.
- Treating model output as untrusted and validating it in the domain.

**Corrections I had to make**

- Business rules kept drifting into route components; they were pulled back into `PracticeService`.
- A field-name mismatch between `RuleBasedEvaluator` output and the rubric parser (`criterion` vs
  `name`) — caught by tests, which is exactly why the deterministic evaluator is tested.
- A proposed evaluator fallback that silently substituted rule-based scoring for a failed LLM run.
  Rejected: it hides a failure and mislabels the evaluator that produced the feedback.
- Test alias resolution needed explicit configuration rather than assuming the app's build config.

**Judgement**

AI compressed the mechanical work substantially and produced plausible architecture that would have
been wrong to accept as given. The value came from having firm opinions about boundaries and failure
behaviour and enforcing them on the output.
