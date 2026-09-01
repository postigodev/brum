import { VideoSample } from "mediabunny"

import { ProcessingError } from "./errors"
import { waitForMediaCleanup, waitForMediaOperation } from "./media-operation"

export const MAX_RETAINED_DECODED_VIDEO_BYTES = 256 * 1024 * 1024
// A packed format makes ownership and retained-byte accounting deterministic across decoders.
const OWNED_PIXEL_FORMAT = "RGBA" as const

type DecodedColorSpace = Pick<
  VideoSample["colorSpace"],
  "primaries" | "transfer" | "matrix" | "fullRange"
>

export type DecodedVideoSample = Pick<
  VideoSample,
  | "allocationSize"
  | "codedHeight"
  | "codedWidth"
  | "copyTo"
  | "displayHeight"
  | "displayWidth"
  | "duration"
  | "rotation"
  | "timestamp"
  | "close"
> & { colorSpace: DecodedColorSpace }

export type RetainedVideoFrame = {
  pixels: Uint8Array | null
  layout: PlaneLayout[]
  timestamp: number
  duration: number
  codedWidth: number
  codedHeight: number
  displayWidth: number
  displayHeight: number
  rotation: VideoSample["rotation"]
  colorSpace: VideoColorSpaceInit
}

type CollectionOptions = {
  signal?: AbortSignal
  maxBytes?: number
  stallTimeoutMs?: number
  onInterrupt?: () => void | PromiseLike<void>
  storage?: RetainedVideoFrameStorage
}

function memoryError() {
  return new ProcessingError(
    "decoded-video-memory-exceeded",
    "The decoded video exceeds the safe local memory budget.",
  )
}

function retainedColorSpace(sample: DecodedVideoSample): VideoColorSpaceInit {
  const { primaries, transfer, matrix, fullRange } = sample.colorSpace
  return {
    primaries: primaries ?? undefined,
    transfer: transfer ?? undefined,
    matrix: matrix ?? undefined,
    fullRange: fullRange ?? undefined,
  }
}

export function retainedVideoFrameBytes(frame: RetainedVideoFrame) {
  return frame.pixels?.byteLength ?? 0
}

export function isRetainedVideoFrameWithinBudget(
  retainedBytes: number,
  frameBytes: number,
  maxBytes = MAX_RETAINED_DECODED_VIDEO_BYTES,
) {
  return (
    Number.isSafeInteger(retainedBytes) &&
    retainedBytes >= 0 &&
    Number.isSafeInteger(frameBytes) &&
    frameBytes >= 0 &&
    Number.isSafeInteger(maxBytes) &&
    maxBytes >= 0 &&
    frameBytes <= maxBytes - retainedBytes
  )
}

export function releaseRetainedVideoFrame(frame: RetainedVideoFrame) {
  frame.pixels = null
  frame.layout = []
}

export function releaseRetainedVideoFrames(frames: RetainedVideoFrame[]) {
  for (const frame of frames) releaseRetainedVideoFrame(frame)
  frames.length = 0
}

export class RetainedVideoFrameStorage {
  readonly frames: RetainedVideoFrame[] = []
  retainedBytes = 0

  retain(frame: RetainedVideoFrame, maxBytes: number) {
    const frameBytes = retainedVideoFrameBytes(frame)
    if (!isRetainedVideoFrameWithinBudget(this.retainedBytes, frameBytes, maxBytes)) {
      releaseRetainedVideoFrame(frame)
      this.release()
      throw memoryError()
    }

    this.retainedBytes += frameBytes
    this.frames.push(frame)
  }

  release() {
    releaseRetainedVideoFrames(this.frames)
    this.retainedBytes = 0
  }

  take() {
    const frames = this.frames.splice(0)
    this.retainedBytes = 0
    return frames
  }
}

export async function detachDecodedVideoSample(
  sample: DecodedVideoSample,
  options: Pick<CollectionOptions, "signal" | "stallTimeoutMs" | "onInterrupt"> = {},
): Promise<RetainedVideoFrame> {
  let pixels: Uint8Array | null = null

  try {
    const copyOptions = { format: OWNED_PIXEL_FORMAT }
    const allocationSize = sample.allocationSize(copyOptions)
    if (!Number.isSafeInteger(allocationSize) || allocationSize <= 0) throw memoryError()

    pixels = new Uint8Array(allocationSize)
    const layout = await waitForMediaOperation(sample.copyTo(pixels, copyOptions), {
      signal: options.signal,
      timeoutMs: options.stallTimeoutMs,
      onInterrupt: () => {
        sample.close()
        return options.onInterrupt?.()
      },
    })

    return {
      pixels,
      layout: layout.map(({ offset, stride }) => ({ offset, stride })),
      timestamp: sample.timestamp,
      duration: sample.duration,
      codedWidth: sample.codedWidth,
      codedHeight: sample.codedHeight,
      displayWidth: sample.displayWidth,
      displayHeight: sample.displayHeight,
      rotation: sample.rotation,
      colorSpace: retainedColorSpace(sample),
    }
  } catch (error) {
    pixels = null
    throw error
  } finally {
    sample.close()
  }
}

export function createVideoSampleFromRetainedFrame(
  frame: RetainedVideoFrame,
  timestamp: number,
  duration: number,
) {
  if (!frame.pixels) throw new Error("Retained video frame has been released.")

  return new VideoSample(frame.pixels, {
    format: OWNED_PIXEL_FORMAT,
    layout: frame.layout,
    codedWidth: frame.codedWidth,
    codedHeight: frame.codedHeight,
    timestamp,
    duration,
    colorSpace: frame.colorSpace,
    rotation: frame.rotation,
    displayWidth: frame.displayWidth,
    displayHeight: frame.displayHeight,
  })
}

export async function emitRetainedVideoFrame(
  frame: RetainedVideoFrame,
  timestamp: number,
  duration: number,
  add: (sample: VideoSample) => PromiseLike<void>,
  options: Pick<CollectionOptions, "signal" | "stallTimeoutMs" | "onInterrupt"> = {},
) {
  const emitted = createVideoSampleFromRetainedFrame(frame, timestamp, duration)
  try {
    await waitForMediaOperation(add(emitted), {
      signal: options.signal,
      timeoutMs: options.stallTimeoutMs,
      onInterrupt: options.onInterrupt,
    })
  } finally {
    emitted.close()
  }
}

export async function collectDecodedVideoSamples<T extends DecodedVideoSample>(
  samples: AsyncIterable<T>,
  options: CollectionOptions = {},
) {
  const maxBytes = options.maxBytes ?? MAX_RETAINED_DECODED_VIDEO_BYTES
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw memoryError()

  const storage = options.storage ?? new RetainedVideoFrameStorage()
  const iterator = samples[Symbol.asyncIterator]()
  let iterationCompleted = false

  try {
    while (true) {
      const next = await waitForMediaOperation(iterator.next(), {
        signal: options.signal,
        timeoutMs: options.stallTimeoutMs,
        onInterrupt: options.onInterrupt,
      })
      if (next.done) {
        iterationCompleted = true
        return storage.take()
      }

      const frame = await detachDecodedVideoSample(next.value, options)
      storage.retain(frame, maxBytes)
    }
  } catch (error) {
    storage.release()
    throw error
  } finally {
    if (!iterationCompleted && iterator.return) {
      await waitForMediaCleanup(iterator.return())
    }
  }
}
