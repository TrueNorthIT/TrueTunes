import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageProviders, pageParameters } from '../../../.storybook/pageStory';
import { QueuedlePanel } from './QueuedlePanel';

// Today's game before it is played: the header, the start card and the two rounds explained.

const meta = { title: 'Pages/Queuedle', parameters: pageParameters('/queuedle') } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <PageProviders>
      <QueuedlePanel />
    </PageProviders>
  ),
};
