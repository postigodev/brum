# AAC Priming Compatibility Design

## Purpose

Extend the local remux spike to accept ordinary MP4/AAC timelines whose encoder priming begins before time zero. Preserve the existing packet-copy fast path whenever the input is already aligned. When exact synchronized repetition is not safe through packet copying, re-encode only the audio and continue copying H.264 video packets byte-for-byte.

This is an explicit quality tradeoff, not a silent transcode. Inspection and the processing result both report which audio strategy applies. Physical-iPhone validation remains pending.

## Compatibility Boundary

The audio fallback targets browsers with native AAC decoding through `AudioDecoder`, including Safari/iOS 26 and newer. Eligibility is capability-based, not user-agent or version sniffing. Inputs that already satisfy the packet-copy timeline contract continue to work without that API.

When AAC priming requires the fallback but native AAC decoding is unavailable, Brumaire returns `audio-decoder-unavailable`. It does not discard audio, shift it heuristically, transcode video, or add FFmpeg.wasm.

AAC encoding uses the browser's native encoder when `canEncodeAudio("aac")` succeeds. Otherwise Brumaire dynamically imports `@mediabunny/aac-encoder` and registers it once through Mediabunny's supported extension API. The extension is not loaded on the packet-copy path.

## Strategy Selection

Inspection classifies audio as one of:

- `none`: the input has no audio track;
- `packet-copy`: AAC packets share the supported near-zero origin and source span;
- `reencode`: negative priming, an edit-list presentation offset, or AAC padding prevents safe repeated packet scheduling but the logical audible range can still be identified;
- `unsupported`: the timeline cannot be converted into one continuous audible cycle without guessing.

The inspection report exposes the classification and a concise reason. An `unsupported` classification is returned as inspection data so the harness can explain the incompatibility and disable Run; if processing is nevertheless called with it, `remuxVideo` throws `unsupported-audio-timeline`. The development harness shows `Audio will be copied` or `Audio will be re-encoded` before Run. `RemuxResult` reports `audioMode: "none" | "packet-copy" | "reencoded"` and the chosen output audio bitrate when applicable.

## Processing Architecture

Keep `remuxVideo(file, plan, options)` as the public entry point. Split its audio work behind a focused strategy boundary:

1. The existing packet-copy strategy schedules and verifies encoded AAC packets exactly as it does today.
2. The re-encode strategy uses `AudioSampleSink` to decode the logical audible source range, builds a normalized PCM cycle, repeats that cycle to the requested target, and feeds it to `AudioSampleSource` configured for AAC.
3. Video always uses the existing encoded-packet scheduler and ledger verification.

The fallback preserves the source sample rate and channel count. Its target bitrate is the source track's computed average encoded bitrate, constrained only to the AAC encoder's supported range; the chosen value is returned in the result. Decoder configuration, sample objects, and library resources are released promptly.

## PCM Timeline Rules

The source container duration remains the shared cycle duration used by `ExtensionPlan`. For every decoded audio sample:

1. Intersect its presentation interval with `[0, sourceDuration)`.
2. Convert the retained interval to integral PCM frame boundaries at the source sample rate.
3. Trim negative priming frames and trailing padding with `AudioSample.trim()`.
4. Normalize the first audible frame to zero while preserving the relative order of all retained frames.

The normalized cycle must be continuous within one PCM frame. Its authoritative `cycleFrameCount` is `round(sourceDuration * sampleRate)`, and its retained audible frames must fill `[0, cycleFrameCount)` without a gap or overlap larger than one frame. The frame-derived cycle duration must match the shared container cycle within one PCM frame; otherwise the input is `unsupported`. Gaps, overlaps, sample-rate changes, channel-count changes, or an empty audible cycle produce `unsupported-audio-timeline`.

All repetition and trimming math uses integer frames. For repetition `n`, cloned samples receive `n * cycleFrameCount` as their frame offset, converted to seconds only when assigning the sample timestamp. The authoritative output frame count is `round(plan.outputDuration * sampleRate)`, and the final sample is trimmed at that frame. Integer-second duration presets are exact sample boundaries; loop-derived targets must remain within the existing `0.001` second A/V tolerance after frame quantization. Every created or decoded `AudioSample` is closed after ownership passes or work is canceled.

## Verification

Packet-copy verification remains unchanged for video and aligned AAC. Re-encoded audio cannot use source-payload hashes, so verification instead proves:

- H.264 output packets still match the video ledger one-for-one;
- output audio is AAC with the original sample rate and channel count;
- decoded output audio begins at zero, has no gap or overlap larger than one PCM frame, and ends at the target within `0.001` seconds;
- container, video, and audio durations remain synchronized within `0.001` seconds;
- the result reports `audioMode: "reencoded"` and does not claim audio packet preservation.

Structural verification does not replace listening tests. The physical-iPhone checklist must include the first boundary, at least one internal loop boundary, and the final cutoff to catch clicks, silence, drift, or padding behavior.

## Errors and Cancellation

Add typed errors for:

- `audio-decoder-unavailable`;
- `audio-encoder-unavailable`;
- `unsupported-audio-timeline`;
- `audio-reencode-failed`.

Existing size, cancellation, remux, and verification errors remain. The same `AbortSignal` is checked during decoding, between PCM sample batches, during encoding, and before verification. Cancellation closes pending samples and the output, returns no partial Blob, and remains `canceled`.

The existing 50 MiB input and 200 MiB estimated/actual output limits stay in force. The fallback also rejects a decoded PCM cycle whose estimated in-memory size exceeds 128 MiB before repetition; it does not hold the fully repeated PCM output in memory.

## Fixtures and Validation

Add a deterministic MP4 fixture generated with ordinary FFmpeg AAC settings so its first AAC packet has negative priming. Keep the aligned AAC, video-only, and unsupported-codec fixtures.

Unit tests cover strategy classification, visible-range frame trimming, cycle continuity, exact final-frame trimming, bitrate selection, capability errors, cancellation cleanup, and result reporting. Existing packet-ledger tests continue to prove video preservation.

Browser validation covers:

- the aligned AAC fast path without loading the encoder extension;
- the negative-priming fixture through audio-only re-encoding;
- exact Duration and Loops outputs;
- audible playback across loop boundaries;
- explicit strategy copy in the harness;
- unavailable-decoder and cancellation errors;
- output preview/download, console cleanliness, mobile layout, and no media upload.

Run Vitest, strict TypeScript, Biome, and the production build. `/tool` remains unchanged and `/__spike/remux` remains unavailable in production.

## Non-goals

This change does not integrate processing into `/tool`, transcode video, support non-AAC audio, add FFmpeg.wasm, claim support below Safari/iOS 26 for the fallback, change duration presets, add sharing, or claim physical-iPhone validation before it occurs.
