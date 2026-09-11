import { ProcessingError, toProcessingError } from "./errors"

export const PROCESSING_STAGES = [
  "source-inspection",
  "decoder-capability-check",
  "encoder-capability-check",
  "metadata-scan",
  "timeline-planning",
  "output-start",
  "range-decode-seek",
  "forward-stream-decode",
  "range-validation",
  "decoded-frame-copy",
  "encoding-sample-creation",
  "video-sample-add",
  "output-finalization",
  "output-verification",
  "complete",
] as const
export type ProcessingStage = (typeof PROCESSING_STAGES)[number]
export type ProcessingLocation = {
  rangeIndex?: number
  sourceFrameIndex?: number
  outputFrameIndex?: number
  direction?: "forward" | "reverse"
}
export type PixelFrameDiagnostic = {
  sourceFrameIndex?: number
  pixelFormat: string
  sourcePixelFormat: string | null
  copyLayout: readonly { offset: number; stride: number }[]
  pixelBufferBytes: number
  codedWidth: number
  codedHeight: number
  displayWidth: number
  displayHeight: number
  sourceVisibleRect: { left: number; top: number; width: number; height: number }
}
export type ProcessingTimings = Record<
  | "metadataScan"
  | "forwardDecode"
  | "reverseDecode"
  | "frameCopy"
  | "avcEncoding"
  | "finalization"
  | "verification"
  | "other",
  number
>

function timingCategory(snapshot: ProcessingSnapshot): keyof ProcessingTimings {
  switch (snapshot.stage) {
    case "metadata-scan":
      return "metadataScan"
    case "forward-stream-decode":
      return "forwardDecode"
    case "range-decode-seek":
      return snapshot.direction === "reverse" ? "reverseDecode" : "forwardDecode"
    case "decoded-frame-copy":
      return "frameCopy"
    case "encoding-sample-creation":
    case "video-sample-add":
      return "avcEncoding"
    case "output-finalization":
      return "finalization"
    case "output-verification":
      return "verification"
    default:
      return "other"
  }
}

export type ProcessingSnapshot = ProcessingLocation & {
  stage: ProcessingStage
  metadataFrames: number
  encodedFrames: number
  decodedRanges: number
  sourceFrames?: number
  outputFrames?: number
  pixelFrame?: PixelFrameDiagnostic
  elapsedMs?: number
  timingsMs?: ProcessingTimings
  decodedSamples?: number
  decodeStarts?: { forward: number; reverse: number }
}

// One snapshot per operation, not an accumulating log. No file, pixel, or browser data.
export class ProcessingDiagnostics {
  private progress = { metadataFrames: 0, encodedFrames: 0, decodedRanges: 0, decodedSamples: 0 }
  private readonly startedAt = performance.now()
  private lastStageAt = this.startedAt
  private stoppedAt?: number
  private timings: ProcessingTimings = {
    metadataScan: 0,
    forwardDecode: 0,
    reverseDecode: 0,
    frameCopy: 0,
    avcEncoding: 0,
    finalization: 0,
    verification: 0,
    other: 0,
  }
  private decodeStarts = { forward: 0, reverse: 0 }
  private totals: { sourceFrames?: number; outputFrames?: number } = {}
  private current: ProcessingSnapshot = { stage: "source-inspection", ...this.progress }
  private lastPublished = -Infinity
  private pendingPublish?: ReturnType<typeof setTimeout>
  private firstPixelFrame?: PixelFrameDiagnostic

  constructor(private readonly onProgress?: (snapshot: ProcessingSnapshot) => void) {}

  enter(stage: ProcessingStage, location: ProcessingLocation = {}) {
    const now = performance.now()
    this.timings[timingCategory(this.current)] += now - this.lastStageAt
    this.lastStageAt = now
    if (stage === "complete") this.stoppedAt = now
    const { rangeIndex, sourceFrameIndex, outputFrameIndex, direction } = location
    this.current = {
      ...this.progress,
      ...this.totals,
      stage,
      rangeIndex,
      sourceFrameIndex,
      outputFrameIndex,
      direction,
      pixelFrame: stage === "complete" ? this.firstPixelFrame : undefined,
    }
    this.publish(stage === "complete")
  }

  advance(counter: "metadataFrames" | "encodedFrames" | "decodedRanges" | "decodedSamples") {
    this.progress[counter]++
    this.current = { ...this.current, ...this.progress }
    this.publish()
  }

  setTotals(sourceFrames: number, outputFrames: number) {
    this.totals = { sourceFrames, outputFrames }
    this.current = { ...this.current, ...this.totals }
  }

  describePixelFrame(pixelFrame: PixelFrameDiagnostic) {
    pixelFrame = { ...pixelFrame, sourceFrameIndex: this.current.sourceFrameIndex }
    this.firstPixelFrame ??= pixelFrame
    this.current = { ...this.current, pixelFrame }
    this.publish()
  }

  startDecode(direction: "forward" | "reverse") {
    this.decodeStarts[direction]++
  }

  snapshot(): ProcessingSnapshot {
    const now = this.stoppedAt ?? performance.now()
    const timingsMs = { ...this.timings }
    timingsMs[timingCategory(this.current)] += now - this.lastStageAt
    return {
      ...this.current,
      elapsedMs: now - this.startedAt,
      timingsMs,
      decodeStarts: { ...this.decodeStarts },
    }
  }

  failure(error: unknown) {
    this.stoppedAt ??= performance.now()
    this.publish(true)
    return toProcessingError(error, this.snapshot())
  }

  dispose() {
    if (this.pendingPublish !== undefined) clearTimeout(this.pendingPublish)
    this.pendingPublish = undefined
  }

  private publish(force = false) {
    if (!this.onProgress) return
    const now = Date.now()
    if (!force && now - this.lastPublished < 150) {
      // Publish the latest stage even if the next operation stalls and no more events arrive.
      this.pendingPublish ??= setTimeout(() => this.publish(true), 150 - (now - this.lastPublished))
      return
    }
    this.dispose()
    this.lastPublished = now
    try {
      this.onProgress(this.snapshot())
    } catch {
      // An optional progress observer must not change media processing or mask its errors.
    }
  }
}

export function underlyingProcessingError(error: unknown): { name: string; message: string } {
  const seen = new Set<unknown>()
  while (error instanceof ProcessingError && error.cause !== undefined && !seen.has(error)) {
    seen.add(error)
    error = error.cause
  }
  if (error instanceof Error || error instanceof DOMException) {
    return { name: error.name, message: error.message }
  }
  return {
    name: "ThrownValue",
    message: typeof error === "string" ? error : "Non-Error value thrown.",
  }
}
