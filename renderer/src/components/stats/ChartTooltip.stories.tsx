import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChartTooltip, TipRow, TipTitle } from './ChartTooltip';

const meta = {
  title: 'Stats/ChartTooltip',
  component: ChartTooltip,
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', height: '9em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChartTooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Title: Story = {
  args: { tip: { x: 16, y: 8, content: <TipTitle>Fri 18:00 · 412 queues</TipTitle> } },
};
export const Rows: Story = {
  args: {
    tip: {
      x: 16,
      y: 8,
      content: (
        <>
          <TipTitle>Priya Shah · 12 Oct</TipTitle>
          <TipRow name="Total" value="14/20" />
          <TipRow
            name="Tom Ellis"
            value="71.5%"
            swatch={
              <span style={{ width: '0.6em', height: '0.6em', borderRadius: '50%', background: 'var(--series-2)' }} />
            }
          />
        </>
      ),
    },
  },
};
