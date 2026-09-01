import { describe, expect, it } from "vitest"

import { createExtensionPlan } from "#/features/video-selection/extension-plan"

import {
  assertActualOutputSize,
  assertEstimatedOutputSize,
  assertInputSize,
  MAX_INPUT_BYTES,
  MAX_OUTPUT_BYTES,
} from "./limits"

const ONE_MEBIBYTE_PER_SECOND_BITRATE = 8 * 1024 * 1024

function plan(sourceDuration: number, mode: "duration" | "loops", value: number) {
  const result = createExtensionPlan(sourceDuration, { mode, value }, "original")
  if (!result.ok) throw new Error(result.reason)
  return result.plan
}

describe("media size limits", () => {
  it("accepts the exact input limit", () => {
    expect(() => assertInputSize(MAX_INPUT_BYTES)).not.toThrow()
  })

  it("rejects values above the input limit", () => {
    expect(() => assertInputSize(MAX_INPUT_BYTES + 1)).toThrowError(
      expect.objectContaining({ code: "input-too-large" }),
    )
  })

  it("accepts a clearly safe planned output", () => {
    expect(assertEstimatedOutputSize(2_000_000, 60)).toBe(15_000_000)
  })

  it("rejects a clearly oversized planned output", () => {
    expect(() => assertEstimatedOutputSize(40_000_000, 60)).toThrowError(
      expect.objectContaining({
        code: "output-too-large",
        message: "The planned output is likely to exceed 200 MiB.",
      }),
    )
  })

  it("allows a long cycle plan at the boundary and rejects one above it", () => {
    const boundaryPlan = plan(10, "loops", 10)
    const oversizedPlan = plan(10.05, "loops", 10)

    expect(
      assertEstimatedOutputSize(ONE_MEBIBYTE_PER_SECOND_BITRATE, boundaryPlan.outputDuration),
    ).toBe(MAX_OUTPUT_BYTES)
    expect(() =>
      assertEstimatedOutputSize(ONE_MEBIBYTE_PER_SECOND_BITRATE, oversizedPlan.outputDuration),
    ).toThrowError(expect.objectContaining({ code: "output-too-large" }))
  })

  it("uses planned output duration for duration and cycle targets", () => {
    const durationPlan = plan(1, "duration", 60)
    const cyclePlan = plan(2, "loops", 5)

    expect(
      assertEstimatedOutputSize(ONE_MEBIBYTE_PER_SECOND_BITRATE, durationPlan.outputDuration),
    ).toBe(60 * 1024 * 1024)
    expect(
      assertEstimatedOutputSize(ONE_MEBIBYTE_PER_SECOND_BITRATE, cyclePlan.outputDuration),
    ).toBe(20 * 1024 * 1024)
  })

  it("keeps the actual output size guard authoritative", () => {
    expect(() => assertActualOutputSize(MAX_OUTPUT_BYTES)).not.toThrow()
    expect(() => assertActualOutputSize(MAX_OUTPUT_BYTES + 1)).toThrowError(
      expect.objectContaining({ code: "output-too-large" }),
    )
  })
})
