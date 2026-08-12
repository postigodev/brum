import { AudioSampleSink, BlobSource, Input, MP4 } from "mediabunny"

import { RemuxError, throwIfAborted } from "./errors"
import { TIMELINE_TOLERANCE_SECONDS } from "./packet-schedule"
import type {
  AudioMode,
  AudioTrackSummary,
  MediaInspection,
  PacketLedgerEntry,
  PacketRecord,
  RemuxVerification,
  VideoTrackSummary,
} from "./types"

const AAC_FRAME_SIZE = 1024

function equalBytes(
  left: AllowSharedBufferSource | undefined,
  right: AllowSharedBufferSource | undefined,
) {
  if (left === undefined || right === undefined) return left === right
  const leftBytes = ArrayBuffer.isView(left)
    ? new Uint8Array(left.buffer, left.byteOffset, left.byteLength)
    : new Uint8Array(left)
  const rightBytes = ArrayBuffer.isView(right)
    ? new Uint8Array(right.buffer, right.byteOffset, right.byteLength)
    : new Uint8Array(right)
  return (
    leftBytes.length === rightBytes.length &&
    leftBytes.every((byte, index) => byte === rightBytes[index])
  )
}

function equalDecoderConfig(
  left: VideoDecoderConfig | AudioDecoderConfig,
  right: VideoDecoderConfig | AudioDecoderConfig,
) {
  const { description: leftDescription, ...leftRest } = left
  const { description: rightDescription, ...rightRest } = right
  return (
    JSON.stringify(leftRest) === JSON.stringify(rightRest) &&
    equalBytes(leftDescription, rightDescription)
  )
}

function assertPacketLedger(
  packets: readonly PacketRecord[],
  ledger: readonly PacketLedgerEntry[],
) {
  if (packets.length !== ledger.length) return false
  return packets.every((packet, index) => {
    const expected = ledger[index]
    return (
      expected !== undefined &&
      packet.hash === expected.hash &&
      packet.type === expected.type &&
      Math.abs(packet.timestamp - expected.timestamp) <= TIMELINE_TOLERANCE_SECONDS &&
      Math.abs(packet.duration - expected.duration) <= TIMELINE_TOLERANCE_SECONDS
    )
  })
}

function equalVideo(source: VideoTrackSummary, output: VideoTrackSummary) {
  return (
    source.codecString === output.codecString &&
    source.codedWidth === output.codedWidth &&
    source.codedHeight === output.codedHeight &&
    source.displayWidth === output.displayWidth &&
    source.displayHeight === output.displayHeight &&
    source.rotation === output.rotation &&
    JSON.stringify(source.pixelAspectRatio) === JSON.stringify(output.pixelAspectRatio) &&
    JSON.stringify(source.colorSpace) === JSON.stringify(output.colorSpace) &&
    equalDecoderConfig(source.decoderConfig, output.decoderConfig)
  )
}

function equalAudio(
  source: AudioTrackSummary | null,
  output: AudioTrackSummary | null,
  audioMode: AudioMode,
) {
  if (!source || !output) return source === output
  const propertiesMatch =
    source.codecString === output.codecString &&
    source.sampleRate === output.sampleRate &&
    source.numberOfChannels === output.numberOfChannels
  return (
    propertiesMatch &&
    (audioMode === "reencode" || equalDecoderConfig(source.decoderConfig, output.decoderConfig))
  )
}

export async function verifyDecodedAudio(blob: Blob, targetDuration: number, signal?: AbortSignal) {
  const input = new Input({ formats: [MP4], source: new BlobSource(blob) })

  try {
    const tracks = await input.getAudioTracks()
    const track = tracks[0]
    if (!track || tracks.length !== 1) {
      throw new RemuxError("verification-failed", "The output AAC track is missing.")
    }

    const sampleRate = await track.getSampleRate()
    const expectedFrames = Math.round(targetDuration * sampleRate)
    let frameCursor: number | null = null
    const sink = new AudioSampleSink(track)

    for await (const sample of sink.samples()) {
      try {
        throwIfAborted(signal)
        const startFrame = Math.round(sample.timestamp * sampleRate)
        if (frameCursor === null) {
          if (startFrame > 1 || startFrame < -AAC_FRAME_SIZE - 1) {
            throw new RemuxError(
              "verification-failed",
              "The re-encoded AAC starts outside its priming allowance.",
            )
          }
        } else if (Math.abs(startFrame - frameCursor) > 1) {
          throw new RemuxError(
            "verification-failed",
            "The re-encoded AAC timeline is discontinuous.",
          )
        }
        frameCursor = startFrame + sample.numberOfFrames
      } finally {
        sample.close()
      }
    }

    if (
      frameCursor === null ||
      frameCursor < expectedFrames - 1 ||
      frameCursor > expectedFrames + AAC_FRAME_SIZE
    ) {
      throw new RemuxError(
        "verification-failed",
        "The decoded AAC does not cover the requested duration within one codec frame.",
      )
    }
  } finally {
    input.dispose()
  }
}

export function verifyRemux(
  source: MediaInspection,
  output: MediaInspection,
  videoLedger: readonly PacketLedgerEntry[],
  audioLedger: readonly PacketLedgerEntry[] | null,
  targetDuration: number,
  audioMode: AudioMode = source.audio ? "packet-copy" : "none",
): RemuxVerification {
  const duration =
    Math.abs(output.duration - targetDuration) <= TIMELINE_TOLERANCE_SECONDS &&
    Math.abs(output.video.duration - targetDuration) <= TIMELINE_TOLERANCE_SECONDS &&
    (output.audio === null ||
      Math.abs(output.audio.duration - targetDuration) <= TIMELINE_TOLERANCE_SECONDS)
  const codecs =
    source.video.codec === output.video.codec && source.audio?.codec === output.audio?.codec
  const videoGeometry = equalVideo(source.video, output.video)
  const audioProperties = equalAudio(source.audio, output.audio, audioMode)
  const packetLedger =
    assertPacketLedger(output.video.packets, videoLedger) &&
    (audioMode === "none"
      ? output.audio === null
      : audioMode === "reencode"
        ? output.audio?.timeline.kind !== "unsupported"
        : output.audio !== null &&
          audioLedger !== null &&
          assertPacketLedger(output.audio.packets, audioLedger))

  if (!duration || !codecs || !videoGeometry || !audioProperties || !packetLedger) {
    throw new RemuxError("verification-failed", "The remuxed MP4 did not preserve its contract.")
  }

  return {
    duration: true,
    codecs: true,
    videoGeometry: true,
    audioProperties: true,
    packetLedger: true,
  }
}
