import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GC_HOUR } from '../lib/queryDefaults';
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
/**
 * Unauthenticated, so GitHub allows 60 requests an hour per IP, and the whole office shares one.
 * Keep the releases for an hour, open or closed, rather than refetching on every open.
 */
const RELEASES_TTL = GC_HOUR;
const NO_RELEASES: Release[] = [];

async function fetchReleases(): Promise<Release[]> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
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
  const [pickedIdx, setSelectedIdx] = useState<number | null>(null);
  const {
    data: releases = NO_RELEASES,
    isSuccess,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['github-releases'],
    queryFn: fetchReleases,
    staleTime: RELEASES_TTL,
    gcTime: RELEASES_TTL,
  });
  const status: 'loading' | 'ready' | 'error' = isSuccess ? 'ready' : isError && !isFetching ? 'error' : 'loading';
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

  // Open on the installed release until the reader picks another.
  const installedIdx =
    versionLoaded && status === 'ready' && appVersion
      ? releases.findIndex((r) => r.tag_name === `v${appVersion}` || r.tag_name === appVersion)
      : -1;
  const selectedIdx = pickedIdx ?? Math.max(installedIdx, 0);

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
          <PillButton onClick={() => void refetch()}>Try again</PillButton>
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
