import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Home, Trophy, Search, X, Users, User, List, RefreshCw, Minus, Maximize2, Minimize2 } from 'lucide-react';
import type { GroupInfo } from '../types/sonos';
import styles from '../styles/TopNav.module.css';

interface Props {
  isAuthed: boolean;
  groups: GroupInfo[];
  activeGroupId: string | null;
  onGroupChange: (groupId: string) => void;
  queueOpen: boolean;
  onToggleQueue: () => void;
  onResync: () => void;
  displayName: string | null | undefined;
  onSaveName: (name: string) => void;
}

export function TopNav({
  isAuthed, groups, activeGroupId,
  onGroupChange, queueOpen, onToggleQueue, onResync,
  displayName, onSaveName,
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [searchText, setSearchText] = useState(searchParams.get('q') ?? '');
  const [nameOpen, setNameOpen] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [groupOpen, setGroupOpen] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  // React Router sets window.history.state = { idx, key } on every navigation
  const histIdx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  const canGoBack    = histIdx > 0;
  const canGoForward = histIdx < window.history.length - 1;

  const [isMaximized, setIsMaximized] = useState(false);
  useEffect(() => {
    window.sonos.isWindowMaximized().then(setIsMaximized).catch(() => {});
    return window.sonos.onWindowMaximized(setIsMaximized);
  }, []);

  useEffect(() => {
    window.sonos.getVersion().then(setAppVersion).catch(() => {});
  }, []);

  useEffect(() => {
    if (nameOpen) setNameValue(displayName ?? '');
  }, [nameOpen, displayName]);

  useEffect(() => {
    if (!nameOpen) return;
    function onDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setNameOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [nameOpen]);

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
    if (trimmed) { onSaveName(trimmed); setNameOpen(false); }
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
    if (e.key === 'Escape') { setSearchText(''); navigate('/'); }
  };

  const handleClear = () => { setSearchText(''); navigate('/'); };

  const isAtRoot      = location.pathname === '/';
  const isInSearch    = location.pathname === '/search';
  const isLeaderboard = location.pathname === '/leaderboard';

  return (
    <>
      <div className={styles.dragRegion} />

      {/* Back / forward pill — fixed top-left */}
      <div className={styles.historyPill}>
          <button
            className={styles.historyBtn}
            disabled={!canGoBack}
            onClick={() => navigate(-1)}
            title="Back"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className={styles.historyBtn}
            disabled={!canGoForward}
            onClick={() => navigate(1)}
            title="Forward"
          >
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

            <div className={styles.sep} />

            <div className={styles.searchWrap}>
              <Search size={13} className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                type="text"
                placeholder="Search…"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!isAuthed}
              />
              <button
                className={styles.clearBtn}
                onClick={handleClear}
                title="Clear"
                style={{ visibility: (isInSearch || searchText) ? 'visible' : 'hidden' }}
              >
                <X size={12} />
              </button>
            </div>

            <div className={styles.sep} />

            {isAuthed && groups.length === 0 ? (
              <button className={styles.iconBtn} onClick={onResync} title="Reconnect">
                <RefreshCw size={14} />
              </button>
            ) : (
              <div className={styles.groupWrap} ref={groupRef}>
                <button
                  className={`${styles.iconBtn}${groupOpen ? ' ' + styles.active : ''}`}
                  onClick={() => groups.length > 1 && setGroupOpen(o => !o)}
                  title={groups.find(g => g.id === activeGroupId)?.name ?? 'Group'}
                  disabled={!isAuthed}
                >
                  <Users size={15} />
                </button>
                {groupOpen && groups.length > 1 && (
                  <div className={styles.groupPopover}>
                    <div className={styles.groupPopoverLabel}>Group</div>
                    {groups.map(g => (
                      <button
                        key={g.id}
                        className={`${styles.groupOption}${g.id === activeGroupId ? ' ' + styles.groupOptionActive : ''}`}
                        onClick={() => { onGroupChange(g.id); setGroupOpen(false); }}
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {displayName !== undefined && (
              <div className={styles.nameWrap} ref={popoverRef}>
                <button
                  className={`${styles.iconBtn}${nameOpen ? ' ' + styles.active : ''}`}
                  onClick={() => setNameOpen(o => !o)}
                  title={displayName ?? 'Set your name'}
                >
                  <User size={15} />
                </button>
                {nameOpen && (
                  <div className={styles.namePopover}>
                    <div className={styles.namePopoverLabel}>Display name</div>
                    <input
                      className={styles.nameInput}
                      value={nameValue}
                      onChange={e => setNameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') submitName();
                        if (e.key === 'Escape') setNameOpen(false);
                      }}
                      maxLength={32}
                      spellCheck={false}
                      autoFocus
                    />
                    <button
                      className={styles.nameSaveBtn}
                      onClick={submitName}
                      disabled={!nameValue.trim() || nameValue.trim() === displayName}
                    >
                      Save
                    </button>
                    {appVersion && <div className={styles.appVersion}>v{appVersion}</div>}
                  </div>
                )}
              </div>
            )}

            <button
              className={`${styles.iconBtn}${queueOpen ? ' ' + styles.active : ''}`}
              onClick={onToggleQueue}
              title="Queue"
            >
              <List size={15} />
            </button>

          </div>
        </nav>

      </div>

      {/* Window controls — fixed top-right, independent of the centered navRoot */}
      <div className={styles.windowPill}>
        <button className={styles.winBtn} onClick={() => window.sonos.minimizeWindow()} title="Minimise">
          <Minus size={13} />
        </button>
        <button className={styles.winBtn} onClick={() => window.sonos.maximizeWindow()} title={isMaximized ? 'Restore' : 'Maximise'}>
          {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
        <button className={`${styles.winBtn} ${styles.closeBtn}`} onClick={() => window.sonos.closeWindow()} title="Close">
          <X size={13} />
        </button>
      </div>
    </>
  );
}
