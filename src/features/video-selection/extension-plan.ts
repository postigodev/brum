export const DURATION_TARGETS = [15, 30, 45, 60] as const
export const LOOP_TARGETS = [2, 3, 5, 10] as const

export type TargetMode = "duration" | "loops"

export type ExtensionTarget = {
  mode: TargetMode
  value: number
}

export type ExtensionPlan = {
  sourceDuration: number
  target: ExtensionTarget
  outputDuration: number
  totalPlays: number
  completePlays: number
  finalPartialDuration: number | null
}

export type ExtensionPlanResult =
  | { ok: true; plan: ExtensionPlan }
  | {
      ok: false
      reason:
        | "invalid-source-duration"
        | "unsupported-target"
        | "target-does-not-extend"
        | "non-finite-result"
    }

const DURATION_EPSILON_SECONDS = 0.001

function isFinitePositive(value: number) {
  return Number.isFinite(value) && value > 0
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
): ExtensionPlanResult {
  if (!isFinitePositive(sourceDuration)) {
    return { ok: false, reason: "invalid-source-duration" }
  }

  const supportedValues = target.mode === "duration" ? DURATION_TARGETS : LOOP_TARGETS
  if (!includesValue(supportedValues, target.value)) {
    return { ok: false, reason: "unsupported-target" }
  }

  if (target.mode === "loops") {
    const outputDuration = sourceDuration * target.value
    if (!isFinitePositive(outputDuration)) {
      return { ok: false, reason: "non-finite-result" }
    }

    return {
      ok: true,
      plan: {
        sourceDuration,
        target,
        outputDuration,
        totalPlays: target.value,
        completePlays: target.value,
        finalPartialDuration: null,
      },
    }
  }

  if (!isDurationTargetAvailable(sourceDuration, target.value)) {
    return { ok: false, reason: "target-does-not-extend" }
  }

  let completePlays = Math.floor(target.value / sourceDuration)
  let remainder = target.value - completePlays * sourceDuration

  if (remainder <= DURATION_EPSILON_SECONDS) {
    remainder = 0
  } else if (sourceDuration - remainder <= DURATION_EPSILON_SECONDS) {
    completePlays += 1
    remainder = 0
  }

  const finalPartialDuration = remainder === 0 ? null : remainder
  const totalPlays = completePlays + (finalPartialDuration === null ? 0 : 1)

  if (![completePlays, totalPlays, target.value].every(isFinitePositive)) {
    return { ok: false, reason: "non-finite-result" }
  }

  return {
    ok: true,
    plan: {
      sourceDuration,
      target,
      outputDuration: target.value,
      totalPlays,
      completePlays,
      finalPartialDuration,
    },
  }
}
