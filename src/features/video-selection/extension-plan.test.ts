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
  it("creates an exact divisible duration plan without a partial play", () => {
    expect(createExtensionPlan(1.5, { mode: "duration", value: 15 })).toEqual({
      ok: true,
      plan: {
        sourceDuration: 1.5,
        target: { mode: "duration", value: 15 },
        outputDuration: 15,
        totalPlays: 10,
        completePlays: 10,
        finalPartialDuration: null,
      },
    })
  })

  it("creates an exact non-divisible duration plan with one partial play", () => {
    expect(createExtensionPlan(1.4, { mode: "duration", value: 15 })).toEqual({
      ok: true,
      plan: {
        sourceDuration: 1.4,
        target: { mode: "duration", value: 15 },
        outputDuration: 15,
        totalPlays: 11,
        completePlays: 10,
        finalPartialDuration: 1,
      },
    })
  })

  it.each([
    1.49999999, 1.50000001,
  ])("normalizes a divisibility boundary for source %s", (sourceDuration) => {
    const result = createExtensionPlan(sourceDuration, { mode: "duration", value: 15 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.plan.totalPlays).toBe(10)
      expect(result.plan.completePlays).toBe(10)
      expect(result.plan.finalPartialDuration).toBeNull()
    }
  })

  it.each(LOOP_TARGETS)("creates a complete %s-play loop plan", (value) => {
    expect(createExtensionPlan(1.25, { mode: "loops", value })).toEqual({
      ok: true,
      plan: {
        sourceDuration: 1.25,
        target: { mode: "loops", value },
        outputDuration: 1.25 * value,
        totalPlays: value,
        completePlays: value,
        finalPartialDuration: null,
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
