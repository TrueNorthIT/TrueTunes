// The stateful demo backend: an in-memory simulation of the office Sonos system and its Azure Functions, behind the
// same `window.sonos` bridge the app uses everywhere. It layers writes that actually work over the Storybook mock
// (reads, catalogue and office data come from ../../test). Nothing here touches the network: it never calls `fetch`
// or opens a socket, so it cannot reach the office speakers. No Math.random: the same calls give the same state.

import * as az from '../../test/fixtures/azure';
import { artUrl } from '../../test/fixtures/art';
import { TRACKS, albumById, topSongsOf, trackById, type CatTrack } from '../../test/fixtures/catalog';
import { ME } from '../../test/fixtures/people';
import { GROUP_ID, QUEUE_ID, queueItem, sonosTrack } from '../../test/fixtures/sonosShapes';
import { COORDINATOR_ID, NOW_PLAYING_INDEX, QUEUE_TRACKS, createMockBackend } from '../../test/mockBackend';
import { sonosDefaults } from '../../test/sonosFake';
import { applyReorderLocally } from '../../lib/queueHelpers';

type PlayState = 'PLAYING' | 'PAUSED' | 'IDLE';
type WsListener = (header: unknown, payload: unknown) => void;
interface Entry {
  uid: number;
  track: CatTrack;
}

const START_POSITION_MS = 83_000;
const START_VOLUME = 35;
const DEMO_POLL: PollAdminItem = {
  id: 'demo-poll-1',
  question: 'What should the office play on Friday afternoons?',
  choices: ['Something upbeat', 'Soft focus music', 'Whatever the room picks', 'Silence, please'],
  liveFrom: '2026-10-26',
  live: true,
};
const SEED_PLAYLISTS = [az.ROAD_TRIP_ID, 'pl-focus', 'pl-sunday'];

const live = new Set<() => void>();
/** Stop every demo backend's timer and drop its subscribers (the runtime's undo calls this). */
export function disposeDemoBackends(): void {
  [...live].forEach((d) => d());
}

const clone = <T>(v: T): T => structuredClone(v);
const later = (fn: () => void) => void Promise.resolve().then(fn);
const ok = { ok: true } as const;

/** The tracks a piece of content stands for, as the app names it in an add or a loadContent. */
function tracksOf(type: string, id: string): CatTrack[] {
  switch (type.replace(/^ITEM_/, '').toUpperCase()) {
    case 'TRACK': {
      const t = trackById(id);
      return t ? [t] : [];
    }
    case 'ALBUM':
      return albumById(id)?.tracks ?? [];
    case 'ARTIST':
      return topSongsOf(id);
    case 'PLAYLIST':
      return id.startsWith('topsongs-') ? topSongsOf(id.slice('topsongs-'.length)) : TRACKS.slice(0, 12);
    default:
      return [];
  }
}

const ints = (csv: string | undefined) =>
  (csv ?? '')
    .split(',')
    .filter((s) => s.trim() !== '')
    .map(Number);

export function createDemoBackend(): SonosPreload {
  const mock = createMockBackend();

  // ── State ──
  let name = ME;
  let uid = 0;
  const entry = (track: CatTrack): Entry => ({ uid: ++uid, track });
  let queue: Entry[] = QUEUE_TRACKS.map(entry);
  let cur: number | null = queue[NOW_PLAYING_INDEX].uid;
  let state: PlayState = 'PLAYING';
  let anchorPos = START_POSITION_MS;
  let anchorAt = Date.now();
  let volume = START_VOLUME;
  const modes = { shuffle: false, repeat: false, repeatOne: false, crossfade: false };
  let version = 1;
  const attribution: AttributionMap = Object.fromEntries(QUEUE_TRACKS.map((t, i) => [t.id, az.attributionFor(t, i)]));
  const profileImages = new Map<string, string>();

  const wsSubs = new Set<WsListener>();
  const mapSubs = new Set<(m: AttributionMap) => void>();
  const eventSubs = new Set<(e: AttributionEvent) => void>();
  const entraSubs = new Set<(u: EntraUser) => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const etag = () => `demo-queue-v${version}`;
  const curIdx = () => (cur === null ? -1 : queue.findIndex((e) => e.uid === cur));
  const current = () => queue[curIdx()] as Entry | undefined;
  const durOf = (e: Entry) => e.track.durationSec * 1000;
  const pos = () => (state === 'PLAYING' ? anchorPos + (Date.now() - anchorAt) : anchorPos);
  const setPos = (ms: number) => {
    anchorPos = ms;
    anchorAt = Date.now();
  };

  /** Move to the track after `idx` as a track end or a skip would; false (and stopped) when the queue is over. */
  function stepForward(): boolean {
    const idx = curIdx();
    const next = idx + 1 < queue.length ? idx + 1 : modes.repeat ? 0 : -1;
    if (next < 0) {
      state = 'IDLE';
      setPos(0);
      return false;
    }
    cur = queue[next].uid;
    setPos(0);
    return true;
  }

  /** Apply any track ends that have passed since the last look. True when the track or state changed. */
  function sync(): boolean {
    let changed = false;
    for (let guard = 0; guard < 1000 && state === 'PLAYING'; guard++) {
      const e = current();
      if (!e || pos() < durOf(e)) break;
      const over = pos() - durOf(e);
      changed = true;
      if (modes.repeatOne) setPos(over);
      else if (stepForward()) setPos(over);
      else break;
    }
    return changed;
  }

  function payload() {
    sync();
    const e = current();
    return {
      playback: {
        playbackState: `PLAYBACK_STATE_${state}`,
        positionMillis: Math.round(pos()),
        ...(e ? { itemId: String(curIdx() + 1) } : {}),
        queueId: QUEUE_ID,
        queueVersion: etag(),
        playModes: { ...modes },
      },
      ...(e ? { metadata: { currentItem: { track: sonosTrack(e.track) } } } : {}),
    };
  }

  const emit = (namespace: string, body: unknown) => wsSubs.forEach((cb) => cb({ namespace, groupId: GROUP_ID }, body));
  const pushVolume = () => emit('groupVolume', { volume });
  const pushPlayback = () => emit('playbackExtended', payload());

  /** One timer, at the end of the playing track. Pushes only on real changes: the app extrapolates the position. */
  function schedule() {
    clearTimeout(timer);
    timer = undefined;
    const e = current();
    if (disposed || state !== 'PLAYING' || !e) return;
    timer = setTimeout(
      () => {
        pushPlayback();
        schedule();
      },
      Math.max(0, durOf(e) - pos())
    );
  }

  /** Every state change ends here: settle, re-arm the timer, tell the app. */
  const changed = () => {
    sync();
    schedule();
    pushPlayback();
    return ok;
  };

  // ── Queue edits ──
  function insert(tracks: CatTrack[], at: number): Entry[] {
    const added = tracks.map(entry);
    const i = at < 0 || at >= queue.length ? queue.length : at;
    queue = [...queue.slice(0, i), ...added, ...queue.slice(i)];
    if (cur === null && queue.length) cur = queue[0].uid;
    version++;
    return added;
  }

  function removeAt(indices: number[]) {
    const gone = new Set(indices);
    const wasIdx = curIdx();
    queue = queue.filter((_, i) => !gone.has(i));
    if (cur !== null && gone.has(wasIdx)) {
      // The playing entry went: whatever slid into its slot plays from the start, or the speakers go quiet.
      cur = queue.length ? queue[Math.min(wasIdx, queue.length - 1)].uid : null;
      setPos(0);
      if (cur === null) state = 'IDLE';
    }
    version++;
    return changed();
  }

  function reorder(from: number[], to: number) {
    if (!from.length) return ok;
    if (!from.every((i) => Number.isInteger(i) && i >= 0 && i < queue.length) || !(to >= 0))
      return { error: 'Invalid reorder' };
    queue = applyReorderLocally(queue, from, to);
    version++;
    return changed();
  }

  function addResource(req: FetchRequest): FetchResponse {
    const given = req.headers?.['If-Match'];
    if (given && given !== etag()) return { error: 'Precondition failed: the queue has changed (stale If-Match)' };
    const body = req.body as { id?: { objectId?: string }; type?: string } | undefined;
    const tracks = tracksOf(body?.type ?? 'TRACK', body?.id?.objectId ?? '');
    if (!tracks.length) return { error: `Nothing to add for ${body?.type ?? 'TRACK'} ${body?.id?.objectId ?? ''}` };
    insert(tracks, Number(req.query?.position ?? -1));
    changed();
    return { data: {}, etag: etag() };
  }

  function loadContent(p: Record<string, unknown>) {
    const id = (p.id ?? (p.resource as { id?: unknown } | undefined)?.id) as { objectId?: string } | undefined;
    const tracks = tracksOf(String(p.type ?? 'TRACK'), id?.objectId ?? '');
    if (!tracks.length) return { error: 'Nothing to load' };
    const action = String(p.queueAction ?? '');
    if (action === 'REPLACE') {
      queue = [];
      cur = null;
    }
    const added = insert(tracks, action === 'APPEND' ? -1 : action === 'REPLACE' ? 0 : curIdx() + 1);
    if (action !== 'APPEND' && action !== 'INSERT_NEXT') {
      cur = added[0].uid;
      setPos(0);
      state = 'PLAYING';
    }
    return changed();
  }

  // ── Transport ──
  const play = () => {
    sync();
    if (!current()) return { error: 'Queue is empty' };
    if (state !== 'PLAYING') {
      state = 'PLAYING';
      anchorAt = Date.now();
    }
    return changed();
  };
  const pause = () => {
    sync();
    if (state === 'PLAYING') {
      anchorPos = pos();
      state = 'PAUSED';
    }
    return changed();
  };
  const skipNext = () => {
    sync();
    if (current()) stepForward();
    return changed();
  };
  const skipPrev = () => {
    sync();
    const idx = curIdx();
    if (idx < 0) return changed();
    // Like a real player: past the first few seconds it restarts the track, otherwise it goes back one.
    if (pos() > 3000 || idx === 0) setPos(0);
    else {
      cur = queue[idx - 1].uid;
      setPos(0);
    }
    return changed();
  };
  const skipToTrack = (n: number) => {
    if (!Number.isInteger(n) || n < 1 || n > queue.length) return { error: `No track ${n}` };
    cur = queue[n - 1].uid;
    setPos(0);
    state = 'PLAYING';
    return changed();
  };
  const seek = (ms: number) => {
    sync();
    const e = current();
    if (!e || !Number.isFinite(ms)) return { error: 'Nothing to seek' };
    setPos(Math.min(Math.max(0, ms), durOf(e)));
    return changed();
  };

  const setModes = (m: Record<string, unknown>) => {
    for (const k of ['shuffle', 'repeat', 'repeatOne', 'crossfade'] as const) {
      if (typeof m[k] === 'boolean') modes[k] = m[k];
    }
    return changed();
  };

  // ── Playlists ──
  const playlists = new Map<string, PlaylistDoc>();
  const deleted = new Set<string>();
  let playlistSeq = 0;
  const getDoc = (id: string): PlaylistDoc | undefined => {
    if (deleted.has(id)) return undefined;
    if (!playlists.has(id)) {
      const seeded = az.playlistDoc(id);
      if (seeded) playlists.set(id, seeded);
    }
    return playlists.get(id);
  };
  const need = (id: string): PlaylistDoc => {
    const d = getDoc(id);
    if (!d) throw new Error('playlist not found');
    return d;
  };
  const touched = (d: PlaylistDoc) => {
    d.trackCount = d.tracks.length;
    d.memberCount = d.members.length;
    d.updatedAt = Date.now();
    return clone(d);
  };
  const metaOf = ({ members: _m, tracks: _t, createdAt: _c, ...meta }: PlaylistDoc): PlaylistMeta => clone(meta);
  const favId = () => `fav-${name}`;

  // ── Queuedle ──
  const myScores = new Map<
    string,
    { score: GameScoreDoc; guesses: { main: Array<'left' | 'right'>; bonus: string[] } }
  >();
  const mineOn = (gameId: string, user: string) => myScores.get(`${gameId}|${user}`);

  // ── Polls ──
  const polls = new Map<string, PollAdminItem>([[DEMO_POLL.id, DEMO_POLL]]);
  let pollOrder = [DEMO_POLL.id];
  let pollSeq = 0;
  const pollList = () => pollOrder.map((id) => clone(polls.get(id)!));
  const pollInput = (i: PollInputPayload) =>
    i.question?.trim() && Array.isArray(i.choices) && i.choices.length >= 2 ? null : { error: 'Invalid poll' };

  const entra = (): EntraUser => ({ oid: 'demo-oid', name, email: 'demo@example.invalid' });

  // ── Fetch: the Sonos BFF operations that matter, the rest from the mock ──
  const sonosFetch = async (req: FetchRequest): Promise<FetchResponse> => {
    const q = req.query ?? {};
    switch (req.operationId) {
      case 'getQueueResources': {
        sync();
        const offset = Number(q.offset ?? 0);
        const count = Number(q.count ?? 50);
        return { data: { items: queue.slice(offset, offset + count).map((e) => queueItem(e.track)) }, etag: etag() };
      }
      case 'addQueueResource':
        return addResource(req);
      case 'deleteQueueResources': {
        const r = q.items ? removeAt(ints(q.items)) : removeAt(queue.map((_, i) => i));
        return { data: r };
      }
      case 'reorderQueueResources': {
        const items = ints(q.items).sort((a, b) => a - b);
        const dest = ints(q.positions)[0];
        const run = items.map((i) => queue[i]);
        if (!items.length || run.some((e) => !e) || !(dest >= 0)) return { error: 'Invalid reorder' };
        const rest = queue.filter((_, i) => !items.includes(i));
        queue = [...rest.slice(0, dest), ...run, ...rest.slice(dest)];
        version++;
        changed();
        return { data: {}, etag: etag() };
      }
      case 'play':
        return { data: play() };
      case 'pause':
        return { data: pause() };
      case 'skipToNextTrack':
        return { data: skipNext() };
      case 'skipToPreviousTrack':
        return { data: skipPrev() };
      case 'setPlayMode':
        return { data: setModes((req.body ?? {}) as Record<string, unknown>) };
      case 'getPlaybackState':
        return { data: payload() };
      case 'getGroups':
        return { data: { groups: [{ id: GROUP_ID, name: 'Office speakers', coordinatorId: COORDINATOR_ID }] } };
      default:
        return mock.fetch!(req);
    }
  };

  const api: SonosPreload = {
    ...sonosDefaults,
    ...mock,

    // ── Live pushes ──
    onWsMessage: (cb) => {
      wsSubs.add(cb);
      later(() => {
        if (!wsSubs.has(cb)) return;
        cb({ namespace: 'groupVolume', groupId: GROUP_ID }, { volume });
        cb({ namespace: 'playbackExtended', groupId: GROUP_ID }, payload());
        schedule();
      });
      return () => void wsSubs.delete(cb);
    },
    onAttributionMap: (cb) => {
      mapSubs.add(cb);
      later(() => mapSubs.has(cb) && cb({ ...attribution }));
      return () => void mapSubs.delete(cb);
    },
    onAttributionEvent: (cb) => {
      eventSubs.add(cb);
      return () => void eventSubs.delete(cb);
    },
    onEntraReady: (cb) => {
      entraSubs.add(cb);
      later(() => entraSubs.has(cb) && cb(entra()));
      return () => void entraSubs.delete(cb);
    },

    // ── Sonos ──
    fetch: sonosFetch,
    refreshPlayback: async () => void pushPlayback(),
    resync: async () => {
      pushVolume();
      pushPlayback();
    },
    setGroup: async () => ok,
    setGroupVolume: async (v) => {
      if (typeof v !== 'number' || v < 0 || v > 100) return { error: 'Invalid volume' };
      volume = Math.round(v);
      pushVolume();
      return ok;
    },
    setQueueId: async () => {},
    loadContent: async (p) => loadContent(p),
    playAudioClip: async () => [{ playerId: COORDINATOR_ID, result: {} }],
    setPlayModes: async (m) => setModes(m),
    play: async () => play(),
    pause: async () => pause(),
    skipNext: async () => skipNext(),
    skipPrev: async () => skipPrev(),
    skipToTrack: async (n) => skipToTrack(n),
    seek: async (ms) => seek(ms),
    reorderQueue: async (from, to) => reorder(from, to),
    removeFromQueue: async (indices) => {
      if (!indices.every((i) => Number.isInteger(i) && i >= 0)) return { error: 'Invalid indices' };
      return removeAt(indices);
    },
    clearQueue: async () => removeAt(queue.map((_, i) => i)),
    djAutoplay: async () => ({
      enabled: true,
      leaseHeld: false,
      enqueue: null,
      upcoming: az
        .djSet()
        .tracks.filter((t) => !queue.some((e) => e.track.id === t.uri))
        .slice(0, 3),
      fillerUri: null,
    }),

    // ── Who am I ──
    getDisplayName: async () => name,
    setDisplayName: async (n) => {
      name = n.trim() || name;
      return null;
    },
    renameUser: async (oldName, newName) => {
      name = newName.trim() || name;
      for (const a of Object.values(attribution)) if (a.user === oldName) a.user = name;
      return ok;
    },
    getEntraUser: async () => entra(),
    fetchUserProfile: async (n) => {
      const img = profileImages.get(n);
      return img ? { id: n, imageUrl: img, updatedAt: Date.now() } : az.userProfile(n);
    },
    uploadProfileImage: async (n) => {
      const imageUrl = artUrl(`portrait:${n}`);
      profileImages.set(n, imageUrl);
      return { imageUrl };
    },

    // ── Attribution ──
    publishQueued: async (item) => {
      const entryNow: AttributionEntry = {
        user: name,
        timestamp: Date.now(),
        trackName: item.trackName,
        artist: item.artist,
      };
      attribution[item.uri] = entryNow;
      eventSubs.forEach((cb) => cb({ type: 'queued', eventType: item.eventType, uri: item.uri, ...entryNow }));
      mapSubs.forEach((cb) => cb({ ...attribution }));
    },
    refreshAttribution: async () => mapSubs.forEach((cb) => cb({ ...attribution })),

    // ── Playlists ──
    ensureFavourites: async () => clone(need(favId())),
    fetchPlaylists: async ({ owner, member }) => {
      [...SEED_PLAYLISTS, `fav-${owner ?? member ?? name}`, ...playlists.keys()].forEach(getDoc);
      return [...playlists.values()]
        .filter((d) => (owner ? d.owner === owner : d.members.includes(member ?? '') && d.owner !== member))
        .map(metaOf);
    },
    fetchPlaylist: async (id) => clone(need(id)),
    createPlaylist: async (n, isPublic) => {
      const now = Date.now();
      const d: PlaylistDoc = {
        id: `pl-demo-${++playlistSeq}`,
        name: n,
        owner: name,
        isPublic,
        memberCount: 1,
        trackCount: 0,
        updatedAt: now,
        imageUrl: null,
        members: [name],
        tracks: [],
        createdAt: now,
      };
      playlists.set(d.id, d);
      return clone(d);
    },
    updatePlaylist: async (id, patch) => {
      const d = need(id);
      if (patch.name !== undefined) d.name = patch.name;
      if (patch.isPublic !== undefined) d.isPublic = patch.isPublic;
      return touched(d);
    },
    deletePlaylist: async (id) => {
      if (!getDoc(id)) return { error: 'playlist not found' };
      playlists.delete(id);
      deleted.add(id);
      return ok;
    },
    addTrackToPlaylist: async (id, track) => {
      const d = need(id);
      if (!d.tracks.some((t) => t.uri === track.uri)) d.tracks.push({ ...track, addedBy: name, addedAt: Date.now() });
      return touched(d);
    },
    removeTrackFromPlaylist: async (id, uri) => {
      const d = need(id);
      d.tracks = d.tracks.filter((t) => t.uri !== uri);
      return touched(d);
    },
    reorderPlaylistTracks: async (id, from, to) => {
      const d = need(id);
      if (from >= 0 && from < d.tracks.length) {
        const [moved] = d.tracks.splice(from, 1);
        d.tracks.splice(Math.min(Math.max(to, 0), d.tracks.length), 0, moved);
      }
      return touched(d);
    },
    joinPlaylist: async (id, action) => {
      const d = need(id);
      d.members = action === 'join' ? [...new Set([...d.members, name])] : d.members.filter((m) => m !== name);
      touched(d);
      return metaOf(d);
    },
    uploadPlaylistImage: async (id) => {
      const d = need(id);
      d.imageUrl = artUrl(`shelf:${id}:${Date.now()}`);
      touched(d);
      return { imageUrl: d.imageUrl };
    },

    // ── Queuedle ──
    submitGameScore: async ({ gameId, userName, guesses }) => {
      const prior = mineOn(gameId, userName);
      if (prior) return { duplicate: true, existing: clone(prior.score) };
      const qs = az.game(gameId).questions;
      const mainScore = qs.filter((q, i) => guesses.main[i] === q.winner).length;
      const bonusScore = qs.filter(
        (q, i) => guesses.bonus[i] === (q.winner === 'left' ? q.left : q.right).topQueuer
      ).length;
      const score: GameScoreDoc = {
        id: `${gameId}-${userName}`,
        gameId,
        userName,
        mainScore,
        bonusScore,
        total: mainScore + bonusScore,
        completedAt: Date.now(),
      };
      myScores.set(`${gameId}|${userName}`, { score, guesses: clone(guesses) });
      return { ok: true, score: clone(score) };
    },
    fetchMyScore: async (gameId, userName) => {
      const mine = mineOn(gameId, userName);
      if (!mine) return az.myScore(gameId, userName);
      const { mainScore, bonusScore, total } = mine.score;
      return { score: { mainScore, bonusScore, total, guesses: clone(mine.guesses) } };
    },
    fetchGameDates: async (userName) => {
      const dates = az.gameDates().dates ?? [];
      return { dates: dates.map((d) => (mineOn(d.gameId, userName) ? { ...d, userPlayed: true } : d)) };
    },
    fetchGameLeaderboard: async (date) => {
      const gameId = date ?? az.GAME_IDS[0];
      const base = az.gameLeaderboard(gameId);
      const mine = [...myScores.values()].map((m) => m.score).filter((s) => s.gameId === gameId);
      const scores = [...base.scores.filter((s) => !mine.some((m) => m.userName === s.userName)), ...mine].sort(
        (a, b) => b.total - a.total || a.userName.localeCompare(b.userName)
      );
      return { ...base, scores: clone(scores) };
    },

    // ── Polls ──
    fetchPolls: async () => ({
      polls: pollList()
        .filter((p) => p.live)
        .map(({ live: _l, ...p }) => p),
    }),
    answerPoll: async ({ pollId, choice }) => {
      const p = polls.get(pollId);
      return p && Number.isInteger(choice) && choice >= 0 && choice < p.choices.length
        ? { ok: true }
        : { error: 'Unknown poll or choice' };
    },
    pollAdminList: async () => ({ polls: pollList() }),
    pollAdminCreate: async (input) => {
      const bad = pollInput(input);
      if (bad) return bad;
      const poll: PollAdminItem = {
        id: `demo-poll-new-${++pollSeq}`,
        ...clone(input),
        liveFrom: '2099-01-04',
        live: false,
      };
      polls.set(poll.id, poll);
      pollOrder = [...pollOrder, poll.id];
      return { poll: clone(poll) };
    },
    pollAdminUpdate: async (id, input) => {
      const p = polls.get(id);
      const bad = pollInput(input);
      if (!p) return { error: 'Unknown poll' };
      if (p.live) return { error: 'A live poll is locked' };
      if (bad) return bad;
      Object.assign(p, clone(input));
      return { poll: clone(p) };
    },
    pollAdminDelete: async (id) => {
      const p = polls.get(id);
      if (!p) return { error: 'Unknown poll' };
      if (p.live) return { error: 'A live poll is locked' };
      polls.delete(id);
      pollOrder = pollOrder.filter((x) => x !== id);
      return { ok: true };
    },
    pollAdminReorder: async (ids) => {
      pollOrder = [...ids.filter((id) => polls.has(id)), ...pollOrder.filter((id) => !ids.includes(id))];
      return { polls: pollList() };
    },

    // ── Nothing to do ──
    submitFeedback: async () => ({ url: 'https://example.invalid/demo-feedback' }),
    reportTrackMeta: async (tracks) => ({ saved: tracks.length }),
    installUpdate: async () => {},
    isNewVersion: async () => false,
  };

  const dispose = () => {
    disposed = true;
    clearTimeout(timer);
    [wsSubs, mapSubs, eventSubs, entraSubs].forEach((s) => s.clear());
    live.delete(dispose);
  };
  live.add(dispose);

  return api;
}
