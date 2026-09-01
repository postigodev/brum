import { describe, expect, it } from "vitest"

import {
  createExtensionPlan,
  DURATION_TARGETS,
  isDurationTargetAvailable,
  LOOP_TARGETS,
  SPEED_PRESETS,
  type SpeedPreset,
} from "./extension-plan"

const SPEED_CASES = [
  { speed: "boomerang", multiplier: SPEED_PRESETS.boomerang, passDuration: 2, cycleDuration: 4 },
  { speed: "original", multiplier: SPEED_PRESETS.original, passDuration: 3, cycleDuration: 6 },
  { speed: "slowMo", multiplier: SPEED_PRESETS.slowMo, passDuration: 4, cycleDuration: 8 },
] as const satisfies readonly {
  speed: SpeedPreset
  multiplier: number
  passDuration: number
  cycleDuration: number
}[]

function expectPlan(result: ReturnType<typeof createExtensionPlan>) {
  if (!result.ok) throw new Error(result.reason)
  return result.plan
}

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
  it("exports exactly the approved targets and speed coefficients", () => {
    expect(DURATION_TARGETS).toEqual([15, 30, 45, 60])
    expect(LOOP_TARGETS).toEqual([2, 3, 5, 10])
    expect(SPEED_PRESETS).toEqual({ boomerang: 1.5, original: 1, slowMo: 0.75 })
  })

  it.each(SPEED_CASES)("derives pass and cycle duration for $speed", ({
    speed,
    multiplier,
    passDuration,
    cycleDuration,
  }) => {
    const plan = expectPlan(createExtensionPlan(3, { mode: "loops", value: 2 }, speed))

    expect(plan).toMatchObject({
      sourceDuration: 3,
      speed,
      speedMultiplier: multiplier,
      passDuration,
      cycleDuration,
      outputDuration: cycleDuration * 2,
      totalCycles: 2,
      completeCycles: 2,
      finalPartialCycleDuration: null,
    })
  })

  it("preserves the existing 1x duration calculation under original", () => {
    expect(createExtensionPlan(1.5, { mode: "duration", value: 15 }, "original")).toEqual({
      ok: true,
      plan: {
        sourceDuration: 1.5,
        speed: "original",
        speedMultiplier: 1,
        passDuration: 1.5,
        cycleDuration: 3,
        target: { mode: "duration", value: 15 },
        outputDuration: 15,
        totalCycles: 5,
        completeCycles: 5,
        finalPartialCycleDuration: null,
      },
    })
  })

  it.each(SPEED_CASES)("keeps duration targets exact for $speed", ({ speed }) => {
    const plan = expectPlan(createExtensionPlan(3, { mode: "duration", value: 15 }, speed))

    expect(plan.outputDuration).toBe(15)
  })

  it.each(SPEED_CASES)("represents a $speed cutoff inside the forward half", ({
    speed,
    multiplier,
  }) => {
    const plan = expectPlan(
      createExtensionPlan(7 * multiplier, { mode: "duration", value: 15 }, speed),
    )

    expect(plan).toMatchObject({
      passDuration: 7,
      cycleDuration: 14,
      completeCycles: 1,
      totalCycles: 2,
      finalPartialCycleDuration: 1,
      outputDuration: 15,
    })
  })

  it.each(SPEED_CASES)("represents a $speed cutoff inside the reverse half", ({
    speed,
    multiplier,
  }) => {
    const plan = expectPlan(
      createExtensionPlan(9 * multiplier, { mode: "duration", value: 15 }, speed),
    )

    expect(plan).toMatchObject({
      passDuration: 9,
      cycleDuration: 18,
      completeCycles: 0,
      totalCycles: 1,
      finalPartialCycleDuration: 15,
      outputDuration: 15,
    })
  })

  it.each(
    SPEED_CASES.flatMap(({ speed, multiplier }) =>
      [-1, 1].map((direction) => ({ speed, sourceDuration: 1.5 * multiplier + direction * 1e-8 })),
    ),
  )("normalizes a $speed remainder near a cycle boundary", ({ speed, sourceDuration }) => {
    const plan = expectPlan(
      createExtensionPlan(sourceDuration, { mode: "duration", value: 15 }, speed),
    )

    expect(plan.completeCycles).toBe(5)
    expect(plan.totalCycles).toBe(5)
    expect(plan.finalPartialCycleDuration).toBeNull()
    expect(plan.outputDuration).toBe(15)
  })

  it.each(
    SPEED_CASES.flatMap(({ speed, multiplier }) =>
      [-1, 1].map((direction) => ({ speed, sourceDuration: 3 * multiplier + direction * 1e-8 })),
    ),
  )("normalizes a $speed remainder near the forward/reverse turn", ({ speed, sourceDuration }) => {
    const plan = expectPlan(
      createExtensionPlan(sourceDuration, { mode: "duration", value: 15 }, speed),
    )

    expect(plan.completeCycles).toBe(2)
    expect(plan.totalCycles).toBe(3)
    expect(plan.finalPartialCycleDuration).toBe(plan.passDuration)
    expect(plan.outputDuration).toBe(15)
  })

  it.each(LOOP_TARGETS)("creates an exact original-speed %s-cycle plan", (value) => {
    const plan = expectPlan(createExtensionPlan(1.25, { mode: "loops", value }, "original"))

    expect(plan.outputDuration).toBe(1.25 * 2 * value)
    expect(plan.totalCycles).toBe(value)
    expect(plan.completeCycles).toBe(value)
    expect(plan.finalPartialCycleDuration).toBeNull()
  })

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects invalid source duration %s", (sourceDuration) => {
    expect(createExtensionPlan(sourceDuration, { mode: "loops", value: 2 }, "original")).toEqual({
      ok: false,
      reason: "invalid-source-duration",
    })
  })

  it("rejects an unsupported speed preset at runtime", () => {
    // @ts-expect-error JavaScript callers can still pass an unsupported string at runtime.
    expect(createExtensionPlan(1, { mode: "loops", value: 2 }, "hyper")).toEqual({
      ok: false,
      reason: "unsupported-speed",
    })
  })

  it("rejects a duration target that does not extend the source", () => {
    expect(createExtensionPlan(15, { mode: "duration", value: 15 }, "original")).toEqual({
      ok: false,
      reason: "target-does-not-extend",
    })
  })

  it.each([
    { mode: "duration" as const, value: 20 },
    { mode: "loops" as const, value: 4 },
  ])("rejects unsupported target $mode:$value", (target) => {
    expect(createExtensionPlan(1, target, "original")).toEqual({
      ok: false,
      reason: "unsupported-target",
    })
  })

  it("rejects a non-finite cycle result", () => {
    expect(createExtensionPlan(Number.MAX_VALUE, { mode: "loops", value: 10 }, "original")).toEqual(
      {
        ok: false,
        reason: "non-finite-result",
      },
    )
  })
})
