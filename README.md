<p align="center">
  <img src="docs/assets/brum-wordmark.png" alt="Brum" width="360">
</p>

<p align="center">
  Create forward/reverse boomerang videos to an exact duration, entirely in your browser.
</p>

Brum is a mobile-first utility for turning a short video into a forward/reverse boomerang MP4
suitable for an Instagram Story. Select a file, choose a duration or number of boomerang cycles,
choose Boomerang, Slow Motion, or Original playback speed, process it locally, then save or share
the result. One cycle is the source motion forward and then backward.

## Current status

The core MVP workflow is available at `/tool`:

- Select and preview a local video.
- Choose Boomerang, Slow Motion, or Original playback speed.
- Create exactly 15, 30, 45, or 60 seconds of output, or create 2, 3, 5, or 10
  complete cycles.
- Preview and download the generated MP4.
- Share the result when the browser supports sharing local files.

Processing happens on-device. Brum has no accounts, backend video-processing service, or
intentional video uploads.

> [!IMPORTANT]
> Inputs support MP4 and QuickTime/MOV containing exactly one H.264 or HEVC video track, at most one
> source audio track, and no unrelated tracks. Source audio is intentionally discarded.
> HEVC input requires the current browser to decode the actual track configuration. Generated
> H.264 MP4 files are silent. Inputs can be up to 50 MiB and outputs up to 200 MiB. Physical iPhone/Safari
> validation of the bounded-memory processor is still pending.

## How it works

Brum inspects the visual track, checks source decode and AVC encode support, decodes video frames
in presentation order, and emits each cycle forward and then backward. The timeline is re-encoded
as AVC/H.264 and muxed into a silent MP4, all locally in the browser; source media is never uploaded.
Playback speed changes emitted frame timing without interpolating frames. Exact-duration targets
trim the final emitted frame when necessary, while cycle targets remain complete forward/reverse
cycles at the selected speed. Timing always comes from the video track rather than a longer
container or audio tail.

A first decode pass retains only frame timing and range metadata, closing each sample immediately.
Encoding then loads one presentation-order range at a time through Mediabunny, emits the required
forward/reverse frames, and releases the range before loading another. Each range is limited to
8 frames and 32 MiB of owned native-format pixels, checked before allocation. A 1080p NV12
range holds eight frames (about 23.7 MiB), independent of source duration. Recreating an encoding sample temporarily
copies one additional frame; codec-owned surfaces and queues are additional browser-managed memory.
Whole-source RGBA storage is no longer used.

Brum validates the readable output, duration, codec, geometry, silence, and continuous decoded
timeline. Chromium regressions cover directional playback at every speed and a synthetic 300-frame,
10-second 1080p source that would require about 2.3 GiB with whole-clip retention. See
[bounded-memory validation](docs/validation/issue-28.md) for implementation tradeoffs and the pending
physical iPhone Safari checks.

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

## Validation

```bash
pnpm test
pnpm test:browser
pnpm typecheck
pnpm check
pnpm build
```
