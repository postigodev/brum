# Short video track compatibility

## Goal

Accept ordinary H.264/AAC MP4 files whose video track ends slightly before the container and audio track, while preserving local-only processing, packet-copy video quality, synchronized repetition, and exact output duration.

## Supported mismatch

The container and all tracks must still begin at time zero within the existing 1 ms tolerance. A video track may end up to 250 ms before the container when an AAC track covers the full container duration. Larger gaps, a short audio track, or non-zero track origins remain unsupported.

For an accepted gap, the container duration remains the authoritative source-cycle duration. Brumaire extends only the presentation duration of the final encoded video packet to the cycle boundary. Players therefore hold the last decoded frame during the gap, matching normal playback of the source file. Video payload bytes and AAC packets remain unchanged.

## Processing and verification

Inspection records the real video packet timeline instead of rejecting the accepted tail gap. Packet scheduling extends the last video packet in every complete repetition to the next cycle boundary, then applies the existing exact-output cutoff to the final repetition. Verification compares the output against that explicit ledger, so altered duration metadata is verified while packet hashes still prove byte preservation.

Existing strict rejection remains for unsupported codecs, layouts, origins, audio timelines, and gaps outside the bounded case. The product UI needs no new state: accepted files proceed normally; rejected files keep the existing timing error.

## Tests

Add a small deterministic H.264/AAC fixture with a 162 ms video tail gap. Tests must prove that inspection accepts it, a two-loop export is exact, every cycle holds the final frame through its boundary, video hashes and audio packets are preserved, and the existing invalid-timeline cases remain rejected.
