import type { ProcessingSnapshot } from "./processing-diagnostics"

export const PROCESSING_ERROR_CODES = [
  "input-too-large",
  "output-too-large",
  "invalid-container",
  "invalid-duration",
  "plan-duration-mismatch",
  "unsupported-video-codec",
  "unsupported-track-layout",
  "missing-initial-key-packet",
  "unsupported-timeline",
  "video-decoder-unavailable",
  "video-encoder-unavailable",
  "decoded-video-memory-exceeded",
  "unsupported-pixel-representation",
  "media-stalled",
  "canceled",
  "verification-failed",
  "processing-failed",
] as const

export type ProcessingErrorCode = (typeof PROCESSING_ERROR_CODES)[number]

export class ProcessingError extends Error {
  readonly code: ProcessingErrorCode
  diagnostic?: ProcessingSnapshot

  constructor(code: ProcessingErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "ProcessingError"
    this.code = code
  }
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new ProcessingError("canceled", "Local video processing was canceled.", {
      cause: signal.reason,
    })
  }
}

export function toProcessingError(
  error: unknown,
  diagnostic?: ProcessingSnapshot,
): ProcessingError {
  if (error instanceof ProcessingError) {
    error.diagnostic ??= diagnostic
    return error
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return toProcessingError(
      new ProcessingError("canceled", "Local video processing was canceled.", { cause: error }),
      diagnostic,
    )
  }

  return toProcessingError(
    new ProcessingError("processing-failed", "Local video processing could not be completed.", {
      cause: error,
    }),
    diagnostic,
  )
}
