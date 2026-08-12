# Short Video Track Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Process H.264/AAC MP4s whose video ends up to 250 ms before full-length AAC audio by preserving the source tail gap through each repetition boundary.

**Architecture:** Inspection accepts only a bounded video-tail gap while retaining strict zero-origin and audio-duration checks. Packet scheduling offsets repetitions by the authoritative container duration and models the MP4 muxer's derived final-sample duration before each following keyframe. Verification requires exact container/AAC output and derives the expected video end from the final scheduled packet.

**Tech Stack:** TypeScript, Mediabunny, Vitest, React integration through the existing `/tool` flow.

## Global Constraints

- Input remains one H.264 video track with at most one AAC audio track.
- All track origins remain within 1 ms of zero.
- The accepted video-only tail gap is at most 250 ms and requires AAC audio to cover the container duration within 1 ms.
- Video and packet-copy audio payload bytes remain unchanged.
- Output duration remains exact within the existing 1 ms tolerance.
- No new runtime dependency or UI state.

---

### Task 1: Bounded inspection and cycle-aware scheduling

**Files:**
- Modify: `src/features/video-processing/inspect-media.ts`
- Modify: `src/features/video-processing/packet-schedule.ts`
- Test: `src/features/video-processing/packet-schedule.test.ts`

**Interfaces:**
- Consumes: `MediaInspection.duration`, `VideoTrackSummary.duration`, `AudioTrackSummary.duration`, and `ExtensionPlan`.
- Produces: `MAX_VIDEO_TAIL_GAP_SECONDS = 0.25`; unchanged `scheduleTrackPackets(track, packets, plan, signal?)` behavior that preserves video tail gaps.

- [ ] **Step 1: Add failing scheduler tests**

Add cases using packets that end at `0.84` for a `1` second cycle. Assert the next cycle starts at `1`, preserving the 160 ms gap, and that a final output cutoff at `1.9` leaves the final video packet ending at `1.84` while full-length audio remains authoritative.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm test -- src/features/video-processing/packet-schedule.test.ts`

Expected: the new assertions fail because the scheduler currently leaves a gap at each repetition boundary.

- [ ] **Step 3: Implement minimal timeline support**

In inspection, validate video origin separately, require exact video duration for silent files, and for files with audio accept only `containerDuration - videoDuration` in `[0, 0.25]` while requiring audio duration to match the container within `0.001`. Keep scheduling unchanged so source bytes, packet timestamps, durations, and the bounded gap are preserved.

- [ ] **Step 4: Run the focused scheduler test**

Run: `pnpm test -- src/features/video-processing/packet-schedule.test.ts`

Expected: PASS.

### Task 2: Real-file regression and full remux verification

**Files:**
- Create: `src/features/video-processing/__fixtures__/h264-aac-short-video.mp4`
- Modify: `src/features/video-processing/__fixtures__/README.md`
- Modify: `src/features/video-processing/remux-video.ts`
- Test: `src/features/video-processing/remux-video.test.ts`

**Interfaces:**
- Consumes: the cycle-aware `scheduleTrackPackets` interface from Task 1.
- Produces: the existing `remuxVideo(file, plan, options)` behavior for bounded short-video files, with no public API change.

- [ ] **Step 1: Create a deterministic regression fixture**

Generate a tiny H.264/AAC MP4 whose container and audio last 1 second and whose video lasts about 0.84 seconds. Record the exact ffmpeg command and intended timing in the fixture README; do not commit the user's 8.5 MB file.

- [ ] **Step 2: Add failing integration assertions**

Inspect the fixture and assert a positive video tail gap below `0.25`. Remux two loops and assert exact 2-second container, video, and audio durations; `audioMode: "packet-copy"`; successful packet-ledger verification; and unchanged source/output video packet hashes per repetition.

- [ ] **Step 3: Run the focused integration test and confirm failure**

Run: `pnpm test -- src/features/video-processing/remux-video.test.ts`

Expected: FAIL until verification accepts the explicitly scheduled short video track duration.

- [ ] **Step 4: Wire the video track duration into scheduling**

Compute expected output video duration from the maximum `timestamp + duration` in the video ledger. Require the container and AAC track to match `plan.outputDuration`, while the video track matches that ledger-derived end.

- [ ] **Step 5: Run focused tests**

Run: `pnpm test -- src/features/video-processing/packet-schedule.test.ts src/features/video-processing/remux-video.test.ts`

Expected: PASS.

### Task 3: Product and release validation

**Files:**
- Modify only if a failure exposes a required correction in the files above.

**Interfaces:**
- Consumes: the complete local video-processing feature.
- Produces: verified `/tool` acceptance of the reported timing pattern.

- [ ] **Step 1: Run repository checks**

Run sequentially: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm build`.

Expected: every command exits zero.

- [ ] **Step 2: Browser-test the user's local MP4**

On `/tool`, select `C:\Users\akuma\Downloads\osintxv_1747016990_highlight18077484721760614.mp4`, choose 45 seconds, extend locally, and verify a ready 45-second preview with no timing error, console error, media upload request, or horizontal overflow.

- [ ] **Step 3: Review and commit**

Run `git diff --check`, inspect `git status --short`, ensure only the spec, plan, focused code/tests, and tiny fixture changed, then commit the implementation with `fix: support short video tracks`.
