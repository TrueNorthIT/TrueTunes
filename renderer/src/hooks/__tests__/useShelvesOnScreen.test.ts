import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useShelvesOnScreen } from '../useShelvesOnScreen';
import { resolveAlbumParams } from '../../lib/itemHelpers';
import type { SonosItem } from '../../types/sonos';

const card = (title: string, id: string): SonosItem =>
  ({
    title,
    images: { tile1x1: `art-${title}` },
    resource: { type: 'CONTAINER', id: { objectId: id, serviceId: 'svc', accountId: 'acc' } },
  }) as unknown as SonosItem;
const ids = (items: SonosItem[]) => items.map((i) => resolveAlbumParams(i).albumId);

describe('useShelvesOnScreen', () => {
  const first = [card('Quick picks', 'qp-1'), card('Mixed for you: chill', 'mx-1'), card('New releases', 'nr-1')];
  // A quiet refetch while Home is open: the mix has dropped off Home and the rest come back in a new order.
  const refetched = [card('New releases', 'nr-2'), card('Quick picks', 'qp-2')];

  it('shows the first load as it comes, then merges a refetch in without moving or removing anything', () => {
    const { result, rerender } = renderHook(({ fresh }) => useShelvesOnScreen(fresh), {
      initialProps: { fresh: first as SonosItem[] | undefined },
    });
    expect(ids(result.current)).toEqual(['qp-1', 'mx-1', 'nr-1']);
    rerender({ fresh: refetched });
    expect(ids(result.current)).toEqual(['qp-2', 'mx-1', 'nr-2']);
  });

  it('drops the vanished card at the next natural refresh: the next time Home mounts', () => {
    const { result } = renderHook(() => useShelvesOnScreen(refetched));
    expect(ids(result.current)).toEqual(['nr-2', 'qp-2']);
  });

  it('shows the first load when it arrives after Home mounted', () => {
    const { result, rerender } = renderHook(({ fresh }) => useShelvesOnScreen(fresh), {
      initialProps: { fresh: undefined as SonosItem[] | undefined },
    });
    expect(result.current).toEqual([]);
    rerender({ fresh: refetched });
    expect(ids(result.current)).toEqual(['nr-2', 'qp-2']);
  });
});
