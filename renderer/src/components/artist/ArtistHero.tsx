import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useImage } from '../../hooks/useImage';
import { useDominantColor } from '../../hooks/useDominantColor';
import { artistQueryOptions } from '../../hooks/useArtistBrowse';
import { resolveArtistParams, getItemArt, getName } from '../../lib/itemHelpers';
import { HeroTrackRow } from './HeroTrackRow';
import type { SonosItem } from '../../types/sonos';
import styles from './ArtistHero.module.css';

export function ArtistHero({
  artist,
  onAddToQueue,
  onOpen,
}: {
  artist: SonosItem;
  onAddToQueue: (item: SonosItem) => void;
  onOpen: (item: SonosItem) => void;
}) {
  const { artistId, serviceId, accountId, defaults } = resolveArtistParams(artist);
  const { data } = useQuery({
    ...artistQueryOptions(artistId, serviceId, accountId, defaults),
    enabled: !!(artistId && serviceId && accountId),
  });

  const cachedArt     = useImage(getItemArt(artist));
  const dominantColor = useDominantColor(cachedArt);
  const name          = (artist.title ?? artist.name ?? '') as string;

  const [selected, setSelected]   = useState<Set<number>>(new Set());
  const lastSelected               = useRef<number | null>(null);
  const tracks                     = data?.topSongs?.slice(0, 6) ?? [];

  function handleClick(index: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (e.shiftKey && lastSelected.current !== null) {
      const lo = Math.min(lastSelected.current, index);
      const hi = Math.max(lastSelected.current, index);
      setSelected(prev => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) next.add(i);
        return next;
      });
    } else if (e.ctrlKey || e.metaKey) {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(index)) { next.delete(index); } else { next.add(index); }
        return next;
      });
      lastSelected.current = index;
    } else {
      if (selected.size === 1 && selected.has(index)) {
        setSelected(new Set());
        lastSelected.current = null;
      } else {
        setSelected(new Set([index]));
        lastSelected.current = index;
      }
    }
  }

  function handleDragStart(index: number, e: React.DragEvent) {
    const toMove = selected.has(index) ? [...selected].sort((a, b) => a - b) : [index];
    if (!selected.has(index)) { setSelected(new Set([index])); lastSelected.current = index; }
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/sonos-item-list', JSON.stringify(toMove.map(i => tracks[i].raw)));
    const ghost = document.createElement('div');
    Object.assign(ghost.style, {
      position: 'fixed', top: '-100px', left: '0',
      background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
      color: '#fff', padding: '5px 12px', borderRadius: '6px',
      fontSize: '12px', fontWeight: '600', pointerEvents: 'none', whiteSpace: 'nowrap',
    });
    ghost.textContent = toMove.length > 1 ? `${toMove.length} tracks` : getName(tracks[index].raw);
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 20);
    setTimeout(() => ghost.remove(), 0);
  }

  return (
    <div
      className={styles.artistHero}
      style={dominantColor ? { background: `linear-gradient(135deg, rgba(${dominantColor},0.18) 0%, transparent 70%)` } : undefined}
      onClick={() => { setSelected(new Set()); lastSelected.current = null; }}
    >
      <div
        className={styles.heroHeader}
        onClick={e => { e.stopPropagation(); onOpen(artist); }}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onOpen(artist)}
      >
        <div className={styles.heroAvatar}>
          {cachedArt
            ? <img src={cachedArt} alt="" className={styles.heroAvatarImg} />
            : <div className={styles.heroAvatarPh} />}
        </div>
        <div className={styles.heroName}>{name}</div>
      </div>

      <div className={styles.heroTracks}>
        {tracks.length
          ? tracks.map((track, i) => (
              <HeroTrackRow
                key={track.id?.objectId ?? i}
                track={track}
                index={i}
                isSelected={selected.has(i)}
                onClick={handleClick}
                onDragStart={handleDragStart}
                onAdd={() => onAddToQueue(track.raw)}
              />
            ))
          : Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={styles.heroTrackPh} />
            ))}
      </div>
    </div>
  );
}
