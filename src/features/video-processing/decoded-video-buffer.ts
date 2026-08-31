import type { VideoSample } from "mediabunny"

import { RemuxError, throwIfAborted } from "./errors"

export const MAX_RETAINED_DECODED_VIDEO_BYTES = 256 * 1024 * 1024

type RetainableVideoSample = Pick<VideoSample, "codedWidth" | "codedHeight" | "close">

function memoryError() {
  return new RemuxError(
    "decoded-video-memory-exceeded",
    "The decoded video exceeds the safe local memory budget.",
  )
}

export function estimateDecodedVideoSampleBytes(sample: RetainableVideoSample) {
  const { codedWidth, codedHeight } = sample
  if (
    !Number.isSafeInteger(codedWidth) ||
    codedWidth <= 0 ||
    !Number.isSafeInteger(codedHeight) ||
    codedHeight <= 0
  ) {
    throw memoryError()
  }

  const bytes = codedWidth * codedHeight * 4
  if (!Number.isSafeInteger(bytes)) throw memoryError()
  return bytes
}

export async function collectDecodedVideoSamples<T extends RetainableVideoSample>(
  samples: AsyncIterable<T>,
  signal?: AbortSignal,
  maxBytes = MAX_RETAINED_DECODED_VIDEO_BYTES,
) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw memoryError()

  const retained: T[] = []
  let retainedBytes = 0

  try {
    for await (const sample of samples) {
      try {
        throwIfAborted(signal)
        const sampleBytes = estimateDecodedVideoSampleBytes(sample)
        if (sampleBytes > maxBytes - retainedBytes) throw memoryError()
        retainedBytes += sampleBytes
        retained.push(sample)
      } catch (error) {
        sample.close()
        throw error
      }
    }
    return retained
  } catch (error) {
    for (const sample of retained) sample.close()
    throw error
  }
}
