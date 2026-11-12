import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  djFillerIndex,
  findTicket,
  formatDuration,
  matchRoom,
  parsePlayback,
  parseQueueItem,
  parseSearch,
  positionAfterCurrent,
  queueItems,
  queueTotal,
  roomsFromDevices,
} from './parse.ts';

const TICKET = '0c6f1e3a-2b4d-4c5e-8f9a-1b2c3d4e5f60';

test('findTicket finds a UUID under a ticket-ish key, however deep', () => {
  assert.equal(findTicket({ a: { b: [{ wsTicket: TICKET }] } }), TICKET);
  assert.equal(findTicket({ ticket: 'not-a-uuid', other: TICKET }), null);
  assert.equal(findTicket(null), null);
});

const devices = {
  devices: [
    { info: { id: 'RINCON_A', name: 'Office' }, groupId: 'RINCON_A:1', isCoordinator: true },
    { info: { id: 'RINCON_B', name: 'Office Sub' }, groupId: 'RINCON_A:1', isCoordinator: false },
    { info: { id: 'RINCON_C', name: 'Kitchen' }, groupId: 'RINCON_C:7', isCoordinator: true },
    { info: { id: 'RINCON_D', name: 'Loose' } },
  ],
};

test('roomsFromDevices groups speakers under their coordinator', () => {
  const rooms = roomsFromDevices(devices);
  assert.equal(rooms.length, 2);
  assert.deepEqual(rooms[0], {
    id: 'RINCON_A:1',
    coordinatorId: 'RINCON_A',
    name: 'Office',
    players: [
      { id: 'RINCON_A', name: 'Office' },
      { id: 'RINCON_B', name: 'Office Sub' },
    ],
  });
});

test('matchRoom prefers exact room names, then speaker names, then substrings', () => {
  const rooms = roomsFromDevices(devices);
  assert.equal(matchRoom(rooms, 'office')?.name, 'Office');
  assert.equal(matchRoom(rooms, 'office sub')?.name, 'Office');
  assert.equal(matchRoom(rooms, 'kitch')?.name, 'Kitchen');
  assert.equal(matchRoom(rooms, 'garage'), undefined);
  assert.equal(matchRoom(rooms, ''), undefined);
});

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64');

test('parseSearch flattens sections and builds the queue body ids', () => {
  const hits = parseSearch({
    resourceOrder: ['TRACKS', 'ALBUMS'],
    TRACKS: {
      resources: [
        {
          id: { objectId: 'trk1', serviceId: 72711, accountId: 'sn_13' },
          name: 'Mr. Brightside',
          type: 'TRACK',
          artists: [{ name: 'The Killers' }],
          durationMs: 222000,
          explicit: false,
          images: [{ url: 'https://img/1.jpg' }],
          defaults: b64({ containerName: 'Hot Fuss', containerId: 'alb1' }),
        },
      ],
    },
    ALBUMS: {
      resources: [
        {
          id: { objectId: 'alb1', serviceId: '72711', accountId: '13' },
          name: 'Hot Fuss',
          type: 'ALBUM',
          artists: [{ name: 'The Killers' }],
        },
      ],
    },
    ARTISTS: {
      resources: [
        { id: { objectId: 'art1', serviceId: '72711', accountId: '13' }, name: 'The Killers', type: 'ARTIST' },
      ],
    },
  });
  assert.deepEqual(
    hits.map((h) => [h.kind, h.name]),
    [
      ['TRACK', 'Mr. Brightside'],
      ['ALBUM', 'Hot Fuss'],
      ['ARTIST', 'The Killers'],
    ]
  );
  const [track] = hits;
  assert.deepEqual(track.ref, { objectId: 'trk1', serviceId: '72711', accountId: '13', type: 'TRACK' });
  assert.equal(track.album, 'Hot Fuss');
  assert.equal(track.albumId, 'alb1');
  assert.deepEqual(track.artists, ['The Killers']);
  assert.equal(track.art, 'https://img/1.jpg');
});

test('queue items: list location and per-item fields', () => {
  assert.equal(queueItems({ items: [1, 2] }).length, 2);
  assert.equal(queueItems({ resources: [1] }).length, 1);
  assert.equal(queueItems([1, 2, 3]).length, 3);
  const e = parseQueueItem(
    {
      id: { objectId: 'q1' },
      track: {
        id: { objectId: 'trk1', serviceId: '72711', accountId: 'sn_13' },
        name: 'Song',
        artist: { name: 'Band' },
        album: { name: 'LP' },
        images: [{ url: 'http://insecure' }, { url: 'https://secure' }],
        durationMillis: 1000,
      },
    },
    4
  );
  assert.deepEqual(e, {
    position: 5,
    title: 'Song',
    artist: 'Band',
    album: 'LP',
    art: 'https://secure',
    durationMs: 1000,
    objectId: 'trk1',
    serviceId: '72711',
    accountId: '13',
  });
});

test('parsePlayback reads the playbackExtended status', () => {
  const np = parsePlayback({
    playback: {
      playbackState: 'PLAYBACK_STATE_PLAYING',
      positionMillis: 61000,
      itemId: '3',
      queueId: 'RINCON_A',
      queueVersion: 'v9',
      playModes: { shuffle: false, repeat: true, repeatOne: false },
    },
    metadata: {
      currentItem: {
        track: {
          name: 'Song',
          artist: { name: 'Band' },
          album: { name: 'LP' },
          id: { objectId: 'trk1' },
          durationMillis: 200000,
        },
      },
      nextItem: { track: { name: 'Next', artist: { name: 'Other' } } },
    },
  });
  assert.equal(np.state, 'playing');
  assert.equal(np.itemNumber, 3);
  assert.equal(np.objectId, 'trk1');
  assert.equal(np.repeat, 'all');
  assert.deepEqual(np.next, { title: 'Next', artist: 'Other' });
  assert.equal(parsePlayback(null).state, 'unknown');
});

test('real queue page shape: flat resources, empty artists, info.total', () => {
  const page = {
    info: { count: 2, total: 53, offset: 42 },
    resources: [
      {
        id: { serviceId: '72711', accountId: '13', objectId: 'trkA' },
        name: 'Crumbling Castle',
        type: 'TRACK',
        artists: [],
      },
      {
        id: { serviceId: '72711', accountId: '13', objectId: 'trkB' },
        name: 'Song',
        type: 'TRACK',
        artists: [{ name: 'Band' }],
      },
    ],
  };
  const items = queueItems(page).map((it, i) => parseQueueItem(it, 42 + i));
  assert.equal(queueTotal(page), 53);
  assert.deepEqual(
    items.map((e) => [e.position, e.title, e.artist, e.objectId]),
    [
      [43, 'Crumbling Castle', '', 'trkA'],
      [44, 'Song', 'Band', 'trkB'],
    ]
  );
});

test('real extendedPlaybackStatus push: LAN art is dropped', () => {
  const np = parsePlayback({
    playback: { playbackState: 'PLAYBACK_STATE_PLAYING', queueId: 'ab95-uuid', itemId: '43', positionMillis: 280178 },
    metadata: {
      currentItem: {
        track: {
          name: 'Crumbling Castle',
          imageUrl: 'http://192.168.1.10:1400/getaa?s=1',
          images: [{ url: 'http://192.168.1.10:1400/getaa?s=1' }],
          album: { name: 'Polygondwanaland' },
          artist: { name: 'King Gizzard & The Lizard Wizard' },
          id: { serviceId: '284', objectId: 'trkA', accountId: 'sn_13' },
          durationMillis: 645000,
        },
      },
    },
  });
  assert.equal(np.art, undefined);
  assert.equal(np.artist, 'King Gizzard & The Lizard Wizard');
  assert.equal(np.queueId, 'ab95-uuid');
  assert.equal(np.itemNumber, 43);
});

test('positionAfterCurrent mirrors the desktop app', () => {
  assert.equal(positionAfterCurrent(undefined, 10), -1);
  assert.equal(positionAfterCurrent(3, 10), 3);
  assert.equal(positionAfterCurrent(10, 10), -1);
});

test('formatDuration', () => {
  assert.equal(formatDuration(61000), '1:01');
  assert.equal(formatDuration(undefined), '');
});

test('djFillerIndex finds the DJ autoplay track parked at the tail', () => {
  const q = (...titles: string[]) =>
    titles.map((title, i) => ({ position: i + 1, title, artist: '', objectId: `id-${title}` }));
  const credits = { 'id-a': { trackName: 'a' }, 'id-b': { trackName: 'b' }, 'id-p': { trackName: 'p' } };

  // Playing b; the DJ parked f straight after it.
  assert.equal(djFillerIndex(q('a', 'b', 'f'), 2, credits), 2);
  // Someone's pick p already sits in front of it.
  assert.equal(djFillerIndex(q('a', 'b', 'p', 'f'), 2, credits), 3);
  // Sonos re-keyed the pick's id: still credited by title.
  assert.equal(
    djFillerIndex(
      [
        ...q('a', 'b'),
        { position: 3, title: 'P', artist: '', objectId: 'other' },
        ...q('f').map((e) => ({ ...e, position: 4 })),
      ],
      2,
      credits
    ),
    3
  );
  // The tail is credited, so there is no filler.
  assert.equal(djFillerIndex(q('a', 'b', 'p'), 2, credits), -1);
  // A run of uncredited tracks (an album from the Sonos app) is not a filler.
  assert.equal(djFillerIndex(q('a', 'b', 'x', 'y'), 2, credits), -1);
  // Nothing after the playhead, or the playhead unknown.
  assert.equal(djFillerIndex(q('a', 'f'), 2, credits), -1);
  assert.equal(djFillerIndex(q('a', 'b', 'f'), undefined, credits), -1);
});
