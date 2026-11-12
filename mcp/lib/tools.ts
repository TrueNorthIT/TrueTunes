// The MCP tools: what people can ask the office speakers to do from a chat.

import type { CallToolResult, McpServer, ServerContext } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { env } from './env';
import { errorText, log, since } from './log';
import { callerFrom, displayName, entraIdToken, type Caller } from './identity';
import { recallHit, rememberHits, type RememberedHit } from './refs';
import { searchMusic, withOffice, type RoomState } from './sonos/office';
import { djFillerIndex, formatDuration, positionAfterCurrent, type QueueEntry, type SearchHit } from './sonos/parse';
import { recentActivity, recordActivity } from './store';
import { attribution, publishQueued, stats, type QueuedItem } from './truetunes';

export const INSTRUCTIONS = `TrueTunes plays music on the TrueNorth office Sonos speakers. Everyone in the office hears them and shares one queue.

- To play something: search_music, then add_to_queue with a ref from the results (or add_to_queue with a query for the top track match).
- Default to when="end". Like the desktop app, "end" goes in front of the DJ's autoplay pick when one is parked at the end of the queue. Use "next" when someone wants it soon, and "now" (which skips whatever is playing) only when they explicitly ask to play it right now.
- Everything is credited to the signed-in person on the TrueTunes leaderboard and in recent_activity, so be accurate about what you queued.
- Search covers YouTube Music: tracks, albums and playlists can be queued; artists can't, so queue their songs or an album instead.
- Only skip, pause, remove or change the volume when asked. Announcements are spoken over the music in every speaker of the room.`;

const room = z.string().optional().describe('Room or speaker name. Leave out for the main office room.');

function text(t: string): CallToolResult {
  return { content: [{ type: 'text', text: t }] };
}

/** Runs a tool as the signed-in person, logging who asked for what, the outcome and how long it took. */
async function run(
  tool: string,
  ctx: ServerContext,
  args: Record<string, unknown>,
  body: (caller: Caller) => Promise<string>
): Promise<CallToolResult> {
  let caller: Caller;
  try {
    caller = callerFrom(ctx.http?.authInfo);
  } catch {
    log.warn('tool', `${tool} rejected`, { reason: 'not signed in' });
    return { isError: true, content: [{ type: 'text', text: 'Not signed in.' }] };
  }
  const started = Date.now();
  log.info('tool', `${tool} called`, { user: caller.email, args });
  try {
    const result = await body(caller);
    log.info('tool', `${tool} ok`, {
      user: caller.email,
      ms: since(started),
      result: result.split('\n')[0].slice(0, 200),
    });
    return text(result);
  } catch (err) {
    const message = errorText(err);
    log.error('tool', `${tool} failed`, { user: caller.email, ms: since(started), error: message });
    if (err instanceof Error && err.stack) console.error(err.stack);
    return { isError: true, content: [{ type: 'text', text: message }] };
  }
}

const by = (artists: string[] | string | undefined) => {
  const a = Array.isArray(artists) ? artists.join(', ') : artists;
  return a ? ` by ${a}` : '';
};

function describeRoom(rs: RoomState): string {
  if (!rs.available) return `${rs.room.name} — unreachable (Sonos says this group is gone or offline)`;
  const np = rs.playback;
  const volume = rs.volume !== undefined ? `, volume ${rs.volume}` : '';
  const speakers = rs.room.players.map((p) => p.name).join(', ');
  const playing = np.title ? `: "${np.title}"${by(np.artist)}` : '';
  return `${rs.room.name} (${speakers}) — ${np.state}${volume}${playing}`;
}

function hitLine(h: RememberedHit): string {
  const bits = [`ref ${h.refId}`, h.kind.toLowerCase(), `"${h.name}"${by(h.artists)}`];
  if (h.kind === 'TRACK' && h.album) bits.push(`from ${h.album}`);
  if (h.durationMs) bits.push(formatDuration(h.durationMs));
  if (h.explicit) bits.push('explicit');
  if (h.kind === 'ARTIST') bits.push("can't be queued directly");
  return bits.join(' · ');
}

const QUEUEABLE = new Set(['TRACK', 'ALBUM', 'PLAYLIST']);

export function registerTools(server: McpServer): void {
  server.registerTool(
    'now_playing',
    {
      title: 'Now playing',
      description: "What's playing in the office right now, who queued it, what's next, and the volume.",
      inputSchema: z.object({ room }),
      annotations: { readOnlyHint: true },
    },
    ({ room: wanted }, ctx) =>
      run('now_playing', ctx, { room: wanted }, () =>
        withOffice(async (office) => {
          const rs = office.pick(wanted);
          const np = rs.playback;
          const lines = [`${rs.room.name}: ${np.state}${rs.volume !== undefined ? `, volume ${rs.volume}` : ''}`];
          if (np.title) {
            const where = [formatDuration(np.positionMs), formatDuration(np.durationMs)].filter(Boolean).join(' / ');
            lines.push(
              `Now: "${np.title}"${by(np.artist)}${np.album ? ` (${np.album})` : ''}${where ? ` — ${where}` : ''}`
            );
            const who = np.objectId ? (await attribution())[np.objectId]?.user : undefined;
            lines.push(who ? `Queued by ${who}` : 'Queued by: unknown (or the DJ)');
            if (np.art) lines.push(`Art: ${np.art}`);
          } else {
            lines.push('Nothing is loaded.');
          }
          if (np.next) lines.push(`Next: "${np.next.title}"${by(np.next.artist)}`);
          if (np.shuffle || (np.repeat && np.repeat !== 'off')) {
            lines.push(`Shuffle ${np.shuffle ? 'on' : 'off'}, repeat ${np.repeat ?? 'off'}`);
          }
          return lines.join('\n');
        })
      )
  );

  server.registerTool(
    'list_rooms',
    {
      title: 'List rooms',
      description: 'The Sonos rooms (speaker groups) in the office, with what each is playing and its volume.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    (_args, ctx) =>
      run('list_rooms', ctx, {}, () => withOffice(async (office) => office.rooms.map(describeRoom).join('\n')))
  );

  server.registerTool(
    'get_queue',
    {
      title: 'Get queue',
      description: "The office queue from the current track onwards, with each track's position and who queued it.",
      inputSchema: z.object({
        room,
        limit: z.number().int().min(1).max(100).default(15).describe('How many upcoming tracks to list.'),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ room: wanted, limit }, ctx) =>
      run('get_queue', ctx, { room: wanted, limit }, () =>
        withOffice(async (office) => {
          const rs = office.pick(wanted);
          const [{ entries }, who] = await Promise.all([office.readQueue(rs), attribution()]);
          if (!entries.length) return `The queue in ${rs.room.name} is empty.`;
          const current = rs.playback.itemNumber ?? 1;
          const shown = entries.slice(current - 1, current - 1 + limit + 1);
          const filler = djFillerIndex(entries, rs.playback.itemNumber, who);
          const lines = shown.map((e) => {
            const mark = e.position === rs.playback.itemNumber ? '▶ ' : '';
            const credit = e.objectId ? who[e.objectId] : undefined;
            // Sonos queue items rarely carry an artist; the attribution record usually has it.
            const artist =
              e.artist || credit?.artist || (e.position === rs.playback.itemNumber ? rs.playback.artist : '');
            const queuedBy = credit
              ? ` · queued by ${credit.user}`
              : e.position - 1 === filler
                ? ' · DJ autoplay pick'
                : '';
            return `${mark}#${e.position} "${e.title}"${by(artist)}${queuedBy}`;
          });
          const after = entries.length - (current - 1 + shown.length);
          if (after > 0) lines.push(`…and ${after} more (${entries.length} in the queue).`);
          return `${rs.room.name} queue:\n${lines.join('\n')}`;
        })
      )
  );

  server.registerTool(
    'search_music',
    {
      title: 'Search music',
      description:
        'Search YouTube Music (through Sonos) for tracks, albums, playlists or artists. Returns refs to pass to add_to_queue.',
      inputSchema: z.object({
        query: z.string().min(1).max(200).describe('What to look for, e.g. "Mr Brightside", "Daft Punk Discovery".'),
        kind: z.enum(['any', 'track', 'album', 'playlist', 'artist']).default('any'),
        limit: z.number().int().min(1).max(25).default(8),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ query, kind, limit }, ctx) =>
      run('search_music', ctx, { query, kind, limit }, async () => {
        const hits = await searchMusic(query, Math.max(limit, 10));
        const wanted = kind === 'any' ? hits : hits.filter((h) => h.kind === kind.toUpperCase());
        if (!wanted.length) return `Nothing found for "${query}".`;
        const remembered = await rememberHits(wanted.slice(0, limit));
        return remembered.map(hitLine).join('\n');
      })
  );

  server.registerTool(
    'add_to_queue',
    {
      title: 'Add to queue',
      description:
        'Queue a track, album or playlist on the office speakers, credited to you. Pass a ref from search_music, or a query to queue the top matching track.',
      inputSchema: z.object({
        ref: z.string().optional().describe('A ref from search_music, e.g. "t_ab12cd34ef".'),
        query: z
          .string()
          .max(200)
          .optional()
          .describe('Search text; the best matching track is queued. Used when no ref is given.'),
        when: z
          .enum(['end', 'next', 'now'])
          .default('end')
          .describe(
            '"end" of the queue (in front of the DJ\'s autoplay pick, if one is parked there), "next" after the current track, or "now" to skip to it straight away.'
          ),
        room,
      }),
    },
    ({ ref, query, when, room: wanted }, ctx) =>
      run('add_to_queue', ctx, { ref, query, when, room: wanted }, async (caller) => {
        let hit: SearchHit | null = ref ? await recallHit(ref) : null;
        if (ref && !hit) throw new Error(`Ref ${ref} has expired or is unknown; search again.`);
        if (!hit) {
          if (!query?.trim()) throw new Error('Give a ref from search_music or a query.');
          hit = (await searchMusic(query, 10)).find((h) => h.kind === 'TRACK') ?? null;
          if (!hit) throw new Error(`No track found for "${query}".`);
        }
        if (!QUEUEABLE.has(hit.kind)) {
          throw new Error(
            `"${hit.name}" is ${hit.kind === 'ARTIST' ? 'an artist' : `a ${hit.kind.toLowerCase()}`}; queue a track, album or playlist instead.`
          );
        }
        const item = hit;

        return withOffice(async (office) => {
          const rs = office.pick(wanted);
          const [before, credits] = await Promise.all([office.readQueue(rs), when === 'end' ? attribution() : {}]);
          const length = before.entries.length;
          // Like the desktop app: a pick goes in front of the DJ's parked autoplay track, never behind it.
          const filler = when === 'end' ? djFillerIndex(before.entries, rs.playback.itemNumber, credits) : -1;
          const fillerTitle = filler >= 0 ? before.entries[filler].title : undefined;
          if (fillerTitle)
            log.info('dj', 'inserting in front of the autoplay pick', {
              room: rs.room.name,
              at: filler + 1,
              filler: fillerTitle,
            });
          const position = when === 'end' ? filler : positionAfterCurrent(rs.playback.itemNumber, length);
          await office.addToQueue(rs, item.ref, position, before.etag);
          const insertedAt = position === -1 ? length : position; // 0-based

          let added: QueueEntry[] = [];
          if (item.kind !== 'TRACK') {
            const after = (await office.readQueue(rs)).entries;
            added = after.slice(insertedAt, insertedAt + Math.max(0, after.length - length));
          }

          if (when === 'now') {
            await office.skipTo(rs, insertedAt + 1);
            if (rs.playback.state !== 'playing') await office.play(rs);
          }

          const who = await displayName(caller);
          const idToken = await entraIdToken(caller).catch((err) => {
            console.warn('[tool] no Entra ID token for attribution:', err);
            return undefined;
          });
          const credit: QueuedItem[] = [];
          if (item.kind === 'TRACK') {
            credit.push({
              eventType: 'track',
              uri: item.ref.objectId,
              trackName: item.name,
              artist: item.artists[0] ?? '',
              serviceId: item.ref.serviceId,
              accountId: item.ref.accountId,
              album: item.album,
              albumId: item.albumId,
              imageUrl: item.art,
            });
          } else {
            if (item.kind === 'ALBUM') {
              credit.push({
                eventType: 'album',
                uri: item.ref.objectId,
                trackName: item.name,
                artist: item.artists[0] ?? '',
                serviceId: item.ref.serviceId,
                accountId: item.ref.accountId,
                album: item.name,
                albumId: item.ref.objectId,
                imageUrl: item.art,
              });
            }
            for (const e of added) {
              if (!e.objectId) continue;
              credit.push({
                eventType: 'track',
                uri: e.objectId,
                trackName: e.title,
                artist: e.artist,
                serviceId: e.serviceId,
                accountId: e.accountId,
                album: e.album ?? (item.kind === 'ALBUM' ? item.name : undefined),
                albumId: item.kind === 'ALBUM' ? item.ref.objectId : undefined,
                imageUrl: e.art ?? item.art,
              });
            }
          }
          await publishQueued(credit, who, idToken);

          const what = `"${item.name}"${by(item.artists)}`;
          const count = item.kind === 'TRACK' ? '' : ` (${added.length} tracks)`;
          const where =
            when === 'now'
              ? 'and started playing it'
              : when === 'next'
                ? `to play next (#${insertedAt + 1})`
                : `at #${insertedAt + 1}${fillerTitle ? `, in front of the DJ's autoplay pick "${fillerTitle}"` : ''}`;
          await recordActivity(
            who,
            `queued ${what}${count}${when === 'now' ? ' and played it now' : when === 'next' ? ' next' : ''} in ${rs.room.name}`
          );
          return `Queued ${what}${count} ${where} in ${rs.room.name}, credited to ${who}.`;
        });
      })
  );

  server.registerTool(
    'remove_from_queue',
    {
      title: 'Remove from queue',
      description: 'Remove tracks from the office queue by their # position from get_queue.',
      inputSchema: z.object({
        positions: z.array(z.number().int().min(1)).min(1).max(50).describe('Queue positions (#) from get_queue.'),
        room,
      }),
      annotations: { destructiveHint: true },
    },
    ({ positions, room: wanted }, ctx) =>
      run('remove_from_queue', ctx, { positions, room: wanted }, async (caller) =>
        withOffice(async (office) => {
          const rs = office.pick(wanted);
          const { entries } = await office.readQueue(rs);
          const unique = [...new Set(positions)].sort((a, b) => a - b);
          const bad = unique.filter((p) => p > entries.length);
          if (bad.length)
            throw new Error(`No track at #${bad.join(', #')}; the queue has ${entries.length}. Check get_queue.`);
          const gone = unique.map((p) => entries[p - 1]);
          await office.removeFromQueue(
            rs,
            unique.map((p) => p - 1)
          );
          const names = gone.map((e) => `"${e.title}"`).join(', ');
          await recordActivity(await displayName(caller), `removed ${names} from the queue in ${rs.room.name}`);
          return `Removed ${names} from the ${rs.room.name} queue.`;
        })
      )
  );

  server.registerTool(
    'playback',
    {
      title: 'Play, pause or skip',
      description: 'Play, pause, skip to the next track, or go back, in an office room.',
      inputSchema: z.object({ action: z.enum(['play', 'pause', 'skip', 'previous']), room }),
    },
    ({ action, room: wanted }, ctx) =>
      run('playback', ctx, { action, room: wanted }, async (caller) =>
        withOffice(async (office) => {
          const rs = office.pick(wanted);
          const current = rs.playback.title ? `"${rs.playback.title}"${by(rs.playback.artist)}` : 'the current track';
          if (action === 'play') await office.play(rs);
          if (action === 'pause') await office.pause(rs);
          if (action === 'skip') await office.next(rs);
          if (action === 'previous') await office.previous(rs);
          const done = {
            play: `pressed play`,
            pause: `paused`,
            skip: `skipped ${current}`,
            previous: `went back from ${current}`,
          }[action];
          await recordActivity(await displayName(caller), `${done} in ${rs.room.name}`);
          return `Done: ${done} in ${rs.room.name}.`;
        })
      )
  );

  server.registerTool(
    'set_volume',
    {
      title: 'Set volume',
      description: 'Set the volume of an office room to a level, or nudge it up or down.',
      inputSchema: z.object({
        level: z.number().int().min(0).max(100).optional().describe('Absolute volume, 0-100.'),
        change: z.number().int().min(-50).max(50).optional().describe('Relative change, e.g. 5 or -10.'),
        room,
      }),
    },
    ({ level, change, room: wanted }, ctx) =>
      run('set_volume', ctx, { level, change, room: wanted }, async (caller) => {
        if (level === undefined && change === undefined) throw new Error('Give a level or a change.');
        return withOffice(async (office) => {
          const rs = office.pick(wanted);
          const was = rs.volume ?? 0;
          const asked = level ?? was + (change ?? 0);
          const max = env.maxVolume();
          const target = Math.max(0, Math.min(max, asked));
          await office.setVolume(rs, target);
          await recordActivity(await displayName(caller), `set the volume in ${rs.room.name} from ${was} to ${target}`);
          const capped = asked > max ? ` (capped at ${max})` : '';
          return `Volume in ${rs.room.name}: ${was} → ${target}${capped}.`;
        });
      })
  );

  server.registerTool(
    'announce',
    {
      title: 'Announce',
      description: 'Speak a short message over the music on every speaker in an office room (text to speech).',
      inputSchema: z.object({
        message: z.string().min(1).max(200).describe('What to say, up to 200 characters.'),
        volume: z.number().int().min(5).max(70).default(35).describe('Announcement volume.'),
        room,
      }),
    },
    ({ message, volume, room: wanted }, ctx) =>
      run('announce', ctx, { message, volume, room: wanted }, async (caller) =>
        withOffice(async (office) => {
          const rs = office.pick(wanted);
          // Same unofficial Google Translate TTS the desktop app uses (src/ipc/sonos.ts).
          const streamUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-GB&client=tw-ob&q=${encodeURIComponent(message)}`;
          await office.announce(rs, streamUrl, Math.min(volume, env.maxVolume()));
          await recordActivity(await displayName(caller), `announced "${message}" in ${rs.room.name}`);
          return `Announced in ${rs.room.name}: "${message}"`;
        })
      )
  );

  server.registerTool(
    'leaderboard',
    {
      title: 'Leaderboard',
      description: 'TrueTunes leaderboard: who queued the most, and the top tracks and artists.',
      inputSchema: z.object({
        period: z.enum(['today', 'week', 'alltime']).default('week'),
        count: z.number().int().min(1).max(25).default(10),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ period, count }, ctx) =>
      run('leaderboard', ctx, { period, count }, async () => {
        const s = await stats(period, count);
        const people = s.topUsers.map((u, i) => `${i + 1}. ${u.userId} — ${u.count}`).join('\n');
        const tracks = s.topTracks
          .slice(0, count)
          .map((t, i) => `${i + 1}. "${t.trackName}"${by(t.artist)} — ${t.count}`)
          .join('\n');
        const artists = s.topArtists
          .slice(0, count)
          .map((a, i) => `${i + 1}. ${a.artist} — ${a.count}`)
          .join('\n');
        return `Leaderboard (${period}, ${s.totalEvents} queues)\n\nTop people:\n${people || '—'}\n\nTop tracks:\n${tracks || '—'}\n\nTop artists:\n${artists || '—'}`;
      })
  );

  server.registerTool(
    'recent_activity',
    {
      title: 'Recent activity',
      description:
        'What people have recently asked the speakers to do from chat: queues, skips, volume changes, announcements.',
      inputSchema: z.object({ count: z.number().int().min(1).max(100).default(15) }),
      annotations: { readOnlyHint: true },
    },
    ({ count }, ctx) =>
      run('recent_activity', ctx, { count }, async () => {
        const rows = await recentActivity(count);
        if (!rows.length) return 'Nothing yet.';
        const fmt = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/London',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
        return rows.map((r) => `${fmt.format(r.at)} ${r.who}: ${r.what}`).join('\n');
      })
  );

  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description: 'Your signed-in identity and the name your picks are credited to.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    (_args, ctx) =>
      run('whoami', ctx, {}, async (caller) => {
        const name = await displayName(caller);
        return `Signed in as ${caller.name} (${caller.email}). Picks are credited to "${name}" on the TrueTunes leaderboard.`;
      })
  );
}
