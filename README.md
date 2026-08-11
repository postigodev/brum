# Brumaire

Brumaire is a mobile-first web tool in development for extending short looping videos so
they can be used as longer Instagram Stories. The intended workflow keeps video processing
on the user's device.

> [!NOTE]
> Local video selection, preview, and target choice are implemented. Processing, export, and
> sharing are not available yet.

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

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```
