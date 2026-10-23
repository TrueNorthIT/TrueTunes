import { useState, useEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ExternalLink } from 'lucide-react';
import { Dialog } from './common/Dialog';
import { PillButton } from './common/PillButton';
import dialog from './common/Dialog.module.css';
import styles from '../styles/ChangelogDialog.module.css';

marked.use({ async: false });

interface Release {
  tag_name: string;
  name: string;
  body: string | null;
  published_at: string;
  html_url: string;
}

const REPO = 'TrueNorthIT/TrueTunes';
const PAT = import.meta.env.VITE_GITHUB_PAT as string | undefined;

async function fetchReleases(): Promise<Release[]> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (PAT) headers['Authorization'] = `Bearer ${PAT}`;
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases`, { headers });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
  return res.json() as Promise<Release[]>;
}

/** Versions read the same everywhere: "1.0.50", never "v1.0.50" in one place and "1.0.50" in another. */
const version = (r: Release) => r.tag_name.replace(/^v/, '');

/** The rail lists this many recent releases (plus the installed one if older), so it never needs its own scroll. */
const RAIL_COUNT = 8;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

interface Props {
  onClose: () => void;
}

export function ChangelogDialog({ onClose }: Props) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [versionLoaded, setVersionLoaded] = useState(false);

  useEffect(() => {
    window.sonos
      .getVersion()
      .then((v) => {
        setAppVersion(v);
        setVersionLoaded(true);
      })
      .catch(() => setVersionLoaded(true));
  }, []);

  useEffect(() => {
    fetchReleases()
      .then((data) => {
        setReleases(data);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, [attempt]);

  useEffect(() => {
    if (!versionLoaded || status !== 'ready' || !appVersion || releases.length === 0) return;
    const idx = releases.findIndex((r) => r.tag_name === `v${appVersion}` || r.tag_name === appVersion);
    if (idx >= 0) setSelectedIdx(idx);
  }, [versionLoaded, status, appVersion, releases]);

  const isInstalled = (r: Release) => !!appVersion && (r.tag_name === `v${appVersion}` || r.tag_name === appVersion);
  const selected = releases[selectedIdx];
  const rail = releases
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => i < RAIL_COUNT || i === selectedIdx || isInstalled(r));

  return (
    <Dialog title="What's new" onClose={onClose} size="lg" className={styles.reader}>
      {status === 'loading' && <p className={dialog.note}>Loading releases…</p>}

      {status === 'error' && (
        <div className={styles.empty}>
          <p className={dialog.note}>Couldn't load the release notes from GitHub.</p>
          <PillButton
            onClick={() => {
              setStatus('loading');
              setAttempt((a) => a + 1);
            }}
          >
            Try again
          </PillButton>
        </div>
      )}

      {status === 'ready' && releases.length === 0 && <p className={dialog.note}>No releases yet.</p>}

      {status === 'ready' && releases.length > 0 && (
        <div className={styles.split}>
          <nav className={styles.list} aria-label="Releases">
            {rail.map(({ r, i }) => (
              <button
                key={r.tag_name}
                type="button"
                className={`${styles.release}${i === selectedIdx ? ' ' + styles.releaseActive : ''}`}
                aria-current={i === selectedIdx ? 'true' : undefined}
                onClick={() => setSelectedIdx(i)}
              >
                <span className={styles.tag}>{version(r)}</span>
                <span className={styles.date}>{isInstalled(r) ? 'Installed' : formatDate(r.published_at)}</span>
              </button>
            ))}
            {releases.length > rail.length && (
              <button
                type="button"
                className={styles.allLink}
                onClick={() => window.sonos.openExternal(`https://github.com/${REPO}/releases`)}
              >
                Older releases on GitHub <ExternalLink size={14} aria-hidden="true" />
              </button>
            )}
          </nav>

          {selected && (
            <article className={styles.article} aria-labelledby="release-title">
              <header className={styles.articleHead}>
                <h3 id="release-title" className={styles.articleTitle}>
                  {selected.name || version(selected)}
                </h3>
                <p className={styles.meta}>
                  {formatDate(selected.published_at)}
                  {isInstalled(selected) && ' · the version you have'}
                </p>
                <button
                  type="button"
                  className={styles.ghLink}
                  onClick={() => window.sonos.openExternal(selected.html_url)}
                >
                  View on GitHub <ExternalLink size={14} aria-hidden="true" />
                </button>
              </header>
              {selected.body?.trim() ? (
                <div
                  className={styles.notes}
                  // Links in the notes open in the browser; followed in place they'd replace the app window.
                  onClick={(e) => {
                    const a = (e.target as HTMLElement).closest('a');
                    if (!a) return;
                    e.preventDefault();
                    if (a.href) void window.sonos.openExternal(a.href);
                  }}
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(selected.body.trim()) as string) }}
                />
              ) : (
                <p className={dialog.note}>No release notes.</p>
              )}
            </article>
          )}
        </div>
      )}
    </Dialog>
  );
}
