import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, within } from 'storybook/test';
import { covers } from '../../../.storybook/fixtures';
import { displayNameKeys } from '../../hooks/useDisplayName';
import { QueueActionsProvider } from '../../hooks/useQueueActions';
import { ArrowDown, ArrowUp, ListStart, Trash2 } from 'lucide-react';
import { ContextMenuProvider, CreatePlaylistDialog, useTrackContextMenu, type MenuAction } from './ContextMenu';
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

const rowActions: MenuAction[] = [
  { label: 'Play next', icon: ListStart, onSelect: fn() },
  { label: 'Move up', icon: ArrowUp, disabled: true, onSelect: fn() },
  { label: 'Move down', icon: ArrowDown, onSelect: fn() },
  { label: 'Remove from queue', icon: Trash2, danger: true, onSelect: fn() },
];

/** A row that opens the menu on right-click, as every list in the app does. */
function Surface({ withActions = false }: { withActions?: boolean }) {
  const { showTrackMenu } = useTrackContextMenu();
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxWidth: '36em' }}>
      <TrackRow
        title={track.trackName}
        artists={track.artist}
        imageUrl={track.imageUrl}
        onContextMenu={(e) =>
          showTrackMenu(
            {
              track,
              sonosItem: { name: track.trackName, type: 'TRACK' },
              actions: withActions ? rowActions : undefined,
            },
            e
          )
        }
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
/**
 * The phone shell's form: the same menu as a sheet from the bottom edge. Here the row also hands the menu actions
 * of its own (a queue row's), which sit first.
 */
export const Sheet: Story = {
  ...Open,
  args: { children: <Surface withActions /> },
  parameters: { platform: 'web', shell: 'phone' },
  globals: { viewport: { value: 'iphone14' } },
};
/** The sheet's playlist list opens in place, with a way back. */
export const SheetPlaylists: Story = {
  ...Sheet,
  play: async (context) => {
    await Open.play?.(context);
    await userEvent.click(within(document.body).getByRole('menuitem', { name: 'Add to playlist' }));
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
