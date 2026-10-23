import type { Meta, StoryObj } from '@storybook/react-vite';
import { TipTitle } from './ChartTooltip';
import { Heatmap, RAMP } from './Heatmap';
import type { HeatRow } from './Heatmap';

const fill = (v: number | null) => (v === null ? null : RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))]);
const pseudo = (r: number, c: number) => ((r * 31 + c * 17) % 11) / 10;

const hours = Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? String(h) : ''));
const week: HeatRow[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, r) => ({
  key: d,
  label: d,
  cells: hours.map((_, c) => fill(c < 7 || c > 21 ? null : pseudo(r, c))),
}));

const dates = Array.from({ length: 70 }, (_, i) => (i % 7 === 0 ? `${1 + (i % 28)} Oct` : ''));
const people: HeatRow[] = ['Priya Shah', 'Tom Ellis', 'Aisha Khan', 'Fergus Westlake'].map((n, r) => ({
  key: n,
  label: n,
  cells: dates.map((_, c) => fill((r + c) % 5 === 0 ? null : pseudo(r, c))),
}));

const meta = {
  title: 'Stats/Heatmap',
  component: Heatmap,
  args: {
    columns: hours,
    rows: week,
    cellLabel: (r: number, c: number) => `row ${r} column ${c}`,
    renderTip: (r: number, c: number) => <TipTitle>Row {r}, column {c}</TipTitle>,
    legend: { lo: 'Quiet', hi: 'Busiest (412)', empty: 'nothing queued' },
    ariaLabel: 'Queues by day of the week and hour',
  },
  decorators: [(Story) => <div style={{ maxWidth: '52em' }}><Story /></div>],
} satisfies Meta<typeof Heatmap>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FitsWidth: Story = {};
export const ScrollsSideways: Story = {
  args: { columns: dates, rows: people, minCell: '1.4em', startAtEnd: true, ariaLabel: undefined, legend: { lo: '0%', hi: '100% of the day’s points', empty: 'didn’t play' } },
};
