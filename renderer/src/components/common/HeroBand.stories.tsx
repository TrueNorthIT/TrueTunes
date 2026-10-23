import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers } from '../../../.storybook/fixtures';
import { HeroBand } from './HeroBand';
import { OfficeChip } from './OfficeChip';
import { QueuerChip } from './QueuerChip';

const meta = {
  title: 'Common/HeroBand',
  component: HeroBand,
  args: {
    art: <img src={covers.ocean} alt="" />,
    kind: 'Album',
    title: 'Deep Water',
    wash: '31, 143, 255',
    children: <p style={{ margin: 0 }}>The Quiet Hours · 2024 · 11 tracks</p>,
  },
  // Detail pages are a container, so the band stacks when narrow.
  decorators: [
    (Story) => (
      <div style={{ containerType: 'inline-size' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HeroBand>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoWash: Story = { args: { wash: null } };
export const NoArt: Story = {
  args: { art: <span style={{ display: 'grid', placeItems: 'center', height: '100%' }}>♪</span> },
};
export const EditableTitle: Story = {
  args: { kind: 'Playlist', title: 'Friday afternoon', onTitleClick: fn(), titleHint: 'Rename playlist' },
};
export const WithCorner: Story = {
  args: {
    corner: <QueuerChip user="Priya Shah" onOpen={fn()} />,
    children: (
      <>
        <p style={{ margin: 0 }}>The Quiet Hours · 2024 · 11 tracks</p>
        <OfficeChip count={3} />
      </>
    ),
  },
};
export const LongTitle: Story = {
  args: { title: 'The Extraordinarily Long Title of an Album That Needs to Wrap Without Pushing the Artwork Around' },
};
