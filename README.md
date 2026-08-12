# Brumaire

Brumaire is a mobile-first web tool in development for extending short looping videos so
they can be used as longer Instagram Stories. The intended workflow keeps video processing
on the user's device.

> [!NOTE]
> Local video selection, preview, target choice, and extension planning are implemented.
> Packet-preserving MP4 processing is currently an internal feasibility spike; it is not
> connected to the product tool yet. Export and sharing are not available in `/tool`.

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

During development, `/__spike/remux` exposes the local H.264/AAC remux harness. The route is
unlinked, returns not found in production, and has not yet been validated on a physical iPhone.

## Validation

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```
