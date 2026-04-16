import { useQuery } from '@tanstack/react-query';
import { useImage } from '../hooks/useImage';
import { useDominantColor } from '../hooks/useDominantColor';
import { artistQueryOptions } from '../hooks/useArtistBrowse';
import { resolveArtistParams, getItemArt, fmtDuration } from '../lib/itemHelpers';
import { ExplicitBadge } from './ExplicitBadge';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/HomePanel.module.css';

function HeroTrackRow({
  track,
  index,
  onAdd,
}: {
  track: {
    title: string;
    durationSeconds: number;
    artUrl: string | null;
    explicit: boolean;
    raw: SonosItem;
  };
  index: number;
  onAdd: () => void;
}) {
  const art = useImage(track.artUrl);
  return (
    <div className={styles.heroTrackRow}>
      <span className={styles.heroTrackNum}>{index + 1}</span>
      <div className={styles.heroTrackArt}>
        {art ? <img src={art} alt="" /> : <div className={styles.heroTrackArtPh} />}
      </div>
      <div className={styles.heroTrackInfo}>
        <span className={styles.heroTrackName}>
          {track.title}
          {track.explicit && (
            <span className={styles.heroTrackExplicit}>
              <ExplicitBadge />
            </span>
          )}
        </span>
      </div>
      <span className={styles.heroTrackDur}>{fmtDuration(track.durationSeconds)}</span>
      <button
        className={styles.heroTrackAdd}
        onClick={(e) => { e.stopPropagation(); onAdd(); }}
      >
        +
      </button>
    </div>
  );
}

export function ArtistHero({
  artist,
  onAddToQueue,
  onOpen,
}: {
  artist: SonosItem;
  onAddToQueue: (item: SonosItem) => void;
  onOpen: (item: SonosItem) => void;
}) {
  const { artistId, serviceId, accountId, defaults } = resolveArtistParams(artist);
  const { data } = useQuery({
    ...artistQueryOptions(artistId, serviceId, accountId, defaults),
    enabled: !!(artistId && serviceId && accountId),
  });

  const cachedArt     = useImage(getItemArt(artist));
  const dominantColor = useDominantColor(cachedArt);
  const name          = (artist.title ?? artist.name ?? '') as string;

  return (
    <div
      className={styles.artistHero}
      style={dominantColor
        ? { background: `linear-gradient(135deg, rgba(${dominantColor},0.18) 0%, transparent 70%)` }
        : undefined}
    >
      <div className={styles.heroLeft}>
        <div className={styles.heroAvatar}>
          {cachedArt
            ? <img src={cachedArt} alt="" className={styles.heroAvatarImg} />
            : <div className={styles.heroAvatarPh} />}
        </div>
        <div className={styles.heroMeta}>
          <div className={styles.heroLabel}>Artist</div>
          <div className={styles.heroName}>{name}</div>
          <button className={styles.heroOpenBtn} onClick={() => onOpen(artist)}>
            Open Artist
          </button>
        </div>
      </div>

      <div className={styles.heroTracks}>
        {data?.topSongs?.length
          ? data.topSongs.slice(0, 6).map((track, i) => (
              <HeroTrackRow
                key={track.id?.objectId ?? i}
                track={track}
                index={i}
                onAdd={() => onAddToQueue(track.raw)}
              />
            ))
          : Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={styles.heroTrackPh} />
            ))}
      </div>
    </div>
  );
}
