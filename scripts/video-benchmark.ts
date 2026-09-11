import { describe, expect, it, vi } from "vitest"
import { commands } from "vitest/browser"
import fixtureUrl from "../src/features/video-processing/__fixtures__/h264-1080p.mp4?url"
import { createBoomerangVideo } from "../src/features/video-processing/create-boomerang-video"
import type { ProcessingSnapshot } from "../src/features/video-processing/processing-diagnostics"
import { createExtensionPlan } from "../src/features/video-selection/extension-plan"

describe("1080p processing benchmark", () => {
  it("reports repeated same-fixture runs (first is warmup)", async () => {
    const source = new File([await (await fetch(fixtureUrl)).blob()], "synthetic-1080p.mp4")
    const plan = createExtensionPlan(10, { mode: "duration", value: 15 }, "original")
    if (!plan.ok) throw new Error(plan.reason)
    const results: unknown[] = []
    const nativeDecode = VideoDecoder.prototype.decode
    for (let run = 0; run < 4; run++) {
      let submittedPackets = 0
      const probe = vi.spyOn(VideoDecoder.prototype, "decode").mockImplementation(function (
        this: VideoDecoder,
        chunk,
      ) {
        submittedPackets++
        return nativeDecode.call(this, chunk)
      })
      let diagnostic: ProcessingSnapshot | undefined
      try {
        const result = await createBoomerangVideo(source, plan.plan, {
          onProgress: (value) => { diagnostic = value },
        })
        expect(result.duration).toBe(15)
        expect(diagnostic?.encodedFrames).toBe(450)
        results.push({
          run, warmup: run === 0, submittedPackets,
          outputDuration: result.duration, ...diagnostic,
        })
        await commands.writeFile(
          "scripts/video-benchmark-results.json",
          JSON.stringify(results, null, 2),
        )
      } finally {
        probe.mockRestore()
      }
    }
  })
})
