import { useCallback, useEffect, useState } from 'react';
import { getDiagnostics, onDiagnostics, type DiagEvent } from '../../web/bridge/diagnostics';
import { measureLayout } from './measureLayout';
import styles from './DiagnosticsPage.module.css';

const time = (at: number) => new Date(at).toLocaleTimeString('en-GB');
const yn = (b: boolean) => (b ? 'yes' : 'no');

function describe(e: DiagEvent): string {
  if (e.kind === 'close') return `close, code ${e.code}`;
  if (e.kind !== 'playback') return e.kind;
  const h = e.has;
  return `playback ${e.source}: state ${yn(h.state)}, position ${yn(h.position)}, track ${yn(h.track)}, duration ${yn(h.duration)}, queue version ${yn(h.queueVersion)}`;
}

/** Web only: what the Sonos relay did lately, and how the shell is laid out, readable on a phone with no console. */
export function DiagnosticsPage() {
  const [now, setNow] = useState(() => Date.now());
  const [layout, setLayout] = useState<ReturnType<typeof measureLayout> | null>(null);
  const measure = useCallback(() => setLayout(measureLayout()), []);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const off = onDiagnostics(refresh);
    const timer = setInterval(refresh, 1000);
    const first = requestAnimationFrame(measure); // after the first layout
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      off();
      clearInterval(timer);
      cancelAnimationFrame(first);
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [measure]);
  const { events, lastFrameAt, relayOpen } = getDiagnostics();
  const since = lastFrameAt ? `${Math.round((now - lastFrameAt) / 1000)} s ago` : 'never';
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Diagnostics</h1>

      <h2 className={styles.section}>Layout</h2>
      <button type="button" className={styles.measure} onClick={measure}>
        Measure again
      </button>
      {layout && (
        <>
          <p className={styles.derived}>{layout.derived[0]}</p>
          <p className={styles.derived}>{layout.derived[1]}</p>
          <ul className={styles.list}>
            {layout.rows.map(([label, value]) => (
              <li key={label} className={styles.row}>
                {label}: {value}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className={styles.section}>Relay</h2>
      <p className={styles.row}>
        Relay: {relayOpen ? 'open' : 'closed'}. Last frame: {since}.
      </p>
      <ol className={styles.list}>
        {[...events].reverse().map((e, i) => (
          <li key={`${e.at}-${i}`} className={styles.row}>
            {time(e.at)} {describe(e)}
          </li>
        ))}
      </ol>
    </div>
  );
}
