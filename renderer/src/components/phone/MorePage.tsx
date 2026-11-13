import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  ChevronRight,
  DownloadCloud,
  Gamepad2,
  LogOut,
  MessageSquare,
  RefreshCw,
  Speaker,
  Trophy,
  Vote,
  type LucideIcon,
} from 'lucide-react';
import type { NormalizedGroup } from '../../types/provider';
import { useDisplayName } from '../../hooks/useDisplayName';
import { useUserProfile } from '../../hooks/useUserProfile';
import type { usePolls } from '../../hooks/usePolls';
import { UserAvatar } from '../common/UserAvatar';
import { PollAnswerDialog } from '../polls/PollAnswerDialog';
import styles from '../../styles/PhoneMore.module.css';

interface Props {
  isAuthed: boolean;
  groups: NormalizedGroup[];
  activeGroupId: string | null;
  onGroupChange: (groupId: string) => void;
  onResync: () => void;
  onFeedback: () => void;
  /** A new version is ready to load, or null. */
  updateVersion: string | null;
  polls: ReturnType<typeof usePolls>;
  /** After signing out. Reloading shows the sign-in screen; a story swaps it. */
  onSignedOut?: () => void;
}

function Row({
  icon: Icon,
  label,
  detail,
  tone,
  trail,
  onClick,
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  /** A muted second line. */
  detail?: ReactNode;
  tone?: 'attention' | 'success' | 'danger';
  /** Replaces the chevron at the end. */
  trail?: ReactNode;
  onClick: () => void;
  'aria-pressed'?: boolean;
}) {
  return (
    <li>
      <button type="button" className={`${styles.row}${tone ? ' ' + styles[tone] : ''}`} onClick={onClick} {...rest}>
        <span className={styles.rowIcon}>
          <Icon size={20} aria-hidden="true" />
        </span>
        <span className={styles.rowText}>
          <span className={styles.rowLabel}>{label}</span>
          {detail != null && <span className={styles.rowDetail}>{detail}</span>}
        </span>
        {trail !== undefined ? trail : <ChevronRight className={styles.rowTrail} size={18} aria-hidden="true" />}
      </button>
    </li>
  );
}

/**
 * The phone shell's More page: everything the desktop keeps in its nav pill and title bar that isn't one of the
 * four other tabs. The places (Leaderboard, Queuedle, your profile), the room (speakers, reconnect), what is
 * waiting (a poll, a new version) and the app itself (feedback, sign out, the version).
 */
export function MorePage({
  isAuthed,
  groups,
  activeGroupId,
  onGroupChange,
  onResync,
  onFeedback,
  updateVersion,
  polls,
  onSignedOut = () => window.location.reload(),
}: Props) {
  const navigate = useNavigate();
  const displayName = useDisplayName();
  const { data: profile } = useUserProfile(displayName ?? undefined);
  const [version, setVersion] = useState<string | null>(null);
  const [pollOpen, setPollOpen] = useState(false);

  useEffect(() => {
    window.sonos
      .getVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);

  const signOut = () =>
    void window.sonos
      .entraSignOut()
      .catch(() => {})
      .then(onSignedOut);

  const waiting = polls.current || updateVersion;

  return (
    <div className={styles.panel}>
      <div className={`page-scale ${styles.page}`}>
        <h1 className={styles.heading}>More</h1>

        {displayName && (
          <button
            type="button"
            className={styles.profile}
            onClick={() => void navigate(`/profile/${encodeURIComponent(displayName)}`)}
          >
            <UserAvatar name={displayName} imageUrl={profile?.imageUrl} className={styles.avatar} />
            <span className={styles.rowText}>
              <span className={styles.profileName}>{displayName}</span>
              <span className={styles.rowDetail}>My profile and playlists</span>
            </span>
            <ChevronRight className={styles.rowTrail} size={18} aria-hidden="true" />
          </button>
        )}

        {waiting && (
          <section className={styles.group} aria-label="Waiting for you">
            <ul className={styles.rows}>
              {polls.current && (
                <Row
                  icon={Vote}
                  tone="attention"
                  label="A poll is waiting"
                  detail={polls.current.question}
                  onClick={() => setPollOpen(true)}
                />
              )}
              {updateVersion && (
                <Row
                  icon={DownloadCloud}
                  tone="success"
                  label="Update"
                  detail="A new version is ready: tap to reload"
                  onClick={() => void window.sonos.installUpdate()}
                />
              )}
            </ul>
          </section>
        )}

        <section className={styles.group} aria-label="Places">
          <ul className={styles.rows}>
            <Row icon={Trophy} label="Leaderboard" onClick={() => void navigate('/leaderboard')} />
            <Row icon={Gamepad2} label="Queuedle" detail="The daily game" onClick={() => void navigate('/queuedle')} />
          </ul>
        </section>

        <section className={styles.group} aria-label="Speakers">
          {groups.length > 1 && <h2 className={styles.groupTitle}>Speakers</h2>}
          <ul className={styles.rows}>
            {groups.length > 1 &&
              groups.map((g) => (
                <Row
                  key={g.id}
                  icon={Speaker}
                  label={g.name}
                  aria-pressed={g.id === activeGroupId}
                  trail={
                    g.id === activeGroupId ? <Check className={styles.rowCheck} size={20} aria-hidden="true" /> : null
                  }
                  onClick={() => onGroupChange(g.id)}
                />
              ))}
            {isAuthed && (
              <Row
                icon={RefreshCw}
                label="Reconnect"
                detail={
                  groups.length === 1
                    ? `Connected to ${groups[0].name}`
                    : groups.length
                      ? undefined
                      : 'No speakers found'
                }
                trail={null}
                onClick={onResync}
              />
            )}
          </ul>
        </section>

        <section className={styles.group} aria-label="True Tunes">
          <ul className={styles.rows}>
            <Row icon={MessageSquare} label="Send feedback" onClick={onFeedback} />
            <Row icon={LogOut} label="Sign out" trail={null} onClick={signOut} />
          </ul>
        </section>

        <button type="button" className={styles.quiet} onClick={() => void navigate('/diagnostics')}>
          Diagnostics
        </button>
        {version && <p className={styles.version}>True Tunes v{version}</p>}
      </div>

      {pollOpen && polls.current && (
        <PollAnswerDialog
          poll={polls.current}
          remaining={polls.remaining}
          submitting={polls.submitting}
          error={polls.error}
          onChoose={(choice) => void polls.answer(choice)}
          onSkip={polls.skip}
          onClose={() => setPollOpen(false)}
        />
      )}
    </div>
  );
}
