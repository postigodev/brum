import type { PacketType, Rotation } from "mediabunny"

export type TrackKind = "video" | "audio"
export type AudioMode = "none" | "packet-copy" | "reencode"
export type AudioTimelineKind = AudioMode | "unsupported"

export type AudioTimelineAnalysis = {
  kind: AudioTimelineKind
  reason: string
  firstTimestamp: number | null
  endTimestamp: number | null
}

export type PacketRecord = {
  sourceIndex: number
  timestamp: number
  duration: number
  sequenceNumber: number
  type: PacketType
  data: Uint8Array
  hash: string
}

export type PacketLedgerEntry = {
  track: TrackKind
  sourceIndex: number
  repetition: number
  timestamp: number
  duration: number
  type: PacketType
  hash: string
}

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
  decoderConfig: VideoDecoderConfig
  duration: number
  packets: PacketRecord[]
}

export type AudioTrackSummary = {
  kind: "audio"
  codec: "aac"
  codecString: string
  sampleRate: number
  numberOfChannels: number
  decoderConfig: AudioDecoderConfig
  duration: number
  packets: PacketRecord[]
  timeline: AudioTimelineAnalysis
}

export type MediaInspection = {
  duration: number
  video: VideoTrackSummary
  audio: AudioTrackSummary | null
}

export type RemuxVerification = {
  duration: true
  codecs: true
  videoGeometry: true
  audioProperties: true
  packetLedger: true
}

export type RemuxResult = {
  blob: Blob
  duration: number
  byteSize: number
  video: Omit<VideoTrackSummary, "packets" | "decoderConfig">
  audio: Omit<AudioTrackSummary, "packets" | "decoderConfig"> | null
  audioMode: AudioMode
  audioBitrate: number | null
  verification: RemuxVerification
}

export type RemuxOptions = { signal?: AbortSignal }
