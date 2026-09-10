# Issue #28: bounded decoded-memory processing

Implemented against Mediabunny **1.53.0**. Physical iPhone Safari validation is **pending**;
this document does not certify the physical-device acceptance criterion or close the issue.

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

## Physical iPhone Safari smoke test — not performed

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
