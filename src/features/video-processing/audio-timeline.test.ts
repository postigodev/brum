import { describe, expect, it } from "vitest"

import { classifyAudioTimeline, createPcmCyclePlan } from "./audio-timeline"
import type { PacketRecord } from "./types"

function packet(timestamp: number, duration: number, sourceIndex = 0): PacketRecord {
  return {
    sourceIndex,
    timestamp,
    duration,
    sequenceNumber: sourceIndex,
    type: "key",
    data: new Uint8Array([sourceIndex]),
    hash: String(sourceIndex),
  }
}

describe("AAC timeline classification", () => {
  it("keeps aligned AAC on packet-copy", () => {
    expect(classifyAudioTimeline([packet(0, 0.5), packet(0.5, 0.5, 1)], 1).kind).toBe("packet-copy")
  })

  it("routes negative priming to audio re-encoding", () => {
    expect(classifyAudioTimeline([packet(-0.021333, 0.021333), packet(0, 1, 1)], 1).kind).toBe(
      "reencode",
    )
  })

  it("recognizes a full visible cycle whose final timestamp excludes priming", () => {
    const priming = 0.11469387755102041
    const sourceDuration = 23.9615873015873
    const endTimestamp = sourceDuration - priming

    expect(
      classifyAudioTimeline(
        [packet(-priming, 0.02), packet(endTimestamp - 0.02, 0.02, 1)],
        sourceDuration,
      ),
    ).toMatchObject({
      kind: "reencode",
      firstTimestamp: -priming,
      endTimestamp,
    })
  })

  it("rejects a positive leading gap", () => {
    expect(classifyAudioTimeline([packet(0.02, 0.98)], 1).kind).toBe("unsupported")
  })
})

describe("PCM cycle planning", () => {
  it("trims priming and uses integer frame counts", () => {
    const plan = createPcmCyclePlan(
      [
        { timestamp: -1024 / 48_000, numberOfFrames: 1024 },
        { timestamp: 0, numberOfFrames: 48_000 },
      ],
      1,
      15,
      48_000,
    )
    expect(plan).toMatchObject({ cycleFrameCount: 48_000, outputFrameCount: 720_000 })
    expect(plan?.slices).toHaveLength(1)
  })

  it("normalizes an edit-list-shifted decoded cycle", () => {
    const origin = -0.1
    const plan = createPcmCyclePlan(
      [
        { timestamp: origin, numberOfFrames: 4_800 },
        { timestamp: 0, numberOfFrames: 43_200 },
      ],
      1,
      2,
      48_000,
      origin,
    )

    expect(plan).toMatchObject({ cycleFrameCount: 48_000, outputFrameCount: 96_000 })
    expect(plan?.slices).toEqual([
      { sampleIndex: 0, startFrame: 0, endFrame: 4_800, cycleStartFrame: 0 },
      { sampleIndex: 1, startFrame: 0, endFrame: 43_200, cycleStartFrame: 4_800 },
    ])
  })

  it("rejects discontinuous decoded audio", () => {
    expect(
      createPcmCyclePlan(
        [
          { timestamp: 0, numberOfFrames: 20_000 },
          { timestamp: 0.5, numberOfFrames: 24_000 },
        ],
        1,
        2,
        48_000,
      ),
    ).toBeNull()
  })
})
