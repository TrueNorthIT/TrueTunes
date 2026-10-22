import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Radio, Shuffle } from 'lucide-react';
import { PillButton } from '../common/PillButton';
import { OfficeChip } from '../common/OfficeChip';
import { usePhotoFocus } from '../../hooks/usePhotoFocus';
import { objectPositionY } from '../../lib/focalPoint';
import type { HeroPortrait } from '../../lib/artistHero';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/ArtistPanel.module.css';

/** How long the photo waits for its focal point before it shows at the default crop (then eases over). */
const FOCUS_WAIT_MS = 300;

/** Past this many characters (a shared credit, usually) the name steps down from the display size. */
const LONG_NAME = 28;

interface Props {
  name: string;
  altNames: string[];
  /** What the portrait slot shows; null while the photo is being checked. The slot keeps its size either way. */
  portrait: HeroPortrait | null;
  /** The portrait's loaded (cached) image. */
  portraitSrc: string | null;
  /** `r, g, b` of the portrait's dominant colour. Without one there is no wash. */
  wash: string | null;
  /** All-time queue count for the artist. Hidden when absent. */
  officeCount?: number;
  /** The artist's radio and shuffle playlists. They open the playlist page; nothing is queued from here. */
  radio?: SonosItem;
  shuffle?: SonosItem;
  onOpen: (item: SonosItem) => void;
}

/**
 * One hero for every artist, the same shape in every state. A real photo runs full-bleed behind the nav with the
 * name over a scrim; without one the cover hangs as a print on the right over its colour. Either way the hero
 * fades into the page with no edge. While the photo is being checked, the hero shows neither.
 */
export function ArtistBanner({ name, altNames, portrait, portraitSrc, wash, officeCount, radio, shuffle, onOpen }: Props) {
  const isPhoto = portrait?.kind === 'photo';
  const photoSrc = isPhoto ? portraitSrc : null;

  // Crop around the faces (or the detail): the hero's own aspect decides how much of the square is visible.
  const focus = usePhotoFocus(isPhoto ? portrait.url : null, photoSrc);
  const heroRef = useRef<HTMLElement>(null);
  const [heroAspect, setHeroAspect] = useState(0);
  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setHeroAspect(e.contentRect.width / e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Hold the photo back until the focal point is known, but never longer than FOCUS_WAIT_MS.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    setWaited(false);
    if (!photoSrc) return;
    const t = setTimeout(() => setWaited(true), FOCUS_WAIT_MS);
    return () => clearTimeout(t);
  }, [photoSrc]);
  const shown = waited || !focus.isPending;
  const position = focus.data && heroAspect
    ? `center ${objectPositionY(focus.data.y, focus.data.aspect, heroAspect, focus.data.anchor)}%`
    : undefined; // the stylesheet's centre 25%

  return (
    <header ref={heroRef} className={styles.hero} style={wash ? ({ '--wash': wash } as CSSProperties) : undefined}>
      {isPhoto ? (
        photoSrc && (
          <div className={styles.heroMedia} aria-hidden="true">
            <img
              className={`${styles.heroImg}${shown ? ' ' + styles.heroImgShown : ''}`}
              src={photoSrc}
              alt=""
              style={position ? { objectPosition: position } : undefined}
              data-focus={focus.data?.via ?? (focus.isPending ? 'pending' : 'default')}
            />
          </div>
        )
      ) : (
        <>
          {wash && <div className={styles.heroWash} aria-hidden="true" />}
          <div className={styles.print} aria-hidden="true">
            {portrait && portraitSrc && <img className={styles.printImg} src={portraitSrc} alt="" />}
          </div>
        </>
      )}
      <div className={styles.heroText}>
        <h1 className={`${styles.artistName}${name.length > LONG_NAME ? ' ' + styles.artistNameLong : ''}`}>{name}</h1>
        {altNames.length > 0 && <div className={styles.altNames}>{altNames.join(' · ')}</div>}
        <OfficeChip count={officeCount} className={styles.heroChip} />
        {(radio || shuffle) && (
          <div className={styles.heroActions}>
            {radio && (
              <PillButton variant="primary" onClick={() => onOpen(radio)}>
                <Radio size={16} aria-hidden="true" />
                Artist radio
              </PillButton>
            )}
            {shuffle && (
              <PillButton onClick={() => onOpen(shuffle)}>
                <Shuffle size={16} aria-hidden="true" />
                Shuffle
              </PillButton>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
