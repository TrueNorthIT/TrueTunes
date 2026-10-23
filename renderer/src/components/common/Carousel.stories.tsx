import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers } from '../../../.storybook/fixtures';
import { Carousel, type CarouselProps } from './Carousel';
import { ImageTile } from './ImageTile';
import { PillButton } from './PillButton';

const art = Object.values(covers);

const tiles = (n: number) =>
  Array.from({ length: n }, (_, i) => (
    <div key={i} style={{ flex: 'none', width: '11em' }}>
      <ImageTile title={`Album ${i + 1}`} sub="Maya Rowan" imageUrl={art[i % art.length]} onOpen={fn()} />
    </div>
  ));

const meta = {
  title: 'Common/Carousel',
  component: Carousel,
  args: { title: 'Made for you', children: tiles(12) },
  decorators: [(Story) => <div style={{ maxWidth: '48em' }}><Story /></div>],
} satisfies Meta<typeof Carousel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overflowing: Story = {};
/** Nothing to scroll, so no arrows. */
export const FewItems: Story = { args: { children: tiles(3) } };
export const WithActions: Story = { args: { actions: <PillButton>New playlist</PillButton> } };
export const NoTitle: Story = { args: { title: undefined } };
export const WideGap: Story = { args: { gap: '40px' } };
function SearchCarousel(args: CarouselProps) {
  const [value, setValue] = useState('');
  return (
    <Carousel
      {...args}
      search={{ value, onChange: setValue, placeholder: 'Search albums', status: value ? 'searching tracks…' : undefined }}
    />
  );
}
export const WithSearch: Story = { render: (args) => <SearchCarousel {...args} /> };
