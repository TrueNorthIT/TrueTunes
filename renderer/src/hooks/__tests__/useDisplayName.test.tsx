import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import {
  displayNameKeys,
  displayNameQueryOptions,
  refreshDisplayName,
  renameUser,
  setDisplayName,
  useDisplayName,
  useDisplayNameActions,
} from '../useDisplayName';
import { runQueryFn } from '../../test/queryFn';

const mockGet = vi.mocked(window.sonos.getDisplayName);
const mockRename = vi.mocked(window.sonos.renameUser);

beforeEach(() => {
  vi.resetAllMocks();
});

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('displayNameQueryOptions', () => {
  it('returns the name from the main process', async () => {
    mockGet.mockResolvedValueOnce('Joe');
    expect(await runQueryFn(displayNameQueryOptions())).toBe('Joe');
  });

  it('returns null when signed out', async () => {
    mockGet.mockResolvedValueOnce(null);
    expect(await runQueryFn(displayNameQueryOptions())).toBeNull();
  });

  it('returns null rather than throwing when the lookup fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('no ipc'));
    expect(await runQueryFn(displayNameQueryOptions())).toBeNull();
  });
});

describe('useDisplayName', () => {
  it('is undefined until loaded, then the name, and one fetch serves every caller', async () => {
    mockGet.mockResolvedValue('Joe');
    const qc = newClient();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const a = renderHook(() => useDisplayName(), { wrapper });
    const b = renderHook(() => useDisplayName(), { wrapper });
    expect(a.result.current).toBeUndefined();
    await waitFor(() => expect(a.result.current).toBe('Joe'));
    await waitFor(() => expect(b.result.current).toBe('Joe'));
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('updates every reader when the name is renamed', async () => {
    mockGet.mockResolvedValue('Joe');
    mockRename.mockResolvedValue({ ok: true });
    const qc = newClient();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const reader = renderHook(() => useDisplayName(), { wrapper });
    const actions = renderHook(() => useDisplayNameActions(), { wrapper });
    await waitFor(() => expect(reader.result.current).toBe('Joe'));

    let outcome: unknown;
    await act(async () => {
      outcome = await actions.result.current.rename('Joe', 'Joseph');
    });

    expect(outcome).toBeNull();
    expect(mockRename).toHaveBeenCalledWith('Joe', 'Joseph');
    await waitFor(() => expect(reader.result.current).toBe('Joseph'));
  });
});

describe('renameUser', () => {
  it('sets the cached name on success', async () => {
    mockRename.mockResolvedValueOnce({ ok: true });
    const qc = newClient();
    qc.setQueryData(displayNameKeys.all, 'Joe');
    expect(await renameUser(qc, 'Joe', 'Joseph')).toBeNull();
    expect(qc.getQueryData(displayNameKeys.all)).toBe('Joseph');
  });

  it('leaves the cached name alone and returns the error when the server refuses', async () => {
    mockRename.mockResolvedValueOnce({ error: 'taken' });
    const qc = newClient();
    qc.setQueryData(displayNameKeys.all, 'Joe');
    expect(await renameUser(qc, 'Joe', 'Sam')).toEqual({ error: 'taken' });
    expect(qc.getQueryData(displayNameKeys.all)).toBe('Joe');
  });

  it('reports a network failure as an error', async () => {
    mockRename.mockRejectedValueOnce(new Error('offline'));
    const qc = newClient();
    qc.setQueryData(displayNameKeys.all, 'Joe');
    expect(await renameUser(qc, 'Joe', 'Sam')).toEqual({ error: 'network' });
    expect(qc.getQueryData(displayNameKeys.all)).toBe('Joe');
  });

  it('renames from an empty current name when none is known', async () => {
    mockRename.mockResolvedValueOnce({ ok: true });
    await renameUser(newClient(), undefined, 'Sam');
    expect(mockRename).toHaveBeenCalledWith('', 'Sam');
  });
});

describe('sign-out and Entra sign-in', () => {
  it('sign-out clears the name for every reader, and a refresh then re-reads it', async () => {
    mockGet.mockResolvedValueOnce('Joe').mockResolvedValueOnce('Sam');
    const qc = newClient();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const reader = renderHook(() => useDisplayName(), { wrapper });
    await waitFor(() => expect(reader.result.current).toBe('Joe'));

    act(() => setDisplayName(qc, null));
    await waitFor(() => expect(reader.result.current).toBeNull());

    await act(async () => {
      await refreshDisplayName(qc);
    });
    await waitFor(() => expect(reader.result.current).toBe('Sam'));
  });

  it('onEntraReady-style refresh marks the cached name stale', async () => {
    const qc = newClient();
    qc.setQueryData(displayNameKeys.all, null);
    await refreshDisplayName(qc);
    expect(qc.getQueryState(displayNameKeys.all)?.isInvalidated).toBe(true);
  });
});
