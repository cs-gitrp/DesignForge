import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { ButtonLink, Button, DifficultyBadge, Panel, SectionLabel } from "@/components/ui-kit";
import { ensureBrowserLearner } from "@/lib/learner-browser";
import { problemsQuery } from "@/lib/queries";
import { startAttempt } from "@/lib/practice.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LLD Practice Lab — Practise Low-Level Design with rubric feedback" },
      {
        name: "description",
        content:
          "Attempt Parking Lot, Vending Machine and Elevator LLD problems, submit a structured design, and get evidence-based rubric feedback you can act on.",
      },
      { property: "og:title", content: "LLD Practice Lab — Low-Level Design practice" },
      {
        property: "og:description",
        content:
          "Design, submit, review, retry: rubric-based feedback on your Low-Level Design attempts.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(problemsQuery()),
  component: Home,
});

function Home() {
  const { data: problems } = useSuspenseQuery(problemsQuery());
  const start = useServerFn(startAttempt);
  const navigate = useNavigate();
  const [pending, setPending] = useState<string | null>(null);

  async function handleStart(problemId: string) {
    setPending(problemId);
    ensureBrowserLearner();
    const result = await start({ data: { id: problemId } });
    setPending(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    navigate({ to: "/attempt/$attemptId", params: { attemptId: result.data.id } });
  }

  return (
    <main className="mx-auto max-w-6xl px-5 pb-16">
      <section className="border-b border-border py-14">
        <SectionLabel>Low-level design practice</SectionLabel>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Find out whether your design is actually good.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Pick a problem, write your classes, responsibilities and trade-offs, and get feedback
          scored against eight design criteria — each one citing evidence from what you wrote, with
          a concrete next step. Then try again and watch the score move.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink to="/history" variant="outline">
            View your history
          </ButtonLink>
        </div>
      </section>

      <section className="py-12">
        <div className="flex items-baseline justify-between">
          <SectionLabel>Problem library</SectionLabel>
          <span className="font-mono text-xs text-muted-foreground">
            {problems.length} problems
          </span>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {problems.map((problem) => (
            <Panel key={problem.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{problem.title}</h2>
                <DifficultyBadge difficulty={problem.difficulty} />
              </div>
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                {problem.description}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  onClick={() => handleStart(problem.id)}
                  disabled={pending === problem.id}
                  className="flex-1"
                >
                  {pending === problem.id ? "Starting…" : "Start Practice"}
                </Button>
                <ButtonLink
                  to="/problems/$problemId"
                  params={{ problemId: problem.slug }}
                  variant="outline"
                >
                  Details
                </ButtonLink>
              </div>
            </Panel>
          ))}
        </div>
      </section>
    </main>
  );
}
