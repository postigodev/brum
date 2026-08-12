import {
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
} from "mediabunny"

import type { ExtensionPlan } from "#/features/video-selection/extension-plan"

import { throwIfAborted, toRemuxError } from "./errors"
import { inspectMedia } from "./inspect-media"
import { assertActualOutputSize, assertEstimatedOutputSize, assertInputSize } from "./limits"
import { assertPlanMatchesSource, scheduleTrackPackets } from "./packet-schedule"
import type { PacketLedgerEntry, PacketRecord, RemuxOptions, RemuxResult } from "./types"
import { verifyRemux } from "./verify-remux"

function packetFromEntry(
  entry: PacketLedgerEntry,
  sourcePackets: readonly PacketRecord[],
  sequence: number,
) {
  const source = sourcePackets[entry.sourceIndex]
  if (!source) throw new Error("Packet ledger referenced an unknown source packet.")
  return new EncodedPacket(source.data, entry.type, entry.timestamp, entry.duration, sequence)
}

export async function remuxVideo(
  file: File,
  plan: ExtensionPlan,
  options: RemuxOptions = {},
): Promise<RemuxResult> {
  const { signal } = options
  let output: Output<Mp4OutputFormat, BufferTarget> | null = null

  try {
    throwIfAborted(signal)
    assertInputSize(file.size)
    assertEstimatedOutputSize(file.size, plan.totalPlays)

    const source = await inspectMedia(file, signal)
    assertPlanMatchesSource(plan, source.duration)
    const videoLedger = scheduleTrackPackets("video", source.video.packets, plan, signal)
    const audioLedger = source.audio
      ? scheduleTrackPackets("audio", source.audio.packets, plan, signal)
      : null

    const target = new BufferTarget()
    output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target })
    const videoSource = new EncodedVideoPacketSource("avc")
    const audioSource = source.audio ? new EncodedAudioPacketSource("aac") : null
    output.addVideoTrack(videoSource, {
      decoderConfig: source.video.decoderConfig,
      rotation: source.video.rotation,
    })
    if (audioSource && source.audio) {
      output.addAudioTrack(audioSource, { decoderConfig: source.audio.decoderConfig })
    }
    await output.start()

    let videoIndex = 0
    let audioIndex = 0
    while (videoIndex < videoLedger.length || (audioLedger && audioIndex < audioLedger.length)) {
      throwIfAborted(signal)
      const videoEntry = videoLedger[videoIndex]
      const audioEntry = audioLedger?.[audioIndex]
      if (videoEntry && (!audioEntry || videoEntry.timestamp <= audioEntry.timestamp)) {
        await videoSource.add(
          packetFromEntry(videoEntry, source.video.packets, videoIndex),
          videoIndex === 0 ? { decoderConfig: source.video.decoderConfig } : undefined,
        )
        videoIndex += 1
      } else if (audioEntry && audioSource && source.audio) {
        await audioSource.add(
          packetFromEntry(audioEntry, source.audio.packets, audioIndex),
          audioIndex === 0 ? { decoderConfig: source.audio.decoderConfig } : undefined,
        )
        audioIndex += 1
      }
    }

    throwIfAborted(signal)
    await output.finalize()
    output = null
    if (!target.buffer) throw new Error("Mediabunny finalized without an output buffer.")

    const blob = new Blob([target.buffer], { type: "video/mp4" })
    assertActualOutputSize(blob.size)
    throwIfAborted(signal)
    const inspectedOutput = await inspectMedia(blob, signal)
    const verification = verifyRemux(
      source,
      inspectedOutput,
      videoLedger,
      audioLedger,
      plan.outputDuration,
    )

    const { packets: _videoPackets, decoderConfig: _videoConfig, ...video } = inspectedOutput.video
    const audio = inspectedOutput.audio
      ? (({ packets: _packets, decoderConfig: _config, ...summary }) => summary)(
          inspectedOutput.audio,
        )
      : null
    return {
      blob,
      duration: inspectedOutput.duration,
      byteSize: blob.size,
      video,
      audio,
      verification,
    }
  } catch (error) {
    if (output && output.state !== "finalized" && output.state !== "canceled") {
      await output.cancel().catch(() => undefined)
    }
    throw toRemuxError(error)
  }
}
