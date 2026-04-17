import { useNavigate } from 'react-router-dom';
import { resolveAlbumParams, resolveArtistParams, isArtist, isContainer } from '../lib/itemHelpers';
import type { SonosItem } from '../types/sonos';

export function useOpenItem() {
  const navigate = useNavigate();
  return (item: SonosItem) => {
    if (isArtist(item)) {
      const { artistId } = resolveArtistParams(item);
      navigate(`/artist/${encodeURIComponent(artistId ?? '_')}`, { state: { item } });
    } else if (isContainer(item)) {
      const { albumId } = resolveAlbumParams(item);
      navigate(`/container/${encodeURIComponent(albumId ?? '_')}`, { state: { item } });
    } else {
      const { albumId } = resolveAlbumParams(item);
      navigate(`/album/${encodeURIComponent(albumId ?? '_')}`, { state: { item } });
    }
  };
}
