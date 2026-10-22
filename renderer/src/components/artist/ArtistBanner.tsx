import type { CSSProperties } from 'react';
import { useImage } from '../../hooks/useImage';
import { useDominantColor } from '../../hooks/useDominantColor';
import { withArtworkSize } from '../../lib/artworkUrl';
import { usePageArt } from '../../lib/pageArt';
import { useIsPlaceholderPhoto } from '../../lib/photoPlaceholder';
import styles from '../../styles/ArtistPanel.module.css';

interface Props {
  name: string;
  altNames: string[];
  /** Artist photo URL (any size). Without one the banner is a colour wash with the name on it. */
  imageUrl: string | null;
  /** Artwork whose colour the wash takes when there is no photo, e.g. the latest release cover. */
  fallbackArtUrl?: string | null;
  /** "Played here 27 times": what the office has done with this artist. Hidden when absent. */
  officeLine?: string | null;
}

/** Full-bleed artist photo with the name over its bottom-left, fading into the page. */
export function ArtistBanner({ name, altNames, imageUrl, fallbackArtUrl, officeLine }: Props) {
  const photo = useImage(imageUrl ? withArtworkSize(imageUrl) : null);
  // A generic silhouette from the service counts as no photo.
  const isPlaceholder = useIsPlaceholderPhoto(photo);
  const noPhoto = !imageUrl || isPlaceholder;
  const cover = useImage(noPhoto && fallbackArtUrl ? withArtworkSize(fallbackArtUrl, 600) : null);
  const art = noPhoto ? cover : photo;
  const dominant = useDominantColor(art, { setGlobal: true });
  usePageArt(art);
  const title = (
    <>
      <h1 className={styles.artistName}>{name}</h1>
      {altNames.length > 0 && <div className={styles.altNames}>{altNames.join(' · ')}</div>}
      {officeLine && <div className={styles.officeLine}>{officeLine}</div>}
    </>
  );

  if (noPhoto) {
    return (
      <div className={styles.washHeader} style={dominant ? ({ '--wash': dominant } as CSSProperties) : undefined}>
        {title}
      </div>
    );
  }
  return (
    <div className={styles.hero}>
      {/* same cached URL twice: a blurred full-width backdrop, and the sharp photo blended in on the right */}
      {art && <img className={styles.heroBackdrop} src={art} alt="" aria-hidden="true" />}
      {art && <img className={styles.heroImg} src={art} alt="" />}
      <div
        className={styles.heroFade}
        style={dominant ? { background: `linear-gradient(180deg, transparent 35%, rgba(${dominant},0.3) 70%, var(--bg) 100%)` } : undefined}
      />
      <div className={styles.heroText}>{title}</div>
    </div>
  );
}
