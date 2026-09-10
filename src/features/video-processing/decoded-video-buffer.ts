import { VIDEO_SAMPLE_PIXEL_FORMATS, VideoSample } from "mediabunny"

import { ProcessingError, throwIfAborted } from "./errors"
import { waitForMediaCleanup, waitForMediaOperation } from "./media-operation"
import type {
  PixelFrameDiagnostic,
  ProcessingDiagnostics,
  ProcessingLocation,
} from "./processing-diagnostics"

export const MAX_RETAINED_DECODED_VIDEO_BYTES = 32 * 1024 * 1024
export const MAX_RETAINED_DECODED_VIDEO_FRAMES = 8

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
  // Copied bytes and layout always use the same native format.
  copyLayout: PlaneLayout[]
  sourcePixelFormat: NonNullable<VideoSample["format"]>
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
  reusablePixelFormat(sample.format)
  const bytes = sample.allocationSize()
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

function representationError(message: string) {
  return new ProcessingError("unsupported-pixel-representation", message, {
    cause: new TypeError(message),
  })
}

function reusablePixelFormat(format: VideoSample["format"]) {
  if (format === null || !VIDEO_SAMPLE_PIXEL_FORMATS.includes(format)) {
    throw representationError("Decoded pixel format cannot be detached and reconstructed.")
  }
  return format
}

function assertPixelLayout(frame: RetainedVideoFrame) {
  const format = reusablePixelFormat(frame.sourcePixelFormat)
  const width = frame.codedWidth
  const height = frame.codedHeight
  if (![width, height].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw representationError("Invalid copied pixel dimensions.")
  }
  // WebCodecs plane geometry for Mediabunny's supported raw formats.
  let planes: number[][]
  if (format === "NV12") {
    planes = [
      [width, height],
      [Math.ceil(width / 2) * 2, Math.ceil(height / 2)],
    ]
  } else if (format.startsWith("I")) {
    const bytes = format.includes("P") ? 2 : 1
    const subX = format.startsWith("I444") ? 1 : 2
    const subY = format.startsWith("I420") ? 2 : 1
    const luma = [width * bytes, height]
    const chroma = [Math.ceil(width / subX) * bytes, Math.ceil(height / subY)]
    planes = [luma, chroma, chroma]
    if (format.includes("A")) planes.push(luma)
  } else {
    planes = [[width * 4, height]]
  }
  if (frame.copyLayout.length !== planes.length) {
    throw representationError("Copied plane count does not match pixel format.")
  }
  const regions: { start: number; end: number }[] = []
  for (const [index, [rowBytes, rows]] of planes.entries()) {
    const { offset, stride } = frame.copyLayout[index]
    const end = offset + stride * rows
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(stride) ||
      stride < rowBytes ||
      !Number.isSafeInteger(end) ||
      end > (frame.pixels?.byteLength ?? 0) ||
      regions.some((region) => offset < region.end && end > region.start)
    ) {
      throw representationError("Copied pixel layout exceeds its buffer or overlaps another plane.")
    }
    regions.push({ start: offset, end })
  }
}

function pixelFrameDiagnostic(frame: RetainedVideoFrame): PixelFrameDiagnostic {
  return {
    pixelFormat: frame.sourcePixelFormat,
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
    throwIfAborted(options.signal)
    const allocationSize = decodedVideoSampleBytes(sample, options.maxBytes)

    pixels = new Uint8Array(allocationSize)
    const layout = await waitForMediaOperation(sample.copyTo(pixels), {
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
      sourcePixelFormat: reusablePixelFormat(sample.format),
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
    options.diagnostics?.describePixelFrame(pixelFrameDiagnostic(frame))
    assertPixelLayout(frame)
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
  assertPixelLayout(frame)

  return new VideoSample(frame.pixels, {
    format: frame.sourcePixelFormat,
    layout: frame.copyLayout,
    // Default copyTo copies the visible region. Mediabunny 1.53.0 coded dimensions
    // are visible dimensions, so reconstruction rebases the crop to (0, 0).
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
  options.diagnostics?.describePixelFrame(pixelFrameDiagnostic(frame))
  let emitted: VideoSample | undefined
  try {
    emitted = createVideoSampleFromRetainedFrame(frame, timestamp, duration)
    options.diagnostics?.enter("video-sample-add", options.context)
    options.diagnostics?.describePixelFrame(pixelFrameDiagnostic(frame))
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
