import { useState, useEffect } from 'react';
import { marked } from 'marked';
import { ExternalLink } from 'lucide-react';
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface Props {
  onClose: () => void;
}

export function ChangelogDialog({ onClose }: Props) {
  const [releases, setReleases]     = useState<Release[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [status, setStatus]         = useState<'loading' | 'ready' | 'error'>('loading');
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [versionLoaded, setVersionLoaded] = useState(false);

  useEffect(() => {
    window.sonos.getVersion()
      .then(v => { setAppVersion(v); setVersionLoaded(true); })
      .catch(() => setVersionLoaded(true));
  }, []);

  useEffect(() => {
    fetchReleases()
      .then(data => { setReleases(data); setStatus('ready'); })
      .catch(() => setStatus('error'));
  }, []);

  useEffect(() => {
    if (!versionLoaded || status !== 'ready' || !appVersion || releases.length === 0) return;
    const idx = releases.findIndex(r =>
      r.tag_name === `v${appVersion}` || r.tag_name === appVersion
    );
    if (idx >= 0) setSelectedIdx(idx);
  }, [versionLoaded, status, appVersion, releases]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const selected = releases[selectedIdx];
  const isCurrent = selected && appVersion &&
    (selected.tag_name === `v${appVersion}` || selected.tag_name === appVersion);

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.heading}>What&apos;s New</span>
          {appVersion && <span className={styles.currentBadge}>v{appVersion}</span>}
          <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {status === 'loading' && (
          <div className={styles.placeholder}>Loading releases…</div>
        )}

        {status === 'error' && (
          <div className={styles.placeholder}>Could not load release notes.</div>
        )}

        {status === 'ready' && releases.length === 0 && (
          <div className={styles.placeholder}>No releases found.</div>
        )}

        {status === 'ready' && releases.length > 0 && (
          <div className={styles.body}>
            <div className={styles.sidebar}>
              {releases.map((r, i) => {
                const isCur = appVersion &&
                  (r.tag_name === `v${appVersion}` || r.tag_name === appVersion);
                return (
                  <button
                    key={r.tag_name}
                    className={`${styles.sidebarItem}${i === selectedIdx ? ' ' + styles.sidebarItemActive : ''}`}
                    onClick={() => setSelectedIdx(i)}
                  >
                    <span className={styles.sidebarTag}>{r.tag_name}</span>
                    {isCur && <span className={styles.currentDot} title="Current version" />}
                    <span className={styles.sidebarDate}>{formatDate(r.published_at)}</span>
                  </button>
                );
              })}
            </div>

            <div className={styles.content}>
              {selected && (
                <>
                  <div className={styles.contentHeader}>
                    <div>
                      <div className={styles.contentTitle}>
                        {selected.name || selected.tag_name}
                        {isCurrent && <span className={styles.currentLabel}>current</span>}
                      </div>
                      <div className={styles.contentDate}>{formatDate(selected.published_at)}</div>
                    </div>
                    <button
                      className={styles.ghLink}
                      onClick={() => window.sonos.openExternal(selected.html_url)}
                      title="View on GitHub"
                    >
                      <ExternalLink size={13} />
                    </button>
                  </div>
                  <div className={styles.notes}>
                    {selected.body?.trim()
                      ? <div
                          className={styles.notesText}
                          dangerouslySetInnerHTML={{ __html: marked.parse(selected.body.trim()) as string }}
                        />
                      : <span className={styles.noNotes}>No release notes.</span>
                    }
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
