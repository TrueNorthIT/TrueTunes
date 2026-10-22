---
target: Home page
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:D:\\Source\\Personal\\true-tunes-2.worktrees\\feature__jdp__better-artist-page\\renderer\\src\\components\\HomePanel.tsx"
target_fingerprint: "sha256:5da54bd8d95b840b8e86e87a3ae7452245d4cc0a48063c1f68048726c9f079e5"
target_path: "D:\\Source\\Personal\\true-tunes-2.worktrees\\feature__jdp__better-artist-page\\renderer\\src\\components\\HomePanel.tsx"
timestamp: 2026-10-22T16-45-54Z
slug: renderer-src-components-homepanel-tsx
---
Method: dual-agent (A: design review · B: detector + CDP evidence). Judged at the new 16px base scale, against DESIGN.md ("After-Hours Gallery").

## Design Health Score: 24/40 (Acceptable)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | System status | 3 | Now playing/progress/lyrics excellent; no "up next" on Home |
| 2 | Real world | 3 | "Joe Pitts loves X" shown to Joe himself |
| 3 | User control | 2 | Queue all puts ~8 tracks on office speakers, no confirm/undo |
| 4 | Consistency | 2 | Uppercase eyebrows, "For You", default orange focus ring, mixed add buttons |
| 5 | Error prevention | 2 | The loudest office action is the most prominent button |
| 6 | Recognition | 3 | Art + labels everywhere |
| 7 | Flexibility | 2 | 99-115 tab stops, no section skipping, no shortcuts |
| 8 | Minimalism | 3 | Duplication: Jump back in repeats the People card |
| 9 | Error recovery | 2 | Failed sections silently vanish |
| 10 | Help | 2 | Pick logic only implied |

## Priority issues
1. [P1] First viewport leads with a recommendation photo, not the room; attribution is a small corner chip (layout)
2. [P1] Picks copy: third-person "Joe Pitts loves", double em-dash reasons, artist lost at 1280 (clarify)
3. [P1] DESIGN.md violations: uppercase tracked eyebrows (detector: kicker-above-heading), "For You" title case, browser-default orange focus ring on .face/.albumAdd (polish)
4. [P2] Muted text contrast 4.42:1 on Picks/Now Playing, 4.31:1 on person cards (measured) (audit)
5. [P2] All-day stability: hero swaps as photos resolve; lyric font-size animation reflows; .nowFill transitions width (detector layout-transition) (animate)
6. [P2] 1280 with queue docked: chip padding-right wraps meta to 5 lines; lyrics mask under label (adapt)
7. [P2] A11y: title buttons' accessible name != visible text (WCAG 2.5.3); clickable lyrics div has no role; reduced-motion misses tile/art transforms (audit)
8. [P3] For You content: podcast leaks through, app icon as Supermix art, duplicate art (distill)

## Detector
CLI: 2 warnings (bounce-easing in MediaCard, out of Home; layout-transition .nowFill). Browser: 6 on Home (2 radial-spotlight-glow + ai-color-palette = intended artwork washes per DESIGN.md; layout-transition; edge-flush-cards false positive; kicker-above-heading real per Sentence Case rule). Shell: 364, mostly 10px "by" attribution in the queue sidebar.
Evidence: 0 text under 13px at 1920/1280 (12 classes sit exactly at 13px at 1280); no card borders; 0 unnamed focusables; no horizontal overflow.
