# Brumaire Initial Application Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a polished, mobile-first Brumaire foundation with three static routes and no simulated video-processing behavior.

**Architecture:** Use the current minimal TanStack Start React scaffold with file-based routes and Tailwind CSS. Keep shared framing in the root route, keep unique static content inside each route, and reserve a non-interactive tool surface that can later be replaced by a real file-selection component.

**Tech Stack:** TanStack Start, TanStack Router, React 19, TypeScript, Tailwind CSS 4, Vite, pnpm, Biome

## Global Constraints

- Routes are `/`, `/tool`, and `/privacy`.
- The upload placeholder is non-interactive presentation, not a disabled form control.
- Do not add duration controls or video-processing behavior.
- Do not add authentication, a database, backend APIs, analytics, state management, video libraries, PWA support, or speculative tests.
- Keep route-specific static content in its route unless extraction materially improves reuse or readability.
- Preserve the user-owned `AGENTS.md` and the approved design spec.

---

### Task 1: Establish the TanStack Start toolchain

**Files:**

- Create: `.gitignore`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `pnpm-lock.yaml` through `pnpm install`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `tsr.config.json`
- Create: `biome.json`
- Create: `src/router.tsx`
- Create: `src/routeTree.gen.ts` through route generation

**Interfaces:**

- Produces: a strict TypeScript TanStack Start runtime, generated file-route tree, Tailwind Vite integration, and Biome scripts.
- Consumes: the current CLI scaffold configuration verified in the temporary reference project.

- [ ] **Step 1: Add the minimal scaffold configuration**

  Use the current scaffold dependency set, but omit TanStack devtools packages and plugins because they are not needed for this static foundation. Define scripts exactly for `dev`, `build`, `preview`, `generate-routes`, `typecheck`, `lint`, `format`, `format:check`, and `check`.

- [ ] **Step 2: Configure strict TypeScript and Vite**

  Keep the scaffold's ES2022, bundler resolution, `strict`, unused-code, and no-emit options. Configure Vite plugins in this order: Tailwind, TanStack Start, React.

- [ ] **Step 3: Configure Biome**

  Enable recommended lint rules and formatting for source and root configuration files. Exclude generated `src/routeTree.gen.ts`, build output, and the intentionally hand-designed Tailwind stylesheet.

- [ ] **Step 4: Install dependencies**

  Run: `pnpm install`

  Expected: exit 0 and a newly generated `pnpm-lock.yaml`.

### Task 2: Build the shared framing and three routes

**Files:**

- Create: `src/styles.css`
- Create: `src/routes/__root.tsx`
- Create: `src/routes/index.tsx`
- Create: `src/routes/tool.tsx`
- Create: `src/routes/privacy.tsx`
- Regenerate: `src/routeTree.gen.ts`

**Interfaces:**

- Produces: directly addressable `/`, `/tool`, and `/privacy` routes.
- Consumes: TanStack Router `Link`, `createRootRoute`, `createFileRoute`, `HeadContent`, and `Scripts`.

- [ ] **Step 1: Implement root document framing and metadata**

  Set `lang="en"`, title `Brumaire — Extend short loops locally`, and a concise product description. Add a compact header with a Brumaire home link and text links to Tool and Privacy. Render route children directly between the header and `Scripts` without adding a mandatory footer or a generic shell component abstraction.

- [ ] **Step 2: Implement the landing route**

  Keep the content in `src/routes/index.tsx`. Use an editorial hero with the exact product status made clear: Brumaire is being built to extend short loops; the primary CTA links to `/tool`; on-device processing is described as the intended design, not current functionality.

- [ ] **Step 3: Implement the tool route**

  Center a generous `<section>` representing the future file-selection area. It must have visible `Not available yet` copy and no click handler, file input, button role, disabled attribute, duration controls, or fake progress UI. Put the short future flow below the surface: select, choose duration, extend locally, save or share.

- [ ] **Step 4: Implement the privacy route**

  State that the current foundation does not process videos, has no accounts, and does not intentionally upload files. Keep the notice concise and explicitly temporary.

- [ ] **Step 5: Apply the restrained visual system**

  Use Tailwind 4 theme tokens and utilities for a warm paper background, near-black ink, muted brown accent, fine borders, generous mobile spacing, strong focus visibility, and responsive width limits. Use an editorial serif stack for the wordmark/headings and a clean humanist sans stack for body copy. Avoid gradients, glass effects, cards, and animation.

- [ ] **Step 6: Generate routes and perform focused checks**

  Run: `pnpm generate-routes && pnpm typecheck`

  Expected: exit 0 and the generated route tree includes `/tool` and `/privacy`.

### Task 3: Replace scaffold documentation and validate the application

**Files:**

- Create: `README.md`
- Review: all tracked and untracked project files

**Interfaces:**

- Produces: concise contributor setup instructions and a validated production foundation.
- Consumes: the final package scripts and route structure.

- [ ] **Step 1: Write the concise project README**

  Include only what Brumaire is, that the project is currently a static application foundation without video processing, the stack, prerequisites, and `pnpm install` / `pnpm dev` / validation commands. Do not document nonexistent features, APIs, deployment, licensing, or contribution workflows.

- [ ] **Step 2: Run formatter write mode once**

  Run: `pnpm format`

  Expected: exit 0; Biome formats supported source and configuration files.

- [ ] **Step 3: Run all requested validation**

  Run: `pnpm typecheck`

  Run: `pnpm lint`

  Run: `pnpm format:check`

  Run: `pnpm build`

  Expected: every command exits 0.

- [ ] **Step 4: Review repository hygiene**

  Run: `git status --short`, `git diff --check`, and `git diff --stat`.

  Confirm that `.superpowers/`, `node_modules/`, build output, local environment files, and temporary scaffold files are ignored or absent. Keep `src/routeTree.gen.ts` because TanStack Router intentionally generates and tracks it.
