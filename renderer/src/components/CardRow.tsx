import { getName, browseSub, getItemArt, isAlbum, isArtist, isPlaylist, isContainer, isProgram } from '../lib/itemHelpers';
import { useArtistImage } from '../hooks/useArtistBrowse';
import { MediaCard } from './common/MediaCard';
import type { SonosItem, SonosItemId } from '../types/sonos';
import styles from '../styles/CardRow.module.css';

// Artist cards used the item's imageUrl, which for leaderboard-derived artists
// is undefined (we no longer seed the artist map with track album-art). Fetch
// the real artist image from the Sonos artist endpoint instead.
function ArtistMediaCard({
  item,
  onOpen,
}: {
  item: SonosItem;
  onOpen: (item: SonosItem) => void;
}) {
  const rid = (item.resource?.id ?? (typeof item.id === 'object' ? item.id : undefined)) as
    | SonosItemId
    | undefined;
  const { data: artistImg } = useArtistImage(
    rid?.objectId,
    rid?.serviceId,
    rid?.accountId,
    item.resource?.defaults as string | undefined,
  );
  return (
    <MediaCard
      name={getName(item)}
      sub={browseSub(item)}
      artUrl={artistImg ?? getItemArt(item)}
      circular
      onOpen={() => onOpen(item)}
    />
  );
}

export function CardRow({
  items,
  isLoading,
  onAdd,
  onOpen,
  cardSize,
}: {
  items: SonosItem[];
  isLoading: boolean;
  onAdd: (item: SonosItem) => void;
  onOpen: (item: SonosItem) => void;
  cardSize?: string;
}) {
  const sizeStyle = cardSize ? { '--card-size': cardSize } as React.CSSProperties : undefined;
  if (isLoading) {
    return (
      <div className={styles.cardRow} style={sizeStyle}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={styles.placeholder} />
        ))}
      </div>
    );
  }
  if (!items.length) return null;
  return (
    <div className={styles.cardRow} style={sizeStyle}>
      {items.map((item, i) =>
        isArtist(item) ? (
          <ArtistMediaCard key={i} item={item} onOpen={onOpen} />
        ) : (
          <MediaCard
            key={i}
            name={getName(item)}
            sub={browseSub(item)}
            artUrl={getItemArt(item)}
            circular={false}
            onAdd={isContainer(item) ? undefined : () => onAdd(item)}
            onOpen={(isAlbum(item) || isPlaylist(item) || isContainer(item) || isProgram(item)) ? () => onOpen(item) : undefined}
          />
        ),
      )}
    </div>
  );
}
