import { BlobSource, Input, MP4, VideoSampleSink } from "mediabunny"
import { describe, expect, it } from "vitest"

import {
  createExtensionPlan,
  type ExtensionTarget,
  SPEED_PRESETS,
  type SpeedPreset,
} from "../video-selection/extension-plan"
import audioFixtureUrl from "./__fixtures__/h264-aac.mp4?url"
import directionalFixtureUrl from "./__fixtures__/h264-directional.mp4?url"
import manyFramesFixtureUrl from "./__fixtures__/h264-many-frames.mp4?url"
import { createBoomerangVideo } from "./create-boomerang-video"
import { readVideoTrackDuration } from "./inspect-media"
import { TIMELINE_TOLERANCE_SECONDS } from "./processing-validation"

const MAX_STATE_COLOR_DISTANCE_SQUARED = 25_000
const STATE_COLORS = {
  A: [255, 0, 0],
  B: [0, 255, 0],
  C: [0, 0, 255],
  D: [255, 255, 255],
} as const

type State = keyof typeof STATE_COLORS
type DecodedStateFrame = { state: State; timestamp: number; duration: number }

const CYCLE: readonly State[] = ["A", "B", "C", "D", "D", "C", "B", "A"]
const SOURCE_FRAME_DURATION = 1.5
const SPEED_CASES = [
  { speed: "original", emittedDuration: SOURCE_FRAME_DURATION / SPEED_PRESETS.original },
  { speed: "boomerang", emittedDuration: SOURCE_FRAME_DURATION / SPEED_PRESETS.boomerang },
  { speed: "slowMo", emittedDuration: SOURCE_FRAME_DURATION / SPEED_PRESETS.slowMo },
] as const

function classifyState(red: number, green: number, blue: number): State {
  const nearest = (
    Object.entries(STATE_COLORS) as [State, readonly [number, number, number]][]
  ).reduce(
    (nearest, [state, color]) => {
      const distance = (red - color[0]) ** 2 + (green - color[1]) ** 2 + (blue - color[2]) ** 2
      return distance < nearest.distance ? { state, distance } : nearest
    },
    { state: "A" as State, distance: Number.POSITIVE_INFINITY },
  )
  if (nearest.distance > MAX_STATE_COLOR_DISTANCE_SQUARED) {
    throw new Error(`Decoded frame color was not a fixture state: ${red},${green},${blue}.`)
  }
  return nearest.state
}

async function fixture(url: string, name: string) {
  const response = await fetch(url)
  return new File([await response.blob()], name, { type: "video/mp4" })
}

async function decodeStates(blob: Blob) {
  const input = new Input({ formats: [MP4], source: new BlobSource(blob) })
  const canvas = new OffscreenCanvas(1, 1)
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) throw new Error("2D canvas is unavailable.")

  try {
    const [videoTracks, audioTracks] = await Promise.all([
      input.getVideoTracks(),
      input.getAudioTracks(),
    ])
    const videoTrack = videoTracks[0]
    if (!videoTrack || videoTracks.length !== 1) throw new Error("Expected one video track.")

    const frames: DecodedStateFrame[] = []
    const sink = new VideoSampleSink(videoTrack)
    for await (const sample of sink.samples()) {
      try {
        sample.draw(context, 0, 0, 1, 1)
        const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data
        frames.push({
          state: classifyState(red, green, blue),
          timestamp: sample.timestamp,
          duration: sample.duration,
        })
      } finally {
        sample.close()
      }
    }

    return {
      frames,
      states: frames.map(({ state }) => state),
      duration: await videoTrack.computeDuration(),
      audioTrackCount: audioTracks.length,
    }
  } finally {
    input.dispose()
  }
}

async function createOutput(source: File, target: ExtensionTarget, speed: SpeedPreset) {
  const sourceDuration = await readVideoTrackDuration(source)
  const plan = createExtensionPlan(sourceDuration, target, speed)
  if (!plan.ok) throw new Error(plan.reason)

  const result = await createBoomerangVideo(source, plan.plan)
  return { result, outputDuration: plan.plan.outputDuration }
}

async function createAndDecode(target: ExtensionTarget, speed: SpeedPreset) {
  const source = await fixture(directionalFixtureUrl, "h264-directional.mp4")
  const { result, outputDuration } = await createOutput(source, target, speed)
  return { decoded: await decodeStates(result.blob), outputDuration }
}

async function countAudioTracks(blob: Blob) {
  const input = new Input({ formats: [MP4], source: new BlobSource(blob) })
  try {
    return (await input.getAudioTracks()).length
  } finally {
    input.dispose()
  }
}

async function inspectDecodedOutput(blob: Blob) {
  const input = new Input({ formats: [MP4], source: new BlobSource(blob) })
  try {
    const videoTracks = await input.getVideoTracks()
    const videoTrack = videoTracks[0]
    if (!videoTrack || videoTracks.length !== 1) throw new Error("Expected one video track.")

    let frameCount = 0
    const sink = new VideoSampleSink(videoTrack)
    for await (const sample of sink.samples()) {
      sample.close()
      frameCount += 1
    }

    return { frameCount, duration: await videoTrack.computeDuration() }
  } finally {
    input.dispose()
  }
}

function expectExactDuration(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(TIMELINE_TOLERANCE_SECONDS)
}

function expectContinuousFrameTiming(
  frames: readonly DecodedStateFrame[],
  emittedDuration: number,
  outputDuration: number,
) {
  let expectedTimestamp = 0
  for (const frame of frames) {
    const expectedDuration = Math.min(emittedDuration, outputDuration - expectedTimestamp)
    expectExactDuration(frame.timestamp, expectedTimestamp)
    expectExactDuration(frame.duration, expectedDuration)
    expectedTimestamp += expectedDuration
  }
  expectExactDuration(expectedTimestamp, outputDuration)
}

describe("generated boomerang playback", () => {
  it.each(SPEED_CASES)("decodes two continuous complete cycles at $speed speed", async ({
    speed,
    emittedDuration,
  }) => {
    const { decoded, outputDuration } = await createAndDecode({ mode: "loops", value: 2 }, speed)

    expect(decoded.states).toEqual([...CYCLE, ...CYCLE])
    expect(decoded.audioTrackCount).toBe(0)
    expectContinuousFrameTiming(decoded.frames, emittedDuration, outputDuration)
    expectExactDuration(decoded.duration, outputDuration)
  })

  it.each(SPEED_CASES)("keeps a 15-second duration target exact at $speed speed", async ({
    speed,
    emittedDuration,
  }) => {
    const { decoded, outputDuration } = await createAndDecode(
      { mode: "duration", value: 15 },
      speed,
    )
    const expectedFrameCount = Math.ceil(outputDuration / emittedDuration)
    const expectedStates = Array.from(
      { length: expectedFrameCount },
      (_, index) => CYCLE[index % CYCLE.length],
    )

    expect(decoded.states).toEqual(expectedStates)
    expectContinuousFrameTiming(decoded.frames, emittedDuration, outputDuration)
    expectExactDuration(decoded.duration, outputDuration)
  })

  it("stops inside the forward half at the expected visual state", async () => {
    const { decoded, outputDuration } = await createAndDecode(
      { mode: "duration", value: 15 },
      "original",
    )

    expect(decoded.states).toEqual(["A", "B", "C", "D", "D", "C", "B", "A", "A", "B"])
    expectExactDuration(decoded.duration, outputDuration)
  })

  it("stops inside the reverse half at the expected visual state", async () => {
    const { decoded, outputDuration } = await createAndDecode(
      { mode: "duration", value: 45 },
      "original",
    )

    expect(decoded.states).toEqual([...CYCLE, ...CYCLE, ...CYCLE, "A", "B", "C", "D", "D", "C"])
    expectExactDuration(decoded.duration, outputDuration)
  })

  it("discards source AAC from the generated output", async () => {
    const source = await fixture(audioFixtureUrl, "h264-aac.mp4")
    const { result } = await createOutput(source, { mode: "loops", value: 2 }, "original")

    expect(await countAudioTracks(result.blob)).toBe(0)
  })

  it("processes a 120-frame source without retaining decoder resources", async () => {
    const source = await fixture(manyFramesFixtureUrl, "h264-many-frames.mp4")
    const { result, outputDuration } = await createOutput(
      source,
      { mode: "loops", value: 2 },
      "original",
    )
    const decoded = await inspectDecodedOutput(result.blob)

    expect(decoded.frameCount).toBe(480)
    expectExactDuration(decoded.duration, outputDuration)
  })
})
