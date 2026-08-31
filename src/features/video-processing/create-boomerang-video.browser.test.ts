import { BlobSource, Input, MP4, VideoSampleSink } from "mediabunny"
import { describe, expect, it } from "vitest"

import { createExtensionPlan, type ExtensionTarget } from "../video-selection/extension-plan"
import audioFixtureUrl from "./__fixtures__/h264-aac.mp4?url"
import directionalFixtureUrl from "./__fixtures__/h264-directional.mp4?url"
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

    const states: State[] = []
    const sink = new VideoSampleSink(videoTrack)
    for await (const sample of sink.samples()) {
      try {
        sample.draw(context, 0, 0, 1, 1)
        const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data
        states.push(classifyState(red, green, blue))
      } finally {
        sample.close()
      }
    }

    return {
      states,
      duration: await videoTrack.computeDuration(),
      audioTrackCount: audioTracks.length,
    }
  } finally {
    input.dispose()
  }
}

async function createOutput(source: File, target: ExtensionTarget) {
  const sourceDuration = await readVideoTrackDuration(source)
  const plan = createExtensionPlan(sourceDuration, target)
  if (!plan.ok) throw new Error(plan.reason)

  const result = await createBoomerangVideo(source, plan.plan)
  return { result, outputDuration: plan.plan.outputDuration }
}

async function createAndDecode(target: ExtensionTarget) {
  const source = await fixture(directionalFixtureUrl, "h264-directional.mp4")
  const { result, outputDuration } = await createOutput(source, target)
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

function expectExactDuration(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(TIMELINE_TOLERANCE_SECONDS)
}

describe("generated boomerang playback", () => {
  it("decodes complete cycles as forward then reverse and remains silent", async () => {
    const { decoded, outputDuration } = await createAndDecode({ mode: "loops", value: 2 })

    const cycle = ["A", "B", "C", "D", "D", "C", "B", "A"]
    expect(decoded.states.slice(0, cycle.length)).toEqual(cycle)
    expect(decoded.states).toEqual([...cycle, ...cycle])
    expect(decoded.audioTrackCount).toBe(0)
    expectExactDuration(decoded.duration, outputDuration)
  })

  it("stops inside the forward half at the expected visual state", async () => {
    const { decoded, outputDuration } = await createAndDecode({ mode: "duration", value: 15 })

    expect(decoded.states).toEqual(["A", "B", "C", "D", "D", "C", "B", "A", "A", "B"])
    expectExactDuration(decoded.duration, outputDuration)
  })

  it("stops inside the reverse half at the expected visual state", async () => {
    const { decoded, outputDuration } = await createAndDecode({ mode: "duration", value: 45 })

    const cycle = ["A", "B", "C", "D", "D", "C", "B", "A"]
    expect(decoded.states).toEqual([...cycle, ...cycle, ...cycle, "A", "B", "C", "D", "D", "C"])
    expectExactDuration(decoded.duration, outputDuration)
  })

  it("discards source AAC from the generated output", async () => {
    const source = await fixture(audioFixtureUrl, "h264-aac.mp4")
    const { result } = await createOutput(source, { mode: "loops", value: 2 })

    expect(await countAudioTracks(result.blob)).toBe(0)
  })
})
