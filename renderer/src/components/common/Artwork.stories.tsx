import type { Meta, StoryObj } from '@storybook/react-vite';
import { covers } from '../../../.storybook/fixtures';
import tile from './ImageTile.module.css';
import { Artwork } from './Artwork';

// The caller owns the frame; here it is the ImageTile's.
const meta = {
  title: 'Common/Artwork',
  component: Artwork,
  args: { src: covers.forest, placeholderClassName: tile.ph },
  decorators: [
    (Story) => (
      <div className={tile.art} style={{ width: '12em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Artwork>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Lazy: Story = { args: { lazy: true } };
/** No URL yet (or none at all): the note placeholder. */
export const Placeholder: Story = { args: { src: null } };
