import { BlobSource, Input, MP4, VideoSampleSink } from "mediabunny"

import { ProcessingError, throwIfAborted } from "./errors"
import { inspectMedia } from "./inspect-media"
import type { BoomerangVerification, MediaInspection, VideoTrackSummary } from "./types"

const OUTPUT_TIMELINE_TOLERANCE_SECONDS = 0.001

export type DecodedVideoTimeline = {
  sampleCount: number
  firstTimestamp: number
  endTimestamp: number
  continuous: boolean
}

function sameGeometry(source: VideoTrackSummary, output: VideoTrackSummary) {
  return (
    source.codedWidth === output.codedWidth &&
    source.codedHeight === output.codedHeight &&
    source.displayWidth === output.displayWidth &&
    source.displayHeight === output.displayHeight &&
    source.rotation === output.rotation &&
    JSON.stringify(source.pixelAspectRatio) === JSON.stringify(output.pixelAspectRatio)
  )
}

export function verifyBoomerangInspection(
  sourceVideo: VideoTrackSummary,
  output: MediaInspection,
  targetDuration: number,
  decodedTimeline: DecodedVideoTimeline,
): BoomerangVerification {
  const duration =
    Math.abs(output.duration - targetDuration) <= OUTPUT_TIMELINE_TOLERANCE_SECONDS &&
    Math.abs(output.video.duration - targetDuration) <= OUTPUT_TIMELINE_TOLERANCE_SECONDS
  const codec = output.video.codec === "avc"
  const videoGeometry = sameGeometry(sourceVideo, output.video)
  const silent = output.audioTrackCount === 0
  const videoTimeline =
    decodedTimeline.sampleCount > 0 &&
    Math.abs(decodedTimeline.firstTimestamp) <= OUTPUT_TIMELINE_TOLERANCE_SECONDS &&
    Math.abs(decodedTimeline.endTimestamp - targetDuration) <= OUTPUT_TIMELINE_TOLERANCE_SECONDS &&
    decodedTimeline.continuous

  if (!duration || !codec || !videoGeometry || !silent || !videoTimeline) {
    const failedChecks = Object.entries({
      duration,
      codec,
      videoGeometry,
      silent,
      videoTimeline,
    })
      .filter(([, passed]) => !passed)
      .map(([check]) => check)
      .join(", ")
    throw new ProcessingError(
      "verification-failed",
      `The boomerang MP4 failed verification: ${failedChecks}.`,
    )
  }

  return {
    duration: true,
    codec: true,
    videoGeometry: true,
    silent: true,
    videoTimeline: true,
  }
}

async function inspectDecodedVideoTimeline(blob: Blob, signal?: AbortSignal) {
  const input = new Input({ formats: [MP4], source: new BlobSource(blob) })
  let sampleCount = 0
  let firstTimestamp: number | null = null
  let endTimestamp: number | null = null
  let continuous = true

  try {
    const tracks = await input.getVideoTracks()
    const track = tracks[0]
    if (!track || tracks.length !== 1) {
      throw new ProcessingError("verification-failed", "The output video track is missing.")
    }

    const sink = new VideoSampleSink(track)
    for await (const sample of sink.samples()) {
      try {
        throwIfAborted(signal)
        if (firstTimestamp === null) {
          firstTimestamp = sample.timestamp
        } else if (
          endTimestamp !== null &&
          Math.abs(sample.timestamp - endTimestamp) > OUTPUT_TIMELINE_TOLERANCE_SECONDS
        ) {
          continuous = false
        }
        endTimestamp = sample.timestamp + sample.duration
        sampleCount += 1
      } finally {
        sample.close()
      }
    }
  } finally {
    input.dispose()
  }

  return {
    sampleCount,
    firstTimestamp: firstTimestamp ?? Number.NaN,
    endTimestamp: endTimestamp ?? Number.NaN,
    continuous,
  }
}

export async function verifyBoomerangOutput(
  blob: Blob,
  sourceVideo: VideoTrackSummary,
  targetDuration: number,
  signal?: AbortSignal,
) {
  const [output, decodedTimeline] = await Promise.all([
    inspectMedia(blob, signal),
    inspectDecodedVideoTimeline(blob, signal),
  ])
  return {
    output,
    verification: verifyBoomerangInspection(sourceVideo, output, targetDuration, decodedTimeline),
  }
}
