# components/common

Shared UI. The Home-language components are sized in `em`: put them inside a page root with the global `page-scale` class (`global.css`). They use tokens only (`--surface`, `--row-hover`, `--text-3`, `--dur-fast`, `--scrim-art`, ...), show hover and `:focus-visible` states (the ring is the global one), stop motion under `prefers-reduced-motion` and keep text at or above 13px (`max(13px, Xem)`). Authority: `DESIGN.md`.

## Home language

- **SectionCard** `{ title?, headContent?, actions?, featured?, wash?, className?, children }` — soft borderless tonal card; `featured` is the lit wall with the artwork `wash` (`"r, g, b"`); labelled by its title. Also exports **SeeAll** `{ label?, onClick }`.
- **ArtCard** `{ size: 'large'|'medium', label, title, sub?, imageUrl?, photoUrl?, onOpen, openLabel, onAdd?, addLabel?, onContextMenu?, onMouseEnter?, className? }` — full-bleed image card: scrim, top-left label, caption, + bottom right; the artist photo fades in over the cover.
- **ChartRow** `{ rank, title, artists, imageUrl?, count, countLabel?, onOpen, onAdd?, addLabel?, onContextMenu?, onMouseEnter? }` — ranked `li`: zero-padded rank, 40px-class art, title button, artist links, right-aligned count, + on hover. Also exports **ChartHead** `{ labels? }`, the column labels on the same grid.
- **TrackRow** `{ title, artists, imageUrl?, reason?, onOpen, onAdd?, addLabel?, onContextMenu?, onMouseEnter? }` — compact `li`: art, "title — artist", optional reason line, + on hover or focus. `artists` is a node (use **ArtistLinks**). Also exports **RowThumb** `{ imageUrl?, onOpen }`.
- **ImageTile** `{ title, sub?, meta?, imageUrl?, circular?, size?: 'md'|'sm', onOpen, onHover?, onAdd?, addLabel? }` — art over a caption; lifts 2px on hover; `circular` for artists; `sm` is the compact three-up tile; optional corner +.
- **PersonCard** `{ name, imageUrl?, caption?, onOpen, openLabel?, children? }` — avatar, name and caption, header washed with the photo's dominant colour; children render under the header.
- **TopResultCard** `{ title, meta?, imageUrl?, explicit?, onOpen, openLabel, onMouseEnter?, onContextMenu?, children?, className? }` — Search's "Top result" as a print: the art (or artist photo) fills the card, and the heading, title (clamped to three lines), meta and children (pills, OfficeChip) sit bottom left on their own scrim. No art or the grey silhouette falls back to the lit wall and tint wash. The whole card is one open button carrying `data-search-stop`.
- **Dialog** `{ title, onClose, headContent?, actions?, onSubmit?, size?: 'sm'|'md'|'lg', closeLabel?, className?, children }` — the one modal: a native `<dialog>` opened with `showModal()` and portalled to body, so the page behind is inert and Tab stays inside. Esc closes. Outside clicks close it, except in a form dialog (`onSubmit`), so a stray click can't lose typed text. Focus goes to `[data-autofocus]`, else the first text field, else the dialog, and returns to the opener on close. The title is sentence case and names the dialog. `actions` is a right-aligned row: secondary actions first, the primary or destructive one last (PillButton `primary` / `danger`). `onSubmit` wraps the body and actions in a form. `Dialog.module.css` also exports content classes: `note`, `stack`, `field`, `label`, `input` (a borderless tonal field) and `error`. Mount it to open it.
- **QueuerChip** `{ user, imageUrl?, onOpen, prefix?, className? }` — the "Queued by X" chip (moved out of HomePanel); the page owns its position through `className`.
- **WavyProgress** `{ progressPct, paused?, label?, className? }` — Material-style wavy progress line (a `progressbar`): a travelling sine wave for the played part (ramping up from flat over its first wavelength), a gap, then the flat track. Fills a flex row. `paused` eases it flat and stops it; flat and still under reduced motion. **LiveWavyProgress** reads the playback position store. Used on Home's Now playing card.
- **AddButton** `{ label, onClick, variant?: 'quiet'|'art'|'corner', className? }` — the one + button: borderless, never bubbles the click. The parent owns position and reveal (opacity).
- **TitleButton** `{ title, onOpen, label? }` and **ArtistLinks** `{ artist, onOpenArtist(name, isFirst) }` (from `TrackLinks`) — text links named "Title, open album" and "Name, open artist".

Not extracted (still in `HomePanel.tsx`): the Now playing card and the lyrics box, which are tied to the playback, lyrics and Genius hooks; the "For you" name-over-art tile.

## Older shared primitives

Brought into the language (tokens, no borders, 13px floor): **Carousel** (title is the SectionCard title style), **Toast** (tonal surface plus status dot, optional action), **ContextMenu** (a `role=menu` of buttons with lucide icons and arrow-key movement; its CreatePlaylistDialog uses Dialog).

- **Carousel** `{ title?, actions?, gap?, className?, rowStyle?, search?, children }`
