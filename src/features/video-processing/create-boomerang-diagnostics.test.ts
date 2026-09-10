import { beforeEach, describe, expect, it, vi } from "vitest"
import { createExtensionPlan } from "../video-selection/extension-plan"
import { createBoomerangVideo } from "./create-boomerang-video"
import { ProcessingError } from "./errors"
import { type ProcessingStage, underlyingProcessingError } from "./processing-diagnostics"

const harness = vi.hoisted(() => ({
  fail: "" as string,
  cause: new DOMException("Native codec failure", "OperationError"),
  scans: 0,
  canceled: vi.fn(),
  disposed: vi.fn(),
  check(stage: string) {
    if (this.fail === stage) throw this.cause
  },
}))

vi.mock("mediabunny", async (importOriginal) => {
  const original = await importOriginal<typeof import("mediabunny")>()
  return {
    ...original,
    Input: class {
      getVideoTracks() {
        return Promise.resolve([{}])
      }
      dispose() {
        harness.disposed()
      }
    },
    VideoSampleSink: class {
      async *samples() {
        const scanning = harness.scans++ === 0
        for (let index = 0; index < 4; index++) {
          // Fail the second next(), after the previous decoded-frame copy succeeded.
          if (scanning || index === 1)
            harness.check(scanning ? "metadata-scan" : "range-decode-seek")
          yield {
            format: "RGBA",
            visibleRect: { left: 0, top: 0, width: 2, height: 2 },
            timestamp: index / 4,
            duration: 0.25,
            codedWidth: 2,
            codedHeight: 2,
            displayWidth: 2,
            displayHeight: 2,
            rotation: 0,
            colorSpace: {},
            allocationSize: () => 16,
            copyTo: async () => {
              harness.check("decoded-frame-copy")
              return [{ offset: 0, stride: 8 }]
            },
            close() {},
          }
        }
      }
    },
    VideoSample: class {
      constructor() {
        harness.check("encoding-sample-creation")
      }
      close() {}
    },
    VideoSampleSource: class {
      async add() {
        harness.check("video-sample-add")
      }
      close() {}
    },
    Output: class {
      state = "started"
      constructor(private options: { target: { buffer: ArrayBuffer | null } }) {}
      addVideoTrack() {}
      async start() {
        harness.check("output-start")
      }
      async finalize() {
        harness.check("output-finalization")
        this.options.target.buffer = new ArrayBuffer(16)
        this.state = "finalized"
      }
      async cancel() {
        harness.canceled()
      }
    },
  }
})

const source = vi.hoisted(() => ({
  duration: 1,
  audioTrackCount: 0,
  video: { duration: 1, encodedByteLength: 1000, codedWidth: 2, codedHeight: 2, rotation: 0 },
}))
vi.mock("./inspect-media", () => ({
  inspectMedia: async () => {
    try {
      harness.check("source-inspection")
    } catch (cause) {
      throw new ProcessingError("processing-failed", "Inspection failed", { cause })
    }
    return source
  },
}))
vi.mock("./video-capabilities", () => ({
  createAvcEncodingConfig: () => ({ codec: "avc" }),
  assertVideoDecoderAvailable: async () => harness.check("decoder-capability-check"),
  assertAvcEncoderAvailable: async () => harness.check("encoder-capability-check"),
}))
vi.mock("./verify-boomerang", () => ({
  verifyBoomerangOutput: async () => {
    harness.check("output-verification")
    return { output: source, verification: {} }
  },
}))

beforeEach(() => {
  harness.fail = ""
  harness.scans = 0
  vi.clearAllMocks()
})

describe("processing failure diagnostics", () => {
  it.each([
    "source-inspection",
    "decoder-capability-check",
    "encoder-capability-check",
    "metadata-scan",
    "range-decode-seek",
    "decoded-frame-copy",
    "encoding-sample-creation",
    "video-sample-add",
    "output-start",
    "output-finalization",
    "output-verification",
  ] satisfies ProcessingStage[])("preserves the original exception at %s", async (stage) => {
    harness.fail = stage
    const plan = createExtensionPlan(1, { mode: "loops", value: 2 }, "original")
    if (!plan.ok) throw new Error(plan.reason)
    const error = await createBoomerangVideo(new File(["test"], "private.mp4"), plan.plan).catch(
      (error: unknown) => error,
    )
    expect(error).toBeInstanceOf(ProcessingError)
    if (!(error instanceof ProcessingError)) throw new Error("Expected processing error")
    expect(error.cause).toBe(harness.cause)
    expect(error.diagnostic?.stage).toBe(stage)
    expect(underlyingProcessingError(error)).toEqual({
      name: "OperationError",
      message: "Native codec failure",
    })
    if (
      [
        "range-decode-seek",
        "decoded-frame-copy",
        "encoding-sample-creation",
        "video-sample-add",
      ].includes(stage)
    ) {
      expect(error.diagnostic).toMatchObject({
        rangeIndex: 0,
        sourceFrameIndex: stage === "range-decode-seek" ? 1 : 0,
        outputFrameIndex: 0,
        metadataFrames: 4,
        encodedFrames: 0,
      })
      expect(harness.canceled).toHaveBeenCalledOnce()
    }
    if (stage !== "source-inspection") expect(harness.disposed).toHaveBeenCalled()
  })
})
