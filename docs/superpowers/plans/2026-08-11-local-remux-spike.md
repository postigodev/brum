# Brumaire Local Remux Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove exact-duration, packet-preserving local MP4 extension in a development-only browser harness without changing the product `/tool` route.

**Architecture:** A framework-free `video-processing` feature inspects input, schedules encoded packets from the existing `ExtensionPlan`, remuxes with Mediabunny, and reinspects the result. A small development-only TanStack route exercises that contract; production resolves the route as not found.

**Tech Stack:** TypeScript 6, Mediabunny, TanStack Start/Router, React 19, Vitest, Biome, pnpm.

## Global Constraints

- Support MP4 containing exactly one H.264 video track and zero or one AAC audio track.
- Copy encoded packets; never silently decode, encode, transcode, discard audio, or loosen the requested duration.
- Require input and output track duration within `0.001` seconds of the exact target.
- Reject inputs above `52_428_800` bytes and estimated or actual outputs above `209_715_200` bytes.
- Keep processing local and in memory; no network calls, server functions, persistence, workers, or global state.
- Keep `/tool` unchanged and make `/__spike/remux` unavailable in production.
- Keep physical-iPhone validation explicitly pending.

---

### Task 1: Dependency and processing contract

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/features/video-processing/types.ts`
- Create: `src/features/video-processing/errors.ts`
- Test: `src/features/video-processing/errors.test.ts`

**Interfaces:**
- Consumes: `ExtensionPlan` from `#/features/video-selection/extension-plan`.
- Produces: `RemuxErrorCode`, `RemuxError`, `MediaTrackSummary`, `RemuxVerification`, `RemuxResult`, and `RemuxOptions { signal?: AbortSignal }`.

- [x] Add Mediabunny with `pnpm add mediabunny` and verify the installed API/types locally.
- [x] Write failing tests for stable error codes, cause retention, and cancellation mapping; run `pnpm vitest run src/features/video-processing/errors.test.ts`.
- [x] Implement the typed contract and error helpers without React imports; rerun the focused test.
- [x] Run `pnpm typecheck` and resolve public-type errors.

### Task 2: Pure guards and packet scheduler

**Files:**
- Create: `src/features/video-processing/limits.ts`
- Create: `src/features/video-processing/packet-schedule.ts`
- Test: `src/features/video-processing/limits.test.ts`
- Test: `src/features/video-processing/packet-schedule.test.ts`

**Interfaces:**
- Consumes: `ExtensionPlan` and source packet descriptors `{ track, sourceIndex, timestamp, duration, type, data }`.
- Produces: `assertInputSize(fileSize)`, `assertEstimatedOutputSize(fileSize, totalPlays)`, `assertActualOutputSize(blobSize)`, and a deterministic packet ledger containing source index, repetition, timestamp, duration, type, and payload hash.

- [x] Write failing boundary tests for exactly/above 50 MiB and 200 MiB, plan/source mismatch, whole repetitions, partial final repetitions, zero-origin normalization, and abort checkpoints.
- [x] Run both focused test files and confirm the expected failures.
- [x] Implement integer-safe size guards and the scheduler using the plan's exact output duration; skip packets starting at/after cutoff and shorten only a crossing final packet duration.
- [x] Rerun focused tests and `pnpm typecheck`.

### Task 3: MP4 inspection, remux, and verification

**Files:**
- Create: `src/features/video-processing/inspect-media.ts`
- Create: `src/features/video-processing/remux-video.ts`
- Create: `src/features/video-processing/verify-remux.ts`
- Create: `src/features/video-processing/index.ts`
- Create: `src/features/video-processing/__fixtures__/README.md`
- Create: minimal generated MP4 fixtures under `src/features/video-processing/__fixtures__/`
- Test: `src/features/video-processing/remux-video.test.ts`
- Test: `src/features/video-processing/verify-remux.test.ts`

**Interfaces:**
- Produces: `inspectMedia(fileOrBlob, signal)`, `remuxVideo(file, plan, { signal? }): Promise<RemuxResult>`, and `verifyRemux(sourceInspection, outputInspection, ledger)`.
- `remuxVideo` validates MP4/H.264/optional AAC, a shared near-zero origin, equal track spans, first video key packet, size limits, and the supplied source duration before writing a Fast Start MP4.

- [x] Document deterministic FFmpeg fixture commands and generate tiny H.264-only, H.264+AAC, partial-boundary, and unsupported-input files.
- [x] Write failing integration tests for supported remuxes, exact duration, codecs/configuration, geometry/orientation, audio properties, packet-ledger correspondence, size failures, cancellation, and unsupported inputs.
- [x] Implement inspection using Mediabunny's MP4 input and encoded packet sink APIs; map expected failures to `RemuxError` codes.
- [x] Implement packet-copy remux using encoded packet sources and `fastStart: "in-memory"`, interleaving tracks by next timestamp and checking cancellation between batches.
- [x] Reinspect and verify one-to-one packet sequence, hashes, timestamps, durations, track configuration, target duration, and actual size; cleanup resources in `finally`.
- [x] Run the focused integration tests, full `pnpm test`, and `pnpm typecheck`.

### Task 4: Development-only harness

**Files:**
- Create: `src/features/video-processing/RemuxSpike.tsx`
- Create: `src/routes/__spike.remux.tsx`
- Modify: `src/styles.css`
- Generated: `src/routeTree.gen.ts`

**Interfaces:**
- Consumes: `inspectMedia`, `remuxVideo`, existing duration/loop target constants, and `createExtensionPlan`.
- Produces: unlinked `/__spike/remux` UI with select, inspect, target, Run/Cancel, elapsed time, output size, preview/download, verification, and typed-error display.

- [x] Create the route with a production `beforeLoad` guard that throws TanStack Router `notFound()` and development metadata that labels it clearly as an internal spike.
- [x] Build a minimal iOS-neutral harness using local component state and object-URL cleanup; do not import or modify `VideoSelection` or `/tool`.
- [x] Add only scoped harness styles, maintaining mobile width and preventing overflow.
- [x] Run route generation, `pnpm typecheck`, and `pnpm check`.

### Task 5: End-to-end validation and documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-11-local-remux-spike.md`

**Interfaces:**
- Records: implemented spike scope, command to open the development route, exact constraints, and pending physical-iPhone checklist.

- [x] Start the dev server and exercise file selection, supported remux, Cancel, typed failure, preview, download, console, layout, and absence of media network transfer in the browser.
- [x] Build production and verify `/__spike/remux` resolves not found while `/`, `/tool`, and `/privacy` remain unchanged.
- [x] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm build`.
- [x] Review `git diff --check`, `git status --short`, generated assets, lockfile, and final diff; remove unrelated or redundant files.
- [x] Mark completed plan checkboxes and report that physical-iPhone playback remains pending.
