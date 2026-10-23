import { useEffect, useMemo, useState } from 'react';
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
import { PersonChip } from '../common/PersonChip';
import { SectionCard } from '../common/SectionCard';
import { BarList } from '../stats/BarList';
import { TipTitle } from '../stats/ChartTooltip';
import { Heatmap } from '../stats/Heatmap';
import { RAMP } from '../stats/ramp';
import { StatsPage } from '../stats/StatsPage';
import styles from '../../styles/MusicStats.module.css';

// Single-series charts: you in blue, everyone else in a recessive grey (the
// same convention as the Queuedle stats page). Values are always text-coloured.
const ME = 'var(--series-1)';
const MUTED = 'var(--glass)'; // taste bars; the shared BarList mutes its own

function Thumb({ url, round }: { url: string | null; round?: boolean }) {
  const cached = useImage(url);
  const cls = `${styles.thumb}${round ? ' ' + styles.thumbRound : ''}`;
  if (!cached) return <div className={cls} data-placeholder />;
  return <img className={cls} src={cached} alt="" loading="lazy" />;
}

const Empty = ({ children }: { children: ReactNode }) => <div className={styles.empty}>{children}</div>;

// ── Busy hours heatmap ───────────────────────────────────────────────────────

function BusyHours({ grid }: { grid: number[][] }) {
  const max = useMemo(() => Math.max(0, ...grid.flat()), [grid]);
  const count = (wd: number, h: number) => grid[wd]?.[h] ?? 0;
  return (
    <Heatmap
      className={styles.busy}
      ariaLabel="Queues by day of the week and hour"
      // Every third hour is named: at 13px a label for each would run into its neighbour.
      columns={Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? String(h) : ''))}
      rows={WEEKDAYS.map((day, wd) => ({
        key: day,
        label: day,
        cells: Array.from({ length: 24 }, (_, h) => {
          const i = rampIndex(count(wd, h), max, RAMP.length);
          return i === -1 ? null : RAMP[i];
        }),
      }))}
      cellLabel={(wd, h) => `${slotLabel(wd, h)}: ${count(wd, h)} queues`}
      renderTip={(wd, h) => (
        <TipTitle>
          {slotLabel(wd, h)} · {formatCount(count(wd, h))} {count(wd, h) === 1 ? 'queue' : 'queues'}
        </TipTitle>
      )}
      legend={{ lo: 'Quiet', hi: `Busiest (${formatCount(max)})`, empty: 'nothing queued' }}
    />
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
  return (
    <BarList
      max={max}
      rows={rows.map((r) => ({
        key: r.userId,
        name: r.userId,
        value: r.value,
        label: r.label,
        sub: r.sub,
        title: r.title,
        colour: me && r.userId === me ? ME : null,
      }))}
    />
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
      <SectionCard
        className={styles.section}
        title="Busy hours"
        sub={peak ? `When the office reaches for the queue. Peak: ${slotLabel(peak.weekday, peak.hour)}.` : 'When the office reaches for the queue.'}
      >
        <BusyHours grid={data.busyHours} />
      </SectionCard>

      <div className={styles.twoUp}>
        <SectionCard title="Airtime" sub={coverage ? `Hours of music each person has put on. ${coverage}.` : 'Hours of music each person has put on.'}>
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
        </SectionCard>

        <SectionCard
          title="Song length" sub={`Average song length. Top of the list queues the prog epics.${coverage ? ` ${coverage}.` : ''}`}
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
        </SectionCard>
      </div>

      <div className={styles.twoUp}>
        <SectionCard title="Longest songs" sub="Settle in.">
          {hasLengths && data.longest.length > 0 ? <TrackList tracks={data.longest} /> : <Empty>{NO_LENGTHS_TEXT}</Empty>}
        </SectionCard>
        <SectionCard title="Shortest songs" sub="Blink and you’ll miss them.">
          {hasLengths && data.shortest.length > 0 ? <TrackList tracks={data.shortest} /> : <Empty>{NO_LENGTHS_TEXT}</Empty>}
        </SectionCard>
      </div>

      <div className={styles.twoUp}>
        <SectionCard title="Explicit" sub="Share of each person’s songs with a parental advisory sticker.">
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
        </SectionCard>

        <SectionCard
          title="Variety" sub={`Different artists per song queued. Only people with ${VARIETY_MIN_TRACKS}+ songs, so one-hit visitors don’t top it.`}
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
        </SectionCard>
      </div>

      <div className={styles.twoUp}>
        <SectionCard title="Discoverers" sub="Who brought an artist to the office before everyone else caught on.">
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
        </SectionCard>

        <SectionCard title="Most re-queued" sub="Everyone’s comfort song.">
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
        </SectionCard>
      </div>

      <SectionCard className={styles.section} title="Taste over time" sub="Top artists month by month. Pick someone to nose through their history.">
        <div className={styles.picker} role="group" aria-label="Pick a person">
          {chipOrder.map((p) => (
            <PersonChip
              key={p.userId}
              name={p.userId}
              suffix={p.userId === me ? ' (you)' : ''}
              selected={p.userId === tasteName}
              onClick={() => setPicked(p.userId)}
            />
          ))}
        </div>
        {tastePerson ? <Taste person={tastePerson} mine={tastePerson.userId === me} /> : <Empty>Nobody to show.</Empty>}
      </SectionCard>
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
    <StatsPage
      title="Music stats"
      facts={data ? `${formatCount(data.totalEvents)} queues · ${data.people.length} people` : undefined}
      backLabel="Leaderboard"
      onBack={() => navigate('/leaderboard')}
    >
      {stats.isLoading && <p className={styles.state}>Crunching every queue so far…</p>}
      {stats.isError && !data && <p className={styles.state}>Couldn’t load the music stats.</p>}
      {/* A failed background refresh keeps the last stats on screen. */}
      {stats.isError && data && <p className={styles.staleNote}>Couldn’t refresh just now, so these may be a few minutes old.</p>}
      {data && data.people.length === 0 && <p className={styles.state}>Nothing queued yet.</p>}
      {data && data.people.length > 0 && <Stats data={data} me={displayName} />}
    </StatsPage>
  );
}
