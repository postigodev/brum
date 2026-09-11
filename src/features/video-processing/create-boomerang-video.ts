import {
  BlobSource,
  BufferTarget,
  Input,
  Mp4OutputFormat,
  Output,
  VideoSampleSink,
  VideoSampleSource,
} from "mediabunny"

import type { ExtensionPlan } from "#/features/video-selection/extension-plan"

import { createBoomerangTimeline } from "./boomerang-timeline"
import { emitRetainedVideoFrame } from "./decoded-video-buffer"
import { collectVideoMetadata, emitVideoRanges } from "./decoded-video-ranges"
import { ProcessingError, throwIfAborted } from "./errors"
import { inspectMedia, SOURCE_INPUT_FORMATS } from "./inspect-media"
import { assertActualOutputSize, assertEstimatedOutputSize, assertInputSize } from "./limits"
import { waitForMediaCleanup, waitForMediaOperation } from "./media-operation"
import { ProcessingDiagnostics } from "./processing-diagnostics"
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
  const diagnostics = new ProcessingDiagnostics(options.onProgress)
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
    diagnostics.enter("source-inspection")
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
    input = new Input({ formats: SOURCE_INPUT_FORMATS, source: new BlobSource(file) })
    const [videoTrack] = await waitForMediaOperation(input.getVideoTracks(), {
      signal,
      onInterrupt: interruptActiveOutput,
    })
    if (!videoTrack)
      throw new ProcessingError("unsupported-track-layout", "The source has no video track.")
    diagnostics.enter("decoder-capability-check")
    await waitForMediaOperation(assertVideoDecoderAvailable(videoTrack), {
      signal,
      onInterrupt: interruptActiveOutput,
    })
    diagnostics.enter("encoder-capability-check")
    await waitForMediaOperation(
      assertAvcEncoderAvailable(encodingConfig, source.video.codedWidth, source.video.codedHeight),
      { signal, onInterrupt: interruptActiveOutput },
    )
    throwIfAborted(signal)
    diagnostics.enter("metadata-scan")
    const sink = new VideoSampleSink(videoTrack)
    const metadata = await collectVideoMetadata(sink.samples(), {
      signal,
      onInterrupt: interruptActiveOutput,
      diagnostics,
    })
    diagnostics.enter("timeline-planning")
    const timeline = createBoomerangTimeline(
      metadata.frames,
      source.video.duration,
      plan.outputDuration,
      plan.speedMultiplier,
    )

    diagnostics.setTotals(metadata.frames.length, timeline.length)
    diagnostics.enter("output-start")
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
          {
            signal,
            onInterrupt: interruptActiveOutput,
            diagnostics,
            context: diagnostics.snapshot(),
          },
        ),
      { signal, onInterrupt: interruptActiveOutput, diagnostics },
    )
    input.dispose()
    input = null

    diagnostics.enter("output-finalization")
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
    diagnostics.enter("output-verification")
    const { output: inspectedOutput, verification } = await verifyBoomerangOutput(
      blob,
      source.video,
      plan.outputDuration,
      signal,
    )
    const { encodedByteLength: _encodedByteLength, ...video } = inspectedOutput.video

    diagnostics.enter("complete")
    return {
      blob,
      duration: inspectedOutput.duration,
      byteSize: blob.size,
      video,
      verification,
    }
  } catch (error) {
    const failure = diagnostics.failure(error)
    const cancellation = cancelActiveOutput()
    if (cancellation) await waitForMediaCleanup(cancellation)
    throw failure
  } finally {
    diagnostics.dispose()
    input?.dispose()
  }
}
