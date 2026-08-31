import type { ExtensionPlan } from "#/features/video-selection/extension-plan"

import { ProcessingError } from "./errors"

export const TIMELINE_TOLERANCE_SECONDS = 0.001
export const METADATA_DURATION_TOLERANCE_SECONDS = 0.05

export function assertPlanMatchesSource(plan: ExtensionPlan, inspectedDuration: number) {
  if (!Number.isFinite(inspectedDuration) || inspectedDuration <= 0) {
    throw new ProcessingError("invalid-duration", "The input duration is invalid.")
  }
  if (Math.abs(plan.sourceDuration - inspectedDuration) > METADATA_DURATION_TOLERANCE_SECONDS) {
    throw new ProcessingError(
      "plan-duration-mismatch",
      "The extension plan no longer matches the selected file.",
    )
  }
}
