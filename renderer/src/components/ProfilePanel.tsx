import { useRef, useState, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { useStats } from '../hooks/useStats';
import { useDisplayName, useDisplayNameActions } from '../hooks/useDisplayName';
import { useQueueActions } from '../hooks/useQueueActions';
import { recentlyPlayedQueryOptions } from '../hooks/useRecentlyPlayed';
import { useGameRankings } from '../hooks/useDailyGame';
import { useMyPlaylists } from '../hooks/usePlaylists';
import { useUserProfile, useInvalidateUserProfile } from '../hooks/useUserProfile';
import { useOfficePresence } from '../hooks/useOfficePresence';
import { useUsers } from '../hooks/useUsers';
import { useImage } from '../hooks/useImage';
import { useDominantColor } from '../hooks/useDominantColor';
import { useOpenItem } from '../hooks/useOpenItem';
import { useResolveAndOpen } from '../hooks/useResolveAndOpen';
import { albumQueryOptions } from '../hooks/useAlbumBrowse';
import { createDragGhost } from '../lib/dragHelpers';
import { normalizeAvatar } from '../lib/avatarImage';
import {
  primaryArtistName,
  queued as queuedLabel,
  statsAlbumToItem,
  statsArtistToItem,
  statsTrackToItem,
} from '../lib/homeData';
import { resolveAlbumParams, albumItem, trackPayload } from '../lib/itemHelpers';
import { groupByDay, officeRank, profileFacts, queuedCount } from '../lib/profileData';
import { Carousel } from './common/Carousel';
import { ChartHead, ChartRow } from './common/ChartRow';
import { CreatePlaylistDialog, useTrackContextMenu } from './common/ContextMenu';
import { ImageTile } from './common/ImageTile';
import { StatsArtistTile } from './common/StatsArtistTile';
import { PillButton } from './common/PillButton';
import { SectionCard } from './common/SectionCard';
import { TrackRow } from './common/TrackRow';
import { ArtistLinks } from './common/TrackLinks';
import { UserAvatar } from './common/UserAvatar';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/ProfilePanel.module.css';

/** StatsTrack and RecentTrack carry the same navigation fields. */
type ProfileTrack = Omit<StatsTrack, 'count'>;

/** Keyed on the person, so moving from one profile to another starts at the top with nothing selected. */
export function ProfilePanel() {
  const { userName } = useParams<{ userName: string }>();
  if (!userName) return null;
  return <Profile key={userName} userName={userName} />;
}

function Profile({ userName }: { userName: string }) {
  const { addToQueue: onAddToQueue } = useQueueActions();
  const displayName = useDisplayName();
  const displayNameActions = useDisplayNameActions();
  const [signingIn, setSigningIn] = useState(false);
  const navigate = useNavigate();
  const openItem = useOpenItem();
  const { resolveAndOpen } = useResolveAndOpen();
  const { showTrackMenu } = useTrackContextMenu();
  const queryClient = useQueryClient();
  const isOwnProfile = !!displayName && displayName === userName;

  // Real data only: this person's all-time and weekly stats, their last seven days, the office ranking.
  const { data: stats, isLoading: statsLoading } = useStats('alltime', userName, 25);
  const { data: week } = useStats('week', userName);
  const { data: office } = useStats('alltime');
  const { data: recent, isLoading: recentLoading } = useQuery(recentlyPlayedQueryOptions(userName)); // shared with useRecentlyPlayed
  const { data: rankings } = useGameRankings(userName, true);
  const ranking = rankings?.find((r) => r.userName === userName) ?? null;
  const { data: presence } = useOfficePresence();
  // Only a sensed or rostered presence says someone is here; "available" includes working from home.
  const inOffice =
    (presence?.basis === 'sensed' || presence?.basis === 'rostered') && presence.inOffice.includes(userName);

  const topTracks = stats?.topTracks ?? [];
  const topArtists = stats?.topArtists ?? [];
  const topAlbums = stats?.topAlbums ?? [];
  const queued = queuedCount(stats, userName);
  const lately = (recent?.tracks ?? []).slice(0, 10);
  const { data: users } = useUsers(true, true);
  const lastQueued = users?.find((u) => u.userId === userName)?.lastQueued;
  const chart = topTracks.slice(0, 10);
  // With nothing from the past week, the Lately card goes and "Last queued ..." joins the facts instead.
  const showLately = recentLoading || lately.length > 0;
  const facts = profileFacts({
    queued,
    recentQueued: queuedCount(week, userName),
    rank: officeRank(office?.topUsers, userName),
    lastQueued: showLately ? null : lastQueued,
  });

  // The face leads; its colour washes the hero. Without a photo, the person's most played album lends its colour.
  const { data: profile } = useUserProfile(userName);
  const photo = useImage(profile?.imageUrl ?? null);
  const leadAlbumArt = useImage(topAlbums[0]?.imageUrl ?? null);
  const wash = useDominantColor(photo ?? leadAlbumArt);

  // ── Own profile: photo, name ──
  const invalidateProfile = useInvalidateUserProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { buffer, mimeType } = await normalizeAvatar(file);
      await window.sonos.uploadProfileImage(userName, buffer, mimeType);
      invalidateProfile(userName);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleSignOut() {
    displayNameActions.set(null);
    setSigningIn(true);
    await window.sonos.entraSignOut().catch(() => {});
    await window.sonos.entraReLogin().catch(() => {});
    await displayNameActions.refresh();
    setSigningIn(false);
  }

  async function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setRenameSaving(true);
    setRenameError(null);
    const result = await displayNameActions.rename(displayName, trimmed);
    setRenameSaving(false);
    if (result?.error === 'taken') {
      setRenameError('That name is already taken.');
    } else if (result?.error) {
      setRenameError('Couldn’t change your name. Try again.');
    } else {
      setRenaming(false);
      navigate(`/profile/${encodeURIComponent(trimmed)}`);
    }
  }

  // ── Track navigation: album on the title or art, artist on the name, the track menu on right-click ──
  const albumItemFor = (t: ProfileTrack): SonosItem | null =>
    t.albumId
      ? albumItem(t.album ?? t.trackName, {
          objectId: t.albumId,
          serviceId: t.serviceId ?? '',
          accountId: t.accountId ?? '',
        })
      : null;
  const openAlbum = (t: ProfileTrack) => {
    const item = albumItemFor(t);
    if (item) openItem(item);
    else
      void resolveAndOpen(t.album || t.trackName, 'album', {
        artist: primaryArtistName(t.artist),
        serviceId: t.serviceId,
        accountId: t.accountId,
      });
  };
  const prefetchAlbum = (t: ProfileTrack) => {
    const p = resolveAlbumParams(albumItemFor(t) ?? ({} as SonosItem));
    if (p.albumId && p.serviceId && p.accountId)
      void queryClient.prefetchQuery(albumQueryOptions(p.albumId, p.serviceId, p.accountId, p.defaults));
  };
  const openArtist = (name: string, ids: { artistId?: string; serviceId?: string; accountId?: string }) => {
    if (ids.artistId) openItem(statsArtistToItem({ artist: name, count: 0, ...ids }));
    else void resolveAndOpen(name, 'artist', { serviceId: ids.serviceId, accountId: ids.accountId });
  };
  const artistLinks = (t: ProfileTrack) => (
    <ArtistLinks
      artist={t.artist}
      onOpenArtist={(name, isFirst) =>
        openArtist(name, { artistId: isFirst ? t.artistId : undefined, serviceId: t.serviceId, accountId: t.accountId })
      }
    />
  );
  const menu = (t: ProfileTrack, e: React.MouseEvent) => {
    if (!t.uri) return;
    showTrackMenu(
      {
        track: trackPayload({ ...t, uri: t.uri, albumName: t.album }),
        sonosItem: statsTrackToItem(t) ?? undefined,
      },
      e
    );
  };
  const addTrack = (t: ProfileTrack) => {
    const item = statsTrackToItem(t);
    return item ? () => onAddToQueue(item) : undefined;
  };

  // ── Top tracks: click, shift and ctrl select; drag the selection onto the queue ──
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const lastSelected = useRef<number | null>(null);
  function handleTrackClick(i: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (e.shiftKey && lastSelected.current !== null) {
      const lo = Math.min(lastSelected.current, i);
      const hi = Math.max(lastSelected.current, i);
      setSelected((prev) => {
        const next = new Set(prev);
        for (let j = lo; j <= hi; j++) next.add(j);
        return next;
      });
    } else if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        return next;
      });
      lastSelected.current = i;
    } else if (selected.size === 1 && selected.has(i)) {
      setSelected(new Set());
      lastSelected.current = null;
    } else {
      setSelected(new Set([i]));
      lastSelected.current = i;
    }
  }
  function handleTrackDragStart(i: number, e: React.DragEvent) {
    const indices = selected.has(i) ? [...selected].sort((a, b) => a - b) : [i];
    if (!selected.has(i)) {
      setSelected(new Set([i]));
      lastSelected.current = i;
    }
    const items = indices.map((j) => statsTrackToItem(chart[j])).filter((x): x is SonosItem => x !== null);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/sonos-item-list', JSON.stringify(items));
    createDragGhost(items.length > 1 ? `${items.length} tracks` : chart[i].trackName, e.dataTransfer);
  }

  // ── Playlists: your own and the ones you've joined; for someone else, their public ones ──
  const { owned, joined } = useMyPlaylists(userName);
  const playlists = (isOwnProfile ? [...owned, ...joined] : owned.filter((p) => p.isPublic)).sort((a, b) => {
    if (!!b.isFavourites !== !!a.isFavourites) return b.isFavourites ? 1 : -1;
    return b.updatedAt - a.updatedAt;
  });

  const nothingYet = !statsLoading && queued === 0;

  return (
    <div className={`page-scale ${styles.panel}`}>
      <header className={styles.hero} style={wash ? ({ '--wash': wash } as CSSProperties) : undefined}>
        {wash && <div className={styles.heroWash} aria-hidden="true" />}

        {isOwnProfile ? (
          <button
            type="button"
            className={`${styles.avatarBtn} ${styles.avatar}`}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Change your photo"
          >
            <UserAvatar name={userName} imageUrl={profile?.imageUrl} className={styles.avatarFace} />
            <span
              className={`${styles.avatarOverlay}${uploading ? ' ' + styles.avatarOverlayOn : ''}`}
              aria-hidden="true"
            >
              {uploading ? (
                'Uploading…'
              ) : (
                <>
                  <Camera size={22} /> Change photo
                </>
              )}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={handleAvatarUpload}
            />
          </button>
        ) : (
          <UserAvatar
            name={userName}
            imageUrl={profile?.imageUrl}
            className={`${styles.avatar} ${styles.avatarFace}`}
          />
        )}

        <div className={styles.heroText}>
          {renaming ? (
            <form onSubmit={handleRenameSubmit} className={styles.renameForm}>
              <input
                className={styles.renameInput}
                aria-label="Your name"
                value={renameValue}
                onChange={(e) => {
                  setRenameValue(e.target.value);
                  setRenameError(null);
                }}
                autoFocus
                maxLength={32}
                spellCheck={false}
              />
              <PillButton type="submit" variant="primary" disabled={!renameValue.trim() || renameSaving}>
                {renameSaving ? 'Saving…' : 'Save'}
              </PillButton>
              <PillButton
                onClick={() => {
                  setRenaming(false);
                  setRenameError(null);
                }}
              >
                Cancel
              </PillButton>
              {renameError && (
                <p className={styles.renameError} role="alert">
                  {renameError}
                </p>
              )}
            </form>
          ) : (
            <h1 className={styles.name}>{userName}</h1>
          )}
          {/* Each fact is unbreakable, so the line only wraps between facts: no widowed "office". */}
          {facts.length > 0 && (
            <p className={styles.facts}>
              {facts.map((f, i) => (
                <span key={f}>
                  {i > 0 && ' · '}
                  <span className={styles.fact}>{f}</span>
                </span>
              ))}
            </p>
          )}
          {nothingYet && <p className={styles.facts}>Nothing queued yet</p>}
          {(inOffice || ranking) && (
            <div className={styles.chips}>
              {inOffice && <span className={styles.chip}>In the office today</span>}
              {/* The tier as its name in a tonal chip, as on the Leaderboard and Queuedle: no raster tier art. */}
              {ranking && (
                <>
                  <span className={`${styles.tierChip}${ranking.isProvisional ? ' ' + styles.provisional : ''}`}>
                    {ranking.isProvisional ? 'Provisional' : ranking.tierName}
                  </span>
                  <span className={styles.rankDetail}>
                    {ranking.isProvisional
                      ? `Queuedle · ${ranking.gamesPlayed} ${ranking.gamesPlayed === 1 ? 'game' : 'games'} played`
                      : `Queuedle · ${ranking.averagePercent.toFixed(0)}% average · best ${ranking.bestTotal} · ${ranking.gamesPlayed} ${ranking.gamesPlayed === 1 ? 'game' : 'games'}`}
                  </span>
                </>
              )}
            </div>
          )}
          {isOwnProfile && !renaming && (
            <div className={styles.heroActions}>
              <PillButton
                onClick={() => {
                  setRenameValue(userName);
                  setRenaming(true);
                }}
              >
                Change name
              </PillButton>
              <PillButton onClick={handleSignOut}>Sign out</PillButton>
            </div>
          )}
        </div>
      </header>

      {nothingYet && (
        <p className={`${styles.band} ${styles.empty}`}>
          {isOwnProfile
            ? 'Anything you add to the queue shows up here: your top tracks, artists and albums.'
            : `${userName} hasn’t queued anything yet.`}
        </p>
      )}

      {(statsLoading || chart.length > 0) && (
        <div className={`${styles.band} ${styles.split}${showLately ? '' : ' ' + styles.splitSolo}`}>
          <SectionCard title="Top tracks">
            {statsLoading ? (
              <div aria-hidden="true">
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} className={`skeleton ${styles.rowSkel}`} />
                ))}
              </div>
            ) : (
              <>
                <ChartHead labels={['#', 'Title', 'Artist', 'Queued']} />
                <ol
                  className={styles.list}
                  onClick={() => {
                    setSelected(new Set());
                    lastSelected.current = null;
                  }}
                >
                  {chart.map((t, i) => (
                    <ChartRow
                      key={`${t.uri ?? t.trackName}-${i}`}
                      rank={i + 1}
                      title={t.trackName}
                      artists={artistLinks(t)}
                      imageUrl={t.imageUrl}
                      count={t.count}
                      countLabel={`Queued ${t.count === 1 ? 'once' : `${t.count} times`}`}
                      selected={selected.has(i)}
                      onClick={(e) => handleTrackClick(i, e)}
                      onDragStart={t.uri ? (e) => handleTrackDragStart(i, e) : undefined}
                      onOpen={() => openAlbum(t)}
                      onAdd={addTrack(t)}
                      onContextMenu={(e) => menu(t, e)}
                      onMouseEnter={() => prefetchAlbum(t)}
                    />
                  ))}
                </ol>
              </>
            )}
          </SectionCard>

          {showLately && (
            <SectionCard title="Lately">
              {recentLoading ? (
                <div aria-hidden="true">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className={`skeleton ${styles.rowSkel}`} />
                  ))}
                </div>
              ) : (
                groupByDay(lately).map((g) => (
                  <div key={g.day} className={styles.day}>
                    <h3 className={styles.dayTitle}>{g.day}</h3>
                    <ul className={styles.list}>
                      {g.items.map((t, i) => (
                        <TrackRow
                          key={`${t.uri ?? t.trackName}-${i}`}
                          title={t.trackName}
                          artists={artistLinks(t)}
                          imageUrl={t.imageUrl}
                          onOpen={() => openAlbum(t)}
                          onAdd={addTrack(t)}
                          onContextMenu={(e) => menu(t, e)}
                          onMouseEnter={() => prefetchAlbum(t)}
                        />
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </SectionCard>
          )}
        </div>
      )}

      {topArtists.length > 0 && (
        <Carousel title="Top artists" className={styles.band} gap="1.2em">
          {topArtists.map((a, i) => (
            <div key={`${a.artistId ?? a.artist}-${i}`} className={styles.shelfTile}>
              <StatsArtistTile a={a} onOpen={() => openArtist(a.artist, a)} />
            </div>
          ))}
        </Carousel>
      )}

      {topAlbums.length > 0 && (
        <Carousel title="Top albums" className={styles.band} gap="1.2em">
          {topAlbums.map((a, i) => {
            const item = statsAlbumToItem(a);
            return (
              <div key={`${a.albumId ?? a.album}-${i}`} className={styles.shelfTile}>
                <ImageTile
                  title={a.album}
                  sub={a.artist}
                  meta={queuedLabel(a.count)}
                  imageUrl={a.imageUrl}
                  onOpen={() =>
                    a.albumId
                      ? openItem(item)
                      : void resolveAndOpen(a.album, 'album', { artist: primaryArtistName(a.artist) })
                  }
                />
              </div>
            );
          })}
        </Carousel>
      )}

      {(playlists.length > 0 || isOwnProfile) && (
        <Carousel
          title="Playlists"
          className={styles.band}
          gap="1.2em"
          actions={
            isOwnProfile ? <PillButton onClick={() => setCreatePlaylistOpen(true)}>New playlist</PillButton> : undefined
          }
        >
          {playlists.length === 0 ? (
            <p className={styles.empty}>No playlists yet.</p>
          ) : (
            playlists.map((pl) => (
              <div key={pl.id} className={styles.shelfTile}>
                <ImageTile
                  title={pl.name}
                  sub={`${pl.trackCount} ${pl.trackCount === 1 ? 'track' : 'tracks'}`}
                  meta={pl.owner !== userName ? `By ${pl.owner}` : !pl.isPublic ? 'Private' : null}
                  imageUrl={pl.imageUrl}
                  onOpen={() => navigate(`/playlist/${pl.id}`)}
                />
              </div>
            ))
          )}
        </Carousel>
      )}

      {signingIn && (
        <div className={styles.signingIn}>
          <span>Signing in with your organisation account…</span>
        </div>
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
