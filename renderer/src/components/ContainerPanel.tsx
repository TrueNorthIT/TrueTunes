import { useImage } from '../hooks/useImage';
import { useContainerBrowse } from '../hooks/useContainerBrowse';
import { TrackCard } from './TrackCard';
import {
  getName,
  browseSub,
  getItemArt,
  isAlbum,
  isPlaylist,
  isArtist,
  isContainer,
  isProgram,
  resolveAlbumParams,
} from '../lib/itemHelpers';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/ContainerPanel.module.css';

interface Props {
  item: SonosItem;
  onAddToQueue: (item: SonosItem) => void;
  onOpenAlbum: (item: SonosItem) => void;
  onOpenArtist: (item: SonosItem) => void;
  onOpenContainer: (item: SonosItem) => void;
}

export function ContainerPanel({ item, onAddToQueue, onOpenAlbum, onOpenArtist, onOpenContainer }: Props) {
  const { albumId: containerId, serviceId, accountId, defaults } = resolveAlbumParams(item);
  const { data, isLoading, error } = useContainerBrowse(containerId, serviceId, accountId, defaults);

  const artUrl = getItemArt(item);
  const cachedArt = useImage(artUrl);
  const title = (item.name ?? item.title ?? '') as string;
  const sub = (item as Record<string, unknown>)['subtitle'] as string | undefined;

  function openHandler(child: SonosItem) {
    if (isArtist(child)) return onOpenArtist(child);
    if (isContainer(child)) return onOpenContainer(child);
    if (isAlbum(child) || isPlaylist(child)) return onOpenAlbum(child);
    if (isProgram(child)) return onAddToQueue(child); // plays via loadContent
    // Tracks — add to queue
    onAddToQueue(child);
  }

  function isOpenable(child: SonosItem): boolean {
    return isAlbum(child) || isPlaylist(child) || isArtist(child) || isContainer(child) || isProgram(child);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.artWrap}>
          {cachedArt ? <img src={cachedArt} alt="" /> : <div className={styles.artPh}>♪</div>}
        </div>
        <div>
          <div className={styles.title}>{title}</div>
          {sub && <div className={styles.sub}>{sub}</div>}
        </div>
      </div>

      {isLoading && (
        <div className={styles.skeleton}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard} />
          ))}
        </div>
      )}
      {error && <div className={styles.msg}>Failed to load.</div>}
      {data && data.length === 0 && <div className={styles.msg}>Nothing here.</div>}
      {data && data.length > 0 && (
        <div className={styles.grid}>
          {data.map((child, i) => (
            <TrackCard
              key={(child.id as Record<string, string> | undefined)?.objectId ?? String(i)}
              name={getName(child)}
              sub={browseSub(child)}
              artUrl={getItemArt(child)}
              onOpen={isOpenable(child) ? () => openHandler(child) : undefined}
              onAdd={() => onAddToQueue(child)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
