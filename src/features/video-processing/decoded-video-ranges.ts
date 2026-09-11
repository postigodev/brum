import type { BoomerangTimelineEntry, VideoFrameTiming } from "./boomerang-timeline"
import {
  type CollectionOptions,
  collectDecodedVideoRange,
  type DecodedVideoSample,
  decodedVideoSampleBytes,
  detachDecodedVideoSample,
  isRetainedVideoFrameWithinBudget,
  MAX_RETAINED_DECODED_VIDEO_BYTES,
  MAX_RETAINED_DECODED_VIDEO_FRAMES,
  type RetainedVideoFrame,
  readDecodedVideoSamples,
  releaseRetainedVideoFrame,
  releaseRetainedVideoFrames,
} from "./decoded-video-buffer"
import { ProcessingError, throwIfAborted } from "./errors"
import { waitForMediaCleanup } from "./media-operation"

type FrameMetadata = VideoFrameTiming & { rangeIndex: number }
type VideoRange = { start: number; end: number }
type VideoMetadata = { frames: FrameMetadata[]; ranges: VideoRange[] }

// Scan actual decoded presentation timings, not packet order (which may contain B-frames).
// No pixel copy survives this pass; allocationSize only measures the future owned copy.
export async function collectVideoMetadata(
  samples: AsyncIterable<DecodedVideoSample>,
  options: CollectionOptions = {},
): Promise<VideoMetadata> {
  const frames: FrameMetadata[] = []
  const ranges: VideoRange[] = []
  let rangeBytes = 0
  const maxBytes = options.maxBytes ?? MAX_RETAINED_DECODED_VIDEO_BYTES

  for await (const sample of readDecodedVideoSamples(samples, {
    ...options,
    decodeStage: "metadata-scan",
  })) {
    try {
      throwIfAborted(options.signal)
      const bytes = decodedVideoSampleBytes(sample, maxBytes)
      let range = ranges.at(-1)
      if (
        !range ||
        range.end - range.start >= MAX_RETAINED_DECODED_VIDEO_FRAMES ||
        rangeBytes + bytes > maxBytes
      ) {
        range = { start: frames.length, end: frames.length }
        ranges.push(range)
        rangeBytes = 0
      }
      frames.push({
        timestamp: sample.timestamp,
        duration: sample.duration,
        rangeIndex: ranges.length - 1,
      })
      range.end++
      rangeBytes += bytes
      options.diagnostics?.advance("metadataFrames")
    } finally {
      sample.close()
    }
  }
  if (frames.length === 0) {
    throw new ProcessingError("unsupported-timeline", "The video track contains no decoded frames.")
  }
  return { frames, ranges }
}

// Forward owns one detached frame; reverse owns one range. They never coexist.
// Mediabunny seeks to the preceding keyframe and discards preroll before the requested range.
export async function emitVideoRanges(
  sink: { samples: (start?: number, end?: number) => AsyncIterable<DecodedVideoSample> },
  metadata: VideoMetadata,
  timeline: readonly BoomerangTimelineEntry[],
  emit: (frame: RetainedVideoFrame, entry: BoomerangTimelineEntry) => Promise<void>,
  options: CollectionOptions = {},
) {
  const maxBytes = options.maxBytes ?? MAX_RETAINED_DECODED_VIDEO_BYTES
  if (!isRetainedVideoFrameWithinBudget(0, maxBytes) || maxBytes === 0) {
    throw new ProcessingError(
      "decoded-video-memory-exceeded",
      "The decoded working set exceeds the safe local memory budget.",
    )
  }
  let activeRange: VideoRange | undefined
  let retained: RetainedVideoFrame[] = []
  let forward: AsyncGenerator<DecodedVideoSample, void, unknown> | undefined
  let nextForwardIndex = -1
  const forwardOptions: CollectionOptions = { ...options, decodeStage: "forward-stream-decode" }
  const closeForward = async () => {
    const iterator = forward
    forward = undefined
    if (iterator) await waitForMediaCleanup(iterator.return(undefined))
  }
  try {
    for (const [outputFrameIndex, entry] of timeline.entries()) {
      throwIfAborted(options.signal)
      const frameMetadata = metadata.frames[entry.sourceIndex]
      const range = frameMetadata && metadata.ranges[frameMetadata.rangeIndex]
      if (!range) throw new Error("Boomerang timeline referenced an unknown source frame.")
      const context = {
        rangeIndex: frameMetadata.rangeIndex,
        sourceFrameIndex: entry.sourceIndex,
        outputFrameIndex,
        direction: entry.direction,
      }
      if (entry.direction === "forward") {
        releaseRetainedVideoFrames(retained)
        activeRange = undefined
        forwardOptions.context = context
        options.diagnostics?.enter("forward-stream-decode", context)
        if (!forward || entry.sourceIndex !== nextForwardIndex) {
          await closeForward()
          options.diagnostics?.startDecode("forward")
          forward = readDecodedVideoSamples(sink.samples(frameMetadata.timestamp), forwardOptions)
        }
        const next = await forward.next()
        nextForwardIndex = entry.sourceIndex + 1
        options.diagnostics?.enter("range-validation", context)
        if (next.done || next.value.timestamp !== frameMetadata.timestamp) {
          if (!next.done) next.value.close()
          throw new ProcessingError(
            "unsupported-timeline",
            "Decoded stream does not match the source presentation timeline.",
          )
        }
        const frame = await detachDecodedVideoSample(next.value, { ...options, context })
        try {
          options.diagnostics?.enter("encoding-sample-creation", context)
          await emit(frame, entry)
          options.diagnostics?.advance("encodedFrames")
        } finally {
          releaseRetainedVideoFrame(frame)
        }
        continue
      }
      await closeForward()
      if (range !== activeRange) {
        releaseRetainedVideoFrames(retained)
        const first = metadata.frames[range.start]
        if (!first) throw new Error("Video range has no starting frame.")
        options.diagnostics?.enter("range-decode-seek", {
          ...context,
          sourceFrameIndex: range.start,
        })
        options.diagnostics?.startDecode(entry.direction)
        retained = await collectDecodedVideoRange(
          sink.samples(first.timestamp, metadata.frames[range.end]?.timestamp),
          {
            ...options,
            decodeStage: "range-decode-seek",
            context: { ...context, sourceFrameIndex: range.start },
          },
        )
        activeRange = range
        options.diagnostics?.enter("range-validation", context)
        if (
          retained.length !== range.end - range.start ||
          retained.some(
            (frame, index) => frame.timestamp !== metadata.frames[range.start + index]?.timestamp,
          )
        ) {
          throw new ProcessingError(
            "unsupported-timeline",
            "Decoded range does not match the source presentation timeline.",
          )
        }
        options.diagnostics?.advance("decodedRanges")
      }
      const frame = retained[entry.sourceIndex - range.start]
      if (!frame) throw new Error("Decoded range is missing a source frame.")
      options.diagnostics?.enter("encoding-sample-creation", context)
      await emit(frame, entry)
      options.diagnostics?.advance("encodedFrames")
    }
  } catch (error) {
    throw options.diagnostics?.failure(error) ?? error
  } finally {
    releaseRetainedVideoFrames(retained)
    await closeForward()
  }
}
