import { ProcessingError, toProcessingError } from "./errors"

export const PROCESSING_STAGES = [
  "source-inspection",
  "decoder-capability-check",
  "encoder-capability-check",
  "metadata-scan",
  "timeline-planning",
  "output-start",
  "range-decode-seek",
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
export type ProcessingSnapshot = ProcessingLocation & {
  stage: ProcessingStage
  metadataFrames: number
  encodedFrames: number
  decodedRanges: number
  sourceFrames?: number
  outputFrames?: number
}

// One snapshot per operation, not an accumulating log. No file, pixel, or browser data.
export class ProcessingDiagnostics {
  private progress = { metadataFrames: 0, encodedFrames: 0, decodedRanges: 0 }
  private totals: { sourceFrames?: number; outputFrames?: number } = {}
  private current: ProcessingSnapshot = { stage: "source-inspection", ...this.progress }
  private lastPublished = -Infinity
  private pendingPublish?: ReturnType<typeof setTimeout>

  constructor(private readonly onProgress?: (snapshot: ProcessingSnapshot) => void) {}

  enter(stage: ProcessingStage, location: ProcessingLocation = {}) {
    const { rangeIndex, sourceFrameIndex, outputFrameIndex, direction } = location
    this.current = {
      ...this.progress,
      ...this.totals,
      stage,
      rangeIndex,
      sourceFrameIndex,
      outputFrameIndex,
      direction,
    }
    this.publish(stage === "complete")
  }

  advance(counter: "metadataFrames" | "encodedFrames" | "decodedRanges") {
    this.progress[counter]++
    this.current = { ...this.current, ...this.progress }
    this.publish()
  }

  setTotals(sourceFrames: number, outputFrames: number) {
    this.totals = { sourceFrames, outputFrames }
    this.current = { ...this.current, ...this.totals }
  }

  snapshot(): ProcessingSnapshot {
    return { ...this.current }
  }

  failure(error: unknown) {
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
