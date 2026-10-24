---
paths:
  - "renderer/src/**/*.{tsx,ts,css}"
---

# UI: design system and shared components

**DESIGN.md is the spec** ("After-Hours Gallery"): colours, type roles, shadow vocabulary, radius scale, components and the do/don't rules (no text under 13px, shadows only on artwork and floating surfaces, no purple/neon/glow). Read it before UI work. If you change a design rule, update DESIGN.md in the same commit.

**Tokens, not values.** Every colour, shadow, border radius and font size in renderer CSS comes from a token in `renderer/src/styles/global.css` (`:root`) or `depth.css` (shell materials), so one edit retunes the app.

- Colours: `var(--text*)`, `--on-art*`, `--glass*`, `--overlay*`, and tints as `rgba(var(--tint), a)`. Shadows: `--art-shadow`, `--hero-shadow`, `--float-shadow` and friends. Radii: `--r-*`. Type: `--fs-*` (smaller steps are already `max(13px, …)`).
- Enforced, not advisory: `npm run lint:css` (Stylelint, `stylelint.config.mjs`) fails on a raw colour, radius, font size or shadow colour in renderer CSS outside those two files (mask gradients exempt), ESLint flags the same literals in inline `style` objects, and `__tests__/designSync.test.ts` fails when a token is missing from DESIGN.md (or the reverse). A hook runs these on every CSS/TS edit, so fix what it reports before moving on. Class names are camelCase.
- Need a value no token covers? Use the nearest token first. If it is a genuinely new role, add it beside its siblings in `global.css` with a one-line comment, and name it in DESIGN.md.

**Reuse before you build.** Shared components live in `renderer/src/components/common/`, and Storybook is the catalogue of what exists and its states. Before writing a card, tile, row, button, chip, dialog, menu, artwork or seek/transport control, check there.

- Extend a shared component with a prop rather than copying it. Promote a page-local component to `common/` once a second page needs it.
- Data helpers too: `lib/itemHelpers.ts` has `trackPayload()` (context-menu track), `albumItem()` and `artistItem()` (navigable `SonosItem`s). Don't hand-build those objects.
- A new shared component gets a story (see Storybook in CLAUDE.md); story tests run axe, so a new violation fails the build.
