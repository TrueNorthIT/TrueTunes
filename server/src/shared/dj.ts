/**
 * DJ mode — picks tracks the room will collectively tolerate.
 *
 * Item-based collaborative filtering over the office's own queue history, then
 * a "least misery" aggregation across whoever is currently listening.
 *
 * Why this shape:
 *  - Queue events are *implicit* feedback: we see what people played, never what
 *    they disliked. An artist a user never queued is unknown, not hated
 *    (Hu/Koren/Volinsky, ICDM 2008), so we predict a score for it rather than
 *    treating the gap as a zero.
 *  - Item-kNN over co-occurrence beats the fancier options at this data size
 *    (Ferrari Dacrema et al., RecSys 2019; Ludewig & Jannach, UMUAI 2018).
 *  - One speaker, many listeners is a *group* recommendation problem. Averaging
 *    satisfaction happily plays something one person can't stand, so we take the
 *    minimum across listeners instead (Masthoff, least misery).
 *
 * One speaker means passive listening: if Rich queued Kendrick Lamar 104 times,
 * everyone in the office has heard Kendrick Lamar. So "new" can never mean "this
 * person didn't queue it" — every track in the corpus has already played out
 * loud. Novelty has to come from outside the history, which is what `artists`
 * on the result is for: the caller browses those acts in the music service and
 * subtracts `heardTrackKeys` to find music the office has genuinely never played.
 *
 * Heavy queuers are damped, not erased. Someone who has queued all year without
 * anyone stopping them has been the room's de facto DJ, and that tolerance is
 * itself a signal — so influence scales with the square root of play count by
 * default (`influenceDamping`), between "everyone counts equally" and "loudest
 * wins". The same knob decides how much say each listener gets in the final
 * aggregation.
 */

import { aggregateEvents, splitArtists, itemKey, type RawEvent } from './aggregate';

export interface DjTrack {
  uri: string;
  trackName: string;
  artist: string;
  serviceId?: string;
  accountId?: string;
  albumId?: string;
  imageUrl?: string;
  /** Group score, 0..1. Higher = less likely to annoy anyone in the room. */
  score: number;
  /** Human-readable reason, shown in the UI. */
  because: string;
}

export interface DjOptions {
  /** Who is listening. Defaults to everyone with history. Users with no history are ignored. */
  users?: string[];
  /** How many tracks to return. */
  limit?: number;
  /** Track URIs to skip — current queue, recently played. */
  excludeUris?: Iterable<string>;
  /** Cap per artist so one act can't take the whole set. */
  perArtistMax?: number;
  /** How many ranked acts to hand back for the caller to browse. */
  artistLimit?: number;
  /** Artists seen fewer times than this are noise, not taste. */
  minArtistCount?: number;
  /**
   * How much a listener's play volume is flattened, 0..1.
   *   1 → every listener counts the same, however little they've queued
   *   0 → influence is proportional to raw play count
   *   0.5 → square-root damping (default): the established DJ carries more
   *         weight than someone with nine plays, but not 268x more.
   */
  influenceDamping?: number;
  /**
   * Aggregation across listeners, 0..1.
   *   0 → strict least misery: an artist is only as good as its least-keen listener
   *   1 → weighted average: crowd-pleasing, will happily annoy one person
   * Default 0.25 — mostly least misery, with enough give that a track the room's
   * regulars love isn't vetoed by one indifferent listener.
   */
  groupBlend?: number;
}

/**
 * A ranked act, with everything the caller needs to go and find music by them
 * that the office has never played.
 */
export interface DjArtist {
  artist: string;
  artistId?: string;
  serviceId?: string;
  accountId?: string;
  imageUrl?: string;
  score: number;
  because: string;
  /**
   * "trackName||artist" for every track by this act already in the history.
   * Compared on name rather than uri because Sonos re-keys objectIds over time
   * (issue #84), which would let the same song back in under a new id.
   */
  heardTrackKeys: string[];
}

export interface DjResult {
  tracks: DjTrack[];
  /** Ranked acts for the caller to source genuinely unheard music from. */
  artists: DjArtist[];
  /** Listeners actually used — input users minus those with no history. */
  listeners: string[];
  /** Artists that survived minArtistCount, for diagnostics. */
  artistsConsidered: number;
}

/**
 * Per-user artist weights, damped by play volume.
 *
 * Dividing by the raw total (damping = 1) makes a nine-play newcomer count for
 * exactly as much as someone who has queued 2,400 tracks, which throws away the
 * fact that the room has put up with the latter all year. Dividing by
 * `total ** damping` keeps the middle ground.
 */
function userArtistWeights(
  queuersByItem: Record<string, Record<string, number>>,
  artists: string[],
  damping: number,
): { rows: Record<string, Record<string, number>>; influence: Record<string, number> } {
  const rows: Record<string, Record<string, number>> = {};
  for (const artist of artists) {
    const queuers = queuersByItem[itemKey('artist', artist)] ?? {};
    for (const [user, count] of Object.entries(queuers)) {
      (rows[user] ??= {})[artist] = count;
    }
  }

  const influence: Record<string, number> = {};
  for (const [user, row] of Object.entries(rows)) {
    const total = Object.values(row).reduce((a, b) => a + b, 0);
    if (total > 0) {
      const divisor = Math.pow(total, damping);
      for (const k of Object.keys(row)) row[k] /= divisor;
    }
    // Complement of the damping applied above, so one knob moves both the
    // similarity input and the say each listener gets in the final blend.
    influence[user] = Math.pow(total, 1 - damping);
  }
  return { rows, influence };
}

/**
 * Cosine similarity between artists over the user-weight vectors.
 *
 * ponytail: O(artists²) — ~700 artists is half a million cheap pairs, well
 * under a Function's budget. If the catalogue grows past a few thousand, build
 * an inverted user→artists index and only compare artists sharing a listener.
 */
function artistSimilarity(
  weights: Record<string, Record<string, number>>,
  artists: string[],
): Record<string, Record<string, number>> {
  const users = Object.keys(weights);
  const vec: Record<string, number[]> = {};
  const norm: Record<string, number> = {};

  for (const artist of artists) {
    const v = users.map((u) => weights[u]?.[artist] ?? 0);
    vec[artist] = v;
    norm[artist] = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  }

  const sim: Record<string, Record<string, number>> = {};
  for (let i = 0; i < artists.length; i++) {
    const a = artists[i];
    if (norm[a] === 0) continue;
    for (let j = i + 1; j < artists.length; j++) {
      const b = artists[j];
      if (norm[b] === 0) continue;
      let dot = 0;
      for (let k = 0; k < users.length; k++) dot += vec[a][k] * vec[b][k];
      if (dot === 0) continue;
      const s = dot / (norm[a] * norm[b]);
      (sim[a] ??= {})[b] = s;
      (sim[b] ??= {})[a] = s;
    }
  }
  return sim;
}

/**
 * Predicted affinity of one user for every artist, scaled to 0..1.
 *
 * A listener's own plays count towards their score for that artist. Scoring
 * purely on neighbour similarity — the "recommend something new" framing —
 * systematically ranks artists nobody has played above the ones the room
 * actually loves, which is wrong for a jukebox: the shared favourite is the
 * safest possible DJ pick. Discovery still happens through the neighbour term,
 * it just doesn't outrank genuine affection.
 */
function predictForUser(
  played: Record<string, number>,
  sim: Record<string, Record<string, number>>,
  artists: string[],
): { scores: Record<string, number>; topNeighbour: Record<string, string> } {
  const scores: Record<string, number> = {};
  const topNeighbour: Record<string, string> = {};

  for (const artist of artists) {
    let sum = played[artist] ?? 0;
    let best = 0;
    let bestArtist = '';
    for (const [heard, weight] of Object.entries(played)) {
      if (heard === artist) continue;
      const s = sim[artist]?.[heard];
      if (!s) continue;
      const contribution = s * weight;
      sum += contribution;
      if (contribution > best) {
        best = contribution;
        bestArtist = heard;
      }
    }
    scores[artist] = sum;
    if (bestArtist) topNeighbour[artist] = bestArtist;
  }

  // Scale to 0..1 so scores are comparable between users before we take a min.
  const max = Math.max(...Object.values(scores), 0);
  if (max > 0) for (const k of Object.keys(scores)) scores[k] /= max;

  return { scores, topNeighbour };
}

/** "Rich queues", "Rich and Alex queue", "Sam, Alex and Rich queue". */
function creditFans(names: string[], artist: string): string {
  if (names.length === 1) return `${names[0]} queues ${artist}`;
  const listed = names.length > 3 ? [...names.slice(0, 3), 'others'] : names;
  return `${listed.slice(0, -1).join(', ')} and ${listed[listed.length - 1]} queue ${artist}`;
}

export function buildDjSet(events: RawEvent[], options: DjOptions = {}): DjResult {
  const limit = options.limit ?? 20;
  const perArtistMax = options.perArtistMax ?? 2;
  const artistLimit = options.artistLimit ?? 12;
  const minArtistCount = options.minArtistCount ?? 2;
  const exclude = new Set(options.excludeUris ?? []);

  const agg = aggregateEvents(events);

  const artists = Object.keys(agg.artistMap).filter(
    (a) => agg.artistMap[a].count >= minArtistCount,
  );
  if (artists.length === 0) {
    return { tracks: [], artists: [], listeners: [], artistsConsidered: 0 };
  }

  const damping = options.influenceDamping ?? 0.5;
  const blend = options.groupBlend ?? 0.25;
  const { rows: weights, influence } = userArtistWeights(agg.queuersByItem, artists, damping);

  // A listener we have no history for can't be made miserable by data we don't
  // have — including them would zero out every score and return nothing.
  const requested = options.users?.length ? options.users : Object.keys(weights);
  const listeners = requested.filter((u) => weights[u] && Object.keys(weights[u]).length > 0);
  if (listeners.length === 0) {
    return { tracks: [], artists: [], listeners: [], artistsConsidered: artists.length };
  }

  const sim = artistSimilarity(weights, artists);

  const perUser = listeners.map((u) => ({
    user: u,
    ...predictForUser(weights[u], sim, artists),
  }));

  // Least misery, softened. Pure `min` lets one indifferent listener veto a
  // track the room's regulars have been enjoying for months; the weighted mean
  // term gives the established DJs their say back without letting them steamroll
  // everyone. `groupBlend` picks the point on that line.
  // Being the room's DJ earns more say, but not the whole room. Cap any single
  // listener at twice an equal share and redistribute the rest, so a quiet week
  // where one person queues all day can't hand them the speaker permanently.
  const share: Record<string, number> = {};
  const rawTotal = listeners.reduce((s, u) => s + (influence[u] ?? 0), 0) || 1;
  const cap = 2 / listeners.length;
  let capped = 0;
  let uncappedTotal = 0;
  for (const u of listeners) {
    const raw = (influence[u] ?? 0) / rawTotal;
    if (raw > cap) {
      share[u] = cap;
      capped += cap;
    } else {
      uncappedTotal += raw;
    }
  }
  const remaining = Math.max(0, 1 - capped);
  for (const u of listeners) {
    if (share[u] === undefined) {
      const raw = (influence[u] ?? 0) / rawTotal;
      share[u] = uncappedTotal > 0 ? (raw / uncappedTotal) * remaining : remaining / listeners.length;
    }
  }

  const ranked = artists
    .map((artist) => {
      let worst = Infinity;
      let worstUser = '';
      let weighted = 0;
      for (const p of perUser) {
        const s = p.scores[artist] ?? 0;
        weighted += s * (share[p.user] ?? 0);
        if (s < worst) {
          worst = s;
          worstUser = p.user;
        }
      }
      const score = (1 - blend) * worst + blend * weighted;

      // Name the listeners who actually play this, heaviest first — that's who
      // the "because" line should credit.
      const fans = perUser
        .filter((p) => (weights[p.user]?.[artist] ?? 0) > 0)
        .sort((a, b) => (weights[b.user][artist] ?? 0) - (weights[a.user][artist] ?? 0))
        .map((p) => p.user);
      const neighbour = perUser.find((p) => p.topNeighbour[artist])?.topNeighbour[artist];
      return { artist, score, worstUser, fans, neighbour };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  // Group tracks under ONE artist each — the first credited name that made the
  // ranking. Filing a collab under every contributor puts "Gorillaz" and
  // "Gorillaz, De La Soul" in separate pools, and round-robin then happily plays
  // them back to back: different strings, same band as far as the room is
  // concerned. One pool per act means spacing actually works.
  const rankedArtists = new Set(ranked.map((r) => r.artist));
  const tracksByArtist: Record<string, typeof agg.trackMap[string][]> = {};
  for (const track of Object.values(agg.trackMap)) {
    const primary = splitArtists(track.artist).find((k) => rankedArtists.has(k));
    if (primary) (tracksByArtist[primary] ??= []).push(track);
  }
  // Every track here has already played out loud in the office, so within an
  // artist the best pick is simply the one the room plays most. Genuinely new
  // music cannot come from this corpus at all — see `artists` on the result.
  for (const list of Object.values(tracksByArtist)) list.sort((a, b) => b.count - a.count);

  const picked: DjTrack[] = [];
  const seenUris = new Set<string>();

  // Round-robin across artists rather than draining one before starting the
  // next. Taking every pick for an artist consecutively produced a set that ran
  // "Tame Impala, Tame Impala, Justice, Justice…" — a playlist nobody would
  // sequence by hand. One pass per artist in rank order means the same act can
  // never land twice in a row while any other artist still has a track left,
  // and the set still opens with the highest-scoring pick.
  const pools = ranked.map((entry) => ({
    entry,
    tracks: (tracksByArtist[entry.artist] ?? []).filter(
      (t) => t.uri && !exclude.has(t.uri),
    ),
    // Cursor, not the round index: a track credited to two artists ("Wet Leg,
    // The Dare") sits in both pools, and whichever pool loses the race must
    // move on to its next track rather than forfeiting the slot.
    next: 0,
  }));

  for (let round = 0; round < perArtistMax && picked.length < limit; round++) {
    for (const pool of pools) {
      if (picked.length >= limit) break;

      while (pool.next < pool.tracks.length && seenUris.has(pool.tracks[pool.next].uri!)) {
        pool.next++;
      }
      const track = pool.tracks[pool.next];
      if (!track?.uri) continue;
      pool.next++;

      const { entry } = pool;
      const because = entry.fans.length
        ? creditFans(entry.fans, entry.artist)
        : entry.neighbour
          ? `Like ${entry.neighbour}, which the room plays`
          : 'Popular with the office';

      picked.push({
        uri: track.uri,
        trackName: track.trackName,
        artist: track.artist,
        serviceId: track.serviceId,
        accountId: track.accountId,
        albumId: track.albumId,
        imageUrl: track.imageUrl,
        score: Number(entry.score.toFixed(4)),
        because,
      });
      seenUris.add(track.uri);
    }
  }

  // Ranked acts for the caller to browse. Capped: each one costs a music-service
  // round trip on the client, and nobody needs 400 of them.
  const suggestedArtists: DjArtist[] = pools
    // An act only ever credited as a collaborator ("Neneh Cherry" on a Gorillaz
    // track) never gets its own artistId, so it can't be browsed — filter before
    // the cap rather than after, or it eats a slot the caller has to discard.
    .filter(({ entry }) => agg.artistMap[entry.artist]?.artistId)
    .slice(0, artistLimit)
    .map(({ entry, tracks }) => {
    const meta = agg.artistMap[entry.artist];
    return {
      artist: entry.artist,
      artistId: meta?.artistId,
      serviceId: meta?.serviceId,
      accountId: meta?.accountId,
      imageUrl: meta?.imageUrl,
      score: Number(entry.score.toFixed(4)),
      because: entry.fans.length
        ? creditFans(entry.fans, entry.artist)
        : 'Popular with the office',
      heardTrackKeys: tracks.map((t) => t.key),
    };
    });

  return { tracks: picked, artists: suggestedArtists, listeners, artistsConsidered: artists.length };
}
