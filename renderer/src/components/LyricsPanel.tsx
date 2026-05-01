import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Music2, MicVocal } from 'lucide-react';
import { useNowPlaying } from '../hooks/useNowPlaying';
import { useLyrics } from '../hooks/useLyrics';
import { useGeniusDescription } from '../hooks/useGeniusDescription';
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
    case 'p':      return <p key={key} className={styles.descPara}>{children}</p>;
    case 'em':     return <em key={key}>{children}</em>;
    case 'strong': return <strong key={key}>{children}</strong>;
    case 'a':      return <span key={key} className={styles.descLink} onClick={() => { const href = node.attributes?.href; if (href) window.sonos.openExternal(href); }}>{children}</span>;
    case 'br':     return <br key={key} />;
    default:       return <span key={key}>{children}</span>;
  }
}

function textColor(dominantColor: string | null): string {
  if (!dominantColor) return '255, 255, 255';
  const [r, g, b] = dominantColor.split(',').map(Number);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 145 ? '0, 0, 0' : '255, 255, 255';
}

export function LyricsPanel({ playback }: Props) {
  const navigate = useNavigate();
  const onClose = useCallback(() => navigate(-1), [navigate]);
  const { displayTrack, displayArtist, albumName, cachedArt, dominantColor, progressPct, durationMs } =
    useNowPlaying(playback);

  const elapsedMs = Math.round((progressPct / 100) * durationMs) + 250;

  const { lines, isLoading: lyricsLoading, isInstrumental, notFound } =
    useLyrics(displayTrack, displayArtist, albumName, durationMs);

  const { description } = useGeniusDescription(displayTrack, displayArtist);

  const activeLine = lines.reduce((acc, l, i) => (l.timeMs <= elapsedMs ? i : acc), -1);

  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    if (activeLine < 0) return;
    const container = containerRef.current;
    const line = lineRefs.current[activeLine];
    if (!container || !line) return;
    const cr = container.getBoundingClientRect();
    const lr = line.getBoundingClientRect();
    const target = container.scrollTop + lr.top - cr.top - cr.height / 2 + lr.height / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: hasScrolledRef.current ? 'smooth' : 'instant' });
    hasScrolledRef.current = true;
  }, [activeLine]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      style={dominantColor ? ({ '--dc': dominantColor } as React.CSSProperties) : undefined}
    >
      {cachedArt && <img className={styles.bgArt} src={cachedArt} alt="" />}
      <div className={styles.waveBg} />
      <div className={styles.vignette} />

      <div className={styles.content}>
        {/* Left — art + metadata + genius description */}
        <div className={styles.leftPanel} style={{ '--tc': textColor(dominantColor) } as React.CSSProperties}>
          {cachedArt ? (
            <img className={styles.bigArt} src={cachedArt} alt="" />
          ) : (
            <div className={styles.bigArtPh}><Music2 size={48} /></div>
          )}
          <div className={styles.meta}>
            <div className={styles.metaTrack}>{displayTrack || '—'}</div>
            <div className={styles.metaArtist}>{displayArtist || '—'}</div>
          </div>
          {description && (
            <div className={styles.geniusDesc}>
              {renderDom(description, 0)}
            </div>
          )}
        </div>

        {/* Right — scrolling lyrics */}
        <div ref={containerRef} className={styles.lyricsContainer}>
          {lyricsLoading && (
            <div className={styles.loadingWrap}>
              <div className={styles.loadingIcon}><MicVocal size={36} /></div>
              <div className={styles.loadingLabel}>Loading</div>
              <div className={styles.dots}>
                <span /><span /><span />
              </div>
            </div>
          )}
          <div className={styles.lyricsPad}>
            {!lyricsLoading && isInstrumental && <div className={styles.status}>♪ Instrumental ♪</div>}
            {!lyricsLoading && notFound && !isInstrumental && <div className={styles.status}>No lyrics found</div>}
            {lines.map((line, i) => {
              const dist = Math.abs(i - activeLine);
              return (
                <div
                  key={i}
                  ref={(el) => { lineRefs.current[i] = el; }}
                  className={`${styles.line}${i === activeLine ? ' ' + styles.lineActive : ''}`}
                  style={activeLine >= 0 ? { opacity: Math.max(0.18, 1 - dist * 0.19) } : undefined}
                >
                  {line.text}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
