import { useImage } from '../../hooks/useImage';
import { getPlaylistColor } from '../../lib/playlistColor';
import styles from './PlaylistCard.module.css';

interface Props {
  pl: PlaylistMeta;
  displayName?: string | null;
  onClick: () => void;
}

export function PlaylistCard({ pl, displayName, onClick }: Props) {
  const art = useImage(pl.imageUrl ?? null);
  return (
    <button className={styles.playlistCard} onClick={onClick} title={pl.name}>
      <div
        className={styles.playlistCardArt}
        style={art ? undefined : { background: pl.isFavourites ? 'linear-gradient(135deg, hsl(350,65%,35%), hsl(320,60%,25%))' : getPlaylistColor(pl.name) }}
      >
        {art
          ? <img src={art} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: 'inherit' }} />
          : pl.isFavourites ? '❤️' : pl.name[0].toUpperCase()
        }
      </div>
      <span className={styles.playlistCardName}>{pl.name}</span>
      <span className={styles.playlistCardMeta}>
        {pl.trackCount} track{pl.trackCount !== 1 ? 's' : ''}
        {displayName !== undefined && pl.owner !== displayName && <span> · {pl.owner}</span>}
        {!pl.isPublic && <span> · Private</span>}
      </span>
    </button>
  );
}
