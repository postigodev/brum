import { describe, expect, it, vi } from "vitest"
import { ProcessingError, toProcessingError } from "../video-processing/errors"
import { ProcessingDiagnostics } from "../video-processing/processing-diagnostics"
import { formatProcessingDebug } from "./processing-debug"

describe("opt-in processing report", () => {
  it("publishes the latest stage even when an operation stops making progress", () => {
    vi.useFakeTimers()
    const report = vi.fn()
    const tracker = new ProcessingDiagnostics(report)
    try {
      tracker.enter("metadata-scan")
      tracker.enter("range-decode-seek", { rangeIndex: 7 })
      vi.advanceTimersByTime(150)
      expect(report).toHaveBeenLastCalledWith(
        expect.objectContaining({ stage: "range-decode-seek", rangeIndex: 7 }),
      )
      tracker.enter("decoded-frame-copy")
      tracker.dispose()
      vi.advanceTimersByTime(150)
      expect(report).toHaveBeenCalledTimes(2)
    } finally {
      tracker.dispose()
      vi.useRealTimers()
    }
  })

  it("keeps original causes and the innermost stage through repeated wrapping", () => {
    const tracker = new ProcessingDiagnostics()
    tracker.enter("decoded-frame-copy", { rangeIndex: 3, sourceFrameIndex: 12 })
    const original = new TypeError("Unsupported color conversion")
    const error = tracker.failure(original)
    tracker.enter("output-finalization")
    expect(tracker.failure(error)).toBe(error)
    expect(error.cause).toBe(original)
    expect(formatProcessingDebug(null, error)).toContain("processing stage: decoded-frame-copy")
    expect(formatProcessingDebug(null, error)).toContain("source frame index: 12")
    expect(formatProcessingDebug(null, error)).toContain("underlying error name: TypeError")
  })

  it("projects only safe fields and strips filename, resource URLs and multiline stacks", () => {
    const original = new Error(
      "Failed private.mp4 at blob:https://example.com/secret\n at privateStack()",
    )
    const error = toProcessingError(
      new ProcessingError("processing-failed", "wrapper", { cause: original }),
    )
    const report = formatProcessingDebug(null, error, "private.mp4")
    expect(report).toContain("Failed [file] at [resource]")
    expect(report).not.toMatch(/private|example|stack|blob:/i)
    expect(original.message).toContain("private.mp4")
  })

  it("tracks completed work separately from the operation that failed", () => {
    const tracker = new ProcessingDiagnostics(() => {
      throw new Error("observer failed")
    })
    tracker.advance("metadataFrames")
    tracker.setTotals(1, 4)
    tracker.advance("decodedRanges")
    tracker.advance("encodedFrames")
    tracker.enter("video-sample-add", { outputFrameIndex: 1, sourceFrameIndex: 0 })
    const report = formatProcessingDebug(null, tracker.failure(new Error("encoder failed")))
    expect(report).toContain("frames encoded: 1 / 4")
    expect(report).toContain("output frame index: 1")
    expect(report).toContain("metadata frames scanned: 1")
  })
})
