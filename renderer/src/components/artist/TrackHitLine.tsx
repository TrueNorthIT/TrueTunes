import styles from '../../styles/ArtistPanel.module.css';

interface Props {
  hits?: string[];
  /** While a search is active every card reserves the line, so all cards stay the same height. */
  searching?: boolean;
}

/** "♪ Pizza Boy (+2 more)" under a card's subtitle. */
export function TrackHitLine({ hits, searching }: Props) {
  if (!hits?.length && !searching) return null;
  return (
    <div className={styles.albumHit} title={hits?.length ? hits.join('\n') : undefined}>
      {hits?.length ? `♪ ${hits[0]}${hits.length > 1 ? ` (+${hits.length - 1} more)` : ''}` : ' '}
    </div>
  );
}
