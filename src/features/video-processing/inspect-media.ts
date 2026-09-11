import {
  BlobSource,
  EncodedPacketSink,
  Input,
  type InputVideoTrack,
  MP4,
  type PacketType,
  QTFF,
} from "mediabunny"

import { ProcessingError, throwIfAborted, toProcessingError } from "./errors"
import { waitForMediaCleanup, waitForMediaOperation } from "./media-operation"
import { TIMELINE_TOLERANCE_SECONDS } from "./processing-validation"
import type { MediaInspection, VideoTrackSummary } from "./types"

export const SOURCE_INPUT_FORMATS = [MP4, QTFF]

async function assertReadableContainer(input: Input) {
  try {
    if (await input.canRead()) {
      const format = await input.getFormat()
      if (format === MP4 || format === QTFF) return
    }
  } catch (cause) {
    throw new ProcessingError(
      "invalid-container",
      "The selected file is not a readable MP4 or MOV.",
      { cause },
    )
  }
  throw new ProcessingError("invalid-container", "The selected file is not a readable MP4 or MOV.")
}

async function readTracks(input: Input) {
  try {
    return await input.getTracks()
  } catch (cause) {
    throw new ProcessingError(
      "invalid-container",
      "The selected file's tracks could not be read.",
      { cause },
    )
  }
}

async function readSupportedVideoCodec(track: InputVideoTrack) {
  let codec: Awaited<ReturnType<InputVideoTrack["getCodec"]>>
  try {
    codec = await track.getCodec()
  } catch (cause) {
    throw new ProcessingError("unsupported-video-codec", "The video codec is not supported.", {
      cause,
    })
  }
  if (codec !== "avc" && codec !== "hevc") {
    throw new ProcessingError("unsupported-video-codec", "Only H.264 and HEVC video are supported.")
  }
  return codec
}

export function assertInitialKeyPacket(type: PacketType | null) {
  if (type !== "key") {
    throw new ProcessingError(
      "missing-initial-key-packet",
      type === null
        ? "The video track contains no independently decodable packet."
        : "The first video packet must be independently decodable.",
    )
  }
}

async function inspectVideoPackets(
  track: InputVideoTrack,
  signal?: AbortSignal,
  onInterrupt?: () => void,
) {
  const sink = new EncodedPacketSink(track)
  let encodedByteLength = 0
  let packetCount = 0
  const iterator = sink
    .packets(undefined, undefined, { verifyKeyPackets: true })
    [Symbol.asyncIterator]()
  let iterationCompleted = false

  try {
    while (true) {
      const next = await waitForMediaOperation(iterator.next(), { signal, onInterrupt })
      if (next.done) {
        iterationCompleted = true
        break
      }

      if (packetCount === 0) assertInitialKeyPacket(next.value.type)
      encodedByteLength += next.value.data.byteLength
      packetCount += 1
    }
  } finally {
    if (!iterationCompleted && iterator.return) {
      await waitForMediaCleanup(iterator.return())
    }
  }

  if (packetCount === 0) assertInitialKeyPacket(null)

  return encodedByteLength
}

async function inspectVideo(
  track: InputVideoTrack,
  duration: number,
  signal?: AbortSignal,
  onInterrupt?: () => void,
): Promise<VideoTrackSummary> {
  const codec = await readSupportedVideoCodec(track)

  const decoderConfig = await track.getDecoderConfig()
  const codecString = await track.getCodecParameterString()
  if (!decoderConfig || !codecString) {
    throw new ProcessingError(
      "unsupported-video-codec",
      "The video decoder configuration is incomplete.",
    )
  }

  const encodedByteLength = await inspectVideoPackets(track, signal, onInterrupt)
  return {
    kind: "video",
    codec,
    codecString,
    codedWidth: await track.getCodedWidth(),
    codedHeight: await track.getCodedHeight(),
    displayWidth: await track.getDisplayWidth(),
    displayHeight: await track.getDisplayHeight(),
    rotation: await track.getRotation(),
    pixelAspectRatio: await track.getPixelAspectRatio(),
    colorSpace: await track.getColorSpace(),
    duration,
    encodedByteLength,
  }
}

export const MAX_VIDEO_TAIL_GAP_SECONDS = 0.25

export function assertSupportedTrackLayout(
  videoTrackCount: number,
  audioTrackCount: number,
  totalTrackCount: number,
) {
  if (
    videoTrackCount !== 1 ||
    audioTrackCount > 1 ||
    totalTrackCount !== videoTrackCount + audioTrackCount
  ) {
    throw new ProcessingError(
      "unsupported-track-layout",
      "The video file must contain one video track and at most one audio track.",
    )
  }
}

function assertVideoTimeline(
  firstTimestamp: number,
  videoDuration: number,
  containerDuration: number,
  hasAudio: boolean,
) {
  const tailGap = containerDuration - videoDuration
  if (
    Math.abs(firstTimestamp) > TIMELINE_TOLERANCE_SECONDS ||
    tailGap < -TIMELINE_TOLERANCE_SECONDS ||
    tailGap > (hasAudio ? MAX_VIDEO_TAIL_GAP_SECONDS : TIMELINE_TOLERANCE_SECONDS)
  ) {
    throw new ProcessingError(
      "unsupported-timeline",
      "The video track must start at zero and cover the supported source timeline.",
    )
  }
}

export async function readVideoTrackDuration(blob: Blob, signal?: AbortSignal) {
  throwIfAborted(signal)
  const input = new Input({ formats: SOURCE_INPUT_FORMATS, source: new BlobSource(blob) })

  try {
    await assertReadableContainer(input)

    const videoTracks = (await readTracks(input)).filter((track) => track.isVideoTrack())
    if (videoTracks.length !== 1) {
      throw new ProcessingError(
        "unsupported-track-layout",
        "The video file must contain one video track.",
      )
    }

    const videoTrack = videoTracks[0] as InputVideoTrack
    await readSupportedVideoCodec(videoTrack)

    const duration = await videoTrack.computeDuration()
    throwIfAborted(signal)
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new ProcessingError("invalid-duration", "The video track duration is invalid.")
    }

    return duration
  } catch (error) {
    if (error instanceof ProcessingError) throw error
    throw toProcessingError(error)
  } finally {
    input.dispose()
  }
}

export async function inspectMedia(blob: Blob, signal?: AbortSignal): Promise<MediaInspection> {
  throwIfAborted(signal)
  const input = new Input({ formats: SOURCE_INPUT_FORMATS, source: new BlobSource(blob) })

  try {
    await assertReadableContainer(input)

    const tracks = await readTracks(input)
    const videoTracks = tracks.filter((track) => track.isVideoTrack())
    const audioTracks = tracks.filter((track) => track.isAudioTrack())
    assertSupportedTrackLayout(videoTracks.length, audioTracks.length, tracks.length)

    const videoTrack = videoTracks[0] as InputVideoTrack
    await readSupportedVideoCodec(videoTrack)

    const duration = await input.computeDuration(tracks)
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new ProcessingError("invalid-duration", "The video duration is invalid.")
    }

    const [videoFirstTimestamp, videoDuration] = await Promise.all([
      input.getFirstTimestamp([videoTrack]),
      videoTrack.computeDuration(),
    ])
    throwIfAborted(signal)
    const video = await inspectVideo(videoTrack, videoDuration, signal, () => input.dispose())
    assertVideoTimeline(videoFirstTimestamp, videoDuration, duration, audioTracks.length > 0)

    return { duration, video, audioTrackCount: audioTracks.length }
  } catch (error) {
    if (error instanceof ProcessingError) throw error
    throw toProcessingError(error)
  } finally {
    input.dispose()
  }
}
