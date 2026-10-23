import { useArtistImage } from '../../hooks/useArtistBrowse';
import { queued } from '../../lib/homeData';
import { ImageTile } from './ImageTile';

/** A circular artist tile: the artist's own photo when the service has one, else the art the events carried. */
export function StatsArtistTile({ a, onOpen, size }: { a: StatsArtist; onOpen: () => void; size?: 'md' | 'sm' }) {
  const { data: photo } = useArtistImage(a.artistId, a.serviceId, a.accountId);
  return <ImageTile circular size={size} title={a.artist} sub={queued(a.count)} imageUrl={photo ?? a.imageUrl} onOpen={onOpen} />;
}
