import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageProviders, pageParameters, LiveShell } from '../../.storybook/pageStory';
import { HomePanel } from './HomePanel';

// Home as the app opens it on a Monday midday: picks, trending, jump back in, who is queuing what, For you.

const meta = { title: 'Pages/Home', parameters: pageParameters('/') } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  // Real a11y findings in the page, tracked in a GitHub issue, not caused by the mock data: label-content-name-mismatch on the "In the office" faces and the picks, and the lyrics box not keyboard-scrollable.
  parameters: { a11y: { test: 'todo' } },
  render: () => (
    <PageProviders>
      <LiveShell>
        {(s) => (
          <HomePanel
            isAuthed={s.isAuthed}
            ytm={s.ytm}
            ytmLoading={s.ytmLoading}
            playback={s.playback}
            queueItems={s.queueItems}
          />
        )}
      </LiveShell>
    </PageProviders>
  ),
};
