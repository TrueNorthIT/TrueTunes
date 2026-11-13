import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { App } from './App';
import { ROAD_TRIP_ID } from './test/fixtures/azure';
import { HERO_ALBUM, HERO_ARTIST } from './test/fixtures/catalog';
import { browseAlbumItem, browseArtistItem, containerItem, shelfId } from './test/fixtures/sonosShapes';

// The whole app as the web app shows it on a phone (iPhone 14, 390 × 844): the phone shell with its mini player
// and tab bar, against the mock backend, one story per route. `platform: 'web'` marks the document as the web
// app; the viewport makes the window narrow, which is what picks the phone shell. Paused, so nothing moves.

const route = (path: string, state?: unknown) => ({ route: { path, pattern: '/*', state } });

const meta = {
  title: 'Pages/Phone shell',
  component: App,
  parameters: { backend: 'mock', frame: 'bare', platform: 'web', ...route('/') },
  globals: { viewport: { value: 'iphone14' } },
  decorators: [
    (Story) => (
      <>
        <style>{'[aria-label="Loading True Tunes"] { display: none; }'}</style>
        <Story />
      </>
    ),
  ],
  // Every story must really be the phone shell (a wide test window would quietly show the desktop layout instead).
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('navigation', { name: 'Main' })).toBeVisible();
  },
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Home: Story = {};
/** The notch and the home indicator of an installed app: the status strip and the tab bar pad for them. */
export const HomeWithSafeAreas: Story = { parameters: { safeArea: true } };
/** Safari with its bars showing leaves about 664px: the dock still sits on the bottom edge. */
export const HomeInSafari: Story = { globals: { viewport: { value: 'iphone14Safari' } } };
export const Search: Story = { parameters: route('/search?q=velvet anchors') };
export const SearchEmpty: Story = { parameters: route('/search') };
export const Queue: Story = { parameters: route('/queue') };
/** Now playing takes the whole screen: no dock, and the chevron (or Back) closes it. */
export const NowPlaying: Story = {
  parameters: route('/now-playing'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByRole('heading', { name: 'Now playing' })).toBeVisible();
    await expect(page.queryByRole('navigation', { name: 'Main' })).toBeNull();
  },
};
export const NowPlayingWithSafeAreas: Story = {
  ...NowPlaying,
  parameters: { ...route('/now-playing'), safeArea: true },
};
export const NowPlayingInSafari: Story = { ...NowPlaying, globals: { viewport: { value: 'iphone14Safari' } } };
export const More: Story = { parameters: route('/more') };
export const Discover: Story = { parameters: route('/discover') };
export const Album: Story = {
  parameters: route(`/album/${HERO_ALBUM.id}`, { item: browseAlbumItem(HERO_ALBUM) }),
};
export const Artist: Story = {
  parameters: route(`/artist/${HERO_ARTIST.id}`, { item: browseArtistItem(HERO_ARTIST) }),
};
export const Container: Story = {
  parameters: route(`/container/${shelfId.quick}`, { item: containerItem(shelfId.quick, 'Quick picks') }),
};
export const Leaderboard: Story = { parameters: route('/leaderboard') };
export const MusicStats: Story = { parameters: route('/leaderboard/stats') };
export const Queuedle: Story = { parameters: route('/queuedle') };
export const QueuedleStats: Story = { parameters: route('/queuedle/stats') };
export const Lyrics: Story = { parameters: route('/lyrics') };
export const Profile: Story = { parameters: route('/profile/Tamsin%20Okoro-Vale') };
export const Playlist: Story = { parameters: route(`/playlist/${ROAD_TRIP_ID}`) };
