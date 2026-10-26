import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageProviders, pageParameters, LiveShell } from '../../.storybook/pageStory';
import { LyricsPanel } from './LyricsPanel';

// Synced lyrics for the playing track, paused at 1:23 so the highlighted line never moves.

const meta = { title: 'Pages/Lyrics', parameters: pageParameters('/lyrics') } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <PageProviders>
      <LiveShell>{(s) => <LyricsPanel playback={s.playback} />}</LiveShell>
    </PageProviders>
  ),
};
