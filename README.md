# Brumaire

Brumaire is a mobile-first web tool in development for extending short looping videos so
they can be used as longer Instagram Stories. The intended workflow keeps video processing
on the user's device.

> [!NOTE]
> Local video selection, preview, target choice, extension, and verified MP4 download are
> implemented in `/tool`. File sharing is offered when the browser supports sharing local files.
> Supported inputs are H.264 MP4 videos with optional AAC audio; physical-iPhone validation is
> still pending.

## Stack

- TanStack Start and TanStack Router
- React and TypeScript
- Tailwind CSS
- Biome
- pnpm

## Local development

Use Node.js 22.12 or newer and pnpm 10.

```bash
pnpm install
pnpm dev
```

The development server runs at `http://localhost:3000`.

During development, `/__spike/remux` exposes the local H.264/AAC remux harness. It copies
aligned H.264 and AAC packets, while ordinary AAC encoder priming uses a local audio-only
decode/re-encode fallback. Video packets are never transcoded. The fallback requires browser AAC
WebCodecs support (the current compatibility target is Safari/iOS 26 or newer) and reports an
explicit capability error when unavailable. The route is unlinked, returns not found in
production, and has not yet been validated on a physical iPhone.

## Validation

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```
