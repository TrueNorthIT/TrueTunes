# Brief D: pages by eye, part 1 (Home, Discover, Leaderboard and the stats pages)

Read `COMMON.md` in this folder first.

- **Branch:** `feature/pwa-phone-d-pages1`
- **Port:** 9104
- **Model:** Sonnet

## You own

- `renderer/src/components/HomePanel.tsx`, `renderer/src/styles/HomePanel.module.css`
- `renderer/src/components/DiscoverPanel.tsx`, `renderer/src/styles/DiscoverPanel.module.css`
- `renderer/src/components/LeaderboardPanel.tsx`, `renderer/src/styles/LeaderboardPanel.module.css`
- `renderer/src/components/musicStats/**`, `renderer/src/styles/MusicStats.module.css`
- `renderer/src/components/stats/**`
- `renderer/src/components/queuedle/QueuedleStatsPanel.tsx`, `ScoreDistribution.tsx`,
  `renderer/src/styles/QueuedleStats.module.css`
- `renderer/src/components/common/FanBubbles.tsx` and `FanBubbles.module.css` (the one shared component that is
  yours; brief A leaves it alone)

Nothing else. Other shared components, `global.css` and the shell belong to brief A.

## Background

These pages passed the automated check (no sideways scroll, 44px targets, 13px text) but most of each has **not
been looked at** at phone size. Only the top of each was seen. That check does not catch overlap, clipping inside
a card, cramped rows, a chart nobody can read, or a control that is technically 44px but in the wrong place.

Known problems:

- **Home**: on the lead pick card, the centre fan bubble overlaps the title. Home's last two sections ("What
  people are queuing" and "For you") have never been looked at.
- **Music stats** (`/leaderboard/stats`): the Airtime card ran about 6px past the right gutter; a `BarList` rule
  was added and never checked. The heatmaps and lower charts have never been looked at.
- **Leaderboard**: the lower half (standings, top tracks) has never been looked at.
- **Discover**: the lower half has never been looked at.
- **Queuedle stats** (`/queuedle/stats`): the lower charts have never been looked at.

## What to do

For each page, in the order Home, Discover, Leaderboard, Music stats, Queuedle stats:

1. Take full-length screenshots at 390x844 at 3x in full Chromium (`channel: 'chromium'`): the top, then scroll a
   screen at a time to the end, so every part of the page is in a screenshot. Do the same with the journey's
   `--safe-area` insets simulated for the top and bottom screens. The page's scroller is inside the shell, not the
   window: scroll that element.
2. **Open and look at every screenshot.** Write down what is wrong before fixing anything.
3. Fix what is wrong, in the files you own, scoped to the phone shell (`:root[data-shell='phone']`) so the desktop
   layout and the web at desktop width do not change. Then re-take the screenshots and look again.

What "wrong" means here: anything overlapping, clipped or cut off by a card's edge; text truncated so far it is
useless; a row or card that is cramped (DESIGN.md asks for generous rows); a chart or heatmap whose labels collide
or are too small to read (a chart may scroll sideways inside its own card, but must say so visually, and the page
must not); a shelf that cannot be swiped; a control too close to another to hit reliably; uneven gutters (16px on
the phone); a section that makes no sense on a phone and should be shorter or stacked.

Also for this brief:

- **FanBubbles on Home's pick cards**: the faces must not cover the title or the +. On a phone-width card they
  may need to be fewer, smaller or placed higher; keep DESIGN.md's description true (biggest fan in the middle,
  at most six with a "+n") or update DESIGN.md's wording through your report (DESIGN.md itself is brief A's).
- Hover-only information (chart tooltips, "why this pick"): say what a touch user loses on each page. The chart
  tooltip (`ChartTooltip`) is yours: make it appear on tap if it does not.
- Check each page with long names and counts where the demo has them.

## Extra proof for this brief

- `npx vitest run --config renderer/vitest.config.ts --project unit renderer/src/components/stats
  renderer/src/components/musicStats renderer/src/components/queuedle renderer/src/components/__tests__
  renderer/src/lib`.
- The before and after screenshots of every screen of every page, as paths, and for each page the list of what you
  found and what you did about it. If you judged something acceptable as it is, say so and why.
