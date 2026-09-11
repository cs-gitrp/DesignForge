import { Link } from "@tanstack/react-router";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { AttemptStatus, EvaluationStatus } from "@/domain/types";
import { MAX_SCORE } from "@/domain/rubric";

type Variant = "primary" | "outline" | "ghost";

const variantClass: Record<Variant, string> = {
  primary: "btn-primary hover:opacity-90",
  outline: "btn-outline hover:bg-secondary",
  ghost: "btn-ghost hover:text-foreground",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "btn-base",
        variantClass[variant],
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function ButtonLink({
  to,
  params,
  children,
  variant = "primary",
  className,
}: {
  to: string;
  params?: Record<string, string>;
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to={to as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params={params as any}
      className={cn("btn-base", variantClass[variant], className)}
    >
      {children}
    </Link>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("panel p-6", className)}>{children}</section>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="label-mono">{children}</p>;
}

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return (
    <span className="label-mono rounded-full border border-border px-2.5 py-1 tracking-[0.12em]">
      {difficulty}
    </span>
  );
}

const attemptTone: Record<AttemptStatus, string> = {
  DRAFT: "text-muted-foreground border-border",
  SUBMITTED: "text-primary border-primary/40",
  EVALUATING: "text-primary border-primary/40",
  COMPLETED: "text-success border-success/40",
  FAILED: "text-destructive border-destructive/40",
};

const attemptLabel: Record<AttemptStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  EVALUATING: "Evaluating",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export function StatusPill({ status }: { status: AttemptStatus }) {
  return (
    <span
      className={cn(
        "label-mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        attemptTone[status],
      )}
    >
      {(status === "EVALUATING" || status === "SUBMITTED") && (
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      )}
      {attemptLabel[status]}
    </span>
  );
}

export function EvaluationStatusText({ status }: { status: EvaluationStatus }) {
  const copy: Record<EvaluationStatus, string> = {
    PENDING: "Queued for review",
    RUNNING: "Review in progress",
    COMPLETED: "Review complete",
    FAILED: "Review failed",
  };
  return <span>{copy[status]}</span>;
}

export function ScoreMeter({ score, label }: { score: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, (score / MAX_SCORE) * 100));
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">{label}</span>
          <span className="font-mono text-sm text-muted-foreground">
            {score.toFixed(1)}/{MAX_SCORE}
          </span>
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "error" | "success";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: "border-primary/30 bg-primary/5",
    error: "border-destructive/40 bg-destructive/5",
    success: "border-success/30 bg-success/5",
  } as const;
  return (
    <div className={cn("rounded-lg border p-4 text-sm", tones[tone])}>
      {title && <p className="mb-1 font-medium">{title}</p>}
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}
