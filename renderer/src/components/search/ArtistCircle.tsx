import { useImage } from '../../hooks/useImage';
import { getItemArt } from '../../lib/itemHelpers';
import type { SonosItem } from '../../types/sonos';
import styles from './ArtistCircle.module.css';

interface Props {
  artist: SonosItem;
  onOpen: (item: SonosItem) => void;
}

export function ArtistCircle({ artist, onOpen }: Props) {
  const art  = useImage(getItemArt(artist));
  const name = (artist.title ?? artist.name ?? '') as string;
  return (
    <div className={styles.circle} onClick={() => onOpen(artist)}>
      <div className={styles.art}>
        {art
          ? <img src={art} alt="" />
          : <div className={styles.artPh}>{name[0]}</div>}
      </div>
      <div className={styles.name}>{name}</div>
    </div>
  );
}
