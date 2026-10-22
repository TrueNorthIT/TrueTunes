import { ArtCard } from '../common/ArtCard';
import { withoutPageArtist } from '../../lib/artistSubtitle';
import type { SonosItem } from '../../types/sonos';

interface Props {
  album: SonosItem;
  onOpen: (item: SonosItem) => void;
  onAdd?: (item: SonosItem) => void;
  artistName?: string;
  year?: number;
  /** Omitted while loading. */
  songCount?: number;
  className?: string;
}

/** The newest release as an image card: "Latest release · year" on the art, the title and the meta line over the scrim. */
export function LatestReleaseCard({ album, onOpen, onAdd, artistName, year, songCount, className }: Props) {
  const rawUrl = (album.images as Record<string, string> | undefined)?.['tile1x1'] ?? null;
  const fullSubtitle = (album as Record<string, unknown>)['subtitle'] as string | undefined;
  const songs = songCount ? `${songCount} ${songCount === 1 ? 'song' : 'songs'}` : undefined;
  const meta = [songs, withoutPageArtist(fullSubtitle, artistName)].filter(Boolean).join(' · ');
  return (
    <ArtCard
      size="large"
      className={className}
      label={year ? `Latest release · ${year}` : 'Latest release'}
      title={album.title ?? ''}
      sub={meta ? <span title={fullSubtitle}>{meta}</span> : undefined}
      imageUrl={rawUrl}
      openLabel={`Open ${album.title}`}
      onOpen={() => onOpen(album)}
      onAdd={onAdd ? () => onAdd(album) : undefined}
      addLabel={`Add ${album.title} to queue`}
    />
  );
}
