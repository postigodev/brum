import {
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
} from "mediabunny"

import { createExtensionPlan, type ExtensionPlan } from "#/features/video-selection/extension-plan"

import { RemuxError, throwIfAborted, toRemuxError } from "./errors"
import { inspectMedia } from "./inspect-media"
import { assertActualOutputSize, assertEstimatedOutputSize, assertInputSize } from "./limits"
import {
  assertPlanMatchesSource,
  legacyForwardRepetitionCount,
  scheduleTrackPackets,
} from "./packet-schedule"
import { type PreparedReencodedAudio, prepareReencodedAudio } from "./reencode-audio"
import type { AudioMode, PacketLedgerEntry, PacketRecord, RemuxOptions, RemuxResult } from "./types"
import { verifyDecodedAudio, verifyRemux } from "./verify-remux"

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
  let preparedAudio: PreparedReencodedAudio | null = null

  try {
    throwIfAborted(signal)
    assertInputSize(file.size)
    const source = await inspectMedia(file, signal)
    assertPlanMatchesSource(plan, source.duration)
    const reconciledPlanResult = createExtensionPlan(source.duration, plan.target)
    if (!reconciledPlanResult.ok) {
      throw new RemuxError(
        "plan-duration-mismatch",
        "The inspected video duration cannot use the selected target.",
      )
    }
    const reconciledPlan = reconciledPlanResult.plan
    assertEstimatedOutputSize(file.size, legacyForwardRepetitionCount(reconciledPlan))
    if (source.audio?.timeline.kind === "unsupported") {
      throw new RemuxError("unsupported-audio-timeline", source.audio.timeline.reason)
    }
    const audioMode: AudioMode = source.audio?.timeline.kind ?? "none"
    const videoLedger = scheduleTrackPackets(
      "video",
      source.video.packets,
      reconciledPlan,
      signal,
      source.video.duration,
    )
    const audioLedger =
      source.audio && audioMode === "packet-copy"
        ? scheduleTrackPackets("audio", source.audio.packets, reconciledPlan, signal)
        : null

    if (source.audio && audioMode === "reencode") {
      preparedAudio = await prepareReencodedAudio(file, source.audio, reconciledPlan, signal)
    }

    const target = new BufferTarget()
    output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target })
    const videoSource = new EncodedVideoPacketSource("avc")
    const copiedAudioSource = source.audio ? new EncodedAudioPacketSource("aac") : null
    output.addVideoTrack(videoSource, {
      decoderConfig: source.video.decoderConfig,
      rotation: source.video.rotation,
    })
    if (copiedAudioSource && source.audio) {
      output.addAudioTrack(
        copiedAudioSource,
        audioMode === "packet-copy" ? { decoderConfig: source.audio.decoderConfig } : undefined,
      )
    }
    await output.start()

    let videoIndex = 0
    let audioIndex = 0
    let reencodedAudioIndex = 0
    while (
      videoIndex < videoLedger.length ||
      (audioLedger && audioIndex < audioLedger.length) ||
      (preparedAudio && reencodedAudioIndex < preparedAudio.packets.length)
    ) {
      throwIfAborted(signal)
      const videoEntry = videoLedger[videoIndex]
      const audioEntry = audioLedger?.[audioIndex]
      const reencodedEntry = preparedAudio?.packets[reencodedAudioIndex]
      const reencodedTimestamp = reencodedEntry?.packet.timestamp ?? Number.POSITIVE_INFINITY
      const nextAudioTimestamp = Math.min(
        audioEntry?.timestamp ?? Number.POSITIVE_INFINITY,
        reencodedTimestamp,
      )
      if (videoEntry && videoEntry.timestamp <= nextAudioTimestamp) {
        await videoSource.add(
          packetFromEntry(videoEntry, source.video.packets, videoIndex),
          videoIndex === 0 ? { decoderConfig: source.video.decoderConfig } : undefined,
        )
        videoIndex += 1
      } else if (audioEntry && copiedAudioSource && source.audio) {
        await copiedAudioSource.add(
          packetFromEntry(audioEntry, source.audio.packets, audioIndex),
          audioIndex === 0 ? { decoderConfig: source.audio.decoderConfig } : undefined,
        )
        audioIndex += 1
      } else if (reencodedEntry && copiedAudioSource) {
        await copiedAudioSource.add(reencodedEntry.packet, reencodedEntry.metadata)
        reencodedAudioIndex += 1
      }
    }

    videoSource.close()
    copiedAudioSource?.close()

    throwIfAborted(signal)
    await output.finalize()
    output = null
    if (!target.buffer) throw new Error("Mediabunny finalized without an output buffer.")

    const blob = new Blob([target.buffer], { type: "video/mp4" })
    assertActualOutputSize(blob.size)
    throwIfAborted(signal)
    const inspectedOutput = await inspectMedia(blob, signal)
    if (audioMode === "reencode") {
      await verifyDecodedAudio(blob, reconciledPlan.outputDuration, signal)
    }
    const verification = verifyRemux(
      source,
      inspectedOutput,
      videoLedger,
      audioLedger,
      reconciledPlan.outputDuration,
      audioMode,
      preparedAudio?.sampleRate,
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
      audioMode,
      audioBitrate: preparedAudio?.bitrate ?? null,
      verification,
    }
  } catch (error) {
    if (output && output.state !== "finalized" && output.state !== "canceled") {
      await output.cancel().catch(() => undefined)
    }
    throw toRemuxError(error)
  }
}
