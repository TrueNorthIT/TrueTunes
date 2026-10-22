import { useImage } from '../../hooks/useImage';
import { useDominantColor } from '../../hooks/useDominantColor';
import { withArtworkSize } from '../../lib/artworkUrl';
import styles from '../../styles/ArtistPanel.module.css';

interface Props {
  name: string;
  altNames: string[];
  /** Artist photo URL (any size). Without one the banner falls back to a colour wash. */
  imageUrl: string | null;
}

/** Full-bleed artist photo with the name over its bottom-left, fading into the page. */
export function ArtistBanner({ name, altNames, imageUrl }: Props) {
  const art = useImage(imageUrl ? withArtworkSize(imageUrl) : null);
  const dominant = useDominantColor(art, { setGlobal: true });
  const wash = dominant
    ? { background: `linear-gradient(180deg, rgba(${dominant},0.55) 0%, rgba(${dominant},0.2) 60%, transparent 100%)`, transition: 'background 0.8s ease' }
    : undefined;
  const title = (
    <>
      <h1 className={styles.artistName}>{name}</h1>
      {altNames.length > 0 && <div className={styles.altNames}>{altNames.join(' · ')}</div>}
    </>
  );

  if (!imageUrl) {
    return <div className={styles.washHeader} style={wash}>{title}</div>;
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
