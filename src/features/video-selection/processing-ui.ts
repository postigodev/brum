import type { RemuxErrorCode } from "#/features/video-processing"
import type { ExtensionTarget } from "./extension-plan"

const PROCESSING_ERROR_MESSAGES: Record<RemuxErrorCode, string> = {
  "input-too-large": "Choose a video smaller than 50 MB.",
  "output-too-large": "That result would be too large to create safely on this device.",
  "invalid-container": "Brumaire currently supports readable MP4 files.",
  "invalid-duration": "Brumaire could not read a valid duration from this video.",
  "plan-duration-mismatch": "The video changed while preparing the extension. Choose it again.",
  "unsupported-video-codec": "Brumaire currently supports MP4 video encoded with H.264.",
  "unsupported-audio-codec": "Brumaire currently supports videos with AAC audio.",
  "unsupported-track-layout": "This MP4 contains a track layout Brumaire does not support yet.",
  "missing-initial-key-packet": "This video cannot be repeated cleanly from its first frame.",
  "unsupported-timeline": "This video's track timing is not supported yet.",
  "audio-decoder-unavailable": "This browser cannot process this video's audio locally.",
  "audio-encoder-unavailable": "This browser cannot create compatible AAC audio locally.",
  "unsupported-audio-timeline": "This video's audio timing is not supported yet.",
  "audio-reencode-failed": "Brumaire could not rebuild this video's audio.",
  canceled: "The extension was canceled.",
  "verification-failed": "Brumaire could not verify the completed video.",
  "remux-failed": "Brumaire could not extend this video. Try another MP4.",
}

export function processingErrorMessage(code: RemuxErrorCode) {
  return PROCESSING_ERROR_MESSAGES[code]
}

export function outputFilename(sourceName: string, target: ExtensionTarget) {
  const sourceBase = sourceName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-")
  const safeBase = sourceBase.replace(/^-+|-+$/g, "") || "video"
  const targetLabel = target.mode === "duration" ? `${target.value}s` : `${target.value}x`
  return `${safeBase}-brumaire-${targetLabel}.mp4`
}
