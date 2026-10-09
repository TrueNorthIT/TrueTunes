import { useState, useMemo } from 'react';
import { Compass, Plus, RefreshCw, ListPlus } from 'lucide-react';
import { useDjSet } from '../hooks/useDjSet';
import { useDjDiscoveries } from '../hooks/useDjDiscoveries';
import { useUsers } from '../hooks/useUsers';
import { useOfficePresence } from '../hooks/useOfficePresence';
import { useImage } from '../hooks/useImage';
import { UserAvatar } from './common/UserAvatar';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/DiscoverPanel.module.css';

interface Props {
  onAddToQueue: (item: SonosItem, position?: number, opts?: { attribute?: boolean }) => void;
  /** Marks whoever is using this copy of the app, so the room reads at a glance. */
  displayName?: string | null;
}

/** DJ picks arrive as bare ids; the queue path wants a Sonos item. */
function toSonosItem(track: DjTrack): SonosItem {
  return {
    title: track.trackName,
    type: 'ITEM_TRACK',
    subtitle: track.artist,
    imageUrl: track.imageUrl,
    resource: {
      type: 'TRACK',
      id: {
        objectId: track.uri,
        serviceId: track.serviceId ?? '',
        accountId: track.accountId ?? '',
      },
    },
  } as SonosItem;
}

interface DjRowTrack {
  trackName: string;
  artist: string;
  imageUrl?: string;
  because: string;
}

function DjRow({ track, onAdd }: { track: DjRowTrack; onAdd: () => void }) {
  const art = useImage(track.imageUrl ?? null);
  return (
    <div className={styles.row}>
      {art ? (
        <img className={styles.art} src={art} alt="" loading="lazy" />
      ) : (
        <div className={styles.artPlaceholder} />
      )}
      <div className={styles.rowText}>
        <div className={styles.trackName}>{track.trackName}</div>
        <div className={styles.artist}>{track.artist}</div>
        <div className={styles.because}>{track.because}</div>
      </div>
      <button className={styles.addBtn} onClick={onAdd} title="Add to queue">
        <Plus size={16} />
      </button>
    </div>
  );
}

type Mode = 'familiar' | 'discover';

export function DiscoverPanel({ onAddToQueue, displayName }: Props) {
  // Include yourself: you're in the room, and the picks are partly yours.
  const { data: users } = useUsers(true, true);
  // Empty selection means "let the server work out who's in the room".
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('discover');

  const { data: presence } = useOfficePresence();

  // Graph knows who's actually in the building; the server's queue-activity
  // guess is the fallback when nobody has consented or set a work location.
  const roomFromGraph = presence?.inOffice ?? [];
  // Stable primitive key: the array identity changes on every presence poll even
  // when the room hasn't, which would rebuild opts and refetch the set endlessly.
  const roomKey = roomFromGraph.join(',');
  const opts = useMemo(
    () => ({
      users: selected.length ? selected : roomKey ? roomKey.split(',') : [],
      limit: 25,
    }),
    [selected, roomKey],
  );
  const { data, isLoading, isFetching, refetch } = useDjSet(opts);

  // Only browse the music service once the user actually asks for new material —
  // it costs one round trip per act.
  const { discoveries, isLoading: loadingNew } = useDjDiscoveries(
    data?.artists,
    mode === 'discover',
  );

  const tracks =
    mode === 'discover'
      ? discoveries.map((d) => ({
          uri: d.track.id.objectId,
          trackName: d.track.title,
          artist: d.artist,
          imageUrl: d.track.artUrl ?? undefined,
          score: d.score,
          because: d.because,
          item: d.track.raw,
        }))
      : (data?.tracks ?? []).map((t) => ({ ...t, imageUrl: t.imageUrl, item: toSonosItem(t) }));

  const busy = isLoading || (mode === 'discover' && loadingNew);

  function toggle(userId: string) {
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((u) => u !== userId) : [...prev, userId],
    );
  }

  // Presence tells us who's actually in the building; anyone it can't vouch for
  // is listed separately rather than silently mixed in with the room.
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

  const here = (users ?? []).filter((u) => roomFromGraph.includes(u.userId));
  const away = (users ?? []).filter((u) => !roomFromGraph.includes(u.userId));
  const chipGroups = [
    { key: 'here' as const, label: presence?.basis === 'sensed' ? 'In the office' : 'Around', users: here },
    { key: 'away' as const, label: 'Not in today', users: away },
  ];

  function queueAll() {
    for (const track of tracks) onAddToQueue(track.item, -1, { attribute: false });
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <Compass size={20} className={styles.titleIcon} />
          <span className={styles.title}>Discover</span>
        </div>
        <p className={styles.blurb}>
          Music for whoever&apos;s in the room, from what the office actually plays. Picks are
          scored so the least keen listener still gets a say.
        </p>
        <div className={styles.actions}>
          <div className={styles.modeTabs}>
            <button
              className={`${styles.modeBtn}${mode === 'discover' ? ' ' + styles.modeBtnActive : ''}`}
              onClick={() => setMode('discover')}
              title="Music by acts the room likes that the office has never played"
            >
              New music
            </button>
            <button
              className={`${styles.modeBtn}${mode === 'familiar' ? ' ' + styles.modeBtnActive : ''}`}
              onClick={() => setMode('familiar')}
              title="Tracks the office already plays"
            >
              Favourites
            </button>
          </div>
          <button
            className={styles.ghostBtn}
            onClick={() => refetch()}
            disabled={isFetching}
            title="Shuffle the set"
          >
            <RefreshCw size={14} className={isFetching ? styles.spinning : undefined} />
            Refresh
          </button>
          <button
            className={styles.primaryBtn}
            onClick={queueAll}
            disabled={tracks.length === 0}
            title="Add every pick to the queue"
          >
            <ListPlus size={14} />
            Queue all {tracks.length > 0 && `(${tracks.length})`}
          </button>
        </div>
      </div>

      <div className={styles.listenerBar}>
        <span className={styles.listenerLabel}>Playing for</span>

        {/* Split by where people actually are. A single flat list gave no clue
            which names were driving the picks, so the set looked arbitrary. */}
        {chipGroups.map((group) => (
          group.users.length > 0 && (
            <div className={styles.chipGroup} key={group.key}>
              <span className={styles.chipGroupLabel}>{group.label}</span>
              <div className={styles.chips}>
                {group.users.map((u) => {
                  const active = selected.includes(u.userId);
                  const inRoom = selected.length === 0 && group.key === 'here';
                  return (
                    <button
                      key={u.userId}
                      className={[
                        styles.chip,
                        active ? styles.chipActive : '',
                        inRoom ? styles.chipInferred : '',
                        group.key === 'away' ? styles.chipAway : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => toggle(u.userId)}
                      title={statusFor(u.userId)}
                    >
                      <UserAvatar name={u.userId} imageUrl={u.imageUrl} className={styles.chipAvatar} />
                      {u.userId}
                      {u.userId === displayName && <span className={styles.chipYou}>you</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )
        ))}
        {selected.length === 0 && (
          <span className={styles.hint}>
            {presence?.basis === 'sensed'
              ? `detected in the office (${roomFromGraph.length})`
              : presence?.basis === 'rostered'
                ? `rostered in today (${roomFromGraph.length}) — nobody's been detected, so this is their calendar not their whereabouts`
                : presence?.basis === 'availability'
                  ? `online in Teams (${roomFromGraph.length}) — no work locations set, so this includes people at home`
                  : data?.inferredListeners && data.listeners.length > 0
                    ? `whoever's been queueing today (${data.listeners.length})`
                    : 'the whole office — pick names to narrow it down'}
          </span>
        )}
      </div>

      <div className={styles.list}>
        {busy && (
          <div className={styles.empty}>
            {mode === 'discover' ? 'Digging for something new…' : 'Reading the room…'}
          </div>
        )}
        {!busy && data?.error && (
          <div className={styles.empty}>Couldn&apos;t build a set: {data.error}</div>
        )}
        {!busy && !data?.error && tracks.length === 0 && (
          <div className={styles.empty}>
            {mode === 'discover'
              ? 'Nothing new found — the office has played everything these acts offer.'
              : 'Not enough history yet — queue a few more tracks and come back.'}
          </div>
        )}
        {tracks.map((track) => (
          <DjRow
            key={track.uri}
            track={track}
            onAdd={() => onAddToQueue(track.item, -1, { attribute: false })}
          />
        ))}
      </div>
    </div>
  );
}
