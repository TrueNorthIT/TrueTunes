import { useRef, useState } from 'react';
import { useImage } from '../hooks/useImage';
import { ExplicitBadge } from './ExplicitBadge';
import { getName, browseSub, getItemArt, isAlbum, isArtist, isTrack } from '../lib/itemHelpers';
import { ArtistHero } from './ArtistHero';
import { ItemRow } from './ItemRow';
import type { SonosItem, SonosArtist } from '../types/sonos';
import styles from '../styles/HomePanel.module.css';

// ── Artist circle ─────────────────────────────────────────────────────────────

function ArtistCircle({ artist, onOpen }: { artist: SonosItem; onOpen: (item: SonosItem) => void }) {
  const art  = useImage(getItemArt(artist));
  const name = (artist.title ?? artist.name ?? '') as string;
  return (
    <div className={styles.artistCircle} onClick={() => onOpen(artist)}>
      <div className={styles.artistCircleArt}>
        {art
          ? <img src={art} alt="" />
          : <div className={styles.artistCircleArtPh}>{name[0]}</div>}
      </div>
      <div className={styles.artistCircleName}>{name}</div>
    </div>
  );
}

// ── Album card ────────────────────────────────────────────────────────────────

function SearchAlbumCard({ album, onOpen }: { album: SonosItem; onOpen: (item: SonosItem) => void }) {
  const art  = useImage(getItemArt(album));
  const name = (album.title ?? album.name ?? '') as string;
  const sub  = browseSub(album);
  return (
    <div className={styles.searchAlbumCard} onClick={() => onOpen(album)}>
      <div className={styles.searchAlbumArt}>
        {art ? <img src={art} alt="" /> : <div className={styles.searchAlbumArtPh}>♪</div>}
      </div>
      <div className={styles.searchAlbumTitle}>{name}</div>
      {sub && <div className={styles.searchAlbumSub}>{sub}</div>}
    </div>
  );
}

// ── Search track row ──────────────────────────────────────────────────────────

function SearchTrackRow({
  item,
  index,
  selected,
  onSelect,
  onAdd,
  onOpenArtist,
  onDragStart,
}: {
  item: SonosItem;
  index: number;
  selected: boolean;
  onSelect: (i: number, e: React.MouseEvent) => void;
  onAdd: () => void;
  onOpenArtist?: (artist: SonosItem) => void;
  onDragStart: (e: React.DragEvent, i: number) => void;
}) {
  const art     = useImage(getItemArt(item));
  const artists = (item.artists ?? []) as SonosArtist[];

  return (
    <div
      className={`${styles.searchTrackRow}${selected ? ' ' + styles.searchTrackSelected : ''}`}
      draggable
      onClick={e => { e.stopPropagation(); onSelect(index, e); }}
      onDragStart={e => onDragStart(e, index)}
    >
      <div className={styles.searchTrackArt}>
        {art
          ? <img src={art} alt="" />
          : <div className={styles.searchTrackArtPh} />}
      </div>
      <div className={styles.searchTrackText}>
        <div className={styles.searchTrackName}>
          {getName(item)}
          {item.explicit && <ExplicitBadge />}
        </div>
        {artists.length > 0 && (
          <div className={styles.searchTrackSub}>
            {artists.map((a, ai) => {
              const canLink = !!(a.id?.objectId && onOpenArtist);
              const artistItem: SonosItem | null = canLink ? {
                type: 'ARTIST',
                name: a.name,
                resource: { type: 'ARTIST', id: { objectId: a.id!.objectId, serviceId: a.id!.serviceId, accountId: a.id!.accountId } },
              } : null;
              return (
                <span key={ai}>
                  {ai > 0 && ', '}
                  {artistItem ? (
                    <button
                      className={styles.searchArtistBtn}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); onOpenArtist!(artistItem); }}
                    >
                      {a.name}
                    </button>
                  ) : a.name}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <button
        className={styles.searchTrackAddBtn}
        onClick={e => { e.stopPropagation(); onAdd(); }}
      >
        +
      </button>
    </div>
  );
}

// ── Search results layout ─────────────────────────────────────────────────────

export function SearchResults({
  results,
  onAddToQueue,
  onOpenAlbum,
  onOpenArtist,
}: {
  results: SonosItem[];
  onAddToQueue: (item: SonosItem) => void;
  onOpenAlbum: (item: SonosItem) => void;
  onOpenArtist: (item: SonosItem) => void;
}) {
  const [selected, setSelected]   = useState<Set<number>>(new Set());
  const lastSelected               = useRef<number | null>(null);

  const topArtist      = results.length > 0 && isArtist(results[0]) ? results[0] : null;
  const artists        = results.filter(isArtist);
  const remainingArtists = topArtist ? artists.slice(1) : artists;
  const albums    = results.filter(isAlbum);
  const tracks    = results.filter(isTrack);
  const others    = results.filter((r) => !isArtist(r) && !isAlbum(r) && !isTrack(r));

  function handleTrackClick(i: number, e: React.MouseEvent) {
    if (e.shiftKey && lastSelected.current !== null) {
      const lo = Math.min(lastSelected.current, i);
      const hi = Math.max(lastSelected.current, i);
      setSelected(prev => {
        const next = new Set(prev);
        for (let j = lo; j <= hi; j++) next.add(j);
        return next;
      });
    } else if (e.ctrlKey || e.metaKey) {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i); else next.add(i);
        return next;
      });
      lastSelected.current = i;
    } else {
      if (selected.size === 1 && selected.has(i)) {
        setSelected(new Set());
        lastSelected.current = null;
      } else {
        setSelected(new Set([i]));
        lastSelected.current = i;
      }
    }
  }

  function handleDragStart(e: React.DragEvent, i: number) {
    const toMove = selected.has(i)
      ? [...selected].sort((a, b) => a - b)
      : [i];
    if (!selected.has(i)) {
      setSelected(new Set([i]));
      lastSelected.current = i;
    }
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/sonos-item-list', JSON.stringify(toMove.map(idx => tracks[idx])));
    const ghost = document.createElement('div');
    Object.assign(ghost.style, {
      position: 'fixed', top: '-100px', left: '0',
      background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
      color: '#fff', padding: '5px 12px', borderRadius: '6px',
      fontSize: '12px', fontWeight: '600', pointerEvents: 'none', whiteSpace: 'nowrap',
    });
    ghost.textContent = toMove.length > 1 ? `${toMove.length} tracks` : getName(tracks[i]);
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 20);
    setTimeout(() => ghost.remove(), 0);
  }

  if (results.length === 0) return <div className={styles.msg}>No results.</div>;

  return (
    <>
      {topArtist && (
        <ArtistHero artist={topArtist} onAddToQueue={onAddToQueue} onOpen={onOpenArtist} />
      )}

      {remainingArtists.length > 0 && (
        <section className={styles.searchSection}>
          <h2 className={styles.searchSectionTitle}>Artists</h2>
          <div className={styles.artistsRow}>
            {remainingArtists.map((a, i) => (
              <ArtistCircle key={i} artist={a} onOpen={onOpenArtist} />
            ))}
          </div>
        </section>
      )}

      {albums.length > 0 && (
        <section className={styles.searchSection}>
          <h2 className={styles.searchSectionTitle}>Albums</h2>
          <div className={styles.searchAlbumsRow}>
            {albums.map((a, i) => (
              <SearchAlbumCard key={i} album={a} onOpen={onOpenAlbum} />
            ))}
          </div>
        </section>
      )}

      {tracks.length > 0 && (
        <section className={styles.searchSection}>
          <h2 className={styles.searchSectionTitle}>Songs</h2>
          <div
            className={styles.tracksList}
            onClick={() => { setSelected(new Set()); lastSelected.current = null; }}
          >
            {tracks.map((item, i) => (
              <SearchTrackRow
                key={i}
                item={item}
                index={i}
                selected={selected.has(i)}
                onSelect={handleTrackClick}
                onAdd={() => onAddToQueue(item)}
                onOpenArtist={onOpenArtist}
                onDragStart={handleDragStart}
              />
            ))}
          </div>
        </section>
      )}

      {others.length > 0 && !topArtist && (
        <section className={styles.searchSection}>
          <h2 className={styles.searchSectionTitle}>Other</h2>
          <div className={styles.tracksList}>
            {others.map((item, i) => (
              <ItemRow
                key={i}
                name={getName(item)}
                sub={browseSub(item)}
                artUrl={getItemArt(item)}
                showAddButton
                onAdd={() => onAddToQueue(item)}
                onOpen={
                  isAlbum(item) ? () => onOpenAlbum(item)
                  : isArtist(item) ? () => onOpenArtist(item)
                  : undefined
                }
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
