import { useLocation } from 'react-router-dom';
import { useImage } from '../hooks/useImage';
import { useContainerBrowse } from '../hooks/useContainerBrowse';
import { useOpenItem } from '../hooks/useOpenItem';
import { MediaCard } from './common/MediaCard';
import {
  getName,
  browseSub,
  getItemArt,
  isProgram,
  isTrack,
  resolveAlbumParams,
} from '../lib/itemHelpers';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/ContainerPanel.module.css';

interface Props {
  onAddToQueue: (item: SonosItem) => void;
}

export function ContainerPanel({ onAddToQueue }: Props) {
  const { state } = useLocation();
  const item = (state as { item?: SonosItem } | null)?.item;
  const openItem = useOpenItem();

  const { albumId: containerId, serviceId, accountId, defaults } = item
    ? resolveAlbumParams(item)
    : { albumId: undefined, serviceId: undefined, accountId: undefined, defaults: undefined };

  const { data, isLoading, error } = useContainerBrowse(containerId, serviceId, accountId, defaults);

  const artUrl    = item ? getItemArt(item) : null;
  const cachedArt = useImage(artUrl);
  const title     = (item?.name ?? item?.title ?? '') as string;
  const sub       = (item as Record<string, unknown> | undefined)?.['subtitle'] as string | undefined;

  function openHandler(child: SonosItem) {
    if (isProgram(child)) return onAddToQueue(child);
    if (isTrack(child))   return onAddToQueue(child);
    openItem(child);
  }

  function isOpenable(child: SonosItem): boolean {
    return !isTrack(child) && !isProgram(child);
  }

  if (!item) return null;

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
      {data && data.length === 0 && <div className={styles.msg}>This playlist is empty.</div>}
      {data && data.length > 0 && (
        <div className={styles.grid}>
          {data.map((child, i) => (
            <MediaCard
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
