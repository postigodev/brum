import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { createExtensionPlan } from "#/features/video-selection/extension-plan"

import { createBoomerangVideo } from "./create-boomerang-video"
import { inspectMedia } from "./inspect-media"

async function fixture(name: string) {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const bytes = await readFile(path)
  return new File([bytes], name, { type: "video/mp4" })
}

describe("boomerang video processing", () => {
  it("ignores source AAC because production output is intentionally silent", async () => {
    const source = await inspectMedia(await fixture("h264-aac.mp4"), undefined, {
      discardAudio: true,
    })

    expect(source.audio).toBeNull()
  })

  it("stops before decoding when canceled", async () => {
    const file = await fixture("h264-video.mp4")
    const source = await inspectMedia(file)
    const plan = createExtensionPlan(source.duration, { mode: "loops", value: 2 })
    if (!plan.ok) throw new Error(plan.reason)

    const controller = new AbortController()
    controller.abort()

    await expect(
      createBoomerangVideo(file, plan.plan, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "canceled" })
  })
})
