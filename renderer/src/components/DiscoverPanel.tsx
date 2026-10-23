import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Shuffle, ListPlus } from 'lucide-react';
import { djSetQueryOptions } from '../hooks/useDjSet';
import { useDjDiscoveries, type DjActDiscoveries } from '../hooks/useDjDiscoveries';
import { useUsers } from '../hooks/useUsers';
import { useOfficePresence } from '../hooks/useOfficePresence';
import { useOpenItem } from '../hooks/useOpenItem';
import { useResolveAndOpen } from '../hooks/useResolveAndOpen';
import { albumQueryOptions, type AlbumTrack } from '../hooks/useAlbumBrowse';
import { actDrivers, interleave, splitRoom } from '../lib/discover';
import { indicesToUndo } from '../lib/homeData';
import { getActiveProvider } from '../providers';
import { useToast } from './common/Toast';
import { useTrackContextMenu } from './common/ContextMenu';
import { PickInfoTip } from './common/PickInfoTip';
import { PersonCard } from './common/PersonCard';
import { PillButton } from './common/PillButton';
import { TrackRow } from './common/TrackRow';
import { UserAvatar } from './common/UserAvatar';
import type { NormalizedQueueItem } from '../types/provider';
import { albumItem, artistItem, trackPayload } from '../lib/itemHelpers';
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
const MAX_FACES = 8;

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

  const albumItemOf = (t: AlbumTrack) =>
    t.albumId
      ? albumItem(t.albumName ?? t.title, { objectId: t.albumId, serviceId: t.id.serviceId ?? '', accountId: t.id.accountId ?? '' })
      : null;
  const openAlbum = (t: AlbumTrack) => {
    const item = albumItemOf(t);
    if (item) openItem(item);
    else void resolveAndOpen(t.albumName || t.title, 'album', { artist: act.artist, serviceId: act.serviceId, accountId: act.accountId });
  };
  const prefetchAlbum = (t: AlbumTrack) => {
    if (t.albumId && t.id.serviceId && t.id.accountId)
      void queryClient.prefetchQuery(albumQueryOptions(t.albumId, t.id.serviceId, t.id.accountId, undefined));
  };
  const openArtist = () =>
    openItem(artistItem(act.artist, { objectId: act.artistId, serviceId: act.serviceId, accountId: act.accountId }, { title: act.artist }));

  return (
    <PersonCard
      name={act.artist}
      imageUrl={group.imageUrl}
      caption={drivers === 'You' ? undefined : drivers}
      action={<PickInfoTip because={act.because} fans={act.fans} score={act.score} viewer={viewer} kind="unheard" />}
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
                  track: trackPayload({
                    uri: t.id.objectId ?? '',
                    trackName: t.title,
                    artist: act.artist,
                    albumName: t.albumName,
                    imageUrl: t.artUrl ?? undefined,
                    serviceId: t.id.serviceId,
                    accountId: t.id.accountId,
                  }),
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
  // Shuffle steps every act to its next unheard songs. The set itself is deterministic, so refetching it changes nothing.
  const [round, setRound] = useState(0);

  const { data: presence } = useOfficePresence();

  // Stable primitive key: the array identity changes on every presence poll even
  // when the room hasn't, which would rebuild opts and refetch the set endlessly.
  const roomKey = (presence?.inOffice ?? []).join(',');
  const inOffice = useMemo(() => (roomKey ? roomKey.split(',') : []), [roomKey]);
  const opts = useMemo(() => ({ users: selected.length ? selected : inOffice, limit: 25 }), [selected, inOffice]);
  // Keep the current cards (dimmed) while a new room's set loads, rather than flashing back to a skeleton.
  const { data, isLoading, isError, isPlaceholderData, refetch } = useQuery({ ...djSetQueryOptions(opts), placeholderData: keepPreviousData });
  const queued = useMemo(() => queueItems.map((q) => ({ title: q.track.title, artist: q.track.artist })), [queueItems]);
  const { groups: fresh, isLoading: browsing } = useDjDiscoveries(data?.artists, true, { queued, round });
  // A new room's acts may all be unbrowsed at first: hold the last settled cards until some arrive.
  const sig = fresh.map((g) => g.act.artist + ':' + g.tracks.map((t) => t.id.objectId).join()).join('|');
  const [held, setHeld] = useState<{ sig: string; groups: DjActDiscoveries[] }>({ sig: '', groups: [] });
  if (!browsing && fresh.length > 0 && held.sig !== sig) setHeld({ sig, groups: fresh });
  const groups = fresh.length === 0 && browsing ? held.groups : fresh;
  // Exactly what's on the page, one act at a time so a bulk add doesn't play three Muse tracks back to back.
  const shown = interleave(groups, Infinity);
  const loading = groups.length === 0 && (isLoading || browsing);
  const stale = groups.length > 0 && (isPlaceholderData || browsing);
  const failed = !isPlaceholderData && (isError || !!data?.error);

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

  // Undo matches Home's.
  function queueAll() {
    const added = shown.map(({ act, track }) => ({ id: track.id.objectId ?? '', title: track.title, artist: act.artist }));
    shown.forEach(({ track }) => onAddToQueue(track.raw, -1, UNATTRIBUTED));
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
  // About one row of faces at 1280; the rest of the set and everyone else wait behind +N.
  const inSet = room.basis === 'everyone' ? [] : room.present;
  const visible = inSet.slice(0, MAX_FACES);
  const hiddenIn = inSet.slice(MAX_FACES);
  const hiddenOut = room.basis === 'everyone' ? room.present : room.away;
  const hiddenCount = hiddenIn.length + hiddenOut.length;

  return (
    <div className={styles.panel}>
      <div className={`page-scale ${styles.page}`}>
        <header className={styles.hero}>
          <div>
            <h1 className={styles.title}>Discover</h1>
            <p className={styles.premise}>Tracks the office has never played, by acts the room already likes.</p>
          </div>
          <div className={styles.actions}>
            <PillButton onClick={() => setRound((r) => r + 1)} disabled={groups.length === 0} title="Show other unheard songs by these acts">
              <Shuffle size={14} aria-hidden="true" /> Shuffle
            </PillButton>
            <PillButton onClick={queueAll} disabled={stale || shown.length === 0} title="Add every pick to the queue">
              <ListPlus size={14} aria-hidden="true" /> Queue all{shown.length > 0 && ` (${shown.length})`}
            </PillButton>
          </div>
        </header>

        <section className={styles.room} aria-label="Who it's for">
          <div className={styles.forLine}>
            <span className={styles.forLabel}>For</span>
            {room.basis === 'everyone' && <span className={styles.everyone}>everyone</span>}
            <ul className={styles.faces}>
              {visible.map((u) => face(u, true))}
              {showAll && hiddenIn.map((u) => face(u, true))}
              {showAll && hiddenOut.map((u) => face(u, false))}
              {hiddenCount > 0 && (
                <li>
                  <button
                    type="button"
                    className={styles.more}
                    aria-expanded={showAll}
                    onClick={() => setShowAll((v) => !v)}
                  >
                    {showAll ? 'Show fewer' : `+${hiddenCount}`}
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

        {loading ? (
          <SkeletonGrid />
        ) : failed && groups.length === 0 ? (
          <div className={styles.empty} role="alert">
            <p className={styles.emptyTitle}>Couldn&apos;t load picks right now</p>
            <p>The office history or the music service didn&apos;t answer. It&apos;s usually brief.</p>
            <PillButton className={styles.retry} onClick={() => refetch()}>Try again</PillButton>
          </div>
        ) : groups.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>
              {data?.artists.length ? 'Nothing new to suggest' : 'Not enough history yet'}
            </p>
            <p>
              {data?.artists.length
                ? 'The top songs of every act this room likes have already been played or queued. Try different people.'
                : 'Queue a few more tracks and come back: picks come from what the office plays.'}
            </p>
          </div>
        ) : (
          <div className={`${styles.grid}${stale ? ' ' + styles.stale : ''}`} aria-busy={stale}>
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
