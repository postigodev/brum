import { describe, expect, it } from "vitest"
import {
  createExtensionPlan,
  DURATION_TARGETS,
  isDurationTargetAvailable,
  LOOP_TARGETS,
} from "./extension-plan"

describe("isDurationTargetAvailable", () => {
  it.each([
    { source: 1.4, target: 15, expected: true },
    { source: 15, target: 15, expected: false },
    { source: 14.9995, target: 15, expected: false },
    { source: 14.998, target: 15, expected: true },
    { source: 16, target: 15, expected: false },
  ])("returns $expected for $source s -> $target s", ({ source, target, expected }) => {
    expect(isDurationTargetAvailable(source, target)).toBe(expected)
  })

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects invalid source duration %s", (source) => {
    expect(isDurationTargetAvailable(source, 15)).toBe(false)
  })
})

describe("createExtensionPlan", () => {
  it("creates an exactly divisible duration plan from complete cycles", () => {
    expect(createExtensionPlan(1.5, { mode: "duration", value: 15 })).toEqual({
      ok: true,
      plan: {
        sourceDuration: 1.5,
        cycleDuration: 3,
        target: { mode: "duration", value: 15 },
        outputDuration: 15,
        totalCycles: 5,
        completeCycles: 5,
        finalPartialCycleDuration: null,
      },
    })
  })

  it("represents a cutoff inside the forward half of a partial cycle", () => {
    expect(createExtensionPlan(7, { mode: "duration", value: 15 })).toEqual({
      ok: true,
      plan: {
        sourceDuration: 7,
        cycleDuration: 14,
        target: { mode: "duration", value: 15 },
        outputDuration: 15,
        totalCycles: 2,
        completeCycles: 1,
        finalPartialCycleDuration: 1,
      },
    })
  })

  it("represents a cutoff inside the reverse half with zero complete cycles", () => {
    expect(createExtensionPlan(10, { mode: "duration", value: 15 })).toEqual({
      ok: true,
      plan: {
        sourceDuration: 10,
        cycleDuration: 20,
        target: { mode: "duration", value: 15 },
        outputDuration: 15,
        totalCycles: 1,
        completeCycles: 0,
        finalPartialCycleDuration: 15,
      },
    })
  })

  it.each([
    { boundary: "cycle start", sourceDuration: 1.49999999 },
    { boundary: "cycle end", sourceDuration: 1.50000001 },
  ])("normalizes a remainder near the $boundary", ({ sourceDuration }) => {
    const result = createExtensionPlan(sourceDuration, { mode: "duration", value: 15 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.plan.totalCycles).toBe(5)
      expect(result.plan.completeCycles).toBe(5)
      expect(result.plan.finalPartialCycleDuration).toBeNull()
      expect(result.plan.outputDuration).toBe(15)
    }
  })

  it.each([
    2.9999999, 3.0000001,
  ])("normalizes a remainder near the forward/reverse turnaround for source %s", (sourceDuration) => {
    const result = createExtensionPlan(sourceDuration, { mode: "duration", value: 15 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.plan.totalCycles).toBe(3)
      expect(result.plan.completeCycles).toBe(2)
      expect(result.plan.finalPartialCycleDuration).toBe(sourceDuration)
      expect(result.plan.outputDuration).toBe(15)
    }
  })

  it.each(LOOP_TARGETS)("creates a complete %s-cycle loop plan", (value) => {
    expect(createExtensionPlan(1.25, { mode: "loops", value })).toEqual({
      ok: true,
      plan: {
        sourceDuration: 1.25,
        cycleDuration: 2.5,
        target: { mode: "loops", value },
        outputDuration: 1.25 * 2 * value,
        totalCycles: value,
        completeCycles: value,
        finalPartialCycleDuration: null,
      },
    })
  })

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects invalid source duration %s", (sourceDuration) => {
    expect(createExtensionPlan(sourceDuration, { mode: "loops", value: 2 })).toEqual({
      ok: false,
      reason: "invalid-source-duration",
    })
  })

  it("rejects a duration target that does not extend the source", () => {
    expect(createExtensionPlan(15, { mode: "duration", value: 15 })).toEqual({
      ok: false,
      reason: "target-does-not-extend",
    })
  })

  it.each([
    { mode: "duration" as const, value: 20 },
    { mode: "loops" as const, value: 4 },
  ])("rejects unsupported target $mode:$value", (target) => {
    expect(createExtensionPlan(1, target)).toEqual({
      ok: false,
      reason: "unsupported-target",
    })
  })

  it("rejects a non-finite loop result", () => {
    expect(createExtensionPlan(Number.MAX_VALUE, { mode: "loops", value: 10 })).toEqual({
      ok: false,
      reason: "non-finite-result",
    })
  })

  it("exports exactly the approved presets", () => {
    expect(DURATION_TARGETS).toEqual([15, 30, 45, 60])
    expect(LOOP_TARGETS).toEqual([2, 3, 5, 10])
  })
})
