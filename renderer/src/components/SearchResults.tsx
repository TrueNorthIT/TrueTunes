import { useImage } from '../hooks/useImage';
import { getName, browseSub, getItemArt, isAlbum, isArtist, isTrack } from '../lib/itemHelpers';
import { ArtistHero } from './ArtistHero';
import { ItemRow } from './ItemRow';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/HomePanel.module.css';

// ── Artist circle ─────────────────────────────────────────────────────────────

function ArtistCircle({ artist, onOpen }: { artist: SonosItem; onOpen: (item: SonosItem) => void }) {
  const art  = useImage(getItemArt(artist));
  const name = (artist.title ?? artist.name ?? '') as string;
  return (
    <div className={styles.artistCircle} onClick={() => onOpen(artist)}>
      <div className={styles.artistCircleArt}>
        {art
          ? <img src={art} alt="" />
          : <div className={styles.artistCircleArtPh}>{name[0]}</div>}
      </div>
      <div className={styles.artistCircleName}>{name}</div>
    </div>
  );
}

// ── Album card ────────────────────────────────────────────────────────────────

function SearchAlbumCard({ album, onOpen }: { album: SonosItem; onOpen: (item: SonosItem) => void }) {
  const art  = useImage(getItemArt(album));
  const name = (album.title ?? album.name ?? '') as string;
  const sub  = browseSub(album);
  return (
    <div className={styles.searchAlbumCard} onClick={() => onOpen(album)}>
      <div className={styles.searchAlbumArt}>
        {art ? <img src={art} alt="" /> : <div className={styles.searchAlbumArtPh}>♪</div>}
      </div>
      <div className={styles.searchAlbumTitle}>{name}</div>
      {sub && <div className={styles.searchAlbumSub}>{sub}</div>}
    </div>
  );
}

// ── Search results layout ─────────────────────────────────────────────────────

export function SearchResults({
  results,
  onAddToQueue,
  onOpenAlbum,
  onOpenArtist,
}: {
  results: SonosItem[];
  onAddToQueue: (item: SonosItem) => void;
  onOpenAlbum: (item: SonosItem) => void;
  onOpenArtist: (item: SonosItem) => void;
}) {
  const topArtist = results.length > 0 && isArtist(results[0]) ? results[0] : null;
  const artists   = results.filter(isArtist);
  const albums    = results.filter(isAlbum);
  const tracks    = results.filter(isTrack);
  const others    = results.filter((r) => !isArtist(r) && !isAlbum(r) && !isTrack(r));

  if (results.length === 0) return <div className={styles.msg}>No results.</div>;

  return (
    <>
      {topArtist && (
        <ArtistHero artist={topArtist} onAddToQueue={onAddToQueue} onOpen={onOpenArtist} />
      )}

      {artists.length > 0 && (
        <section className={styles.searchSection}>
          <h2 className={styles.searchSectionTitle}>Artists</h2>
          <div className={styles.artistsRow}>
            {artists.map((a, i) => (
              <ArtistCircle key={i} artist={a} onOpen={onOpenArtist} />
            ))}
          </div>
        </section>
      )}

      {albums.length > 0 && (
        <section className={styles.searchSection}>
          <h2 className={styles.searchSectionTitle}>Albums</h2>
          <div className={styles.searchAlbumsRow}>
            {albums.map((a, i) => (
              <SearchAlbumCard key={i} album={a} onOpen={onOpenAlbum} />
            ))}
          </div>
        </section>
      )}

      {tracks.length > 0 && (
        <section className={styles.searchSection}>
          <h2 className={styles.searchSectionTitle}>Songs</h2>
          <div className={styles.tracksList}>
            {tracks.map((item, i) => (
              <ItemRow
                key={i}
                name={getName(item)}
                sub={browseSub(item)}
                artUrl={getItemArt(item)}
                showAddButton
                onAdd={() => onAddToQueue(item)}
              />
            ))}
          </div>
        </section>
      )}

      {others.length > 0 && !topArtist && (
        <section className={styles.searchSection}>
          <h2 className={styles.searchSectionTitle}>Other</h2>
          <div className={styles.tracksList}>
            {others.map((item, i) => (
              <ItemRow
                key={i}
                name={getName(item)}
                sub={browseSub(item)}
                artUrl={getItemArt(item)}
                showAddButton
                onAdd={() => onAddToQueue(item)}
                onOpen={
                  isAlbum(item) ? () => onOpenAlbum(item)
                  : isArtist(item) ? () => onOpenArtist(item)
                  : undefined
                }
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
