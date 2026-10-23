import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers, portrait } from '../../../.storybook/fixtures';
import { ImageTile } from './ImageTile';
import { PersonCard } from './PersonCard';

const meta = {
  title: 'Common/PersonCard',
  component: PersonCard,
  args: { name: 'Priya Shah', imageUrl: portrait, caption: '3 albums this week', onOpen: fn() },
  decorators: [
    (Story) => (
      <div style={{ width: '26em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PersonCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoPhoto: Story = { args: { imageUrl: null } };
export const NoCaption: Story = { args: { caption: undefined } };
export const LongName: Story = {
  args: { name: 'Alexandria Montgomery-Featherstonehaugh', caption: '1,204 tracks queued all time' },
};
export const WithTiles: Story = {
  render: (args) => (
    <PersonCard {...args}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6em' }}>
        {[covers.ocean, covers.forest, covers.neon].map((c, i) => (
          <ImageTile key={i} size="sm" title={`Album ${i + 1}`} sub="Artist" imageUrl={c} onOpen={fn()} />
        ))}
      </div>
    </PersonCard>
  ),
};
