import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
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
  const popoverRef = useRef<HTMLDivElement>(null);

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

  function submitName() {
    const trimmed = nameValue.trim();
    if (trimmed) { onSaveName(trimmed); setNameOpen(false); }
  }

  // Keep search input in sync with the URL
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

  const isAtRoot   = location.pathname === '/';
  const isInSearch = location.pathname === '/search';

  return (
    <nav className={styles.nav}>
      <div className={styles.inner}>
        {/* Left: space for macOS traffic lights + optional back button */}
        <div className={styles.left}>
          <div className={styles.trafficSpace} />
          {!isAtRoot && (
            <button className={styles.backBtn} onClick={() => navigate(-1)}>
              ‹ Back
            </button>
          )}
        </div>

        {/* Center: Home tab + search input */}
        <div className={styles.center}>
          <button
            className={`${styles.tab}${isAtRoot ? ' ' + styles.active : ''}`}
            onClick={handleClear}
          >
            Home
          </button>
          <div className={styles.searchWrap}>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Search…"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!isAuthed}
            />
            {(isInSearch || searchText) && (
              <button className={styles.clearBtn} onClick={handleClear}>✕</button>
            )}
          </div>
        </div>

        {/* Right: group selector + queue toggle */}
        <div className={styles.right}>
          {isAuthed && groups.length === 0 && (
            <button
              className={styles.resyncBtn}
              onClick={onResync}
              title="Reconnect"
            >
              ↺
            </button>
          )}
          <select
            className={styles.groupSelect}
            disabled={!isAuthed || groups.length <= 1}
            value={activeGroupId ?? ''}
            onChange={e => onGroupChange(e.target.value)}
          >
            {groups.length === 0
              ? <option value="">—</option>
              : groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)
            }
          </select>

          {/* Name / settings */}
          {displayName !== undefined && (
            <div className={styles.nameWrap} ref={popoverRef}>
              <button
                className={`${styles.nameBtn}${nameOpen ? ' ' + styles.active : ''}`}
                onClick={() => setNameOpen(o => !o)}
                title="Your display name"
              >
                {displayName ?? '?'}
              </button>
              {nameOpen && (
                <div className={styles.namePopover}>
                  <div className={styles.namePopoverLabel}>Your display name</div>
                  <input
                    className={styles.nameInput}
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submitName(); if (e.key === 'Escape') setNameOpen(false); }}
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
                </div>
              )}
            </div>
          )}

          <button
            className={`${styles.queueBtn}${queueOpen ? ' ' + styles.active : ''}`}
            onClick={onToggleQueue}
            title="Toggle queue"
          >
            ≡
          </button>
        </div>
      </div>
    </nav>
  );
}
