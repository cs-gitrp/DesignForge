import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { LoadFailed, MissingRecord } from "@/components/route-fallbacks";
import { Button, ButtonLink, DifficultyBadge, Panel, SectionLabel } from "@/components/ui-kit";
import { RUBRIC_CRITERIA, RUBRIC_GUIDE } from "@/domain/rubric";
import { ensureBrowserLearner } from "@/lib/learner-browser";
import { startAttempt } from "@/lib/practice.functions";

import { problemQuery } from "@/lib/queries";

export const Route = createFileRoute("/problems/$problemId")({
  head: ({ params }) => ({
    meta: [
      { title: `${titleize(params.problemId)} — LLD Practice Lab` },
      {
        name: "description",
        content: `Requirements and design prompts for the ${titleize(params.problemId)} low-level design problem, then submit your own design for rubric feedback.`,
      },
      { property: "og:title", content: `${titleize(params.problemId)} — LLD practice problem` },
      {
        property: "og:description",
        content: `Read the requirements, then submit a structured design for the ${titleize(params.problemId)} LLD problem.`,
      },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(problemQuery(params.problemId)),
  component: ProblemDetails,
  notFoundComponent: () => (
    <MissingRecord
      title="This problem isn't available"
      body="It may have been removed. Pick one of the problems from the library instead."
    />
  ),
  errorComponent: LoadFailed,
});

function titleize(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ProblemDetails() {
  const { problemId } = Route.useParams();
  const { data: problem } = useSuspenseQuery(problemQuery(problemId));
  const start = useServerFn(startAttempt);
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  async function handleStart() {
    setPending(true);
    ensureBrowserLearner();
    const result = await start({ data: { id: problem.id } });
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    navigate({ to: "/attempt/$attemptId", params: { attemptId: result.data.id } });
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <ButtonLink to="/" variant="ghost" className="mb-6 px-0">
        ← Problem library
      </ButtonLink>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{problem.title}</h1>
        <DifficultyBadge difficulty={problem.difficulty} />
      </div>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">{problem.description}</p>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Panel>
          <SectionLabel>Requirements</SectionLabel>
          <ul className="mt-4 space-y-2.5 text-sm leading-relaxed">
            {problem.requirements.map((item) => (
              <li key={item} className="flex gap-2.5">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <SectionLabel>Things to think about</SectionLabel>
          <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
            {problem.thinkAbout.map((item) => (
              <li key={item} className="flex gap-2.5">
                <span className="mt-1.5 font-mono text-xs text-primary">?</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel className="mt-4">
        <SectionLabel>You&apos;ll be reviewed on</SectionLabel>
        <p className="mt-3 text-xs text-muted-foreground">
          Eight criteria, each scored 1–5 with evidence quoted from what you wrote. The overall
          score is the average of the eight.
        </p>
        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {RUBRIC_CRITERIA.map((criterion) => (
            <div key={criterion}>
              <dt className="text-[13px] font-medium">{criterion}</dt>
              <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {RUBRIC_GUIDE[criterion]}
              </dd>
            </div>
          ))}
        </dl>
      </Panel>

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-border pt-8">
        <Button onClick={handleStart} disabled={pending}>
          {pending ? "Starting…" : "Start Practice"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Each start creates a new attempt. Previous attempts stay unchanged.
        </p>
      </div>
    </main>
  );
}
