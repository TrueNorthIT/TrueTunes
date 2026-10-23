import { useQuery } from '@tanstack/react-query';
import { geniusParagraphs } from '../lib/homeData';

/** The text an About card shows: plain paragraphs, the release date as read, and the Genius page. */
export interface GeniusAbout {
  paragraphs: string[];
  released?: string;
  url?: string;
}

// The card shows the opening, not the whole essay; the Genius link has the rest.
const MAX_PARAGRAPHS = 3;

/** "2014-08-22" reads "22 August 2014"; anything else (a bare year, Genius's own wording) as given. */
export function releasedLabel(date: string | undefined): string | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return date || undefined;
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function geniusAlbumAboutQueryOptions(albumName: string | null | undefined, artistName: string | null | undefined) {
  return {
    queryKey: ['genius-album-about', albumName, artistName] as const,
    queryFn: async (): Promise<GeniusAbout | null> => {
      const r = await window.sonos.geniusAlbumAbout(albumName!, artistName!);
      if (!r) return null;
      return { paragraphs: geniusParagraphs(r.description).slice(0, MAX_PARAGRAPHS), released: releasedLabel(r.releaseDate), url: r.url };
    },
    staleTime: Infinity,
    retry: false,
    enabled: !!albumName && !!artistName,
  };
}

export function geniusArtistBioQueryOptions(artistName: string | null | undefined) {
  return {
    queryKey: ['genius-artist-bio', artistName] as const,
    queryFn: async (): Promise<GeniusAbout | null> => {
      const r = await window.sonos.geniusArtist(artistName!);
      if (!r) return null;
      return { paragraphs: geniusParagraphs(r.description).slice(0, MAX_PARAGRAPHS), url: r.url ?? undefined };
    },
    staleTime: Infinity,
    retry: false,
  };
}

/**
 * The album's Genius description, else the artist's Genius bio ("About Royal Blood"), else null.
 * The bio is only asked for once the album turns out to have no description.
 */
export function useGeniusAlbumAbout(albumName: string | null | undefined, artistName: string | null | undefined) {
  const album = useQuery(geniusAlbumAboutQueryOptions(albumName, artistName));
  const needBio = album.isSuccess && !album.data?.paragraphs.length && !!artistName;
  const bio = useQuery({ ...geniusArtistBioQueryOptions(artistName), enabled: needBio });

  const about = album.data?.paragraphs.length
    ? { title: 'About this album', ...album.data }
    : needBio && bio.data?.paragraphs.length
      ? { title: `About ${artistName}`, ...bio.data }
      : null;
  return { about, isLoading: album.isLoading || (needBio && bio.isLoading) };
}
