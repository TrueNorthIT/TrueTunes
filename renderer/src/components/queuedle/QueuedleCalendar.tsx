import { useMemo, useState } from 'react';
import styles from '../styles/Queuedle.module.css';

interface Props {
  dates: GameDateEntry[];
  selectedDate: string | null;
  todayId: string;
  onSelectDate: (gameId: string) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function gameIdFor(year: number, monthIdx: number, day: number): string {
  return `${year}-${pad2(monthIdx + 1)}-${pad2(day)}`;
}

function parseGameId(id: string): { year: number; monthIdx: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(id);
  if (!m) return null;
  return { year: Number(m[1]), monthIdx: Number(m[2]) - 1, day: Number(m[3]) };
}

export function QueuedleCalendar({ dates, selectedDate, todayId, onSelectDate }: Props) {
  const today = useMemo(() => parseGameId(todayId), [todayId]);

  const [viewYear, setViewYear] = useState<number>(today?.year ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(today?.monthIdx ?? new Date().getMonth());

  const dateMap = useMemo(() => {
    const m = new Map<string, GameDateEntry>();
    for (const d of dates) m.set(d.gameId, d);
    return m;
  }, [dates]);

  const earliestEntry = useMemo(() => {
    if (dates.length === 0) return null;
    let min = dates[0].gameId;
    for (const d of dates) if (d.gameId < min) min = d.gameId;
    return parseGameId(min);
  }, [dates]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Day-of-week for the 1st, in Monday-first ordering (0..6).
  const firstOffset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

  const cells: Array<{ day: number | null; gameId: string | null; entry: GameDateEntry | null; isToday: boolean; isFuture: boolean }> = [];
  for (let i = 0; i < firstOffset; i++) {
    cells.push({ day: null, gameId: null, entry: null, isToday: false, isFuture: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const id = gameIdFor(viewYear, viewMonth, day);
    cells.push({
      day,
      gameId: id,
      entry: dateMap.get(id) ?? null,
      isToday: id === todayId,
      isFuture: id > todayId,
    });
  }

  const canGoPrev = !earliestEntry || (
    viewYear > earliestEntry.year ||
    (viewYear === earliestEntry.year && viewMonth > earliestEntry.monthIdx)
  );
  const canGoNext = !today || (
    viewYear < today.year ||
    (viewYear === today.year && viewMonth < today.monthIdx)
  );

  function goPrev() {
    if (!canGoPrev) return;
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function goNext() {
    if (!canGoNext) return;
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  return (
    <div className={styles.calendar}>
      <div className={styles.calendarHeader}>
        <button
          type="button"
          className={styles.calendarNav}
          onClick={goPrev}
          disabled={!canGoPrev}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className={styles.calendarTitle}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          className={styles.calendarNav}
          onClick={goNext}
          disabled={!canGoNext}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className={styles.calendarDayRow}>
        {DAY_LABELS.map((l, i) => (
          <span key={i} className={styles.calendarDayLabel}>{l}</span>
        ))}
      </div>
      <div className={styles.calendarGrid}>
        {cells.map((c, i) => {
          if (c.day === null || c.gameId === null) {
            return <div key={i} className={styles.calendarCellEmpty} />;
          }
          const playable = !!c.entry && c.entry.status === 'ready' && !c.entry.userPlayed && !c.isFuture;
          const played = !!c.entry && c.entry.userPlayed;
          const unavailable = !c.entry || c.entry.status !== 'ready' || c.isFuture;
          const isSelected = c.gameId === selectedDate;
          const cls = [
            styles.calendarCell,
            playable && styles.calendarCellPlayable,
            played && styles.calendarCellPlayed,
            unavailable && !played && styles.calendarCellUnavailable,
            c.isToday && styles.calendarCellToday,
            isSelected && styles.calendarCellSelected,
          ].filter(Boolean).join(' ');
          return (
            <button
              key={i}
              type="button"
              className={cls}
              disabled={!playable}
              onClick={() => { if (playable && c.gameId) onSelectDate(c.gameId); }}
              aria-label={`${c.gameId}${played ? ' (played)' : playable ? ' (play)' : ' (not available)'}`}
            >
              {c.day}
            </button>
          );
        })}
      </div>
      <div className={styles.calendarLegend}>
        <span className={`${styles.calendarLegendSwatch} ${styles.calendarCellPlayable}`} />
        <span className={styles.calendarLegendLabel}>Available</span>
        <span className={`${styles.calendarLegendSwatch} ${styles.calendarCellPlayed}`} />
        <span className={styles.calendarLegendLabel}>Played</span>
      </div>
    </div>
  );
}
