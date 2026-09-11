# Research

## The problem being solved

People preparing for LLD interviews can find hundreds of problem statements and many model solutions.

What is harder to get is an answer to the question that matters while practising:

**Is my design actually good, and what specifically should I change?**

Reading a model solution does not answer that. A model solution is one valid design; the learner's design may be equally valid, or subtly broken in a way the reference solution does not expose.

The feedback loop is therefore the product opportunity, rather than simply providing more LLD content.

---

## Existing approaches

I looked at existing LLD and interview-practice products to understand what they optimise for and where a small MVP could remain focused.

### Hello Interview

Hello Interview's current LLD Guided Practice provides step-by-step practice on common LLD problems with personalised feedback. Its LLD library includes problems such as Parking Lot, Elevator, File System and Rate Limiter.

The useful product observation was that **feedback is attached to the learner's own reasoning**, rather than only showing a reference solution.

### LLDCanvas

LLDCanvas takes a much broader tooling approach. Its platform combines a UML editor, design patterns, practice problems, timed interview mode, analytics, code execution, revision material and collaboration.

This demonstrates the breadth of what an LLD preparation platform can become, but it also highlights a product risk for a small MVP: building the editor, content system, execution environment and collaboration layer can quickly overshadow the core practice loop.

### Structured learning platforms

Structured LLD/OOD learning products such as Educative's Grokking course organise preparation around object-oriented principles, design patterns, real-world systems, diagrams and mock interview practice.

This reinforces that requirements, class responsibilities, relationships, abstractions and trade-offs are recurring elements of LLD preparation.

---

## What the research suggested

Three patterns stood out.

### 1. LLD does not have one canonical answer

A Parking Lot can be modelled in multiple reasonable ways. Different allocation strategies, abstractions and class boundaries can all be defensible depending on the requirements and the change being optimised for.

Therefore, an evaluator that compares a learner against one reference class diagram risks penalising valid alternatives.

### 2. Structure improves the quality of practice

The useful parts of an LLD answer are not only the final classes.

A strong candidate needs to explain:

- what assumptions they made
- which classes own which responsibilities
- how those classes interact
- why a particular abstraction or pattern was chosen
- what happens in edge cases
- which future changes the design can tolerate

A completely free-form text box makes those gaps difficult to see, both for the learner and for an evaluator.

### 3. Feedback is different from a model answer

A reference solution tells a learner what somebody else designed.

It does not necessarily tell them:

- which part of *their* design was weak
- what evidence led to that conclusion
- whether their alternative was actually valid
- what single change would improve the next attempt

That made the feedback loop the most valuable part to optimise for this MVP.

---

## Product decisions derived from the research

### Structure the submission into five fixed sections

The submission is divided into:

1. Assumptions
2. Classes & Responsibilities
3. Relationships
4. Design Decisions & Trade-offs
5. Edge Cases & Testability

This gives the learner a thinking scaffold while also giving the evaluator a stable input shape.

For example, instead of generic feedback such as:

> "Your design could be more complete."

the evaluator can identify a specific missing area such as:

> "You described the classes but did not explain how the allocation strategy interacts with the parking facility."

The structure therefore improves both practice quality and evaluation quality.

---

### Score criteria, not correctness

The rubric evaluates:

- requirement understanding
- responsibility separation
- coupling and cohesion
- encapsulation and interfaces
- abstraction and patterns
- extensibility
- edge cases and testability
- explanation and trade-offs

It does not ask whether the learner arrived at one particular class diagram.

The evaluator is explicitly instructed that multiple valid designs exist.

---

### Require evidence for every criterion

A score without evidence is difficult to challenge and easy for a model to hallucinate.

Every criterion therefore requires evidence from the learner's own submission.

This makes the feedback checkable:

```text
Claim
  ↓
Evidence from learner's text
  ↓
Concern
  ↓
Actionable next step
```

If the evaluator cannot support its criticism from the submission, the output should fail validation rather than silently becoming generic advice.

---

### One concern and one suggestion per criterion

Eight criteria with several generic suggestions each would create a large amount of low-value feedback.

The product instead asks for:

- one specific concern
- one actionable suggestion

per criterion.

The intention is to give the learner a manageable set of next steps for the next attempt.

---

### Make repetition first-class

An LLD practice product should not stop at evaluation.

The learner should be able to:

```text
Attempt 1
   ↓
Feedback
   ↓
Retry
   ↓
Attempt 2
   ↓
Feedback
```

Attempts are therefore numbered and retained.

History shows how scores and individual criteria change between completed attempts, making improvement visible rather than implied.

---

## Why these three problems

The MVP includes:

- Parking Lot
- Vending Machine
- Elevator System

These were selected because they provide different modelling pressures while remaining familiar enough to focus the prototype on the practice loop.

The goal is not to demonstrate a large problem catalogue. Three problems are sufficient to exercise:

- requirements interpretation
- class responsibility modelling
- relationships
- stateful behaviour
- strategy/abstraction decisions
- edge cases
- repeated attempts

A larger content library can be added once the feedback loop proves useful.

---

## Deliberate omissions

### No authentication

Authentication adds signup and account-management work without testing the core learning loop.

Attempts are therefore anonymous but owned. Each browser receives an opaque learner identifier in an HTTP-only cookie, and reads/writes are scoped to that learner.

A future account system can populate the same ownership field from a real session rather than changing the core domain model.

### No editing after submit

Editing a submitted attempt would change the text that the feedback refers to.

Instead, submission locks the attempt and improvement happens through a new attempt.

This preserves the integrity of the history:

```text
Attempt 1
→ feedback for Attempt 1

Attempt 2
→ feedback for Attempt 2
```

### No code execution

The MVP focuses on object-oriented structure and reasoning rather than running implementation code.

Code execution would introduce another evaluation dimension, sandboxing concerns and significantly more infrastructure.

### No full UML editor

Visual modelling is useful, but building a robust UML editor would consume a large portion of the MVP without directly testing the feedback loop.

The structured text format captures the reasoning while keeping the submission surface simple.

### No large problem catalogue

Problem authoring, tagging, search and content management are secondary to proving that learners can practice, receive useful feedback and improve.

---

## Evaluation design research

A major design question was whether the AI should compare submissions against a reference solution.

The conclusion was **no**.

The evaluator instead receives:

```text
Problem requirements
        +
Learner submission
        ↓
Fixed rubric
        ↓
Evidence-based evaluation
```

The prompt explicitly tells the model:

- multiple valid designs exist
- alternatives should not be penalised merely for differing from a canonical solution
- only claims supported by the learner's submission should be made
- every criterion needs evidence
- suggestions must be actionable

This makes the evaluator a reviewer of the learner's reasoning rather than a similarity checker.

---

## Reliability and trust considerations

AI feedback is useful only if the learner can trust what it says.

The evaluator therefore has a strict boundary:

```text
Model output
     ↓
Parse
     ↓
Validate rubric structure
     ↓
Validate evidence and scores
     ↓
Derive overall score
     ↓
Persist
```

Malformed output is not partially stored.

If evaluation fails, the learner's submission remains available and the attempt can be retried.

A deterministic evaluator also exists as a provider-independent fallback. It performs structural validation only and explicitly does not claim to judge design quality.

---

## What I would build next

### 1. Side-by-side attempt comparison

Show two attempts together, criterion by criterion, so the learner can see exactly which concern was addressed.

The current history already shows criterion-level movement between completed attempts.

### 2. Weak-area recommendations

Aggregate weak criteria across problems.

For example:

> "Relationship modelling is consistently your weakest area."

The system could then recommend a problem that exercises that skill.

### 3. Evaluation-quality checking

Add a second validation pass focused specifically on feedback quality:

- Is the evidence actually relevant?
- Is the concern supported?
- Is the suggestion actionable?
- Is the feedback generic?

This would improve trust in model-generated feedback.

### 4. Real accounts

Allow history to follow a learner across browsers and devices while preserving the same ownership model.

---

## Research conclusion

The research pointed toward a deliberately narrow product:

**Problem → structured design → evidence-based evaluation → review → retry**

Rather than building another large LLD content or diagramming platform, the MVP focuses on the part of practice that is hardest to get from a static solution: **specific feedback on the learner's own design and a clear path to improve it.**

The scope is intentionally small so the evaluation loop can be implemented, tested and reasoned about end to end.