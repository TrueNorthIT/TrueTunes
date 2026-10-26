import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageProviders, pageParameters } from '../../.storybook/pageStory';
import { containerItem, shelfId } from '../test/fixtures/sonosShapes';
import { ContainerPanel } from './ContainerPanel';

// A music service shelf opened in full (Home's "Quick picks"): songs as a list, albums and artists as tiles.

const meta = {
  title: 'Pages/Container',
  parameters: pageParameters(`/container/${shelfId.quick}`, {
    pattern: '/container/:id',
    state: { item: containerItem(shelfId.quick, 'Quick picks') },
  }),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <PageProviders>
      <ContainerPanel />
    </PageProviders>
  ),
};
