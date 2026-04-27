import { useState } from 'react';
import { api } from '../lib/sonosApi';
import { getName, isAlbum, isArtist, parseServiceSearch } from '../lib/itemHelpers';
import type { ServiceSearch } from '../types/ServiceSearch';
import type { SonosArtist, SonosItem } from '../types/sonos';
import { useOpenItem } from './useOpenItem';

type Target = 'artist' | 'album';

interface ResolveOpts {
  /** Artist hint used to disambiguate same-named albums by different artists. */
  artist?: string;
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
      const r = await api.search.serviceQuery(searchQ, { count: 20 });
      if (r.error) return;
      const items = parseServiceSearch(r.data as ServiceSearch);
      const filter = target === 'artist' ? isArtist : isAlbum;
      const candidates = items.filter(filter);

      const lowerName = query.toLowerCase();
      const lowerArtist = opts?.artist?.toLowerCase();
      const nameMatches = candidates.filter((c) => getName(c).toLowerCase() === lowerName);

      // For albums with an artist hint, require the artist to match — otherwise we'd
      // happily land on a same-named album/single by a different artist.
      let match: SonosItem | undefined;
      if (target === 'album' && lowerArtist) {
        match = nameMatches.find((c) => itemArtistNames(c).includes(lowerArtist))
          ?? candidates.find((c) => itemArtistNames(c).includes(lowerArtist));
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
