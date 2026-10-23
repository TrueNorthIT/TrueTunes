import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueuedleHistory } from '../../hooks/useDailyGame';
import {
  buildHeatmap,
  buildRatingSeries,
  buildRoundAverages,
  buildWeeklyTotals,
  listPlayers,
} from '../../lib/queuedleStats';
import type { QueuedleDay } from '../../lib/queuedleStats';
import { formatWeekRange } from '../../lib/queuedleWeek';
import styles from '../../styles/QueuedleStats.module.css';

// Everyone is drawn in a recessive grey; only you and up to two players you pick
// get a colour. Three slots is what stays colour-blind-safe when every pair can
// sit side by side (the scatter), so the cap holds on every chart.
const SLOT_COLOURS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];
const MAX_PICKS = SLOT_COLOURS.length - 1;
const MUTED = 'var(--glass)';

// Sequential blue, dark surface: low scores recede towards the surface.
const RAMP_STEPS = 9;
const rampStep = (i: number) => `color-mix(in srgb, var(--ramp-hi) ${Math.round((i / (RAMP_STEPS - 1)) * 100)}%, var(--ramp-lo))`;
const RAMP = Array.from({ length: RAMP_STEPS }, (_, i) => rampStep(i));
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
function spreadLabels<T extends { y: number }>(labels: T[], gap = 14): T[] {
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

interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className={styles.tooltip} style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.content}
    </div>
  );
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
  const m = { top: 12, right: 110, bottom: 26, left: 40 };
  const w = Math.max(0, width - m.left - m.right);
  const h = height - m.top - m.bottom;
  const x = (i: number) => m.left + (dates.length <= 1 ? w / 2 : (i / (dates.length - 1)) * w);
  // Running averages settle well above zero, so fit the axis to the data.
  const lo = useMemo(
    () => axisFloor(series.flatMap((s) => s.values.filter((v): v is number => v !== null))),
    [series]
  );
  const y = (v: number) => m.top + h - ((v - lo) / (100 - lo)) * h;

  const path = (values: (number | null)[]) =>
    values.reduce((d, v, i) => (v === null ? d : `${d}${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`), '');

  const highlighted = series.filter((s) => colourOf(s.userName));
  const muted = series.filter((s) => !colourOf(s.userName));
  const ticks = tickRange(lo);
  const labelEvery = Math.max(1, Math.ceil(dates.length / Math.max(1, Math.floor(w / 70))));

  // Direct labels at the right edge, nudged apart so they never overlap.
  const endLabels = spreadLabels(
    highlighted
      .map((s) => {
        const last = [...s.values].reverse().find((v) => v !== null) ?? null;
        return { s, y: last === null ? null : y(last), last };
      })
      .filter((l): l is { s: typeof highlighted[number]; y: number; last: number } => l.y !== null)
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
  const shownRows = hoverRows.filter((r) => colourOf(r.s.userName)).concat(
    hoverRows.filter((r) => !colourOf(r.s.userName)).slice(0, 3)
  );

  return (
    <div ref={ref} className={styles.chart}>
      {width > 0 && (
        <svg width={width} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img"
          aria-label="Running average score over time for each player">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={m.left + w} y1={y(t)} y2={y(t)} className={styles.grid} />
              <text x={m.left - 8} y={y(t)} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">{t}%</text>
            </g>
          ))}
          {dates.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={d} x={x(i)} y={height - 6} className={styles.axisLabel} textAnchor="middle">{shortDate(d)}</text>
            ) : null
          )}
          {muted.map((s) => (
            <path key={s.userName} d={path(s.values)} fill="none" stroke={MUTED} strokeWidth={1.25} />
          ))}
          {highlighted.map((s) => (
            <path key={s.userName} d={path(s.values)} fill="none" stroke={colourOf(s.userName)!} strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round" />
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
                  <circle key={s.userName} cx={x(hover)} cy={y(s.values[hover]!)} r={4} fill={colourOf(s.userName)!}
                    className={styles.ring} />
                )
              )}
            </>
          )}
        </svg>
      )}
      <Tooltip
        tip={
          hover === null || shownRows.length === 0
            ? null
            : {
                x: Math.min(x(hover) + 12, Math.max(0, width - 190)),
                y: m.top,
                content: (
                  <>
                    <div className={styles.tipTitle}>{shortDate(dates[hover])}</div>
                    {shownRows.map(({ s, v }) => (
                      <div key={s.userName} className={styles.tipRow}>
                        <Swatch colour={colourOf(s.userName) ?? MUTED} />
                        <span className={styles.tipName}>{s.userName}{s.played[hover] ? '' : ' (no game)'}</span>
                        <span className={styles.tipValue}>{v.toFixed(1)}%</span>
                      </div>
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

function Heatmap({ days, colourOf }: { days: QueuedleDay[]; colourOf: (u: string) => string | null }) {
  const { dates, rows } = useMemo(() => buildHeatmap(days), [days]);
  const [tip, setTip] = useState<Tip | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const maxByDate = useMemo(() => days.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.gameId]: d.questionCount * 2 }), {}), [days]);

  // Start scrolled to the latest days.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [dates.length]);

  function show(e: React.PointerEvent, userName: string, di: number, total: number | null) {
    const wrap = wrapRef.current?.getBoundingClientRect();
    const cell = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!wrap) return;
    setTip({
      x: Math.min(cell.left - wrap.left + 18, wrap.width - 180),
      y: cell.top - wrap.top - 6,
      content: (
        <>
          <div className={styles.tipTitle}>{userName} · {shortDate(dates[di])}</div>
          <div className={styles.tipRow}>
            <span className={styles.tipName}>{total === null ? 'Didn’t play' : 'Total'}</span>
            {total !== null && <span className={styles.tipValue}>{total}/{maxByDate[dates[di]]}</span>}
          </div>
        </>
      ),
    });
  }

  return (
    <div ref={wrapRef} className={styles.chart} onPointerLeave={() => setTip(null)}>
      <div className={styles.heatmap}>
        <div className={styles.heatNames}>
          <div className={styles.heatCorner} />
          {rows.map((r) => (
            <div key={r.userName} className={styles.heatName} title={r.userName}>
              {colourOf(r.userName) && <Swatch colour={colourOf(r.userName)!} />}
              <span className={colourOf(r.userName) ? styles.heatNameStrong : undefined}>{r.userName}</span>
            </div>
          ))}
        </div>
        <div ref={scrollRef} className={styles.heatScroll}>
          <div className={styles.heatDates}>
            {dates.map((d, i) => (
              <div key={d} className={styles.heatDate}>{i % 7 === 0 || i === dates.length - 1 ? shortDate(d) : ''}</div>
            ))}
          </div>
          {rows.map((r) => (
            <div key={r.userName} className={styles.heatRow}>
              {r.cells.map((pct, di) => (
                <div
                  key={dates[di]}
                  className={pct === null ? styles.heatEmpty : styles.heatCell}
                  style={pct === null ? undefined : { background: rampColour(pct) }}
                  onPointerEnter={(e) => show(e, r.userName, di, r.totals[di])}
                  aria-label={`${r.userName} ${dates[di]}: ${r.totals[di] ?? 'no game'}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.rampLegend} aria-hidden="true">
        <span>0%</span>
        <span className={styles.rampBar} style={{ background: `linear-gradient(to right, ${RAMP.join(',')})` }} />
        <span>100% of the day’s points</span>
        <span className={styles.heatEmptyKey} /> <span>didn’t play</span>
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

// ── Higher/Lower vs Top Queuer ───────────────────────────────────────────────

function RoundsScatter({ days, colourOf }: { days: QueuedleDay[]; colourOf: (u: string) => string | null }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const points = useMemo(() => buildRoundAverages(days), [days]);
  const size = Math.min(width, 520);
  const m = { top: 14, right: 16, bottom: 40, left: 46 };
  const w = Math.max(0, size - m.left - m.right);
  const h = Math.max(0, size * 0.8 - m.top - m.bottom);
  const height = h + m.top + m.bottom;
  // One shared floor for both axes keeps the diagonal at 45 degrees.
  const lo = axisFloor(points.flatMap((p) => [p.mainPct, p.bonusPct]));
  const x = (v: number) => m.left + ((v - lo) / (100 - lo)) * w;
  const y = (v: number) => m.top + h - ((v - lo) / (100 - lo)) * h;
  const ticks = tickRange(lo);
  const labels = spreadLabels(
    points.filter((p) => colourOf(p.userName)).map((p) => ({ p, y: y(p.bonusPct) })),
    13
  );
  const ordered = [...points].sort((a, b) => Number(!!colourOf(a.userName)) - Number(!!colourOf(b.userName)));

  return (
    <div ref={ref} className={styles.chart} onPointerLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={size} height={height} role="img" aria-label="Average Higher or Lower score against average Top Queuer score per player">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={m.left + w} y1={y(t)} y2={y(t)} className={styles.grid} />
              <line x1={x(t)} x2={x(t)} y1={m.top} y2={m.top + h} className={styles.grid} />
              <text x={m.left - 8} y={y(t)} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">{t}%</text>
              <text x={x(t)} y={m.top + h + 16} className={styles.axisLabel} textAnchor="middle">{t}%</text>
            </g>
          ))}
          <line x1={x(lo)} y1={y(lo)} x2={x(100)} y2={y(100)} className={styles.diagonal} />
          <text x={m.left + w / 2} y={height - 4} className={styles.axisTitle} textAnchor="middle">Higher or Lower (knows the music) →</text>
          <text transform={`translate(12 ${m.top + h / 2}) rotate(-90)`} className={styles.axisTitle} textAnchor="middle">Top Queuer (knows the people) →</text>
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
                          <div className={styles.tipTitle}>{p.userName}</div>
                          <div className={styles.tipRow}><span className={styles.tipName}>Higher or Lower</span><span className={styles.tipValue}>{p.mainPct.toFixed(0)}%</span></div>
                          <div className={styles.tipRow}><span className={styles.tipName}>Top Queuer</span><span className={styles.tipValue}>{p.bonusPct.toFixed(0)}%</span></div>
                          <div className={styles.tipRow}><span className={styles.tipName}>Games</span><span className={styles.tipValue}>{p.games}</span></div>
                        </>
                      ),
                    })
                  }
                />
              </g>
            );
          })}
          {labels.map(({ p, y: ly }) => (
            <text key={p.userName} x={x(p.mainPct) + 10} y={ly} className={styles.directLabel} dominantBaseline="middle"
              pointerEvents="none">{p.userName}</text>
          ))}
        </svg>
      )}
      <Tooltip tip={tip} />
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
        <button className={styles.navBtn} onClick={() => setIdx((i) => i + 1)} disabled={idx >= weeks.length - 1} aria-label="Previous week">‹</button>
        <span className={styles.weekLabel}>{formatWeekRange(week.range)}</span>
        <button className={styles.navBtn} onClick={() => setIdx((i) => i - 1)} disabled={idx === 0} aria-label="Next week">›</button>
      </div>
      <div className={styles.bars}>
        {week.standings.map((s, i) => {
          const colour = colourOf(s.userName);
          return (
            <div key={s.userName} className={styles.barRow} title={`${s.userName}: ${s.total} points from ${s.gamesPlayed} games`}>
              <span className={styles.barRank}>{i + 1}</span>
              <span className={`${styles.barName}${colour ? ' ' + styles.heatNameStrong : ''}`}>{s.userName}</span>
              <span className={styles.barTrack}>
                <span className={styles.bar} style={{ width: `${(s.total / max) * 100}%`, background: colour ?? MUTED }} />
              </span>
              <span className={styles.barValue}>{s.total}</span>
              <span className={styles.barGames}>{s.gamesPlayed}g</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function QueuedleStatsPanel() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState<string | null | undefined>(undefined);
  const [picks, setPicks] = useState<string[]>([]);
  useEffect(() => {
    window.sonos.getDisplayName().then(setDisplayName);
  }, []);
  const history = useQueuedleHistory(displayName);
  const days = useMemo(() => history.data ?? [], [history.data]);
  const players = useMemo(() => listPlayers(days), [days]);

  const highlighted = useMemo(() => {
    const me = displayName && players.includes(displayName) ? [displayName] : [];
    return [...me, ...picks.filter((p) => p !== displayName)].slice(0, SLOT_COLOURS.length);
  }, [displayName, players, picks]);
  // Colour follows the player, not their position in any chart.
  const colourOf = (u: string) => {
    const i = highlighted.indexOf(u);
    return i === -1 ? null : SLOT_COLOURS[i];
  };

  function togglePick(u: string) {
    if (u === displayName) return;
    setPicks((prev) => {
      if (prev.includes(u)) return prev.filter((p) => p !== u);
      const next = [...prev, u];
      return next.length > MAX_PICKS ? next.slice(next.length - MAX_PICKS) : next;
    });
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Queuedle Stats</h1>
        <span className={styles.sub}>
          {days.length > 0 ? `${days.length} games · ${players.length} players` : ''}
        </span>
        <div className={styles.spacer} />
        <button className={styles.backBtn} onClick={() => navigate('/queuedle')}>← Queuedle</button>
      </div>
      <div className={styles.body}>
        {(history.isLoading || displayName === undefined) && <div className={styles.state}>Loading every game so far…</div>}
        {history.isError && <div className={styles.state}>Couldn’t load the Queuedle history.</div>}
        {!history.isLoading && displayName !== undefined && !history.isError && days.length === 0 && (
          <div className={styles.state}>No Queuedle games yet.</div>
        )}
        {days.length > 0 && (
          <>
            <div className={styles.picker} aria-label="Highlight players">
              <span className={styles.pickerHint}>Highlight up to {MAX_PICKS} others:</span>
              {players.map((u) => {
                const colour = colourOf(u);
                const isMe = u === displayName;
                return (
                  <button
                    key={u}
                    className={`${styles.chip}${colour ? ' ' + styles.chipOn : ''}`}
                    aria-pressed={!!colour}
                    disabled={isMe}
                    onClick={() => togglePick(u)}
                  >
                    {colour && <Swatch colour={colour} />}
                    {u}{isMe ? ' (you)' : ''}
                  </button>
                );
              })}
            </div>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Rating over time</h2>
              <p className={styles.sectionHint}>Each player’s running average, as a % of every point they could have scored.</p>
              <RatingChart days={days} colourOf={colourOf} />
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Daily scores</h2>
              <p className={styles.sectionHint}>Every player, every day. Brighter is better.</p>
              <Heatmap days={days} colourOf={colourOf} />
            </section>

            <div className={styles.twoUp}>
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Higher or Lower vs Top Queuer</h2>
                <p className={styles.sectionHint}>Above the line, you know the people better than the music.</p>
                <RoundsScatter days={days} colourOf={colourOf} />
              </section>
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Weekly totals</h2>
                <p className={styles.sectionHint}>Points summed Monday to Sunday.</p>
                <WeeklyBars days={days} colourOf={colourOf} />
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
