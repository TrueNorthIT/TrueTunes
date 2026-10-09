import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOpenItem } from '../useOpenItem';
import type { SonosItem } from '../../types/sonos';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

function setup() {
  const { result } = renderHook(() => useOpenItem());
  return result.current;
}

describe('useOpenItem', () => {
  it('navigates to /artist/:id for an artist item', () => {
    const open = setup();
    const item: SonosItem = {
      type: 'ARTIST',
      resource: { type: 'ARTIST', id: { objectId: 'art-1', serviceId: 'svc' } },
    };
    open(item);
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringMatching(/^\/artist\//),
      expect.objectContaining({ state: { item } })
    );
  });

  it('navigates to /container/:id for a container item', () => {
    const open = setup();
    const item: SonosItem = {
      type: 'ITEM_PROGRAM',
      resource: { type: 'CONTAINER', id: { objectId: 'cont-1' } },
    };
    open(item);
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringMatching(/^\/container\//),
      expect.objectContaining({ state: { item } })
    );
  });

  it('navigates to /album/:id for an album item', () => {
    const open = setup();
    const item: SonosItem = {
      type: 'ITEM_ALBUM',
      resource: { type: 'ALBUM', id: { objectId: 'alb-1', serviceId: 'svc' } },
    };
    open(item);
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringMatching(/^\/album\//),
      expect.objectContaining({ state: { item } })
    );
  });

  it('falls back to _ when albumId is null', () => {
    const open = setup();
    const item: SonosItem = { type: 'ITEM_ALBUM' };
    open(item);
    expect(mockNavigate).toHaveBeenCalledWith(
      '/album/_',
      expect.anything()
    );
  });
});
