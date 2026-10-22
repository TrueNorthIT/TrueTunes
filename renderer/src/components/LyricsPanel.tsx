import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNowPlaying } from '../hooks/useNowPlaying';
import { useFollowActiveLine, useLiveLyrics } from '../hooks/useLiveLyrics';
import { useGeniusDescription } from '../hooks/useGeniusDescription';
import { useQueuer } from '../hooks/useQueuer';
import { useImage } from '../hooks/useImage';
import { useOpenItem } from '../hooks/useOpenItem';
import { useResolveAndOpen } from '../hooks/useResolveAndOpen';
import { primaryArtistName } from '../lib/homeData';
import { withArtworkSize } from '../lib/artworkUrl';
import { QueuerChip } from './common/QueuerChip';
import type { PlaybackState } from '../hooks/usePlayback';
import styles from './LyricsPanel.module.css';
import type React from 'react';

interface Props {
  playback: PlaybackState;
}

function renderDom(node: GeniusDomNode, key: number | string): React.ReactNode {
  if (typeof node === 'string') return node;
  const children = node.children?.map((c, i) => renderDom(c, i)) ?? null;
  switch (node.tag) {
    case 'root':   return <>{children}</>;
    case 'p':      return <p key={key}>{children}</p>;
    case 'em':     return <em key={key}>{children}</em>;
    case 'strong': return <strong key={key}>{children}</strong>;
    case 'a': {
      const href = node.attributes?.href;
      return href ? (
        <a key={key} href={href} className={styles.aboutLink} onClick={(e) => { e.preventDefault(); window.sonos.openExternal(href); }}>
          {children}
        </a>
      ) : <span key={key}>{children}</span>;
    }
    case 'ul':     return <ul key={key}>{children}</ul>;
    case 'ol':     return <ol key={key}>{children}</ol>;
    case 'li':     return <li key={key}>{children}</li>;
    case 'blockquote': return <blockquote key={key}>{children}</blockquote>;
    case 'br':     return <br key={key} />;
    default:       return <span key={key}>{children}</span>;
  }
}

const SKELETON_WIDTHS = ['62%', '48%', '74%', '40%', '66%', '54%', '70%'];

/**
 * The Home lyrics box, full size: the now playing card on the left, the live lyrics filling the rest.
 * Same lyrics, active line and follow-scroll as Home (useLiveLyrics). No transport: the player bar has it.
 */
export function LyricsPanel({ playback }: Props) {
  const navigate = useNavigate();
  const openItem = useOpenItem();
  const { resolveAndOpen } = useResolveAndOpen();
  const onClose = useCallback(() => navigate(-1), [navigate]);
  const np = useNowPlaying(playback);
  const sharp = useImage(np.artUrlRaw ? withArtworkSize(np.artUrlRaw, 600) : null);
  const art = sharp ?? np.cachedArt;

  const lyr = useLiveLyrics(np);
  const { activeLine } = lyr;
  // The active line sits a little above the middle: more of what's coming than what's gone.
  const { boxRef, lineRefs } = useFollowActiveLine(activeLine, 0.42);

  const { description } = useGeniusDescription(np.displayTrack, np.displayArtist);

  const queuer = useQueuer({ id: np.currentObjectId, title: np.displayTrack, artist: np.displayArtist });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const openAlbum = () =>
    np.albumItem
      ? openItem(np.albumItem)
      : void resolveAndOpen(np.albumName || np.displayTrack, 'album', { artist: np.displayArtist });
  const openArtist = () =>
    np.artistItem ? openItem(np.artistItem) : void resolveAndOpen(primaryArtistName(np.displayArtist), 'artist');

  if (!np.displayTrack) {
    return (
      <div className={styles.panel}>
        <div className={`page-scale ${styles.page} ${styles.pageSolo}`}>
          <h1 className={styles.emptyTitle}>Nothing is playing</h1>
          <p className={styles.emptyText}>Lyrics follow whatever is on the office speakers.</p>
        </div>
      </div>
    );
  }

  const status = lyr.isInstrumental
    ? 'Instrumental, no lyrics to follow.'
    : !lyr.pending && !lyr.hasLyrics
      ? 'No lyrics found for this song.'
      : null;

  return (
    <div className={styles.panel}>
      <div className={`page-scale ${styles.page}`}>
        <section
          className={styles.nowCard}
          aria-label="Now playing"
          style={np.dominantColor ? ({ '--wash': np.dominantColor } as React.CSSProperties) : undefined}
        >
          <button
            type="button"
            className={styles.art}
            onClick={openAlbum}
            onMouseEnter={np.prefetchAlbum}
            aria-label={`Open album ${np.albumName ?? np.displayTrack}`}
          >
            {art ? <img src={art} alt="" /> : <span className={styles.artPh}>♪</span>}
          </button>
          <div className={styles.info}>
            <h1 className={styles.title}>
              <button type="button" className={styles.link} onClick={openAlbum} onMouseEnter={np.prefetchAlbum} aria-label={`${np.displayTrack}, open album`}>
                {np.displayTrack}
              </button>
            </h1>
            <div className={styles.meta}>
              <button type="button" className={`${styles.link} ${styles.metaArtist}`} onClick={openArtist} aria-label={`${np.displayArtist}, open artist`}>
                {np.displayArtist}
              </button>
              {np.albumName && (
                <>
                  <span className={styles.metaDot} aria-hidden="true">·</span>
                  <button type="button" className={`${styles.link} ${styles.metaAlbum}`} onClick={openAlbum} aria-label={`${np.albumName}, open album`}>
                    {np.albumName}
                  </button>
                </>
              )}
            </div>
            {queuer && (
              <QueuerChip
                className={styles.queuer}
                user={queuer.user}
                imageUrl={queuer.imageUrl}
                onOpen={() => navigate(`/profile/${encodeURIComponent(queuer.user)}`)}
              />
            )}
          </div>
          {description && (
            <div className={styles.about} aria-label="About this track" tabIndex={0}>
              <h2 className={styles.label}>About this song</h2>
              <div className={styles.aboutText}>{renderDom(description, 0)}</div>
            </div>
          )}
        </section>

        <section className={styles.lyricsCard} aria-label="Lyrics" aria-busy={lyr.pending}>
          {status ? (
            <p className={styles.status}>{status}</p>
          ) : (
            <div
              ref={boxRef}
              className={`${styles.scroll} ${lyr.lines.length ? '' : styles.scrollFree}`}
              tabIndex={lyr.lines.length ? undefined : 0}
            >
              {lyr.pending ? (
                <div className={styles.pad} aria-hidden="true">
                  {SKELETON_WIDTHS.map((w, i) => (
                    <span key={i} className={`skeleton ${styles.lineSkel}`} style={{ width: w, animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
              ) : lyr.lines.length > 0 ? (
                <div className={styles.pad}>
                  {lyr.lines.map((line, i) => (
                    <div
                      key={i}
                      ref={(el) => { lineRefs.current[i] = el; }}
                      className={`${styles.line}${i === activeLine ? ' ' + styles.lineActive : ''}`}
                      style={activeLine >= 0 ? { opacity: Math.max(0.22, 1 - Math.abs(i - activeLine) * 0.17) } : undefined}
                      aria-current={i === activeLine ? 'true' : undefined}
                    >
                      {line.text}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`${styles.pad} ${styles.padPlain}`}>
                  <p className={styles.label}>Not synced to the song</p>
                  {lyr.plain.map((l, i) => <div key={i} className={`${styles.line} ${styles.linePlain}`}>{l}</div>)}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
