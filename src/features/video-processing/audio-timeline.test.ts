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
