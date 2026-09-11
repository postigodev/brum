# Issue #32: sequential forward decoding

Baseline: main `b017527`, after #31 and #34. Physical iPhone timing remains pending.

## Measurement method

Run `pnpm exec vitest run --config vitest.benchmark.config.ts`. The benchmark runs alone, using
the checked-in synthetic h264-1080p.mp4 (300 frames, 1080p, 30 fps, 60-frame GOP with B-frames).
It generates a 15-second output at Original speed, with the full production verification path.
One warmup precedes three measured runs. Results are written to scripts/video-benchmark-results.json.
Do not compare it while running other tests or workloads. The initial mixed-suite run was discarded.

Diagnostics report non-overlapping elapsed stage intervals, including waits. These are wall times
at application boundaries, not CPU/GPU profiling: decoder prefetch and encoder work can overlap.
AVC encoding includes sample construction and awaited add(); finalization includes encoder flush
and mux completion. Verification includes its independent output decode. Source samples delivered
include metadata plus emission reads, not discarded decoder preroll; the benchmark separately
counts native VideoDecoder.decode() submissions, including verification, to expose that extra work.
Decode starts count application iterator starts, not an asserted count of internal browser seeks.
No media contents, stack traces or device details are added to the opt-in debug report.

## API investigation

Mediabunny 1.53.0 VideoSampleSink.samples(start,end) yields presentation order with bounded native
prefetch. Its iterator.return() closes queued native samples. samplesAtTimestamps() is intended for
sparse access; the installed documentation explicitly recommends samples() for sequential access.
Reverse still needs bounded presentation-order ranges and preceding-keyframe preroll. Retaining an
entire 60-frame 1080p I420 GOP would exceed 32 MiB (about 178 MiB); expanding the reverse cache is
not justified. GOP-aware partitioning is deferred rather than combined with the forward change.

## Physical validation — pending

The user must repeat runs on the same controlled real phone clip (including the reported ~17 MB
source), with the same device, iOS/Safari, settings and foreground conditions. Record warmup and
at least three before/after runs using debug=1. Verify saved output, rotation, native pixel format,
forward/reverse motion, timing, cancellation and memory stability. Synthetic desktop results do
not establish physical iPhone timing; do not close #32 until that validation is recorded.

## Results (2026-09-11, Windows desktop Chromium 151.0.7922.34)

Both versions use the same instrumentation, fixture, target and benchmark harness. Baseline was
measured before changing emission. Warmup is excluded from medians; full raw measurements are in
[issue-32-measurements.json](issue-32-measurements.json). No controlled real phone clip was available
for this run; that manual comparison remains with the user as requested.

| Measurement | Before | After |
| --- | ---: | ---: |
| Warmup elapsed | 16.677 s | 15.614 s |
| Run 1 | 26.262 s | 20.335 s |
| Run 2 | 23.865 s | 19.837 s |
| Run 3 | 23.107 s | 19.690 s |
| Median elapsed | 23.865 s | 19.837 s |
| Native decoder packet submissions (every run) | 5,098 | 2,555 |
| Forward iterator starts | 38 | 1 |
| Reverse iterator starts | 19 | 20 |
| Source samples delivered (metadata + emission) | 752 | 756 |
| Frames encoded / output duration | 450 / 15 s | 450 / 15 s |

Median elapsed decreased **16.9%**, and native decoder submissions decreased **49.9%**. The
submission count is the more stable evidence of removed work; these timings are not an iPhone
speed claim. Reverse needs one additional range at the turn because forward no longer retains
its final range for reuse. That adds four delivered samples but is outweighed by eliminated
forward preroll. No range size or GOP policy was changed.

| Stage interval median | Before (ms) | After (ms) |
| --- | ---: | ---: |
| Metadata scan | 681.4 | 661.3 |
| Forward decode wait | 12,157.3 | 104.0 |
| Reverse decode wait | 5,082.6 | 6,140.3 |
| Detachment | 1,273.9 | 1,308.5 |
| AVC construction/add | 2,700.0 | 9,502.2 |
| Finalization | 91.7 | 101.8 |
| Verification | 1,997.5 | 2,011.7 |

Per-stage medians need not sum to the median total. Sequential prefetch overlaps decoding with
encoding and moves some waiting into add(); do not interpret the forward interval reduction as
a CPU speedup of that magnitude or the add interval increase as an encoder regression.

## Ownership and validation

A forward iterator survives adjacent frames within a pass. Each decoder sample is detached with
the unchanged native-format copy contract, immediately closed, emitted with encoder backpressure,
and its owned bytes released in finally. The iterator is returned at direction changes, partial
output completion, cancellation and failure. Timestamp mismatch and premature EOF reject the
output; previously encoded partial frames are discarded by the existing output cancellation path.
Reverse retains the existing 8-frame / 32 MiB guard. Forward and reverse pixel ownership never
coexist. One extra encoding copy and browser-managed codec queues remain outside the range budget,
exactly as before. Metadata, MOV/HEVC capability handling, quality, speed and verification are intact.

Automated validation: 178 unit tests passed; 27 Chromium tests passed, with the two inherited
HEVC conversion tests skipped because this browser reports no decoder. Typecheck, Biome check,
production build and git diff --check passed. New regressions assert one forward stream per pass,
one owned forward frame, early iterator return, reverse failure cleanup, wrong timestamps,
premature EOF, stage/error attribution and deterministic timing accounting. MOV and all existing
speed/direction/1080p/native-format regressions remain green.
