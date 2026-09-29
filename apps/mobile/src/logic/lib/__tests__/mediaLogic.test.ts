import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  albumRouteForItem,
  artistRouteForItem,
  makeNavigate,
  routeForItem,
  routeForPlaylist,
} from '../../../ui/media/routes';
import { actionsForItem, shapeSearchSections, toPlaylistTrack } from '../../../ui/media/itemLogic';
import { useDebouncedValue } from '../../../ui/media/useDebouncedValue';
import { fetchYtmSections } from '../ytmSections';
import type { SonosItem } from '../../types/sonos';

const album: SonosItem = {
  type: 'ALBUM',
  name: 'Rebel Heart',
  resource: { type: 'ALBUM', id: { objectId: 'alb/1', serviceId: 's1', accountId: 'sn_a1' } },
};
const track: SonosItem = {
  type: 'TRACK',
  name: 'Song',
  artists: [{ name: 'Band', id: { objectId: 'art1', serviceId: 's1', accountId: 'sn_a1' } }],
  album: { name: 'LP', id: { objectId: 'alb2', serviceId: 's1', accountId: 'sn_a1' } },
  id: { objectId: 'trk1', serviceId: 's1', accountId: 'a1' },
};

describe('routes', () => {
  it('routes albums with encoded id and stripped sn_ account', () => {
    expect(routeForItem(album)).toBe('/album/alb%2F1?serviceId=s1&accountId=a1&name=Rebel%20Heart');
  });
  it('routes artists and containers', () => {
    expect(routeForItem({ type: 'ARTIST', name: 'X', resource: { type: 'ARTIST', id: { objectId: 'a', serviceId: 's' } } })).toBe('/artist/a?serviceId=s&name=X');
    expect(routeForItem({ type: 'ITEM_AUDIO', name: 'C', resource: { type: 'ITEM_AUDIO', id: { objectId: 'c' } } })).toMatch(/^\/container\/c/);
  });
  it('returns null without an id', () => {
    expect(routeForItem({ type: 'ALBUM', name: 'x' })).toBeNull();
  });
  it('derives album/artist routes from a track', () => {
    expect(albumRouteForItem(track)).toBe('/album/alb2?serviceId=s1&accountId=a1&name=LP');
    expect(artistRouteForItem(track)).toBe('/artist/art1?serviceId=s1&accountId=a1&name=Band');
  });
  it('playlist route', () => expect(routeForPlaylist('fav-me')).toBe('/playlist/fav-me'));
  it('makeNavigate rebuilds the href from the item', () => {
    const push = vi.fn();
    makeNavigate(push)('/album/alb%2F1', { state: { item: album } });
    expect(push).toHaveBeenCalledWith(routeForItem(album));
    makeNavigate(push)('/x');
    expect(push).toHaveBeenLastCalledWith('/x');
  });
});

describe('itemLogic', () => {
  it('shapes search sections', () => {
    const s = shapeSearchSections([album, track, { type: 'ARTIST', name: 'A' }, { type: 'PLAYLIST', name: 'P' }, { type: 'PODCAST', name: 'Q' }]);
    expect([s.albums.length, s.tracks.length, s.artists.length, s.playlists.length, s.others.length]).toEqual([1, 1, 1, 1, 1]);
  });
  it('builds a playlist track', () => {
    expect(toPlaylistTrack(track, 'me')).toMatchObject({ uri: 'trk1', trackName: 'Song', artist: 'Band', albumName: 'LP', addedBy: 'me' });
  });
  it('picks actions per item kind', () => {
    const ctx = { hasAlbumRoute: true, hasArtistRoute: true, canPlaylist: true };
    expect(actionsForItem(track, ctx)).toEqual(['playNext', 'addToQueue', 'goToAlbum', 'goToArtist', 'favourite', 'addToPlaylist']);
    expect(actionsForItem(album, ctx)).toEqual(['playNext', 'addToQueue', 'goToArtist']);
  });
});

describe('useDebouncedValue', () => {
  it('only updates after the delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), { initialProps: { v: 'a' } });
    rerender({ v: 'ab' });
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe('ab');
    vi.useRealTimers();
  });
});

describe('fetchYtmSections', () => {
  const mockFetch = vi.fn();
  beforeEach(() => {
    mockFetch.mockReset();
    (window as unknown as { sonos: unknown }).sonos = { fetch: mockFetch };
  });
  const entry = (title: string, id: string): SonosItem => ({ title, resource: { type: 'CONTAINER', id: { objectId: id, serviceId: 's', accountId: 'a' } } });

  it('returns empty on root error', async () => {
    mockFetch.mockResolvedValueOnce({ error: 'boom' });
    expect(await fetchYtmSections()).toEqual({ forYou: [], newReleases: [], charts: [] });
  });
  it('browses Home/New releases/Charts and prepends Supermix', async () => {
    const root = { sections: { items: [{ items: [entry('Home', 'h'), entry('New releases', 'n'), entry('Charts', 'c'), entry('My Supermix', 'm')] }] } };
    mockFetch.mockImplementation(async (req: { pathParams?: { containerId?: string } }) => {
      const id = req.pathParams?.containerId;
      if (id === 'root') return { data: root };
      return { data: { items: [{ title: `item-${id}` }] } };
    });
    const r = await fetchYtmSections();
    expect(r.forYou.map((i) => i.title)).toEqual(['My Supermix', 'item-h']);
    expect(r.newReleases[0].title).toBe('item-n');
    expect(r.charts[0].title).toBe('item-c');
  });

  it('falls back to the shelves inside Home when the root has no New releases / Charts', async () => {
    const root = { sections: { items: [{ items: [entry('Home', 'h'), entry('Library', 'l'), entry('My Supermix', 'm')] }] } };
    const homeChildren = [entry('Quick picks', 'qp'), entry('New releases', 'nr'), entry('Top songs', 'ts'), entry('Top songs', 'ts2')];
    mockFetch.mockImplementation(async (req: { pathParams?: { containerId?: string } }) => {
      const id = req.pathParams?.containerId;
      if (id === 'root') return { data: root };
      if (id === 'h') return { data: { items: homeChildren } };
      return { data: { items: [{ title: `item-${id}` }] } };
    });
    const r = await fetchYtmSections();
    expect(r.newReleases.map((i) => i.title)).toEqual(['item-nr']);
    expect(r.charts.map((i) => i.title)).toEqual(['item-ts']); // the first 'Top songs' shelf
    expect(r.forYou.map((i) => i.title)).toEqual(['My Supermix', 'Quick picks', 'New releases', 'Top songs', 'Top songs']);
  });

  it('prefers the root entries when they exist', async () => {
    const root = { sections: { items: [{ items: [entry('Home', 'h'), entry('New releases', 'rootnr'), entry('Charts', 'rootc')] }] } };
    mockFetch.mockImplementation(async (req: { pathParams?: { containerId?: string } }) => {
      const id = req.pathParams?.containerId;
      if (id === 'root') return { data: root };
      if (id === 'h') return { data: { items: [entry('New releases', 'homenr'), entry('Top songs', 'homets')] } };
      return { data: { items: [{ title: `item-${id}` }] } };
    });
    const r = await fetchYtmSections();
    expect(r.newReleases[0].title).toBe('item-rootnr');
    expect(r.charts[0].title).toBe('item-rootc');
  });
});
