import { NavLink } from 'react-router-dom';
import { Compass, Ellipsis, Home, ListMusic, Search, type LucideIcon } from 'lucide-react';
import type { PhoneTab } from '../../lib/phoneTabs';
import styles from '../../styles/PhoneShell.module.css';

const TABS: Array<{ to: PhoneTab; label: string; icon: LucideIcon }> = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/queue', label: 'Queue', icon: ListMusic },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/more', label: 'More', icon: Ellipsis },
];

interface Props {
  /** The tab to light: where you are, or the tab you came from on a page that belongs to none. */
  active: PhoneTab;
  /** Something on the More page is waiting (a poll, an update): a dot on its tab, and a word in its name. */
  moreWaiting?: string | null;
}

/**
 * The phone shell's primary navigation: five labelled tabs along the bottom edge, in the thumb's reach, above
 * the home indicator. Tabs are routes, so Back steps through them like any other page.
 */
export function TabBar({ active, moreWaiting }: Props) {
  return (
    <nav className={styles.tabBar} aria-label="Main">
      {TABS.map(({ to, label, icon: Icon }) => {
        const waiting = to === '/more' ? moreWaiting : null;
        return (
          <NavLink
            key={to}
            to={to}
            end
            className={`${styles.tab}${active === to ? ' ' + styles.tabActive : ''}`}
            aria-label={waiting ? `${label}, ${waiting}` : undefined}
            draggable={false}
          >
            <span className={styles.tabIcon}>
              <Icon size={22} aria-hidden="true" />
              {waiting && <span className={styles.tabDot} aria-hidden="true" />}
            </span>
            <span className={styles.tabLabel}>{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
