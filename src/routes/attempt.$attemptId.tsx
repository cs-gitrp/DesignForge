import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { LoadFailed, MissingRecord } from "@/components/route-fallbacks";
import {
  Button,
  ButtonLink,
  Callout,
  DifficultyBadge,
  Panel,
  SectionLabel,
  StatusPill,
} from "@/components/ui-kit";
import { isEditable } from "@/domain/attempt-state-machine";
import { reviewStructure } from "@/domain/structural-validation";
import { filledSections, SUBMISSION_SECTIONS } from "@/domain/submission";

import type { StructuredTextContent } from "@/domain/types";
import {
  getActiveEvaluatorTier,
  retryEvaluation,
  saveDraft,
  submitAttempt,
} from "@/lib/practice.functions";
import { workspaceQuery } from "@/lib/queries";

export const Route = createFileRoute("/attempt/$attemptId")({
  head: () => ({
    meta: [
      { title: "Practice attempt — LLD Practice Lab" },
      {
        name: "description",
        content:
          "Write your assumptions, classes, relationships, trade-offs and edge cases, then submit the design for rubric-based review.",
      },
      { property: "og:title", content: "Practice attempt — LLD Practice Lab" },
      {
        property: "og:description",
        content: "Write a structured low-level design and submit it for evidence-based review.",
      },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(workspaceQuery(params.attemptId)),
  component: PracticePage,
  notFoundComponent: () => <MissingRecord />,
  errorComponent: LoadFailed,
});

type Phase = "idle" | "saving" | "submitting" | "evaluating";

function PracticePage() {
  const { attemptId } = Route.useParams();
  const { data: workspace } = useSuspenseQuery(workspaceQuery(attemptId));
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const save = useServerFn(saveDraft);
  const submit = useServerFn(submitAttempt);
  const retry = useServerFn(retryEvaluation);

  const { attempt, problem, submission, evaluation } = workspace;
  const editable = isEditable(attempt.status);

  const [content, setContent] = useState<StructuredTextContent>(submission.content);
  const [phase, setPhase] = useState<Phase>("idle");
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(evaluation?.errorMessage ?? null);
  const [tier, setTier] = useState<{ type: string; label: string } | null>(null);

  useEffect(() => {
    setContent(submission.content);
  }, [submission.content]);

  const fetchTier = useServerFn(getActiveEvaluatorTier);
  useEffect(() => {
    fetchTier()
      .then(setTier)
      .catch(() => setTier(null));
  }, [fetchTier]);

  const busy = phase !== "idle";
  const filled = filledSections(content);
  const structure = reviewStructure(content);

  function update(key: keyof StructuredTextContent, value: string) {
    setContent((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  async function handleSave() {
    setPhase("saving");
    const result = await save({ data: { attemptId, content } });
    setPhase("idle");
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setDirty(false);
    setSavedAt(new Date().toLocaleTimeString());
    toast.success("Draft saved");
    await queryClient.invalidateQueries({ queryKey: ["workspace", attemptId] });
  }

  async function handleSubmit() {
    if (filled === 0) {
      toast.error("Add your design before submitting — all sections are empty.");
      return;
    }
    setError(null);
    setPhase("submitting");
    setTimeout(() => setPhase((p) => (p === "submitting" ? "evaluating" : p)), 600);
    const result = await submit({ data: { attemptId, content } });
    await queryClient.invalidateQueries({ queryKey: ["workspace", attemptId] });
    await queryClient.invalidateQueries({ queryKey: ["history"] });
    setPhase("idle");

    if (!result.ok) {
      setError(result.message);
      toast.error(result.message);
      return;
    }
    if (result.data.evaluation.status === "COMPLETED") {
      navigate({ to: "/attempt/$attemptId/feedback", params: { attemptId } });
      return;
    }
    setError(result.data.evaluation.errorMessage ?? "Evaluation failed.");
  }

  async function handleRetry() {
    setError(null);
    setPhase("evaluating");
    const result = await retry({ data: { attemptId } });
    await queryClient.invalidateQueries({ queryKey: ["workspace", attemptId] });
    await queryClient.invalidateQueries({ queryKey: ["history"] });
    setPhase("idle");
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.data.status === "COMPLETED") {
      navigate({ to: "/attempt/$attemptId/feedback", params: { attemptId } });
      return;
    }
    setError(result.data.errorMessage ?? "Evaluation failed again.");
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div>
          <SectionLabel>Attempt #{attempt.attemptNumber}</SectionLabel>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{problem.title}</h1>
            <DifficultyBadge difficulty={problem.difficulty} />
            <StatusPill status={attempt.status} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {attempt.status === "COMPLETED" && (
            <ButtonLink to="/attempt/$attemptId/feedback" params={{ attemptId }}>
              View feedback
            </ButtonLink>
          )}
          <ButtonLink to="/history" variant="outline">
            History
          </ButtonLink>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          {phase === "submitting" && (
            <Callout title="Submitted">Your design is saved. Starting the review…</Callout>
          )}
          {phase === "evaluating" && (
            <Callout title="Evaluating">
              Reviewing your design against the eight rubric criteria. This usually takes a few
              seconds.
            </Callout>
          )}
          {error && (
            <Callout tone="error" title="Evaluation failed">
              <p>{error}</p>
              <p className="mt-2">
                Your submission is safely stored — retrying does not ask you to type it again.
              </p>
              <div className="mt-3">
                <Button variant="outline" onClick={handleRetry} disabled={busy}>
                  Retry evaluation
                </Button>
              </div>
            </Callout>
          )}
          {!editable && !error && attempt.status !== "COMPLETED" && (
            <Callout title="Locked">
              This attempt is {attempt.status.toLowerCase()} and can no longer be edited.
            </Callout>
          )}
          {attempt.status === "COMPLETED" && (
            <Callout tone="success" title="Reviewed">
              This attempt has been evaluated. Open the feedback, then use Try Again to create a new
              attempt.
            </Callout>
          )}

          {SUBMISSION_SECTIONS.map((section, index) => (
            <Panel key={section.key} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <SectionLabel>
                    {String(index + 1).padStart(2, "0")} — {section.label}
                  </SectionLabel>
                  <p className="mt-1.5 text-sm text-muted-foreground">{section.hint}</p>
                </div>
                {content[section.key].trim().length > 0 && (
                  <span className="font-mono text-[11px] text-success">filled</span>
                )}
              </div>
              <textarea
                value={content[section.key]}
                onChange={(event) => update(section.key, event.target.value)}
                disabled={!editable || busy}
                rows={7}
                placeholder={editable ? "Write your design here…" : "No content"}
                className="w-full resize-y rounded-md border border-border bg-input px-3.5 py-3 font-mono text-[13px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring disabled:opacity-70"
              />
            </Panel>
          ))}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Panel className="space-y-4">
            <SectionLabel>Requirements</SectionLabel>
            <ul className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
              {problem.requirements.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Panel>

          {editable && structure.issues.length > 0 && (
            <Panel className="space-y-3">
              <SectionLabel>Structural checks</SectionLabel>
              <p className="text-xs text-muted-foreground">
                Coverage only — these checks say nothing about design quality.
              </p>
              <ul className="space-y-2 text-[13px] leading-relaxed">
                {structure.issues.map((issue) => (
                  <li key={issue.message} className="flex gap-2">
                    <span
                      className={`mt-1.5 size-1 shrink-0 rounded-full ${
                        issue.severity === "blocker" ? "bg-destructive" : "bg-warning"
                      }`}
                    />
                    <span className="text-muted-foreground">{issue.message}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel className="space-y-3">
            <div className="flex items-baseline justify-between">
              <SectionLabel>Progress</SectionLabel>
              <span className="font-mono text-xs text-muted-foreground">
                {filled}/{SUBMISSION_SECTIONS.length} sections
              </span>
            </div>
            {editable ? (
              <>
                <Button onClick={handleSubmit} disabled={busy || filled === 0} className="w-full">
                  {phase === "submitting" || phase === "evaluating"
                    ? "Evaluating…"
                    : "Submit for Review"}
                </Button>
                <Button variant="outline" onClick={handleSave} disabled={busy} className="w-full">
                  {phase === "saving" ? "Saving…" : "Save Draft"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {dirty
                    ? "Unsaved changes."
                    : savedAt
                      ? `Draft saved at ${savedAt}.`
                      : "Submitting saves your design before the review runs."}
                </p>
                {tier && (
                  <p className="text-xs text-muted-foreground">
                    Your design will be reviewed by:{" "}
                    <span className="text-foreground">{tier.label}</span>
                    {tier.type === "RULE_BASED" &&
                      " — no AI is configured, so scores reflect structure only, not design quality."}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Submitted{" "}
                {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : ""}
              </p>
            )}
          </Panel>
        </aside>
      </div>
    </main>
  );
}
