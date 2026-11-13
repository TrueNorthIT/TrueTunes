import { useEffect, useState } from 'react';
import { getDiagnostics, onDiagnostics, type DiagEvent } from '../../web/bridge/diagnostics';
import styles from './DiagnosticsPage.module.css';

const time = (at: number) => new Date(at).toLocaleTimeString('en-GB');
const yn = (b: boolean) => (b ? 'yes' : 'no');

function describe(e: DiagEvent): string {
  if (e.kind === 'close') return `close, code ${e.code}`;
  if (e.kind !== 'playback') return e.kind;
  const h = e.has;
  return `playback ${e.source}: state ${yn(h.state)}, position ${yn(h.position)}, track ${yn(h.track)}, duration ${yn(h.duration)}, queue version ${yn(h.queueVersion)}`;
}

/** Web only: what the Sonos relay did lately, readable on a phone that has no console. Memory only. */
export function DiagnosticsPage() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const off = onDiagnostics(refresh);
    const timer = setInterval(refresh, 1000);
    return () => {
      off();
      clearInterval(timer);
    };
  }, []);
  const { events, lastFrameAt, relayOpen } = getDiagnostics();
  const since = lastFrameAt ? `${Math.round((now - lastFrameAt) / 1000)} s ago` : 'never';
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Diagnostics</h1>
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
