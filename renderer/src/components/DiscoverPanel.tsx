import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, ListPlus } from 'lucide-react';
import { useDjSet } from '../hooks/useDjSet';
import { useDjDiscoveries, type DjActDiscoveries } from '../hooks/useDjDiscoveries';
import { useUsers } from '../hooks/useUsers';
import { useOfficePresence } from '../hooks/useOfficePresence';
import { useOpenItem } from '../hooks/useOpenItem';
import { useResolveAndOpen } from '../hooks/useResolveAndOpen';
import { albumQueryOptions, type AlbumTrack } from '../hooks/useAlbumBrowse';
import { actDrivers, splitRoom } from '../lib/discover';
import { indicesToUndo } from '../lib/homeData';
import { getActiveProvider } from '../providers';
import { useToast } from './common/Toast';
import { useTrackContextMenu } from './common/ContextMenu';
import { PersonCard } from './common/PersonCard';
import { PillButton } from './common/PillButton';
import { TrackRow } from './common/TrackRow';
import { UserAvatar } from './common/UserAvatar';
import type { NormalizedQueueItem } from '../types/provider';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/DiscoverPanel.module.css';

interface Props {
  onAddToQueue: (item: SonosItem, position?: number, opts?: { attribute?: boolean }) => void;
  /** Marks whoever is using this copy of the app, so the room reads at a glance. */
  displayName?: string | null;
  /** The live queue, so Queue all can be undone. */
  queueItems?: NormalizedQueueItem[];
}

// DJ picks are the algorithm's, not the clicker's: never attribute them (leaderboard, Queuedle, the recommender).
const UNATTRIBUTED = { attribute: false };

/** The album, unless it's the single itself (the "Get Lucky (Radio Edit)" single of "Get Lucky"), which would only repeat the title. */
const albumLine = (t: AlbumTrack) =>
  t.albumName && !t.albumName.toLowerCase().startsWith(t.title.toLowerCase()) ? t.albumName : undefined;

/** One act: photo washed with its colour, who's behind it, and its tracks the office has never played. */
function ActCard({ group, viewer, onAdd }: { group: DjActDiscoveries; viewer?: string | null; onAdd: (t: AlbumTrack) => void }) {
  const { act } = group;
  // Just you, on every card, says nothing.
  const drivers = actDrivers(act.because, act.artist, viewer);
  const queryClient = useQueryClient();
  const openItem = useOpenItem();
  const { resolveAndOpen } = useResolveAndOpen();
  const { showTrackMenu } = useTrackContextMenu();

  const albumItem = (t: AlbumTrack) =>
    t.albumId
      ? ({
          title: t.albumName ?? t.title,
          type: 'ITEM_ALBUM',
          resource: { type: 'ALBUM', id: { objectId: t.albumId, serviceId: t.id.serviceId ?? '', accountId: t.id.accountId ?? '' } },
        } as SonosItem)
      : null;
  const openAlbum = (t: AlbumTrack) => {
    const item = albumItem(t);
    if (item) openItem(item);
    else void resolveAndOpen(t.albumName || t.title, 'album', { artist: act.artist, serviceId: act.serviceId, accountId: act.accountId });
  };
  const prefetchAlbum = (t: AlbumTrack) => {
    if (t.albumId && t.id.serviceId && t.id.accountId)
      void queryClient.prefetchQuery(albumQueryOptions(t.albumId, t.id.serviceId, t.id.accountId, undefined));
  };
  const openArtist = () =>
    openItem({
      type: 'ARTIST',
      title: act.artist,
      name: act.artist,
      resource: { type: 'ARTIST', id: { objectId: act.artistId, serviceId: act.serviceId, accountId: act.accountId } },
    } as SonosItem);

  return (
    <PersonCard
      name={act.artist}
      imageUrl={group.imageUrl}
      caption={drivers === 'You' ? undefined : drivers}
      onOpen={openArtist}
      openLabel={`Open ${act.artist}`}
    >
      <ul className={styles.tracks}>
        {group.tracks.map((t) => (
          <TrackRow
            key={t.id.objectId ?? t.title}
            title={t.title}
            imageUrl={t.artUrl}
            reason={albumLine(t)}
            explicit={t.explicit}
            onOpen={() => openAlbum(t)}
            onMouseEnter={() => prefetchAlbum(t)}
            onAdd={() => onAdd(t)}
            onContextMenu={(e) =>
              showTrackMenu(
                {
                  track: {
                    uri: t.id.objectId ?? '',
                    trackName: t.title,
                    artist: act.artist,
                    albumName: t.albumName ?? undefined,
                    imageUrl: t.artUrl ?? undefined,
                    serviceId: t.id.serviceId ?? '',
                    accountId: t.id.accountId ?? '',
                    addedBy: '',
                    addedAt: 0,
                  },
                  sonosItem: t.raw,
                },
                e,
              )
            }
          />
        ))}
      </ul>
    </PersonCard>
  );
}

/** Skeleton act cards at the real card size, so nothing shifts when the acts arrive. */
function SkeletonGrid() {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={styles.skelCard}>
          <div className={`skeleton ${styles.skelHead}`} style={{ animationDelay: `${i * 80}ms` }} />
          {[0, 1, 2].map((r) => (
            <div key={r} className={styles.skelRow}>
              <div className={`skeleton ${styles.skelThumb}`} style={{ animationDelay: `${i * 80}ms` }} />
              <div className={`skeleton ${styles.skelLine}`} style={{ animationDelay: `${i * 80}ms` }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function DiscoverPanel({ onAddToQueue, displayName, queueItems = [] }: Props) {
  const { showToast } = useToast();
  // Include yourself: you're in the room, and the picks are partly yours.
  const { data: users = [] } = useUsers(true, true);
  // Empty selection means "let presence, or the server, work out who's in the room".
  const [selected, setSelected] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);

  const { data: presence } = useOfficePresence();

  // Stable primitive key: the array identity changes on every presence poll even
  // when the room hasn't, which would rebuild opts and refetch the set endlessly.
  const roomKey = (presence?.inOffice ?? []).join(',');
  const inOffice = useMemo(() => (roomKey ? roomKey.split(',') : []), [roomKey]);
  const opts = useMemo(() => ({ users: selected.length ? selected : inOffice, limit: 25 }), [selected, inOffice]);
  const { data, isLoading, isFetching, refetch } = useDjSet(opts);
  const { discoveries, groups, isLoading: loadingNew } = useDjDiscoveries(data?.artists);
  const busy = isLoading || loadingNew;

  const room = splitRoom(users, {
    selected,
    inOffice,
    listeners: data?.inferredListeners ? data.listeners : [],
  });

  function toggle(userId: string) {
    const base = room.basis === 'everyone' ? [] : room.present.map((u) => u.userId);
    setSelected(base.includes(userId) ? base.filter((u) => u !== userId) : [...base, userId]);
  }

  const presenceByUser = new Map((presence?.detail ?? []).map((d) => [d.userId, d]));
  function statusFor(userId: string): string {
    const d = presenceByUser.get(userId);
    if (!d) return `${userId} — no Teams presence`;
    const where =
      d.workLocationType === 'office'
        ? 'in the office'
        : d.workLocationType === 'remote'
          ? 'working remotely'
          : d.workLocationType === 'timeOff'
            ? 'off today'
            : 'location unknown';
    return `${userId} — ${where}, ${d.availability ?? 'unknown'}`;
  }

  // One sentence when the room isn't simply "who's detected in the office".
  const note =
    room.basis === 'queueing'
      ? "Nobody's been detected in the office, so this is for whoever's been queueing today."
      : room.basis === 'everyone'
        ? "Nobody's been detected in the office or queueing today, so this is for everyone. Add people to narrow it down."
        : room.basis === 'presence' && presence?.basis === 'rostered'
          ? "Going by today's rostered work locations: nobody's been detected in the office yet."
          : room.basis === 'presence' && presence?.basis === 'availability'
            ? "Going by who's online in Teams, which includes people working from home."
            : null;

  const queueRef = useRef(queueItems);
  useEffect(() => {
    queueRef.current = queueItems;
  }, [queueItems]);

  // Interleaved by act, so a bulk add doesn't play three Muse tracks back to back. Undo matches Home's.
  function queueAll() {
    const added = discoveries.map((d) => ({ id: d.track.id.objectId ?? '', title: d.track.title, artist: d.artist }));
    discoveries.forEach((d) => onAddToQueue(d.track.raw, -1, UNATTRIBUTED));
    showToast(`Queued ${added.length} track${added.length === 1 ? '' : 's'}`, 'info', {
      durationMs: 6000,
      action: {
        label: 'Undo',
        onClick: () => {
          // Only what is still in the queue from this batch; anything else is left alone.
          const indices = indicesToUndo(queueRef.current, added);
          if (indices.length) void getActiveProvider().removeFromQueue(indices).catch(() => showToast('Could not undo'));
        },
      },
    });
  }

  const face = (u: (typeof users)[number], inSet: boolean) => (
    <li key={u.userId}>
      <button
        type="button"
        className={`${styles.face}${inSet ? '' : ' ' + styles.faceAway}`}
        aria-pressed={inSet}
        title={statusFor(u.userId)}
        onClick={() => toggle(u.userId)}
      >
        <UserAvatar name={u.userId} imageUrl={u.imageUrl} className={styles.faceAvatar} />
        <span className={styles.faceName}>
          {u.userId}
          {u.userId === displayName && <span className={styles.you}> (you)</span>}
        </span>
      </button>
    </li>
  );
  const visible = room.basis === 'everyone' ? [] : room.present;
  const hidden = room.basis === 'everyone' ? room.present : room.away;

  return (
    <div className={styles.panel}>
      <div className={`page-scale ${styles.page}`}>
        <header className={styles.hero}>
          <div>
            <h1 className={styles.title}>Discover</h1>
            <p className={styles.premise}>Tracks the office has never played, by acts the room already likes.</p>
          </div>
          <div className={styles.actions}>
            <PillButton onClick={() => refetch()} disabled={isFetching} title="Shuffle the set">
              <RefreshCw size={14} className={isFetching ? styles.spinning : undefined} aria-hidden="true" /> Refresh
            </PillButton>
            <PillButton onClick={queueAll} disabled={busy || discoveries.length === 0} title="Add every pick to the queue">
              <ListPlus size={14} aria-hidden="true" /> Queue all
            </PillButton>
          </div>
        </header>

        <section className={styles.room} aria-label="Who it's for">
          <div className={styles.forLine}>
            <span className={styles.forLabel}>For</span>
            {room.basis === 'everyone' && <span className={styles.everyone}>everyone</span>}
            <ul className={styles.faces}>
              {visible.map((u) => face(u, true))}
              {showAll && hidden.map((u) => face(u, false))}
              {hidden.length > 0 && (
                <li>
                  <button
                    type="button"
                    className={styles.more}
                    aria-expanded={showAll}
                    onClick={() => setShowAll((v) => !v)}
                  >
                    {showAll ? 'Show fewer' : `+${hidden.length}`}
                  </button>
                </li>
              )}
              {selected.length > 0 && (
                <li>
                  <button type="button" className={styles.link} onClick={() => setSelected([])}>
                    Back to who&apos;s in
                  </button>
                </li>
              )}
            </ul>
          </div>
          {note && <p className={styles.note}>{note}</p>}
        </section>

        {busy ? (
          <SkeletonGrid />
        ) : data?.error ? (
          <p className={styles.empty}>Couldn&apos;t build a set: {data.error}</p>
        ) : groups.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>
              {data?.artists.length ? 'Nothing new to suggest' : 'Not enough history yet'}
            </p>
            <p>
              {data?.artists.length
                ? 'The office has already played the top songs of every act this room likes. Try different people, or refresh.'
                : 'Queue a few more tracks and come back: picks come from what the office plays.'}
            </p>
          </div>
        ) : (
          <div className={styles.grid}>
            {groups.map((g) => (
              <ActCard
                key={g.act.artist}
                group={g}
                viewer={displayName}
                onAdd={(t) => onAddToQueue(t.raw, -1, UNATTRIBUTED)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
