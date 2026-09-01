import { ProcessingError, throwIfAborted } from "./errors"

// This is a per-operation progress window, not a total processing deadline.
export const MEDIA_STALL_TIMEOUT_MS = 120_000
export const MEDIA_CLEANUP_TIMEOUT_MS = 10_000

type MediaOperationOptions = {
  signal?: AbortSignal
  timeoutMs?: number
  onInterrupt?: () => void | PromiseLike<void>
}

type OperationOutcome<T> =
  | { type: "completed"; value: T }
  | { type: "failed"; error: unknown }
  | { type: "canceled" }
  | { type: "stalled" }

function startInterruption(callback?: () => void | PromiseLike<void>) {
  if (!callback) return

  try {
    void Promise.resolve(callback()).catch(() => undefined)
  } catch {
    // The processing error remains actionable even if cleanup itself throws.
  }
}

export async function waitForMediaOperation<T>(
  operation: PromiseLike<T>,
  options: MediaOperationOptions = {},
): Promise<T> {
  const { signal, timeoutMs = MEDIA_STALL_TIMEOUT_MS, onInterrupt } = options
  throwIfAborted(signal)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("timeoutMs must be a positive safe integer.")
  }

  const completed: Promise<OperationOutcome<T>> = Promise.resolve(operation).then(
    (value) => ({ type: "completed", value }),
    (error: unknown) => ({ type: "failed", error }),
  )

  let removeAbortListener: () => void = () => undefined
  const canceled = new Promise<OperationOutcome<T>>((resolve) => {
    if (!signal) return

    const onAbort = () => resolve({ type: "canceled" })
    signal.addEventListener("abort", onAbort, { once: true })
    removeAbortListener = () => signal.removeEventListener("abort", onAbort)
  })

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const stalled = new Promise<OperationOutcome<T>>((resolve) => {
    timeoutId = setTimeout(() => resolve({ type: "stalled" }), timeoutMs)
  })

  try {
    const outcome = await Promise.race([completed, canceled, stalled])
    if (outcome.type === "completed") return outcome.value
    if (outcome.type === "failed") throw outcome.error

    startInterruption(onInterrupt)
    if (outcome.type === "canceled") {
      throw new ProcessingError("canceled", "Local video processing was canceled.", {
        cause: signal?.reason,
      })
    }

    throw new ProcessingError("media-stalled", "Local video processing stopped making progress.")
  } finally {
    removeAbortListener()
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

export async function waitForMediaCleanup(operation: PromiseLike<unknown>) {
  await waitForMediaOperation(operation, { timeoutMs: MEDIA_CLEANUP_TIMEOUT_MS }).catch(
    () => undefined,
  )
}
