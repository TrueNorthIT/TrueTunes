import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { MorePage } from './MorePage';
import type { NormalizedGroup } from '../../types/provider';

// The phone shell's More page with the conditions the demo cannot produce: an update waiting, several speaker
// groups, a sign-out. Each `play` checks the row is there, is a real tap target (44px) and that tapping it calls
// the right bridge method. Nothing reaches Sonos: the preview's fake logs every call.

const group = (id: string, name: string): NormalizedGroup => ({ id, name, providerId: 'sonos' });
const GROUPS = [group('g1', 'Kitchen'), group('g2', 'Open plan office'), group('g3', 'Meeting room')];
const noPolls = {
  current: undefined,
  remaining: 0,
  submitting: false,
  error: null,
  answer: async () => {},
  skip: () => {},
};

const meta = {
  title: 'Phone/More page',
  component: MorePage,
  parameters: { platform: 'web', shell: 'phone', frame: 'bare' },
  globals: { viewport: { value: 'iphone14' } },
  args: {
    isAuthed: true,
    groups: [group('g1', 'Kitchen')],
    activeGroupId: 'g1',
    onGroupChange: () => {},
    onResync: () => {},
    onFeedback: () => {},
    updateVersion: null,
    polls: noPolls,
  },
  decorators: [
    (Story) => (
      <div style={{ height: '100dvh', display: 'flex', background: 'var(--bg)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MorePage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A tappable row by its name: at least 44px high. */
async function row(canvasElement: HTMLElement, name: RegExp | string) {
  const el = await within(canvasElement).findByRole('button', { name });
  await expect(el.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  return el;
}

/** Replaces one bridge method for the story and puts it back afterwards. */
function spy(key: string, impl: () => unknown) {
  const bridge = window.sonos as unknown as Record<string, unknown>;
  const calls: unknown[][] = [];
  const original = bridge[key];
  bridge[key] = (...args: unknown[]) => {
    calls.push(args);
    return impl();
  };
  return { calls, restore: () => void (bridge[key] = original) };
}

/** What App's handleGroupChange does: the selected state moves and the real call is made. */
function PickerHarness(args: React.ComponentProps<typeof MorePage>) {
  const [active, setActive] = React.useState(args.activeGroupId);
  return (
    <MorePage
      {...args}
      activeGroupId={active}
      onGroupChange={(id) => {
        setActive(id);
        void window.sonos.setGroup(id);
      }}
    />
  );
}

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await row(canvasElement, 'Leaderboard');
    await row(canvasElement, 'Send feedback');
    await row(canvasElement, 'Diagnostics');
    await expect(within(canvasElement).queryByRole('button', { name: /^Update/ })).toBeNull();
    await expect(within(canvasElement).queryByRole('button', { name: /poll is waiting/ })).toBeNull();
  },
};

export const UpdateWaiting: Story = {
  args: { updateVersion: '1.2.3' },
  play: async ({ canvasElement }) => {
    const install = spy('installUpdate', () => new Promise(() => {}));
    try {
      await userEvent.click(await row(canvasElement, /^Update/));
      await waitFor(() => expect(install.calls).toHaveLength(1));
    } finally {
      install.restore();
    }
  },
};

export const ThreeSpeakers: Story = {
  args: { groups: GROUPS, activeGroupId: 'g2' },
  render: (args) => <PickerHarness {...args} />,
  play: async ({ canvasElement }) => {
    const active = await row(canvasElement, /Open plan office/);
    await expect(active).toHaveAttribute('aria-pressed', 'true');
    await expect(within(canvasElement).getByRole('button', { name: /Kitchen/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    const set = spy('setGroup', () => Promise.resolve());
    try {
      await userEvent.click(await row(canvasElement, /Meeting room/));
      await waitFor(() => expect(set.calls).toEqual([['g3']]));
      await expect(await row(canvasElement, /Meeting room/)).toHaveAttribute('aria-pressed', 'true');
    } finally {
      set.restore();
    }
  },
};

export const LongNames: Story = {
  args: {
    groups: [group('g1', 'The big open plan office on the third floor by the kitchen'), group('g2', 'Kitchen')],
    activeGroupId: 'g1',
  },
  play: async ({ canvasElement }) => {
    await row(canvasElement, /The big open plan office/);
  },
};

export const SignOut: Story = {
  args: { onSignedOut: () => {} },
  play: async ({ canvasElement }) => {
    const out = spy('entraSignOut', () => Promise.resolve());
    try {
      // The page reloads after signing out; the story only checks the bridge call.
      await userEvent.click(await row(canvasElement, 'Sign out'));
      await waitFor(() => expect(out.calls).toHaveLength(1));
    } finally {
      out.restore();
    }
  },
};
