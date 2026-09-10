import { type ProcessingError, toProcessingError } from "../video-processing/errors"
import {
  type ProcessingSnapshot,
  underlyingProcessingError,
} from "../video-processing/processing-diagnostics"

// Display only the allowlisted diagnostic fields; never serialize Error, stack, or its cause.
function diagnosticText(value: string, filename?: string) {
  let text = filename ? value.split(filename).join("[file]") : value
  text = text.split(/\r?\n/)[0] ?? ""
  return text
    .replace(/(?:https?:|file:|blob:|data:)\S+/gi, "[resource]")
    .replace(/(?:[A-Za-z]:\\|\/Users\/|\/home\/|\/var\/)[^\s"']+/g, "[path]")
    .slice(0, 600)
}

export function formatProcessingDebug(
  snapshot: ProcessingSnapshot | null,
  error: ProcessingError | null,
  filename?: string,
) {
  const current = error?.diagnostic ?? snapshot
  const lines = [
    `processing code: ${error?.code ?? (current?.stage === "complete" ? "success" : "in-progress")}`,
    `processing stage: ${current?.stage ?? "source-inspection"}`,
  ]
  if (error) {
    const cause = underlyingProcessingError(error)
    lines.push(`underlying error name: ${diagnosticText(cause.name, filename)}`)
    lines.push(`underlying error message: ${diagnosticText(cause.message, filename)}`)
  }
  if (current) {
    lines.push(`metadata frames scanned: ${current.metadataFrames}`)
    lines.push(`ranges decoded: ${current.decodedRanges}`)
    lines.push(`frames encoded: ${current.encodedFrames} / ${current.outputFrames ?? "unknown"}`)
    if (current.sourceFrames !== undefined) lines.push(`source frames: ${current.sourceFrames}`)
    if (current.rangeIndex !== undefined) lines.push(`range index: ${current.rangeIndex}`)
    if (current.sourceFrameIndex !== undefined)
      lines.push(`source frame index: ${current.sourceFrameIndex}`)
    if (current.outputFrameIndex !== undefined)
      lines.push(`output frame index: ${current.outputFrameIndex}`)
    if (current.direction) lines.push(`direction: ${current.direction}`)
  }
  return lines.join("\n")
}

export function inspectionDiagnostic(error: unknown) {
  return toProcessingError(error, {
    stage: "source-inspection",
    metadataFrames: 0,
    encodedFrames: 0,
    decodedRanges: 0,
  })
}
