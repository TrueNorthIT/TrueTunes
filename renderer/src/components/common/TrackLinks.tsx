import { Fragment } from 'react';
import styles from './TrackLinks.module.css';

// data-tap-ok: on the phone shell these text links keep their size on the line and get their 44px tap target
// from an ::after (TrackLinks.module.css; in a track or chart row the title's ::after covers the whole row),
// so the journey's tap-target check, which measures the element's own box, is told the target is elsewhere.

/** A track or album title that opens it. The label carries the action: "Title, open album". */
export function TitleButton({ title, onOpen, label }: { title: string; onOpen: () => void; label?: string }) {
  return (
    <button
      type="button"
      className={styles.link}
      aria-label={label ?? `${title}, open album`}
      onClick={onOpen}
      data-tap-ok=""
    >
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
  // The comma is part of the name before it and the space after it is the only break, so a wrapped
  // credit never starts a line with ", Snoop Dogg", even when a long name wraps inside its link.
  return (
    <span className={styles.artists}>
      {names.map((name, i) => (
        <Fragment key={`${name}-${i}`}>
          {i > 0 && ' '}
          <button
            type="button"
            className={styles.link}
            data-tap-ok=""
            aria-label={`${name}, open artist`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenArtist(name, i === 0);
            }}
          >
            {name}
            {i < names.length - 1 && ','}
          </button>
        </Fragment>
      ))}
    </span>
  );
}
