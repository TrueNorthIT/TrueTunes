import { useState } from 'react';
import { api } from '../lib/sonosApi';
import { getName, isAlbum, isArtist, parseServiceSearch, splitArtists } from '../lib/itemHelpers';
import type { ServiceSearch } from '../types/ServiceSearch';
import type { SonosArtist, SonosItem } from '../types/sonos';
import { useOpenItem } from './useOpenItem';

type Target = 'artist' | 'album';

interface ResolveOpts {
  /** Artist hint used to disambiguate same-named albums by different artists. */
  artist?: string;
  /** Scope the Sonos search to this service+account; helps when the artist lives on YT Music etc. */
  serviceId?: string;
  accountId?: string;
}

function itemArtistNames(item: SonosItem): string[] {
  const arr = (item.artists ?? []) as SonosArtist[];
  return arr.map((a) => a.name?.toLowerCase() ?? '').filter(Boolean);
}

export function useResolveAndOpen() {
  const openItem = useOpenItem();
  const [pending, setPending] = useState<string | null>(null);

  async function resolveAndOpen(query: string, target: Target, opts?: ResolveOpts) {
    if (!query) return;
    const key = `${target}:${query}:${opts?.artist ?? ''}`;
    if (pending === key) return;
    setPending(key);
    try {
      const searchQ = target === 'album' && opts?.artist ? `${query} ${opts.artist}` : query;
      const r = await api.search.serviceQuery(searchQ, {
        count: 20,
        serviceId: opts?.serviceId,
        accountId: opts?.accountId,
      });
      if (r.error) return;
      const items = parseServiceSearch(r.data as ServiceSearch);
      const filter = target === 'artist' ? isArtist : isAlbum;
      const candidates = items.filter(filter);

      const lowerName = query.toLowerCase();
      // The hint may be a joined multi-artist string ("Sonny Stitt, Kenny Garrett");
      // candidates list artists individually, so match against each split name.
      const hintArtists = opts?.artist ? splitArtists(opts.artist.toLowerCase()) : [];
      const nameMatches = candidates.filter((c) => getName(c).toLowerCase() === lowerName);

      // For albums with an artist hint, require the artist to match — otherwise we'd
      // happily land on a same-named album/single by a different artist.
      let match: SonosItem | undefined;
      if (target === 'album' && hintArtists.length > 0) {
        const matchesHint = (c: SonosItem) =>
          itemArtistNames(c).some((n) => hintArtists.includes(n));
        match = nameMatches.find(matchesHint) ?? candidates.find(matchesHint);
      } else if (target === 'artist' && lowerName) {
        match = nameMatches[0] ?? candidates[0];
      } else {
        match = nameMatches[0] ?? candidates[0];
      }

      if (match) openItem(match);
    } finally {
      setPending(null);
    }
  }

  return { resolveAndOpen, pending };
}
