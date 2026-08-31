import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { assertInitialKeyPacket, assertSupportedTrackLayout, inspectMedia } from "./inspect-media"

async function fixture(name: string) {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const bytes = await readFile(path)
  return new File([bytes], name, { type: "video/mp4" })
}

describe("media inspection", () => {
  it("requires the first video packet to be independently decodable", () => {
    expect(() => assertInitialKeyPacket("key")).not.toThrow()
    expect(() => assertInitialKeyPacket("delta")).toThrowError(
      expect.objectContaining({ code: "missing-initial-key-packet" }),
    )
    expect(() => assertInitialKeyPacket(null)).toThrowError(
      expect.objectContaining({ code: "missing-initial-key-packet" }),
    )
  })

  it("accepts exactly one video with at most one audio track", () => {
    expect(() => assertSupportedTrackLayout(1, 0, 1)).not.toThrow()
    expect(() => assertSupportedTrackLayout(1, 1, 2)).not.toThrow()
  })

  it.each([
    [0, 1, 1],
    [1, 2, 3],
    [1, 1, 3],
  ])("rejects unsupported track layout %s/%s/%s", (video, audio, total) => {
    expect(() => assertSupportedTrackLayout(video, audio, total)).toThrowError(
      expect.objectContaining({ code: "unsupported-track-layout" }),
    )
  })

  it("streams video packets into an encoded byte total", async () => {
    const inspection = await inspectMedia(await fixture("h264-aac.mp4"))

    expect(inspection.audioTrackCount).toBe(1)
    expect(inspection.video.encodedByteLength).toBeGreaterThan(0)
  })

  it("rejects non-H.264 video", async () => {
    await expect(inspectMedia(await fixture("unsupported-video.mp4"))).rejects.toMatchObject({
      code: "unsupported-video-codec",
    })
  })
})
