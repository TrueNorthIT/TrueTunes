import { useState } from 'react';
import { SectionCard } from '../common/SectionCard';
import styles from '../../styles/ArtistPanel.module.css';

interface Props {
  name: string;
  /** Bio paragraphs separated by blank lines. */
  blurb: string;
  instagram?: string | null;
  twitter?: string | null;
}

// ponytail: the toggle shows by text length rather than measuring the clamp; measure if it misjudges.
const LONG_BLURB = 300;

export function ArtistAbout({ name, blurb, instagram, twitter }: Props) {
  const [open, setOpen] = useState(false);
  if (!blurb && !instagram && !twitter) return null;
  return (
    <SectionCard className={styles.band} title={`About ${name}`}>
      {blurb && (
        <>
          <p className={`${styles.aboutText}${open ? '' : ' ' + styles.aboutClamped}`}>{blurb}</p>
          {blurb.length > LONG_BLURB && (
            <button className={styles.moreBtn} aria-expanded={open} onClick={() => setOpen(o => !o)}>
              {open ? 'Less' : 'More'}
            </button>
          )}
        </>
      )}
      {(instagram || twitter) && (
        <div className={styles.socialIcons}>
          {instagram && (
            <button className={styles.socialIconBtn} title={`@${instagram}`} aria-label={`Instagram @${instagram}`} onClick={() => window.sonos.openExternal(`https://instagram.com/${instagram}`)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                <circle cx="12" cy="12" r="4"/>
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
              </svg>
            </button>
          )}
          {twitter && (
            <button className={styles.socialIconBtn} title={`@${twitter}`} aria-label={`X @${twitter}`} onClick={() => window.sonos.openExternal(`https://twitter.com/${twitter}`)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.261 5.635 5.903-5.635zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </button>
          )}
        </div>
      )}
    </SectionCard>
  );
}
