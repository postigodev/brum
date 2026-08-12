import type { AudioTimelineAnalysis, PacketRecord } from "./types"

const TIMELINE_TOLERANCE_SECONDS = 0.001

export type PcmSampleDescriptor = {
  timestamp: number
  numberOfFrames: number
}

export type PcmFrameSlice = {
  sampleIndex: number
  startFrame: number
  endFrame: number
  cycleStartFrame: number
}

export type PcmCyclePlan = {
  cycleFrameCount: number
  outputFrameCount: number
  slices: PcmFrameSlice[]
}

export function classifyAudioTimeline(
  packets: readonly PacketRecord[],
  sourceDuration: number,
): AudioTimelineAnalysis {
  const firstTimestamp = packets[0]?.timestamp ?? null
  const last = packets.at(-1)
  const endTimestamp = last ? last.timestamp + last.duration : null

  if (firstTimestamp === null || endTimestamp === null) {
    return {
      kind: "unsupported",
      reason: "Audio contains no packets.",
      firstTimestamp,
      endTimestamp,
    }
  }

  const endDifference = Math.abs(endTimestamp - sourceDuration)
  if (
    Math.abs(firstTimestamp) <= TIMELINE_TOLERANCE_SECONDS &&
    endDifference <= TIMELINE_TOLERANCE_SECONDS
  ) {
    return {
      kind: "packet-copy",
      reason: "AAC packets share the source timeline.",
      firstTimestamp,
      endTimestamp,
    }
  }

  if (
    firstTimestamp < -TIMELINE_TOLERANCE_SECONDS &&
    endTimestamp - firstTimestamp >= sourceDuration - TIMELINE_TOLERANCE_SECONDS
  ) {
    return {
      kind: "reencode",
      reason: "AAC priming begins before time zero.",
      firstTimestamp,
      endTimestamp,
    }
  }

  return {
    kind: "unsupported",
    reason: "The AAC presentation timeline has an unsupported gap or span.",
    firstTimestamp,
    endTimestamp,
  }
}

export function createPcmCyclePlan(
  samples: readonly PcmSampleDescriptor[],
  sourceDuration: number,
  outputDuration: number,
  sampleRate: number,
  originTimestamp = 0,
): PcmCyclePlan | null {
  if (
    ![sourceDuration, outputDuration, sampleRate].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    return null

  const cycleFrameCount = Math.round(sourceDuration * sampleRate)
  const outputFrameCount = Math.round(outputDuration * sampleRate)
  if (cycleFrameCount <= 0 || outputFrameCount <= cycleFrameCount) return null
  if (Math.abs(cycleFrameCount / sampleRate - sourceDuration) > 1 / sampleRate) return null

  const slices: PcmFrameSlice[] = []
  let cursor = 0
  for (const [sampleIndex, sample] of samples.entries()) {
    const sampleStartFrame = Math.round((sample.timestamp - originTimestamp) * sampleRate)
    const startFrame = Math.max(0, -sampleStartFrame)
    const endFrame = Math.min(sample.numberOfFrames, cycleFrameCount - sampleStartFrame)
    if (endFrame <= startFrame) continue

    const cycleStartFrame = sampleStartFrame + startFrame
    if (Math.abs(cycleStartFrame - cursor) > 1) return null
    slices.push({ sampleIndex, startFrame, endFrame, cycleStartFrame: cursor })
    cursor += endFrame - startFrame
    if (cursor >= cycleFrameCount) break
  }

  if (Math.abs(cursor - cycleFrameCount) > 1 || slices.length === 0) return null
  const last = slices.at(-1)
  if (last && cursor > cycleFrameCount) last.endFrame -= cursor - cycleFrameCount

  return { cycleFrameCount, outputFrameCount, slices }
}
