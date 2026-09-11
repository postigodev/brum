import type { ProcessingErrorCode } from "#/features/video-processing"
import type { ExtensionTarget } from "./extension-plan"

const PROCESSING_ERROR_MESSAGES: Record<ProcessingErrorCode, string> = {
  "input-too-large": "Choose a video smaller than 50 MB.",
  "output-too-large": "That result would be too large to create safely on this device.",
  "invalid-container": "Choose a readable MP4 or MOV video.",
  "invalid-duration": "Brum could not read a valid duration from this video.",
  "plan-duration-mismatch": "The video changed while preparing the boomerang. Choose it again.",
  "unsupported-video-codec": "Brum supports H.264 or HEVC video in MP4 and MOV files.",
  "unsupported-track-layout": "This video contains a track layout Brum does not support yet.",
  "missing-initial-key-packet": "This video cannot be decoded cleanly from its first frame.",
  "unsupported-timeline": "This video's track timing is not supported yet.",
  "video-decoder-unavailable": "This browser cannot decode this video locally.",
  "video-encoder-unavailable": "This browser cannot create H.264 video locally.",
  "unsupported-pixel-representation": "This browser cannot safely copy this video pixel format.",
  "decoded-video-memory-exceeded":
    "This video needs too much decoded memory to process safely on this device.",
  "media-stalled":
    "Video processing stopped responding. Try again or choose a shorter or smaller video.",
  canceled: "Boomerang creation was canceled.",
  "verification-failed": "Brum could not verify the completed video.",
  "processing-failed": "Brum could not create this boomerang. Try another video.",
}

export function processingErrorMessage(code: ProcessingErrorCode) {
  return PROCESSING_ERROR_MESSAGES[code]
}

export function outputFilename(sourceName: string, target: ExtensionTarget) {
  const sourceBase = sourceName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-")
  const safeBase = sourceBase.replace(/^-+|-+$/g, "") || "video"
  const targetLabel = target.mode === "duration" ? `${target.value}s` : `${target.value}x`
  return `${safeBase}-brum-${targetLabel}.mp4`
}
