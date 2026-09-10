import { VideoSample } from "mediabunny"

import { ProcessingError, throwIfAborted } from "./errors"
import { waitForMediaCleanup, waitForMediaOperation } from "./media-operation"
import type {
  ProcessingDiagnostics,
  ProcessingLocation,
  RgbaFrameDiagnostic,
} from "./processing-diagnostics"

export const MAX_RETAINED_DECODED_VIDEO_BYTES = 32 * 1024 * 1024
export const MAX_RETAINED_DECODED_VIDEO_FRAMES = 8
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
  | "format"
  | "visibleRect"
> & { colorSpace: DecodedColorSpace }

export type RetainedVideoFrame = {
  pixels: Uint8Array | null
  // Returned copy layout is diagnostic evidence only, never the layout of the owned sample.
  copyLayout: PlaneLayout[]
  sourcePixelFormat: VideoSample["format"]
  sourceVisibleRect: VideoSample["visibleRect"]
  timestamp: number
  duration: number
  codedWidth: number
  codedHeight: number
  displayWidth: number
  displayHeight: number
  rotation: VideoSample["rotation"]
  colorSpace: VideoColorSpaceInit
}

export type CollectionOptions = {
  signal?: AbortSignal
  maxBytes?: number
  stallTimeoutMs?: number
  onInterrupt?: () => void | PromiseLike<void>
  storage?: RetainedVideoFrameStorage
  diagnostics?: ProcessingDiagnostics
  context?: ProcessingLocation
  decodeStage?: "metadata-scan" | "range-decode-seek"
}

function memoryError() {
  return new ProcessingError(
    "decoded-video-memory-exceeded",
    "The decoded working set exceeds the safe local memory budget.",
  )
}

export function decodedVideoSampleBytes(
  sample: DecodedVideoSample,
  maxBytes = MAX_RETAINED_DECODED_VIDEO_BYTES,
) {
  const bytes = sample.allocationSize({ format: OWNED_PIXEL_FORMAT })
  if (bytes <= 0 || !isRetainedVideoFrameWithinBudget(0, bytes, maxBytes)) throw memoryError()
  return bytes
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
  frame.copyLayout = []
}

function assertPackedRgba(frame: RetainedVideoFrame) {
  const expectedBytes = frame.codedWidth * frame.codedHeight * 4
  if (
    !Number.isSafeInteger(frame.codedWidth) ||
    frame.codedWidth <= 0 ||
    !Number.isSafeInteger(frame.codedHeight) ||
    frame.codedHeight <= 0 ||
    !Number.isSafeInteger(expectedBytes) ||
    frame.pixels?.byteLength !== expectedBytes
  ) {
    throw new TypeError("RGBA buffer byteLength does not match tightly packed visible dimensions.")
  }
}

function rgbaFrameDiagnostic(frame: RetainedVideoFrame): RgbaFrameDiagnostic {
  return {
    pixelFormat: OWNED_PIXEL_FORMAT,
    sourcePixelFormat: frame.sourcePixelFormat,
    copyLayout: frame.copyLayout.map(({ offset, stride }) => ({ offset, stride })),
    pixelBufferBytes: frame.pixels?.byteLength ?? 0,
    codedWidth: frame.codedWidth,
    codedHeight: frame.codedHeight,
    displayWidth: frame.displayWidth,
    displayHeight: frame.displayHeight,
    sourceVisibleRect: { ...frame.sourceVisibleRect },
  }
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
  options: Pick<
    CollectionOptions,
    "signal" | "stallTimeoutMs" | "onInterrupt" | "maxBytes" | "diagnostics" | "context"
  > = {},
): Promise<RetainedVideoFrame> {
  let pixels: Uint8Array | null = null

  try {
    options.diagnostics?.enter("decoded-frame-copy", options.context)
    const copyOptions = { format: OWNED_PIXEL_FORMAT }
    throwIfAborted(options.signal)
    const allocationSize = decodedVideoSampleBytes(sample, options.maxBytes)

    pixels = new Uint8Array(allocationSize)
    const layout = await waitForMediaOperation(sample.copyTo(pixels, copyOptions), {
      signal: options.signal,
      timeoutMs: options.stallTimeoutMs,
      onInterrupt: () => {
        sample.close()
        return options.onInterrupt?.()
      },
    })

    const frame: RetainedVideoFrame = {
      pixels,
      copyLayout: layout.map(({ offset, stride }) => ({ offset, stride })),
      sourcePixelFormat: sample.format,
      sourceVisibleRect: { ...sample.visibleRect },
      timestamp: sample.timestamp,
      duration: sample.duration,
      codedWidth: sample.codedWidth,
      codedHeight: sample.codedHeight,
      displayWidth: sample.displayWidth,
      displayHeight: sample.displayHeight,
      rotation: sample.rotation,
      colorSpace: retainedColorSpace(sample),
    }
    options.diagnostics?.describeRgbaFrame(rgbaFrameDiagnostic(frame))
    assertPackedRgba(frame)
    return frame
  } catch (error) {
    pixels = null
    throw options.diagnostics?.failure(error) ?? error
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
  assertPackedRgba(frame)

  return new VideoSample(frame.pixels, {
    format: OWNED_PIXEL_FORMAT,
    // copyTo({ format: "RGBA" }) without a custom rect/layout copies the visible region
    // tightly packed. In 1.53.0 codedWidth/Height are visibleRect.width/height. Let the raw
    // constructor generate its one-plane layout; never reapply source crop offsets here.
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
  options: Pick<
    CollectionOptions,
    "signal" | "stallTimeoutMs" | "onInterrupt" | "diagnostics" | "context"
  > = {},
) {
  options.diagnostics?.enter("encoding-sample-creation", options.context)
  options.diagnostics?.describeRgbaFrame(rgbaFrameDiagnostic(frame))
  let emitted: VideoSample | undefined
  try {
    emitted = createVideoSampleFromRetainedFrame(frame, timestamp, duration)
    options.diagnostics?.enter("video-sample-add", options.context)
    options.diagnostics?.describeRgbaFrame(rgbaFrameDiagnostic(frame))
    await waitForMediaOperation(add(emitted), {
      signal: options.signal,
      timeoutMs: options.stallTimeoutMs,
      onInterrupt: options.onInterrupt,
    })
  } catch (error) {
    throw options.diagnostics?.failure(error) ?? error
  } finally {
    emitted?.close()
  }
}

// Consumers own yielded samples. Close late results ourselves after an interrupted next().
export async function* readDecodedVideoSamples<T extends DecodedVideoSample>(
  samples: AsyncIterable<T>,
  options: CollectionOptions = {},
) {
  const iterator = samples[Symbol.asyncIterator]()
  let sourceFrameIndex = options.context?.sourceFrameIndex ?? 0
  try {
    while (true) {
      options.diagnostics?.enter(options.decodeStage ?? "range-decode-seek", {
        ...options.context,
        sourceFrameIndex,
      })
      throwIfAborted(options.signal)
      const pending = Promise.resolve(iterator.next())
      let next: IteratorResult<T>
      try {
        next = await waitForMediaOperation(pending, {
          signal: options.signal,
          timeoutMs: options.stallTimeoutMs,
          onInterrupt: options.onInterrupt,
        })
      } catch (error) {
        void pending.then(
          (result) => {
            if (!result.done) result.value.close()
          },
          () => undefined,
        )
        throw error
      }
      if (next.done) return
      yield next.value
      sourceFrameIndex++
    }
  } catch (error) {
    throw options.diagnostics?.failure(error) ?? error
  } finally {
    if (iterator.return) await waitForMediaCleanup(iterator.return())
  }
}

export async function collectDecodedVideoRange<T extends DecodedVideoSample>(
  samples: AsyncIterable<T>,
  options: CollectionOptions = {},
) {
  const maxBytes = options.maxBytes ?? MAX_RETAINED_DECODED_VIDEO_BYTES
  if (!isRetainedVideoFrameWithinBudget(0, maxBytes) || maxBytes === 0) throw memoryError()
  const storage = options.storage ?? new RetainedVideoFrameStorage()

  try {
    for await (const sample of readDecodedVideoSamples(samples, options)) {
      if (storage.frames.length >= MAX_RETAINED_DECODED_VIDEO_FRAMES) {
        sample.close()
        throw memoryError()
      }
      // Check remaining capacity BEFORE allocating, including the frame being copied.
      const frame = await detachDecodedVideoSample(sample, {
        ...options,
        maxBytes: maxBytes - storage.retainedBytes,
        context: {
          ...options.context,
          sourceFrameIndex: (options.context?.sourceFrameIndex ?? 0) + storage.frames.length,
        },
      })
      storage.retain(frame, maxBytes)
    }
    return storage.take()
  } catch (error) {
    storage.release()
    throw error
  }
}
