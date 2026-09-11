import { queryOptions } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";

import { getProblem, getWorkspace, listHistory, listProblems } from "./practice.functions";

/**
 * A missing row is a routing concern, not a crash: reads resolve to null, which
 * must become a router notFound() so the route's notFoundComponent renders
 * instead of the error boundary blanking the page.
 */
async function mapMissing<T>(load: () => Promise<T | null>): Promise<T> {
  try {
    const result = await load();
    if (result === null || result === undefined) throw notFound();
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string } | null)?.code;
    if (code === "NOT_FOUND" || /not found/i.test(message)) throw notFound();
    throw error;
  }
}

export const problemsQuery = () =>
  queryOptions({ queryKey: ["problems"], queryFn: () => listProblems() });

export const problemQuery = (id: string) =>
  queryOptions({
    queryKey: ["problem", id],
    queryFn: () => mapMissing(() => getProblem({ data: { id } })),
    retry: false,
  });

export const workspaceQuery = (id: string) =>
  queryOptions({
    queryKey: ["workspace", id],
    queryFn: () => mapMissing(() => getWorkspace({ data: { id } })),
    staleTime: 0,
    retry: false,
  });

export const historyQuery = () =>
  queryOptions({ queryKey: ["history"], queryFn: () => listHistory() });
