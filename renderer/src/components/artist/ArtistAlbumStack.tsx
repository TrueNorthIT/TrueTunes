import { useEffect, useRef } from 'react';
import { useImage } from '../../hooks/useImage';
import { ArtistAlbumCard } from './ArtistAlbumCard';
import { TrackHitLine } from './TrackHitLine';
import { cardSubtitle } from '../../lib/artistSubtitle';
import { releaseKey, type ReleaseGroup } from '../../lib/releaseShelves';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/ArtistPanel.module.css';

interface StackProps {
  group: ReleaseGroup;
  onExpand: () => void;
  year?: number;
  trackHits?: string[];
  searching?: boolean;
  artistName?: string;
  /** Lets the parent return focus here after a collapse. */
  innerRef?: (el: HTMLDivElement | null) => void;
}

/** Collapsed group of several versions of one release. Click expands in place; queue from the expanded cards. */
export function ArtistAlbumStack({ group, onExpand, year, trackHits, searching, artistName, innerRef }: StackProps) {
  const { primary, versions } = group;
  const art = useImage((primary.images as Record<string, string> | undefined)?.['tile1x1'] ?? null);
  const fullSubtitle = (primary as Record<string, unknown>)['subtitle'] as string | undefined;
  const subtitle = cardSubtitle(year, fullSubtitle, artistName);
  const layer = art ? { backgroundImage: `url(${art})` } : undefined;
  return (
    <div
      ref={innerRef}
      className={styles.albumCard}
      role="button"
      tabIndex={0}
      aria-label={`${primary.title}, ${versions.length} versions. Show versions`}
      onClick={onExpand}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onExpand(); } }}
    >
      <div className={styles.stackWrap}>
        <div className={`${styles.stackLayer} ${styles.stackLayer2}`} style={layer} />
        <div className={`${styles.stackLayer} ${styles.stackLayer1}`} style={layer} />
        <div className={styles.albumArt}>
          {art ? <img src={art} alt="" /> : <div className={styles.albumArtPh}>♪</div>}
          <span className={styles.stackPill}>
            <span>{versions.length} versions</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 3.5 5 6.5 8 3.5" />
            </svg>
          </span>
        </div>
      </div>
      <div className={styles.albumTitle}><span className={styles.albumTitleText} title={primary.title}>{primary.title}</span></div>
      {subtitle && <div className={styles.albumSub} title={fullSubtitle}>{subtitle}</div>}
      <TrackHitLine hits={trackHits} searching={searching} />
    </div>
  );
}

interface GroupProps {
  group: ReleaseGroup;
  title: string;
  onCollapse: () => void;
  onOpen: (item: SonosItem) => void;
  onAdd: (item: SonosItem) => void;
  years: Map<string, number>;
  trackHits?: Map<string, string[]>;
  searching?: boolean;
  artistName?: string;
  /** Lets the parent focus the collapse button when the group opens. */
  closeRef?: (el: HTMLButtonElement | null) => void;
}

/** Expanded stack: one tinted container holding each version as a normal card. */
export function ArtistAlbumGroup({ group, title, onCollapse, onOpen, onAdd, years, trackHits, searching, artistName, closeRef }: GroupProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, []);
  return (
    <div
      ref={ref}
      className={styles.groupBox}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onCollapse(); } }}
    >
      <div className={styles.groupHeader}>
        <span className={styles.groupTitle} title={title}>{title} · {group.versions.length} versions</span>
        <button ref={closeRef} className={styles.groupClose} aria-label={`Collapse ${title} versions`} onClick={onCollapse}>✕</button>
      </div>
      <div className={styles.groupCards}>
        {group.versions.map(v => (
          <ArtistAlbumCard key={releaseKey(v)} album={v} onOpen={onOpen} onAdd={onAdd} year={years.get(releaseKey(v))} artistName={artistName} trackHits={trackHits?.get(releaseKey(v))} searching={searching} />
        ))}
      </div>
    </div>
  );
}
