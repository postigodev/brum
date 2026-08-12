import { describe, expect, it } from "vitest"
import type { MediaInspection, PacketLedgerEntry, PacketRecord } from "./types"
import { verifyRemux } from "./verify-remux"

const packet: PacketRecord = {
  sourceIndex: 0,
  timestamp: 0,
  duration: 1,
  sequenceNumber: 0,
  type: "key",
  data: new Uint8Array([1]),
  hash: "01",
}
const inspection: MediaInspection = {
  duration: 1,
  video: {
    kind: "video",
    codec: "avc",
    codecString: "avc1.64000a",
    codedWidth: 10,
    codedHeight: 10,
    displayWidth: 10,
    displayHeight: 10,
    rotation: 0,
    pixelAspectRatio: { num: 1, den: 1 },
    colorSpace: {},
    decoderConfig: { codec: "avc1.64000a", codedWidth: 10, codedHeight: 10 },
    duration: 1,
    packets: [packet],
  },
  audio: null,
}
const ledger: PacketLedgerEntry[] = [
  {
    track: "video",
    sourceIndex: 0,
    repetition: 0,
    timestamp: 0,
    duration: 1,
    type: "key",
    hash: "01",
  },
]

describe("remux verification", () => {
  it("rejects omitted, reordered, payload-altered, and duration-altered packets", () => {
    const cases: PacketRecord[][] = [
      [],
      [packet, packet],
      [{ ...packet, hash: "changed" }],
      [{ ...packet, duration: 0.5 }],
    ]
    for (const packets of cases) {
      const output = { ...inspection, video: { ...inspection.video, packets } }
      expect(() => verifyRemux(inspection, output, ledger, null, 1)).toThrowError(
        expect.objectContaining({ code: "verification-failed" }),
      )
    }
  })

  it("accepts AAC-LC output at the decoded rate after HE-AAC re-encoding", () => {
    const source = {
      ...inspection,
      audio: {
        kind: "audio" as const,
        codec: "aac" as const,
        codecString: "mp4a.40.5",
        sampleRate: 22_050,
        numberOfChannels: 2,
        decoderConfig: { codec: "mp4a.40.5", sampleRate: 22_050, numberOfChannels: 2 },
        duration: 1,
        packets: [packet],
        timeline: {
          kind: "reencode" as const,
          reason: "priming",
          firstTimestamp: -0.1,
          endTimestamp: 0.9,
        },
      },
    }
    const output = {
      ...source,
      audio: {
        ...source.audio,
        codecString: "mp4a.40.2",
        sampleRate: 44_100,
        decoderConfig: { codec: "mp4a.40.2", sampleRate: 44_100, numberOfChannels: 2 },
        timeline: {
          kind: "packet-copy" as const,
          reason: "aligned",
          firstTimestamp: 0,
          endTimestamp: 1,
        },
      },
    }

    expect(verifyRemux(source, output, ledger, null, 1, "reencode", 44_100).audioProperties).toBe(
      true,
    )
  })
})
