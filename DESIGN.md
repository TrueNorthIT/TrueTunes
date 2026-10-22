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
  label-tertiary: "rgba(222, 226, 250, 0.52)"
  label-disabled: "rgba(222, 226, 250, 0.32)"
  title-rest: "rgba(255, 255, 255, 0.84)"
  on-art: "#ffffff"
  on-art-secondary: "rgba(255, 255, 255, 0.75)"
  caption-scrim: "rgba(0, 0, 0, 0.74)"
typography:
  display:
    fontFamily: "Manrope Variable, -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "clamp(48px, 6vw, 96px)"
    fontWeight: 800
    lineHeight: 1
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
  round: "50%"
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

The benchmark is the Apple Music macOS app played straight: no themed or novelty worlds, and the office character lives in people and attribution (who queued what), not in decoration. Type is one family, Manrope, set in sentence case with tight negative tracking on large sizes. Home sizes everything in `em` from one fluid base, so the whole page scales from a 1280px laptop to a 3440px ultrawide without breakpoints jumping. Density is relaxed: generous rows, large artwork, nothing cramped.

This document records the Home and artist page language as *the* system. Older surfaces (Leaderboard, Queuedle, Profile, the dialogs, Discover) predate it and haven't been migrated yet. When you touch one, bring it into this language rather than copying its local styles. The shared primitives in `components/common/` (Carousel, MediaCard, MediaRow) also still carry the older px-based scale and bordered buttons; see Components.

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
- **After-Hours Navy** (`after-hours-navy`): the window and shell ground (`--bg`, `--window-bg`). It's also the text colour on the inverted pill button.
- **Raised Navy** (`raised-navy`): the solid placeholder behind every artwork box while it loads, plus solid dropdown menus and the reduced-transparency fallback for the frosted materials.
- **Wall** (`wall`): the resting fill of section cards, person cards and the lyrics box (`--surface` on Home).
- **Lit Wall** (`wall-lit`): the featured cards (Picks, Now Playing) and the lyrics box on hover (`--surface-hi`).
- **Tint Fill** (`tint-fill`): row hover, quiet icon-button hover, face-pill hover (`--bg-2` / `--row-hover`).
- **Tint Chip** (`tint-chip`): the queued-by chip, with a 10px backdrop blur.
- **Separator** (`separator`): the 1px edge on the frosted shell pills and the queue sidebar's left edge. It isn't used on content cards.
- **Border / Strong Border** (`border`, `border-strong`): input and control strokes (the shelf search box at rest and focus, carousel arrows).
- **Frosted Navy** (`frosted-navy`): the nav pill, player bar and queue sidebar material (`--material-bg`, `--sidebar-bg`), always paired with `blur(30px) saturate(1.8)`.
- **Label scale** (`label`, `label-secondary`, `label-tertiary`, `label-disabled`): primary text, secondary meta, tertiary meta and subtitles, disabled or placeholder only. `label-tertiary` stays at .52 alpha because it carries real subtitles. `label-disabled` is below 4.5:1 and must not carry content.
- **Title at rest** (`title-rest`): track, chart and album titles at rest. They brighten to On-Art White on row or tile hover.
- **On-Art White / On-Art Secondary** (`on-art`, `on-art-secondary`): captions over imagery, with a `0 1px 6px rgba(0,0,0,.5)` text shadow on the label line.
- **Caption Scrim** (`caption-scrim`): the darkest stop of the image-card scrim (see Components).

### Runtime accent (artwork-derived)
The accent isn't a token. `useDominantColor` samples the artwork and passes an `r, g, b` triplet in as `--wash` (Picks hero, Now Playing card), as an inline gradient on person-card headers, as `--panel-color` on the shell body, and as a tint on the player bar. Washes run at 0.18–0.32 alpha and fall back to the tint triplet when no colour is available.

### Named Rules
**The One Tint Rule.** Every tonal surface, fill, separator and border is `rgba(var(--tint), α)`. To retune the room, change `--tint`; never introduce a second hue for chrome.

**The Artwork Carries Colour Rule.** Saturated colour enters only from artwork: the ambient backdrop, the `--wash` radial on featured cards, the person-header gradient, the player-bar tint. Chrome stays navy and white.

**The Quiet Wall Rule.** Tint stays subtle and desaturated. Surfaces sit 6–9% tint over the ground, and washes peak at about 0.3 alpha and fade to transparent by about 65%. No purple, no neon, no glow.

## Typography

**Display Font:** Manrope Variable (with -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif)
**Body Font:** Manrope Variable (same stack)

**Character:** One geometric-humanist sans used across the whole hierarchy. Weight and negative tracking do the work that a second family would: 600 for titles, 800 only for the artist name.

### Hierarchy
Home sizes are in `em` from the page base `clamp(14px, calc(0.45vw + 8.2px), 16px)` (14px at 1280 wide, 16px from about 1730px up).
- **Display** (800, `clamp(48px, 6vw, 96px)`, 1, -0.03em): the artist name over the hero photo. Nothing else.
- **Headline** (600, 2.2em, 1.15, -0.01em): the Home greeting.
- **Title, feature** (600, 1.9em, 1.15, -0.02em): the Now Playing track title, clamped to 2 lines.
- **Title** (600, 1.6em, 1.2, -0.015em): section titles. Carousel shelf titles on Home are overridden to match.
- **Title, caption** (600, 1.5em; 1.15em on medium cards; -0.01em): the title line under an image-card scrim.
- **Body** (500 title / 400 artist, 1.07em): track and chart rows. Title and artist sit on one line.
- **Body, prose** (400, 0.95em, 1.55, max 100ch): the Genius "about" text, clamped to 4 lines.
- **Label** (500, 0.93em): chips, small buttons and secondary lines. 0.93em is the smallest step that holds 13px at the 14px base.

### Named Rules
**The Sentence Case Rule.** Titles, captions and buttons are sentence case. Hierarchy comes from size, weight 600 and negative tracking, not from capitals or a second face.

**The 13px Floor Rule.** No content text renders below 13px at any window width. In `em` terms that means nothing below 0.93em of the Home base. Tabular numerals (`font-variant-numeric: tabular-nums`) are used for ranks, play counts and times.

## Layout

Pages scroll inside a panel padded 28px left and right, clearing the floating nav (`--nav-h` 64px + 16px) at the top and the floating player (`--player-h` 112px + 24px) at the bottom. Home caps at 2400px wide, centred, and is a CSS container (`container-type: inline-size`). It responds with `@container` queries at 1100px and 700px rather than viewport breakpoints.

- **Bands:** 1.4em between every band and column, horizontally and vertically, so the rhythm is one value.
- **Grids:** asymmetric fr grids. Picks are 1.7fr / 1fr / 1fr (1.3 / 1 / 1 under 1100px, then 2 columns with the large card spanning). Now Playing / Lyrics is 1.35fr / 1fr. Trending / right column is 1.15fr / 1fr. Below 1100px these stack to one column.
- **Auto-fill grids** for repeated tiles: Jump back in uses `minmax(8.5em, 1fr)`; people use `minmax(min(100%, 22em), 1fr)`.
- **Inside cards:** 1.1em under a section head, 0.9em between row items, row padding 0.45em × 0.6em.
- **Artist page:** full-bleed hero at `clamp(320px, 45vh, 560px)`, then 28px-gutter shelves (Carousel rows) with 24px between shelves.

## Elevation & Depth

Depth comes from three layers, not from shadows on content. At the back is a single, heavily blurred copy of the current artwork (`blur(120px) saturate(1.4) brightness(0.8)` at 0.22 opacity, 1s crossfade), fixed behind the whole app. On top of that sits the navy ground with tonal cards a few percent lighter. Frosted shell materials float above everything. Content cards are flat. Shadows appear only on artwork and on the floating shell.

### Shadow Vocabulary
- **Art rest** (`box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35)`, `--art-shadow`): shelf artwork at rest, paired with the inner keyline `inset 0 0 0 1px rgba(255,255,255,.06)` (`--art-keyline`) drawn by the art box's `::after`.
- **Art lifted** (`box-shadow: 0 8px 18px rgba(0, 0, 0, 0.4)`): Home album and jump tiles on hover or focus, with a 2px rise.
- **Hero art** (`box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35)`, hover `0 14px 34px rgba(0,0,0,.45)`): the Now Playing artwork.
- **Floating shell** (`box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,.06)`): nav pill, history and window pills, player bar, and their dropdown menus.

### Named Rules
**The Shadows Belong to Prints Rule.** Inside the content area only artwork casts a shadow. Cards, rows and chips are flat tonal fills.

**The Frosted Shell Rule.** Nav, player and queue sidebar use the material tokens (`--material-bg` + `--material-filter: blur(30px) saturate(1.8)`). Under `prefers-reduced-transparency` they fall back to solid Raised Navy and the ambient layer is hidden. Don't hand-roll a second glass recipe.

## Shapes

Generously rounded, never sharp. Home radii scale with the type in `em`: cards 1.2em, image cards 1em, tiles 0.9em, album art 0.7em, rows 0.65em, row thumbnails 0.6em. Fixed-px surfaces use the global scale (`sm` 6px, `md` 10px, `lg` 16px). Floating shell pills are 22px (half their 44px height). Buttons that carry a label are full pills (2em). Icon buttons, avatars and artist portraits are circles. Imagery is always clipped to its container's radius with `object-fit: cover`. Large photo cards set `object-position: center 25%` to keep faces in frame.

**The No-Outline Rule.** Content cards, rows, chips and tiles have no border. Separation comes from a tonal step (Wall on navy), not from a line. The only 1px strokes are the frosted shell's separator edge, the artwork's inner keyline, and input or control strokes.

## Components

### Buttons
- **Pill (primary):** the room inverted, with Gallery Light fill, After-Hours Navy text, label weight 600 at 0.92em and padding 0.55em × 1.1em on a full pill radius. Hover drops opacity to 0.78 over 0.15s.
- **Quiet add (icon):** a borderless 2.2em circle in tertiary label colour, hidden (opacity 0) until its row is hovered or focused within. Hover fills it with Tint Fill and lifts the icon to full label colour.
- **On-art add:** a 2.6em circle of `rgba(255,255,255,.18)` resting at 0.55 opacity on image cards (to `.34` on hover), or `rgba(0,0,0,.5–.55)` on album and tile corners, revealed on hover.
- **Text link ("See all", artist links):** no chrome. Secondary label colour, which turns full label with an underline on hover or focus.
- **Focus (all):** `outline: 2px solid var(--text-2); outline-offset: 2px`.

### Chips
- **Queued-by chip:** Tint Chip fill with a 10px backdrop blur, a full pill, and a 1.9em round avatar at the leading edge. It sits top-right on the Now Playing card. Hover moves to Tint Fill with white text.
- **Face pill:** a borderless avatar and name; hover adds a Tint Fill pill and a 2px `rgba(255,255,255,.55)` ring on the avatar.

### Cards / Containers
- **Corner Style:** 1.2em (section and featured cards), 1em (person cards, image cards).
- **Background:** Wall at rest, Lit Wall for featured. The featured cards add a radial `--wash` from the top-left corner (Picks: `120% 110% at 15% 0%`, 0.26 alpha, fading by 62%; Now Playing: `120% 150% at 0% 0%`, 0.3, by 65%).
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** none.
- **Internal Padding:** 1.5em (section), 1.7em (featured), 1.4em (Now Playing), 0.9em (person).

### Image card (signature)
A print with its label. The artwork fills the card edge to edge (`object-fit: cover`). A two-part scrim, `rgba(0,0,0,.4)` fading over the top 22% and `rgba(0,0,0,.74) → .26 → 0` up from the bottom by 70%, keeps a sentence-case top-left caption and a bottom-left title and artist legible in white. The whole card is one button. Artist links and the add button sit above it. Hover or focus-within scales the image to 1.03 and dims it to `brightness(.88)` over 0.15s.

### Track and chart rows
Borderless rows with a 0.65em radius and 3.2em rounded thumbnails. The title is at Title-at-rest white (500) and the artist in tertiary label on the same line. Hover or focus-within fills the row with Tint Fill, brightens the title to white and reveals the quiet add button. Chart rows are a fixed grid (rank · title · artist · plays · add) with tabular-numeral ranks and counts.

### Album and jump tiles
Square art (0.7–0.9em radius, or a circle for artists) over a two-line caption: title in Title-at-rest, sub in tertiary label. Hover or focus rises the tile 2px and gives the art the Art-lifted shadow.

### Now Playing card
Lit Wall with the artwork wash, 16em hero artwork (12.5em under 1100px), feature title, artist meta, a thin progress bar (0.32em, `rgba(255,255,255,.14)` track and `.85` fill) with tabular times, and the queued-by chip. Its sibling, the live lyrics box, is a Wall card that masks lyrics top and bottom with a gradient. The active line grows to 1.45em in white and the rest sit at full label.

### Inputs / Fields
- **Style:** the shelf search on the artist page is a 26px pill with a `border` stroke on a `rgba(255,255,255,.05)` fill.
- **Focus:** the stroke steps to `border-strong`.

### Navigation
Floating frosted pills (44px high, 22px radius) centred at the top of the window, offset by the docked queue width. Icon buttons inside are borderless, at 0.6 white. Hover brightens them to white on a `rgba(255,255,255,.08)` fill. The player bar is the same material, centred 24px above the bottom, with the playing track's dominant colour washed in from the left.

### Loading
Skeletons sit at the exact size and pitch of the content they replace (lyric lines at the real line pitch, tiles at tile size), so nothing shifts on load. They pulse in opacity and stop under `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** derive every chrome colour from `--tint` at low alpha (Wall 0.06, Lit Wall 0.085, Tint Fill 0.09, Tint Chip 0.16).
- **Do** let artwork bring the colour: pass the dominant colour in as `--wash` and fade it to transparent by about 65%.
- **Do** size new Home-language surfaces in `em` from the fluid page base and respond with `@container` queries.
- **Do** caption imagery with white text over the two-part bottom scrim, never on bare artwork.
- **Do** reveal secondary actions (add buttons) on hover or `:focus-within` and give every interactive element the 2px `--text-2` focus outline.
- **Do** use the material tokens for anything floating over content, and keep the reduced-transparency fallback.
- **Do** honour `prefers-reduced-motion`: stop skeleton pulses and image or lyric transitions.

### Don't:
- **Don't** use purple, neon or glow. The old purple radial gradients were removed on purpose, and the navy tint stays subtle and desaturated.
- **Don't** set text below 13px or build cramped, dense rows. No sub-13px metadata.
- **Don't** outline cards, rows or tiles. Separate with a tonal step.
- **Don't** put shadows on content cards. Only artwork and the floating shell cast them.
- **Don't** introduce a fixed brand accent or a second chrome hue.
- **Don't** use uppercase tracked eyebrows above titles. Hierarchy comes from size and weight.
- **Don't** copy the older surfaces' local styles (Leaderboard, Queuedle, Profile, dialogs, Discover) into new work.
