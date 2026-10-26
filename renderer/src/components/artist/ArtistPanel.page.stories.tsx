import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageProviders, pageParameters, LiveShell } from '../../../.storybook/pageStory';
import { HERO_ARTIST } from '../../test/fixtures/catalog';
import { browseArtistItem } from '../../test/fixtures/sonosShapes';
import { ArtistPanel } from './ArtistPanel';

// An artist page: banner, top songs, releases and the Genius bio.

const meta = {
  title: 'Pages/Artist',
  parameters: pageParameters(`/artist/${HERO_ARTIST.id}`, {
    pattern: '/artist/:id',
    state: { item: browseArtistItem(HERO_ARTIST) },
  }),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <PageProviders>
      <LiveShell>
        {(s) => <ArtistPanel currentTrackName={s.playback.trackName} isPlaybackActive={s.playback.isPlaying} />}
      </LiveShell>
    </PageProviders>
  ),
};
