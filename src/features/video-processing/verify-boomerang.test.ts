import { describe, expect, it } from "vitest"

import type { MediaInspection, VideoTrackSummary } from "./types"
import { verifyBoomerangInspection } from "./verify-boomerang"

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
  duration: 1,
  encodedByteLength: 1_000,
}

function outputInspection(): MediaInspection {
  return {
    duration: 2,
    video: {
      ...sourceVideo,
      codecString: "avc1.42001f",
      duration: 2,
      encodedByteLength: 2_000,
    },
    audioTrackCount: 0,
  }
}

const decodedTimeline = {
  sampleCount: 8,
  firstTimestamp: 0,
  endTimestamp: 2,
  continuous: true,
}

describe("boomerang verification", () => {
  it("accepts a silent transcoded AVC output", () => {
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
    output.audioTrackCount = 1

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
