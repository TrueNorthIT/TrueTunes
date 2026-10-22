---
target: artist page
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:D:\\Source\\Personal\\true-tunes-2.worktrees\\feature__jdp__better-artist-page\\renderer\\src\\components\\artist\\ArtistPanel.tsx"
target_fingerprint: "sha256:1a398783054d609c159bb4c8a5dc03f1292733475b47ff34434d4ae96926d43a"
target_path: "D:\\Source\\Personal\\true-tunes-2.worktrees\\feature__jdp__better-artist-page\\renderer\\src\\components\\artist\\ArtistPanel.tsx"
timestamp: 2026-10-22T09-41-12Z
slug: renderer-src-components-artist-artistpanel-tsx
---
Method: dual-agent (A: design review · B: detector + CDP browser evidence)

## Design Health Score: 24/40 (Acceptable)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | System status | 3 | "No releases match" shown while tracklists still loading |
| 2 | Real world match | 3 | "Other versions" shelf vs "N versions" stacks reuse one word |
| 3 | User control | 3 | Focus drops to body after expanding a stack, so Esc can't collapse |
| 4 | Consistency | 2 | 13px section headings beside 22px shelf titles; fixed 156px cards vs Home's --card-size; three "+" styles |
| 5 | Error prevention | 3 | Stray "+" queues to shared speaker, no undo here |
| 6 | Recognition | 2 | Queue buttons hover-only; multi-select/drag undiscoverable; "Top Songs ›" not read as expand |
| 7 | Flexibility | 3 | Multi-select, drag, context menu, track search |
| 8 | Minimalism | 2 | Artist name repeated ~30x on own page; ultra-wide dead space |
| 9 | Error recovery | 2 | Silent tracklist fetch failures; no-match state offers no next step |
| 10 | Help | 1 | Search scope and multi-select undocumented |

## Priority issues
1. [P1] Hover-only queue actions and keyboard dead ends (harden): .addBtn/.albumOverlay opacity 0 without :focus-within; 20/21 album cards unfocusable; "+" named only "+"; focus lost on stack expand.
2. [P2] Artist name repeated in every subtitle on the artist's own page (distill).
3. [P2] Section heading hierarchy mismatch, 13px vs 22px (typeset).
4. [P2] About text ~141 chars/line, 14.5px italic, no max-width (detector line-length x3, ArtistPanel.module.css:141) (typeset/layout).
5. [P2] Ultra-wide layout: mainGrid 2fr 1fr puts durations ~1100px from titles (layout).
6. [P3] Track-hit line uses undefined --accent, falls back to grey; empty state during track load (clarify).

## Detector
CLI: clean (CSS modules invisible to TSX scan). Browser: 146 findings, 3 on artist panel (all line-length on .aboutText); rest in QueueSidebar (10px text x133), PlayerBar, App shell — out of scope.
