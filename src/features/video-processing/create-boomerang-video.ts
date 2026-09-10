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
import { emitRetainedVideoFrame } from "./decoded-video-buffer"
import { collectVideoMetadata, emitVideoRanges } from "./decoded-video-ranges"
import { ProcessingError, throwIfAborted, toProcessingError } from "./errors"
import { inspectMedia } from "./inspect-media"
import { assertActualOutputSize, assertEstimatedOutputSize, assertInputSize } from "./limits"
import { waitForMediaCleanup, waitForMediaOperation } from "./media-operation"
import { assertPlanMatchesSource } from "./processing-validation"
import type { BoomerangResult, ProcessingOptions } from "./types"
import { verifyBoomerangOutput } from "./verify-boomerang"
import {
  assertAvcEncoderAvailable,
  assertVideoDecoderAvailable,
  createAvcEncodingConfig,
} from "./video-capabilities"

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
  let input: Input | null = null

  function cancelActiveOutput() {
    if (!output) return outputCancellation
    if (output.state === "finalized") return outputCancellation
    if (!outputCancellation) {
      outputCancellation = output.cancel().catch(() => undefined)
    }
    return outputCancellation
  }

  function interruptActiveOutput() {
    input?.dispose()
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
    input = new Input({ formats: [MP4], source: new BlobSource(file) })
    const [videoTrack] = await waitForMediaOperation(input.getVideoTracks(), {
      signal,
      onInterrupt: interruptActiveOutput,
    })
    if (!videoTrack)
      throw new ProcessingError("unsupported-track-layout", "The MP4 has no video track.")
    await waitForMediaOperation(assertVideoDecoderAvailable(videoTrack), {
      signal,
      onInterrupt: interruptActiveOutput,
    })
    await waitForMediaOperation(
      assertAvcEncoderAvailable(encodingConfig, source.video.codedWidth, source.video.codedHeight),
      { signal, onInterrupt: interruptActiveOutput },
    )
    throwIfAborted(signal)
    const sink = new VideoSampleSink(videoTrack)
    const metadata = await collectVideoMetadata(sink.samples(), {
      signal,
      onInterrupt: interruptActiveOutput,
    })
    const timeline = createBoomerangTimeline(
      metadata.frames,
      source.video.duration,
      plan.outputDuration,
      plan.speedMultiplier,
    )

    const target = new BufferTarget()
    output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target })
    const videoSource = new VideoSampleSource(encodingConfig)
    output.addVideoTrack(videoSource, { rotation: source.video.rotation })
    await waitForMediaOperation(output.start(), {
      signal,
      onInterrupt: interruptActiveOutput,
    })

    await emitVideoRanges(
      sink,
      metadata,
      timeline,
      (frame, entry) =>
        emitRetainedVideoFrame(
          frame,
          entry.timestamp,
          entry.duration,
          (emitted) => videoSource.add(emitted),
          { signal, onInterrupt: interruptActiveOutput },
        ),
      { signal, onInterrupt: interruptActiveOutput },
    )
    input.dispose()
    input = null

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
    input?.dispose()
  }
}
