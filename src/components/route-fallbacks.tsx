import { useRouter } from "@tanstack/react-router";

import { ButtonLink, EmptyState } from "@/components/ui-kit";

/** Shown when an attempt or problem no longer exists. */
export function MissingRecord({
  title = "This attempt is no longer available",
  body = "It may have been removed. Your other attempts are still in your history.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <div className="mx-auto mt-16 max-w-xl">
      <EmptyState
        title={title}
        body={body}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <ButtonLink to="/">Browse problems</ButtonLink>
            <ButtonLink to="/history" variant="outline">
              View history
            </ButtonLink>
          </div>
        }
      />
    </div>
  );
}

/** Shown when loading an attempt or problem failed for any other reason. */
export function LoadFailed({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  console.error(error);

  return (
    <div className="mx-auto mt-16 max-w-xl">
      <EmptyState
        title="This page didn't load"
        body="Something went wrong while loading this page. You can try again or head back to the problems."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                router.invalidate();
                reset();
              }}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Try again
            </button>
            <ButtonLink to="/" variant="outline">
              Browse problems
            </ButtonLink>
          </div>
        }
      />
    </div>
  );
}
