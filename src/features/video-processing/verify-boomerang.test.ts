import { describe, expect, it } from "vitest"

import type { MediaInspection, PacketRecord, VideoTrackSummary } from "./types"
import { verifyBoomerangInspection } from "./verify-boomerang"

const packet: PacketRecord = {
  sourceIndex: 0,
  timestamp: 0,
  duration: 1,
  sequenceNumber: 0,
  type: "key",
  data: new Uint8Array([1]),
  hash: "source",
}

const sourceVideo: VideoTrackSummary = {
  kind: "video",
  codec: "avc",
  codecString: "avc1.64000a",
  codedWidth: 160,
  codedHeight: 120,
  displayWidth: 160,
  displayHeight: 120,
  rotation: 0,
  pixelAspectRatio: { num: 1, den: 1 },
  colorSpace: {},
  decoderConfig: { codec: "avc1.64000a", codedWidth: 160, codedHeight: 120 },
  duration: 1,
  packets: [packet],
}

function outputInspection(): MediaInspection {
  return {
    duration: 2,
    video: {
      ...sourceVideo,
      codecString: "avc1.42001f",
      decoderConfig: { codec: "avc1.42001f", codedWidth: 160, codedHeight: 120 },
      duration: 2,
      packets: [{ ...packet, hash: "transcoded", duration: 2 }],
    },
    audio: null,
  }
}

const decodedTimeline = {
  sampleCount: 8,
  firstTimestamp: 0,
  endTimestamp: 2,
  continuous: true,
}

describe("boomerang verification", () => {
  it("accepts a silent transcoded AVC output without comparing packet hashes", () => {
    expect(verifyBoomerangInspection(sourceVideo, outputInspection(), 2, decodedTimeline)).toEqual({
      duration: true,
      codec: true,
      videoGeometry: true,
      silent: true,
      videoTimeline: true,
    })
  })

  it("rejects an output containing audio", () => {
    const output = outputInspection()
    output.audio = {
      kind: "audio",
      codec: "aac",
      codecString: "mp4a.40.2",
      sampleRate: 48_000,
      numberOfChannels: 1,
      decoderConfig: { codec: "mp4a.40.2", sampleRate: 48_000, numberOfChannels: 1 },
      duration: 2,
      packets: [packet],
      timeline: {
        kind: "packet-copy",
        reason: "aligned",
        firstTimestamp: 0,
        endTimestamp: 2,
      },
    }

    expect(() => verifyBoomerangInspection(sourceVideo, output, 2, decodedTimeline)).toThrowError(
      expect.objectContaining({ code: "verification-failed" }),
    )
  })

  it("rejects a discontinuous decoded output timeline", () => {
    expect(() =>
      verifyBoomerangInspection(sourceVideo, outputInspection(), 2, {
        ...decodedTimeline,
        continuous: false,
      }),
    ).toThrowError(expect.objectContaining({ code: "verification-failed" }))
  })
})
