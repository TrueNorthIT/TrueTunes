import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, within } from 'storybook/test';
import { covers } from '../../../.storybook/fixtures';
import { displayNameKeys } from '../../hooks/useDisplayName';
import { QueueActionsProvider } from '../../hooks/useQueueActions';
import { ContextMenuProvider, CreatePlaylistDialog, useTrackContextMenu } from './ContextMenu';
import { ToastProvider } from './Toast';
import { TrackRow } from './TrackRow';

const track: PlaylistTrack = {
  uri: 'spotify:track:1',
  trackName: 'Golden Hour',
  artist: 'Maya Rowan',
  albumName: 'Deep Water',
  imageUrl: covers.sunset,
  serviceId: '51463',
  accountId: 'account-1',
  addedBy: 'Priya Shah',
  addedAt: 1_700_000_000_000,
};

/** A row that opens the menu on right-click, as every list in the app does. */
function Surface() {
  const { showTrackMenu } = useTrackContextMenu();
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxWidth: '36em' }}>
      <TrackRow
        title={track.trackName}
        artists={track.artist}
        imageUrl={track.imageUrl}
        onContextMenu={(e) => showTrackMenu({ track, sonosItem: { name: track.trackName, type: 'TRACK' } }, e)}
      />
    </ul>
  );
}

/** The provider reads the name from the app's query cache, so a story seeds it there. */
function SeedDisplayName({ name, children }: { name: string | null; children: ReactNode }) {
  const queryClient = useQueryClient();
  queryClient.setQueryData(displayNameKeys.all, name);
  return <>{children}</>;
}

const meta = {
  title: 'Common/ContextMenu',
  component: ContextMenuProvider,
  args: { children: <Surface /> },
  decorators: [
    (Story, { parameters }) => (
      <ToastProvider>
        <QueueActionsProvider value={{ addToQueue: fn(), queueNext: fn() }}>
          <SeedDisplayName name={parameters.displayName === undefined ? 'Priya Shah' : parameters.displayName}>
            <Story />
          </SeedDisplayName>
        </QueueActionsProvider>
      </ToastProvider>
    ),
  ],
} satisfies Meta<typeof ContextMenuProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-click the row. */
export const Closed: Story = {};
export const Open: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.pointer({ keys: '[MouseRight]', target: within(canvasElement).getByText('Golden Hour') });
  },
};
/** Signed out of the office: there is no one to add to playlists for. */
export const NoDisplayName: Story = { ...Open, parameters: { displayName: null } };

export const NewPlaylistDialog: Story = {
  render: () => <CreatePlaylistDialog displayName="Priya Shah" pendingTrack={track} onClose={fn()} />,
};
export const NewPlaylistDialogNoTrack: Story = {
  render: () => <CreatePlaylistDialog displayName="Priya Shah" pendingTrack={null} onClose={fn()} />,
};
