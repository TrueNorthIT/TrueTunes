import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useImage } from '../../hooks/useImage';
import {
  WEEKDAYS,
  VARIETY_MIN_TRACKS,
  airtimeRows,
  avgLengthRows,
  busiestSlot,
  defaultTastePerson,
  explicitRows,
  formatCount,
  formatDuration,
  formatHours,
  formatPct,
  lengthCoverage,
  musicStatsQueryOptions,
  NO_LENGTHS_TEXT,
  monthLabel,
  rampIndex,
  requeuedRows,
  shortDay,
  slotLabel,
  varietyRows,
} from '../../lib/musicStats';
import styles from '../../styles/MusicStats.module.css';

// Single-series charts: you in blue, everyone else in a recessive grey (the
// same convention as the Queuedle stats page). Values are always text-coloured.
const ME = 'var(--series-1)';
const MUTED = 'var(--glass)';

// Sequential blue, dark surface: quiet hours recede towards the surface.
const RAMP = Array.from({ length: 9 }, (_, i) => `color-mix(in srgb, var(--ramp-hi) ${Math.round((i / 8) * 100)}%, var(--ramp-lo))`);

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

function Thumb({ url, round }: { url: string | null; round?: boolean }) {
  const cached = useImage(url);
  const cls = `${styles.thumb}${round ? ' ' + styles.thumbRound : ''}`;
  if (!cached) return <div className={cls} data-placeholder />;
  return <img className={cls} src={cached} alt="" loading="lazy" />;
}

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {hint && <p className={styles.sectionHint}>{hint}</p>}
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <div className={styles.empty}>{children}</div>;

// ── Busy hours heatmap ───────────────────────────────────────────────────────

function BusyHours({ grid }: { grid: number[][] }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const max = useMemo(() => Math.max(0, ...grid.flat()), [grid]);

  function show(e: React.PointerEvent, weekday: number, hour: number, count: number) {
    const wrap = wrapRef.current?.getBoundingClientRect();
    const cell = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!wrap) return;
    setTip({
      x: Math.max(0, Math.min(cell.left - wrap.left + cell.width + 6, wrap.width - 190)),
      y: cell.top - wrap.top - 6,
      content: (
        <div className={styles.tipTitle}>
          {slotLabel(weekday, hour)} · {formatCount(count)} {count === 1 ? 'queue' : 'queues'}
        </div>
      ),
    });
  }

  return (
    <div ref={wrapRef} className={styles.chart} onPointerLeave={() => setTip(null)}>
      <div className={styles.heat} role="img" aria-label="Queues by day of the week and hour">
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className={styles.heatHour}>{h % 3 === 0 ? h : ''}</div>
        ))}
        {WEEKDAYS.map((day, wd) => (
          <div key={day} className={styles.heatRowWrap}>
            <div className={styles.heatDay}>{day}</div>
            {Array.from({ length: 24 }, (_, h) => {
              const count = grid[wd]?.[h] ?? 0;
              const i = rampIndex(count, max, RAMP.length);
              return (
                <div
                  key={h}
                  className={i === -1 ? styles.heatEmpty : styles.heatCell}
                  style={i === -1 ? undefined : { background: RAMP[i] }}
                  onPointerEnter={(e) => show(e, wd, h, count)}
                  aria-label={`${slotLabel(wd, h)}: ${count} queues`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className={styles.rampLegend} aria-hidden="true">
        <span>Quiet</span>
        <span className={styles.rampBar} style={{ background: `linear-gradient(to right, ${RAMP.join(',')})` }} />
        <span>Busiest ({formatCount(max)})</span>
        <span className={styles.heatEmptyKey} /> <span>nothing queued</span>
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

// ── Per-person bars ──────────────────────────────────────────────────────────

interface BarRow {
  userId: string;
  value: number;
  label: string;
  sub?: string;
  title?: string;
}

function PersonBars({ rows, me, max }: { rows: BarRow[]; me: string | null | undefined; max?: number }) {
  const top = max ?? Math.max(1e-9, ...rows.map((r) => r.value));
  return (
    <div className={styles.bars}>
      {rows.map((r) => {
        const mine = !!me && r.userId === me;
        return (
          <div key={r.userId} className={styles.barRow} title={r.title}>
            <span className={`${styles.barName}${mine ? ' ' + styles.strong : ''}`}>{r.userId}</span>
            <span className={styles.barTrack}>
              <span className={styles.bar} style={{ width: `${Math.min(100, (r.value / top) * 100)}%`, background: mine ? ME : MUTED }} />
            </span>
            <span className={styles.barValue}>{r.label}</span>
            {r.sub !== undefined && <span className={styles.barSub}>{r.sub}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Song lists ───────────────────────────────────────────────────────────────

function TrackList({ tracks }: { tracks: MusicTrackLength[] }) {
  return (
    <ol className={styles.list}>
      {tracks.map((t, i) => (
        <li key={`${i}|${t.trackName}|${t.artist}`} className={styles.item}>
          <Thumb url={t.imageUrl} />
          <div className={styles.itemText}>
            <div className={styles.itemTitle} title={t.trackName}>{t.trackName}</div>
            <div className={styles.itemSub} title={`${t.artist} · queued by ${t.firstBy}`}>
              {t.artist} · queued by {t.firstBy}
            </div>
          </div>
          <div className={styles.itemNums}>
            <span className={styles.itemValue}>{formatDuration(t.durationMs)}</span>
            <span className={styles.itemMuted}>×{formatCount(t.queues)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── Taste over time ──────────────────────────────────────────────────────────

function Taste({ person, mine }: { person: MusicPersonStats; mine: boolean }) {
  const maxMonth = Math.max(1, ...person.tasteByMonth.map((m) => m.queues));
  return (
    <div className={styles.taste}>
      <div className={styles.months}>
        {person.tasteByMonth.length === 0 && <Empty>Nothing queued yet.</Empty>}
        {person.tasteByMonth.map((m) => (
          <div key={m.month} className={styles.month}>
            <span className={styles.monthLabel}>{monthLabel(m.month)}</span>
            <span className={styles.monthQueues} title={`${formatCount(m.queues)} queues`}>
              <span className={styles.monthBar} style={{ width: `${Math.max(2, (m.queues / maxMonth) * 54)}px`, background: mine ? ME : MUTED }} />
              <span className={styles.monthCount}>{formatCount(m.queues)}</span>
            </span>
            <span className={styles.monthArtists}>
              {m.topArtists.slice(0, 3).map((a) => (
                <span key={a.artist} className={styles.artistPill} title={`${a.artist} ×${a.count}`}>
                  <span className={styles.artistName}>{a.artist}</span>
                  <span className={styles.itemMuted}>×{formatCount(a.count)}</span>
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
      <div className={styles.overall}>
        <h3 className={styles.subTitle}>All-time top artists</h3>
        <ol className={styles.topArtists}>
          {person.topArtists.map((a, i) => (
            <li key={a.artist} className={styles.topArtist}>
              <span className={styles.rank}>{i + 1}</span>
              <span className={styles.artistName} title={a.artist}>{a.artist}</span>
              <span className={styles.itemMuted}>×{formatCount(a.count)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function Stats({ data, me }: { data: MusicStatsResult; me: string | null | undefined }) {
  const [picked, setPicked] = useState<string | null>(null);
  const people = data.people;
  const hasLengths = data.tracksWithLength > 0;
  const coverage = lengthCoverage(data.tracksWithLength, data.uniqueTracks);
  const peak = busiestSlot(data.busyHours);

  const airtime = useMemo(() => airtimeRows(people), [people]);
  const avgLength = useMemo(() => avgLengthRows(people), [people]);
  const explicit = useMemo(() => explicitRows(people), [people]);
  const variety = useMemo(() => varietyRows(people), [people]);
  const requeued = useMemo(() => requeuedRows(people), [people]);

  const tasteName = picked ?? defaultTastePerson(people, me);
  const tastePerson = people.find((p) => p.userId === tasteName) ?? null;
  const chipOrder = useMemo(() => [...people].sort((a, b) => b.queues - a.queues), [people]);

  return (
    <>
      <Section
        title="Busy hours"
        hint={peak ? `When the office reaches for the queue. Peak: ${slotLabel(peak.weekday, peak.hour)}.` : 'When the office reaches for the queue.'}
      >
        <BusyHours grid={data.busyHours} />
      </Section>

      <div className={styles.twoUp}>
        <Section title="Airtime" hint={coverage ? `Hours of music each person has put on. ${coverage}.` : 'Hours of music each person has put on.'}>
          {hasLengths && airtime.length > 0 ? (
            <PersonBars
              me={me}
              rows={airtime.map((p) => ({
                userId: p.userId,
                value: p.airtimeMs,
                label: formatHours(p.airtimeMs),
                sub: `${formatCount(p.timedQueues)} songs`,
                title: `${p.userId}: ${formatHours(p.airtimeMs)} from ${formatCount(p.timedQueues)} songs with a known length`,
              }))}
            />
          ) : (
            <Empty>{NO_LENGTHS_TEXT}</Empty>
          )}
        </Section>

        <Section
          title="Song length"
          hint={`Average song length. Top of the list queues the prog epics.${coverage ? ` ${coverage}.` : ''}`}
        >
          {hasLengths && avgLength.length > 0 ? (
            <PersonBars
              me={me}
              rows={avgLength.map((p) => ({
                userId: p.userId,
                value: p.avgLengthMs,
                label: formatDuration(p.avgLengthMs),
                title: `${p.userId}: ${formatDuration(p.avgLengthMs)} on average over ${formatCount(p.timedQueues)} songs`,
              }))}
            />
          ) : (
            <Empty>{NO_LENGTHS_TEXT}</Empty>
          )}
        </Section>
      </div>

      <div className={styles.twoUp}>
        <Section title="Longest songs" hint="Settle in.">
          {hasLengths && data.longest.length > 0 ? <TrackList tracks={data.longest} /> : <Empty>{NO_LENGTHS_TEXT}</Empty>}
        </Section>
        <Section title="Shortest songs" hint="Blink and you’ll miss them.">
          {hasLengths && data.shortest.length > 0 ? <TrackList tracks={data.shortest} /> : <Empty>{NO_LENGTHS_TEXT}</Empty>}
        </Section>
      </div>

      <div className={styles.twoUp}>
        <Section title="Explicit" hint="Share of each person’s songs with a parental advisory sticker.">
          {explicit.length > 0 ? (
            <PersonBars
              me={me}
              max={100}
              rows={explicit.map((p) => ({
                userId: p.userId,
                value: p.explicitPct,
                label: formatPct(p.explicitPct),
                title: `${p.userId}: ${formatPct(p.explicitPct)} explicit`,
              }))}
            />
          ) : (
            <Empty>{hasLengths ? 'No explicit flags known yet.' : NO_LENGTHS_TEXT}</Empty>
          )}
        </Section>

        <Section
          title="Variety"
          hint={`Different artists per song queued. Only people with ${VARIETY_MIN_TRACKS}+ songs, so one-hit visitors don’t top it.`}
        >
          {variety.length > 0 ? (
            <PersonBars
              me={me}
              rows={variety.map((p) => ({
                userId: p.userId,
                value: p.variety,
                label: formatPct(p.variety * 100),
                sub: `${formatCount(p.uniqueArtists)} artists from ${formatCount(p.trackQueues)} songs`,
                title: `${p.userId}: ${formatCount(p.uniqueArtists)} artists from ${formatCount(p.trackQueues)} songs`,
              }))}
            />
          ) : (
            <Empty>Nobody has queued {VARIETY_MIN_TRACKS} songs yet.</Empty>
          )}
        </Section>
      </div>

      <div className={styles.twoUp}>
        <Section title="Discoverers" hint="Who brought an artist to the office before everyone else caught on.">
          {data.discoverers.length > 0 ? (
            <ol className={styles.list}>
              {data.discoverers.map((d) => (
                <li key={d.artist} className={styles.item}>
                  <Thumb url={d.imageUrl} round />
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle} title={d.artist}>{d.artist}</div>
                    <div className={styles.itemSub}>
                      first queued by <span className={d.firstBy === me ? styles.strong : undefined}>{d.firstBy}</span> on {shortDay(d.firstAt)}
                    </div>
                    <div className={styles.itemSub}>
                      since then queued {formatCount(d.othersQueues)} {d.othersQueues === 1 ? 'time' : 'times'} by others
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>No discoveries yet.</Empty>
          )}
        </Section>

        <Section title="Most re-queued" hint="Everyone’s comfort song.">
          {requeued.length > 0 ? (
            <ol className={styles.list}>
              {requeued.map((p) => (
                <li key={p.userId} className={styles.item}>
                  <Thumb url={p.mostRequeued.imageUrl} />
                  <div className={styles.itemText}>
                    <div className={`${styles.itemPerson}${p.userId === me ? ' ' + styles.strong : ''}`}>{p.userId}</div>
                    <div className={styles.itemTitle} title={p.mostRequeued.trackName}>{p.mostRequeued.trackName}</div>
                    <div className={styles.itemSub} title={p.mostRequeued.artist}>{p.mostRequeued.artist}</div>
                  </div>
                  <div className={styles.itemNums}>
                    <span className={styles.itemValue}>×{formatCount(p.mostRequeued.count)}</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Nobody has queued the same song twice. Yet.</Empty>
          )}
        </Section>
      </div>

      <Section title="Taste over time" hint="Top artists month by month. Pick someone to nose through their history.">
        <div className={styles.picker} aria-label="Pick a person">
          {chipOrder.map((p) => {
            const on = p.userId === tasteName;
            return (
              <button
                key={p.userId}
                className={`${styles.chip}${on ? ' ' + styles.chipOn : ''}`}
                aria-pressed={on}
                onClick={() => setPicked(p.userId)}
              >
                {p.userId}{p.userId === me ? ' (you)' : ''}
              </button>
            );
          })}
        </div>
        {tastePerson ? <Taste person={tastePerson} mine={tastePerson.userId === me} /> : <Empty>Nobody to show.</Empty>}
      </Section>
    </>
  );
}

export function MusicStatsPanel() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    Promise.resolve(window.sonos.getDisplayName())
      .then((n) => live && setDisplayName(n ?? null))
      .catch(() => live && setDisplayName(null));
    return () => {
      live = false;
    };
  }, []);
  const stats = useQuery(musicStatsQueryOptions());
  const data = stats.data;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Music stats</h1>
        <span className={styles.sub}>
          {data ? `${formatCount(data.totalEvents)} queues · ${data.people.length} people` : ''}
        </span>
        <div className={styles.spacer} />
        <button className={styles.backBtn} onClick={() => navigate('/leaderboard')}>← Leaderboard</button>
      </div>
      <div className={styles.body}>
        {stats.isLoading && <div className={styles.state}>Crunching every queue so far…</div>}
        {stats.isError && <div className={styles.state}>Couldn’t load the music stats.</div>}
        {data && data.people.length === 0 && <div className={styles.state}>Nothing queued yet.</div>}
        {data && data.people.length > 0 && <Stats data={data} me={displayName} />}
      </div>
    </div>
  );
}
