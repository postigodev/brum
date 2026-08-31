export const REMUX_ERROR_CODES = [
  "input-too-large",
  "output-too-large",
  "invalid-container",
  "invalid-duration",
  "plan-duration-mismatch",
  "unsupported-video-codec",
  "unsupported-audio-codec",
  "unsupported-track-layout",
  "missing-initial-key-packet",
  "unsupported-timeline",
  "audio-decoder-unavailable",
  "audio-encoder-unavailable",
  "unsupported-audio-timeline",
  "audio-reencode-failed",
  "video-decoder-unavailable",
  "video-encoder-unavailable",
  "decoded-video-memory-exceeded",
  "canceled",
  "verification-failed",
  "remux-failed",
] as const

export type RemuxErrorCode = (typeof REMUX_ERROR_CODES)[number]

export class RemuxError extends Error {
  readonly code: RemuxErrorCode

  constructor(code: RemuxErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "RemuxError"
    this.code = code
  }
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new RemuxError("canceled", "The local remux was canceled.", {
      cause: signal.reason,
    })
  }
}

export function toRemuxError(error: unknown) {
  if (error instanceof RemuxError) return error
  if (error instanceof DOMException && error.name === "AbortError") {
    return new RemuxError("canceled", "The local remux was canceled.", { cause: error })
  }

  return new RemuxError("remux-failed", "The local remux could not be completed.", {
    cause: error,
  })
}
