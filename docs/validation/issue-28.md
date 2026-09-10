# Issue #28: bounded decoded-memory processing

Implemented against Mediabunny **1.53.0**. Physical iPhone Safari acceptance is **pending**.
The tester reported that PR #31 at `5c39223` gets past the old memory error but fails with
`processing-failed` on the original approximately 10-second/7.3 MB H.264 MP4. No underlying
operation was identified in that revision. Testing `b0955ec` subsequently located the failure at
the first `video-sample-add`: `TypeError: layout size is invalid`, after 252 metadata frames,
one range, and zero encoded frames. The next physical test of `48f6958` failed the explicit
RGBA buffer invariant: source NV12, two planes at offsets 0 / 2073600 and strides 1080 / 1080,
3,110,400 bytes for 1080x1920. Those bytes are NV12, not RGBA. Physical acceptance remains pending.

## Native pixel reconstruction boundary

Brum now calls `allocationSize()` and `copyTo(pixels)` without requesting conversion, retaining
`sample.format`, returned plane layout, and owned bytes together. Reconstruction passes that same
format and layout to the raw `VideoSample` constructor. No decoder surfaces survive detachment.
The installed Mediabunny 1.53.0 delegates these calls to native VideoFrame; avoiding the conversion
request removes the incorrect assumption observed on the physical iPhone.

Validation checks the supported raw format, plane count, row size, byte bounds and plane overlap
before returning the detached frame and again before reconstruction. Null/unknown formats and
inconsistent representations fail with `unsupported-pixel-representation`, preserving the cause.
All public Mediabunny raw formats are covered, including NV12, planar YUV, alpha/high-bit-depth
variants and packed RGB. Mediabunny's raw-buffer copy truncates chroma for odd widths; incomplete
copies are explicitly rejected rather than relabeled or padded. No conversion fallback was added.

The [WebCodecs copy contract](https://www.w3.org/TR/webcodecs/#dictdef-videoframecopytooptions)
copies the visible region by default. Mediabunny 1.53.0 codedWidth/Height expose visible dimensions,
so reconstruction rebases that copied region to (0, 0), without applying the source crop twice.
The observed phone visible rectangle is 0,0,1080,1920. Display geometry, rotation, timing and color
metadata remain preserved; browser coverage checks cropped pixels and rotated display geometry.

## Temporary preview diagnostics

Open the updated PR #31 Vercel preview at `/tool?debug=1` before selecting the original file.
Choose the same settings that failed and create the boomerang. An open **Processing diagnostics**
panel below the preview shows local progress and keeps the final error report available for text
selection/copying. Send that report back before choosing a Safari workaround. A new attempt or
selection/settings change resets the report. Remove `debug=1` to hide the panel.

The expanded report separates the **copy-returned** plane count, offsets and strides from the
same native **reconstruction** layout. It also includes source/retained pixel formats,
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
   measures `allocationSize()`, and immediately calls `close()`. Only timings
   and range indices survive; this also preserves the existing handling of B-frame presentation
   order and variable frame timing without assuming packet order equals decoded order.
2. Ranges are partitioned by actual native-format allocation size and a fixed frame-count limit.
   `VideoSampleSink.samples(startTimestamp, endTimestamp)` retrieves each range in presentation
   order. Mediabunny performs keyframe seeking, preroll decoding/discard, and B-frame handling.
   Start is inclusive and end is exclusive, using the timestamps from the initial scan.
3. `copyTo(pixels)` detaches only that range; each decoder sample closes as
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

Native `VideoSample.clone()` can retain decoder-backed surfaces; owned byte copies avoid that.

## Bound and cleanup

- At most **8 retained frames and 32 MiB** of native-format range pixels. Both limits apply independently.
  The byte check includes the next copy and runs **before** allocating its `Uint8Array`.
- At 1080x1920 NV12, eight frames use **24,883,200 bytes (23.73 MiB)**. RGBA still fits
  four frames at **33,177,600 bytes (31.64 MiB)**.
- The temporary encoding sample copies at most one more frame: at most **64 MiB** for the
  range plus that sample in the general case, or **26.70 MiB** for this NV12 geometry (**39.55 MiB** for RGBA). These figures are
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
Native pixel reconstruction compatibility, repeated keyframe seeks with long phone-video GOPs, mobile thermal limits,
and browser-managed memory beyond the owned range. Chromium success does not establish those results.

Native-format regressions cover every public raw format in unit tests, NV12/I420/RGBA/BGRA
through native VideoFrame reconstruction in Chromium, mismatches/null formats, actual 1080p NV12
byte accounting, and the unchanged directional/timing/speed/cleanup suite. Physical iPhone
encoding, repeated seeks, performance and successful output still require the next same-source test.
