import { describe, expect, it } from "vitest"

import { createBoomerangTimeline } from "./boomerang-timeline"

const frames = [
  { timestamp: 0, duration: 0.25 },
  { timestamp: 0.25, duration: 0.25 },
  { timestamp: 0.5, duration: 0.25 },
  { timestamp: 0.75, duration: 0.25 },
]

describe("boomerang timeline", () => {
  it("emits a complete forward/reverse cycle with duplicated endpoints", () => {
    const timeline = createBoomerangTimeline(frames, 1, 2)

    expect(timeline.map(({ sourceIndex }) => sourceIndex)).toEqual([0, 1, 2, 3, 3, 2, 1, 0])
    expect(timeline.map(({ direction }) => direction)).toEqual([
      "forward",
      "forward",
      "forward",
      "forward",
      "reverse",
      "reverse",
      "reverse",
      "reverse",
    ])
    expect(timeline.at(-1)).toMatchObject({ timestamp: 1.75, duration: 0.25 })
  })

  it("shortens the final frame for a cutoff inside the forward half", () => {
    const timeline = createBoomerangTimeline(frames, 1, 0.6)

    expect(timeline.map(({ sourceIndex }) => sourceIndex)).toEqual([0, 1, 2])
    expect(timeline.at(-1)).toMatchObject({
      sourceIndex: 2,
      direction: "forward",
      timestamp: 0.5,
    })
    expect(timeline.at(-1)?.duration).toBeCloseTo(0.1, 10)
  })

  it("shortens the final frame for a cutoff inside the reverse half", () => {
    const timeline = createBoomerangTimeline(frames, 1, 1.35)

    expect(timeline.map(({ sourceIndex }) => sourceIndex)).toEqual([0, 1, 2, 3, 3, 2])
    expect(timeline.at(-1)).toMatchObject({
      sourceIndex: 2,
      direction: "reverse",
      timestamp: 1.25,
    })
    expect(timeline.at(-1)?.duration).toBeCloseTo(0.1, 10)
  })

  it("uses the video duration instead of extending to a longer container tail", () => {
    const shortVideoFrames = [
      { timestamp: 0, duration: 0.4 },
      { timestamp: 0.4, duration: 0.4 },
      { timestamp: 0.8, duration: 0.04 },
    ]
    const timeline = createBoomerangTimeline(shortVideoFrames, 0.84, 1.68)

    expect(timeline.map(({ sourceIndex }) => sourceIndex)).toEqual([0, 1, 2, 2, 1, 0])
    const expectedDurations = [0.4, 0.4, 0.04, 0.04, 0.4, 0.4]
    timeline.forEach((entry, index) => {
      expect(entry.duration).toBeCloseTo(expectedDurations[index] ?? 0, 10)
    })
    expect((timeline.at(-1)?.timestamp ?? 0) + (timeline.at(-1)?.duration ?? 0)).toBeCloseTo(
      1.68,
      10,
    )
  })
})
