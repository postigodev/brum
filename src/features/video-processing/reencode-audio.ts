import {
  type AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  type EncodedPacket,
  Input,
  type InputAudioTrack,
  MP4,
  Mp4OutputFormat,
  NullTarget,
  Output,
} from "mediabunny"

import type { ExtensionPlan } from "#/features/video-selection/extension-plan"

import { assertAacDecoder, ensureAacEncoder } from "./audio-capabilities"
import { createPcmCyclePlan } from "./audio-timeline"
import { RemuxError, throwIfAborted } from "./errors"
import type { AudioTrackSummary } from "./types"

export const MAX_DECODED_CYCLE_BYTES = 134_217_728

export type ReencodedPacket = {
  packet: EncodedPacket
  metadata: EncodedAudioChunkMetadata | undefined
}

export type PreparedReencodedAudio = {
  packets: ReencodedPacket[]
  bitrate: number
  sampleRate: number
}

function chooseBitrate(audio: AudioTrackSummary, sourceDuration: number) {
  const packetBytes = audio.packets.reduce((total, packet) => total + packet.data.byteLength, 0)
  const measured = Math.round((packetBytes * 8) / sourceDuration)
  return Math.max(32_000, Math.min(320_000, measured))
}

export function fitEncodedPacketsToDuration(
  packets: readonly ReencodedPacket[],
  outputDuration: number,
) {
  const fitted: ReencodedPacket[] = []

  for (const entry of packets) {
    if (entry.packet.timestamp >= outputDuration) break
    const duration = Math.min(entry.packet.duration, outputDuration - entry.packet.timestamp)
    if (duration <= 0) continue
    fitted.push({
      packet: duration === entry.packet.duration ? entry.packet : entry.packet.clone({ duration }),
      metadata: entry.metadata,
    })
  }

  const last = fitted.at(-1)?.packet
  if (!last || Math.abs(last.timestamp + last.duration - outputDuration) > 1e-6) {
    throw new RemuxError(
      "audio-reencode-failed",
      "The AAC encoder did not cover the requested output duration.",
    )
  }
  return fitted
}

export async function prepareReencodedAudio(
  file: File,
  audio: AudioTrackSummary,
  plan: ExtensionPlan,
  signal?: AbortSignal,
): Promise<PreparedReencodedAudio> {
  throwIfAborted(signal)
  await assertAacDecoder(audio.decoderConfig)

  const input = new Input({ formats: [MP4], source: new BlobSource(file) })
  const decodedSamples: AudioSample[] = []

  try {
    const audioTracks = await input.getAudioTracks()
    if (audioTracks.length !== 1) {
      throw new RemuxError("unsupported-track-layout", "The AAC fallback requires one audio track.")
    }

    const sink = new AudioSampleSink(audioTracks[0] as InputAudioTrack)
    let decodedBytes = 0
    for await (const sample of sink.samples()) {
      throwIfAborted(signal)
      decodedBytes += sample.numberOfFrames * sample.numberOfChannels * 4
      if (decodedBytes > MAX_DECODED_CYCLE_BYTES) {
        sample.close()
        throw new RemuxError(
          "output-too-large",
          "The decoded audio cycle exceeds the 128 MiB fallback limit.",
        )
      }
      decodedSamples.push(sample)
    }
  } finally {
    input.dispose()
  }

  try {
    const decodedSampleRate = decodedSamples[0]?.sampleRate
    if (
      !decodedSampleRate ||
      decodedSamples.some((sample) => sample.sampleRate !== decodedSampleRate)
    ) {
      throw new RemuxError(
        "unsupported-audio-timeline",
        "The decoded AAC samples do not share one sample rate.",
      )
    }
    const cyclePlan = createPcmCyclePlan(
      decodedSamples.map((sample) => ({
        timestamp: sample.timestamp,
        numberOfFrames: sample.numberOfFrames,
      })),
      plan.sourceDuration,
      plan.outputDuration,
      decodedSampleRate,
      audio.timeline.kind === "reencode" &&
        audio.timeline.firstTimestamp !== null &&
        audio.timeline.endTimestamp !== null &&
        audio.timeline.endTimestamp < plan.sourceDuration - 0.001 &&
        Math.abs(
          audio.timeline.endTimestamp - audio.timeline.firstTimestamp - plan.sourceDuration,
        ) <= 0.001
        ? audio.timeline.firstTimestamp
        : 0,
    )
    if (!cyclePlan) {
      throw new RemuxError(
        "unsupported-audio-timeline",
        "The decoded AAC samples do not form one continuous source cycle.",
      )
    }

    const bitrate = chooseBitrate(audio, plan.sourceDuration)
    await ensureAacEncoder(decodedSampleRate, audio.numberOfChannels, bitrate)

    const encodedPackets: ReencodedPacket[] = []
    const source = new AudioSampleSource({
      codec: "aac",
      bitrate,
      onEncodedPacket: (packet, metadata) => {
        encodedPackets.push({ packet, metadata })
      },
    })
    const encodingOutput = new Output({
      format: new Mp4OutputFormat(),
      target: new NullTarget(),
    })
    encodingOutput.addAudioTrack(source)
    try {
      await encodingOutput.start()

      let outputCursor = 0
      while (outputCursor < cyclePlan.outputFrameCount) {
        for (const slice of cyclePlan.slices) {
          throwIfAborted(signal)
          const base = decodedSamples[slice.sampleIndex]
          if (!base) throw new Error("PCM cycle references a missing decoded sample.")
          const available = slice.endFrame - slice.startFrame
          const frameCount = Math.min(available, cyclePlan.outputFrameCount - outputCursor)
          if (frameCount <= 0) break

          const sample = base.trim(slice.startFrame, slice.startFrame + frameCount)
          sample.setTimestamp(outputCursor / decodedSampleRate)
          outputCursor += frameCount
          try {
            await source.add(sample)
          } finally {
            sample.close()
          }
        }
      }

      source.close()
      await encodingOutput.finalize()
    } catch (error) {
      source.close()
      if (encodingOutput.state !== "finalized" && encodingOutput.state !== "canceled") {
        await encodingOutput.cancel().catch(() => undefined)
      }
      throw error
    }

    return {
      packets: fitEncodedPacketsToDuration(encodedPackets, plan.outputDuration),
      bitrate,
      sampleRate: decodedSampleRate,
    }
  } catch (error) {
    if (error instanceof RemuxError) throw error
    throw new RemuxError("audio-reencode-failed", "AAC audio re-encoding failed.", {
      cause: error,
    })
  } finally {
    for (const sample of decodedSamples) sample.close()
  }
}
