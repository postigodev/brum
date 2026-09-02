export type VideoFrameTiming = {
  timestamp: number
  duration: number
}

export type BoomerangTimelineEntry = {
  sourceIndex: number
  direction: "forward" | "reverse"
  timestamp: number
  duration: number
}

const TIMELINE_EPSILON_SECONDS = 1e-9

function assertFinitePositive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a finite positive number.`)
  }
}

export function createBoomerangTimeline(
  frames: readonly VideoFrameTiming[],
  sourceDuration: number,
  outputDuration: number,
  speedMultiplier: number,
) {
  assertFinitePositive(sourceDuration, "sourceDuration")
  assertFinitePositive(outputDuration, "outputDuration")
  assertFinitePositive(speedMultiplier, "speedMultiplier")
  const firstFrame = frames[0]
  if (!firstFrame || !Number.isFinite(firstFrame.timestamp)) {
    throw new TypeError("frames must contain at least one finite timestamp.")
  }

  const sourceFrames = frames.map((frame, sourceIndex) => {
    if (!Number.isFinite(frame.timestamp) || !Number.isFinite(frame.duration)) {
      throw new TypeError("frame timings must be finite.")
    }

    const start = frame.timestamp - firstFrame.timestamp
    const next = frames[sourceIndex + 1]
    const end = next ? next.timestamp - firstFrame.timestamp : sourceDuration
    const sourceFrameDuration = end - start
    if (start < 0 || sourceFrameDuration <= 0 || end > sourceDuration + Number.EPSILON) {
      throw new TypeError("frame timestamps must form a positive presentation-order timeline.")
    }

    return { sourceIndex, duration: sourceFrameDuration / speedMultiplier }
  })

  const cycleFrames = [
    ...sourceFrames.map((frame) => ({ ...frame, direction: "forward" as const })),
    ...Array.from(sourceFrames)
      .reverse()
      .map((frame) => ({ ...frame, direction: "reverse" as const })),
  ]
  const timeline: BoomerangTimelineEntry[] = []
  let timestamp = 0

  while (outputDuration - timestamp > TIMELINE_EPSILON_SECONDS) {
    for (const frame of cycleFrames) {
      const duration = Math.min(frame.duration, outputDuration - timestamp)
      if (duration <= 0) break

      timeline.push({
        sourceIndex: frame.sourceIndex,
        direction: frame.direction,
        timestamp,
        duration,
      })
      timestamp += duration
      if (Math.abs(outputDuration - timestamp) <= TIMELINE_EPSILON_SECONDS) {
        const last = timeline.at(-1)
        if (last) last.duration += outputDuration - timestamp
        timestamp = outputDuration
      }
      if (timestamp >= outputDuration) break
    }
  }

  return timeline
}
