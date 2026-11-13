# Brief B: WebKit, the journey and the safe areas

Read `COMMON.md` in this folder first.

- **Branch:** `feature/pwa-phone-b-webkit`
- **Port:** 9102
- **Model:** Sonnet

## You own

- `scripts/web/journey.mjs`
- `renderer/src/components/queue/QueueSidebar.tsx`, `DraggableQueueRow.tsx`, `DjUpcomingRow.tsx`
- `renderer/src/styles/QueueSidebar.module.css`

Nothing else. If the fix for something you find belongs in a file you do not own, describe it in your report.

## Background

Safari is the real target and nothing has passed in WebKit yet. The previous agent installed WebKit
(`npx playwright install webkit`; it runs on this Windows machine) and ran the journey once with
`--device "iPhone 14"`: 4 of 13 steps failed.

- Two causes were fixed afterwards and **not re-run**: the per-page check measured opacity in the middle of a
  page's fade-in, and the lead pick card on Home collapsed to zero width in WebKit.
- One is **undiagnosed**: in "queue a track from it and see the queue grow", the queue's count chip went from 20 to
  21 but the new row was not found after scrolling the virtual queue list to its end, and in the next step the tap
  on a row's "more" button never became "stable".

Known about Playwright's WebKit build on Windows: it draws no backdrop blur and renders the Manrope variable font
very thin. Treat those two as that build's quirks, not as bugs to fix.

## What to do, in this order

1. Install WebKit and run `node scripts/web/journey.mjs --local --device "iPhone 14" --shots <dir>`. Record which
   steps pass now.

2. **Diagnose the queue failure properly.** Work out which of these it is, with evidence:
   - the script (its scroll helper, a selector, or timing that Chromium forgives);
   - Playwright's WebKit (for example how it reports stability for a row inside a transformed, virtualised list);
   - a real bug that Safari would also have (the virtual list not rendering the last rows, the queue page not
     scrolling to its end, the row moving under the finger).

   The queue list is virtual (`@tanstack/react-virtual` in `QueueSidebar`): rows exist only near the viewport, so
   a row is reached by scrolling the list, not by querying the DOM. To tell the cases apart, drive the same steps
   by hand in WebKit with screenshots after each action, and read the DOM (how many rows are mounted, the
   scroller's `scrollTop`, `scrollHeight` and `clientHeight`, whether the new row's index is in the mounted
   range). If it is a real bug, fix it in the queue files you own, scoped so the desktop's docked queue and
   Electron's skinny queue do not change (they use other variants of the same component: check `variant`). If it
   is the script, fix the script without weakening what the step proves: the new track must still be found in the
   queue with the demo user's name on it.

3. Get the whole journey passing in WebKit, **and** still passing in Chromium at 390x844 and at 1280x800. CI runs
   Chromium only, so the default run must not need WebKit.

4. **Safe areas.** Run the journey with `--safe-area` in Chromium and in WebKit with `--shots`, and look at every
   page screenshot: nothing may sit under the top 47px or the bottom 34px (the status strip, page titles, the
   search field, the Back button, the Now playing page's close button, the dock, the sheet's last item, dialogs).
   Report anything that does, with the screenshot; fix it only if it is in a file you own.

5. **The shorter Safari viewport.** With Safari's bars showing, the visible area is about 390x664. Run the journey
   at `--width 390 --height 664` and look at Home, Now playing, Queue and the open sheet.

6. **Landscape** (844x390): nobody has tried it. Look at Home, Now playing and Queue, and report what you see. Do
   not fix it; say whether it is usable.

7. Add to the journey, if they are missing: an assertion that every visible text field on the phone shell has a
   computed font size of at least 16px, and that the dock is hidden while the search field has focus and returns
   afterwards.

## Extra proof for this brief

- The journey's output in WebKit, in Chromium at 390x844, and at 1280x800.
- The full set of page screenshots from the WebKit run with `--safe-area`, as paths, with a line on each you
  looked at.
- For the queue failure: what it was, the evidence, and the fix.
