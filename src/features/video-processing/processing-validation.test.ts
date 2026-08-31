import { describe, expect, it } from "vitest"

import type { ExtensionPlan } from "#/features/video-selection/extension-plan"

import {
  assertPlanMatchesSource,
  METADATA_DURATION_TOLERANCE_SECONDS,
} from "./processing-validation"

function plan(sourceDuration = 1): ExtensionPlan {
  return {
    sourceDuration,
    cycleDuration: sourceDuration * 2,
    target: { mode: "loops", value: 2 },
    outputDuration: sourceDuration * 4,
    totalCycles: 2,
    completeCycles: 2,
    finalPartialCycleDuration: null,
  }
}

describe("processing validation", () => {
  it("accepts metadata differences at the tolerance boundary", () => {
    expect(() => assertPlanMatchesSource(plan(0.05), 0.1)).not.toThrow()
  })

  it("rejects stale plans", () => {
    expect(() =>
      assertPlanMatchesSource(plan(), 1 + METADATA_DURATION_TOLERANCE_SECONDS + 0.001),
    ).toThrowError(expect.objectContaining({ code: "plan-duration-mismatch" }))
  })

  it.each([
    0,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects invalid inspected duration %s", (duration) => {
    expect(() => assertPlanMatchesSource(plan(), duration)).toThrowError(
      expect.objectContaining({ code: "invalid-duration" }),
    )
  })
})
