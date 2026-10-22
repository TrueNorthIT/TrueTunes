import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useContainerBrowse } from '../hooks/useContainerBrowse';
import { useOpenItem } from '../hooks/useOpenItem';
import { useResolveAndOpen } from '../hooks/useResolveAndOpen';
import { albumQueryOptions } from '../hooks/useAlbumBrowse';
import { fmtTime, getItemArt, getName, getSub, isAlbum, resolveAlbumParams } from '../lib/itemHelpers';
import { artistItemOf, containerSummary, groupContainerItems, KIND_COPY, type ContainerGroup } from '../lib/containerItems';
import { ImageTile } from './common/ImageTile';
import { PillButton } from './common/PillButton';
import { SectionCard } from './common/SectionCard';
import { TrackRow } from './common/TrackRow';
import { ArtistLinks } from './common/TrackLinks';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/ContainerPanel.module.css';

interface Props {
  onAddToQueue: (item: SonosItem) => void;
}

const SKELETON_TILES = 12;

/**
 * A music service shelf opened in full (a For you section on Home: "Quick picks", "Albums for you", an
 * artist's mix). Songs are a list, everything else is a grid of tiles, one section per kind.
 */
export function ContainerPanel({ onAddToQueue }: Props) {
  const { state } = useLocation();
  const item = (state as { item?: SonosItem } | null)?.item;
  const openItem = useOpenItem();
  const { resolveAndOpen } = useResolveAndOpen();
  const queryClient = useQueryClient();

  const { albumId: containerId, serviceId, accountId, defaults } = item
    ? resolveAlbumParams(item)
    : { albumId: undefined, serviceId: undefined, accountId: undefined, defaults: undefined };

  const { data, isLoading, error, refetch } = useContainerBrowse(containerId, serviceId, accountId, defaults);

  if (!item) return null;

  const title = getName(item);
  const groups = data ? groupContainerItems(data) : [];

  const prefetchAlbum = (album: SonosItem) => {
    const p = resolveAlbumParams(album);
    if (p.albumId && p.serviceId && p.accountId)
      void queryClient.prefetchQuery(albumQueryOptions(p.albumId, p.serviceId, p.accountId, p.defaults));
  };

  const openArtist = (track: SonosItem, name: string) => {
    const a = (track.artists ?? []).find((x) => x.name === name);
    const artist = a ? artistItemOf(a) : null;
    if (artist) openItem(artist);
    else void resolveAndOpen(name, 'artist');
  };

  const songRow = (t: SonosItem, i: number) => {
    const name = getName(t);
    const artist = (t.artists ?? []).map((a) => a.name).join(', ') || getSub(t);
    const secs = Number((t as { duration?: unknown }).duration);
    return (
      <TrackRow
        key={`${name}-${i}`}
        title={name}
        artists={artist ? <ArtistLinks artist={artist} onOpenArtist={(n) => openArtist(t, n)} /> : undefined}
        imageUrl={getItemArt(t)}
        explicit={!!(t.isExplicit ?? t.explicit)}
        trailing={secs > 0 ? fmtTime(secs * 1000) : undefined}
        // Browse tracks carry no album id: find the album by title and artist, as Home's trending rows do.
        onOpen={() => void resolveAndOpen(name, 'album', { artist: artist || undefined, serviceId, accountId })}
        onAdd={() => onAddToQueue(t)}
      />
    );
  };

  const tile = (child: SonosItem, kind: ContainerGroup['kind'], i: number) => {
    const name = getName(child);
    const key = `${resolveAlbumParams(child).albumId ?? name}-${i}`;
    // A station opens as its track list, where songs can be added one at a time. No + here: starting a
    // station replaces the whole shared queue, which a one-click + must never do.
    if (kind === 'stations') {
      return <ImageTile key={key} title={name} imageUrl={getItemArt(child)} onOpen={() => openItem(child)} />;
    }
    return (
      <ImageTile
        key={key}
        title={name}
        sub={getSub(child) || null}
        imageUrl={getItemArt(child)}
        circular={kind === 'artists'}
        onOpen={() => openItem(child)}
        onHover={isAlbum(child) ? () => prefetchAlbum(child) : undefined}
        onAdd={kind === 'albums' || kind === 'playlists' ? () => onAddToQueue(child) : undefined}
      />
    );
  };

  return (
    <div className={styles.panel}>
      <div className={`page-scale ${styles.page}`}>
        <header className={styles.head}>
          <h1 className={styles.title}>{title}</h1>
          {groups.length > 0 && <p className={styles.sub}>{containerSummary(groups)}</p>}
        </header>

        {isLoading ? (
          <div className={styles.grid} aria-busy="true" aria-label="Loading">
            {Array.from({ length: SKELETON_TILES }).map((_, i) => (
              <div key={i} className={styles.skelTile}>
                <span className={`skeleton ${styles.skelArt}`} style={{ animationDelay: `${(i % 6) * 0.08}s` }} />
                <span className={`skeleton ${styles.skelLine}`} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className={styles.msg}>
            <p>Couldn’t load {title}. The music service may be busy.</p>
            <PillButton onClick={() => void refetch()}>Retry</PillButton>
          </div>
        ) : groups.length === 0 ? (
          <p className={styles.msg}>Nothing here right now.</p>
        ) : (
          <div className={styles.sections}>
            {groups.map((g) => (
              <SectionCard key={g.kind} title={groups.length > 1 ? KIND_COPY[g.kind].title : undefined}>
                {g.kind === 'songs' ? (
                  <ul className={styles.songs} data-rows-wrap="">{g.items.map(songRow)}</ul>
                ) : (
                  <div className={styles.grid}>{g.items.map((c, i) => tile(c, g.kind, i))}</div>
                )}
              </SectionCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
