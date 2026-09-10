import type { BoomerangTimelineEntry, VideoFrameTiming } from "./boomerang-timeline"
import {
  type CollectionOptions,
  collectDecodedVideoRange,
  type DecodedVideoSample,
  decodedVideoSampleBytes,
  MAX_RETAINED_DECODED_VIDEO_BYTES,
  MAX_RETAINED_DECODED_VIDEO_FRAMES,
  type RetainedVideoFrame,
  readDecodedVideoSamples,
  releaseRetainedVideoFrames,
} from "./decoded-video-buffer"
import { ProcessingError, throwIfAborted } from "./errors"

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

  for await (const sample of readDecodedVideoSamples(samples, options)) {
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
    } finally {
      sample.close()
    }
  }
  if (frames.length === 0) {
    throw new ProcessingError("unsupported-timeline", "The video track contains no decoded frames.")
  }
  return { frames, ranges }
}

// Only one range is owned at a time, including across direction changes and repeated cycles.
// Mediabunny seeks to the preceding keyframe and discards preroll before the requested range.
export async function emitVideoRanges(
  sink: { samples: (start?: number, end?: number) => AsyncIterable<DecodedVideoSample> },
  metadata: VideoMetadata,
  timeline: readonly BoomerangTimelineEntry[],
  emit: (frame: RetainedVideoFrame, entry: BoomerangTimelineEntry) => Promise<void>,
  options: CollectionOptions = {},
) {
  let activeRange: VideoRange | undefined
  let retained: RetainedVideoFrame[] = []
  try {
    for (const entry of timeline) {
      throwIfAborted(options.signal)
      const frameMetadata = metadata.frames[entry.sourceIndex]
      const range = frameMetadata && metadata.ranges[frameMetadata.rangeIndex]
      if (!range) throw new Error("Boomerang timeline referenced an unknown source frame.")
      if (range !== activeRange) {
        releaseRetainedVideoFrames(retained)
        const first = metadata.frames[range.start]
        if (!first) throw new Error("Video range has no starting frame.")
        retained = await collectDecodedVideoRange(
          sink.samples(first.timestamp, metadata.frames[range.end]?.timestamp),
          options,
        )
        activeRange = range
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
      }
      const frame = retained[entry.sourceIndex - range.start]
      if (!frame) throw new Error("Decoded range is missing a source frame.")
      await emit(frame, entry)
    }
  } finally {
    releaseRetainedVideoFrames(retained)
  }
}
