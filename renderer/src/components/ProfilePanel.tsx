import { useCallback, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUserStats } from '../hooks/useUserStats';
import { useGameRankings } from '../hooks/useDailyGame';
import { useMyPlaylists } from '../hooks/usePlaylists';
import { useUserProfile, useInvalidateUserProfile } from '../hooks/useUserProfile';
import { useImage } from '../hooks/useImage';
import { getGameRankIcon } from '../lib/gameRankAssets';
import { useOpenItem } from '../hooks/useOpenItem';
import { createDragGhost } from '../lib/dragHelpers';
import { CardRow } from './CardRow';
import { MediaRow } from './common/MediaRow';
import { CreatePlaylistDialog } from './common/ContextMenu';
import { PlaylistCard } from './common/PlaylistCard';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/ProfilePanel.module.css';

function TrackSubtitle({ t, openItem, linkClass }: { t: StatsTrack; openItem: (item: SonosItem) => void; linkClass: string }) {
  const artistItem: SonosItem | null = t.artistId
    ? { type: 'ARTIST', name: t.artist, resource: { type: 'ARTIST', id: { objectId: t.artistId, serviceId: t.serviceId, accountId: t.accountId } } }
    : null;
  const albumItem: SonosItem | null = t.albumId && t.album
    ? { type: 'ALBUM', name: t.album, resource: { type: 'ALBUM', id: { objectId: t.albumId, serviceId: t.serviceId, accountId: t.accountId } } }
    : null;
  return (
    <>
      {artistItem
        ? <button className={linkClass} onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); openItem(artistItem); }}>{t.artist}</button>
        : t.artist}
      {t.album && <>{' · '}{albumItem
        ? <button className={linkClass} onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); openItem(albumItem); }}>{t.album}</button>
        : t.album}</>}
    </>
  );
}

function statsTrackToSonosItem(t: StatsTrack): SonosItem {
  return {
    type: 'TRACK',
    title: t.trackName,
    resource: {
      type: 'TRACK',
      id: { objectId: t.uri ?? '', serviceId: t.serviceId ?? '', accountId: t.accountId ?? '' },
    },
  };
}

function getAvatarStyle(name: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue},55%,38%), hsl(${(hue + 40) % 360},60%,28%))`,
  };
}

interface Props {
  onAddToQueue: (item: SonosItem) => void;
  displayName?: string | null;
  onSignOut?: () => void;
}

export function ProfilePanel({ onAddToQueue, displayName, onSignOut }: Props) {
  const { userName } = useParams<{ userName: string }>();
  const navigate = useNavigate();
  const openItem = useOpenItem();
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);

const { topTracks, artistItems: topArtists, albumItems: topAlbums, totalEvents, isLoading: statsLoading } =
    useUserStats(userName, 25);

  const { data: rankings } = useGameRankings(userName, !!userName);
  const ranking = rankings?.find(r => r.userName === userName) ?? null;

  const isOwnProfile = !!displayName && displayName === userName;
  const { data: profile } = useUserProfile(userName);
  const profileArt = useImage(profile?.imageUrl ?? null);
  const invalidateProfile = useInvalidateUserProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [trackSelected, setTrackSelected] = useState<Set<number>>(new Set());
  const lastTrackSelected = useRef<number | null>(null);

  const handleTrackClick = useCallback((idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey && lastTrackSelected.current !== null) {
      const lo = Math.min(lastTrackSelected.current, idx);
      const hi = Math.max(lastTrackSelected.current, idx);
      setTrackSelected(prev => { const next = new Set(prev); for (let j = lo; j <= hi; j++) next.add(j); return next; });
    } else if (e.ctrlKey || e.metaKey) {
      setTrackSelected(prev => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; });
      lastTrackSelected.current = idx;
    } else {
      if (trackSelected.size === 1 && trackSelected.has(idx)) { setTrackSelected(new Set()); lastTrackSelected.current = null; }
      else { setTrackSelected(new Set([idx])); lastTrackSelected.current = idx; }
    }
  }, [trackSelected]);

  const handleTrackDragStart = useCallback((idx: number, e: React.DragEvent) => {
    const indices = trackSelected.has(idx) ? [...trackSelected].sort((a, b) => a - b) : [idx];
    if (!trackSelected.has(idx)) { setTrackSelected(new Set([idx])); lastTrackSelected.current = idx; }
    const items = indices.map(i => statsTrackToSonosItem(topTracks[i]));
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/sonos-item-list', JSON.stringify(items));
    createDragGhost(items.length > 1 ? `${items.length} tracks` : topTracks[idx].trackName, e.dataTransfer);
  }, [trackSelected, topTracks]);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userName) return;
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      await window.sonos.uploadProfileImage(userName, buf, file.type);
      invalidateProfile(userName);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  const { owned: ownedPlaylists, joined: joinedPlaylists } = useMyPlaylists(userName);
  const allPlaylists = isOwnProfile
    ? [...ownedPlaylists, ...joinedPlaylists]
    : ownedPlaylists.filter(p => p.isPublic);
  const visiblePlaylists = [...allPlaylists].sort((a, b) => {
    if (!!b.isFavourites !== !!a.isFavourites) return b.isFavourites ? 1 : -1;
    return b.updatedAt - a.updatedAt;
  });

  if (!userName) return null;

  const tierIcon = ranking ? getGameRankIcon(ranking.tierKey) : null;

  return (
    <div className={styles.panel}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div
          className={`${styles.avatar}${isOwnProfile ? ' ' + styles.avatarEditable : ''}`}
          style={profileArt ? undefined : getAvatarStyle(userName)}
          onClick={isOwnProfile ? () => fileInputRef.current?.click() : undefined}
          title={isOwnProfile ? 'Change photo' : undefined}
        >
          {profileArt
            ? <img src={profileArt} alt="" className={styles.avatarImg} />
            : userName[0].toUpperCase()
          }
          {isOwnProfile && (
            <div className={`${styles.avatarOverlay}${uploading ? ' ' + styles.avatarOverlayActive : ''}`}>
              {uploading ? '…' : '📷'}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handleAvatarUpload}
          />
        </div>
        <div className={styles.headerInfo}>
          <div className={styles.nameWrap}>
            <h1 className={styles.userName}>{userName}</h1>
          </div>
          {(totalEvents > 0 || isOwnProfile) && (
            <span className={styles.statChip}>
              {totalEvents > 0 && (
                <><span className={styles.statChipValue}>{totalEvents.toLocaleString()}</span> plays</>
              )}
              {isOwnProfile && onSignOut && (
                <>
                  {totalEvents > 0 && <span className={styles.statChipSep}>|</span>}
                  <button className={styles.signOutInline} onClick={onSignOut}>Sign out</button>
                </>
              )}
            </span>
          )}
        </div>
        {ranking && (
          <div className={styles.rankHero}>
            {tierIcon && <img src={tierIcon} alt="" className={styles.rankHeroIcon} />}
            <div className={styles.rankHeroText}>
              <span className={styles.rankHeroName}>
                {ranking.isProvisional ? 'Provisional' : ranking.tierName}
              </span>
              <span className={styles.rankHeroPercent}>
                {ranking.isProvisional
                  ? <>{ranking.gamesPlayed} {ranking.gamesPlayed === 1 ? 'game' : 'games'} played</>
                  : <>{ranking.averagePercent.toFixed(0)}% <span className={styles.sc}>avg</span> · <span className={styles.sc}>best</span> {ranking.bestTotal} · {ranking.gamesPlayed} <span className={styles.sc}>{ranking.gamesPlayed === 1 ? 'game' : 'games'}</span></>
                }
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Top Tracks ───────────────────────────────────────────────────── */}
      {(statsLoading || topTracks.length > 0) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Top Tracks</h2>
          <div
            className={styles.topTracksGrid}
            onClick={() => { setTrackSelected(new Set()); lastTrackSelected.current = null; }}
          >
            <div className={styles.topTracksCol}>
              {statsLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={styles.skelBlock} style={{ height: 52, marginBottom: 2, animationDelay: `${i * 60}ms` }} />
                  ))
                : topTracks.slice(0, 5).map((t, i) => (
                    <MediaRow
                      key={i}
                      name={t.trackName}
                      subtitle={<TrackSubtitle t={t} openItem={openItem} linkClass={styles.trackLink} />}
                      artUrl={t.imageUrl}
                      trailing={<span className={styles.countBadge}>{t.count}×</span>}
                      isSelected={trackSelected.has(i)}
                      onClick={e => handleTrackClick(i, e)}
                      draggable={!!t.uri}
                      onDragStart={t.uri ? e => handleTrackDragStart(i, e) : undefined}
                    />
                  ))
              }
            </div>
            <div className={styles.topTracksCol}>
              {statsLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={styles.skelBlock} style={{ height: 52, marginBottom: 2, animationDelay: `${(i + 5) * 60}ms` }} />
                  ))
                : topTracks.slice(5, 10).map((t, i) => (
                    <MediaRow
                      key={i + 5}
                      name={t.trackName}
                      subtitle={<TrackSubtitle t={t} openItem={openItem} linkClass={styles.trackLink} />}
                      artUrl={t.imageUrl}
                      trailing={<span className={styles.countBadge}>{t.count}×</span>}
                      isSelected={trackSelected.has(i + 5)}
                      onClick={e => handleTrackClick(i + 5, e)}
                      draggable={!!t.uri}
                      onDragStart={t.uri ? e => handleTrackDragStart(i + 5, e) : undefined}
                    />
                  ))
              }
            </div>
          </div>
        </section>
      )}

      {/* ── Top Artists ───────────────────────────────────────────────────── */}
      {(statsLoading || topArtists.length > 0) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Top Artists</h2>
          <CardRow items={topArtists} isLoading={statsLoading} onAdd={onAddToQueue} onOpen={openItem} cardSize="110px" />
        </section>
      )}

      {/* ── Top Albums ────────────────────────────────────────────────────── */}
      {(statsLoading || topAlbums.length > 0) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Top Albums</h2>
          <CardRow items={topAlbums} isLoading={statsLoading} onAdd={onAddToQueue} onOpen={openItem} cardSize="110px" />
        </section>
      )}

      {/* ── Playlists ────────────────────────────────────────────────────── */}
      {(visiblePlaylists.length > 0 || isOwnProfile) && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Playlists</h2>
            {isOwnProfile && (
              <button className={styles.sectionAction} onClick={() => setCreatePlaylistOpen(true)}>+ New</button>
            )}
          </div>
          <div className={styles.playlistRow}>
            {visiblePlaylists.map((pl) => (
              <PlaylistCard
                key={pl.id}
                pl={pl}
                displayName={isOwnProfile ? displayName : userName}
                onClick={() => navigate(`/playlist/${pl.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {createPlaylistOpen && (
        <CreatePlaylistDialog
          displayName={displayName}
          pendingTrack={null}
          onClose={() => setCreatePlaylistOpen(false)}
        />
      )}
    </div>
  );
}
