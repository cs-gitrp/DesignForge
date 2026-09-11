# RESEARCH.md

## The problem being solved

People preparing for LLD interviews can find hundreds of problem statements and dozens of model
solutions. What they cannot get is an answer to the only question that matters while practising:
**is my design actually good, and what specifically should I change?**

Reading a model solution does not answer it. A model solution is one valid design; the learner's
design may be equally valid, or subtly broken in a way the model solution does not mention. The
feedback loop is the missing product, not the content.

## Why LLD is awkward to evaluate

- **There is no single correct answer.** A parking lot can be modelled with a spot-allocation
  strategy or with per-floor allocation logic. Both can be good. An evaluator that scores against
  one reference design punishes valid alternatives.
- **The interesting part is prose, not code.** What separates a strong candidate is *why* they chose
  composition over inheritance, and which change they optimised for. That reasoning is text.
- **Free-form text is unscorable.** A single blank box produces a wall of prose in which coverage
  gaps are invisible — to a reviewer and to the learner.

## Decisions that follow

**Structure the submission into five fixed sections.** Requirements, classes, relationships,
trade-offs, edge cases. This is the central design decision of the product. It gives the learner a
thinking scaffold (the sections are the questions an interviewer asks), and it gives the evaluator a
stable input shape so "you never discussed relationships" becomes a detectable, addressable gap
rather than a vague impression.

**Score criteria, not correctness.** The eight rubric criteria are all about design quality —
coverage, responsibility separation, abstraction, edge cases, articulated trade-offs. None of them
asks whether the learner arrived at a particular class diagram.

**Require evidence on every criterion.** A score with no quote is unfalsifiable and, worse, easy for
a model to hallucinate. Forcing each criterion to cite the learner's own words makes feedback
checkable by the learner and makes drifting model output visible instead of plausible.

**One concern and one suggestion per criterion.** Eight criteria with three suggestions each is
noise. One next step per criterion is a list the learner can actually act on in the next attempt.

**Make repetition first-class.** Attempts are immutable and numbered, and history shows the delta
against the previous attempt on the same problem. Improvement is the product's unit of value, so it
is visible rather than implied.

## Deliberate omissions

- **No authentication.** It adds signup friction and tests nothing about the learning loop. Attempts
  are anonymous but owned: each browser gets an opaque learner id in an HTTP-only cookie, and every
  read, write and row-level policy is scoped to it, so nobody sees or edits another person's work.
  Adding real accounts later means populating that same owner column from a session, not reshaping the
  domain.

- **No editing after submit.** Editing a submitted attempt destroys the record the feedback refers
  to. Retrying is what improvement actually looks like.
- **Only three problems.** The assignment is a journey, not a catalogue. Problem authoring, tagging,
  and search would all be work spent away from the feedback loop.
- **No code execution.** LLD is about structure and reasoning; running code answers a different
  question.

## What I would build next

1. Diff two attempts side by side per criterion, so a learner sees exactly which concern they closed.
   (History already shows which criteria moved up or down against the previous completed attempt.)
2. Aggregate weak criteria across problems ("your relationship modelling scores lowest") and use it
   to recommend the next problem.
3. A second-pass critique of the evaluator's own feedback, to catch generic or evidence-free output
   before the learner sees it.
4. Real accounts, so a learner's history follows them across browsers and devices.

