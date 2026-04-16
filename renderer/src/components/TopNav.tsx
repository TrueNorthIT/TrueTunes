import { useState, KeyboardEvent } from 'react';
import type { GroupInfo } from '../types/sonos';
import styles from '../styles/TopNav.module.css';

interface Props {
  isAuthed: boolean;
  groups: GroupInfo[];
  activeGroupId: string | null;
  view: 'home' | 'search';
  onGroupChange: (groupId: string) => void;
  onSearch: (query: string) => void;
  onClearSearch: () => void;
  queueOpen: boolean;
  onToggleQueue: () => void;
  onBack?: () => void;
}

export function TopNav({
  isAuthed, groups, activeGroupId, view,
  onGroupChange, onSearch, onClearSearch,
  queueOpen, onToggleQueue, onBack,
}: Props) {
  const [searchText, setSearchText] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const q = searchText.trim();
      if (q) onSearch(q);
    }
    if (e.key === 'Escape') {
      setSearchText('');
      onClearSearch();
    }
  };

  const handleClear = () => {
    setSearchText('');
    onClearSearch();
  };

  return (
    <nav className={styles.nav}>
      <div className={styles.inner}>
        {/* Left: space for macOS traffic lights + optional back button */}
        <div className={styles.left}>
          <div className={styles.trafficSpace} />
          {onBack && (
            <button className={styles.backBtn} onClick={onBack}>
              ‹ Back
            </button>
          )}
        </div>

        {/* Center: Home tab + search input */}
        <div className={styles.center}>
          <button
            className={`${styles.tab}${view === 'home' ? ' ' + styles.active : ''}`}
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
            {(view === 'search' || searchText) && (
              <button className={styles.clearBtn} onClick={handleClear}>✕</button>
            )}
          </div>
        </div>

        {/* Right: group selector + queue toggle */}
        <div className={styles.right}>
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
