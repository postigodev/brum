import {
  BlobSource,
  EncodedPacketSink,
  Input,
  type InputAudioTrack,
  type InputTrack,
  type InputVideoTrack,
  MP4,
} from "mediabunny"

import { classifyAudioTimeline } from "./audio-timeline"
import { RemuxError, throwIfAborted, toRemuxError } from "./errors"
import { TIMELINE_TOLERANCE_SECONDS } from "./packet-schedule"
import type { AudioTrackSummary, MediaInspection, PacketRecord, VideoTrackSummary } from "./types"

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function hashPacket(data: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(data))
  return toHex(new Uint8Array(digest))
}

async function readPackets(track: InputTrack, signal?: AbortSignal) {
  const packets: PacketRecord[] = []
  const sink = new EncodedPacketSink(track)
  let sourceIndex = 0

  for await (const packet of sink.packets(undefined, undefined, {
    verifyKeyPackets: track.isVideoTrack(),
  })) {
    throwIfAborted(signal)
    packets.push({
      sourceIndex,
      timestamp: packet.timestamp,
      duration: packet.duration,
      sequenceNumber: packet.sequenceNumber,
      type: packet.type,
      data: packet.data.slice(),
      hash: await hashPacket(packet.data),
    })
    sourceIndex += 1
  }

  return packets
}

async function inspectVideo(track: InputVideoTrack, duration: number, signal?: AbortSignal) {
  const codec = await track.getCodec()
  if (codec !== "avc") {
    throw new RemuxError("unsupported-video-codec", "Only H.264 video is supported.")
  }

  const decoderConfig = await track.getDecoderConfig()
  const codecString = await track.getCodecParameterString()
  if (!decoderConfig || !codecString) {
    throw new RemuxError("unsupported-video-codec", "The H.264 configuration is incomplete.")
  }

  const packets = await readPackets(track, signal)
  if (packets.length === 0 || packets[0]?.type !== "key") {
    throw new RemuxError(
      "missing-initial-key-packet",
      "The first video packet must be independently decodable.",
    )
  }

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
    decoderConfig,
    duration,
    packets,
  } satisfies VideoTrackSummary
}

async function inspectAudio(
  track: InputAudioTrack,
  duration: number,
  sourceDuration: number,
  signal?: AbortSignal,
) {
  const codec = await track.getCodec()
  if (codec !== "aac") {
    throw new RemuxError("unsupported-audio-codec", "Only AAC audio is supported.")
  }

  const decoderConfig = await track.getDecoderConfig()
  const codecString = await track.getCodecParameterString()
  if (!decoderConfig || !codecString) {
    throw new RemuxError("unsupported-audio-codec", "The AAC configuration is incomplete.")
  }

  const packets = await readPackets(track, signal)
  return {
    kind: "audio",
    codec,
    codecString,
    sampleRate: await track.getSampleRate(),
    numberOfChannels: await track.getNumberOfChannels(),
    decoderConfig,
    duration,
    packets,
    timeline: classifyAudioTimeline(packets, sourceDuration),
  } satisfies AudioTrackSummary
}

function assertTrackTimeline(firstTimestamp: number, duration: number, containerDuration: number) {
  if (
    Math.abs(firstTimestamp) > TIMELINE_TOLERANCE_SECONDS ||
    Math.abs(duration - containerDuration) > TIMELINE_TOLERANCE_SECONDS
  ) {
    throw new RemuxError(
      "unsupported-timeline",
      "All supported tracks must share a zero origin and equal duration.",
    )
  }
}

export const MAX_VIDEO_TAIL_GAP_SECONDS = 0.25

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
    throw new RemuxError(
      "unsupported-timeline",
      "The video track must start at zero and cover the supported source timeline.",
    )
  }
}

export async function inspectMedia(blob: Blob, signal?: AbortSignal): Promise<MediaInspection> {
  throwIfAborted(signal)
  const input = new Input({ formats: [MP4], source: new BlobSource(blob) })

  try {
    if (!(await input.canRead()) || (await input.getFormat()) !== MP4) {
      throw new RemuxError("invalid-container", "The selected file is not a readable MP4.")
    }

    const tracks = await input.getTracks()
    const videoTracks = tracks.filter((track) => track.isVideoTrack())
    const audioTracks = tracks.filter((track) => track.isAudioTrack())
    if (
      videoTracks.length !== 1 ||
      audioTracks.length > 1 ||
      tracks.length !== videoTracks.length + audioTracks.length
    ) {
      throw new RemuxError(
        "unsupported-track-layout",
        "The MP4 must contain one video track and at most one audio track.",
      )
    }

    let videoCodec: Awaited<ReturnType<InputVideoTrack["getCodec"]>> = null
    try {
      videoCodec = await (videoTracks[0] as InputVideoTrack).getCodec()
    } catch {
      // Some unknown MP4 sample entries fail while Mediabunny resolves the normalized codec.
    }
    if (videoCodec !== "avc") {
      throw new RemuxError("unsupported-video-codec", "Only H.264 video is supported.")
    }
    if (audioTracks[0]) {
      let audioCodec: Awaited<ReturnType<InputAudioTrack["getCodec"]>> = null
      try {
        audioCodec = await (audioTracks[0] as InputAudioTrack).getCodec()
      } catch {
        // Classify an unreadable audio sample entry as an unsupported input, not a remux crash.
      }
      if (audioCodec !== "aac") {
        throw new RemuxError("unsupported-audio-codec", "Only AAC audio is supported.")
      }
    }

    const computedDuration = await input.computeDuration(tracks)
    if (!Number.isFinite(computedDuration) || computedDuration <= 0) {
      throw new RemuxError("invalid-duration", "The MP4 duration is invalid.")
    }

    const videoTrack = videoTracks[0] as InputVideoTrack
    const [videoFirstTimestamp, videoDuration] = await Promise.all([
      input.getFirstTimestamp([videoTrack]),
      videoTrack.computeDuration(),
    ])
    throwIfAborted(signal)
    const video = await inspectVideo(videoTrack, videoDuration, signal)
    const audioTrack = audioTracks[0] as InputAudioTrack | undefined
    const audioDuration = audioTrack ? await audioTrack.computeDuration() : null
    const audio = audioTrack
      ? await inspectAudio(audioTrack, audioDuration as number, computedDuration, signal)
      : null
    const primedAudioDuration =
      audio?.timeline.kind === "reencode" &&
      audio.timeline.firstTimestamp !== null &&
      audio.timeline.endTimestamp !== null
        ? audio.timeline.endTimestamp - audio.timeline.firstTimestamp
        : null
    const duration =
      primedAudioDuration === null
        ? computedDuration
        : Math.max(computedDuration, primedAudioDuration)

    assertVideoTimeline(videoFirstTimestamp, videoDuration, duration, audio !== null)
    if (audio) {
      audio.timeline = classifyAudioTimeline(audio.packets, duration)
      if (audio.timeline.kind === "packet-copy") {
        assertTrackTimeline(0, audioDuration as number, duration)
      }
    }

    const sharedOrigin =
      audio?.timeline.kind === "packet-copy"
        ? Math.min(video.packets[0]?.timestamp ?? 0, audio.packets[0]?.timestamp ?? 0)
        : (video.packets[0]?.timestamp ?? 0)
    for (const packet of video.packets) packet.timestamp -= sharedOrigin
    if (audio?.timeline.kind === "packet-copy") {
      for (const packet of audio.packets) packet.timestamp -= sharedOrigin
    }

    return { duration, video, audio }
  } catch (error) {
    if (error instanceof RemuxError) throw error
    throw toRemuxError(error)
  } finally {
    input.dispose()
  }
}
