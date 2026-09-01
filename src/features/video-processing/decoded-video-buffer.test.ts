import { describe, expect, it, vi } from "vitest"

import {
  collectDecodedVideoSamples,
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
  it("copies RGBA pixels and closes the decoder sample immediately", async () => {
    const decoded = sample()
    const retained = await detachDecodedVideoSample(decoded)

    expect(decoded.allocationSize).toHaveBeenCalledWith({ format: "RGBA" })
    expect(decoded.copyTo).toHaveBeenCalledWith(expect.any(Uint8Array), { format: "RGBA" })
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

  it("accounts for the actual owned allocation instead of frame dimensions", async () => {
    const [retained] = await collectDecodedVideoSamples(
      yieldSamples([sample({ width: 100, height: 100, allocationSize: 7 })]),
      { maxBytes: 7 },
    )

    expect(retained && retainedVideoFrameBytes(retained)).toBe(7)
    releaseRetainedVideoFrames(retained ? [retained] : [])
  })

  it("uses a centralized 256 MiB limit", () => {
    expect(MAX_RETAINED_DECODED_VIDEO_BYTES).toBe(256 * 1024 * 1024)
    expect(isRetainedVideoFrameWithinBudget(MAX_RETAINED_DECODED_VIDEO_BYTES - 1, 1)).toBe(true)
    expect(isRetainedVideoFrameWithinBudget(MAX_RETAINED_DECODED_VIDEO_BYTES - 1, 2)).toBe(false)
  })

  it("allows owned allocations to equal the limit exactly", async () => {
    const frames = await collectDecodedVideoSamples(
      yieldSamples([sample({ allocationSize: 3 }), sample({ allocationSize: 5 })]),
      { maxBytes: 8 },
    )

    expect(frames.map(retainedVideoFrameBytes)).toEqual([3, 5])
    releaseRetainedVideoFrames(frames)
  })

  it("releases every retained owned buffer deterministically", async () => {
    const frames = await collectDecodedVideoSamples(yieldSamples([sample(), sample()]))
    const retainedReferences = [...frames]

    releaseRetainedVideoFrames(frames)

    expect(frames).toEqual([])
    expect(retainedReferences.every((frame) => frame.pixels === null)).toBe(true)
  })

  it("rejects the next owned allocation above the limit and closes every decoder sample", async () => {
    const storage = new RetainedVideoFrameStorage()
    const first = sample({ allocationSize: 4 })
    let firstRetained: RetainedVideoFrame | undefined
    const rejected = sample({
      allocationSize: 1,
      onCopy: () => {
        ;[firstRetained] = storage.frames
      },
    })

    await expect(
      collectDecodedVideoSamples(yieldSamples([first, rejected]), { maxBytes: 4, storage }),
    ).rejects.toMatchObject({ code: "decoded-video-memory-exceeded" })
    expect(first.close).toHaveBeenCalledOnce()
    expect(rejected.close).toHaveBeenCalledOnce()
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
      collectDecodedVideoSamples(yieldSamples([first, failed]), { storage }),
    ).rejects.toThrow("copy failed")
    expect(first.close).toHaveBeenCalledOnce()
    expect(failed.close).toHaveBeenCalledOnce()
    expect(firstRetained?.pixels).toBeNull()
    expect(storage.frames).toEqual([])
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
    const pending = collectDecodedVideoSamples(samples, {
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
