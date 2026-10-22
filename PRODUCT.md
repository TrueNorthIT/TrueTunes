# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Electron desktop app (Chromium renderer, React + Vite). Runs on staff Windows desktops; also has a mini player and a "skinny" docked mode.

## Users

TrueNorth office staff in one office, queuing music to the office's shared Sonos speakers during the working day. Use comes in short bursts between tasks: find something, queue it, glance at what's playing and what's next, then go back to work. The app often sits docked or skinny beside other work.

## Product Purpose

True Tunes is the office's shared jukebox. It lets anyone in the office search the music service, queue tracks to the shared speakers, and see what everyone else has queued. Success is that people reach for it instead of the Sonos app, the queue stays lively, and the music becomes part of office culture rather than one person's playlist.

## Positioning

Unlike the Sonos or Apple Music apps, True Tunes is social, playful and built around one shared queue:

- **Social**: every queued track is attributed to the person who queued it; office presence, people pages, leaderboards and stats.
- **Playful**: office games and rituals around the music (Queuedle, weekly polls, the DJ, the Christmas quiz, the Vestaboard).
- **Shared queue**: one office queue everyone contributes to, with visibility of what's coming up and who added it.

## Operating Context

- Content comes from the Sonos play.sonos.com BFF; the office's music service is YouTube Music.
- Attribution and presence flow through Azure Web PubSub and Functions into Cosmos DB; the leaderboard and stats read from there.
- Artist bios, alternate names, socials and release years come from Genius.
- Staff sign in with Entra ID (TrueNorth tenant) and with their Sonos account.

## Capabilities and Constraints

- Desktop only (Electron); no mobile app. Windows sizes range from docked/skinny to ultra-wide (3440px) monitors.
- Artwork is supplied by the music service (square images; YouTube Music URLs can be requested at higher resolution).
- Queueing goes to a shared physical speaker: actions are audible to the whole office.
- No main-process test suite; the renderer has Vitest tests.

## Brand Commitments

- The name **True Tunes** stays.
- No TrueNorth brand colours or logo are required.
- Apple Music is named by the user as inspiration and a quality bar, not a template to copy.
- Standing preference (2026-10-22): the category standard played straight, no themed or novelty worlds. Benchmark: the Apple Music macOS app; its craft level is the bar. The office character lives in people and attribution, not in decoration.

## Evidence on Hand

- Real office data: queue attribution, users and avatars, leaderboard stats, Queuedle results, polls.
- Real artwork, artist photos and Genius bios from the music service.
- No testimonials, usage metrics or external customers; do not invent any.

## Product Principles

1. The queue is shared: always make it clear what's playing, what's next and who added it.
2. Music and people first: artwork and colleagues carry the identity, the chrome stays out of the way.
3. Quick in, quick out: the core loop (find, queue, glance) must take seconds, from any window size.
4. Play is part of the product: games and rituals belong in the app, not bolted on.
