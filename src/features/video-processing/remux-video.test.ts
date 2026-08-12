import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { createExtensionPlan } from "#/features/video-selection/extension-plan"

import { inspectMedia } from "./inspect-media"
import { remuxVideo } from "./remux-video"

async function fixture(name: string) {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const bytes = await readFile(path)
  return new File([bytes], name, { type: "video/mp4" })
}

function loopPlan(sourceDuration: number, loops = 2) {
  const result = createExtensionPlan(sourceDuration, { mode: "loops", value: loops })
  if (!result.ok) throw new Error(`Could not create fixture plan: ${result.reason}`)
  return result.plan
}

function durationPlan(sourceDuration: number, duration = 15) {
  const result = createExtensionPlan(sourceDuration, { mode: "duration", value: duration })
  if (!result.ok) throw new Error(`Could not create fixture plan: ${result.reason}`)
  return result.plan
}

describe("local MP4 remux", () => {
  it("inspects the supported H.264 fixture", async () => {
    const inspection = await inspectMedia(await fixture("h264-video.mp4"))
    expect(inspection).toMatchObject({
      duration: 1,
      video: { codec: "avc", codedWidth: 160, codedHeight: 120 },
      audio: null,
    })
  })

  it("copies H.264 packets into an exact two-loop MP4", async () => {
    const file = await fixture("h264-video.mp4")
    const source = await inspectMedia(file)
    const result = await remuxVideo(file, loopPlan(source.duration))

    expect(result.blob.type).toBe("video/mp4")
    expect(result.duration).toBeCloseTo(2, 3)
    expect(result.video).toMatchObject({ codec: "avc", codedWidth: 160, codedHeight: 120 })
    expect(result.verification).toEqual({
      duration: true,
      codecs: true,
      videoGeometry: true,
      audioProperties: true,
      packetLedger: true,
    })
  })

  it("shortens the final packets to an exact duration target", async () => {
    const file = await fixture("h264-video.mp4")
    const source = await inspectMedia(file)
    const result = await remuxVideo(file, durationPlan(source.duration))

    expect(result.duration).toBeCloseTo(15, 3)
    expect(result.video.duration).toBeCloseTo(15, 3)
    expect(result.verification.packetLedger).toBe(true)
  })

  it("copies optional AAC while preserving synchronization", async () => {
    const file = await fixture("h264-aac.mp4")
    const source = await inspectMedia(file)
    const result = await remuxVideo(file, loopPlan(source.duration))

    expect(result.duration).toBeCloseTo(source.duration * 2, 3)
    expect(result.audio).toMatchObject({ codec: "aac", sampleRate: 48_000, numberOfChannels: 1 })
    expect(result.verification.packetLedger).toBe(true)
  })

  it("rejects unsupported video codecs without transcoding", async () => {
    await expect(inspectMedia(await fixture("unsupported-video.mp4"))).rejects.toMatchObject({
      code: "unsupported-video-codec",
    })
  })

  it("stops before processing when canceled", async () => {
    const file = await fixture("h264-video.mp4")
    const source = await inspectMedia(file)
    const controller = new AbortController()
    controller.abort()
    await expect(
      remuxVideo(file, loopPlan(source.duration), { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "canceled" })
  })
})
