import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { LoadFailed, MissingRecord } from "@/components/route-fallbacks";
import {
  Button,
  ButtonLink,
  Callout,
  EmptyState,
  Panel,
  ScoreMeter,
  SectionLabel,
  StatusPill,
} from "@/components/ui-kit";
import { evaluatorLabel } from "@/domain/evaluator";
import { MAX_SCORE } from "@/domain/rubric";
import { startAttempt } from "@/lib/practice.functions";
import { workspaceQuery } from "@/lib/queries";

export const Route = createFileRoute("/attempt_/$attemptId/feedback")({
  head: () => ({
    meta: [
      { title: "Design feedback — LLD Practice Lab" },
      {
        name: "description",
        content:
          "Rubric feedback for your low-level design attempt: per-criterion score, evidence from your submission, concerns and actionable suggestions.",
      },
      { property: "og:title", content: "Design feedback — LLD Practice Lab" },
      {
        property: "og:description",
        content: "Per-criterion scores, evidence from your own submission, and next steps.",
      },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(workspaceQuery(params.attemptId)),
  component: FeedbackPage,
  notFoundComponent: () => <MissingRecord />,
  errorComponent: LoadFailed,
});

function FeedbackPage() {
  const { attemptId } = Route.useParams();
  const { data: workspace } = useSuspenseQuery(workspaceQuery(attemptId));
  const { attempt, problem, evaluation } = workspace;
  const start = useServerFn(startAttempt);
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  async function handleTryAgain() {
    setPending(true);
    const result = await start({ data: { id: problem.id } });
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    navigate({ to: "/attempt/$attemptId", params: { attemptId: result.data.id } });
  }

  if (!evaluation || evaluation.status !== "COMPLETED") {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16">
        <EmptyState
          title={evaluation?.status === "FAILED" ? "Evaluation failed" : "No feedback yet"}
          body={
            evaluation?.errorMessage ??
            "This attempt has not been reviewed yet. Submit your design to get rubric feedback."
          }
          action={
            <ButtonLink to="/attempt/$attemptId" params={{ attemptId }}>
              Back to attempt
            </ButtonLink>
          }
        />
      </main>
    );
  }

  const overall = evaluation.overallScore ?? 0;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div>
          <SectionLabel>Feedback — attempt #{attempt.attemptNumber}</SectionLabel>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{problem.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StatusPill status={attempt.status} />
            <span className="label-mono">
              Reviewed by: {evaluatorLabel(evaluation.evaluatorType)}
            </span>
            <span className="label-mono text-muted-foreground">
              tier: {evaluation.evaluatorType}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleTryAgain} disabled={pending}>
            {pending ? "Creating…" : "Try Again"}
          </Button>
          <ButtonLink to="/history" variant="outline">
            History
          </ButtonLink>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <Panel className="flex flex-col items-center justify-center gap-2 text-center">
          <SectionLabel>Overall</SectionLabel>
          <p className="font-mono text-4xl font-semibold text-primary">{overall.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground">out of {MAX_SCORE}</p>
          <div className="mt-3 w-full">
            <ScoreMeter score={overall} />
          </div>
        </Panel>
        <div className="grid gap-4 sm:grid-cols-2">
          <Panel className="space-y-3">
            <SectionLabel>Key strengths</SectionLabel>
            {evaluation.strengths.length === 0 ? (
              <p className="text-sm text-muted-foreground">No clear strengths identified yet.</p>
            ) : (
              <ul className="space-y-2 text-sm leading-relaxed">
                {evaluation.strengths.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-success" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel className="space-y-3">
            <SectionLabel>Biggest improvement areas</SectionLabel>
            {evaluation.improvementAreas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing flagged as a priority.</p>
            ) : (
              <ul className="space-y-2 text-sm leading-relaxed">
                {evaluation.improvementAreas.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-warning" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Callout tone="info" title="How to read this">
        Scores are per criterion on a 5-point scale. Evidence quotes your own submission. There is
        more than one valid design — nothing here penalises you for differing from a reference
        solution.
      </Callout>

      <section className="mt-8 space-y-4">
        <SectionLabel>Rubric detail</SectionLabel>
        {evaluation.feedback.map((item) => (
          <Panel key={item.criterion} className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold">{item.criterion}</h2>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm">
                  {item.score.toFixed(1)}/{MAX_SCORE}
                </span>
                <span className="label-mono">confidence {Math.round(item.confidence * 100)}%</span>
              </div>
            </div>
            <ScoreMeter score={item.score} />
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="label-mono">Evidence</dt>
                <dd className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  {item.evidence || "—"}
                </dd>
              </div>
              <div>
                <dt className="label-mono">Concern</dt>
                <dd className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  {item.concern || "—"}
                </dd>
              </div>
              <div>
                <dt className="label-mono">Suggestion</dt>
                <dd className="mt-1.5 text-[13px] leading-relaxed text-foreground">
                  {item.suggestion || "—"}
                </dd>
              </div>
            </dl>
          </Panel>
        ))}
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-border pt-8">
        <Button onClick={handleTryAgain} disabled={pending}>
          {pending ? "Creating…" : "Try Again"}
        </Button>
        <p className="text-xs text-muted-foreground">
          A new attempt starts blank. This attempt and its feedback stay in your history.
        </p>
      </div>
    </main>
  );
}
