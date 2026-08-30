# Brumaire Local Remux Spike Design

> [!WARNING]
> **Historical and superseded.** This design records the former packet-copy/remux architecture. Its H.264 packet-preservation, no-decode/no-transcode, and audio-preservation assumptions are superseded by [#2](https://github.com/postigodev/brumaire/issues/2) and cleanup in [#6](https://github.com/postigodev/brumaire/issues/6); consult [#3](https://github.com/postigodev/brumaire/issues/3) and [#4](https://github.com/postigodev/brumaire/issues/4) for current behavioral and resource implications. The design remains unchanged below as historical evidence and is not a current requirement; see `AGENTS.md`.

## Purpose

Prove that Brumaire can turn a short local MP4 into a longer, exact-duration MP4 on an iPhone-class browser without uploading media or recompressing its supported tracks. The spike validates the riskiest processing assumption before the production `/tool` workflow gains a Process action.

The spike is successful only if it produces a playable, downloadable MP4 by copying H.264 video packets and optional AAC audio packets into a new timeline. It does not claim iPhone support until the user later validates the documented checklist on a physical device.

## Platform and Input Scope

Safari on iPhone is the product gate. Chrome and WebKit available during development provide faster feedback but do not replace the later physical-device check.

The first supported input is a local MP4 with:

- exactly one primary H.264/AVC video track;
- zero or one primary AAC audio track;
- a finite positive duration;
- a first video packet that is a random-access/key packet;
- no unsupported additional media tracks.

Other containers, HEVC, WebM, multiple video/audio tracks, subtitles, timed metadata, encrypted media, and malformed MP4 structures are rejected explicitly. There is no automatic transcode fallback.

## Chosen Approach

Use Mediabunny as the only media-processing dependency. Its MP4 reader and writer operate in the browser, and its encoded-packet APIs allow H.264 and AAC packets to be copied without invoking WebCodecs decoders or encoders.

The spike uses the packet-level APIs rather than an unconfigured `Conversion`. Trimming can cause a general conversion pipeline to leave its direct-copy fast path, particularly for audio. Brumaire must therefore control packet repetition, timestamps, and the final packet duration directly so that no hidden recompression occurs.

FFmpeg.wasm is not added. Its in-memory virtual filesystem, large WASM core, and mobile memory cost are poor defaults for the Safari-first case. WebCodecs re-encoding is also excluded because it changes quality and complete audio encoding support requires newer Safari versions.

## Architecture

Create a focused `src/features/video-processing/` feature boundary with three responsibilities:

1. **Inspection:** parse the local MP4, identify tracks and codec configuration, enforce the supported-input contract, and report dimensions, orientation, duration, and estimated output size.
2. **Packet scheduling:** convert the existing `ExtensionPlan` into repeated packet timestamps and a final cutoff without touching encoded payload bytes.
3. **Remuxing and verification:** write the scheduled packets to a Fast Start MP4, then inspect the resulting Blob and verify its externally meaningful invariants.

The public processing contract accepts a local `File`, the already-tested `ExtensionPlan`, and an optional `AbortSignal`. It resolves with:

- a `Blob` whose MIME type is `video/mp4`;
- exact inspected output duration;
- output byte size;
- video and optional audio track summaries;
- a verification report stating which invariants passed.

Expected user or media incompatibilities use a typed `RemuxError` with a stable code. Unexpected library/programming failures retain their cause but surface as a generic remux failure at the feature boundary.

The processing module has no React imports, network calls, server functions, persistence, or global state.

## Data Flow

1. Reject an input larger than `50 MiB` before reading it into the media pipeline.
2. Inspect the MP4 and validate the track, codec, duration, and initial-key-packet requirements.
3. Confirm that the supplied `ExtensionPlan.sourceDuration` matches the inspected media duration within `0.001` seconds. Treat the input container timeline as the shared clock: every supported track must begin at zero within `0.001` seconds and end at the inspected source duration within the same tolerance. Preserve gaps inside a track, but reject non-zero leading offsets, unequal track spans, timestamps outside the source span, or presentation/decode ordering that cannot be represented safely as `unsupported-timeline`.
4. Estimate output bytes conservatively as `input.size * plan.totalPlays`. Reject estimates above `200 MiB` before allocating output buffers.
5. Create an MP4 output with in-memory Fast Start metadata and encoded video/audio packet sources configured from the input tracks.
6. Iterate source packets in decode order. Normalize the shared near-zero input origin to exactly zero for every track, then, for repetition `n`, add `n * plan.sourceDuration` to every packet timestamp. Clone packets while preserving encoded data, packet type, decoder configuration, dimensions, rotation, color information, channel count, and sample rate. Do not normalize tracks independently.
7. Do not add a packet whose normalized timestamp starts at or beyond the target duration. If the final packet crosses the target, clone it with its duration shortened to the remaining timeline duration; do not alter its payload.
8. Feed video and audio in timestamp lockstep so the writer does not buffer an entire track while waiting for the other.
9. Finalize the MP4 and create a `video/mp4` Blob.
10. Reject the finalized Blob if its actual size exceeds `200 MiB`, reopen it with Mediabunny, and run the output verification contract before returning it.

The output timeline begins at zero. Negative source timestamps, unsupported edit-list behavior, or packet ordering that cannot be normalized safely cause a typed failure rather than guesswork.

## Exactness and Preservation

The output container duration, video duration, and audio duration when present must each equal the requested duration within `0.001` seconds. The final video or AAC packet may advertise a shorter container duration, but its encoded payload remains byte-for-byte unchanged.

Verification confirms:

- one H.264 track and zero or one AAC track;
- the same codec strings and decoder configurations;
- unchanged encoded width, height, display orientation, pixel aspect ratio, and available color metadata;
- unchanged audio sample rate and channel count;
- each output track's packets match a scheduler-produced ledger one-for-one and in decode order. Each ledger entry records the source track and packet index, repetition index, expected payload hash, packet type, timestamp, and duration. Verification requires the expected packet count, sequence, payload hash, packet type, timestamp, and duration, allowing only the explicitly scheduled final packet duration to differ from its source packet;
- the requested exact timeline duration;
- no unexpected or discarded track.

This validates packet preservation, not perceptual equality. Physical Safari playback remains necessary because AAC priming, edit lists, B-frames, and player handling of shortened final packet durations may reveal limitations that structural inspection cannot prove.

If exact synchronized playback cannot be achieved through packet remuxing, the spike reports that result and the project revisits the FFmpeg.wasm or explicit-transcode alternatives. It must not silently loosen duration, discard audio, or change quality.

## Resource Limits and Cancellation

The spike processes everything locally and keeps the final output in memory. It has two fixed initial safeguards:

- maximum input size: `50 MiB` (`52_428_800` bytes);
- maximum conservative output estimate: `200 MiB` (`209_715_200` bytes).

These are spike limits, not a permanent product promise. They can be revised only after physical-device measurements.

An optional `AbortSignal` is checked before inspection, between packet batches, and before verification. Cancellation stops further packet work, releases Mediabunny resources, does not return a partial Blob, and throws the typed `canceled` error.

## Error Contract

Typed codes cover at least:

- `input-too-large`;
- `output-too-large`;
- `invalid-container`;
- `invalid-duration`;
- `plan-duration-mismatch`;
- `unsupported-video-codec`;
- `unsupported-audio-codec`;
- `unsupported-track-layout`;
- `missing-initial-key-packet`;
- `unsupported-timeline`;
- `canceled`;
- `verification-failed`;
- `remux-failed`.

Errors include concise development-facing detail without file bytes, user paths, or media contents. The future product UI will map these codes to replaceable user copy; that mapping is outside this spike.

## Development Harness

Add an unlinked internal route at `/__spike/remux`. It is available only in development and resolves as not found in production.

The harness provides only what is needed to exercise the processing contract:

- local file selection;
- source inspection result;
- existing Duration and Loops presets;
- a Run/Cancel action;
- elapsed time and output size;
- output preview and download;
- the verification report and typed error code.

It is explicitly labeled as a development spike and does not reuse or alter the polished `/tool` interface. It has no production navigation entry, no upload behavior, and no product-ready progress claims.

## Testing and Validation

Keep existing Vitest. Add unit tests for packet timestamp normalization, repetition boundaries, exact final-duration shortening, size guards, plan/source mismatch, cancellation checkpoints, and error mapping.

Add small deterministic MP4 fixtures generated from a documented FFmpeg command:

- H.264 video without audio;
- H.264 video with AAC audio;
- a source whose duration divides the target;
- a source requiring a shortened final packet;
- an unsupported codec or track-layout fixture.

Integration tests remux fixtures and reinspect the Blob. They assert duration tolerance, codec/track preservation, dimensions/orientation, audio properties, packet-ledger correspondence, and absence of discarded tracks. Negative verifier tests prove that omitted, duplicated, reordered, payload-altered, or unexpectedly duration-altered packets fail verification. Fixture binaries remain minimal, have documented generation commands, and are the only committed media assets added by the spike.

Run Vitest, Biome, strict TypeScript checking, and the production build. The production build must not expose a usable spike route. Browser validation covers development-route availability, file selection, Run/Cancel, preview, download, typed errors, no network media transfer, no console errors, and no horizontal overflow.

The later physical-iPhone checklist covers:

1. loading a representative Boomerang-style MP4 with and without audio;
2. producing 15-second and multi-loop outputs;
3. synchronized playback through the final boundary;
4. preserved orientation and visual quality;
5. download and opening in the iOS media viewer;
6. peak responsiveness and memory behavior;
7. repeating the run after cancellation and after an error.

Until that checklist passes, documentation must say Safari/iPhone validation is pending.

## Non-goals

This spike does not integrate processing into `/tool`, add product progress UI, invoke the Share Sheet, support arbitrary codecs, transcode, resize, rotate pixels, change bitrate, normalize audio, run in a worker, stream output to disk, upload media, persist files, add analytics, or claim production-ready iPhone support.
