import { describe, expect, it } from "vitest"

import type { ExtensionPlan } from "#/features/video-selection/extension-plan"

import { assertPlanMatchesSource, scheduleTrackPackets } from "./packet-schedule"
import type { PacketRecord } from "./types"

const packets: PacketRecord[] = [
  {
    sourceIndex: 0,
    timestamp: 0,
    duration: 0.4,
    sequenceNumber: 0,
    type: "key",
    data: new Uint8Array([1]),
    hash: "01",
  },
  {
    sourceIndex: 1,
    timestamp: 0.4,
    duration: 0.4,
    sequenceNumber: 1,
    type: "delta",
    data: new Uint8Array([2]),
    hash: "02",
  },
  {
    sourceIndex: 2,
    timestamp: 0.8,
    duration: 0.2,
    sequenceNumber: 2,
    type: "delta",
    data: new Uint8Array([3]),
    hash: "03",
  },
]

function plan(outputDuration: number, totalPlays: number): ExtensionPlan {
  return {
    sourceDuration: 1,
    target: { mode: "duration", value: outputDuration },
    outputDuration,
    totalPlays,
    completePlays: Math.floor(outputDuration),
    finalPartialDuration: outputDuration % 1 || null,
  }
}

describe("packet scheduling", () => {
  it("repeats complete packet sequences on the shared timeline", () => {
    const ledger = scheduleTrackPackets("video", packets, plan(2, 2))
    const expected = [
      [0, 0.4],
      [0.4, 0.4],
      [0.8, 0.2],
      [1, 0.4],
      [1.4, 0.4],
      [1.8, 0.2],
    ]
    expect(ledger).toHaveLength(expected.length)
    expected.forEach(([timestamp, duration], index) => {
      expect(ledger[index]?.timestamp).toBeCloseTo(timestamp, 10)
      expect(ledger[index]?.duration).toBeCloseTo(duration, 10)
    })
  })

  it("shortens only the packet crossing an exact partial cutoff", () => {
    const ledger = scheduleTrackPackets("video", packets, plan(1.5, 2))
    expect(ledger.at(-1)).toMatchObject({ sourceIndex: 1, repetition: 1, timestamp: 1.4 })
    expect(ledger.at(-1)?.duration).toBeCloseTo(0.1, 10)
  })

  it("models the muxer's final-frame hold before another video cycle", () => {
    const shortVideoPackets = packets.map((packet, index) =>
      index === 2 ? { ...packet, duration: 0.04 } : packet,
    )
    const ledger = scheduleTrackPackets("video", shortVideoPackets, plan(2, 2), undefined, 0.84)

    const heldPackets = ledger.filter((entry) => entry.sourceIndex === 2)
    expect(heldPackets).toMatchObject([
      { repetition: 0, timestamp: 0.8 },
      { repetition: 1, timestamp: 1.8 },
    ])
    expect(heldPackets[0]?.duration).toBeCloseTo(0.2, 10)
    expect(heldPackets[1]?.duration).toBeCloseTo(0.04, 10)
    expect(heldPackets[0]?.timestamp + (heldPackets[0]?.duration ?? 0)).toBeCloseTo(1, 10)
    expect(ledger[3]?.timestamp).toBe(1)
  })

  it("ends exactly when a duration target falls inside the held tail", () => {
    const shortVideoPackets = packets.map((packet, index) =>
      index === 2 ? { ...packet, duration: 0.04 } : packet,
    )
    const ledger = scheduleTrackPackets("video", shortVideoPackets, plan(1.9, 2), undefined, 0.84)

    expect(ledger.at(-1)).toMatchObject({ sourceIndex: 2, repetition: 1, timestamp: 1.8 })
    expect(ledger.at(-1)?.duration).toBeCloseTo(0.04, 10)
    expect((ledger.at(-1)?.timestamp ?? 0) + (ledger.at(-1)?.duration ?? 0)).toBeCloseTo(1.84, 10)
  })

  it("rejects stale plans and observes cancellation", () => {
    expect(() => assertPlanMatchesSource(plan(2, 2), 1.01)).toThrowError(
      expect.objectContaining({ code: "plan-duration-mismatch" }),
    )
    const controller = new AbortController()
    controller.abort()
    expect(() =>
      scheduleTrackPackets("video", packets, plan(2, 2), controller.signal),
    ).toThrowError(expect.objectContaining({ code: "canceled" }))
  })
})
