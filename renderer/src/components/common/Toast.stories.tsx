import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, within } from 'storybook/test';
import { ToastProvider, useToast } from './Toast';
import { PillButton } from './PillButton';

type ToastType = 'error' | 'success' | 'info';

/** A button that raises the toast, so the story controls what is shown. The toast stays up for an hour. */
function ToastDemo({ message, type, withAction }: { message: string; type: ToastType; withAction: boolean }) {
  const { showToast } = useToast();
  return (
    <PillButton
      onClick={() =>
        showToast(message, type, {
          durationMs: 3_600_000,
          action: withAction ? { label: 'Undo', onClick: fn() } : undefined,
        })
      }
    >
      Show toast
    </PillButton>
  );
}

const meta = {
  title: 'Common/Toast',
  component: ToastDemo,
  args: { message: 'Added Golden Hour to the queue', type: 'success', withAction: false },
  argTypes: { type: { control: 'inline-radio', options: ['error', 'success', 'info'] } },
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
  // Raise the toast on load; the controls then change the next one.
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Show toast' }));
  },
} satisfies Meta<typeof ToastDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {};
export const Failed: Story = { args: { message: 'Could not reach the speakers', type: 'error' } };
export const Info: Story = { args: { message: 'The queue was cleared by Priya', type: 'info' } };
export const WithAction: Story = { args: { message: 'Removed from Friday afternoon', type: 'info', withAction: true } };
export const LongMessage: Story = {
  args: {
    message:
      'Something went wrong while adding “The Extraordinarily Long Title of a Song” to the queue, so nothing was changed',
    type: 'error',
  },
};
