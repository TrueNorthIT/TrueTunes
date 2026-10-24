import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueuedleHistory } from '../../hooks/useDailyGame';
import { useDisplayName } from '../../hooks/useDisplayName';
import {
  buildHeatmap,
  buildRatingSeries,
  buildRoundAverages,
  buildWeeklyTotals,
  listPlayers,
} from '../../lib/queuedleStats';
import type { QueuedleDay } from '../../lib/queuedleStats';
import { formatWeekRange } from '../../lib/queuedleWeek';
import { PersonChip } from '../common/PersonChip';
import { PillButton } from '../common/PillButton';
import { SectionCard } from '../common/SectionCard';
import { BarList } from '../stats/BarList';
import { ChartTooltip, TipRow, TipTitle } from '../stats/ChartTooltip';
import type { Tip } from '../stats/ChartTooltip';
import { Heatmap } from '../stats/Heatmap';
import { RAMP } from '../stats/ramp';
import { StatsPage } from '../stats/StatsPage';
import styles from '../../styles/QueuedleStats.module.css';

// Everyone is drawn in a recessive grey; you and the players you pick get a
// colour from the categorical palette, in this fixed order (it's the order that
// keeps neighbours colour-blind-safe). There are eight distinct colours, so up
// to eight people. Past that, colours would repeat and two people would look
// the same. Highlighted players are always named on the charts, so identity
// never rests on colour alone (the scatter needs that once past three).
const SLOT_COLOURS = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
const MAX_PICKS = SLOT_COLOURS.length - 1;
const MUTED = 'var(--glass)';

const rampColour = (pct: number) => RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.floor((pct / 100) * RAMP.length)))];

function shortDate(id: string): string {
  return new Date(`${id}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Lowest round-ten axis value that still leaves a little room under the data. */
function axisFloor(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(0, Math.floor((Math.min(...values) - 3) / 10) * 10);
}

const tickRange = (lo: number) => {
  const step = 100 - lo > 50 ? 25 : 10;
  const ticks: number[] = [];
  for (let t = 100; t >= lo; t -= step) ticks.unshift(t);
  return ticks;
};

/** Pushes label y positions apart so none sit closer than `gap`. */
function spreadLabels<T extends { y: number }>(labels: T[], gap = 18): T[] {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < gap) sorted[i] = { ...sorted[i], y: sorted[i - 1].y + gap };
  }
  return sorted;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function Swatch({ colour }: { colour: string }) {
  return <span className={styles.swatch} style={{ background: colour }} />;
}

// ── Rating over time ─────────────────────────────────────────────────────────

function RatingChart({ days, colourOf }: { days: QueuedleDay[]; colourOf: (u: string) => string | null }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const { dates, series } = useMemo(() => buildRatingSeries(days), [days]);
  const height = 260;
  const m = { top: 12, right: 150, bottom: 32, left: 50 };
  const w = Math.max(0, width - m.left - m.right);
  const h = height - m.top - m.bottom;
  const x = (i: number) => m.left + (dates.length <= 1 ? w / 2 : (i / (dates.length - 1)) * w);
  // Running averages settle well above zero, so fit the axis to the data.
  const lo = useMemo(() => axisFloor(series.flatMap((s) => s.values.filter((v): v is number => v !== null))), [series]);
  const y = (v: number) => m.top + h - ((v - lo) / (100 - lo)) * h;

  const path = (values: (number | null)[]) =>
    values.reduce((d, v, i) => (v === null ? d : `${d}${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`), '');

  const highlighted = series.filter((s) => colourOf(s.userName));
  const muted = series.filter((s) => !colourOf(s.userName));
  const ticks = tickRange(lo);
  const labelEvery = Math.max(1, Math.ceil(dates.length / Math.max(1, Math.floor(w / 80))));

  // Direct labels at the right edge, nudged apart so they never overlap.
  const endLabels = spreadLabels(
    highlighted
      .map((s) => {
        const last = [...s.values].reverse().find((v) => v !== null) ?? null;
        return { s, y: last === null ? null : y(last), last };
      })
      .filter((l): l is { s: (typeof highlighted)[number]; y: number; last: number } => l.y !== null)
  );

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (dates.length === 0) return;
    const i = dates.length <= 1 ? 0 : Math.round(((px - m.left) / w) * (dates.length - 1));
    setHover(Math.max(0, Math.min(dates.length - 1, i)));
  }

  const hoverRows =
    hover === null
      ? []
      : series
          .filter((s) => s.values[hover] !== null)
          .map((s) => ({ s, v: s.values[hover]! }))
          .sort((a, b) => b.v - a.v);
  const shownRows = hoverRows
    .filter((r) => colourOf(r.s.userName))
    .concat(hoverRows.filter((r) => !colourOf(r.s.userName)).slice(0, 3));

  return (
    <div ref={ref} className={styles.chart}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label="Running average score over time for each player"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={m.left + w} y1={y(t)} y2={y(t)} className={styles.grid} />
              <text x={m.left - 8} y={y(t)} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">
                {t}%
              </text>
            </g>
          ))}
          {dates.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={d} x={x(i)} y={height - 8} className={styles.axisLabel} textAnchor="middle">
                {shortDate(d)}
              </text>
            ) : null
          )}
          {muted.map((s) => (
            <path key={s.userName} d={path(s.values)} fill="none" stroke={MUTED} strokeWidth={1.25} />
          ))}
          {highlighted.map((s) => (
            <path
              key={s.userName}
              d={path(s.values)}
              fill="none"
              stroke={colourOf(s.userName)!}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {endLabels.map(({ s, y: ly, last }) => (
            <text key={s.userName} x={m.left + w + 8} y={ly} className={styles.directLabel} dominantBaseline="middle">
              {s.userName} {Math.round(last)}%
            </text>
          ))}
          {hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + h} className={styles.crosshair} />
              {highlighted.map((s) =>
                s.values[hover] === null ? null : (
                  <circle
                    key={s.userName}
                    cx={x(hover)}
                    cy={y(s.values[hover]!)}
                    r={4}
                    fill={colourOf(s.userName)!}
                    className={styles.ring}
                  />
                )
              )}
            </>
          )}
        </svg>
      )}
      <ChartTooltip
        tip={
          hover === null || shownRows.length === 0
            ? null
            : {
                x: Math.min(x(hover) + 12, Math.max(0, width - 190)),
                y: m.top,
                content: (
                  <>
                    <TipTitle>{shortDate(dates[hover])}</TipTitle>
                    {shownRows.map(({ s, v }) => (
                      <TipRow
                        key={s.userName}
                        swatch={<Swatch colour={colourOf(s.userName) ?? MUTED} />}
                        name={`${s.userName}${s.played[hover] ? '' : ' (no game)'}`}
                        value={`${v.toFixed(1)}%`}
                      />
                    ))}
                  </>
                ),
              }
        }
      />
    </div>
  );
}

// ── Daily scores heatmap ─────────────────────────────────────────────────────

function DailyScores({ days, colourOf }: { days: QueuedleDay[]; colourOf: (u: string) => string | null }) {
  const { dates, rows } = useMemo(() => buildHeatmap(days), [days]);
  const maxByDate = useMemo(
    () => days.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.gameId]: d.questionCount * 2 }), {}),
    [days]
  );
  // A label every seventh day, counting back from the latest, so the newest day is always named.
  const columns = dates.map((d, i) => ((dates.length - 1 - i) % 7 === 0 ? shortDate(d) : ''));

  return (
    <Heatmap
      columns={columns}
      minCell="1.4em"
      cellHeight="1.4em"
      startAtEnd
      rows={rows.map((r) => {
        const colour = colourOf(r.userName);
        return {
          key: r.userName,
          label: (
            <>
              {colour && <Swatch colour={colour} />}
              <span className={colour ? styles.strong : undefined} title={r.userName}>
                {r.userName}
              </span>
            </>
          ),
          cells: r.cells.map((pct) => (pct === null ? null : rampColour(pct))),
        };
      })}
      cellLabel={(ri, di) => `${rows[ri].userName} ${dates[di]}: ${rows[ri].totals[di] ?? 'no game'}`}
      renderTip={(ri, di) => {
        const total = rows[ri].totals[di];
        return (
          <>
            <TipTitle>
              {rows[ri].userName} · {shortDate(dates[di])}
            </TipTitle>
            <TipRow
              name={total === null ? 'Didn’t play' : 'Total'}
              value={total === null ? undefined : `${total}/${maxByDate[dates[di]]}`}
            />
          </>
        );
      }}
      legend={{ lo: '0%', hi: '100% of the day’s points', empty: 'didn’t play' }}
    />
  );
}

// ── Higher/Lower vs Top Queuer ───────────────────────────────────────────────

function RoundsScatter({ days, colourOf }: { days: QueuedleDay[]; colourOf: (u: string) => string | null }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const points = useMemo(() => buildRoundAverages(days), [days]);
  const size = Math.min(width, 520);
  const m = { top: 14, right: 16, bottom: 48, left: 58 };
  const w = Math.max(0, size - m.left - m.right);
  const h = Math.max(0, size * 0.95 - m.top - m.bottom);
  const height = h + m.top + m.bottom;
  // One shared floor for both axes keeps the diagonal at 45 degrees.
  const lo = axisFloor(points.flatMap((p) => [p.mainPct, p.bonusPct]));
  const x = (v: number) => m.left + ((v - lo) / (100 - lo)) * w;
  const y = (v: number) => m.top + h - ((v - lo) / (100 - lo)) * h;
  const ticks = tickRange(lo);
  const labels = spreadLabels(
    points.filter((p) => colourOf(p.userName)).map((p) => ({ p, y: y(p.bonusPct) })),
    17
  );
  const ordered = [...points].sort((a, b) => Number(!!colourOf(a.userName)) - Number(!!colourOf(b.userName)));

  return (
    <div ref={ref} className={styles.chart} onPointerLeave={() => setTip(null)}>
      {width > 0 && (
        <svg
          width={size}
          height={height}
          role="img"
          aria-label="Average Higher or Lower score against average Top Queuer score per player"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={m.left + w} y1={y(t)} y2={y(t)} className={styles.grid} />
              <line x1={x(t)} x2={x(t)} y1={m.top} y2={m.top + h} className={styles.grid} />
              <text x={m.left - 8} y={y(t)} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">
                {t}%
              </text>
              <text x={x(t)} y={m.top + h + 20} className={styles.axisLabel} textAnchor="middle">
                {t}%
              </text>
            </g>
          ))}
          <line x1={x(lo)} y1={y(lo)} x2={x(100)} y2={y(100)} className={styles.diagonal} />
          <text x={m.left + w / 2} y={height - 6} className={styles.axisTitle} textAnchor="middle">
            Higher or Lower (knows the music) →
          </text>
          <text
            transform={`translate(14 ${m.top + h / 2}) rotate(-90)`}
            className={styles.axisTitle}
            textAnchor="middle"
          >
            Top Queuer (knows the people) →
          </text>
          {ordered.map((p) => {
            const colour = colourOf(p.userName);
            return (
              <g key={p.userName}>
                <circle
                  cx={x(p.mainPct)}
                  cy={y(p.bonusPct)}
                  r={colour ? 6 : 5}
                  fill={colour ?? 'var(--glass-hi)'}
                  className={styles.ring}
                />
                <circle
                  cx={x(p.mainPct)}
                  cy={y(p.bonusPct)}
                  r={12}
                  fill="transparent"
                  onPointerEnter={() =>
                    setTip({
                      x: Math.min(x(p.mainPct) + 14, size - 180),
                      y: y(p.bonusPct) - 10,
                      content: (
                        <>
                          <TipTitle>{p.userName}</TipTitle>
                          <TipRow name="Higher or Lower" value={`${p.mainPct.toFixed(0)}%`} />
                          <TipRow name="Top Queuer" value={`${p.bonusPct.toFixed(0)}%`} />
                          <TipRow name="Games" value={p.games} />
                        </>
                      ),
                    })
                  }
                />
              </g>
            );
          })}
          {labels.map(({ p, y: ly }) => (
            <text
              key={p.userName}
              x={x(p.mainPct) + 10}
              y={ly}
              className={styles.directLabel}
              dominantBaseline="middle"
              pointerEvents="none"
            >
              {p.userName}
            </text>
          ))}
        </svg>
      )}
      <ChartTooltip tip={tip} />
    </div>
  );
}

// ── Weekly totals ────────────────────────────────────────────────────────────

function WeeklyBars({ days, colourOf }: { days: QueuedleDay[]; colourOf: (u: string) => string | null }) {
  const weeks = useMemo(() => buildWeeklyTotals(days), [days]);
  const [idx, setIdx] = useState(0);
  const week = weeks[Math.min(idx, weeks.length - 1)];
  if (!week) return null;
  const max = Math.max(1, ...week.standings.map((s) => s.total));

  return (
    <div className={styles.chart}>
      <div className={styles.weekNav}>
        <PillButton
          className={styles.navBtn}
          onClick={() => setIdx((i) => i + 1)}
          disabled={idx >= weeks.length - 1}
          aria-label="Previous week"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </PillButton>
        <span className={styles.weekLabel}>{formatWeekRange(week.range)}</span>
        <PillButton
          className={styles.navBtn}
          onClick={() => setIdx((i) => i - 1)}
          disabled={idx === 0}
          aria-label="Next week"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </PillButton>
      </div>
      <BarList
        ranked
        max={max}
        rows={week.standings.map((s) => ({
          key: s.userName,
          name: s.userName,
          value: s.total,
          label: s.total,
          sub: `${s.gamesPlayed}g`,
          title: `${s.userName}: ${s.total} points from ${s.gamesPlayed} games`,
          colour: colourOf(s.userName),
        }))}
      />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function QueuedleStatsPanel() {
  const navigate = useNavigate();
  const displayName = useDisplayName();
  const [picks, setPicks] = useState<(string | null)[]>([]);
  const history = useQueuedleHistory(displayName);
  const days = useMemo(() => history.data ?? [], [history.data]);
  const players = useMemo(() => listPlayers(days), [days]);

  // You always take the first colour. Each pick holds its own slot until it's
  // removed, so taking someone off never repaints anyone else.
  const meHighlighted = !!displayName && players.includes(displayName);
  const colourOf = (u: string) => {
    if (meHighlighted && u === displayName) return SLOT_COLOURS[0];
    const i = picks.indexOf(u);
    return i === -1 ? null : SLOT_COLOURS[i + 1];
  };
  const pickCount = picks.filter(Boolean).length;

  function togglePick(u: string) {
    if (u === displayName) return;
    setPicks((prev) => {
      const at = prev.indexOf(u);
      if (at !== -1) return prev.map((p, i) => (i === at ? null : p));
      const free = prev.indexOf(null);
      if (free !== -1) return prev.map((p, i) => (i === free ? u : p));
      return prev.length < MAX_PICKS ? [...prev, u] : prev;
    });
  }

  return (
    <StatsPage
      title="Queuedle stats"
      facts={days.length > 0 ? `${days.length} games · ${players.length} players` : undefined}
      backLabel="Queuedle"
      onBack={() => void navigate('/queuedle')}
    >
      {(history.isLoading || displayName === undefined) && <p className={styles.state}>Loading every game so far…</p>}
      {history.isError && <p className={styles.state}>Couldn’t load the Queuedle history.</p>}
      {!history.isLoading && displayName !== undefined && !history.isError && days.length === 0 && (
        <p className={styles.state}>No Queuedle games yet.</p>
      )}
      {days.length > 0 && (
        <>
          <div className={styles.picker} role="group" aria-label="Highlight players">
            <span className={styles.pickerHint}>
              Highlight up to {MAX_PICKS} others{pickCount > 0 ? ` (${pickCount} picked)` : ''}:
            </span>
            {players.map((u) => {
              const colour = colourOf(u);
              const isMe = u === displayName;
              return (
                <PersonChip
                  key={u}
                  name={u}
                  suffix={isMe ? ' (you)' : ''}
                  selected={!!colour}
                  colour={colour}
                  disabled={isMe || (!colour && pickCount >= MAX_PICKS)}
                  title={!colour && !isMe && pickCount >= MAX_PICKS ? `Up to ${MAX_PICKS} at once` : undefined}
                  onClick={() => togglePick(u)}
                />
              );
            })}
            {pickCount > 0 && <PillButton onClick={() => setPicks([])}>Clear</PillButton>}
          </div>

          <SectionCard
            className={styles.section}
            title="Rating over time"
            sub="Each player’s running average, as a % of every point they could have scored."
          >
            <RatingChart days={days} colourOf={colourOf} />
          </SectionCard>

          <SectionCard
            className={styles.section}
            title="Daily scores"
            sub="Every player, every day. Brighter is better."
          >
            <DailyScores days={days} colourOf={colourOf} />
          </SectionCard>

          <div className={styles.twoUp}>
            <SectionCard
              title="Higher or Lower vs Top Queuer"
              sub="Above the line, you know the people better than the music."
            >
              <RoundsScatter days={days} colourOf={colourOf} />
            </SectionCard>
            <SectionCard title="Weekly totals" sub="Points summed Monday to Sunday.">
              <WeeklyBars days={days} colourOf={colourOf} />
            </SectionCard>
          </div>
        </>
      )}
    </StatsPage>
  );
}
