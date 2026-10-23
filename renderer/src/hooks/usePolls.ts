import { useCallback, useMemo, useState } from 'react';
import { queryOptions, useQuery } from '@tanstack/react-query';

// Weekly anonymous poll (P-2, P-3, P-4, P-6).
// "Answered" lives only in localStorage under `poll-answered:<pollId>` and stores no choice;
// the answer request is exactly { pollId, choice } and nothing here emits telemetry.

const answeredKey = (pollId: string) => `poll-answered:${pollId}`;

function isAnswered(pollId: string): boolean {
  try {
    return localStorage.getItem(answeredKey(pollId)) !== null;
  } catch {
    return false;
  }
}

function markAnswered(pollId: string): void {
  try {
    localStorage.setItem(answeredKey(pollId), '1');
  } catch {
    // Storage unavailable: the poll will simply be offered again next launch.
  }
}

export const pollKeys = {
  all: ['polls'] as const,
  admin: ['poll-admin'] as const,
};

export function pollsQueryOptions() {
  return queryOptions({
    queryKey: pollKeys.all,
    queryFn: async (): Promise<PollLive[]> => {
      const res = await window.sonos.fetchPolls();
      if ('error' in res) throw new Error(res.error);
      return res.polls;
    },
    // A new poll goes live on Monday morning while the app may already be open.
    refetchInterval: 30 * 60_000,
    retry: false,
  });
}

export function usePolls() {
  const { data } = useQuery(pollsQueryOptions());
  const [answeredNow, setAnsweredNow] = useState<ReadonlySet<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Unanswered live polls, oldest first. */
  const waiting = useMemo(
    () =>
      (data ?? [])
        .filter((p) => !answeredNow.has(p.id) && !isAnswered(p.id))
        .sort((a, b) => a.liveFrom.localeCompare(b.liveFrom)),
    [data, answeredNow]
  );
  const current = waiting[0] as PollLive | undefined;

  const answer = useCallback(
    async (choice: number) => {
      if (!current || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await window.sonos.answerPoll({ pollId: current.id, choice });
        if ('error' in res) {
          setError('Could not send your answer. Please try again.');
          return;
        }
        markAnswered(current.id);
        setAnsweredNow((prev) => new Set(prev).add(current.id));
      } catch {
        setError('Could not send your answer. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [current, submitting]
  );

  return { current, remaining: waiting.length, submitting, error, answer };
}
