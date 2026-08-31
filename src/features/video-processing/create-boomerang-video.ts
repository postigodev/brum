import {
  BlobSource,
  BufferTarget,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
  Quality,
  type VideoSample,
  VideoSampleSink,
  VideoSampleSource,
} from "mediabunny"

import type { ExtensionPlan } from "#/features/video-selection/extension-plan"

import { createBoomerangTimeline } from "./boomerang-timeline"
import { RemuxError, throwIfAborted, toRemuxError } from "./errors"
import { inspectMedia } from "./inspect-media"
import { assertActualOutputSize, assertInputSize } from "./limits"
import { assertPlanMatchesSource } from "./packet-schedule"
import type { BoomerangResult, RemuxOptions } from "./types"
import { verifyBoomerangOutput } from "./verify-boomerang"

async function decodeVideoFrames(file: File, signal?: AbortSignal) {
  const input = new Input({ formats: [MP4], source: new BlobSource(file) })
  const frames: VideoSample[] = []

  try {
    const videoTracks = await input.getVideoTracks()
    const videoTrack = videoTracks[0]
    if (!videoTrack) throw new RemuxError("unsupported-track-layout", "The MP4 has no video track.")

    const sink = new VideoSampleSink(videoTrack)
    for await (const frame of sink.samples()) {
      try {
        throwIfAborted(signal)
        frames.push(frame)
      } catch (error) {
        frame.close()
        throw error
      }
    }

    if (frames.length === 0) {
      throw new RemuxError("unsupported-timeline", "The video track contains no decoded frames.")
    }
    return frames
  } catch (error) {
    for (const frame of frames) frame.close()
    throw error
  } finally {
    input.dispose()
  }
}

function sourceVideoBitrate(packets: readonly { data: Uint8Array }[], sourceDuration: number) {
  const bytes = packets.reduce((total, packet) => total + packet.data.byteLength, 0)
  return Math.max(100_000, Math.round((bytes * 8) / sourceDuration))
}

export async function createBoomerangVideo(
  file: File,
  plan: ExtensionPlan,
  options: RemuxOptions = {},
): Promise<BoomerangResult> {
  const { signal } = options
  let output: Output<Mp4OutputFormat, BufferTarget> | null = null
  let retainedFrames: VideoSample[] = []

  try {
    throwIfAborted(signal)
    assertInputSize(file.size)
    const source = await inspectMedia(file, signal, { discardAudio: true })
    assertPlanMatchesSource(plan, source.video.duration)

    retainedFrames = await decodeVideoFrames(file, signal)
    const timeline = createBoomerangTimeline(
      retainedFrames,
      source.video.duration,
      plan.outputDuration,
    )

    const target = new BufferTarget()
    output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target })
    const videoSource = new VideoSampleSource({
      codec: "avc",
      quality: new Quality({
        bitrate: sourceVideoBitrate(source.video.packets, source.video.duration),
      }),
    })
    output.addVideoTrack(videoSource, { rotation: source.video.rotation })
    await output.start()

    for (const entry of timeline) {
      throwIfAborted(signal)
      const sourceFrame = retainedFrames[entry.sourceIndex]
      if (!sourceFrame) throw new Error("Boomerang timeline referenced an unknown source frame.")

      const emitted = sourceFrame.clone()
      try {
        emitted.setTimestamp(entry.timestamp)
        emitted.setDuration(entry.duration)
        await videoSource.add(emitted)
      } finally {
        emitted.close()
      }
    }

    videoSource.close()
    throwIfAborted(signal)
    await output.finalize()
    output = null
    if (!target.buffer) throw new Error("Mediabunny finalized without an output buffer.")

    const blob = new Blob([target.buffer], { type: "video/mp4" })
    assertActualOutputSize(blob.size)
    throwIfAborted(signal)
    const { output: inspectedOutput, verification } = await verifyBoomerangOutput(
      blob,
      source.video,
      plan.outputDuration,
      signal,
    )
    const { packets: _packets, decoderConfig: _decoderConfig, ...video } = inspectedOutput.video

    return {
      blob,
      duration: inspectedOutput.duration,
      byteSize: blob.size,
      video,
      verification,
    }
  } catch (error) {
    if (output && output.state !== "finalized" && output.state !== "canceled") {
      await output.cancel().catch(() => undefined)
    }
    throw toRemuxError(error)
  } finally {
    for (const frame of retainedFrames) frame.close()
  }
}
