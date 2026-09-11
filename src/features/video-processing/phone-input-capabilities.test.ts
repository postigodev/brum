import { readFile } from "node:fs/promises"
import { canEncodeVideo, InputVideoTrack, VideoSampleSink } from "mediabunny"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createExtensionPlan } from "../video-selection/extension-plan"
import { createBoomerangVideo } from "./create-boomerang-video"
import { readVideoTrackDuration } from "./inspect-media"

vi.mock("mediabunny", async (importOriginal) => ({
  ...(await importOriginal<typeof import("mediabunny")>()),
  canEncodeVideo: vi.fn().mockResolvedValue(true),
}))
afterEach(() => vi.restoreAllMocks())

describe("HEVC capability gate", () => {
  it.each([false, true])("obeys the actual track probe (supported: %s)", async (supported) => {
    const file = new File(
      [await readFile(new URL("./__fixtures__/hevc-video.mov", import.meta.url))],
      "phone.mov",
    )
    const plan = createExtensionPlan(
      await readVideoTrackDuration(file),
      { mode: "loops", value: 2 },
      "original",
    )
    if (!plan.ok) throw new Error(plan.reason)
    const probe = vi.spyOn(InputVideoTrack.prototype, "canDecode").mockResolvedValue(supported)
    const cause = new Error("Reached the decoder after capability checks")
    const decode = vi.spyOn(VideoSampleSink.prototype, "samples").mockImplementation(() => {
      throw cause
    })
    await expect(createBoomerangVideo(file, plan.plan)).rejects.toMatchObject(
      supported
        ? {
            code: "processing-failed",
            cause,
            diagnostic: { stage: "metadata-scan" },
          }
        : {
            code: "video-decoder-unavailable",
            diagnostic: { stage: "decoder-capability-check" },
          },
    )
    expect(probe).toHaveBeenCalledOnce()
    if (supported) {
      expect(decode).toHaveBeenCalledOnce()
      expect(canEncodeVideo).toHaveBeenCalledWith(
        "avc",
        expect.objectContaining({ width: 160, height: 120 }),
      )
    } else {
      expect(decode).not.toHaveBeenCalled()
    }
  })
})
