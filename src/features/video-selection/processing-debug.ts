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
    if (current.sourceFrames !== undefined)
      lines.push(`source frame count: ${current.sourceFrames}`)
    if (current.rangeIndex !== undefined) lines.push(`range index: ${current.rangeIndex}`)
    if (current.sourceFrameIndex !== undefined)
      lines.push(`source frame index: ${current.sourceFrameIndex}`)
    if (current.outputFrameIndex !== undefined)
      lines.push(`output frame index: ${current.outputFrameIndex}`)
    if (current.direction) lines.push(`direction: ${current.direction}`)
    if (current.elapsedMs !== undefined) lines.push(`elapsed ms: ${Math.round(current.elapsedMs)}`)
    if (current.timingsMs) {
      for (const [stage, elapsed] of Object.entries(current.timingsMs)) {
        lines.push(`${stage} ms: ${Math.round(elapsed)}`)
      }
    }
    if (current.decodedSamples !== undefined)
      lines.push(`decoded source samples delivered: ${current.decodedSamples}`)
    if (current.decodeStarts)
      lines.push(
        `decode starts forward / reverse: ${current.decodeStarts.forward} / ${current.decodeStarts.reverse}`,
      )
    const pixel = current.pixelFrame
    if (pixel) {
      lines.push(`Pixel diagnostic source frame index: ${pixel.sourceFrameIndex ?? "unknown"}`)
      lines.push(`pixel format: ${pixel.pixelFormat}`)
      lines.push(`source pixel format: ${pixel.sourcePixelFormat ?? "unknown"}`)
      lines.push(`copy-returned layout plane count: ${pixel.copyLayout.length}`)
      lines.push(
        `copy-returned layout offsets: ${pixel.copyLayout.map((plane) => plane.offset).join(", ")}`,
      )
      lines.push(
        `copy-returned layout strides: ${pixel.copyLayout.map((plane) => plane.stride).join(", ")}`,
      )
      lines.push(
        `reconstruction layout: copied native ${pixel.pixelFormat} (${pixel.copyLayout.length} planes)`,
      )
      lines.push(`pixel buffer byteLength: ${pixel.pixelBufferBytes}`)
      lines.push(`codedWidth / codedHeight: ${pixel.codedWidth} / ${pixel.codedHeight}`)
      lines.push(`displayWidth / displayHeight: ${pixel.displayWidth} / ${pixel.displayHeight}`)
      const rect = pixel.sourceVisibleRect
      lines.push(
        `source visibleRect (left, top, width, height): ${rect.left}, ${rect.top}, ${rect.width}, ${rect.height}`,
      )
    }
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
