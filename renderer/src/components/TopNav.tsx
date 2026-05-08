import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useUserProfile } from '../hooks/useUserProfile';
import { useImage } from '../hooks/useImage';
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Trophy,
  Search,
  X,
  RefreshCw,
  Gamepad2,
  Lightbulb,
  Group,
  SquareMousePointer,
} from 'lucide-react';
import type { NormalizedGroup } from '../types/provider';
import styles from '../styles/TopNav.module.css';

interface Props {
  isAuthed: boolean;
  groups: NormalizedGroup[];
  activeGroupId: string | null;
  onGroupChange: (groupId: string) => void;
  onResync: () => void;
  displayName: string | null | undefined;
  onSaveName: (name: string) => void;
  onChangelogOpen: () => void;
}

export function TopNav({
  isAuthed,
  groups,
  activeGroupId,
  onGroupChange,
  onResync,
  displayName,
  onSaveName,
  onChangelogOpen,
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [searchText, setSearchText] = useState(searchParams.get('q') ?? '');
  const [profileOpen, setProfileOpen] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [groupOpen, setGroupOpen] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  // React Router sets window.history.state = { idx, key } on every navigation
  const { data: profile } = useUserProfile(displayName ?? undefined);
  const profileArt = useImage(profile?.imageUrl ?? null);

  const histIdx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  const canGoBack = histIdx > 0;
  const canGoForward = histIdx < window.history.length - 1;

  useEffect(() => {
    window.sonos
      .getVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (profileOpen) setNameValue('');
  }, [profileOpen]);

  useEffect(() => {
    if (!profileOpen) return;
    function onDown(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [profileOpen]);

  useEffect(() => {
    if (!groupOpen) return;
    function onDown(e: MouseEvent) {
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) {
        setGroupOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [groupOpen]);

  function submitName() {
    const trimmed = nameValue.trim();
    if (trimmed) {
      onSaveName(trimmed);
      setProfileOpen(false);
    }
  }

  function signOut() {
    onSaveName('');
    setProfileOpen(false);
  }

  useEffect(() => {
    if (location.pathname === '/search') {
      setSearchText(searchParams.get('q') ?? '');
    } else {
      setSearchText('');
    }
  }, [location.pathname, searchParams]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const q = searchText.trim();
      if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
    }
    if (e.key === 'Escape') {
      setSearchText('');
      navigate('/');
    }
  };

  const handleClear = () => {
    setSearchText('');
    navigate('/');
  };

  const isAtRoot = location.pathname === '/';
  const isInSearch = location.pathname === '/search';
  const isLeaderboard = location.pathname === '/leaderboard';
  const isQueuedle = location.pathname === '/queuedle';

  return (
    <>
      <div className={styles.dragRegion} />

      {/* Back / forward pill — fixed top-left */}
      <div className={styles.historyPill}>
        <button className={styles.historyBtn} disabled={!canGoBack} onClick={() => navigate(-1)} title="Back">
          <ChevronLeft size={16} />
        </button>
        <button className={styles.historyBtn} disabled={!canGoForward} onClick={() => navigate(1)} title="Forward">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Outer wrapper — centered */}
      <div className={styles.navRoot}>
        {/* Main nav pill */}
        <nav className={styles.nav}>
          <div className={styles.inner}>
            <button
              className={`${styles.iconBtn}${isAtRoot ? ' ' + styles.active : ''}`}
              onClick={handleClear}
              title="Home"
            >
              <Home size={15} />
            </button>
            <button
              className={`${styles.iconBtn}${isLeaderboard ? ' ' + styles.active : ''}`}
              onClick={() => navigate('/leaderboard')}
              title="Leaderboard"
            >
              <Trophy size={15} />
            </button>
            <button
              className={`${styles.iconBtn}${isQueuedle ? ' ' + styles.active : ''}`}
              onClick={() => navigate('/queuedle')}
              title="Queuedle — daily game"
            >
              <Gamepad2 size={15} />
            </button>

            <div className={styles.sep} />

            <div className={styles.searchWrap}>
              <Search size={13} className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                type="text"
                placeholder="Search…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!isAuthed}
              />
              <button
                className={styles.clearBtn}
                onClick={handleClear}
                title="Clear"
                style={{ visibility: isInSearch || searchText ? 'visible' : 'hidden' }}
              >
                <X size={12} />
              </button>
            </div>

            <div className={styles.sep} />

            {/* Profile chip — right of search */}
            {displayName !== undefined && (
              <div className={styles.profileWrap} ref={profileRef}>
                {displayName ? (
                  <button
                    className={`${styles.profileChip}${location.pathname.startsWith('/profile/') ? ' ' + styles.profileChipActive : ''}`}
                    onClick={() => navigate(`/profile/${encodeURIComponent(displayName)}`)}
                    title="My profile"
                  >
                    <span className={styles.profileAvatar}>
                      {profileArt
                        ? <img src={profileArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }} />
                        : displayName[0].toUpperCase()
                      }
                    </span>
                    <span className={styles.profileName}>{displayName}</span>
                  </button>
                ) : (
                  <>
                    <button
                      className={`${styles.profileChip}${profileOpen ? ' ' + styles.profileChipOpen : ''}`}
                      onClick={() => setProfileOpen((o) => !o)}
                      title="Sign in"
                    >
                      <span className={styles.profileSignIn}>Sign in</span>
                    </button>
                    {profileOpen && (
                      <div className={styles.profilePopover}>
                        <div className={styles.profileChangeLabel}>Enter your name to get started</div>
                        <input
                          className={styles.nameInput}
                          value={nameValue}
                          placeholder="Your name"
                          onChange={(e) => setNameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitName();
                            if (e.key === 'Escape') setProfileOpen(false);
                          }}
                          maxLength={32}
                          spellCheck={false}
                          autoFocus
                        />
                        <button
                          className={styles.nameSaveBtn}
                          onClick={submitName}
                          disabled={!nameValue.trim()}
                        >
                          Sign in
                        </button>
                        <div className={styles.versionRow}>
                          {appVersion && <div className={styles.appVersion}>v{appVersion}</div>}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {isAuthed && groups.length === 0 ? (
              <button className={styles.iconBtn} onClick={onResync} title="Reconnect">
                <RefreshCw size={14} />
              </button>
            ) : (
              <div className={styles.groupWrap} ref={groupRef}>
                <button
                  className={`${styles.iconBtn}${groupOpen ? ' ' + styles.active : ''}`}
                  onClick={() => groups.length > 1 && setGroupOpen((o) => !o)}
                  title={groups.find((g) => g.id === activeGroupId)?.name ?? 'Group'}
                  disabled={!isAuthed}
                >
                  <Group size={15} />
                </button>
                {groupOpen && groups.length > 1 && (
                  <div className={styles.groupPopover}>
                    <div className={styles.groupPopoverLabel}>Group</div>
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        className={`${styles.groupOption}${g.id === activeGroupId ? ' ' + styles.groupOptionActive : ''}`}
                        onClick={() => {
                          onGroupChange(g.id);
                          setGroupOpen(false);
                        }}
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button className={styles.iconBtn} onClick={onChangelogOpen} title="What's new">
              <Lightbulb size={15} />
            </button>

            {import.meta.env.DEV && (
              <button
                className={styles.iconBtn}
                onClick={() => {
                  window.sonos.openDevTools();
                  window.sonos.openHttpMonitor();
                  window.sonos.openWsMonitor();
                }}
                title="Inspect"
              >
                <SquareMousePointer size={15} />
              </button>
            )}

          </div>
        </nav>
      </div>

    </>
  );
}
