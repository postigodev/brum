import { VIDEO_SAMPLE_PIXEL_FORMATS, VideoSample } from "mediabunny"
import { describe, expect, it, vi } from "vitest"

import {
  collectDecodedVideoRange,
  createVideoSampleFromRetainedFrame,
  type DecodedVideoSample,
  detachDecodedVideoSample,
  emitRetainedVideoFrame,
  isRetainedVideoFrameWithinBudget,
  MAX_RETAINED_DECODED_VIDEO_BYTES,
  type RetainedVideoFrame,
  RetainedVideoFrameStorage,
  releaseRetainedVideoFrames,
  retainedVideoFrameBytes,
} from "./decoded-video-buffer"

type SampleOptions = {
  width?: number
  height?: number
  allocationSize?: number
  copyError?: Error
  onCopy?: () => void
}

function sample(options: SampleOptions = {}) {
  const width = options.width ?? 2
  const height = options.height ?? 1
  const allocationSize = options.allocationSize ?? width * height * 4
  const close = vi.fn()
  const copyTo = vi.fn(async (destination: AllowSharedBufferSource) => {
    options.onCopy?.()
    if (options.copyError) throw options.copyError
    new Uint8Array(
      ArrayBuffer.isView(destination) ? destination.buffer : destination,
      ArrayBuffer.isView(destination) ? destination.byteOffset : 0,
      allocationSize,
    ).fill(17)
    return [{ offset: 0, stride: width * 4 }]
  })

  return {
    allocationSize: vi.fn(() => allocationSize),
    format: "RGBA" as const,
    visibleRect: { left: 0, top: 0, width, height },
    codedWidth: width,
    codedHeight: height,
    displayWidth: width,
    displayHeight: height,
    timestamp: 0,
    duration: 1 / 30,
    rotation: 0 as const,
    colorSpace: {
      primaries: "bt709" as const,
      transfer: "bt709" as const,
      matrix: "bt709" as const,
      fullRange: false,
    },
    copyTo,
    close,
  } satisfies DecodedVideoSample
}

async function* yieldSamples<T>(samples: readonly T[]) {
  for (const value of samples) yield value
}

describe("decoded video ownership", () => {
  it.each(VIDEO_SAMPLE_PIXEL_FORMATS)("round trips owned %s bytes and planes", async (format) => {
    const raw = new VideoSample(new Uint8Array(512).fill(17), {
      format,
      codedWidth: 6,
      codedHeight: 4,
      timestamp: 0,
    })
    const expected = new Uint8Array(raw.allocationSize())
    const layout = await raw.copyTo(expected)
    const retained = await detachDecodedVideoSample(raw)
    const restored = createVideoSampleFromRetainedFrame(retained, 1, 0.5)
    try {
      expect(restored.format).toBe(format)
      expect(retained.copyLayout).toEqual(layout)
      expect(retained.pixels).toEqual(expected)
      expect(restored.allocationSize()).toBe(expected.byteLength)
      const copied = new Uint8Array(expected.byteLength)
      expect(await restored.copyTo(copied)).toEqual(layout)
      expect(copied).toEqual(expected)
    } finally {
      restored.close()
      releaseRetainedVideoFrames([retained])
    }
  })

  it("preserves valid padded planes and rejects missing final-row padding", async () => {
    const raw = new VideoSample(new Uint8Array(12).fill(17), {
      format: "NV12",
      codedWidth: 2,
      codedHeight: 2,
      timestamp: 0,
    })
    const retained = await detachDecodedVideoSample(raw)
    retained.pixels = new Uint8Array(12).fill(17)
    retained.copyLayout = [
      { offset: 0, stride: 4 },
      { offset: 8, stride: 4 },
    ]
    const restored = createVideoSampleFromRetainedFrame(retained, 0, 1)
    try {
      const copied = new Uint8Array(restored.allocationSize())
      await restored.copyTo(copied)
      expect(copied).toEqual(new Uint8Array(6).fill(17))
      retained.pixels = new Uint8Array(10)
      expect(() => createVideoSampleFromRetainedFrame(retained, 0, 1)).toThrow(
        "Copied pixel layout",
      )
    } finally {
      restored.close()
      releaseRetainedVideoFrames([retained])
    }
  })

  it("rejects truncated chroma from Mediabunny raw odd-width copying", async () => {
    const raw = new VideoSample(new Uint8Array(64), {
      format: "NV12",
      codedWidth: 5,
      codedHeight: 3,
      timestamp: 0,
    })
    await expect(detachDecodedVideoSample(raw)).rejects.toMatchObject({
      code: "unsupported-pixel-representation",
    })
  })

  it("retains eight phone-size NV12 frames within the actual byte budget", async () => {
    const make = () =>
      new VideoSample(new Uint8Array(3_110_400), {
        format: "NV12",
        codedWidth: 1080,
        codedHeight: 1920,
        timestamp: 0,
      })
    async function* frames() {
      for (let i = 0; i < 8; i++) yield make()
    }
    const retained = await collectDecodedVideoRange(frames())
    expect(retained.reduce((sum, frame) => sum + retainedVideoFrameBytes(frame), 0)).toBe(
      24_883_200,
    )
    expect(
      retained.every(
        (frame) => frame.sourcePixelFormat === "NV12" && frame.copyLayout.length === 2,
      ),
    ).toBe(true)
    releaseRetainedVideoFrames(retained)
    const decoded = make()
    await expect(detachDecodedVideoSample(decoded, { maxBytes: 3_110_399 })).rejects.toMatchObject({
      code: "decoded-video-memory-exceeded",
    })
  })

  it.each([
    [
      { offset: 0, stride: 1 },
      { offset: 4, stride: 2 },
    ],
    [
      { offset: 0, stride: 2 },
      { offset: 0, stride: 2 },
    ],
    [
      { offset: 0, stride: 2 },
      { offset: 5, stride: 2 },
    ],
  ])("rejects invalid native plane bounds %j", async (...layout) => {
    const raw = new VideoSample(new Uint8Array(6), {
      format: "NV12",
      codedWidth: 2,
      codedHeight: 2,
      timestamp: 0,
    })
    const retained = await detachDecodedVideoSample(raw)
    retained.copyLayout = layout
    expect(() => createVideoSampleFromRetainedFrame(retained, 0, 1)).toThrow("Copied pixel layout")
    releaseRetainedVideoFrames([retained])
  })

  it("copies RGBA pixels and closes the decoder sample immediately", async () => {
    const decoded = sample()
    const retained = await detachDecodedVideoSample(decoded)

    expect(decoded.allocationSize).toHaveBeenCalledWith()
    expect(decoded.copyTo).toHaveBeenCalledWith(expect.any(Uint8Array))
    expect(decoded.close).toHaveBeenCalledOnce()
    expect(retained.pixels).toEqual(new Uint8Array(8).fill(17))
    releaseRetainedVideoFrames([retained])
  })

  it("keeps retained pixels usable after the decoder sample is closed", async () => {
    const retained = await detachDecodedVideoSample(sample())
    const emitted = createVideoSampleFromRetainedFrame(retained, 3, 0.5)

    expect(emitted.timestamp).toBe(3)
    expect(emitted.duration).toBe(0.5)
    expect(emitted.allocationSize()).toBe(8)
    emitted.close()
    releaseRetainedVideoFrames([retained])
  })

  it("rejects a format and plane count mismatch and closes the sample", async () => {
    const decoded = sample()
    decoded.copyTo.mockResolvedValue([
      { offset: 0, stride: 2 },
      { offset: 4, stride: 2 },
    ])
    await expect(detachDecodedVideoSample(decoded)).rejects.toMatchObject({
      code: "unsupported-pixel-representation",
    })
    expect(decoded.close).toHaveBeenCalledOnce()
  })

  it("rejects a null format before allocation or copying", async () => {
    const decoded = { ...sample(), format: null }
    await expect(detachDecodedVideoSample(decoded)).rejects.toMatchObject({
      code: "unsupported-pixel-representation",
    })
    expect(decoded.allocationSize).not.toHaveBeenCalled()
    expect(decoded.copyTo).not.toHaveBeenCalled()
    expect(decoded.close).toHaveBeenCalledOnce()
  })

  it("rejects an inconsistent owned buffer before reconstructing a sample", async () => {
    const retained = await detachDecodedVideoSample(sample())
    retained.pixels = new Uint8Array(7)
    expect(() => createVideoSampleFromRetainedFrame(retained, 0, 1)).toThrow("Copied pixel layout")
    releaseRetainedVideoFrames([retained])
  })

  it("rejects a copy whose allocation cannot contain packed visible RGBA", async () => {
    const decoded = sample({ width: 100, height: 100, allocationSize: 7 })
    await expect(
      collectDecodedVideoRange(yieldSamples([decoded]), { maxBytes: 7 }),
    ).rejects.toThrow("Copied pixel layout")
    expect(decoded.close).toHaveBeenCalledOnce()
  })

  it("uses a centralized 32 MiB working-set limit", () => {
    expect(MAX_RETAINED_DECODED_VIDEO_BYTES).toBe(32 * 1024 * 1024)
    expect(isRetainedVideoFrameWithinBudget(MAX_RETAINED_DECODED_VIDEO_BYTES - 1, 1)).toBe(true)
    expect(isRetainedVideoFrameWithinBudget(MAX_RETAINED_DECODED_VIDEO_BYTES - 1, 2)).toBe(false)
  })

  it("rejects an oversized frame before allocating or copying its pixels", async () => {
    const decoded = sample({ allocationSize: MAX_RETAINED_DECODED_VIDEO_BYTES + 1 })
    await expect(detachDecodedVideoSample(decoded)).rejects.toMatchObject({
      code: "decoded-video-memory-exceeded",
    })
    expect(decoded.copyTo).not.toHaveBeenCalled()
    expect(decoded.close).toHaveBeenCalledOnce()
  })

  it("rejects a range above eight frames even when its byte total fits", async () => {
    const frames = Array.from({ length: 9 }, () => sample())
    const storage = new RetainedVideoFrameStorage()
    await expect(collectDecodedVideoRange(yieldSamples(frames), { storage })).rejects.toMatchObject(
      { code: "decoded-video-memory-exceeded" },
    )
    expect(frames[8]?.copyTo).not.toHaveBeenCalled()
    for (const frame of frames) expect(frame.close).toHaveBeenCalledOnce()
    expect(storage.retainedBytes).toBe(0)
    expect(storage.frames).toEqual([])
  })

  it("closes a late decoded frame after canceling the pending range read", async () => {
    const controller = new AbortController()
    const decoded = sample()
    let deliver: (result: IteratorResult<DecodedVideoSample>) => void = () => undefined
    const next = vi.fn(
      () =>
        new Promise<IteratorResult<DecodedVideoSample>>((resolve) => {
          deliver = resolve
        }),
    )
    const cleanup = vi.fn(async () => ({ done: true as const, value: undefined }))
    const samples = { [Symbol.asyncIterator]: () => ({ next, return: cleanup }) }
    const pending = collectDecodedVideoRange(samples, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: "canceled" })
    deliver({ done: false, value: decoded })
    await Promise.resolve()
    expect(decoded.close).toHaveBeenCalledOnce()
    expect(decoded.copyTo).not.toHaveBeenCalled()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it("allows owned allocations to equal the limit exactly", async () => {
    const frames = await collectDecodedVideoRange(
      yieldSamples([sample({ width: 1, allocationSize: 4 }), sample({ allocationSize: 8 })]),
      { maxBytes: 12 },
    )

    expect(frames.map(retainedVideoFrameBytes)).toEqual([4, 8])
    releaseRetainedVideoFrames(frames)
  })

  it("releases every retained owned buffer deterministically", async () => {
    const frames = await collectDecodedVideoRange(yieldSamples([sample(), sample()]))
    const retainedReferences = [...frames]

    releaseRetainedVideoFrames(frames)

    expect(frames).toEqual([])
    expect(retainedReferences.every((frame) => frame.pixels === null)).toBe(true)
  })

  it("rejects the next owned allocation above the limit and closes every decoder sample", async () => {
    const storage = new RetainedVideoFrameStorage()
    const first = sample({ width: 1, allocationSize: 4 })
    let firstRetained: RetainedVideoFrame | undefined
    const rejected = sample({ allocationSize: 1 })
    rejected.allocationSize.mockImplementation(() => {
      ;[firstRetained] = storage.frames
      return 1
    })

    await expect(
      collectDecodedVideoRange(yieldSamples([first, rejected]), { maxBytes: 4, storage }),
    ).rejects.toMatchObject({ code: "decoded-video-memory-exceeded" })
    expect(first.close).toHaveBeenCalledOnce()
    expect(rejected.close).toHaveBeenCalledOnce()
    expect(rejected.copyTo).not.toHaveBeenCalled()
    expect(firstRetained?.pixels).toBeNull()
    expect(storage.frames).toEqual([])
    expect(storage.retainedBytes).toBe(0)
  })

  it("closes the current decoder sample and releases retained frames when copying fails", async () => {
    const storage = new RetainedVideoFrameStorage()
    const first = sample()
    let firstRetained: RetainedVideoFrame | undefined
    const failed = sample({
      copyError: new Error("copy failed"),
      onCopy: () => {
        ;[firstRetained] = storage.frames
      },
    })

    await expect(
      collectDecodedVideoRange(yieldSamples([first, failed]), { storage }),
    ).rejects.toThrow("copy failed")
    expect(first.close).toHaveBeenCalledOnce()
    expect(failed.close).toHaveBeenCalledOnce()
    expect(firstRetained?.pixels).toBeNull()
    expect(storage.frames).toEqual([])
  })

  it("releases a partial range when the decoder fails on its next frame", async () => {
    const storage = new RetainedVideoFrameStorage()
    const decoded = sample()
    let retained: RetainedVideoFrame | undefined
    async function* failedRange() {
      yield decoded
      ;[retained] = storage.frames
      throw new Error("decoder failed")
    }
    await expect(collectDecodedVideoRange(failedRange(), { storage })).rejects.toThrow(
      "decoder failed",
    )
    expect(decoded.close).toHaveBeenCalledOnce()
    expect(retained?.pixels).toBeNull()
    expect(storage.frames).toEqual([])
    expect(storage.retainedBytes).toBe(0)
  })

  it("cancels a pending decode iteration without leaving collection pending", async () => {
    const controller = new AbortController()
    const first = sample()
    const onInterrupt = vi.fn()
    const storage = new RetainedVideoFrameStorage()
    let callCount = 0
    const samples: AsyncIterable<DecodedVideoSample> = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            callCount += 1
            return callCount === 1
              ? Promise.resolve({ value: first, done: false as const })
              : new Promise<IteratorResult<DecodedVideoSample>>(() => undefined)
          },
          return: async () => ({ value: undefined, done: true as const }),
        }
      },
    }
    const pending = collectDecodedVideoRange(samples, {
      signal: controller.signal,
      stallTimeoutMs: 1_000,
      onInterrupt,
      storage,
    })
    while (callCount < 2) await Promise.resolve()
    const [firstRetained] = storage.frames
    controller.abort()

    await expect(pending).rejects.toMatchObject({ code: "canceled" })
    expect(first.close).toHaveBeenCalledOnce()
    expect(onInterrupt).toHaveBeenCalledOnce()
    expect(firstRetained?.pixels).toBeNull()
    expect(storage.frames).toEqual([])
  })

  it("bounds a stalled encode and closes its temporary emitted sample", async () => {
    const retained = await detachDecodedVideoSample(sample())
    let emitted: Parameters<Parameters<typeof emitRetainedVideoFrame>[3]>[0] | null = null
    const add = vi.fn((value: NonNullable<typeof emitted>) => {
      emitted = value
      return new Promise<void>(() => undefined)
    })

    await expect(
      emitRetainedVideoFrame(retained, 0, 1 / 30, add, { stallTimeoutMs: 10 }),
    ).rejects.toMatchObject({ code: "media-stalled" })
    expect(add).toHaveBeenCalledOnce()
    expect(() => emitted?.allocationSize()).toThrow("closed")
    releaseRetainedVideoFrames([retained])
  })

  it("actively interrupts a pending encode when canceled and returns no value", async () => {
    const retained = await detachDecodedVideoSample(sample())
    const controller = new AbortController()
    const onInterrupt = vi.fn()
    const pending = emitRetainedVideoFrame(
      retained,
      0,
      1 / 30,
      () => new Promise<void>(() => undefined),
      { signal: controller.signal, stallTimeoutMs: 1_000, onInterrupt },
    )

    controller.abort()

    await expect(pending).rejects.toMatchObject({ code: "canceled" })
    expect(onInterrupt).toHaveBeenCalledOnce()
    releaseRetainedVideoFrames([retained])
  })
})
