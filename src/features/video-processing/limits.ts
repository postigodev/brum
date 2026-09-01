import { ProcessingError } from "./errors"

export const MAX_INPUT_BYTES = 52_428_800
export const MAX_OUTPUT_BYTES = 209_715_200

export function assertInputSize(byteSize: number) {
  if (!Number.isSafeInteger(byteSize) || byteSize < 0 || byteSize > MAX_INPUT_BYTES) {
    throw new ProcessingError("input-too-large", "The input must be 50 MiB or smaller.")
  }
}

export function assertEstimatedOutputSize(
  bitrateBitsPerSecond: number,
  outputDurationSeconds: number,
) {
  const estimatedVideoBytes = (bitrateBitsPerSecond * outputDurationSeconds) / 8
  if (
    !Number.isFinite(bitrateBitsPerSecond) ||
    bitrateBitsPerSecond <= 0 ||
    !Number.isFinite(outputDurationSeconds) ||
    outputDurationSeconds <= 0 ||
    !Number.isFinite(estimatedVideoBytes) ||
    estimatedVideoBytes > MAX_OUTPUT_BYTES
  ) {
    throw new ProcessingError("output-too-large", "The planned output is likely to exceed 200 MiB.")
  }
  return estimatedVideoBytes
}

export function assertActualOutputSize(byteSize: number) {
  if (!Number.isSafeInteger(byteSize) || byteSize < 0 || byteSize > MAX_OUTPUT_BYTES) {
    throw new ProcessingError("output-too-large", "The generated output exceeds 200 MiB.")
  }
}
