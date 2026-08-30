import { RemuxError } from "./errors"

export const MAX_INPUT_BYTES = 52_428_800
export const MAX_OUTPUT_BYTES = 209_715_200

export function assertInputSize(byteSize: number) {
  if (!Number.isSafeInteger(byteSize) || byteSize < 0 || byteSize > MAX_INPUT_BYTES) {
    throw new RemuxError("input-too-large", "The input must be 50 MiB or smaller.")
  }
}

export function assertEstimatedOutputSize(inputBytes: number, repetitions: number) {
  const estimate = inputBytes * repetitions
  if (!Number.isSafeInteger(estimate) || estimate > MAX_OUTPUT_BYTES) {
    throw new RemuxError("output-too-large", "The estimated output exceeds 200 MiB.")
  }
  return estimate
}

export function assertActualOutputSize(byteSize: number) {
  if (!Number.isSafeInteger(byteSize) || byteSize < 0 || byteSize > MAX_OUTPUT_BYTES) {
    throw new RemuxError("output-too-large", "The generated output exceeds 200 MiB.")
  }
}
