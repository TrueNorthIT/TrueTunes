import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useImage } from '../../hooks/useImage';
import { useArtistBrowse } from '../../hooks/useArtistBrowse';
import { useDominantColor } from '../../hooks/useDominantColor';
import { useOpenItem } from '../../hooks/useOpenItem';
import { resolveArtistParams } from '../../lib/itemHelpers';
import { TopSongRow } from './TopSongRow';
import { LatestReleaseCard } from './LatestReleaseCard';
import { RadioCard } from './RadioCard';
import { ArtistAlbumCard } from './ArtistAlbumCard';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/ArtistPanel.module.css';

interface Props {
  onAddToQueue: (item: SonosItem) => void;
}

export function ArtistPanel({ onAddToQueue }: Props) {
  const { state } = useLocation();
  const item = (state as { item?: SonosItem } | null)?.item;
  const openItem = useOpenItem();

  const { artistId, serviceId, accountId, defaults, name: fallbackName } =
    item ? resolveArtistParams(item) : { artistId: undefined, serviceId: undefined, accountId: undefined, defaults: undefined, name: undefined };

  const { data, isLoading } = useArtistBrowse(artistId, serviceId, accountId, defaults);

  const name = data?.name ?? fallbackName ?? item?.title ?? item?.name ?? '';
  const imageUrl =
    data?.imageUrl ??
    (item?.images as Record<string, string> | undefined)?.['tile1x1'] ??
    item?.imageUrl ??
    null;

  const [showAllSongs, setShowAllSongs] = useState(false);

  const cachedArt     = useImage(imageUrl);
  const dominantColor = useDominantColor(cachedArt);

  const artistRadio = data?.playlists.find(p => (p.title as string)?.toLowerCase().includes('radio'));
  const latestAlbum = data?.albums[0] ?? null;

  if (!item) return null;

  return (
    <div className={styles.panel}>
      <div
        key={artistId}
        className={styles.header}
        style={
          dominantColor
            ? { background: `linear-gradient(180deg, rgba(${dominantColor},0.55) 0%, rgba(${dominantColor},0.2) 60%, transparent 100%)`, transition: 'background 0.8s ease' }
            : undefined
        }
      >
        <div className={styles.headerRow}>
          <div className={styles.headerArtWrap}>
            {cachedArt
              ? <img className={styles.headerArt} src={cachedArt} alt="" />
              : <div className={styles.headerArtPh} />}
          </div>
          <div className={styles.headerInfo}>
            <div className={styles.artistName}>{name}</div>
          </div>
        </div>
      </div>

      <div className={styles.mainGrid}>
        {isLoading ? (
          <>
            <div className={styles.topSongsCol}>
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className={styles.skeletonRow} />)}
            </div>
            <div className={styles.sideCol}>
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
            </div>
          </>
        ) : (
          <>
            <div className={styles.topSongsCol}>
              {data && data.topSongs.length > 0 && (
                <>
                  <button className={styles.sectionTitleBtn} onClick={() => setShowAllSongs(s => !s)}>
                    Top Songs <span className={styles.sectionChevron}>{showAllSongs ? '∨' : '›'}</span>
                  </button>
                  {(showAllSongs ? data.topSongs : data.topSongs.slice(0, 10)).map((track, i) => (
                    <TopSongRow key={track.id.objectId ?? i} track={track} index={i} onAdd={onAddToQueue} />
                  ))}
                </>
              )}
            </div>
            <div className={styles.sideCol}>
              {latestAlbum && <LatestReleaseCard album={latestAlbum} onOpen={openItem} />}
              {artistRadio && <RadioCard item={artistRadio} artUrl={cachedArt} onOpen={openItem} />}
            </div>
          </>
        )}
      </div>

      {data && data.albums.length > 1 && (
        <div className={styles.albumsSection}>
          <div className={styles.sectionTitle}>Albums</div>
          <div className={styles.albumsRow}>
            {data.albums.map(album => (
              <ArtistAlbumCard
                key={(typeof album.id === 'string' ? album.id : album.id?.objectId) ?? album.title}
                album={album}
                onOpen={openItem}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
