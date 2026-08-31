import { describe, expect, it, vi } from "vitest"

import {
  collectDecodedVideoSamples,
  estimateDecodedVideoSampleBytes,
  MAX_RETAINED_DECODED_VIDEO_BYTES,
} from "./decoded-video-buffer"

function sample(codedWidth: number, codedHeight: number) {
  return { codedWidth, codedHeight, close: vi.fn() }
}

async function* yieldSamples<T>(samples: readonly T[]) {
  for (const value of samples) yield value
}

describe("decoded video buffer", () => {
  it("estimates each sample from its actual coded dimensions", () => {
    expect(estimateDecodedVideoSampleBytes(sample(1920, 1080))).toBe(1920 * 1080 * 4)
    expect(estimateDecodedVideoSampleBytes(sample(640, 360))).toBe(640 * 360 * 4)
  })

  it("uses a centralized 256 MiB limit", () => {
    expect(MAX_RETAINED_DECODED_VIDEO_BYTES).toBe(256 * 1024 * 1024)
  })

  it("allows the decoded workload to equal the limit exactly", async () => {
    const frame = sample(4, 4)
    const retained = await collectDecodedVideoSamples(yieldSamples([frame]), undefined, 64)

    expect(retained).toEqual([frame])
    expect(frame.close).not.toHaveBeenCalled()
    frame.close()
  })

  it("closes the rejected sample and all retained samples when the next frame exceeds the limit", async () => {
    const first = sample(1, 1)
    const rejected = sample(1, 1)

    await expect(
      collectDecodedVideoSamples(yieldSamples([first, rejected]), undefined, 4),
    ).rejects.toMatchObject({ code: "decoded-video-memory-exceeded" })
    expect(first.close).toHaveBeenCalledOnce()
    expect(rejected.close).toHaveBeenCalledOnce()
  })

  it("rejects unsafe frame arithmetic and closes the sample", async () => {
    const unsafe = sample(Number.MAX_SAFE_INTEGER, 2)

    await expect(collectDecodedVideoSamples(yieldSamples([unsafe]))).rejects.toMatchObject({
      code: "decoded-video-memory-exceeded",
    })
    expect(unsafe.close).toHaveBeenCalledOnce()
  })

  it("closes the current and retained samples when canceled", async () => {
    const controller = new AbortController()
    const first = sample(1, 1)
    const current = sample(1, 1)
    async function* cancelDuringDecode() {
      yield first
      controller.abort()
      yield current
    }

    await expect(
      collectDecodedVideoSamples(cancelDuringDecode(), controller.signal),
    ).rejects.toMatchObject({ code: "canceled" })
    expect(first.close).toHaveBeenCalledOnce()
    expect(current.close).toHaveBeenCalledOnce()
  })

  it("closes retained samples when decoding fails", async () => {
    const retained = sample(1, 1)
    async function* failDuringDecode() {
      yield retained
      throw new Error("decoder failed")
    }

    await expect(collectDecodedVideoSamples(failDuringDecode())).rejects.toThrow("decoder failed")
    expect(retained.close).toHaveBeenCalledOnce()
  })

  it("leaves a supported collection open for its caller", async () => {
    const frames = [sample(2, 2), sample(3, 1)]
    const retained = await collectDecodedVideoSamples(yieldSamples(frames))

    expect(retained).toEqual(frames)
    expect(frames.every((frame) => frame.close.mock.calls.length === 0)).toBe(true)
    retained.forEach((frame) => {
      frame.close()
    })
  })
})
