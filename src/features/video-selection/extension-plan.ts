export const DURATION_TARGETS = [15, 30, 45, 60] as const
export const LOOP_TARGETS = [2, 3, 5, 10] as const
export const SPEED_PRESETS = {
  boomerang: 1.5,
  original: 1,
  slowMo: 0.75,
} as const

export type TargetMode = "duration" | "loops"
export type SpeedPreset = keyof typeof SPEED_PRESETS

export type ExtensionTarget = {
  mode: TargetMode
  value: number
}

export type ExtensionPlan = {
  sourceDuration: number
  speed: SpeedPreset
  speedMultiplier: number
  passDuration: number
  cycleDuration: number
  target: ExtensionTarget
  outputDuration: number
  totalCycles: number
  completeCycles: number
  finalPartialCycleDuration: number | null
}

export type ExtensionPlanResult =
  | { ok: true; plan: ExtensionPlan }
  | {
      ok: false
      reason:
        | "invalid-source-duration"
        | "unsupported-speed"
        | "unsupported-target"
        | "target-does-not-extend"
        | "non-finite-result"
    }

const DURATION_EPSILON_SECONDS = 0.001

function isFinitePositive(value: number) {
  return Number.isFinite(value) && value > 0
}

function isFiniteNonNegativeInteger(value: number) {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

function includesValue(values: readonly number[], candidate: number) {
  return values.some((value) => value === candidate)
}

export function isDurationTargetAvailable(sourceDuration: number, target: number) {
  return (
    isFinitePositive(sourceDuration) &&
    includesValue(DURATION_TARGETS, target) &&
    target - sourceDuration > DURATION_EPSILON_SECONDS
  )
}

export function createExtensionPlan(
  sourceDuration: number,
  target: ExtensionTarget,
  speed: SpeedPreset,
): ExtensionPlanResult {
  if (!isFinitePositive(sourceDuration)) {
    return { ok: false, reason: "invalid-source-duration" }
  }

  const speedMultiplier = SPEED_PRESETS[speed]
  if (!isFinitePositive(speedMultiplier)) {
    return { ok: false, reason: "unsupported-speed" }
  }

  const supportedValues = target.mode === "duration" ? DURATION_TARGETS : LOOP_TARGETS
  if (!includesValue(supportedValues, target.value)) {
    return { ok: false, reason: "unsupported-target" }
  }

  const passDuration = sourceDuration / speedMultiplier
  const cycleDuration = passDuration * 2
  if (!isFinitePositive(passDuration) || !isFinitePositive(cycleDuration)) {
    return { ok: false, reason: "non-finite-result" }
  }

  if (target.mode === "loops") {
    const outputDuration = cycleDuration * target.value
    if (!isFinitePositive(outputDuration)) {
      return { ok: false, reason: "non-finite-result" }
    }

    return {
      ok: true,
      plan: {
        sourceDuration,
        speed,
        speedMultiplier,
        passDuration,
        cycleDuration,
        target,
        outputDuration,
        totalCycles: target.value,
        completeCycles: target.value,
        finalPartialCycleDuration: null,
      },
    }
  }

  if (!isDurationTargetAvailable(sourceDuration, target.value)) {
    return { ok: false, reason: "target-does-not-extend" }
  }

  let completeCycles = Math.floor(target.value / cycleDuration)
  let remainder = target.value - completeCycles * cycleDuration

  if (remainder <= DURATION_EPSILON_SECONDS) {
    remainder = 0
  } else if (cycleDuration - remainder <= DURATION_EPSILON_SECONDS) {
    completeCycles += 1
    remainder = 0
  } else if (Math.abs(passDuration - remainder) <= DURATION_EPSILON_SECONDS) {
    remainder = passDuration
  }

  const finalPartialCycleDuration = remainder === 0 ? null : remainder
  const totalCycles = completeCycles + (finalPartialCycleDuration === null ? 0 : 1)

  if (
    !isFiniteNonNegativeInteger(completeCycles) ||
    !Number.isSafeInteger(totalCycles) ||
    !isFinitePositive(totalCycles) ||
    !isFinitePositive(target.value)
  ) {
    return { ok: false, reason: "non-finite-result" }
  }

  return {
    ok: true,
    plan: {
      sourceDuration,
      speed,
      speedMultiplier,
      passDuration,
      cycleDuration,
      target,
      outputDuration: target.value,
      totalCycles,
      completeCycles,
      finalPartialCycleDuration,
    },
  }
}
