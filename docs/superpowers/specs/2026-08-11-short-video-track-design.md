# Short video track compatibility

> [!WARNING]
> **Historical and superseded.** This design records tail-gap handling within the former packet-copy/remux and audio-preservation architecture. Those assumptions are superseded by [#2](https://github.com/postigodev/brumaire/issues/2) and cleanup in [#6](https://github.com/postigodev/brumaire/issues/6); consult [#3](https://github.com/postigodev/brumaire/issues/3) and [#4](https://github.com/postigodev/brumaire/issues/4) for current behavioral and resource implications. The design remains unchanged below as historical evidence and is not a current requirement; see `AGENTS.md`.

## Goal

Accept ordinary H.264/AAC MP4 files whose video track ends slightly before the container and audio track, while preserving local-only processing, packet-copy video quality, synchronized repetition, and exact output duration.

## Supported mismatch

The container and all tracks must still begin at time zero within the existing 1 ms tolerance. A video track may end up to 250 ms before the container when an AAC track covers the full container duration. Larger gaps, a short audio track, or non-zero track origins remain unsupported.

For an accepted gap, the container duration remains the authoritative source-cycle duration. Brumaire offsets each repetition by the complete container cycle. Before a following cycle, the MP4 muxer derives the latest-presented sample's duration from the next keyframe, explicitly holding that frame through the boundary; after the final cycle, the container and AAC tail keep the final frame visible as in the source. Video payload bytes and AAC packets remain unchanged.

## Processing and verification

Inspection records the real video packet timeline instead of rejecting the accepted tail gap. Packet scheduling models the muxer's derived hold duration before subsequent cycles and leaves the final source tail intact. Verification requires the container and full-length AAC to reach the exact target while checking the output video duration against the final scheduled video packet; packet hashes prove byte-for-byte payload preservation.

Existing strict rejection remains for unsupported codecs, layouts, origins, audio timelines, and gaps outside the bounded case. The product UI needs no new state: accepted files proceed normally; rejected files keep the existing timing error.

## Tests

Add a small deterministic H.264/AAC fixture with a 162 ms video tail gap. Tests must prove that inspection accepts it, a two-loop container/AAC export is exact, every cycle preserves the source tail gap, a duration cutoff inside the tail gap remains exact, video hashes and audio packets are preserved, and the existing invalid-timeline cases remain rejected.
