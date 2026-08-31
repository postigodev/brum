import type { Rotation } from "mediabunny"

export type VideoTrackSummary = {
  kind: "video"
  codec: "avc"
  codecString: string
  codedWidth: number
  codedHeight: number
  displayWidth: number
  displayHeight: number
  rotation: Rotation
  pixelAspectRatio: { num: number; den: number }
  colorSpace: VideoColorSpaceInit
  duration: number
  encodedByteLength: number
}

export type MediaInspection = {
  duration: number
  video: VideoTrackSummary
  audioTrackCount: number
}

export type BoomerangVerification = {
  duration: true
  codec: true
  videoGeometry: true
  silent: true
  videoTimeline: true
}

export type BoomerangResult = {
  blob: Blob
  duration: number
  byteSize: number
  video: Omit<VideoTrackSummary, "encodedByteLength">
  verification: BoomerangVerification
}

export type ProcessingOptions = { signal?: AbortSignal }
