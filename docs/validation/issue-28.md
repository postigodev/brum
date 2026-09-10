# Issue #28: bounded decoded-memory processing

Implemented against Mediabunny **1.53.0**. Physical iPhone Safari acceptance is **pending**.
The tester reported that PR #31 at `5c39223` gets past the old memory error but fails with
`processing-failed` on the original approximately 10-second/7.3 MB H.264 MP4. No underlying
operation was identified in that revision. Testing `b0955ec` subsequently located the failure at
the first `video-sample-add`: `TypeError: layout size is invalid`, after 252 metadata frames,
one range, and zero encoded frames. The packed-RGBA reconstruction revision below still requires
a physical retest; this document does not certify acceptance or close the issue.

## Packed RGBA reconstruction boundary

WebKit's [layout validation](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/webcodecs/WebCodecsVideoFrameAlgorithms.cpp)
uses the reported error when the supplied plane count differs from the pixel format's plane count.
That is strong evidence for investigating the reconstructed sample's layout, not proof that this
iPhone returned multiple planes: the original report did not contain plane metadata.

The [WebCodecs copy contract](https://www.w3.org/TR/webcodecs/#dictdef-videoframecopytooptions)
uses the visible region and a tightly packed destination when `rect` and `layout` are omitted.
RGBA is a single plane. Inspection of installed Mediabunny 1.53.0 confirmed that native-backed
`allocationSize`/`copyTo` delegate to WebCodecs and that the raw `VideoSample` constructor creates
the appropriate default layout when none is supplied. `toVideoFrame()` later passes that internally
generated layout to the native constructor during encoding.

Brum now reconstructs without resupplying the browser-returned layout. Before returning a detached
frame, and again before reconstruction, it requires `pixels.byteLength === codedWidth * codedHeight * 4`.
It does not pad an undersized copy or relabel potentially planar bytes to hide conversion failure.
The existing 32 MiB / 8-frame budget and immediate decoder-sample cleanup remain.

In Mediabunny 1.53.0, `codedWidth`/`codedHeight` expose `visibleRect.width`/`height`, not necessarily
the backing frame's allocation dimensions. Those are the dimensions of the default copied region.
The reconstructed sample starts at `(0, 0)`; reapplying the source crop offset would crop twice.
Display dimensions, rotation, timing and color metadata are preserved. Browser tests verify the
exact cropped pixels, non-square display geometry and 90-degree rotation, including a synthetic
two-plane returned layout with valid packed pixels. The real phone source's visible rectangle is
still unobserved; the expanded report makes it available for the next physical test.

## Temporary preview diagnostics

Open the updated PR #31 Vercel preview at `/tool?debug=1` before selecting the original file.
Choose the same settings that failed and create the boomerang. An open **Processing diagnostics**
panel below the preview shows local progress and keeps the final error report available for text
selection/copying. Send that report back before choosing a Safari workaround. A new attempt or
selection/settings change resets the report. Remove `debug=1` to hide the panel.

The expanded report separates the **copy-returned** plane count, offsets and strides from the
default one-plane **reconstruction** layout. It also includes source/requested pixel formats,
buffer byte length, copied coded dimensions, display dimensions and the source visible rectangle.
No pixel bytes are included. The first copied frame's diagnostic remains visible after success;
on a copy/construction/add failure it describes the affected frame. `source frame count` is the
total number of frames, while `source frame index` identifies a zero-based position.

The report includes the processing code, stable stage identifier, underlying exception name and
message, metadata-frame count, decoded-range count, encoded/output-frame counts, and zero-based
source/range/output indices and direction when applicable. Counts describe completed work; the
stage and indices identify the operation being attempted. `range-decode-seek` includes Mediabunny
preroll and range iteration; an index on a failed iterator read is the next expected source frame.

Stages distinguish source inspection, decoder and encoder capability checks, metadata scanning,
timeline planning, output start, range seek/decode, range validation, decoded-frame copy,
encoding-sample construction, `VideoSampleSource.add()`, finalization, and output verification.
`ProcessingError.cause` retains the original exception object; the first failure snapshot survives
outer error conversion and cleanup. Progress uses one coalesced snapshot, with no growing event log.

The opt-in panel renders only allowlisted fields, never stack traces, serialized error objects,
file/media contents or browser/user details. Displayed messages use the first line, are capped at
600 characters, and redact the selected filename, resource URLs and common local paths. The original
exception message remains intact in `cause`. No report is uploaded or persisted by Brum. Normal
product error copy is unchanged. These diagnostics do not change the range architecture, sample
color metadata, codec settings, or cancellation semantics.

## Architecture and API investigation

1. `VideoSampleSink.samples()` scans actual decoded presentation timestamps and durations,
   measures `allocationSize({ format: "RGBA" })`, and immediately calls `close()`. Only timings
   and range indices survive; this also preserves the existing handling of B-frame presentation
   order and variable frame timing without assuming packet order equals decoded order.
2. Ranges are partitioned by actual RGBA allocation size and a fixed frame-count limit.
   `VideoSampleSink.samples(startTimestamp, endTimestamp)` retrieves each range in presentation
   order. Mediabunny performs keyframe seeking, preroll decoding/discard, and B-frame handling.
   Start is inclusive and end is exclusive, using the timestamps from the initial scan.
3. `copyTo(..., { format: "RGBA" })` detaches only that range; each decoder sample closes as
   soon as the copy finishes. The unchanged boomerang timeline selects forward/reverse indices,
   speeds, complete cycles, and final partial-frame durations. A range may be reused at a turn;
   it is released before the next range loads and on completion or failure.
4. `new VideoSample(pixels, timingAndGeometry)` creates a temporary encoding sample.
   Awaited `VideoSampleSource.add()` respects encoder backpressure; the temporary sample closes
   in `finally`. Output remains local, silent AVC/H.264 MP4 and passes existing output verification.

`getSample(timestamp)` and `samplesAtTimestamps()` were also examined. Descending sparse access
in 1.53.0 flushes/redecodes on backwards seeks; bounded ascending ranges amortize that work over
multiple frames. Ranges can start inside GOPs, so long GOPs increase work rather than the number
of retained pixels. The forward pass uses the same range mechanism for simple ownership, at the
cost of redundant preroll decoding there too. No custom packet reversal or codec was introduced.

Native `VideoSample.clone()` can retain decoder-backed surfaces. Copying native plane formats could
reduce bytes, but introduces format/layout and cross-browser conversion variability. This change
keeps the proven RGBA detachment and deterministic ownership from #16. Pixel-format optimization
is optional future work, not necessary to remove whole-clip retention.

## Bound and cleanup

- At most **8 retained frames and 32 MiB** of range RGBA. Both limits apply independently.
  The byte check includes the next copy and runs **before** allocating its `Uint8Array`.
- At 1920x1080, a range contains at most four frames: **33,177,600 bytes (31.64 MiB)**.
- The temporary encoding sample copies at most one more frame: at most **64 MiB** for the
  range plus that sample in the general case, or **39.55 MiB** at 1080p. These figures are
  application pixel ownership bounds, **not total tab/process memory bounds**.
- Mediabunny's decoder prefetch, codec reference/reorder surfaces, conversion surfaces and encoder
  queues use additional memory. The application awaits adds and has only one active range iterator.
  Compressed input/output and lightweight metadata are outside the decoded-range budget.
- A single frame above 32 MiB is rejected. Total source-frame count is not a rejection criterion.
- The old `collectDecodedVideoSamples()` whole-clip path was removed. Its replacement,
  `collectDecodedVideoRange()`, cannot accumulate an arbitrary number of small frames either.
- Range iterators are returned on completion/error; samples and buffers close/release on failure,
  cancellation and success. Late samples arriving after an interrupted read are closed too.
  Existing operation deadlines, `Input.dispose()`, `Output.cancel()` and bounded cleanup remain.

## Automated validation

- Unit coverage: metadata-only scan, byte and frame caps, rejection before allocation, repeated
  forward/reverse cycles with a tiny working-set budget, range-timeline mismatch, encoder failure,
  cancellation, late decoder results, and existing copy/encode cleanup regressions.
- Chromium: deterministic H.264 10-second 1080p/30 fixture, 300 source frames with B-frames and
  GOPs larger than a range. Verifies every output color state through 15 seconds of forward/reverse
  playback. Whole-clip RGBA would require 2,488,320,000 bytes, exceeding the former 256 MiB guard.
- Existing directional, exact-duration, cycle, speed, silence and 120-frame regressions preserved.

## Physical iPhone Safari acceptance — still pending

Before closing #28, record device model, iOS/Safari version, revision, elapsed processing time and
results using the supported H.264 MP4 path. Keep personal media out of the repository.

- Process the reported approximately 10-second/7.3 MB phone clip and the synthetic 1080p fixture.
  Confirm no total-frame-count memory error, tab reload, decoder stall or unresponsive UI.
- Exercise exact-duration and cycle targets at original, boomerang and slow-motion speeds.
  Inspect forward/reverse motion, target duration, silence, preview and saved MP4 playback.
- Cancel during the metadata scan, a later range decode and encoding; retry successfully afterwards.
- Repeat several runs to assess resource reclamation, memory pressure and device heating.

Safari-specific risks remain: WebKit decoder surface/reordering behavior, AVC encoder availability,
RGBA copy/conversion costs, repeated keyframe seeks with long phone-video GOPs, mobile thermal limits,
and browser-managed memory beyond the owned range. Chromium success does not establish those results.
