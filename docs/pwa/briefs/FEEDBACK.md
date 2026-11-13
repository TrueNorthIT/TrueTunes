# Owner's feedback from a real iPhone 14

The owner tried the shipped phone shell on his own iPhone 14 on 13 November and sent annotated screenshots. Each
item below has his words (quoted exactly), the screenshot, the coordinator's reading of it (marked as such: it is
an interpretation, not his words), and the brief that owns the fix. **If your letter is on an item, it is part of
your brief and comes before the brief's own list.** Look at the screenshot itself, not just the description.

What he confirmed works on the real phone:

- Long-press opens the row menu.
- "A lot is working, the issues I see are mostly styling."
- In his screenshots the tab bar and mini player read as solid frosted bars, with real blur and normal font
  weight: the thin type and missing blur seen in Playwright's WebKit on Windows are that build's quirks.

---

## 1. Album hero: art is left-aligned, and the text block is "liney" — brief E

![Album page on an iPhone 14](feedback/01-album-hero.jpg)

> Left aligned album art on mobile makes no sense, should be full bleed. Also the description is very "liney"

**What the screenshot shows.** `/album/:id` in Safari. The hero is `common/HeroBand` (also used by Playlist). The
art is a square about half the card's width, pinned left, with empty card to its right (his red arrows span that
gap). Under it sit five separate lines with wide gaps between them: "Album", the title with its explicit badge,
the artist, "17 songs · 46 min", then the Add to queue pill.

**Coordinator's reading.**

- *Full bleed*: on the phone the artwork should run the full width, edge to edge, not sit as a half-width
  thumbnail inside a padded card. Whether that means the full width of the screen (art to the screen edges and up
  under the top strip, the title block below it) or the full width of the card is a design call for the agent to
  make and show; the first is the stronger reading of "full bleed". The Back button then sits over the art, on a
  scrim or the dense material, so it stays legible on a pale cover. DESIGN.md's rules still hold: imagery clipped
  with `object-fit: cover`, white text only over a scrim, the hero-art shadow only if the art is still a print on
  a surface.
- *Liney*: the meta reads as a stack of unrelated lines. Set it as one block with a clear hierarchy and tighter
  rhythm: the title as the feature line (two lines before it truncates, the explicit badge inline), then one
  secondary line that carries the rest ("SOFT PLAY · Album · 17 songs · 46 min", the artist still a link with a
  44px hit area), then the action. The small "Album" label above the title is the first thing to fold in. The
  44px tap targets are for hit areas, not for line spacing: pad the hit area without pushing the lines apart.
- Apply the same treatment to the Playlist hero (same component), and check an album with a long title, a
  playlist with generated art, and a playlist the user owns (its title is click-to-edit).

**Ownership.** `common/HeroBand.tsx` and `HeroBand.module.css` move to brief E for this (brief A leaves them
alone). The desktop layout must not change: scope it to the phone shell.

---

## 2. Search: the top result card is half width — brief E

![Search results on an iPhone 14](feedback/02-search-top-result.jpg)

> On search results this top card is half width, should be full

**What the screenshot shows.** `/search` in Safari, query "soft play". The Top result card
(`common/TopResultCard`) is about 255px wide and 190px tall, pinned left, with empty page to its right (his red
arrows span that gap). The Songs card under it is full width. The "Top result" label also sits hard against the
card's top edge, tighter than the card's other padding.

**Coordinator's reading.**

- The card should span the full width of the page, like the Songs card under it.
- This is very likely a **Safari-only layout bug**, not a design choice: in Chromium the same card is full width
  (the journey's screenshots show it so). `TopResultCard.module.css` gives the stacked card `aspect-ratio: 4 / 3`
  with `max-height: 22em`; 255x190 is exactly 4:3, which suggests WebKit clamps the height and then derives the
  width from it. The base branch already fixed the same thing in `ArtCard.module.css` ("WebKit sizes a stretched
  grid item with an aspect ratio from its (empty) height") with an explicit `width: 100%`. Treat that as a lead to
  confirm in WebKit (`--device "iPhone 14"`), not as the answer.
- Then **look for the same pattern everywhere else**: any element on a phone page that combines `aspect-ratio`
  with a `max-height`, `max-width` or a stretched grid or flex cell. Home's pick cards, image tiles, heroes and
  the Now playing art are the candidates. Chromium will not show it; only WebKit will.
- Fix the label's top padding while there: it should sit on the card's normal inset, on the top scrim.
- Check it with an artist (photo), an album or song (cover), and a result with no art (the Lit Wall fallback).

**Ownership.** `common/TopResultCard.tsx` and `TopResultCard.module.css` move to brief E (brief A leaves them
alone). If the same bug turns up in a component another brief owns, report it with the WebKit screenshot rather
than fixing it. Scope the change to the phone shell.
