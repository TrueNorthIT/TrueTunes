import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SearchResults } from '../SearchResults';
import type { SonosItem } from '../../../types/sonos';

const mockOpenItem = vi.fn();
const mockResolveAndOpen = vi.fn();
vi.mock('../../../hooks/useOpenItem', () => ({ useOpenItem: () => mockOpenItem }));
vi.mock('../../../hooks/useResolveAndOpen', () => ({ useResolveAndOpen: () => ({ resolveAndOpen: mockResolveAndOpen }) }));
vi.mock('../../../hooks/useImage', () => ({ useImage: () => null }));
vi.mock('../../../lib/photoPlaceholder', () => ({ usePhotoState: () => ({ state: 'unknown', src: null }) }));

const onAddToQueue = vi.fn();
const id = (objectId: string) => ({ objectId, serviceId: 'gm', accountId: 'acc' });

const makeTrack = (name: string, opts: { by?: string; album?: string; ms?: number; oid?: string; artistId?: string } = {}): SonosItem => {
  const oid = opts.oid ?? `t-${name}-${opts.album ?? ''}`;
  return {
    type: 'TRACK',
    name,
    artists: [{ name: opts.by ?? 'Band', ...(opts.artistId ? { id: id(opts.artistId) } : {}) }],
    ...(opts.album === undefined ? { album: { name: 'An Album', id: id(`al-${name}`) } } : opts.album ? { album: { name: opts.album, id: id(`al-${opts.album}`) } } : {}),
    durationMs: opts.ms,
    id: id(oid),
    resource: { type: 'TRACK', id: id(oid) },
  };
};
const makeArtist = (name: string): SonosItem => ({ type: 'ARTIST', name, id: id(`ar-${name}`), resource: { type: 'ARTIST', id: id(`ar-${name}`) } });
const makeAlbum = (name: string, by = 'Band'): SonosItem => ({
  type: 'ALBUM', name, artists: [{ name: by }], summary: { content: `Album • ${by}` }, id: id(`al-${name}`), resource: { type: 'ALBUM', id: id(`al-${name}`) },
});
const makePlaylist = (name: string): SonosItem => ({
  type: 'PLAYLIST', name, summary: { content: 'Playlist • someone' }, id: id(`pl-${name}`), resource: { type: 'PLAYLIST', id: id(`pl-${name}`) },
});

function renderResults(results: SonosItem[], query = 'zzz') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<SearchResults query={query} results={results} onAddToQueue={onAddToQueue} />, { wrapper });
}

const songsCard = () => screen.getByRole('region', { name: 'Songs' });
const songRows = () => within(songsCard()).getAllByRole('listitem');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(window.sonos.fetchStats).mockResolvedValue({ topUsers: [], topTracks: [], topArtists: [], topAlbums: [], totalEvents: 0, periodStart: 0 });
});

describe('top result', () => {
  it('leads with the song that matches, not the artist the service lists first', () => {
    renderResults([makeArtist('The Killers'), makeTrack('Mr. Brightside', { by: 'The Killers', album: 'Hot Fuss' }), makeTrack('Somebody Told Me', { by: 'The Killers', album: 'Hot Fuss' })], 'Mr Brightside');
    const top = screen.getByRole('region', { name: 'Top result' });
    expect(within(top).getByText('Mr. Brightside')).toBeInTheDocument();
    expect(within(top).getByText('Song · The Killers · Hot Fuss')).toBeInTheDocument();
    expect(within(top).getByRole('button', { name: /add to queue/i })).toBeInTheDocument();
  });

  it('adds the top song to the queue from its pill, and does not repeat it in Songs', () => {
    const song = makeTrack('Mr. Brightside', { by: 'The Killers', album: 'Hot Fuss' });
    renderResults([song, makeTrack('Other', { album: 'X' })], 'mr brightside');
    fireEvent.click(within(screen.getByRole('region', { name: 'Top result' })).getByRole('button', { name: /add to queue/i }));
    expect(onAddToQueue).toHaveBeenCalledWith(song);
    expect(within(songsCard()).queryByText('Mr. Brightside')).not.toBeInTheDocument();
  });

  it('shows an artist as Open, and opens the artist', () => {
    const artist = makeArtist('Arctic Monkeys');
    renderResults([artist, makeTrack('Do I Wanna Know?', { by: 'Arctic Monkeys', album: 'AM' })], 'arctic monkeys');
    const top = screen.getByRole('region', { name: 'Top result' });
    fireEvent.click(within(top).getByRole('button', { name: 'Open' }));
    expect(mockOpenItem).toHaveBeenCalledWith(artist);
  });

  it('shows how often the office has queued the top song', async () => {
    vi.mocked(window.sonos.fetchStats).mockResolvedValue({
      topUsers: [], topArtists: [], topAlbums: [], totalEvents: 0, periodStart: 0,
      topTracks: [{ trackName: 'Mr. Brightside', artist: 'The Killers', uri: 'hit', count: 27 }],
    });
    renderResults([makeTrack('Mr. Brightside', { by: 'The Killers', album: 'Hot Fuss', oid: 'hit' })], 'mr brightside');
    expect(await screen.findByText('Queued here 27 times')).toBeInTheDocument();
  });
});

describe('songs', () => {
  it('shows the album and the length on each row, so versions can be told apart', () => {
    renderResults([makeTrack('Top'), makeTrack('Mr. Brightside', { album: 'Live From The Royal Albert Hall', ms: 234000 })], 'top');
    const row = songRows()[0];
    expect(within(row).getByText('Live From The Royal Albert Hall')).toBeInTheDocument();
    expect(within(row).getByText('3:54')).toBeInTheDocument();
  });

  it('shows five, then all of them with See all (N)', () => {
    const tracks = Array.from({ length: 8 }, (_, i) => makeTrack(`Song ${i}`));
    renderResults([makeTrack('Top'), ...tracks], 'top');
    expect(songRows()).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'See all (8)' }));
    expect(songRows()).toHaveLength(8);
  });

  it('opens the artist from its link, by id', () => {
    renderResults([makeTrack('Top'), makeTrack('My Song', { by: 'My Artist', artistId: 'art-1' })], 'top');
    fireEvent.click(screen.getByRole('button', { name: 'My Artist, open artist' }));
    expect(mockOpenItem).toHaveBeenCalledWith(expect.objectContaining({ type: 'ARTIST', resource: expect.objectContaining({ id: id('art-1') }) }));
  });

  it('resolves an artist with no id by name', () => {
    renderResults([makeTrack('Top'), makeTrack('My Song', { by: 'Plain Artist' })], 'top');
    fireEvent.click(screen.getByRole('button', { name: 'Plain Artist, open artist' }));
    expect(mockResolveAndOpen).toHaveBeenCalledWith('Plain Artist', 'artist');
  });
});

describe('videos and uploads', () => {
  it('folds tracks with no album away, and shows them on request', () => {
    renderResults([makeTrack('Top'), makeTrack('Song', { album: 'Real' }), makeTrack('Song (Lyrics)', { album: '' }), makeTrack('Song karaoke', { album: '' })], 'top');
    expect(screen.getByText('Videos and uploads (2)')).toBeInTheDocument();
    expect(screen.queryByText('Song (Lyrics)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByText('Song (Lyrics)')).toBeInTheDocument();
  });
});

describe('lower sections', () => {
  it("follow the service's order", () => {
    renderResults([makeTrack('Top'), makeAlbum('An LP'), makePlaylist('A list'), makeArtist('Someone')], 'top');
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles.indexOf('Albums')).toBeLessThan(titles.indexOf('Playlists'));
    expect(titles.indexOf('Playlists')).toBeLessThan(titles.indexOf('Artists'));
  });

  it('drops the artist from album subtitles when that artist is the top result', () => {
    renderResults([makeArtist('Arctic Monkeys'), makeAlbum('AM', 'Arctic Monkeys'), makeAlbum('Covers', 'Someone Else')], 'arctic monkeys');
    expect(screen.getByText('Album')).toBeInTheDocument();
    expect(screen.getByText('Album · Someone Else')).toBeInTheDocument();
  });

  it('adds a playlist from its tile', () => {
    const pl = makePlaylist('Queue Me');
    renderResults([makeTrack('Top'), pl], 'top');
    fireEvent.click(screen.getByRole('button', { name: 'Add Queue Me to queue' }));
    expect(onAddToQueue).toHaveBeenCalledWith(pl);
  });
});

describe('track selection', () => {
  const tracks = ['A', 'B', 'C', 'D', 'E'].map((n) => makeTrack(`Track ${n}`));
  const setup = () => renderResults([makeTrack('Top'), ...tracks], 'top');

  it('selects a single track on click, and deselects it on a second click', () => {
    setup();
    fireEvent.click(songRows()[1]);
    expect(songRows()[1]).toHaveClass('selected');
    expect(songRows()[0]).not.toHaveClass('selected');
    fireEvent.click(songRows()[1]);
    expect(songRows()[1]).not.toHaveClass('selected');
  });

  it('selects a range with shift+click and toggles with ctrl+click', () => {
    setup();
    fireEvent.click(songRows()[1]);
    fireEvent.click(songRows()[3], { shiftKey: true });
    expect(songRows().map((r) => r.classList.contains('selected'))).toEqual([false, true, true, true, false]);
    fireEvent.click(songRows()[2], { ctrlKey: true });
    expect(songRows()[2]).not.toHaveClass('selected');
  });

  it('clears the selection when the list background is clicked', () => {
    setup();
    fireEvent.click(songRows()[0]);
    fireEvent.click(within(songsCard()).getByRole('list'));
    expect(songRows()[0]).not.toHaveClass('selected');
  });
});

describe('drag behaviour', () => {
  it('drags the row (or the selection) as an item list', async () => {
    renderResults([makeTrack('Top'), makeTrack('Drag Me'), makeTrack('Second')], 'top');
    let data = '';
    const dt = { effectAllowed: '', setData: vi.fn((_: string, v: string) => { data = v; }), setDragImage: vi.fn(), types: [] as string[] };
    fireEvent.dragStart(songRows()[0], { dataTransfer: dt });
    expect(dt.setData).toHaveBeenCalledWith('application/sonos-item-list', expect.any(String));
    await waitFor(() => expect((JSON.parse(data) as SonosItem[]).map((t) => t.name)).toEqual(['Drag Me']));
  });
});
