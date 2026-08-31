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
  "canceled",
  "verification-failed",
  "processing-failed",
] as const

export type ProcessingErrorCode = (typeof PROCESSING_ERROR_CODES)[number]

export class ProcessingError extends Error {
  readonly code: ProcessingErrorCode

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

export function toProcessingError(error: unknown) {
  if (error instanceof ProcessingError) return error
  if (error instanceof DOMException && error.name === "AbortError") {
    return new ProcessingError("canceled", "Local video processing was canceled.", { cause: error })
  }

  return new ProcessingError(
    "processing-failed",
    "Local video processing could not be completed.",
    {
      cause: error,
    },
  )
}
