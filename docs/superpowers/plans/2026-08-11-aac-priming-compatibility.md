# AAC Priming Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept ordinary negative AAC priming by re-encoding audio only while preserving the existing byte-copy H.264 path and exact target duration.

**Architecture:** Inspection classifies audio as none, packet-copy, reencode, or unsupported. A pure frame scheduler builds the audible PCM cycle; the fallback uses Mediabunny `AudioSampleSink` and `AudioSampleSource`, selecting native AAC encoding or a lazily registered encoder extension, while video remains on the existing packet ledger.

**Tech Stack:** TypeScript 6, Mediabunny 1.53, `@mediabunny/aac-encoder`, TanStack Start, React 19, Vitest, Biome, pnpm.

## Global Constraints

- Preserve H.264 video packets byte-for-byte in every strategy.
- Use packet-copy for aligned AAC and explicit audio-only re-encoding for supported priming timelines.
- Gate the fallback by native AAC `AudioDecoder` capability; Safari/iOS 26+ is the product target.
- Never add FFmpeg.wasm, discard audio, transcode video, or silently claim audio packet preservation.
- Preserve sample rate/channel count and keep container/video/audio within `0.001` seconds.
- Keep 50 MiB input, 200 MiB output, and 128 MiB decoded-cycle safeguards.
- Keep `/tool` unchanged and the harness development-only.

---

### Task 1: Timeline classification and frame planning

**Files:**
- Modify: `src/features/video-processing/types.ts`
- Modify: `src/features/video-processing/errors.ts`
- Create: `src/features/video-processing/audio-timeline.ts`
- Test: `src/features/video-processing/audio-timeline.test.ts`

**Interfaces:**
- Produces `AudioMode = "none" | "packet-copy" | "reencode"`, `AudioTimelineAnalysis`, `classifyAudioTimeline(...)`, and `createPcmCyclePlan(...)` with integer `cycleFrameCount`, retained frame slices, repetition offsets, and `outputFrameCount`.

- [x] Write tests proving aligned AAC selects packet-copy, negative priming selects reencode, discontinuities select unsupported, cycle frames equal `round(sourceDuration * sampleRate)`, and final output frames equal `round(outputDuration * sampleRate)`.
- [x] Run `pnpm vitest run src/features/video-processing/audio-timeline.test.ts` and confirm missing-interface failures.
- [x] Implement the classification/frame math and add `audio-decoder-unavailable`, `audio-encoder-unavailable`, `unsupported-audio-timeline`, and `audio-reencode-failed` codes.
- [x] Rerun the focused test and `pnpm typecheck`.

### Task 2: Audio fallback and strategy orchestration

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/features/video-processing/audio-capabilities.ts`
- Create: `src/features/video-processing/reencode-audio.ts`
- Modify: `src/features/video-processing/inspect-media.ts`
- Modify: `src/features/video-processing/remux-video.ts`
- Modify: `src/features/video-processing/verify-remux.ts`
- Modify: `src/features/video-processing/index.ts`
- Test: `src/features/video-processing/remux-video.test.ts`
- Test: `src/features/video-processing/verify-remux.test.ts`

**Interfaces:**
- `ensureAacEncoder()` uses `canEncodeAudio("aac")`, otherwise dynamically imports and registers `@mediabunny/aac-encoder` once.
- `addReencodedAudio({ inputTrack, output, timeline, plan, signal })` decodes/trim/repeats samples and returns chosen bitrate plus cleanup evidence.
- `remuxVideo` returns `audioMode` and optional `audioBitrate`; verification chooses packet hashes or decoded PCM continuity based on mode.

- [x] Add `@mediabunny/aac-encoder` and a normal FFmpeg priming fixture whose first AAC packet is negative.
- [x] Extend integration tests for unchanged fast path, fallback strategy reporting, preserved video ledger, capability errors, exact duration, and cancellation.
- [x] Implement capability loading, inspection classification, and the audio sample pipeline with `AudioSample.trim()`, integer-frame timestamps, prompt `close()`, and no repeated PCM accumulation.
- [x] Update verification so reencoded AAC proves codec/properties/duration/continuity without comparing source audio hashes.
- [x] Run focused tests, full `pnpm test`, and `pnpm typecheck`.

### Task 3: Development harness and documentation

**Files:**
- Modify: `src/features/video-processing/RemuxSpike.tsx`
- Modify: `src/styles.css`
- Modify: `src/features/video-processing/__fixtures__/README.md`
- Modify: `README.md`

**Interfaces:**
- Harness shows `Audio will be copied`, `Audio will be re-encoded`, or the unsupported reason before Run; output shows the actual strategy and chosen bitrate.

- [x] Add strategy/status copy without changing `/tool` or adding product navigation.
- [x] Document the normal AAC fixture command, Safari/iOS 26 capability boundary, and explicit audio-only fallback.
- [x] Run `pnpm check` and `pnpm typecheck`.

### Task 4: Validation and completion

**Files:**
- Modify: `docs/superpowers/plans/2026-08-11-aac-priming-compatibility.md`

**Interfaces:**
- Records automated/browser evidence and keeps physical-iPhone listening validation pending.

- [x] Browser-test aligned AAC packet-copy and negative-priming audio reencode, exact Duration/Loops output, preview, cancel/error states, console, mobile overflow, and no upload.
- [x] Verify production `/__spike/remux` returns 404 while product routes remain 200.
- [x] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, and `git diff --check`.
- [x] Review the complete diff and mark every completed checkbox.

## Validation record

- Automated: 50 tests across 9 files; typecheck, lint, formatting, production build, and diff checks pass.
- Browser: aligned AAC packet-copy and ordinary AAC priming re-encode both verified at two loops; the fallback produced an exact 2.000-second MP4 with no console warnings or mobile overflow.
- Production preview: `/`, `/tool`, and `/privacy` return 200; `/__spike/remux` returns 404.
- Pending: listening and share-sheet validation on a physical iPhone.
