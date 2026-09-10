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
    const rgba = current.rgbaFrame
    if (rgba) {
      lines.push(`RGBA diagnostic source frame index: ${rgba.sourceFrameIndex ?? "unknown"}`)
      lines.push(`pixel format: ${rgba.pixelFormat}`)
      lines.push(`source pixel format: ${rgba.sourcePixelFormat ?? "unknown"}`)
      lines.push(`copy-returned layout plane count: ${rgba.copyLayout.length}`)
      lines.push(
        `copy-returned layout offsets: ${rgba.copyLayout.map((plane) => plane.offset).join(", ")}`,
      )
      lines.push(
        `copy-returned layout strides: ${rgba.copyLayout.map((plane) => plane.stride).join(", ")}`,
      )
      lines.push(
        `reconstruction layout: default packed RGBA (1 plane, offset 0, stride ${rgba.codedWidth * 4})`,
      )
      lines.push(`pixel buffer byteLength: ${rgba.pixelBufferBytes}`)
      lines.push(`codedWidth / codedHeight: ${rgba.codedWidth} / ${rgba.codedHeight}`)
      lines.push(`displayWidth / displayHeight: ${rgba.displayWidth} / ${rgba.displayHeight}`)
      const rect = rgba.sourceVisibleRect
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
