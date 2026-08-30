<p align="center">
  <img src="docs/assets/brum-wordmark.png" alt="Brumaire" width="360">
</p>

<p align="center">
  Extend short looping videos to an exact duration, entirely in your browser.
</p>

Brumaire is a mobile-first utility for turning a short video or Instagram Boomerang into a
longer MP4 suitable for an Instagram Story. Select a file, choose a duration or number of loops,
process it locally, then save or share the result.

## Current status

The core MVP workflow is available at `/tool`:

- Select and preview a local video.
- Extend it to 15, 30, 45, or 60 seconds, or repeat it 2, 3, 5, or 10 times.
- Preview and download the generated MP4.
- Share the result when the browser supports sharing local files.

Processing happens on-device. Brumaire has no accounts, backend video-processing service, or
intentional video uploads.

> [!IMPORTANT]
> Inputs are currently limited to H.264 MP4 files with optional AAC audio. Files can be up to
> 50 MiB and generated outputs up to 200 MiB. Browser media capabilities vary, and playback on
> a physical iPhone still needs final validation.

## How it works

Brumaire repeats the source timeline and trims only the final repetition when an exact duration
requires it. H.264 video packets are preserved without transcoding. Compatible AAC audio is
copied; when its timing requires correction and the browser has the necessary media support,
only the audio is re-encoded locally.

## Stack

- TanStack Start and TanStack Router
- React 19 and TypeScript
- Tailwind CSS 4
- Mediabunny
- Biome
- pnpm

## Local development

Requirements: Node.js 22.12 or newer and pnpm 10.

```bash
pnpm install
pnpm dev
```

The development server runs at `http://localhost:3000`.

An unlinked media harness is also available at `/__spike/remux` in development. That route is
intentionally unavailable in production; `/tool` is the product interface.

## Validation

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```
