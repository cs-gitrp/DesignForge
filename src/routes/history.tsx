import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import {
  ButtonLink,
  EmptyState,
  Panel,
  ScoreMeter,
  SectionLabel,
  StatusPill,
} from "@/components/ui-kit";
import { evaluatorLabel } from "@/domain/evaluator";
import { MAX_SCORE } from "@/domain/rubric";
import { historyQuery } from "@/lib/queries";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Attempt history — LLD Practice Lab" },
      {
        name: "description",
        content:
          "Every low-level design attempt you have made, with status, overall score per attempt and how your scores changed over repeated practice.",
      },
      { property: "og:title", content: "Attempt history — LLD Practice Lab" },
      {
        property: "og:description",
        content: "Track your low-level design scores across repeated attempts per problem.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(historyQuery()),
  component: HistoryPage,
});

/**
 * Per-criterion movement against the previous completed attempt on the same
 * problem — this is what makes a retry legible as improvement, not just a
 * different overall number.
 */
function criterionDeltas(
  current: { criterion: string; score: number }[],
  previous: { criterion: string; score: number }[],
): { criterion: string; delta: number }[] {
  const before = new Map(previous.map((f) => [f.criterion, f.score]));
  return current
    .map((f) => ({ criterion: f.criterion, delta: f.score - (before.get(f.criterion) ?? f.score) }))
    .filter((d) => d.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function HistoryPage() {
  const { data: entries } = useSuspenseQuery(historyQuery());

  if (entries.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16">
        <EmptyState
          title="No attempts yet"
          body="Start a problem to create your first attempt. Your scores and feedback will collect here so you can see improvement over time."
          action={<ButtonLink to="/">Browse problems</ButtonLink>}
        />
      </main>
    );
  }

  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = groups.get(entry.problem.id) ?? [];
    list.push(entry);
    groups.set(entry.problem.id, list);
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <SectionLabel>History</SectionLabel>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Your attempts</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Repeated practice is the point. Compare an attempt&apos;s score with your earlier ones on
        the same problem.
      </p>

      <div className="mt-8 space-y-6">
        {[...groups.values()].map((group) => {
          const ordered = [...group].sort(
            (a, b) => a.attempt.attemptNumber - b.attempt.attemptNumber,
          );
          const scored = ordered.filter((e) => e.evaluation?.overallScore != null);
          const first = scored[0]?.evaluation?.overallScore ?? null;
          const last = scored[scored.length - 1]?.evaluation?.overallScore ?? null;
          const delta = first !== null && last !== null && scored.length > 1 ? last - first : null;

          return (
            <Panel key={group[0]!.problem.id} className="space-y-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">{group[0]!.problem.title}</h2>
                <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
                  <span>{ordered.length} attempts</span>
                  {delta !== null && (
                    <span className={delta >= 0 ? "text-success" : "text-warning"}>
                      {delta >= 0 ? "+" : ""}
                      {delta.toFixed(1)} since attempt #{scored[0]!.attempt.attemptNumber}
                    </span>
                  )}
                </div>
              </div>

              <ul className="divide-y divide-border">
                {ordered.map(({ attempt, evaluation }, index) => {
                  const previous = ordered
                    .slice(0, index)
                    .reverse()
                    .find((e) => e.evaluation?.status === "COMPLETED");
                  const deltas =
                    evaluation?.status === "COMPLETED" && previous?.evaluation
                      ? criterionDeltas(evaluation.feedback, previous.evaluation.feedback)
                      : [];
                  return (
                    <li key={attempt.id} className="py-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="min-w-[200px] flex-1">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="font-mono text-sm">
                              Attempt #{attempt.attemptNumber}
                            </span>
                            <StatusPill status={attempt.status} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {new Date(attempt.createdAt).toLocaleString()}
                          </p>
                          {evaluation?.status === "COMPLETED" && (
                            <p className="label-mono mt-1">
                              {evaluatorLabel(evaluation.evaluatorType)}
                            </p>
                          )}
                        </div>

                        <div className="w-32">
                          {evaluation?.overallScore != null ? (
                            <>
                              <p className="font-mono text-sm">
                                {evaluation.overallScore.toFixed(1)}/{MAX_SCORE}
                              </p>
                              <div className="mt-1.5">
                                <ScoreMeter score={evaluation.overallScore} />
                              </div>
                            </>
                          ) : (
                            <p className="font-mono text-xs text-muted-foreground">no score</p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {attempt.status === "COMPLETED" ? (
                            <ButtonLink
                              to="/attempt/$attemptId/feedback"
                              params={{ attemptId: attempt.id }}
                              variant="outline"
                            >
                              Feedback
                            </ButtonLink>
                          ) : (
                            <ButtonLink
                              to="/attempt/$attemptId"
                              params={{ attemptId: attempt.id }}
                              variant="outline"
                            >
                              Open
                            </ButtonLink>
                          )}
                        </div>
                      </div>

                      {deltas.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="label-mono">
                            vs attempt #{previous!.attempt.attemptNumber}
                          </span>
                          {deltas.map((d) => (
                            <span
                              key={d.criterion}
                              className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
                                d.delta > 0
                                  ? "border-success/40 text-success"
                                  : "border-warning/40 text-warning"
                              }`}
                            >
                              {d.criterion} {d.delta > 0 ? "+" : ""}
                              {d.delta}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          );
        })}
      </div>
    </main>
  );
}
