# Issue #29: QuickTime and HEVC input

Implemented on main after #31 with Mediabunny 1.53.0. Physical iPhone Safari validation is pending.

Input uses the explicit MP4 and QTFF format singletons for duration inspection, full source
inspection and decoding. Actual container/track parsing is authoritative; extensions and provider
MIME types are picker hints only. Only AVC and HEVC video codecs are allowed. The existing
track.canDecode() check evaluates the specific track before decoding; no user-agent inference or
software fallback is added. AVC encoder capability is checked independently.

Output remains silent AVC/H.264 MP4 and passes the existing geometry, timeline, duration and audio
verification. Input/output codecs need not match. Unsupported containers, codecs and track layouts
retain distinct typed errors. Unknown codec parsing errors retain their cause.

Bounded ranges, the 32 MiB / 8-frame limit, owned native pixel formats/layouts, color metadata,
rotation, cancellation and deterministic cleanup are unchanged from #31. Debug diagnostics remain
available with /tool?debug=1. No Live Photo pairing, extra tracks, HEVC output, performance redesign,
backend processing or conversion dependency was introduced.

Synthetic tests cover real QTFF AVC processing and directional ordering; HEVC in MP4 and MOV;
capability-denied failures before metadata decoding; AVC output from supported HEVC; invalid content
and unsupported VP9; and picker processing with absent or misleading MIME metadata.
HEVC processing tests skip when the track reports no local decoder. Existing timing/speed,
working-set ownership and cleanup regressions remain part of the complete suite.

## Physical validation — pending, user-run

Do not close #29 on automated results alone. Record device model, iOS version and Safari version,
then test a camera-generated MOV, HEVC camera source if available, and the known H.264 regression
source. For each, verify selection, successful processing, orientation, forward/reverse motion,
exact-duration/cycle targets, silent H.264 MP4 output, save/share and cancellation. Use debug=1
and preserve the diagnostic report on any failure. No personal camera media belongs in the repo.

Real phone HEVC profiles, bit depths, color metadata and native reconstruction depend on the
browser/device. Synthetic Chromium coverage cannot certify these physical Safari combinations.

## Automated validation (2026-09-11)

- pnpm test: 169 passed.
- pnpm test:browser: 27 passed, 2 HEVC conversion tests skipped because the Chromium track
  capability probe returned false. MOV AVC processing and forced-unavailable HEVC paths passed.
- pnpm typecheck, pnpm check, pnpm build and git diff --check passed.
- No changes to decoded-video-buffer.ts, decoded-video-ranges.ts or boomerang-timeline.ts.

These results do not verify HEVC encoding input on a physical iPhone or close the device criterion.
