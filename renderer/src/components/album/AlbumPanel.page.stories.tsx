import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageProviders, pageParameters, LiveShell } from '../../../.storybook/pageStory';
import { HERO_ALBUM } from '../../test/fixtures/catalog';
import { browseAlbumItem } from '../../test/fixtures/sonosShapes';
import { AlbumPanel } from './AlbumPanel';

// A twelve-track album with its art, artist, an about card and a "More by" shelf.

const meta = {
  title: 'Pages/Album',
  parameters: pageParameters(`/album/${HERO_ALBUM.id}`, {
    pattern: '/album/:id',
    state: { item: browseAlbumItem(HERO_ALBUM) },
  }),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <PageProviders>
      <LiveShell>{(s) => <AlbumPanel playback={s.playback} />}</LiveShell>
    </PageProviders>
  ),
};
