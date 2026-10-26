import { describe, it, expect } from 'vitest';
import { mergeShelves } from '../ytmSections';
import { getItemArt, resolveAlbumParams } from '../itemHelpers';
import type { SonosItem } from '../../types/sonos';

// A Home card as browse returns it: a title, its artwork and a short-lived container id.
const card = (title: string, id: string, art = `art-${title}`): SonosItem =>
  ({
    title,
    images: { tile1x1: art },
    resource: { type: 'CONTAINER', id: { objectId: id, serviceId: 'svc', accountId: 'acc' }, defaults: `def-${id}` },
  }) as unknown as SonosItem;
const ids = (items: SonosItem[]) => items.map((i) => resolveAlbumParams(i).albumId);
const titles = (items: SonosItem[]) => items.map((i) => i.title);

describe('mergeShelves', () => {
  it('keeps every card in its place and swaps in the fresh id, even when the fresh load is in another order', () => {
    const shown = [card('Quick picks', 'qp-1'), card('Albums for you', 'al-1'), card('New releases', 'nr-1')];
    const fresh = [card('New releases', 'nr-2'), card('Quick picks', 'qp-2'), card('Albums for you', 'al-2')];
    const merged = mergeShelves(shown, fresh);
    expect(titles(merged)).toEqual(['Quick picks', 'Albums for you', 'New releases']);
    expect(ids(merged)).toEqual(['qp-2', 'al-2', 'nr-2']);
    // The fresh card's defaults come with it: the BFF needs them to fill the shelf.
    expect(resolveAlbumParams(merged[0]).defaults).toBe('def-qp-2');
  });

  it('keeps a card that dropped off Home where it was (it goes at the next refresh, not now)', () => {
    const shown = [card('Quick picks', 'qp-1'), card('Mixed for you: chill', 'mx-1'), card('New releases', 'nr-1')];
    const fresh = [card('Quick picks', 'qp-2'), card('New releases', 'nr-2')];
    const merged = mergeShelves(shown, fresh);
    expect(titles(merged)).toEqual(['Quick picks', 'Mixed for you: chill', 'New releases']);
    expect(ids(merged)).toEqual(['qp-2', 'mx-1', 'nr-2']); // the dead card keeps its old id
  });

  it('adds new shelves after everything already on screen', () => {
    const shown = [card('Quick picks', 'qp-1'), card('New releases', 'nr-1')];
    const fresh = [card('Long listens', 'll-2'), card('New releases', 'nr-2'), card('Quick picks', 'qp-2')];
    expect(titles(mergeShelves(shown, fresh))).toEqual(['Quick picks', 'New releases', 'Long listens']);
  });

  it('tells same-titled shelves apart by their artwork', () => {
    const shown = [
      card('Top songs', 'a-1', 'art-a'),
      card('Top songs', 'b-1', 'art-b'),
      card('Top songs', 'c-1', 'art-c'),
    ];
    const fresh = [
      card('Top songs', 'c-2', 'art-c'),
      card('Top songs', 'a-2', 'art-a'),
      card('Top songs', 'b-2', 'art-b'),
    ];
    const merged = mergeShelves(shown, fresh);
    expect(ids(merged)).toEqual(['a-2', 'b-2', 'c-2']);
    expect(merged.map(getItemArt)).toEqual(['art-a', 'art-b', 'art-c']);
  });

  it('matches by title alone when the artwork changed (My Supermix borrows its first track’s art)', () => {
    const shown = [card('My Supermix', 'sm-1', 'track-1-art'), card('Quick picks', 'qp-1')];
    const fresh = [card('My Supermix', 'sm-2', 'track-9-art'), card('Quick picks', 'qp-2')];
    const merged = mergeShelves(shown, fresh);
    expect(ids(merged)).toEqual(['sm-2', 'qp-2']);
    expect(getItemArt(merged[0])).toBe('track-9-art');
  });

  it('never gives one fresh card to two cards on screen', () => {
    const shown = [card('Top songs', 'a-1', 'art-a'), card('Top songs', 'b-1', 'art-b')];
    const fresh = [card('Top songs', 'b-2', 'art-b')];
    expect(ids(mergeShelves(shown, fresh))).toEqual(['a-1', 'b-2']); // a has gone: kept, with its old id
  });

  it('shows the fresh load as it is when nothing was on screen', () => {
    const fresh = [card('Quick picks', 'qp-2')];
    expect(mergeShelves([], fresh)).toEqual(fresh);
  });
});
