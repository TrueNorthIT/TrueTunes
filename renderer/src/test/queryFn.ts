import { QueryClient, type QueryFunction, type SkipToken } from '@tanstack/react-query';

/**
 * Run a query-options factory's queryFn in a test, with an empty context.
 * queryOptions() types queryFn as optional with a required context argument, so
 * `opts.queryFn()` no longer typechecks; use `runQueryFn(opts)` instead.
 */
export function runQueryFn<TData>(opts: {
  queryFn?: QueryFunction<TData, never> | SkipToken | QueryFunction<TData, readonly unknown[]>;
}): Promise<TData> {
  const fn = opts.queryFn;
  if (typeof fn !== 'function') throw new Error('queryFn is not a function');
  const context = { queryKey: [], signal: new AbortController().signal, meta: undefined, client: new QueryClient() };
  return Promise.resolve((fn as (c: typeof context) => TData | Promise<TData>)(context));
}
