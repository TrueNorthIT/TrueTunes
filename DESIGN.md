---
name: True Tunes
description: The office's shared jukebox. Dark, quiet walls; the music and the people who queued it carry the colour.
colors:
  label: "rgba(246, 247, 255, 0.93)"
  tint: "rgb(150, 158, 255)"
  after-hours-navy: "#12131f"
  raised-navy: "#1b1d2e"
  wall: "rgba(150, 158, 255, 0.06)"
  wall-lit: "rgba(150, 158, 255, 0.085)"
  tint-fill: "rgba(150, 158, 255, 0.09)"
  tint-chip: "rgba(150, 158, 255, 0.16)"
  separator: "rgba(150, 158, 255, 0.1)"
  border: "rgba(150, 158, 255, 0.13)"
  border-strong: "rgba(150, 158, 255, 0.24)"
  frosted-navy: "rgba(22, 23, 38, 0.62)"
  label-secondary: "rgba(222, 226, 250, 0.62)"
  label-tertiary: "rgba(224, 228, 252, 0.64)"
  title-rest: "rgba(255, 255, 255, 0.84)"
  on-art: "#ffffff"
  on-art-secondary: "rgba(255, 255, 255, 0.75)"
  caption-scrim: "rgba(0, 0, 0, 0.74)"
  danger: "rgb(248, 113, 113)"
typography:
  display:
    fontFamily: "Manrope Variable, -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "96px" # max of clamp(44px, 6cqw, 96px); the lint format has no fluid sizes
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Manrope Variable, -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "2.2em"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title-feature:
    fontFamily: "Manrope Variable, -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "1.9em"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Manrope Variable, -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "1.6em"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title-caption:
    fontFamily: "Manrope Variable, -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "1.5em"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Manrope Variable, -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "1.07em"
    fontWeight: 500
  body-prose:
    fontFamily: "Manrope Variable, -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "0.95em"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Manrope Variable, -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "0.93em"
    fontWeight: 500
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  row: "0.65em"
  thumb: "0.6em"
  tile: "0.9em"
  art-card: "1em"
  card: "1.2em"
  pill: "2em"
  shell: "22px"
  round: "9999px" # a circle: --r-round is 50%
spacing:
  page-base: "clamp(14px, calc(0.45vw + 8.2px), 16px)"
  gutter: "28px"
  band: "1.4em"
  card-pad: "1.5em"
  featured-pad: "1.7em"
  head-gap: "1.1em"
  row-gap: "0.9em"
  row-pad: "0.45em 0.6em"
components:
  button-pill:
    backgroundColor: "{colors.label}"
    textColor: "{colors.after-hours-navy}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.55em 1.1em"
  button-pill-ghost:
    backgroundColor: "rgba(150, 158, 255, 0.12)"
    textColor: "{colors.label}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.55em 1.1em"
  button-pill-ghost-hover:
    backgroundColor: "rgba(150, 158, 255, 0.22)"
  button-pill-danger:
    backgroundColor: "rgba(248, 113, 113, 0.16)"
    textColor: "{colors.danger}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.55em 1.1em"
  button-pill-danger-hover:
    backgroundColor: "rgba(248, 113, 113, 0.28)"
  button-add-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.label-tertiary}"
    rounded: "{rounded.round}"
    size: "2.2em"
  button-add-quiet-hover:
    backgroundColor: "{colors.tint-fill}"
    textColor: "{colors.label}"
  card-section:
    backgroundColor: "{colors.wall}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-pad}"
  card-featured:
    backgroundColor: "{colors.wall-lit}"
    rounded: "{rounded.card}"
    padding: "{spacing.featured-pad}"
  card-art:
    backgroundColor: "{colors.raised-navy}"
    textColor: "{colors.on-art}"
    rounded: "{rounded.art-card}"
  track-row:
    backgroundColor: "transparent"
    textColor: "{colors.title-rest}"
    rounded: "{rounded.row}"
    padding: "{spacing.row-pad}"
  track-row-hover:
    backgroundColor: "{colors.tint-fill}"
    textColor: "{colors.on-art}"
  chip-queued-by:
    backgroundColor: "{colors.tint-chip}"
    textColor: "{colors.label-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.2em 0.7em 0.2em 0.2em"
  chip-office:
    backgroundColor: "{colors.tint-chip}"
    textColor: "{colors.label-secondary}"
    rounded: "{rounded.pill}"
    padding: "0.2em 0.8em"
  chip-tier:
    backgroundColor: "{colors.tint-chip}"
    textColor: "{colors.label-secondary}"
    rounded: "{rounded.pill}"
    padding: "0.2em 0.8em"
  chip-tier-provisional:
    backgroundColor: "{colors.wall}"
    textColor: "{colors.label-tertiary}"
  dialog:
    backgroundColor: "{colors.raised-navy}"
    textColor: "{colors.label}"
    rounded: "{rounded.card}"
    width: "36em"
  dialog-input:
    backgroundColor: "{colors.tint-fill}"
    textColor: "{colors.label}"
    rounded: "{rounded.row}"
    padding: "0.65em 0.85em"
  nav-pill:
    backgroundColor: "{colors.frosted-navy}"
    textColor: "{colors.label}"
    rounded: "{rounded.shell}"
    height: "44px"
---


# Design System: True Tunes

## Overview

**Creative North Star: "After-Hours Gallery"**

True Tunes is a gallery after closing time: dark, quiet walls with album art and artist portraits hung like prints, each with its own caption. The walls are a deep, desaturated navy. Content sits on soft tonal panels a few percent lighter than the ground, never framed or outlined. Colour comes from the work on the walls. The current artwork is blurred into an ambient layer behind the whole app, and the dominant colour of a hero image washes into the card that holds it. The shell (nav pill, player bar, queue sidebar) is frosted glass floating over that layer, so the room takes on the colour of what's playing.

The benchmark is the Apple Music macOS app played straight: no themed or novelty worlds, and the office character lives in people and attribution (who queued what, how often the room has queued it), not in decoration. Type is one family, Manrope, set in sentence case with tight negative tracking on large sizes. Pages size everything in `em` from one fluid base, so the whole page scales from a 1280px laptop to a 3440px ultrawide without breakpoints jumping. Density is relaxed: generous rows, large artwork, nothing cramped.

Every surface now speaks this language: Home, Artist, Album, Playlist, Search, Discover, Leaderboard, Profile, Queuedle, Lyrics, Container, the mini player, skinny mode and the dialogs. The shared primitives live in `components/common/` (see its README) and are the way in: build new surfaces from them rather than from one page's local styles.

**Key Characteristics:**
- One navy tint. Every tonal surface, fill and hairline is `--tint` at a low alpha.
- Borderless tonal cards on a tinted ground; artwork is the only thing that casts a shadow inside the content area.
- Full-bleed image cards with a bottom scrim and a white caption, like a print and its label.
- Accent colour is sampled from the artwork at runtime, never fixed.
- Frosted shell materials over a blurred ambient copy of the current art, with solid fallbacks under reduced transparency.
- Fluid `em` scaling from one base size; Manrope throughout.

## Colors

A near-monochrome navy room whose only saturated colour is borrowed, at runtime, from the artwork on its walls.

### Primary
- **Gallery Light** (`label`): the primary action colour. The pill button inverts the room, with a light label as its fill and After-Hours Navy text. It's also the default text colour. There is no fixed brand hue.

### Neutral
- **Periwinkle Tint** (`tint`): never painted at full strength. It's the source triplet (`--tint: 150, 158, 255`) that every tonal token is mixed from at 6–24% alpha. On a #12131f ground it reads as a cool navy lift, not as purple.
- **After-Hours Navy** (`after-hours-navy`): the window and shell ground (`--bg`). It's also the text colour on the inverted pill button.
- **Raised Navy** (`raised-navy`): the solid placeholder behind every artwork box while it loads, the Dialog surface, and the reduced-transparency fallback for the frosted materials.
- **Wall** (`wall`): the resting fill of section cards, person cards and the lyrics box (`--surface`), and the provisional tier chip.
- **Lit Wall** (`wall-lit`): the featured cards (Picks, Now Playing, the detail-page HeroBand, a Top result without art) and the lyrics box on hover (`--surface-hi`).
- **Tint Fill** (`tint-fill`): row hover, quiet icon-button hover, face-pill hover, the open menu item and the dialog field (`--bg-2` / `--row-hover`).
- **Tint Chip** (`tint-chip`): the queued-by, office and tier chips.
- **Separator** (`separator`): the 1px edge on the frosted shell pills, the context menu, the queue sidebar's left edge and the mini player's inset edge. It isn't used on content cards.
- **Border / Strong Border** (`border`, `border-strong`): the one remaining control stroke, the artist page's shelf search, at rest and on focus.
- **Frosted Navy** (`frosted-navy`): the nav pill, player bar, queue sidebar, context menu and toast material (`--material-bg`), always paired with `--material-filter` (`blur(30px) saturate(1.8)`).
- **Label scale** (`label`, `label-secondary`, `label-tertiary`): primary text, secondary meta, tertiary meta and subtitles. `label-tertiary` (`--text-3`) carries real subtitles on cards and washes, so it is held at 4.5:1 or better there.
- **Title at rest** (`title-rest`): track, chart and album titles at rest. They brighten to On-Art White on row or tile hover.
- **On-Art White / On-Art Secondary** (`on-art`, `on-art-secondary`): text over imagery, always on a scrim, with a soft black text shadow on the larger lines.
- **Caption Scrim** (`caption-scrim`): the darkest stop of the image-card scrim (`--scrim-art`). Tiles and heroes that need more weight under the text use the deeper, bottom-only `--scrim-deep` (0.86 → 0.4 → 0 by 68%).

### Status
- **Danger** (`danger`, `--danger: 248, 113, 113`): destructive actions (Clear, Delete), errors and Queuedle's wrong answers. A triplet like `--tint`, used tonally (a 0.16 fill under full-strength text), never as a slab.
- **Success** (`--success: 74, 222, 128`): the success toast's status dot, and the tonal Update button in the title bar (a 0.16 fill under full-strength green text) when a new version is ready. A triplet, never a slab.
- **Attention** (`--attention: 251, 146, 60`): the tonal Poll button in the title bar (0.16 fill under full-strength orange text, with the shaking ballot icon), when a poll is waiting for an answer. A triplet, used only there.
- **Danger solid** (`--danger-solid: 220, 50, 50`): the one solid slab, the error banner, because white text needs more contrast than tonal Danger gives.
- **Right mint** (`--right: 128, 214, 166`): local to Queuedle (its panel and its portalled calendar), for right answers and played days. It is not a global token, and no other surface uses it.

### Runtime accent (artwork-derived)
The accent isn't a token. `useDominantColor` samples the artwork and passes an `r, g, b` triplet in as `--wash` (Picks, Now Playing, HeroBand, the artist and Profile heroes, the mini player and skinny cards), as an inline gradient on person-card headers, as `--panel-color` on the shell body, and as a tint on the player bar. Washes fall back to the tint triplet when no colour is available, except the artist hero, which shows no wash without one.

Generated colours keep the same restraint: user avatars and playlist placeholder art are hashed onto hues 0–250° and 330–360°, skipping the 250–330° violets, at 20–30% lightness so a white initial holds 4.5:1.

### Named Rules
**The One Tint Rule.** Every tonal surface, fill, separator and border is `rgba(var(--tint), α)`. To retune the room, change `--tint`; never introduce a second hue for chrome.

**The Artwork Carries Colour Rule.** Saturated colour enters only from artwork: the ambient backdrop, the `--wash` radial on featured cards and heroes, the person-header gradient, the player-bar tint. Chrome stays navy and white. Danger, Queuedle's mint, and the title bar's green Update and orange Poll buttons are status, not decoration, and are always tonal.

**The Quiet Wall Rule.** Tint stays subtle and desaturated. Surfaces sit 6–9% tint over the ground. A wash peaks at 0.3 alpha, with stacked layers counted together (the artist hero's 0.24 radial plus its 0.08 fall-off), and fades to transparent by about 65%. No purple, no neon, no glow.

**The No Violet Rule.** Generated colours (avatars, playlist art) never land on 250–330°. Fold the hue past that band rather than clamping to its edge.

## Typography

**Display Font:** Manrope Variable (with -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif)
**Body Font:** Manrope Variable (same stack)

**Character:** One geometric-humanist sans used across the whole hierarchy. Weight and negative tracking do the work that a second family would: 600 for titles, 800 only for the name a hero is about.

### Hierarchy
Page sizes are in `em` from the page base `clamp(14px, calc(0.45vw + 8.2px), 16px)` (14px at 1280 wide, 16px from about 1730px up). Hero display sizes follow the page container (`cqw`), not the viewport.
- **Display** (`--fs-display`, 800, `clamp(44px, 6cqw, 96px)`, 1.04, -0.03em): the artist name over the hero, clamped to 2 lines. A shared credit past 28 characters steps down to `clamp(30px, 3.4cqw, 56px)` (`--fs-display-sm`). The Profile name uses the same voice at `clamp(40px, 5.2cqw, 88px)` (`--fs-display-profile`). Nothing else.
- **Headline** (`--fs-headline`, 600, 2.2em, 1.15, -0.01em): the Home greeting.
- **Title, feature** (`--fs-title-feature`, 600, 1.9em, 1.15, -0.02em): the Now Playing and HeroBand titles (2 lines) and the Top result title (3 lines).
- **Title** (`--fs-title`, 600, 1.6em, 1.2, -0.015em): section and shelf titles. Dialog titles sit at 1.3em (`--fs-title-dialog`), balanced.
- **Title, caption** (`--fs-title-caption`, 600, 1.5em; 1.15em on medium cards, `--fs-title-card`; -0.01em): the title line under an image-card scrim.
- **Body** (`--fs-body`, 500 title / 400 artist, 1.07em): track and chart rows, hero sub-lines and the Profile facts line.
- **Body, prose** (`--fs-prose`, 400, 0.95em, 1.55, max 100ch): the Genius "about" text, clamped to 4 lines. Dialog notes cap at 62ch.
- **Label** (`--fs-label`, 500, 0.93em): chips, small buttons and secondary lines. The smaller step is `--fs-small`, `max(13px, 0.86em)`.
- **Fixed-px surfaces** (queue sidebar, skinny, mini player): `--fs-px` 13px for meta, `--fs-px-lg` 14px for row text, `--fs-px-title` 16px for titles.

Every font size in the CSS is one of these tokens, enforced by Stylelint. Glyph, numeral and icon sizes have tokens too: `--fs-glyph-sm` 2em, `--fs-glyph-md` 2.4em, `--fs-glyph` 3em and `--fs-glyph-lg` 4em (empty-art glyphs, rank numerals), `--fs-stat` 4.6em (the Queuedle score), `--fs-avatar-initial` and `--fs-rename` (the Profile avatar initial and rename field), `--fs-lyric` and `--fs-lyric-plain` (lyric lines), `--fs-icon` 18px and `--fs-icon-sm` 16px (icon glyphs).

### Named Rules
**The Sentence Case Rule.** Titles, captions, buttons and chips are sentence case. Hierarchy comes from size, weight 600 and negative tracking, not from capitals or a second face. Server strings in title case (tier names) are sentence-cased in CSS.

**The 13px Floor Rule.** No content text renders below 13px at any window width. 0.93em is the smallest plain `em` step that holds 13px at the 14px base; anything smaller is written `max(13px, Xem)`. Tabular numerals (`font-variant-numeric: tabular-nums`) are used for ranks, play counts, facts and times.

## Layout

Pages scroll inside a panel padded 28px left and right, clearing the floating nav (`--nav-h` 64px) at the top and the floating player (`--player-h` 112px) at the bottom. Page roots carry `.page-scale` and are CSS containers (`container-type: inline-size`). They respond with `@container` queries at 1100px and 700px rather than viewport breakpoints. Home caps at 2400px wide, centred.

- **Bands:** 1.4em between every band and column, horizontally and vertically, so the rhythm is one value.
- **Grids:** asymmetric fr grids. Picks are 1.7fr / 1fr / 1fr (1.3 / 1 / 1 under 1100px, then 2 columns with the large card spanning). Now Playing / Lyrics is 1.35fr / 1fr. Trending / right column is 1.15fr / 1fr. Below 1100px these stack to one column.
- **Auto-fill grids** for repeated tiles: Jump back in uses `minmax(8.5em, 1fr)`; people use `minmax(min(100%, 22em), 1fr)`.
- **Inside cards:** 1.1em under a section head, 0.9em between row items, row padding 0.45em × 0.6em.
- **Heroes:** the artist and Profile heroes run up behind the floating nav and fade into the page with no edge. The artist hero is one fixed shape, `clamp(340px, 42cqw, 580px)` high, in every state, so nothing jumps while the photo settles. Its text sits bottom left, clear of where a print would hang. Bands after a hero keep the 28px gutter and the 1.4em rhythm.
- **Skinny mode:** the queue fills the window height and a Now Playing card docks at the bottom, laid out in one row once the window is 640px wide. There's no nav.
- **Mini player:** a fixed 340 × 116px always-on-top window. The art fills the left edge; the label carries title, artist, queuer and time left.

## Elevation & Depth

Depth comes from three layers, not from shadows on content. At the back is a single, heavily blurred copy of the current artwork (`blur(120px) saturate(1.4) brightness(0.8)` at 0.22 opacity, 1s crossfade), fixed behind the whole app, skinny mode included. On top of that sits the navy ground with tonal cards a few percent lighter. Frosted shell materials and modals float above everything. Content cards are flat. Shadows appear only on artwork and on floating surfaces.

### Shadow Vocabulary
- **Art rest** (`--art-shadow`: `0 2px 8px rgba(0, 0, 0, 0.35)`): shelf artwork at rest, paired with the inner keyline `inset 0 0 0 1px rgba(255,255,255,.06)` (`--art-keyline`) drawn by the art box's `::after`.
- **Art lifted** (`--art-lift-shadow`: `0 8px 18px rgba(0, 0, 0, 0.4)`): album and jump tiles on hover or focus, with a 2px rise.
- **Hero art** (`--hero-shadow`: `0 10px 28px rgba(0, 0, 0, 0.35)`; hover `--hero-lift-shadow`: `0 14px 34px rgba(0,0,0,.45)`): the Now Playing and HeroBand artwork, the artist hero's print and the Profile face.
- **Floating** (`--float-shadow`: `0 8px 32px rgba(0, 0, 0, 0.5)` plus the `--material-edge` highlight): nav pill, history and window pills, player bar, their dropdowns, the context menu, toasts and the Dialog. The Dialog's backdrop is `--overlay` (`rgba(0,0,0,.55)`), the same dim used over art and on dark corner buttons. White text over art takes `--text-shadow` (`0 1px 6px`) or, on larger lines, `--text-shadow-lg` (`0 1px 12px`); an avatar's hover ring is `--face-ring`.

Black and white appear in the CSS only as the alpha tokens declared in `global.css`: `--overlay`, `--overlay-strong`, `--well`, `--glass`, `--glass-hi`, `--glass-faint` and `--track`. Stylelint (`npm run lint:css`, config in `stylelint.config.mjs`) fails on a raw colour, radius, font size or shadow colour anywhere else, and CI runs it.

### Named Rules
**The Shadows Belong to Prints Rule.** Inside the content area only artwork casts a shadow. Cards, rows and chips are flat tonal fills.

**The Frosted Shell Rule.** Nav, player, queue sidebar, context menu and toasts use the material tokens (`--material-bg` + `--material-filter: blur(30px) saturate(1.8)`). Under `prefers-reduced-transparency` they fall back to solid Raised Navy and the ambient layer is hidden. Don't hand-roll a second glass recipe. The mini player is the one opaque shell, because its window is transparent and frost has nothing to sample: Lit Wall over navy with the wash, and an inset edge only.

## Shapes

Generously rounded, never sharp. Radii scale with the type in `em`: cards and dialogs 1.2em (`--r-card`), image cards 1em (`--r-art-card`), tiles, prints and menus 0.9em (`--r-tile`), album art 0.7em (`--r-art`), rows and fields 0.65em (`--r-row`), row thumbnails 0.6em (`--r-thumb`), skeleton lines and small chips 0.4em (`--r-xs`). Fixed-px surfaces use the global scale (`--r-sm` 6px, `--r-md` 10px, `--r-lg` 16px): the skinny Now Playing card and the mini player window are 16px. Floating shell pills are 22px (`--r-shell`, half their 44px height). Buttons and chips that carry a label are full pills (`--r-pill`, 2em), as are thin bars. Icon buttons, avatars, the Profile face and artist portraits are circles (`--r-round`, 50%). Every `border-radius` in the CSS is one of these. Imagery is always clipped to its container's radius with `object-fit: cover`. Large photo cards set `object-position: center 25%` to keep faces in frame; the artist hero goes further and crops around the faces it finds (see Components).

**The No-Outline Rule.** Content cards, rows, chips, tiles and fields have no border. Separation comes from a tonal step (Wall on navy), not from a line. The only 1px strokes are the frosted shell's separator edge, the artwork's inner keyline, and the shelf search box.

## Components

### Buttons
- **Pill (PillButton):** sentence case, weight 600 at 0.92em, padding 0.55em × 1.1em on a full pill. *Primary* is the room inverted (Gallery Light fill, After-Hours Navy text, hover to 0.78 opacity), one per view. *Ghost* is tonal (tint 0.12, hover 0.22) for secondary actions. *Danger* is tonal red (0.16, hover 0.28) for destructive ones. Disabled drops to 0.4.
- **Add (AddButton):** the one + button, borderless, and its click never bubbles. *Quiet* is a 2.2em circle in tertiary label colour, revealed when its row is hovered or focused within, filling with Tint Fill on hover. *Art* is a 2.6em translucent white circle on image cards. *Corner* is a dark circle on album and tile corners, revealed on hover. The parent owns position and reveal.
- **Text link ("See all", TitleButton, ArtistLinks):** no chrome. Secondary label colour, which turns full label with an underline on hover or focus.
- **Focus (all):** one global ring, `outline: 2px solid var(--text-2); outline-offset: 2px`. Over art that may be pale (Top result) the ring sits inside, in white with a black edge.

### Chips
- **Queued-by chip (QueuerChip):** Tint Chip fill with a 10px backdrop blur, a full pill, and a 1.9em round avatar at the leading edge. Hover moves to Tint Fill with white text. It opens the person; the page owns its position.
- **Office chip (OfficeChip):** "Queued here N times" ("once" for one), a quiet Tint Chip pill in secondary label with tabular numerals. It renders nothing below one, so it shows only when the room has queued this before. It sits under the artist name and on the Top result.
- **Tier chip:** the Queuedle tier on Leaderboard, Profile and Queuedle, in the same Tint Chip recipe, sentence-cased from the server's title case. Provisional tiers step back to Wall and tertiary label. It replaces the raster tier badges.
- **Face pill:** a borderless avatar and name; hover adds a Tint Fill pill and a 2px `rgba(255,255,255,.55)` ring on the avatar. Leaderboard places 7–10 use it.

### Cards / Containers
- **Corner Style:** 1.2em (section and featured cards), 1em (person cards, image cards).
- **Background:** Wall at rest, Lit Wall for featured. The featured cards add a radial `--wash` from the top-left corner (Picks: `120% 110% at 15% 0%`, 0.26 alpha, fading by 62%; Now Playing and HeroBand: `120% 150% at 0% 0%`, 0.3, by 65%).
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** none.
- **Internal Padding:** 1.5em (section), 1.7em (featured), 1.4em (Now Playing, HeroBand), 0.9em (person).
- **SectionCard** is the shared card (`featured` for the lit wall and wash). **PersonCard** is avatar, name and caption, with the photo's colour washed across the header (`100deg`, 0.3, gone by 75%).
- **HeroBand:** the Album and Playlist header in the Now Playing language: 16em hero art (12.5em under 1100px, stacked under 700px) beside a feature title, on Lit Wall with the wash.

### Image card (signature)
A print with its label (ArtCard). The artwork fills the card edge to edge (`object-fit: cover`). A two-part scrim, `rgba(0,0,0,.4)` fading over the top 22% and `rgba(0,0,0,.74) → .26 → 0` up from the bottom by 70%, keeps a sentence-case top-left caption and a bottom-left title and artist legible in white. The whole card is one button. Artist links and the add button sit above it. Hover or focus-within scales the image to 1.03 and dims it to `brightness(.88)` over 0.15s.

**Top result (TopResultCard)** is the same print at feature scale, for Search. The art or artist photo fills a 1.2em card (at least 20em high, 4:3 when stacked), and the title (3 lines), meta, pills and office chip sit bottom left on a scrim of their own (0.82 → 0 up the text block), so the text holds on pale covers. With no art it falls back to Lit Wall and the tint wash.

### Artist hero (signature)
One shape for every artist. With a photo, it runs full-bleed behind the nav under a light top scrim and `--scrim-deep`, masked out by the foot. The crop follows the faces: MediaPipe BlazeFace (full range, CPU, bundled offline and warmed at idle start-up) finds them, falling back to a detail-energy band, then `center 25%`. The photo waits at most 300ms for its crop and eases to a later one rather than jumping. Without a photo, the cover hangs as a print on the right (0.9em radius, hero-art shadow, keyline) over its own colour wash. The name, alternative names, OfficeChip and the Artist radio / Shuffle pills sit bottom left in every state.

### Profile hero
The artist hero's language for a person: the face as a round print (`clamp(132px, 14cqw, 232px)`, hero-art shadow) with its colour washed in from behind it (peaking at 0.28, gone by the foot), the name in display type, a tabular facts line ("1,937 plays · 72 this week · 2nd most active") and tonal chips for office presence and tier.

### Track and chart rows
Borderless rows (TrackRow, ChartRow) with a 0.65em radius and 3.2em rounded thumbnails. The title is at Title-at-rest white (500) and the artist in tertiary label on the same line. Hover or focus-within fills the row with Tint Fill, brightens the title to white and reveals the quiet add button. Chart rows are a fixed grid (rank · title · artist · plays · add) with zero-padded tabular ranks and counts, and optional ChartHead column labels on the same grid.

### Album and jump tiles
Square art (ImageTile, 0.7–0.9em radius, or a circle for artists) over a two-line caption: title in Title-at-rest, sub in tertiary label. Hover or focus rises the tile 2px and gives the art the Art-lifted shadow.

### Now Playing card
Lit Wall with the artwork wash, 16em hero artwork (12.5em under 1100px), feature title, artist meta, a thin progress bar (0.32em, `rgba(255,255,255,.14)` track and `.85` fill) with tabular times, and the queued-by chip. Its sibling, the live lyrics box, is a Wall card that masks lyrics top and bottom with a gradient. The active line grows to 1.45em in white and the rest sit at full label. The Lyrics page is this band at full size: the art grows with the window, and a solo layout replaces an empty lyrics card.

**Skinny Now Playing card:** the same card in px (16px radius, 10px art radius, 16px title, 13px meta), with the queued-by chip and the transport, docked under the queue.

### Mini player
The print and its label in miniature. The art fills the left edge, and the transport sits over it on `rgba(0,0,0,.5)`, shown whenever the pointer is anywhere on the window, on keyboard focus, and always while paused. That leaves the label's full width for title, artist, queuer and time left.

### Dialog
One modal (`common/Dialog`): a native `<dialog>` opened with `showModal()`, so the page behind is inert, Tab stays inside, Esc closes it and focus returns to the opener. Raised Navy, 1.2em radius, the Floating shadow, widths of 26, 36 or 64em. The sentence-case title names the dialog, beside a 2.2em round close button. The action row is right-aligned: secondary actions first, the primary or danger pill last. An outside click closes it, except in a form dialog, so a stray click can't lose typed text.

### Context menu
A real `role=menu` of `menuitem` buttons on the frosted material (0.9em radius, separator edge, Floating shadow), with drawn icons, arrow-key movement and Tint Fill on the open item. Submenus stay on screen. Enter straight after a right-click can't queue anything.

### Toast
The frosted material with a status dot and an optional action, such as Undo after "Queue all".

### Inputs / Fields
- **Dialog field:** a borderless tonal field (Tint Fill, hover tint 0.12, 0.65em radius, padding 0.65em × 0.85em) under a secondary-label label. Focus shows the global ring. Placeholders are tertiary label; errors are Danger text.
- **Shelf search:** the artist page's shelf filter is a 26px pill with a `border` stroke on a `rgba(255,255,255,.05)` fill. Focus steps the stroke to `border-strong`.

### Navigation
Floating frosted pills (44px high, 22px radius) centred at the top of the window, offset by the docked queue width, which is recalculated on every resize so the shell never slides under the queue. Icon buttons inside are borderless, at 0.6 white. Hover brightens them to white on a `rgba(255,255,255,.08)` fill. The player bar is the same material, centred 24px above the bottom, with the playing track's dominant colour washed in from the left.

### Loading
Skeletons (the global `.skeleton` class: tint at 0.18, pulsing between 0.45 and 1 opacity over 1.4s) sit at the exact size and pitch of the content they replace (lyric lines at the real line pitch, tiles at tile size), so nothing shifts on load. They hold still at 0.7 under `prefers-reduced-motion`. When results refresh (search as you type, a new Discover room), the previous content stays on screen until the new content arrives.

### Named Rules
**The Shared Queue Rule.** Nothing can replace the shared queue. Every control adds to it; no button, menu item or one-click + sends a replace.

**The Stations Open Rule.** Stations open, never add. A station opens as its track list, where songs are added one at a time; it never carries a +.

**The Not By Colour Alone Rule.** Status colour is always paired with a mark or a word: right and wrong carry a tick or cross, and played days a tick.

## Token Index

Every custom property declared in `global.css` or `depth.css` is named in this file, and `__tests__/designSync.test.ts` fails when the two drift. The ones not described above:

- **Colour aliases:** `--bg-1` (Raised Navy), `--label` and `--text` (Gallery Light), `--label-2` (secondary label), `--title-rest`, `--on-art`, `--on-art-2`, `--separator`, `--border` and `--border-2` are the CSS names of the colours in the front matter.
- **Chart colours:** `--series-1`, `--series-2`, `--series-3`, `--series-4`, `--series-5`, `--series-6`, `--series-7` and `--series-8` are the categorical series colours in the stats charts (the first three are the colour-blind-safe trio), and `--ramp-lo` and `--ramp-hi` the ends of the sequential ramp in the heatmaps.
- **Scrims:** `--scrim-top` is the light top fade on image cards and heroes, `--scrim-text` the fade under the Top result's text block.
- **Sizing and rhythm:** `--page-scale` is the fluid page base, `--card-size` the width of shelf cards.
- **Motion:** `--dur` and `--ease` for state changes, `--dur-fast` and `--ease-fast` for hover and focus feedback.
- **Focus ring:** `--focus-width` and `--focus-color`.

## Do's and Don'ts

### Do:
- **Do** derive every chrome colour from `--tint` at low alpha (Wall 0.06, Lit Wall 0.085, Tint Fill 0.09, Tint Chip 0.16).
- **Do** let artwork bring the colour: pass the dominant colour in as `--wash`, cap it at 0.3 and fade it to transparent by about 65%.
- **Do** size new surfaces in `em` from the fluid page base and respond with `@container` queries.
- **Do** caption imagery with white text over a scrim, never on bare artwork.
- **Do** reveal secondary actions (add buttons) on hover or `:focus-within`, and let every interactive element take the global focus ring.
- **Do** use the material tokens for anything floating over content, and keep the reduced-transparency fallback.
- **Do** use the shared Dialog for every modal, with the primary or destructive action last.
- **Do** honour `prefers-reduced-motion`: stop skeleton pulses and image, hero or lyric transitions.

### Don't:
- **Don't** use purple, neon or glow, and keep generated hues off 250–330°.
- **Don't** set text below 13px or build cramped, dense rows. No sub-13px metadata.
- **Don't** outline cards, rows, tiles or fields. Separate with a tonal step.
- **Don't** put shadows on content cards. Only artwork and floating surfaces cast them.
- **Don't** introduce a fixed brand accent or a second chrome hue. Queuedle's mint stays in Queuedle.
- **Don't** use uppercase tracked eyebrows above titles. Hierarchy comes from size and weight.
- **Don't** use raster badges with text baked in. A tier is a tonal chip.
- **Don't** put a + on a station, or build any control that replaces the shared queue.
