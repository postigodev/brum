import {
  BlobSource,
  BufferTarget,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
  VideoSampleSink,
  VideoSampleSource,
} from "mediabunny"

import type { ExtensionPlan } from "#/features/video-selection/extension-plan"

import { createBoomerangTimeline } from "./boomerang-timeline"
import {
  collectDecodedVideoSamples,
  emitRetainedVideoFrame,
  type RetainedVideoFrame,
  releaseRetainedVideoFrames,
} from "./decoded-video-buffer"
import { ProcessingError, throwIfAborted, toProcessingError } from "./errors"
import { inspectMedia } from "./inspect-media"
import { assertActualOutputSize, assertEstimatedOutputSize, assertInputSize } from "./limits"
import { waitForMediaCleanup, waitForMediaOperation } from "./media-operation"
import { assertPlanMatchesSource } from "./processing-validation"
import type { BoomerangResult, ProcessingOptions } from "./types"
import { verifyBoomerangOutput } from "./verify-boomerang"
import {
  type AvcEncodingConfig,
  assertAvcEncoderAvailable,
  assertVideoDecoderAvailable,
  createAvcEncodingConfig,
} from "./video-capabilities"

async function decodeVideoFrames(
  file: File,
  encodingConfig: AvcEncodingConfig,
  codedWidth: number,
  codedHeight: number,
  signal?: AbortSignal,
) {
  const input = new Input({ formats: [MP4], source: new BlobSource(file) })

  try {
    throwIfAborted(signal)
    const videoTracks = await input.getVideoTracks()
    const videoTrack = videoTracks[0]
    if (!videoTrack) {
      throw new ProcessingError("unsupported-track-layout", "The MP4 has no video track.")
    }

    await assertVideoDecoderAvailable(videoTrack)
    await assertAvcEncoderAvailable(encodingConfig, codedWidth, codedHeight)
    throwIfAborted(signal)
    const sink = new VideoSampleSink(videoTrack)
    const frames = await collectDecodedVideoSamples(sink.samples(), {
      signal,
      onInterrupt: () => input.dispose(),
    })

    if (frames.length === 0) {
      throw new ProcessingError(
        "unsupported-timeline",
        "The video track contains no decoded frames.",
      )
    }
    return frames
  } finally {
    input.dispose()
  }
}

function sourceVideoBitrate(encodedByteLength: number, sourceDuration: number) {
  return Math.max(100_000, Math.round((encodedByteLength * 8) / sourceDuration))
}

export async function createBoomerangVideo(
  file: File,
  plan: ExtensionPlan,
  options: ProcessingOptions = {},
): Promise<BoomerangResult> {
  const { signal } = options
  let output: Output<Mp4OutputFormat, BufferTarget> | null = null
  let outputCancellation: Promise<void> | null = null
  let retainedFrames: RetainedVideoFrame[] = []

  function cancelActiveOutput() {
    if (!output) return outputCancellation
    if (output.state === "finalized") return outputCancellation
    if (!outputCancellation) {
      outputCancellation = output.cancel().catch(() => undefined)
    }
    return outputCancellation
  }

  function interruptActiveOutput() {
    void cancelActiveOutput()
  }

  try {
    throwIfAborted(signal)
    assertInputSize(file.size)
    const source = await inspectMedia(file, signal)
    assertPlanMatchesSource(plan, source.video.duration)

    const encodingBitrate = sourceVideoBitrate(
      source.video.encodedByteLength,
      source.video.duration,
    )
    assertEstimatedOutputSize(encodingBitrate, plan.outputDuration)
    const encodingConfig = createAvcEncodingConfig(encodingBitrate)
    retainedFrames = await decodeVideoFrames(
      file,
      encodingConfig,
      source.video.codedWidth,
      source.video.codedHeight,
      signal,
    )
    const timeline = createBoomerangTimeline(
      retainedFrames,
      source.video.duration,
      plan.outputDuration,
    )

    const target = new BufferTarget()
    output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target })
    const videoSource = new VideoSampleSource(encodingConfig)
    output.addVideoTrack(videoSource, { rotation: source.video.rotation })
    await waitForMediaOperation(output.start(), {
      signal,
      onInterrupt: interruptActiveOutput,
    })

    for (const entry of timeline) {
      throwIfAborted(signal)
      const sourceFrame = retainedFrames[entry.sourceIndex]
      if (!sourceFrame) throw new Error("Boomerang timeline referenced an unknown source frame.")

      await emitRetainedVideoFrame(
        sourceFrame,
        entry.timestamp,
        entry.duration,
        (emitted) => videoSource.add(emitted),
        { signal, onInterrupt: interruptActiveOutput },
      )
    }

    videoSource.close()
    throwIfAborted(signal)
    await waitForMediaOperation(output.finalize(), {
      signal,
      onInterrupt: interruptActiveOutput,
    })
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
    const { encodedByteLength: _encodedByteLength, ...video } = inspectedOutput.video

    return {
      blob,
      duration: inspectedOutput.duration,
      byteSize: blob.size,
      video,
      verification,
    }
  } catch (error) {
    const cancellation = cancelActiveOutput()
    if (cancellation) await waitForMediaCleanup(cancellation)
    throw toProcessingError(error)
  } finally {
    releaseRetainedVideoFrames(retainedFrames)
  }
}
