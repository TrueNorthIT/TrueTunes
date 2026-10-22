import styles from './TrackLinks.module.css';

/** A track or album title that opens it. The label carries the action: "Title, open album". */
export function TitleButton({ title, onOpen, label }: { title: string; onOpen: () => void; label?: string }) {
  return (
    <button type="button" className={styles.link} aria-label={label ?? `${title}, open album`} onClick={onOpen}>
      {title}
    </button>
  );
}

/** "A, B" credit string: each name is its own link. `isFirst` lets the caller use the track's artist id for the first name only. */
export function ArtistLinks({
  artist,
  onOpenArtist,
}: {
  artist: string;
  onOpenArtist: (name: string, isFirst: boolean) => void;
}) {
  const names = artist.split(/,\s*/).filter(Boolean);
  return (
    <span className={styles.artists}>
      {names.map((name, i) => (
        <span key={`${name}-${i}`}>
          {i > 0 && ', '}
          <button
            type="button"
            className={styles.link}
            aria-label={`${name}, open artist`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenArtist(name, i === 0);
            }}
          >
            {name}
          </button>
        </span>
      ))}
    </span>
  );
}
