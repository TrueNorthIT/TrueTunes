/** A single letter matches half the catalogue and costs a Sonos request; wait for two. */
export const MIN_SEARCH_CHARS = 2;

export const isSearchable = (query: string): boolean => query.trim().length >= MIN_SEARCH_CHARS;
