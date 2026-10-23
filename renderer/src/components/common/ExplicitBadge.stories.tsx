import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExplicitBadge } from './ExplicitBadge';

const meta = { title: 'Common/ExplicitBadge', component: ExplicitBadge } satisfies Meta<typeof ExplicitBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const BesideATitle: Story = {
  render: () => (
    <span>
      Golden Hour <ExplicitBadge />
    </span>
  ),
};
