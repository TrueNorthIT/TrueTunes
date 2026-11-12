import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { addRecentSearch } from '../lib/recentSearches';

/**
 * The search box's behaviour, shared by the desktop nav pill (TopNav) and the phone's Search page field: the text
 * follows ?q=, typing searches after a pause, Enter remembers the query, Esc and × leave search.
 */
export function useSearchBox() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [searchText, setSearchText] = useState(() =>
    location.pathname === '/search' ? (searchParams.get('q') ?? '') : ''
  );

  const isInSearch = location.pathname === '/search';
  const urlQuery = isInSearch ? (searchParams.get('q') ?? '').trim() : '';

  // The box empties when search is left, and follows the URL when ?q= changes (back, forward, a recent search),
  // but never rewrites what is being typed: "mr " is the same query as "mr", and arriving at an empty /search
  // (focusing the box) changes nothing.
  // Adjusted during render, not in an effect (react.dev: "adjusting some state when a prop changes").
  const [prevUrl, setPrevUrl] = useState({ isInSearch, urlQuery });
  if (prevUrl.isInSearch !== isInSearch || prevUrl.urlQuery !== urlQuery) {
    setPrevUrl({ isInSearch, urlQuery });
    if (!isInSearch) setSearchText('');
    else if (urlQuery !== prevUrl.urlQuery && searchText.trim() !== urlQuery) setSearchText(urlQuery);
  }

  // Search as you type: one search per pause. The first keystroke pushes /search and the rest replace it,
  // so Back leaves search in one step instead of walking back through every prefix.
  // Whether this box pushed the search page on top of another page, so leaving search can go back to it.
  const pushedSearch = useRef(false);
  const openSearch = (to: string) => {
    if (!isInSearch) pushedSearch.current = true;
    void navigate(to, { replace: isInSearch });
  };
  const runSearch = (q: string) => openSearch(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  useEffect(() => {
    const q = searchText.trim();
    if (q === urlQuery || (!isInSearch && !q) || q.length === 1) return;
    const t = setTimeout(() => runSearch(q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runSearch reads only isInSearch, already a dep
  }, [searchText, urlQuery, isInSearch]);

  // Esc and ×: back to the page search was opened from, or Home when search was arrived at some other way
  // (Back or Forward, a restart). Off the search page they only empty the box.
  const leaveSearch = () => {
    setSearchText('');
    if (!isInSearch) return;
    if (pushedSearch.current) void navigate(-1);
    else void navigate('/');
    pushedSearch.current = false;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const q = searchText.trim();
      if (q) {
        addRecentSearch(q);
        if (q !== urlQuery) runSearch(q);
      }
    }
    if (e.key === 'ArrowDown') {
      const first = document.querySelector<HTMLElement>('[data-search-stop]');
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
    if (e.key === 'Escape') leaveSearch();
  };

  return { searchText, setSearchText, isInSearch, openSearch, leaveSearch, onKeyDown };
}
